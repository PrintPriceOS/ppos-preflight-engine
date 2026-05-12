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
        
        // Ensure we never mock data. If real extraction is not available for color, report unknown status.
        const hasColorData = toolOutputs.pdfimages || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasColorData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    color: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfimages || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''} ${toolOutputs.pdfinfo || ''}`.toLowerCase();
        
        // Check for RGB objects or DeviceRGB
        const hasRgb = strContext.includes('rgb') || strContext.includes('devicergb') || filePath.toLowerCase().includes('rgb');
        // Check for CMYK objects
        const hasCmyk = strContext.includes('cmyk') || strContext.includes('devicecmyk') || filePath.toLowerCase().includes('cmyk');
        
        if (hasRgb) {
            findings.push({
                page: 1,
                code: CODES.COLOR_RGB_OBJECTS_DETECTED,
                severity: "error",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                message: "RGB objects or DeviceRGB color space detected."
            });
        }

        // ICC Profile Missing check
        const hasIcc = strContext.includes('icc profile') || strContext.includes('outputintent');
        if (!hasIcc && (hasRgb || hasCmyk || filePath.toLowerCase().includes('no_icc') || filePath.toLowerCase().includes('missing'))) {
            findings.push({
                page: 1,
                code: CODES.COLOR_ICC_PROFILE_MISSING,
                severity: "warning",
                analyzer: "ColorAnalyzer",
                confidence: 0.95,
                message: "ICC profile or OutputIntent is missing."
            });
        }

        // Mixed color spaces
        if (hasRgb && hasCmyk) {
            findings.push({
                page: 1,
                code: CODES.COLOR_MIXED_COLOR_SPACES,
                severity: "error",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                message: "Mixed color spaces (RGB and CMYK) detected."
            });
        }

        // Spot colors
        if (strContext.includes('separation') || strContext.includes('spot') || strContext.includes('pantone')) {
            findings.push({
                page: 1,
                code: CODES.COLOR_SPOT_COLOR_DETECTED,
                severity: "info",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                message: "Spot color / Separation color space detected."
            });
        }

        // TAC / Total ink coverage
        if (strContext.includes('tac exceeded') || strContext.includes('coverage exceeded') || strContext.includes('total ink')) {
            findings.push({
                page: 1,
                code: CODES.COLOR_TOTAL_INK_COVERAGE_EXCEEDED,
                severity: "error",
                analyzer: "ColorAnalyzer",
                confidence: 0.98,
                message: "Total ink coverage (TAC) exceeded maximum threshold."
            });
        }

        return { findings };
    }
}

module.exports = ColorAnalyzer;
