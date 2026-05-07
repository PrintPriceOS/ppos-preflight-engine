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
        // Logic would involve calling internal canvas expansion (e.g. via pdf-lib or GS)
        // Simplified for this kernel baseline
        const args = [
            '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite',
            `-dDEVICEWIDTHPOINTS=${(210 + bleedMm * 2) * 2.8346}`, // A4 example
            `-dDEVICEHEIGHTPOINTS=${(297 + bleedMm * 2) * 2.8346}`,
            '-dFIXEDMEDIA', '-dPDFFitPage',
            '-o', output, input
        ];

        try {
            const result = await ghostscript.runGs(args, {
                ...opts,
                reqId: 'fix-bleed'
            });

            // v2.4.121: Validate output integrity
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
