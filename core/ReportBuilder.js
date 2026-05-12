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
        if (metadata.source === 'FALLBACK_MOCK' || isDegraded) {
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
            confidence: fallbackUsed ? 0 : (i.confidence !== undefined ? i.confidence : 0.98),
            fixRequired: i.fixRequired || false,
            safeToAutofix: allowAutofix ? (i.safeToAutofix || false) : false,
            destructiveFixRisk: i.destructiveFixRisk || "LOW"
        }));

        const mappedFindings = issues.map(i => ({
            page: i.page || null,
            code: i.code || i.id,
            id: i.id,
            severity: i.severity,
            analyzer: i.analyzer || 'PreflightEngine',
            confidence: fallbackUsed ? 0 : (i.confidence !== undefined ? i.confidence : 0.98),
            message: i.message
        }));

        const analysisIntegrity = metadata.analysisIntegrity || {
            realExtraction: !fallbackUsed,
            fallbackUsed,
            degradedMode: analysis_type === 'DEGRADED' || analysis_type === 'FAILED',
            extractionErrors: [],
            extractionPipeline: [],
            parserVersions: {}
        };

        return {
            ok: isOk,
            analysis_type,
            certifiable: isCertifiable,
            timestamp: new Date().toISOString(),
            partial: finalPartial,
            analysisIntegrity,
            forensic_events,
            summary: {
                risk_level: riskSummary.level,
                risk_score: riskSummary.score,
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
            findings: mappedFindings,
            analysis_warnings: warnings,
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local',
                strict_forensic_mode: strictMode
            },
            // Legacy/Upstream Compatibility Aliases
            analysis: { issues: mappedIssues },
            forensics: { findings: mappedFindings, events: forensic_events }
        };
    }
}

module.exports = ReportBuilder;
