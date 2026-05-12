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
                partial: true,
                status: "PARTIAL",
                metadata: {
                    fonts: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();

        const findEvidence = (keywords) => {
            for (const [tool, output] of Object.entries(toolOutputs)) {
                if (!output) continue;
                const lower = output.toLowerCase();
                for (const kw of keywords) {
                    if (lower.includes(kw)) {
                        const lines = output.split('\n');
                        const matchingLine = lines.find(l => l.toLowerCase().includes(kw)) || kw;
                        return { tool, source: 'CLI_PROBE', raw: matchingLine.trim() };
                    }
                }
            }
            return { tool: 'composite_probe', source: metadata.source || 'CLI_PROBE', raw: keywords[0] };
        };

        // Non-embedded fonts
        const notEmbedded = strContext.includes('not embedded') || strContext.includes('noembed');
        if (notEmbedded) {
            const ev = findEvidence(['not embedded', 'noembed']);
            findings.push({
                page: 1,
                code: CODES.FONT_NOT_EMBEDDED,
                severity: "error",
                category: "FONT",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "EMBED_FONTS",
                message: "Font not embedded in document.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Subset fonts
        const isSubset = strContext.includes('subset') || strContext.includes('embedded-subset');
        if (isSubset) {
            const ev = findEvidence(['subset', 'embedded-subset']);
            findings.push({
                page: 1,
                code: CODES.FONT_SUBSET,
                severity: "info",
                category: "FONT",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Embedded subset font detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Type3 fonts
        const isType3 = strContext.includes('type 3') || strContext.includes('type3');
        if (isType3) {
            const ev = findEvidence(['type 3', 'type3']);
            findings.push({
                page: 1,
                code: CODES.FONT_TYPE3_FONT_DETECTED,
                severity: "warning",
                category: "FONT",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Type3 font detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Missing glyphs
        const missingGlyph = strContext.includes('missing glyph') || strContext.includes('no glyph') || strContext.includes('glyph missing');
        if (missingGlyph) {
            const ev = findEvidence(['missing glyph', 'no glyph', 'glyph missing']);
            findings.push({
                page: 1,
                code: CODES.FONT_GLYPH_MISSING,
                severity: "error",
                category: "FONT",
                analyzer: "FontAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Missing glyph detected in rendered text.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        return { findings, status: "SUCCESS" };
    }
}

module.exports = FontAnalyzer;
