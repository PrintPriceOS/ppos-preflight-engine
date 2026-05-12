const ghostscript = require('./Ghostscript');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const fs = require('fs-extra');

/**
 * PdfFixEngine
 * 
 * Pure industrial module for executing PDF fixes.
 * Classification: INDUSTRIAL_RUNTIME (Technical Execution)
 */
class PdfFixEngine {
    /**
     * Converts a PDF to CMYK using the provided ICC profile.
     */
    async applyCmyk(input, output, iccPath, opts = {}) {
        const args = [
            '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite',
            '-sColorConversionStrategy=CMYK',
            ...(iccPath ? [`-sDefaultCMYKProfile=${iccPath}`] : []),
            '-dProcessColorModel=/DeviceCMYK',
            '-o', output, input
        ];

        try {
            const result = await ghostscript.runGs(args, {
                ...opts,
                reqId: 'fix-cmyk'
            });

            // v2.4.121: Validate output integrity even if GS reported success
            if (!(await fs.pathExists(output))) {
                return { success: false, error: 'Ghostscript finished but output file is missing' };
            }
            const stats = await fs.stat(output);
            if (stats.size === 0) {
                return { success: false, error: 'Ghostscript finished but output file is empty (0 bytes)' };
            }

            return { success: result.ok, output };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Applies a bleed canvas to the PDF.
     */
    async applyBleed(input, output, bleedMm, opts = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            // Rule: Distinguir entre BLEED_BOX_EXPANSION, TRUE_ARTWORK_BLEED_EXTENSION, UNSAFE_BLEED_FIX_NOT_APPLIED
            // If true artwork outpainting/extension is explicitly required but unavailable, abort safely
            if (opts.requireTrueArtworkExtension || opts.strictForensicBleed) {
                return {
                    success: false,
                    status: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
                    bleed_fix_mode: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
                    strategy: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
                    industrial_quality: 'UNSAFE',
                    error: 'True graphic content outpainting extension is required but only box expansion is supported.',
                    warnings: ['Artwork was not extended; only PDF boxes were adjusted.', 'Bleed fix aborted: TRUE_ARTWORK_BLEED_EXTENSION is not available.']
                };
            }

            const bytes = await fs.readFile(input);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const bleedPts = bleedMm * 2.8346;

            for (const page of pdfDoc.getPages()) {
                const mb = page.getMediaBox();
                const newWidth  = mb.width  + bleedPts * 2;
                const newHeight = mb.height + bleedPts * 2;

                const fullBox = pdfDoc.context.obj([0, 0, newWidth, newHeight]);
                page.node.set(PDFName.of('MediaBox'), fullBox);
                page.node.set(PDFName.of('BleedBox'), fullBox);
                page.node.set(PDFName.of('CropBox'),  fullBox);

                const trimBox = pdfDoc.context.obj([bleedPts, bleedPts, mb.width + bleedPts, mb.height + bleedPts]);
                page.node.set(PDFName.of('TrimBox'), trimBox);
            }

            const modified = await pdfDoc.save();
            await fs.writeFile(output, modified);

            if (!(await fs.pathExists(output))) return { success: false, error: 'Output file missing' };
            const stats = await fs.stat(output);
            if (stats.size === 0) return { success: false, error: 'Output file is empty' };

            // Determine if external true graphic extension occurred or if it's pure box expansion
            const isTrueArtwork = opts.artworkExtended === true;
            const bleedFixMode = isTrueArtwork ? 'TRUE_ARTWORK_BLEED_EXTENSION' : 'BLEED_BOX_EXPANSION';
            const strategyVal = isTrueArtwork ? 'TRUE_ARTWORK_BLEED_EXTENSION' : 'BOX_EXPANSION_ONLY';
            const qualityVal = isTrueArtwork ? 'PREMIUM' : 'LIMITED';
            const humanReview = !isTrueArtwork; // Rule: requires_human_review:true cuando solo se expanden cajas
            const warningMsg = isTrueArtwork ? null : 'Artwork was not extended; only PDF boxes were adjusted.';
            const warnings = warningMsg ? [warningMsg] : [];

            return {
                success: true,
                output,
                bleed_fix_mode: bleedFixMode,
                strategy: strategyVal,
                industrial_quality: qualityVal,
                requires_human_review: humanReview,
                warnings,
                repairs: [{
                    code: 'APPLY_BLEED',
                    status: 'APPLIED',
                    bleed_fix_mode: bleedFixMode,
                    strategy: strategyVal,
                    industrial_quality: qualityVal,
                    requires_human_review: humanReview,
                    description: `BleedBox expanded ${bleedMm}mm on all sides via page box adjustment.`
                }]
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Rebuilds TrimBox from MediaBox without scaling or rasterizing.
     */
    async rebuildTrimBox(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes);
            
            const pages = pdfDoc.getPages();
            for (const page of pages) {
                // PDF-lib's getSize() inherently returns the CropBox or MediaBox
                // We fetch the raw MediaBox coordinates to be mathematically accurate
                let mediaBox = page.node.lookup(PDFName.of('MediaBox'));
                if (!mediaBox) {
                    // Fallback if missing (very rare)
                    const { width, height } = page.getSize();
                    mediaBox = pdfDoc.context.obj([0, 0, width, height]);
                }
                
                // Assign to TrimBox
                page.node.set(PDFName.of('TrimBox'), mediaBox);
                
                // Normalize ArtBox and CropBox
                page.node.set(PDFName.of('CropBox'), mediaBox);
                page.node.set(PDFName.of('ArtBox'), mediaBox);
            }
            
            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);
            
            return {
                success: true,
                output: outputPath,
                repairs: [
                    {
                        code: 'REBUILD_TRIMBOX',
                        status: 'APPLIED',
                        description: 'TrimBox rebuilt from MediaBox without scaling content.'
                    }
                ]
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

module.exports = PdfFixEngine;
