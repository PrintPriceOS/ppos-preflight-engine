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
                status: result.ok ? 'APPLIED' : 'FAILED',
                code: 'CONVERT_CMYK',
                strategy: 'ghostscript_color_conversion',
                description: 'Colorspace converted to CMYK via Ghostscript color strategy.',
                output,
                risk_level: 'HIGH',
                requires_human_review: true,
                production_safe: false,
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
                status: 'APPLIED',
                code: 'APPLY_BLEED',
                strategy: bleedFixMode,
                description: isTrueArtwork ? `Artwork extended by ${bleedMm}mm.` : `BleedBox expanded ${bleedMm}mm on all sides (box expansion only, artwork not extended).`,
                output,
                risk_level: 'MEDIUM',
                requires_human_review: humanReview,
                production_safe: false,
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
                status: 'APPLIED',
                code: 'INJECT_OUTPUT_INTENT',
                strategy: 'pdf_lib_catalog_injection',
                description: 'OutputIntent with ICC profile injected into PDF catalog.',
                output,
                risk_level: 'LOW',
                requires_human_review: false,
                production_safe: true,
                message: 'OutputIntent with ICC profile injected into PDF catalog.',
                compliance_claim_allowed: false,
                validator_required: false,
                standard_claimed: null,
                evidence: {
                    injected_profile: iccPath,
                    reason: "OutputIntent injection alone does not prove PDF/X compliance.",
                    pdfx_compliance_claimed: false,
                    pdfa_compliance_claimed: false,
                    limitations: [
                        "OutputIntent presence alone does not prove PDF/X compliance.",
                        "No real standards validator or converter was executed."
                    ]
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
                status: 'APPLIED',
                code: 'REBUILD_TRIMBOX',
                strategy: 'pdf_lib_geometry_rebuild',
                description: 'TrimBox rebuilt from MediaBox or inferred production geometry.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                production_safe: true,
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
                status: 'APPLIED',
                code: 'STRIP_JAVASCRIPT',
                strategy: 'pdf_lib_catalog_sanitization',
                description: 'JavaScript actions were neutralized.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                production_safe: true,
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
                status: 'APPLIED',
                code: 'FLATTEN_ANNOTATIONS',
                strategy: 'pdf_lib_annotation_removal',
                description: 'Annotation references removed to reduce print-production risk.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                production_safe: true,
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
                status: 'APPLIED',
                code: 'FLATTEN_FORMS',
                strategy: 'pdf_lib_acroform_flatten',
                description: 'AcroForm fields flattened/removed to reduce print-production risk.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
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

            let stderr = '';
            try {
                const res = await execFileAsync('qpdf', [inputPath, outputPath]);
                stderr = res.stderr;
            } catch (err) {
                // qpdf exit code 3 means "warnings were issued" (usually because it successfully reconstructed the xref)
                if (err.code === 3) {
                    stderr = err.stderr;
                } else {
                    throw err;
                }
            }
            
            if (!(await fs.pathExists(outputPath))) {
                return { success: false, error: 'qpdf finished but output file is missing' };
            }

            const didRepair = stderr && stderr.trim().length > 0;
            return {
                success: true,
                status: didRepair ? 'APPLIED' : 'SKIPPED',
                code: 'REBUILD_XREF',
                strategy: 'qpdf_structural_repair',
                description: didRepair ? 'Structural sanitization applied via qpdf.' : 'No structural repair was necessary.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: false,
                production_safe: true,
                message: didRepair ? 'Structural sanitization applied via qpdf.' : 'No structural repair was necessary.',
                evidence: {
                    tool: "qpdf",
                    command: `qpdf input output`,
                    structural_sanitization_attempted: true,
                    output_created: true,
                    repair_applied: didRepair,
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
            code: fixId,
            status: "SKIPPED",
            strategy: "UNSUPPORTED_TRANSPARENCY_OVERPRINT_FIX",
            risk_level: "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: true,
            destructive: true,
            executable: false,
            evidence: {
                reason: "Transparency/overprint transformation is not implemented in this phase.",
                limitations: [
                    "May alter visual appearance",
                    "Requires visual/operator review",
                    "No real flattening execution was performed"
                ]
            }
        };
    }

    async flattenTransparency(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_TRANSPARENCY"); }
    async flattenPdf(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_PDF"); }
    async flattenOverprint(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_OVERPRINT"); }
    async normalizeOverprint(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("NORMALIZE_OVERPRINT"); }
    async removeSoftMasks(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("REMOVE_SOFT_MASKS"); }
    async rasterizeTransparency(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("RASTERIZE_TRANSPARENCY"); }
    async convertToPdfxTransparencySafe(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("CONVERT_TO_PDFX_TRANSPARENCY_SAFE"); }
    async embedFonts(inputPath, outputPath, options = {}) {
        try {
            const fs = require('fs');
            const path = require('path');
            const FontInspector = require('./FontInspector');
            
            const inputStat = fs.existsSync(inputPath) ? fs.statSync(inputPath) : null;
            if (!inputStat) {
                return { success: false, error: 'Input file not found' };
            }

            // Phase 51C: Pre-inspection
            const inspectBefore = await FontInspector.inspectFonts(inputPath);

            const gsCmdName = process.platform === 'win32' ? 'gswin64c' : 'gs';
            const args = [
                '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite',
                '-dEmbedAllFonts=true', '-dSubsetFonts=true', '-dPDFSETTINGS=/prepress',
                `-sOutputFile=${outputPath}`, inputPath
            ];
            
            // Execute Ghostscript
            let stdout = '';
            let stderr = '';
            let exitCode = 0;
            
            try {
                const out = await execFileAsync(gsCmdName, args);
                stdout = out.stdout;
                stderr = out.stderr;
            } catch (err) {
                // Ghostscript failed
                exitCode = err.code || 1;
                stdout = err.stdout || '';
                stderr = err.stderr || err.message;
                
                return {
                    success: false,
                    status: 'FAILED',
                    strategy: 'GHOSTSCRIPT_UNAVAILABLE',
                    error: err.message,
                    requires_human_review: true,
                    risk_level: 'HIGH',
                    message: "Ghostscript execution failed during font embedding.",
                    evidence: {
                        tool: "ghostscript",
                        command: `${gsCmdName} ${args.join(' ')}`,
                        exit_code: exitCode,
                        stdout,
                        stderr
                    }
                };
            }

            // Check if output was created
            if (!fs.existsSync(outputPath)) {
                return {
                    success: false,
                    status: 'FAILED',
                    error: 'Output artifact missing after Ghostscript execution',
                    requires_human_review: true,
                    risk_level: 'HIGH',
                    evidence: {
                        tool: "ghostscript",
                        command: cmd,
                        exit_code: exitCode,
                        stdout,
                        stderr
                    }
                };
            }

            const outputStat = fs.statSync(outputPath);
            if (outputStat.size === 0) {
                return {
                    success: false,
                    status: 'FAILED',
                    error: 'Ghostscript produced empty artifact',
                    requires_human_review: true,
                    risk_level: 'HIGH',
                    evidence: {
                        tool: "ghostscript",
                        command: cmd,
                        exit_code: exitCode,
                        stdout,
                        stderr
                    }
                };
            }

            // Phase 51C: Post-inspection
            const inspectAfter = await FontInspector.inspectFonts(outputPath);

            const nonEmbeddedBefore = inspectBefore.ok ? inspectBefore.non_embedded_fonts : [];
            const nonEmbeddedAfter = inspectAfter.ok ? inspectAfter.non_embedded_fonts : [];
            
            const fontsBeforeNames = inspectBefore.ok ? inspectBefore.fonts.map(f => f.normalized_font_name).sort().join(',') : '';
            const fontsAfterNames = inspectAfter.ok ? inspectAfter.fonts.map(f => f.normalized_font_name).sort().join(',') : '';
            
            const possibleFontSubstitution = inspectBefore.ok && inspectAfter.ok && fontsBeforeNames !== fontsAfterNames;

            // Phase 51B/C: Successfully executed gs
            return {
                success: true,
                code: 'EMBED_FONTS',
                status: 'APPLIED',
                strategy: 'GHOSTSCRIPT_EMBED_FONTS',
                description: 'Font embedding was attempted/processed. Fonts were processed with Ghostscript.',
                risk_level: 'HIGH',
                requires_human_review: true,
                production_safe: false,
                message: 'Font embedding was attempted/processed.',
                evidence: {
                    tool: "ghostscript",
                    command: `${gsCmdName} ${args.join(' ')}`,
                    exit_code: exitCode,
                    stdout,
                    stderr,
                    input_size_bytes: inputStat.size,
                    output_size_bytes: outputStat.size,
                    fonts_before: inspectBefore.ok ? inspectBefore.fonts : [],
                    fonts_after: inspectAfter.ok ? inspectAfter.fonts : [],
                    non_embedded_fonts_before: nonEmbeddedBefore,
                    non_embedded_fonts_after: nonEmbeddedAfter,
                    font_count_before: inspectBefore.ok ? inspectBefore.fonts.length : null,
                    font_count_after: inspectAfter.ok ? inspectAfter.fonts.length : null,
                    embedding_attempted: true,
                    embedding_changed_pdf: outputStat.size !== inputStat.size,
                    font_inspection_method: "pdf-lib-object-graph",
                    font_inspection_limitations: [
                        "Structural inspection only",
                        "Does not validate glyph coverage",
                        "Does not verify visual equivalence",
                        "Does not validate font licensing"
                    ],
                    font_names_changed: possibleFontSubstitution,
                    possible_font_substitution: possibleFontSubstitution,
                    font_substitution_risk: possibleFontSubstitution ? "HIGH" : "LOW",
                    remaining_font_risks: nonEmbeddedAfter.length > 0 ? ["Non-embedded fonts remain in the output"] : [],
                    layout_risk: "HIGH",
                    review_reason: "Font embedding may alter glyph rendering, kerning, line breaks, or layout."
                }
            };

        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    async outlineFonts(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("OUTLINE_FONTS"); }
    async replaceMissingFonts(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("REPLACE_MISSING_FONTS"); }
    async glyphRepair(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("GLYPH_REPAIR"); }
    async _scaffoldUnsupportedStandardsCertification(fixId) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED",
            strategy: "UNSUPPORTED_STANDARDS_CERTIFICATION_CAPABILITY",
            description: "No real standards validator or converter was executed.",
            risk_level: "HIGH",
            requires_human_review: true,
            production_safe: false,
            executable: false,
            validator_required: true,
            validator_available: false,
            compliance_claim_allowed: false,
            standard_claimed: null,
            evidence: {
                reason: "No real standards validator or converter was executed.",
                validator_name: null,
                validator_version: null,
                validation_passed: false,
                report_path: null,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                limitations: [
                    "No PDF/X or PDF/A compliance was claimed.",
                    "OutputIntent presence alone does not prove PDF/X compliance.",
                    "A real validator is required before standards certification."
                ]
            }
        };
    }

    async validatePdfX(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("VALIDATE_PDFX"); }
    async validatePdfa(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("VALIDATE_PDFA"); }
    async generatePdfX(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("GENERATE_PDFX"); }
    async convertToPdfx(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFX"); }
    async convertToPdfa(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFA"); }
    async stripInvalidPdfxMetadata(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("STRIP_INVALID_PDFX_METADATA"); }
    async stripInvalidPdfaMetadata(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("STRIP_INVALID_PDFA_METADATA"); }
    async normalizeStandardMetadata(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("NORMALIZE_STANDARD_METADATA"); }
    async repairPdfxOutputIntent(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("REPAIR_PDFX_OUTPUTINTENT"); }
    async markStandardUncertified(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("MARK_STANDARD_UNCERTIFIED"); }
    async revokeFalseCertification(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("REVOKE_FALSE_CERTIFICATION"); }
    async generateStandardValidationReport(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("GENERATE_STANDARD_VALIDATION_REPORT"); }
    async detectTotalInkCoverage(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("DETECT_TOTAL_INK_COVERAGE"); }
    async mapRichBlackTextToKOnly(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("MAP_RICH_BLACK_TEXT_TO_K_ONLY"); }
    async mapRegistrationColorToBlack(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("MAP_REGISTRATION_COLOR_TO_BLACK"); }
    async normalizeIccProfile(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("NORMALIZE_ICC_PROFILE"); }
    async reduceTac(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("REDUCE_TAC"); }
    async optimizeExcessiveImageResolution(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION"); }
    async visualBleedExtension(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("VISUAL_BLEED_EXTENSION"); }
    async _scaffoldUnsupportedImageQuality(fixId) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED",
            strategy: "UNSUPPORTED_IMAGE_QUALITY_FIX",
            risk_level: "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: true,
            destructive: true,
            executable: false,
            evidence: {
                reason: "Image quality operations may alter visual output.",
                finding_codes: [],
                limitations: [
                    "Image quality operations may alter visual output.",
                    "No image resampling/recompression/replacement was performed.",
                    "Human review/source assets may be required."
                ]
            }
        };
    }

    async upscaleLowResImages(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("UPSCALE_LOW_RES_IMAGES"); }
    async downsampleExcessiveResolution(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("DOWNSAMPLE_EXCESSIVE_RESOLUTION"); }
    async recompressImages(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("RECOMPRESS_IMAGES"); }
    async replaceLowResImages(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("REPLACE_LOW_RES_IMAGES"); }
    async repairJpegArtifacts(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("REPAIR_JPEG_ARTIFACTS"); }
    async normalizeImageColorspace(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("NORMALIZE_IMAGE_COLORSPACE"); }
    async removeImageAlpha(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("REMOVE_IMAGE_ALPHA"); }
    async repairDamagedImageObject(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("REPAIR_DAMAGED_IMAGE_OBJECT"); }
    async vectorizeBitmapText(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("VECTORIZE_BITMAP_TEXT"); }
    async restoreRasterizedVector(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedImageQuality("RESTORE_RASTERIZED_VECTOR"); }
}

module.exports = PdfFixEngine;

