const ghostscript = require('./Ghostscript');
const { CODES } = require('../interpretation/IndustrialFindingCodes');
const fs = require('fs-extra');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

/**
 * PdfFixEngine
 * 
 * Pure industrial module for executing PDF fixes.
 * Classification: INDUSTRIAL_RUNTIME (Technical Execution)
 */
class PdfFixEngine {
    // --- Existing Fixes Normalized ---

    async applyCmyk(input, output, iccPath, opts = {}) {
        const path = require('path');
        const requestedProfile = opts.requestedProfile || (iccPath ? path.basename(iccPath) : 'PSO_Coated_v3.icc');

        const candidates = [
            { path: process.env.PPOS_ICC_PROFILE_PATH, source: 'env.PPOS_ICC_PROFILE_PATH' },
            { path: process.env.PPOS_CMYK_PROFILE_PATH, source: 'env.PPOS_CMYK_PROFILE_PATH' },
            { path: process.env.ICC_PROFILE_PATH, source: 'env.ICC_PROFILE_PATH' }
        ];

        if (iccPath && typeof iccPath === 'string' && !iccPath.includes('/opt/printprice-os')) {
            candidates.push({ path: iccPath, source: 'requested' });
        }

        const baseName = iccPath ? path.basename(iccPath) : 'PSO_Coated_v3.icc';
        if (baseName !== 'PSO_Coated_v3.icc') {
            candidates.push({ path: `/app/icc-profiles/${baseName}`, source: 'app_volume_basename' });
            candidates.push({ path: `/app/ppos-preflight-worker/icc-profiles/${baseName}`, source: 'app_worker_volume_basename' });
        }

        candidates.push(
            { path: '/app/icc-profiles/PSO_Coated_v3.icc', source: 'app_volume' },
            { path: '/app/ppos-preflight-worker/icc-profiles/PSO_Coated_v3.icc', source: 'app_worker_volume' },
            { path: '/usr/share/color/icc/ghostscript/default_cmyk.icc', source: 'system_fallback' },
            { path: '/usr/share/color/icc/ghostscript/ps_cmyk.icc', source: 'system_fallback' }
        );

        let resolvedProfile = null;
        let resolvedSource = null;

        for (const candidate of candidates) {
            if (candidate.path && typeof candidate.path === 'string') {
                if (fs.existsSync(candidate.path)) {
                    resolvedProfile = candidate.path;
                    resolvedSource = candidate.source;
                    break;
                }
            }
        }

        console.log(`[ENGINE][ICC][RESOLVE] ${JSON.stringify({
            requestedProfile,
            resolvedProfile,
            exists: !!resolvedProfile,
            source: resolvedSource || 'none'
        })}`);

        if (resolvedProfile && (resolvedSource.includes('fallback') || (iccPath && resolvedProfile !== iccPath && !resolvedSource.startsWith('env.')))) {
            console.log(`[ENGINE][ICC][FALLBACK] Using fallback profile: ${resolvedProfile}`);
        }

        if (!resolvedProfile) {
            console.log('[ENGINE][ICC][MISSING] No valid ICC profile found among candidates.');
            return {
                success: false,
                status: 'FAILED',
                error: 'ICC_PROFILE_NOT_FOUND',
                error_code: 'ICC_PROFILE_NOT_FOUND',
                evidence: {
                    reason: 'ICC_PROFILE_NOT_FOUND'
                }
            };
        }

        const profileMode = opts.magicFixProfile || 'MAGIC_FIX_SAFE';
        if (profileMode === 'MAGIC_FIX_SAFE') {
            console.log('[ENGINE][AUTOFIX][CMYK] Blocked by MAGIC_FIX_SAFE profile');
            return {
                success: false,
                status: 'FAILED',
                error: 'CONVERT_CMYK requires explicit destructive review mode.',
                error_code: 'DESTRUCTIVE_FIX_REQUIRES_EXPLICIT_REVIEW_MODE'
            };
        }

        const args = [
            '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite',
            '-sColorConversionStrategy=CMYK',
            `-sDefaultCMYKProfile=${resolvedProfile}`,
            '-dProcessColorModel=/DeviceCMYK',
            '-dDownsampleColorImages=false',
            '-dDownsampleGrayImages=false',
            '-dDownsampleMonoImages=false',
            '-dAutoFilterColorImages=false',
            '-dAutoFilterGrayImages=false',
            '-dColorImageFilter=/FlateEncode',
            '-dGrayImageFilter=/FlateEncode',
            '-dEncodeColorImages=true',
            '-dEncodeGrayImages=true',
            '-dEncodeMonoImages=true',
            '-dJPEGQ=95',
            '-o', output, input
        ];

        try {
            const result = await ghostscript.runGs(args, { ...opts, reqId: 'fix-cmyk' });

            if (!(await fs.pathExists(output))) {
                return { success: false, error: 'Ghostscript finished but output file is missing' };
            }
            const stats = await fs.stat(output);
            if (stats.size === 0) {
                return { success: false, error: 'Ghostscript finished but output file is empty (0 bytes)' };
            }

            return {
                success: result.ok,
                output,
                risk_level: 'HIGH',
                requires_human_review: true,
                message: 'Colorspace converted to CMYK via Ghostscript color strategy.',
                evidence: {
                    ghostscript_profile: 'MAGIC_FIX_DESTRUCTIVE_REVIEW',
                    ghostscript_args_sanitized: args.filter(a => !a.includes(output) && !a.includes(input))
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async applyBleed(input, output, bleedMm, opts = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            if (opts.requireTrueArtworkExtension || opts.strictForensicBleed) {
                return {
                    success: false,
                    status: 'UNSAFE_BLEED_FIX_NOT_APPLIED',
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

            const isTrueArtwork = opts.artworkExtended === true;
            const bleedFixMode = isTrueArtwork ? 'TRUE_ARTWORK_BLEED_EXTENSION' : 'BLEED_BOX_EXPANSION';
            const humanReview = !isTrueArtwork; 

            return {
                success: true,
                output,
                risk_level: 'MEDIUM',
                requires_human_review: humanReview,
                message: isTrueArtwork ? `Artwork extended by ${bleedMm}mm.` : `BleedBox expanded ${bleedMm}mm on all sides (box expansion only, artwork not extended).`,
                evidence: {
                    bleed_fix_mode: bleedFixMode,
                    expansion_mm: bleedMm
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async injectOutputIntent(input, output, iccPath, opts = {}) {
        const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
        if (!iccPath) {
            return {
                success: false,
                status: 'SKIPPED',
                error: 'No ICC profile path provided for OutputIntent injection.'
            };
        }

        try {
            if (!(await fs.pathExists(iccPath))) {
                return { success: false, error: `ICC profile not found: ${iccPath}` };
            }

            const bytes = await fs.readFile(input);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const iccBytes = await fs.readFile(iccPath);
            const iccStream = pdfDoc.context.stream(iccBytes, { N: 4, Length: iccBytes.length });
            const iccStreamRef = pdfDoc.context.register(iccStream);

            const outputIntentDict = pdfDoc.context.obj({
                Type: PDFName.of('OutputIntent'),
                S: PDFName.of('GTS_PDFA1'),
                OutputConditionIdentifier: PDFString.of('PSO Coated v3'),
                DestOutputProfile: iccStreamRef
            });
            const outputIntentRef = pdfDoc.context.register(outputIntentDict);
            pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntentRef]));

            const modified = await pdfDoc.save();
            await fs.writeFile(output, modified);

            if (!(await fs.pathExists(output))) return { success: false, error: 'Output file missing' };
            const stats = await fs.stat(output);
            if (stats.size === 0) return { success: false, error: 'Output file is empty' };

            return {
                success: true,
                output,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'OutputIntent with ICC profile injected into PDF catalog.',
                evidence: {
                    injected_profile: iccPath
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async rebuildTrimBox(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes);
            
            const pages = pdfDoc.getPages();
            for (const page of pages) {
                let mediaBox = page.node.lookup(PDFName.of('MediaBox'));
                if (!mediaBox) {
                    const { width, height } = page.getSize();
                    mediaBox = pdfDoc.context.obj([0, 0, width, height]);
                }
                
                page.node.set(PDFName.of('TrimBox'), mediaBox);
                page.node.set(PDFName.of('CropBox'), mediaBox);
                page.node.set(PDFName.of('ArtBox'), mediaBox);
            }
            
            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);
            
            return {
                success: true,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'TrimBox rebuilt from MediaBox or inferred production geometry.',
                evidence: {
                    rebuilt_from: 'MediaBox'
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // --- New Low-Risk Fixes ---

    async stripJavascript(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes);
            
            let removedOpenAction = false;
            let removedNames = 0;

            // Remove OpenAction
            if (pdfDoc.catalog.has(PDFName.of('OpenAction'))) {
                pdfDoc.catalog.delete(PDFName.of('OpenAction'));
                removedOpenAction = true;
            }

            // Remove AA (Additional Actions) from catalog
            if (pdfDoc.catalog.has(PDFName.of('AA'))) {
                pdfDoc.catalog.delete(PDFName.of('AA'));
            }

            // Names -> JavaScript
            const namesRef = pdfDoc.catalog.lookup(PDFName.of('Names'));
            if (namesRef) {
                // PDFDict
                if (typeof namesRef.has === 'function' && namesRef.has(PDFName.of('JavaScript'))) {
                    namesRef.delete(PDFName.of('JavaScript'));
                    removedNames = 1;
                }
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            return {
                success: true,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'JavaScript actions were neutralized.',
                evidence: {
                    removed_catalog_open_action: removedOpenAction,
                    removed_javascript_names: removedNames,
                    limitations: []
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async flattenAnnotations(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes);
            
            const pages = pdfDoc.getPages();
            let pagesScanned = pages.length;
            let annotationsRemoved = 0;

            for (const page of pages) {
                if (page.node.has(PDFName.of('Annots'))) {
                    const annots = page.node.lookup(PDFName.of('Annots'));
                    if (annots && typeof annots.size === 'function') {
                        annotationsRemoved += annots.size();
                    }
                    page.node.delete(PDFName.of('Annots'));
                }
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            return {
                success: true,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'Annotation references removed to reduce print-production risk.',
                evidence: {
                    pages_scanned: pagesScanned,
                    annotations_before: annotationsRemoved, // roughly
                    annotations_after: 0,
                    action: "REMOVED_ANNOTATION_REFERENCES",
                    limitations: ["Annotation appearances were not visually flattened."]
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async flattenForms(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes);
            
            const form = pdfDoc.getForm();
            let fieldsBefore = 0;
            let flattened = false;
            let hasAcroForm = pdfDoc.catalog.has(PDFName.of('AcroForm'));

            if (hasAcroForm) {
                fieldsBefore = form.getFields().length;
                try {
                    form.flatten();
                    flattened = true;
                } catch(e) {
                    // if flatten fails, we'll try to just remove the AcroForm entry
                }
                
                pdfDoc.catalog.delete(PDFName.of('AcroForm'));
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            return {
                success: true,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'AcroForm fields flattened/removed to reduce print-production risk.',
                evidence: {
                    form_fields_before: fieldsBefore,
                    form_fields_after: 0,
                    acroform_present_before: hasAcroForm,
                    acroform_present_after: false,
                    flattened: flattened,
                    limitations: flattened ? [] : ["Form appearances may not have been fully visually flattened."]
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async rebuildXref(inputPath, outputPath, options = {}) {
        try {
            // Check if qpdf exists
            try {
                await execFileAsync('qpdf', ['--version']);
            } catch (err) {
                 return {
                     success: false,
                     status: 'TOOL_NOT_AVAILABLE',
                     error: 'qpdf is not available.',
                     evidence: {
                         tool: 'qpdf',
                         structural_sanitization_attempted: false
                     }
                 };
            }

            const { stderr } = await execFileAsync('qpdf', [inputPath, outputPath]);
            
            if (!(await fs.pathExists(outputPath))) {
                return { success: false, error: 'qpdf finished but output file is missing' };
            }

            return {
                success: true,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                message: 'Structural sanitization attempted via qpdf.',
                evidence: {
                    tool: "qpdf",
                    command: `qpdf input output`,
                    structural_sanitization_attempted: true,
                    output_created: true,
                    warnings: stderr ? [stderr] : []
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // --- Medium/High-Risk Scaffolding ---

    _scaffoldUnsupported(fixId, message) {
        return {
            success: false,
            status: "UNSUPPORTED_IN_THIS_PHASE",
            error: "Not implemented",
            requires_human_review: true,
            risk_level: "HIGH",
            message: "This fix is not implemented yet and remains diagnostic/recommended only.",
            evidence: {
                implemented: false,
                fixId
            }
        };
    }

    async flattenTransparency(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_TRANSPARENCY"); }
    async flattenOverprint(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_OVERPRINT"); }
    async embedFonts(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("EMBED_FONTS"); }
    async validatePdfX(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("VALIDATE_PDFX"); }
    async generatePdfX(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("GENERATE_PDFX"); }
    async detectTotalInkCoverage(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("DETECT_TOTAL_INK_COVERAGE"); }
    async mapRichBlackTextToKOnly(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("MAP_RICH_BLACK_TEXT_TO_K_ONLY"); }
    async mapRegistrationColorToBlack(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("MAP_REGISTRATION_COLOR_TO_BLACK"); }
    async optimizeExcessiveImageResolution(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION"); }
    async visualBleedExtension(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("VISUAL_BLEED_EXTENSION"); }
}

module.exports = PdfFixEngine;

