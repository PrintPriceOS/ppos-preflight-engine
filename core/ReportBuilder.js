/**
 * ReportBuilder
 * 
 * Standardizes the output structure of the preflight engine.
 */
class ReportBuilder {
    build({ issues, riskSummary, metadata, filePath, partial = false, warnings = [] }) {
        let analysis_type = 'REAL_INDUSTRIAL';
        const hasExtractionErrors = metadata.analysisIntegrity?.extractionErrors?.length > 0;
        const isDegraded = partial || hasExtractionErrors || warnings.some(w => w.error?.includes('DEGRADED') || w.error?.includes('FAILED'));
        if (metadata.environmentFailure) {
            analysis_type = 'ENGINE_ENVIRONMENT_FAILURE';
        } else if (metadata.source === 'FALLBACK_MOCK' || isDegraded) {
            analysis_type = (metadata.pages === 0 && !metadata.geometry?.pages?.length) ? 'FAILED' : 'DEGRADED';
        } else if (partial) {
            analysis_type = 'PARTIAL';
        }

        const strictMode = process.env.STRICT_FORENSIC_MODE === 'true';
        const fallbackUsed = analysis_type !== 'REAL_INDUSTRIAL' || metadata.analysisIntegrity?.realExtraction === false;
        const finalPartial = partial || hasExtractionErrors || fallbackUsed;

        // Rule #16: Never return ok: true if there was no real extraction or fallback/mock data was used
        const isOk = fallbackUsed ? false : (riskSummary.level !== 'CRITICAL');
        
        // In strict forensic mode, any fallback invalidates the entire analysis certification
        const isCertifiable = strictMode && fallbackUsed ? false : riskSummary.level !== 'CRITICAL';
        const allowAutofix = !(strictMode && fallbackUsed);

        const forensic_events = [];
        if (fallbackUsed) {
            forensic_events.push('FORENSIC_DEGRADED_ANALYSIS');
        }

        const mappedIssues = issues.map(i => ({
            id: i.id,
            code: i.code || i.id,
            analyzer: i.analyzer || 'PreflightEngine',
            severity: i.severity,
            message: i.message,
            page: i.page || null,
            fixable: allowAutofix ? !!(i.fixable || i.fix_method || i.repairStrategy) : false,
            fix_method: allowAutofix ? (i.fix_method || null) : null,
            repairStrategy: allowAutofix ? (i.repairStrategy || i.fix_method || null) : null,
            category: i.category || null,
            confidence: i.confidence !== undefined ? i.confidence : (i.evidence?.confidence !== undefined ? i.evidence.confidence : 0.98),
            fixRequired: i.fixRequired || false,
            safeToAutofix: allowAutofix ? (i.safeToAutofix || false) : false,
            destructiveFixRisk: i.destructiveFixRisk || "LOW",
            evidence: i.evidence || { source: "PDF Kernel Extraction", descriptor: "Dictionary metrics and structural verification pass" }
        }));

        const baseIntegrity = metadata.analysisIntegrity || {};
        const analysisIntegrity = {
            ...baseIntegrity,
            realExtraction: !fallbackUsed && (baseIntegrity.realExtraction !== false),
            fallbackUsed: fallbackUsed || !!baseIntegrity.fallbackUsed,
            degradedMode: analysis_type === 'DEGRADED' || analysis_type === 'FAILED' || analysis_type === 'ENGINE_ENVIRONMENT_FAILURE' || !!baseIntegrity.degradedMode,
            extractionErrors: baseIntegrity.extractionErrors || [],
            missingTools: baseIntegrity.missingTools || [],
            extractionPipeline: baseIntegrity.extractionPipeline || [],
            parserVersions: baseIntegrity.parserVersions || {}
        };

        let analysis_status = 'COMPLETE';
        if (analysis_type === 'ENGINE_ENVIRONMENT_FAILURE') analysis_status = 'ENGINE_ENVIRONMENT_FAILURE';
        else if (analysis_type === 'FAILED') analysis_status = 'FAILED';
        else if (analysis_type === 'DEGRADED') analysis_status = 'DEGRADED';
        else if (analysis_type === 'PARTIAL') analysis_status = 'PARTIAL';

        const missing_tools = analysisIntegrity.missingTools || [];
        const degraded_reasons = [];
        if (metadata.source === 'FALLBACK_MOCK') {
            degraded_reasons.push('FALLBACK_MOCK_USED');
        }
        if (hasExtractionErrors) {
            analysisIntegrity.extractionErrors?.forEach(err => {
                degraded_reasons.push(`TOOL_EXTRACTION_FAILED:${err.parser}`);
            });
        }
        warnings.forEach(w => {
            if (typeof w === 'string') degraded_reasons.push(w);
            else if (w.error) degraded_reasons.push(w.error);
            else if (w.message) degraded_reasons.push(w.message);
        });
        if (missing_tools.length > 0) {
            missing_tools.forEach(t => degraded_reasons.push(`MISSING_TOOL:${t}`));
        }
        const uniqueDegradedReasons = [...new Set(degraded_reasons)];

        return {
            ok: isOk,
            analysis_type,
            analysis_status,
            analysis_scope: metadata.environmentFailure ? 'PARTIAL_ANALYSIS' : 'FULL_ANALYSIS',
            certifiable: isCertifiable,
            timestamp: new Date().toISOString(),
            partial: finalPartial,
            analysisIntegrity,
            forensic_events,
            degraded_reasons: uniqueDegradedReasons,
            missing_tools,
            summary: {
                risk_level: riskSummary.level,
                risk_score: riskSummary.score,
                scoreBasis: riskSummary.scoreBasis || 'DOCUMENT_FINDINGS',
                issue_count: issues.length,
                critical_count: riskSummary.criticals,
                analysis_warnings: warnings.length
            },
            document: {
                name: metadata.filename || filePath.split('/').pop(),
                size: metadata.size || 0,
                page_count: metadata.pages || metadata.pageCount || 0,
                pdf_version: metadata.pdfVersion || 'unknown'
            },
            issues: mappedIssues,
            findings: mappedIssues,
            analysis_warnings: warnings,
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local',
                strict_forensic_mode: strictMode
            },
            // Legacy/Upstream Compatibility Aliases
            analysis: { issues: mappedIssues },
            forensics: { findings: mappedIssues, events: forensic_events }
        };
    }
}

module.exports = ReportBuilder;
