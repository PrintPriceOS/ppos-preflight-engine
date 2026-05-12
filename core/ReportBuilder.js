/**
 * ReportBuilder
 * 
 * Standardizes the output structure of the preflight engine.
 */
class ReportBuilder {
    build({ issues, riskSummary, metadata, filePath, partial = false, warnings = [] }) {
        let analysis_type = 'REAL_INDUSTRIAL';
        const isDegraded = partial || warnings.some(w => w.error?.includes('DEGRADED') || w.error?.includes('FAILED'));
        if (metadata.source === 'FALLBACK_MOCK' || isDegraded) {
            analysis_type = (metadata.pages === 0 && !metadata.geometry?.pages?.length) ? 'FAILED' : 'DEGRADED';
        } else if (partial) {
            analysis_type = 'PARTIAL';
        }

        const strictMode = process.env.STRICT_FORENSIC_MODE === 'true';
        const fallbackUsed = analysis_type !== 'REAL_INDUSTRIAL';

        // In strict forensic mode, any fallback invalidates the entire analysis
        const isCertifiable = strictMode && fallbackUsed ? false : riskSummary.level !== 'CRITICAL';
        const allowAutofix = !(strictMode && fallbackUsed);

        const forensic_events = [];
        if (fallbackUsed) {
            forensic_events.push('FORENSIC_DEGRADED_ANALYSIS');
        }

        return {
            ok: strictMode && fallbackUsed ? false : riskSummary.level !== 'CRITICAL',
            analysis_type,
            certifiable: isCertifiable,
            timestamp: new Date().toISOString(),
            partial,
            analysisIntegrity: metadata.analysisIntegrity || {
                realExtraction: !fallbackUsed,
                fallbackUsed,
                degradedMode: analysis_type === 'DEGRADED',
                extractionErrors: []
            },
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
            issues: issues.map(i => ({
                id: i.id,
                severity: i.severity,
                message: i.message,
                page: i.page || null,
                fixable: allowAutofix ? !!(i.fixable || i.fix_method || i.repairStrategy) : false,
                fix_method: allowAutofix ? (i.fix_method || null) : null,
                repairStrategy: allowAutofix ? (i.repairStrategy || i.fix_method || null) : null,
                category: i.category || null,
                confidence: fallbackUsed ? 0 : i.confidence,
                fixRequired: i.fixRequired,
                safeToAutofix: allowAutofix ? i.safeToAutofix : false,
                destructiveFixRisk: i.destructiveFixRisk
            })),
            analysis_warnings: warnings,
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local',
                strict_forensic_mode: strictMode
            },
            // Legacy/Upstream Compatibility Aliases
            analysis: { issues },
            forensics: { findings: issues, events: forensic_events }
        };
    }
}

module.exports = ReportBuilder;
