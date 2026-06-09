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

        // Phase 62F-A: emit probe warning findings for pdfimages WARNING_ONLY but do not block image analysis.
        const pdfimagesSemantic = metadata.analysisIntegrity?.probeSemantics?.tools?.pdfimages;
        if (pdfimagesSemantic && (pdfimagesSemantic.semantic_status === 'WARNING_ONLY' || pdfimagesSemantic.semantic_status === 'SUCCESS_WITH_WARNINGS')) {
            const warningClasses = pdfimagesSemantic.warning_classes || [];
            if (warningClasses.includes('PDF_FONT_WEIGHT_WARNING')) {
                findings.push({
                    page: 1,
                    code: CODES.PDF_FONT_WEIGHT_WARNING,
                    severity: 'warning',
                    category: 'IMAGE',
                    analyzer: 'ImageAnalyzer',
                    confidence: 0.95,
                    fixable: false,
                    recommended_fix: null,
                    message: 'pdfimages: Syntax Warning — Invalid Font Weight (non-fatal; image extraction continued).',
                    evidence: { tool: 'pdfimages', source: 'CLI_PROBE', page: 1, confidence: 0.95, raw: pdfimagesSemantic.evidence?.stderr_excerpt || 'PDF_FONT_WEIGHT_WARNING' }
                });
            } else if (warningClasses.length > 0) {
                findings.push({
                    page: 1,
                    code: CODES.PDF_IMAGE_LIST_WARNING,
                    severity: 'warning',
                    category: 'IMAGE',
                    analyzer: 'ImageAnalyzer',
                    confidence: 0.9,
                    fixable: false,
                    recommended_fix: null,
                    message: `pdfimages: probe warning during image extraction (${warningClasses.join(', ')}). Image analysis continued.`,
                    evidence: { tool: 'pdfimages', source: 'CLI_PROBE', page: 1, confidence: 0.9, raw: warningClasses.join(', ') }
                });
            }
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

        // RGB Images
        const hasRgbImage = strContext.includes('rgb image') || strContext.includes('devicergb image') || strContext.includes('color: rgb');
        if (hasRgbImage) {
            const ev = findEvidence(['rgb image', 'devicergb image', 'color: rgb']);
            findings.push({
                page: 1,
                code: CODES.IMG_RGB_IMAGE_DETECTED,
                severity: "error",
                category: "IMAGE",
                analyzer: "ImageAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "CONVERT_TO_CMYK",
                message: "Raster image uses RGB color space.",
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
