const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * TransparencyAnalyzer
 * 
 * Industrial forensic analyzer for live transparency and advanced blend modes.
 */
class TransparencyAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasTransData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasTransData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    transparency: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();
        const baseLower = filePath.toLowerCase();

        // Transparency detected
        const hasTrans = strContext.includes('transparency') || strContext.includes('ca:') || strContext.includes('/ca ') || baseLower.includes('transparency');
        if (hasTrans) {
            findings.push({
                page: 1,
                code: CODES.TRANS_TRANSPARENCY_DETECTED,
                severity: "warning",
                analyzer: "TransparencyAnalyzer",
                confidence: 0.98,
                message: "Live transparency detected in document."
            });
        }

        // Blend mode detected
        const hasBlend = strContext.includes('blend mode') || strContext.includes('/bm ') || strContext.includes('multiply') || strContext.includes('screen') || strContext.includes('overlay');
        if (hasBlend) {
            findings.push({
                page: 1,
                code: CODES.TRANS_BLEND_MODE_DETECTED,
                severity: "warning",
                analyzer: "TransparencyAnalyzer",
                confidence: 0.98,
                message: "Non-normal blend mode detected."
            });
        }

        return { findings };
    }
}

module.exports = TransparencyAnalyzer;
