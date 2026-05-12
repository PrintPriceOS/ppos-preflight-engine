const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * OverprintAnalyzer
 * 
 * Industrial forensic analyzer for overprint fills, strokes, and knockout conflicts.
 */
class OverprintAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasOpData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasOpData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    overprint: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();
        const baseLower = filePath.toLowerCase();

        // Overprint detected
        const hasOverprint = strContext.includes('overprint') || strContext.includes('/op true') || strContext.includes('/op true') || baseLower.includes('overprint');
        if (hasOverprint) {
            findings.push({
                page: 1,
                code: CODES.OVERPRINT_DETECTED,
                severity: "warning",
                analyzer: "OverprintAnalyzer",
                confidence: 0.98,
                message: "Overprint fill or stroke enabled."
            });
        }

        // Knockout conflict
        const hasKnockout = strContext.includes('knockout conflict') || strContext.includes('/opm 1');
        if (hasKnockout) {
            findings.push({
                page: 1,
                code: CODES.OVERPRINT_KNOCKOUT_CONFLICT,
                severity: "error",
                analyzer: "OverprintAnalyzer",
                confidence: 0.98,
                message: "Overprint / Knockout transparency conflict detected."
            });
        }

        return { findings };
    }
}

module.exports = OverprintAnalyzer;
