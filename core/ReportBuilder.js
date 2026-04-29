/**
 * ReportBuilder
 * 
 * Standardizes the output structure of the preflight engine.
 */
class ReportBuilder {
    build({ issues, riskSummary, metadata, filePath, partial = false, warnings = [] }) {
        return {
            ok: riskSummary.level !== 'CRITICAL',
            timestamp: new Date().toISOString(),
            partial,
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
                page_count: metadata.pageCount || 0,
                pdf_version: metadata.pdfVersion || 'unknown'
            },
            issues: issues.map(i => ({
                id: i.id,
                severity: i.severity,
                message: i.message,
                page: i.page || null,
                fixable: !!(i.fixable || i.fix_method || i.repairStrategy),
                fix_method: i.fix_method || null,
                repairStrategy: i.repairStrategy || i.fix_method || null,
                category: i.category || null
            })),
            analysis_warnings: warnings,
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local'
            },
            // Legacy/Upstream Compatibility Aliases
            analysis: { issues },
            forensics: { findings: issues }
        };
    }
}

module.exports = ReportBuilder;
