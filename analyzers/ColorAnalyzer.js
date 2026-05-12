const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * ColorAnalyzer
 * 
 * Industrial forensic analyzer for PDF color spaces, ICC profiles, and ink coverage.
 */
class ColorAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];
        
        // Ensure we never mock data. If real extraction is not available for color, report partial status.
        const hasColorData = toolOutputs.pdfimages || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasColorData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    color: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfimages || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''} ${toolOutputs.pdfinfo || ''}`.toLowerCase();
        
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

        // Check for RGB objects or DeviceRGB (Eliminated filename heuristics)
        const hasRgb = strContext.includes('rgb') || strContext.includes('devicergb');
        // Check for CMYK objects (Eliminated filename heuristics)
        const hasCmyk = strContext.includes('cmyk') || strContext.includes('devicecmyk');
        
        if (hasRgb) {
            const ev = findEvidence(['rgb', 'devicergb']);
            findings.push({
                page: 1,
                code: CODES.COLOR_RGB_OBJECTS_DETECTED,
                severity: "error",
                category: "COLOR",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "CONVERT_CMYK",
                message: "RGB objects or DeviceRGB color space detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // ICC Profile Missing check
        const hasIcc = strContext.includes('icc profile') || strContext.includes('outputintent');
        if (!hasIcc && (hasRgb || hasCmyk)) {
            const ev = findEvidence(['rgb', 'devicergb', 'cmyk', 'devicecmyk']);
            findings.push({
                page: 1,
                code: CODES.COLOR_ICC_PROFILE_MISSING,
                severity: "warning",
                category: "COLOR",
                analyzer: "ColorAnalyzer",
                confidence: 0.95,
                fixable: true,
                recommended_fix: "CONVERT_CMYK",
                message: "ICC profile or OutputIntent is missing.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.95,
                    raw: ev.raw
                }
            });
        }

        // Mixed color spaces
        if (hasRgb && hasCmyk) {
            const ev = findEvidence(['rgb', 'devicergb', 'cmyk', 'devicecmyk']);
            findings.push({
                page: 1,
                code: CODES.COLOR_MIXED_COLOR_SPACES,
                severity: "error",
                category: "COLOR",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "CONVERT_CMYK",
                message: "Mixed color spaces (RGB and CMYK) detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Spot colors
        if (strContext.includes('separation') || strContext.includes('spot') || strContext.includes('pantone')) {
            const ev = findEvidence(['separation', 'spot', 'pantone']);
            findings.push({
                page: 1,
                code: CODES.COLOR_SPOT_COLOR_DETECTED,
                severity: "info",
                category: "COLOR",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Spot color / Separation color space detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // TAC / Total ink coverage
        if (strContext.includes('tac exceeded') || strContext.includes('coverage exceeded') || strContext.includes('total ink')) {
            const ev = findEvidence(['tac exceeded', 'coverage exceeded', 'total ink']);
            findings.push({
                page: 1,
                code: CODES.COLOR_TOTAL_INK_COVERAGE_EXCEEDED,
                severity: "error",
                category: "COLOR",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Total ink coverage (TAC) exceeded maximum threshold.",
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

module.exports = ColorAnalyzer;
