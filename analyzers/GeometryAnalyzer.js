const GeometryAuditEngine = require('../engine/GeometryAuditEngine');
const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * GeometryAnalyzer
 * 
 * Standardized pipeline analyzer for PDF geometry, trimbox, bleed, and page dimensions.
 */
class GeometryAnalyzer {
    constructor(config = {}) {
        this.auditEngine = new GeometryAuditEngine(config);
    }

    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        
        // 1. Check if extraction was possible
        const hasGeomData = metadata.source !== 'FALLBACK_MOCK' && metadata.geometry;
        if (!hasGeomData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    geometryStatus: "PARTIAL",
                    reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                }
            };
        }

        // 2. Delegate to engine
        const rawResult = await this.auditEngine.analyze(filePath, options);
        const rawFindings = rawResult.findings || [];

        // 3. Map to explicit contract fields
        const mappedFindings = rawFindings.map(f => {
            const code = f.code || f.id;
            const isFixable = [
                CODES.GEOM_TRIMBOX_MISSING,
                CODES.GEOM_TRIMBOX_INVALID,
                CODES.GEOM_TRIMBOX_OUTSIDE_MEDIABOX,
                CODES.GEOM_BLEED_MISSING,
                CODES.GEOM_BLEED_INSUFFICIENT,
                CODES.GEOM_BLEEDBOX_MISSING,
                'TRIMBOX_MISSING',
                'BLEED_MISSING',
                'BLEED_INSUFFICIENT'
            ].includes(code);

            let recommendedFix = null;
            if ([CODES.GEOM_TRIMBOX_MISSING, CODES.GEOM_TRIMBOX_INVALID, CODES.GEOM_TRIMBOX_OUTSIDE_MEDIABOX, 'TRIMBOX_MISSING'].includes(code)) {
                recommendedFix = "REBUILD_TRIMBOX";
            } else if ([CODES.GEOM_BLEED_MISSING, CODES.GEOM_BLEED_INSUFFICIENT, CODES.GEOM_BLEEDBOX_MISSING, 'BLEED_MISSING', 'BLEED_INSUFFICIENT'].includes(code)) {
                recommendedFix = "APPLY_BLEED";
            }

            const isWarning = f.severity === 'warning' || code?.endsWith('_WARNING');
            const severity = f.severity || (isWarning ? 'warning' : 'error');

            return {
                ...f,
                code,
                severity,
                category: "GEOMETRY",
                analyzer: "GeometryAnalyzer",
                page: f.page !== undefined ? f.page : null,
                confidence: f.confidence !== undefined ? f.confidence : 0.98,
                fixable: isFixable,
                recommended_fix: recommendedFix,
                evidence: f.evidence || {
                    tool: 'pdf-lib / mutool / pdfinfo',
                    source: metadata.source || 'CLI_PROBE',
                    page: f.page || 1,
                    confidence: 0.98,
                    raw: f.context ? JSON.stringify(f.context) : 'Geometry bounding boxes analysis'
                }
            };
        });

        return {
            findings: mappedFindings,
            metadata: rawResult.metadata,
            status: "SUCCESS"
        };
    }
}

module.exports = GeometryAnalyzer;
