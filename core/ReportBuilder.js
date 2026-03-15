/**
 * ReportBuilder
 * 
 * Standardizes the output structure of the preflight engine.
 */
class ReportBuilder {
    build({ issues, riskSummary, metadata, filePath }) {
        return {
            ok: riskSummary.level !== 'CRITICAL',
            timestamp: new Date().toISOString(),
            summary: {
                risk_level: riskSummary.level,
                risk_score: riskSummary.score,
                issue_count: issues.length,
                critical_count: riskSummary.criticals
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
                fixable: !!i.fix_method
            })),
            engines: {
                preflight_engine: 'v1.9.0-deterministic',
                signature: process.env.GIT_COMMIT?.slice(0, 7) || 'local'
            }
        };
    }
}

module.exports = ReportBuilder;
