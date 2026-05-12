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
                partial: true,
                status: "PARTIAL",
                metadata: {
                    images: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfimages || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();

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

        // Low DPI (Eliminated filename heuristics)
        const isLowDpi = strContext.includes('low dpi') || strContext.includes('low resolution') || strContext.includes('ppi <');
        if (isLowDpi) {
            const ev = findEvidence(['low dpi', 'low resolution', 'ppi <']);
            findings.push({
                page: 1,
                code: CODES.IMG_IMAGE_LOW_RESOLUTION,
                severity: "error",
                category: "IMAGE",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Image resolution is below minimum threshold (Low DPI).",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Excessive Resolution
        const isHighDpi = strContext.includes('excessive resolution') || strContext.includes('ppi >');
        if (isHighDpi) {
            const ev = findEvidence(['excessive resolution', 'ppi >']);
            findings.push({
                page: 1,
                code: CODES.IMG_IMAGE_EXCESSIVE_RESOLUTION,
                severity: "warning",
                category: "IMAGE",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Image resolution is excessively high.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // JPEG Artifacts
        const hasArtifacts = strContext.includes('jpeg artifacts') || strContext.includes('dctdecode artifacts');
        if (hasArtifacts) {
            const ev = findEvidence(['jpeg artifacts', 'dctdecode artifacts']);
            findings.push({
                page: 1,
                code: CODES.IMG_JPEG_ARTIFACTS_DETECTED,
                severity: "warning",
                category: "IMAGE",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "JPEG artifacts detected in raster images.",
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

module.exports = ImageAnalyzer;
