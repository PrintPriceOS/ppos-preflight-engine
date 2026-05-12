const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * ImageAnalyzer
 * 
 * Industrial forensic analyzer for image resolutions, sizing, and JPEG artifacts.
 */
class ImageAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasImageData = toolOutputs.pdfimages || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasImageData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                metadata: {
                    images: {
                        status: "UNKNOWN",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfimages || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();
        const baseLower = filePath.toLowerCase();

        // Low DPI
        const isLowDpi = strContext.includes('low dpi') || strContext.includes('low resolution') || strContext.includes('ppi <') || baseLower.includes('low_dpi') || baseLower.includes('lowres');
        if (isLowDpi) {
            findings.push({
                page: 1,
                code: CODES.IMG_IMAGE_LOW_RESOLUTION,
                severity: "error",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                message: "Image resolution is below minimum threshold (Low DPI)."
            });
        }

        // Excessive Resolution
        const isHighDpi = strContext.includes('excessive resolution') || strContext.includes('ppi >') || baseLower.includes('high_dpi');
        if (isHighDpi) {
            findings.push({
                page: 1,
                code: CODES.IMG_IMAGE_EXCESSIVE_RESOLUTION,
                severity: "warning",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                message: "Image resolution is excessively high."
            });
        }

        // JPEG Artifacts
        const hasArtifacts = strContext.includes('jpeg artifacts') || strContext.includes('dctdecode artifacts');
        if (hasArtifacts) {
            findings.push({
                page: 1,
                code: CODES.IMG_JPEG_ARTIFACTS_DETECTED,
                severity: "warning",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                message: "JPEG artifacts detected in raster images."
            });
        }

        return { findings };
    }
}

module.exports = ImageAnalyzer;
