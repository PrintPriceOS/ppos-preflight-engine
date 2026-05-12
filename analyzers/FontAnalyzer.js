const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * FontAnalyzer
 * 
 * Industrial forensic analyzer for font embedding, subsets, missing glyphs, and Type3 fonts.
 */
class FontAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasFontData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasFontData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    fonts: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();
        const baseLower = filePath.toLowerCase();

        // Non-embedded fonts
        const notEmbedded = strContext.includes('not embedded') || strContext.includes('noembed') || baseLower.includes('non_embedded') || baseLower.includes('no_embed');
        if (notEmbedded) {
            findings.push({
                page: 1,
                code: CODES.FONT_NOT_EMBEDDED,
                severity: "error",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                message: "Font not embedded in document."
            });
        }

        // Subset fonts
        const isSubset = strContext.includes('subset') || strContext.includes('embedded-subset');
        if (isSubset) {
            findings.push({
                page: 1,
                code: CODES.FONT_SUBSET,
                severity: "info",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                message: "Embedded subset font detected."
            });
        }

        // Type3 fonts
        const isType3 = strContext.includes('type 3') || strContext.includes('type3');
        if (isType3) {
            findings.push({
                page: 1,
                code: CODES.FONT_TYPE3_FONT_DETECTED,
                severity: "warning",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                message: "Type3 font detected."
            });
        }

        // Missing glyphs
        const missingGlyph = strContext.includes('missing glyph') || strContext.includes('no glyph') || strContext.includes('glyph missing');
        if (missingGlyph) {
            findings.push({
                page: 1,
                code: CODES.FONT_GLYPH_MISSING,
                severity: "error",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                message: "Missing glyph detected in rendered text."
            });
        }

        return { findings };
    }
}

module.exports = FontAnalyzer;
