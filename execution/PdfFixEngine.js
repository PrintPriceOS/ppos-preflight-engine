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

    async _verifyOutputPdf(outputPath) {
        if (!(await fs.pathExists(outputPath))) return { valid: false, reason: 'Output file missing' };
        const stats = await fs.stat(outputPath);
        if (stats.size === 0) return { valid: false, reason: 'Output file is empty' };
        const fd = await fs.open(outputPath, 'r');
        const buffer = Buffer.alloc(4);
        await fs.read(fd, buffer, 0, 4, 0);
        await fs.close(fd);
        if (buffer.toString('utf8', 0, 4) !== '%PDF') return { valid: false, reason: 'Output file does not start with %PDF' };
        return { valid: true };
    }

    async stripJavascript(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            let removedOpenAction = false;
            let removedAA = false;
            let javascriptRemovedCount = 0;

            // Remove catalog OpenAction if it carries a JavaScript action
            if (pdfDoc.catalog.has(PDFName.of('OpenAction'))) {
                pdfDoc.catalog.delete(PDFName.of('OpenAction'));
                removedOpenAction = true;
                javascriptRemovedCount++;
            }

            // Remove AA (Additional Actions) from catalog (commonly used for JS triggers)
            if (pdfDoc.catalog.has(PDFName.of('AA'))) {
                pdfDoc.catalog.delete(PDFName.of('AA'));
                removedAA = true;
                javascriptRemovedCount++;
            }

            // Names -> JavaScript name tree
            const namesRef = pdfDoc.catalog.lookup(PDFName.of('Names'));
            if (namesRef && typeof namesRef.has === 'function' && namesRef.has(PDFName.of('JavaScript'))) {
                const jsTree = namesRef.lookup(PDFName.of('JavaScript'));
                if (jsTree && typeof jsTree.lookup === 'function') {
                    const namesArray = jsTree.lookup(PDFName.of('Names'));
                    if (namesArray && typeof namesArray.size === 'function') {
                        javascriptRemovedCount += Math.floor(namesArray.size() / 2);
                    } else {
                        javascriptRemovedCount++;
                    }
                } else {
                    javascriptRemovedCount++;
                }
                namesRef.delete(PDFName.of('JavaScript'));
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'STRIP_JAVASCRIPT', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'STRIP_JAVASCRIPT',
                strategy: 'pdf_lib_catalog_sanitization',
                description: 'JavaScript actions were neutralized.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                security_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'JavaScript actions were neutralized.',
                evidence: {
                    objects_scanned: pdfDoc.context.enumerateIndirectObjects().length,
                    removed_catalog_open_action: removedOpenAction,
                    removed_catalog_additional_actions: removedAA,
                    javascript_removed_count: javascriptRemovedCount,
                    actions_removed_count: javascriptRemovedCount,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: ["Embedded JavaScript inside content streams or third-party annotations may not be fully enumerable."]
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'STRIP_JAVASCRIPT', error: e.message, evidence: { error: e.message } };
        }
    }

    async _stripActionsByType(inputPath, outputPath, opts) {
        const { code, actionSubtype, scope, description, message } = opts;
        const { PDFDocument, PDFName, PDFDict, PDFArray } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            let removedCount = 0;
            let objectsScanned = 0;
            const targetType = PDFName.of(actionSubtype);

            const isMatchingAction = (actionDict) => {
                if (!actionDict || typeof actionDict.lookup !== 'function') return false;
                const subtype = actionDict.lookup(PDFName.of('S'));
                return subtype === targetType;
            };

            const stripFromActionContainer = (container, key) => {
                if (!container || typeof container.has !== 'function' || !container.has(PDFName.of(key))) return;
                const action = container.lookup(PDFName.of(key));
                objectsScanned++;
                if (isMatchingAction(action)) {
                    container.delete(PDFName.of(key));
                    removedCount++;
                }
            };

            const stripFromAA = (aaDict) => {
                if (!aaDict || typeof aaDict.entries !== 'function') return;
                for (const [keyName] of aaDict.entries()) {
                    const key = keyName.decodeText ? keyName.decodeText() : String(keyName);
                    stripFromActionContainer(aaDict, key);
                }
            };

            if (scope === 'catalog' || scope === 'document') {
                objectsScanned++;
                stripFromActionContainer(pdfDoc.catalog, 'OpenAction');
                const aa = pdfDoc.catalog.lookup(PDFName.of('AA'));
                if (aa instanceof PDFDict) stripFromAA(aa);
            }

            if (scope === 'pages') {
                const pages = pdfDoc.getPages();
                for (const page of pages) {
                    objectsScanned++;
                    const aa = page.node.lookup(PDFName.of('AA'));
                    if (aa instanceof PDFDict) stripFromAA(aa);
                }
            }

            if (scope === 'annotations') {
                const pages = pdfDoc.getPages();
                for (const page of pages) {
                    const annots = page.node.lookup(PDFName.of('Annots'));
                    if (annots instanceof PDFArray) {
                        for (let i = 0; i < annots.size(); i++) {
                            const annot = annots.lookup(i);
                            if (!(annot instanceof PDFDict)) continue;
                            objectsScanned++;
                            stripFromActionContainer(annot, 'A');
                            const aa = annot.lookup(PDFName.of('AA'));
                            if (aa instanceof PDFDict) stripFromAA(aa);
                        }
                    }
                }
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code, error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code,
                strategy: 'pdf_lib_action_dictionary_sanitization',
                description,
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                security_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message,
                evidence: {
                    objects_scanned: objectsScanned,
                    actions_removed_count: removedCount,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: ["Action enumeration is limited to standard catalog/page/annotation action dictionaries."]
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code, error: e.message, evidence: { error: e.message } };
        }
    }

    async removeLaunchActions(inputPath, outputPath, options = {}) {
        const result = await this._stripActionsByType(inputPath, outputPath, {
            code: 'REMOVE_LAUNCH_ACTIONS',
            actionSubtype: 'Launch',
            scope: 'annotations',
            description: 'Launch actions were removed from the document.',
            message: 'Removed /Launch actions from catalog, pages, and annotations.'
        });
        if (!result.success) return result;

        // Also sweep catalog and page-level launch actions
        const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(outputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            let extra = 0;

            const stripIfLaunch = (container, key) => {
                if (!container || typeof container.has !== 'function' || !container.has(PDFName.of(key))) return;
                const action = container.lookup(PDFName.of(key));
                if (action && typeof action.lookup === 'function' && action.lookup(PDFName.of('S')) === PDFName.of('Launch')) {
                    container.delete(PDFName.of(key));
                    extra++;
                }
            };

            stripIfLaunch(pdfDoc.catalog, 'OpenAction');
            const catAA = pdfDoc.catalog.lookup(PDFName.of('AA'));
            if (catAA instanceof PDFDict) {
                for (const [keyName] of catAA.entries()) {
                    stripIfLaunch(catAA, keyName.decodeText ? keyName.decodeText() : String(keyName));
                }
            }
            for (const page of pdfDoc.getPages()) {
                const aa = page.node.lookup(PDFName.of('AA'));
                if (aa instanceof PDFDict) {
                    for (const [keyName] of aa.entries()) {
                        stripIfLaunch(aa, keyName.decodeText ? keyName.decodeText() : String(keyName));
                    }
                }
            }

            if (extra > 0) {
                const modifiedBytes = await pdfDoc.save();
                await fs.writeFile(outputPath, modifiedBytes);
            }

            result.evidence.actions_removed_count += extra;
            result.evidence.launch_actions_removed_count = result.evidence.actions_removed_count;
            return result;
        } catch (e) {
            result.evidence.launch_actions_removed_count = result.evidence.actions_removed_count;
            result.evidence.warnings.push(`Secondary catalog/page launch action sweep failed: ${e.message}`);
            return result;
        }
    }

    async removeDocumentOpenActions(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            let removedOpenAction = false;
            let removedAA = false;
            let objectsScanned = 1;

            if (pdfDoc.catalog.has(PDFName.of('OpenAction'))) {
                pdfDoc.catalog.delete(PDFName.of('OpenAction'));
                removedOpenAction = true;
            }
            if (pdfDoc.catalog.has(PDFName.of('AA'))) {
                pdfDoc.catalog.delete(PDFName.of('AA'));
                removedAA = true;
            }

            const documentActionsRemoved = (removedOpenAction ? 1 : 0) + (removedAA ? 1 : 0);

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'REMOVE_DOCUMENT_OPEN_ACTIONS', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'REMOVE_DOCUMENT_OPEN_ACTIONS',
                strategy: 'pdf_lib_catalog_action_removal',
                description: 'Document-open actions were removed.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                security_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'Removed catalog /OpenAction and document-level /AA entries.',
                evidence: {
                    objects_scanned: objectsScanned,
                    removed_open_action: removedOpenAction,
                    removed_additional_actions: removedAA,
                    document_actions_removed_count: documentActionsRemoved,
                    actions_removed_count: documentActionsRemoved,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: []
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'REMOVE_DOCUMENT_OPEN_ACTIONS', error: e.message, evidence: { error: e.message } };
        }
    }

    async removePageOpenActions(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const pages = pdfDoc.getPages();
            let pageActionsRemoved = 0;

            for (const page of pages) {
                if (page.node.has(PDFName.of('AA'))) {
                    const aa = page.node.lookup(PDFName.of('AA'));
                    if (aa instanceof PDFDict) {
                        pageActionsRemoved += aa.entries().length;
                    } else {
                        pageActionsRemoved++;
                    }
                    page.node.delete(PDFName.of('AA'));
                }
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'REMOVE_PAGE_OPEN_ACTIONS', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'REMOVE_PAGE_OPEN_ACTIONS',
                strategy: 'pdf_lib_page_action_removal',
                description: 'Page-open actions were removed.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                security_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'Removed page-level /AA (additional actions) entries.',
                evidence: {
                    objects_scanned: pages.length,
                    pages_scanned: pages.length,
                    page_actions_removed_count: pageActionsRemoved,
                    actions_removed_count: pageActionsRemoved,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: []
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'REMOVE_PAGE_OPEN_ACTIONS', error: e.message, evidence: { error: e.message } };
        }
    }

    async removeEmbeddedFiles(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName, PDFDict, PDFArray } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            let embeddedFilesRemovedCount = 0;
            let objectsScanned = 0;
            let removedNameTree = false;

            const namesRef = pdfDoc.catalog.lookup(PDFName.of('Names'));
            if (namesRef instanceof PDFDict) {
                objectsScanned++;
                if (namesRef.has(PDFName.of('EmbeddedFiles'))) {
                    const efTree = namesRef.lookup(PDFName.of('EmbeddedFiles'));
                    if (efTree instanceof PDFDict && efTree.has(PDFName.of('Names'))) {
                        const namesArray = efTree.lookup(PDFName.of('Names'));
                        if (namesArray instanceof PDFArray) {
                            embeddedFilesRemovedCount += Math.floor(namesArray.size() / 2);
                        }
                    }
                    if (embeddedFilesRemovedCount === 0) embeddedFilesRemovedCount = 1;
                    namesRef.delete(PDFName.of('EmbeddedFiles'));
                    removedNameTree = true;
                }
            }

            // Remove file attachment annotations referencing embedded file specifications
            let annotationsRemoved = 0;
            for (const page of pdfDoc.getPages()) {
                const annots = page.node.lookup(PDFName.of('Annots'));
                if (annots instanceof PDFArray) {
                    const kept = [];
                    for (let i = 0; i < annots.size(); i++) {
                        const annot = annots.lookup(i);
                        objectsScanned++;
                        if (annot instanceof PDFDict && annot.lookup(PDFName.of('Subtype')) === PDFName.of('FileAttachment')) {
                            annotationsRemoved++;
                            continue;
                        }
                        kept.push(annots.get(i));
                    }
                    if (annotationsRemoved > 0) {
                        const newArray = PDFArray.withContext(pdfDoc.context);
                        kept.forEach(ref => newArray.push(ref));
                        page.node.set(PDFName.of('Annots'), newArray);
                    }
                }
            }

            embeddedFilesRemovedCount += annotationsRemoved;

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'REMOVE_EMBEDDED_FILES', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'REMOVE_EMBEDDED_FILES',
                strategy: 'pdf_lib_embedded_file_removal',
                description: 'Embedded files were removed from the document.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                destructive: true,
                security_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'Removed Names/EmbeddedFiles entries and associated file attachment annotations.',
                evidence: {
                    objects_scanned: objectsScanned,
                    removed_embedded_files_name_tree: removedNameTree,
                    file_attachment_annotations_removed: annotationsRemoved,
                    embedded_files_removed_count: embeddedFilesRemovedCount,
                    objects_removed_count: embeddedFilesRemovedCount,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: ["Embedded file specifications referenced only from custom/private dictionaries may not be enumerable."]
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'REMOVE_EMBEDDED_FILES', error: e.message, evidence: { error: e.message } };
        }
    }

    async _scanAnnotationAppearance(pdfDoc) {
        const { PDFName, PDFDict, PDFArray } = require('pdf-lib');
        let annotationsDetected = 0;
        let annotationsWithVisualAppearance = 0;
        const unsupportedSubtypes = new Set();

        for (const page of pdfDoc.getPages()) {
            const annots = page.node.lookup(PDFName.of('Annots'));
            if (!(annots instanceof PDFArray)) continue;
            for (let i = 0; i < annots.size(); i++) {
                const annot = annots.lookup(i);
                if (!(annot instanceof PDFDict)) continue;
                annotationsDetected++;
                const subtypeName = annot.lookup(PDFName.of('Subtype'));
                const subtype = subtypeName && subtypeName.decodeText ? subtypeName.decodeText() : (subtypeName ? String(subtypeName) : 'Unknown');
                const ap = annot.lookup(PDFName.of('AP'));
                const hasVisualAppearance = ap instanceof PDFDict && ap.has(PDFName.of('N')) &&
                    subtype !== 'Link' && subtype !== 'Popup';
                if (hasVisualAppearance) {
                    annotationsWithVisualAppearance++;
                    unsupportedSubtypes.add(subtype);
                }
            }
        }

        return { annotationsDetected, annotationsWithVisualAppearance, unsupportedSubtypes: Array.from(unsupportedSubtypes) };
    }

    async flattenAnnotations(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const pages = pdfDoc.getPages();
            const scan = await this._scanAnnotationAppearance(pdfDoc);

            // pdf-lib cannot physically render annotation appearance streams onto page
            // content, so visually-meaningful annotations cannot be safely flattened
            // without risking a silent appearance change. Be honest and skip.
            if (scan.annotationsWithVisualAppearance > 0 && !options.forceUnsafeFlatten) {
                return {
                    success: false,
                    status: 'SKIPPED_UNSUPPORTED',
                    code: 'FLATTEN_ANNOTATIONS',
                    error: 'APPEARANCE_PRESERVATION_NOT_VERIFIABLE',
                    evidence: {
                        pages_scanned: pages.length,
                        annotations_detected_count: scan.annotationsDetected,
                        annotations_flattened_count: 0,
                        unsupported_objects: scan.unsupportedSubtypes,
                        output_pdf_valid: false,
                        reason: 'Visually significant annotation appearances cannot be physically drawn into page content with the available toolchain.',
                        warnings: ['Flattening would remove visual annotations without a verified appearance-preserving render.'],
                        limitations: ['pdf-lib cannot rasterize/draw annotation appearance streams onto page content streams.']
                    }
                };
            }

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

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'FLATTEN_ANNOTATIONS', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'FLATTEN_ANNOTATIONS',
                strategy: 'pdf_lib_annotation_removal_no_visual_appearance',
                description: 'Annotation references without visual appearance were flattened/removed.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: true,
                production_safe: false,
                destructive: true,
                security_sensitive: true,
                visually_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'Annotation references were flattened because no visually significant appearance was detected.',
                evidence: {
                    pages_scanned: pages.length,
                    annotations_detected_count: scan.annotationsDetected,
                    annotations_flattened_count: annotationsRemoved,
                    unsupported_objects: scan.unsupportedSubtypes,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: ["Annotation references were removed; no appearance stream was physically rendered because none was visually significant."]
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'FLATTEN_ANNOTATIONS', error: e.message, evidence: { error: e.message } };
        }
    }

    async flattenForms(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const hasAcroForm = pdfDoc.catalog.has(PDFName.of('AcroForm'));
            let hasXfa = false;
            let fieldsBefore = 0;

            if (hasAcroForm) {
                const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
                if (acroForm instanceof PDFDict && acroForm.has(PDFName.of('XFA'))) {
                    hasXfa = true;
                }
            }

            if (!hasAcroForm) {
                return {
                    success: true,
                    status: 'NO_CHANGE',
                    code: 'FLATTEN_FORMS',
                    description: 'No AcroForm present; no action needed.',
                    output: null,
                    output_path: null,
                    requires_human_review: false,
                    evidence: {
                        forms_detected_count: 0,
                        forms_flattened_count: 0,
                        output_pdf_valid: false,
                        warnings: [],
                        limitations: []
                    }
                };
            }

            if (hasXfa && !options.forceUnsafeFlatten) {
                return {
                    success: false,
                    status: 'SKIPPED_UNSUPPORTED',
                    code: 'FLATTEN_FORMS',
                    error: 'XFA_FLATTENING_NOT_SAFE',
                    evidence: {
                        forms_detected_count: 1,
                        forms_flattened_count: 0,
                        output_pdf_valid: false,
                        reason: 'XFA forms cannot be safely flattened without a verified rendering pipeline; appearance preservation cannot be proven.',
                        warnings: ['XFA flattening was skipped to avoid silent appearance loss.'],
                        limitations: ['pdf-lib does not support XFA form rendering/flattening.']
                    }
                };
            }

            const form = pdfDoc.getForm();
            fieldsBefore = form.getFields().length;
            let flattened = false;
            let flattenError = null;
            try {
                form.flatten();
                flattened = true;
            } catch (e) {
                flattenError = e.message;
            }

            if (!flattened) {
                return {
                    success: false,
                    status: 'SKIPPED_UNSUPPORTED',
                    code: 'FLATTEN_FORMS',
                    error: 'FORM_FLATTEN_NOT_VERIFIABLE',
                    evidence: {
                        forms_detected_count: 1,
                        form_fields_detected: fieldsBefore,
                        forms_flattened_count: 0,
                        output_pdf_valid: false,
                        reason: 'Form field appearances could not be physically flattened by the toolchain.',
                        warnings: [flattenError || 'pdf-lib form.flatten() failed.'],
                        limitations: ['Form was not modified to avoid claiming a flatten that did not occur.']
                    }
                };
            }

            pdfDoc.catalog.delete(PDFName.of('AcroForm'));

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            const verification = await this._verifyOutputPdf(outputPath);
            if (!verification.valid) {
                return { success: false, status: 'FAILED', code: 'FLATTEN_FORMS', error: verification.reason };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'FLATTEN_FORMS',
                strategy: 'pdf_lib_acroform_flatten',
                description: 'AcroForm fields were physically flattened into page content.',
                output: outputPath,
                risk_level: 'MEDIUM',
                requires_human_review: true,
                production_safe: false,
                destructive: true,
                security_sensitive: true,
                visually_sensitive: true,
                compliance_claim_allowed: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                message: 'AcroForm fields were flattened into the page content and the AcroForm dictionary was removed.',
                evidence: {
                    forms_detected_count: 1,
                    form_fields_before: fieldsBefore,
                    form_fields_after: 0,
                    forms_flattened_count: 1,
                    acroform_present_before: true,
                    acroform_present_after: false,
                    flattened: true,
                    output_pdf_valid: true,
                    warnings: [],
                    limitations: ["Visual fidelity depends on pdf-lib's appearance-stream rendering for each field type."]
                }
            };
        } catch (e) {
            return { success: false, status: 'FAILED', code: 'FLATTEN_FORMS', error: e.message, evidence: { error: e.message } };
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

    async normalizeObjectStreams(inputPath, outputPath, options = {}) {
        try {
            try {
                await execFileAsync('qpdf', ['--version']);
            } catch (err) {
                 return {
                     success: false,
                     status: 'SKIPPED',
                     code: 'NORMALIZE_OBJECT_STREAMS',
                     error: 'qpdf is not available.',
                     evidence: {
                         tool: 'qpdf',
                         tool_missing: true,
                         reason: 'METADATA_REWRITE_NOT_AVAILABLE'
                     }
                 };
            }

            let stderr = '';
            let exitCode = 0;
            try {
                const res = await execFileAsync('qpdf', ['--object-streams=generate', inputPath, outputPath]);
                stderr = res.stderr;
            } catch (err) {
                exitCode = err.code || 1;
                stderr = err.stderr || err.message;
                if (exitCode !== 3 && exitCode !== 0) {
                    return {
                        success: false,
                        status: 'FAILED',
                        code: 'NORMALIZE_OBJECT_STREAMS',
                        error: 'qpdf failed',
                        evidence: {
                            tool: 'qpdf',
                            command: 'qpdf --object-streams=generate input output',
                            exit_code: exitCode,
                            warnings: [stderr]
                        }
                    };
                }
            }
            
            if (!(await fs.pathExists(outputPath))) {
                return { success: false, error: 'Output file missing' };
            }
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                return { success: false, error: 'Output file is empty' };
            }

            const fd = await fs.open(outputPath, 'r');
            const buffer = Buffer.alloc(4);
            await fs.read(fd, buffer, 0, 4, 0);
            await fs.close(fd);
            if (buffer.toString('utf8', 0, 4) !== '%PDF') {
                return { success: false, error: 'Output file does not start with %PDF' };
            }
            
            const inputStats = await fs.stat(inputPath);

            const hasCriticalWarnings = stderr && stderr.toLowerCase().includes('error');

            return {
                success: true,
                status: 'APPLIED',
                code: 'NORMALIZE_OBJECT_STREAMS',
                strategy: 'qpdf_object_streams',
                description: 'Object streams normalized via qpdf.',
                output: outputPath,
                risk_level: 'LOW',
                requires_human_review: hasCriticalWarnings,
                production_safe: !hasCriticalWarnings,
                message: 'Object streams normalized.',
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                validation_performed: false,
                validation_passed: false,
                evidence: {
                    tool: "qpdf",
                    command: `qpdf --object-streams=generate input output`,
                    exit_code: exitCode,
                    input_size_bytes: inputStats.size,
                    output_size_bytes: stats.size,
                    warnings: stderr ? [stderr] : [],
                    object_streams_normalized: true
                }
            };
        } catch (e) {
            return {
                 success: false,
                 status: 'FAILED',
                 code: 'NORMALIZE_OBJECT_STREAMS',
                 error: e.message,
                 evidence: { tool: 'qpdf', error: e.message }
            };
        }
    }

    // --- Phase 67A: Transparency / Overprint Physical Fixes ---

    _scaffoldTransparencyOverprintPhysicalFix(fixId, message, evidenceOverrides = {}) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED_UNSUPPORTED",
            strategy: "UNSUPPORTED_TRANSPARENCY_OVERPRINT_PHYSICAL_FIX",
            risk_level: evidenceOverrides.risk_level || "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: true,
            destructive: true,
            executable: false,
            visual_change_expected: true,
            review_required: true,
            production_certified: false,
            compliance_claim_allowed: false,
            evidence: Object.assign({
                reason: message || "Transparency/overprint physical fixes are highly visual/destructive and cannot be safely automated without a rendering pipeline and before/after visual evidence.",
                transparency_detected: false,
                overprint_detected: false,
                blend_modes_detected: false,
                flattening_applied: false,
                rendering_safety_proven: false,
                before_render_hash: null,
                after_render_hash: null,
                visual_change_expected: true,
                review_required: true,
                production_certified: false,
                limitations: evidenceOverrides.limitations || [
                    "Transparency/overprint flattening requires a rendering pipeline to prove visual safety before and after.",
                    "No physical transparency or overprint change was performed.",
                    "Human visual review is always required regardless of policy mode."
                ],
                warnings: []
            }, evidenceOverrides.evidence || {})
        };
    }

    async flattenTransparency(inputPath, outputPath, options = {}) {
        return this._scaffoldTransparencyOverprintPhysicalFix(
            "FLATTEN_TRANSPARENCY",
            "Transparency flattening merges transparent objects into the page and may silently alter rendering. Ghostscript flattening cannot be proven safe without a before/after render comparison.",
            {
                evidence: {
                    transparency_detected: null,
                    flattening_applied: false,
                    rendering_safety_proven: false,
                    skip_code: "SKIPPED_RENDERING_SAFETY_UNPROVEN"
                }
            }
        );
    }

    async normalizeBlendModes(inputPath, outputPath, options = {}) {
        return this._scaffoldTransparencyOverprintPhysicalFix(
            "NORMALIZE_BLEND_MODES",
            "Normalizing blend modes changes how objects composite on the page. Without a rendering pipeline to compare before/after appearance, safety cannot be proven.",
            {
                evidence: {
                    blend_modes_detected: null,
                    flattening_applied: false,
                    rendering_safety_proven: false,
                    skip_code: "SKIPPED_RENDERING_SAFETY_UNPROVEN"
                }
            }
        );
    }

    async flattenPdf(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("FLATTEN_PDF"); }

    async flattenOverprint(inputPath, outputPath, options = {}) {
        return this._scaffoldTransparencyOverprintPhysicalFix(
            "FLATTEN_OVERPRINT",
            "Overprint flattening bakes overprint settings into final color values. This is a critical visual change; without a before/after rendered comparison the output cannot be validated.",
            {
                risk_level: "CRITICAL",
                evidence: {
                    overprint_detected: null,
                    flattening_applied: false,
                    rendering_safety_proven: false,
                    skip_code: "SKIPPED_RENDERING_SAFETY_UNPROVEN"
                }
            }
        );
    }

    async simulateOverprintPreview(inputPath, outputPath, options = {}) {
        return this._scaffoldTransparencyOverprintPhysicalFix(
            "SIMULATE_OVERPRINT_PREVIEW",
            "Overprint simulation changes how ink colors interact when printed. Ghostscript can apply SimulateOverprint but the visual result requires human verification; safety cannot be proven automatically.",
            {
                evidence: {
                    overprint_detected: null,
                    flattening_applied: false,
                    rendering_safety_proven: false,
                    skip_code: "SKIPPED_RENDERING_SAFETY_UNPROVEN"
                }
            }
        );
    }

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

    // --- Phase 66A Engine Font Fixes (font_governance) ---

    async _inspectFontSource(inputPath) {
        try {
            const FontInspector = require('./FontInspector');
            const inspection = await FontInspector.inspectFonts(inputPath);
            const nonEmbedded = inspection.ok ? inspection.non_embedded_fonts : [];
            return {
                ok: inspection.ok,
                fonts: inspection.ok ? inspection.fonts : [],
                non_embedded_fonts: nonEmbedded,
                font_source_available: inspection.ok && nonEmbedded.length === 0
            };
        } catch (e) {
            return { ok: false, fonts: [], non_embedded_fonts: [], font_source_available: false, error: e.message };
        }
    }

    _scaffoldFontGovernanceFix(fixId, message, evidenceOverrides = {}) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED_UNSUPPORTED",
            strategy: "UNSUPPORTED_FONT_GOVERNANCE_FIX",
            risk_level: evidenceOverrides.risk_level || "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: evidenceOverrides.visually_sensitive !== undefined ? evidenceOverrides.visually_sensitive : true,
            destructive: evidenceOverrides.destructive !== undefined ? evidenceOverrides.destructive : true,
            executable: false,
            visual_change_expected: evidenceOverrides.visual_change_expected !== undefined ? evidenceOverrides.visual_change_expected : true,
            review_required: true,
            production_certified: false,
            compliance_claim_allowed: false,
            evidence: Object.assign({
                reason: message || "Font fixes require strong evidence (font source availability, safe encoding mapping) and cannot be safely automated without human review.",
                font_source_available: false,
                fonts_subset_count: 0,
                type3_fonts_outlined_count: 0,
                encodings_repaired_count: 0,
                glyphs_synthesized_count: 0,
                glyph_synthesis_performed: false,
                visual_change_expected: evidenceOverrides.visual_change_expected !== undefined ? evidenceOverrides.visual_change_expected : true,
                review_required: true,
                production_certified: false,
                limitations: evidenceOverrides.limitations || [
                    "Font fixes require strong evidence of an available font source or a verifiably safe Ghostscript embedding path.",
                    "No font, glyph, or encoding mapping is ever invented or guessed.",
                    "Human review and source font assets / customer approval are required."
                ],
                warnings: []
            }, evidenceOverrides.evidence || {})
        };
    }

    async subsetEmbeddedFonts(inputPath, outputPath, options = {}) {
        const inspection = await this._inspectFontSource(inputPath);
        if (!inspection.font_source_available) {
            return this._scaffoldFontGovernanceFix(
                "SUBSET_EMBEDDED_FONTS",
                "Font subsetting requires already-embedded fonts as the source; no safely embeddable font source was found in this document.",
                {
                    evidence: {
                        font_source_available: false,
                        fonts_detected: inspection.fonts.length,
                        non_embedded_fonts: inspection.non_embedded_fonts,
                        skip_code: "SKIPPED_UNAVAILABLE_FONT_SOURCE"
                    }
                }
            );
        }
        return this._scaffoldFontGovernanceFix(
            "SUBSET_EMBEDDED_FONTS",
            "Subsetting embedded fonts can drop glyphs required for later edits or reflow; requires before/after glyph-coverage evidence and human visual review not currently automatable.",
            {
                evidence: {
                    font_source_available: true,
                    fonts_detected: inspection.fonts.length,
                    non_embedded_fonts: inspection.non_embedded_fonts
                }
            }
        );
    }

    async outlineType3Fonts(inputPath, outputPath, options = {}) {
        return this._scaffoldFontGovernanceFix(
            "OUTLINE_TYPE3_FONTS",
            "Converting Type 3 (bitmap/procedure-based) fonts to vector outlines changes glyph rendering; requires visual before/after evidence and human review not currently automatable.",
            { destructive: true, visually_sensitive: true }
        );
    }

    async repairFontEncoding(inputPath, outputPath, options = {}) {
        const inspection = await this._inspectFontSource(inputPath);
        return this._scaffoldFontGovernanceFix(
            "REPAIR_FONT_ENCODING",
            "Repairing a font's encoding/CMap requires a verified correct character-to-glyph mapping; an incorrect repair would silently corrupt rendered text. No mapping is guessed.",
            {
                evidence: {
                    font_source_available: inspection.font_source_available,
                    fonts_detected: inspection.fonts.length,
                    non_embedded_fonts: inspection.non_embedded_fonts,
                    skip_code: inspection.font_source_available ? undefined : "SKIPPED_UNAVAILABLE_FONT_SOURCE"
                }
            }
        );
    }

    async flagMissingGlyphsUnfixable(inputPath, outputPath, options = {}) {
        return this._scaffoldFontGovernanceFix(
            "FLAG_MISSING_GLYPHS_UNFIXABLE",
            "Missing glyphs are flagged for review only. Synthesizing or substituting glyphs would invent visual content not present in the source and is never performed; source font assets or customer approval are required.",
            {
                risk_level: "LOW",
                destructive: false,
                visually_sensitive: false,
                visual_change_expected: false,
                limitations: [
                    "Missing glyphs cannot be safely repaired automatically.",
                    "Glyph synthesis/substitution is never performed because it would invent content not present in the source.",
                    "Source font assets or customer approval are required to resolve."
                ],
                evidence: {
                    font_source_available: false,
                    glyph_synthesis_performed: false
                }
            }
        );
    }
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

    async _applyMetadataFix(inputPath, outputPath, fixId, actionName, actionDesc, modifyPdfDoc) {
        const { PDFDocument } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            
            let skipped = false;
            let skipReason = null;
            let fixtureGap = false;

            try {
                modifyPdfDoc(pdfDoc);
            } catch (err) {
                skipped = true;
                skipReason = 'METADATA_REWRITE_NOT_AVAILABLE';
                fixtureGap = true;
            }

            if (skipped) {
                 return {
                     success: false,
                     status: 'SKIPPED',
                     code: fixId,
                     error: skipReason,
                     evidence: {
                         reason: skipReason,
                         fixture_gap: fixtureGap,
                         tooling_gap: true
                     }
                 };
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);
            
            if (!(await fs.pathExists(outputPath))) {
                return { success: false, error: 'Output file missing' };
            }
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                return { success: false, error: 'Output file is empty' };
            }
            const fd = await fs.open(outputPath, 'r');
            const buffer = Buffer.alloc(4);
            await fs.read(fd, buffer, 0, 4, 0);
            await fs.close(fd);
            if (buffer.toString('utf8', 0, 4) !== '%PDF') {
                return { success: false, error: 'Output file does not start with %PDF' };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: fixId,
                strategy: 'pdf_lib_metadata_rewrite',
                description: actionDesc,
                output: outputPath,
                risk_level: 'MEDIUM',
                requires_human_review: true,
                production_safe: false,
                message: actionDesc,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                validation_performed: false,
                validation_passed: false,
                evidence: {
                    action: actionName,
                    limitations: [
                        "Metadata rewriting does not imply standards validation.",
                        "No standards compliance is claimed."
                    ],
                    metadata_before: {},
                    metadata_after: {}
                }
            };
        } catch (e) {
            return {
                success: false,
                status: 'SKIPPED',
                code: fixId,
                error: 'METADATA_REWRITE_NOT_AVAILABLE',
                evidence: {
                    reason: 'METADATA_REWRITE_NOT_AVAILABLE',
                    fixture_gap: true,
                    tooling_gap: true,
                    error_message: e.message
                }
            };
        }
    }

    // --- Phase 68A: Real PDF/X / PDF/A Validator Integration ---

    async validatePdfX(inputPath, outputPath, options = {}) {
        // veraPDF validates PDF/A, not PDF/X. A dedicated PDF/X validator is required.
        // We detect veraPDF presence and report it honestly, but skip PDF/X validation
        // because no authoritative PDF/X validator is integrated.
        const veraPdf = require('./VeraPdfValidator');
        const available = await veraPdf.isAvailable();
        const version = await veraPdf.getVersion();

        const base = {
            success: false,
            code: 'VALIDATE_PDFX',
            requires_human_review: true,
            production_safe: false,
            validation_performed: false,
            validation_passed: false,
            validator_name: 'verapdf',
            validator_version: version,
            standard_detected: null,
            validation_report_hash: null,
            compliance_claim_allowed: false,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false
        };

        if (!available) {
            return {
                ...base,
                status: 'SKIPPED_UNSUPPORTED',
                strategy: 'validator_unavailable',
                evidence: {
                    reason: 'VALIDATOR_NOT_FOUND',
                    validator_available: false,
                    message: 'No PDF/X or PDF/A validator found. Install veraPDF to enable standards validation.',
                    review_required: true,
                    limitations: ['PDF/X validation requires a real validator binary (e.g., callas pdfToolbox).']
                }
            };
        }

        // veraPDF is available but targets PDF/A, not PDF/X.
        return {
            ...base,
            status: 'SKIPPED_UNSUPPORTED',
            strategy: 'pdfx_validator_not_integrated',
            evidence: {
                reason: 'PDFX_VALIDATOR_NOT_INTEGRATED',
                validator_available: true,
                validator_name: 'verapdf',
                validator_version: version,
                message: 'veraPDF is available but validates PDF/A conformance only. A dedicated PDF/X validator (e.g., callas pdfToolbox) is required for authoritative PDF/X validation. Integration is deferred pending tool selection.',
                review_required: true,
                limitations: [
                    'veraPDF validates PDF/A standards, not PDF/X.',
                    'PDF/X validation requires a PDF/X-aware validator tool.'
                ]
            }
        };
    }

    async validatePdfa(inputPath, outputPath, options = {}) {
        const veraPdf = require('./VeraPdfValidator');
        const available = await veraPdf.isAvailable();

        const base = {
            code: 'VALIDATE_PDFA',
            requires_human_review: true,
            production_safe: false,
            standard_certified: false,
            pdfx_compliance_claimed: false
        };

        if (!available) {
            const version = await veraPdf.getVersion();
            return {
                ...base,
                success: false,
                status: 'SKIPPED_UNSUPPORTED',
                strategy: 'validator_unavailable',
                validation_performed: false,
                validation_passed: false,
                validator_name: 'verapdf',
                validator_version: version,
                standard_detected: null,
                validation_report_hash: null,
                compliance_claim_allowed: false,
                pdfa_compliance_claimed: false,
                evidence: {
                    reason: 'VALIDATOR_NOT_FOUND',
                    validator_available: false,
                    message: 'veraPDF is not installed or not on PATH. Install veraPDF to enable real PDF/A validation.',
                    review_required: true,
                    limitations: ['PDF/A validation requires veraPDF or equivalent.']
                }
            };
        }

        const result = await veraPdf.validate(inputPath, options.flavour || 'auto');

        if (!result.validation_performed) {
            return {
                ...base,
                success: false,
                status: 'FAILED',
                strategy: 'verapdf_execution_error',
                validation_performed: false,
                validation_passed: false,
                validator_name: result.validator_name,
                validator_version: result.validator_version,
                standard_detected: null,
                validation_report_hash: null,
                compliance_claim_allowed: false,
                pdfa_compliance_claimed: false,
                evidence: {
                    reason: result.error || 'VALIDATION_EXECUTION_ERROR',
                    validator_available: true,
                    validator_name: result.validator_name,
                    validator_version: result.validator_version,
                    error_message: result.error_message,
                    review_required: true
                }
            };
        }

        const complianceClaimAllowed = result.compliance_claim_allowed === true;

        return {
            ...base,
            success: result.validation_passed,
            status: result.validation_passed ? 'APPLIED' : 'FAILED',
            strategy: 'verapdf_validation',
            validation_performed: true,
            validation_passed: result.validation_passed,
            validator_name: result.validator_name,
            validator_version: result.validator_version,
            standard_detected: result.standard_detected,
            validation_report_hash: result.validation_report_hash,
            compliance_claim_allowed: complianceClaimAllowed,
            pdfa_compliance_claimed: complianceClaimAllowed,
            evidence: {
                validator_available: true,
                validator_name: result.validator_name,
                validator_version: result.validator_version,
                validation_performed: true,
                validation_passed: result.validation_passed,
                standard_detected: result.standard_detected,
                profile_name: result.profile_name,
                passed_rules: result.passed_rules,
                failed_rules: result.failed_rules,
                validation_report_hash: result.validation_report_hash,
                compliance_claim_allowed: complianceClaimAllowed,
                review_required: true,
                errors: result.errors || [],
                limitations: ['Validator evidence must be reviewed by a human before any compliance claim is made.']
            }
        };
    }

    async generatePdfX(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("GENERATE_PDFX"); }
    async convertToPdfx(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFX"); }
    async convertToPdfa(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFA"); }
    async convertToPdfxValidated(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFX_VALIDATED"); }
    async convertToPdfaValidated(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("CONVERT_TO_PDFA_VALIDATED"); }
    
    async stripInvalidPdfxMetadata(inputPath, outputPath, options = {}) {
        return this._applyMetadataFix(inputPath, outputPath, 'STRIP_INVALID_PDFX_METADATA', 'STRIPPED_PDFX_METADATA', 'Invalid PDF/X metadata was stripped.', (pdfDoc) => {
            const { PDFName } = require('pdf-lib');
            if (pdfDoc.catalog.has(PDFName.of('OutputIntents'))) {
                pdfDoc.catalog.delete(PDFName.of('OutputIntents'));
            }
        });
    }

    async stripInvalidPdfaMetadata(inputPath, outputPath, options = {}) {
        return this._applyMetadataFix(inputPath, outputPath, 'STRIP_INVALID_PDFA_METADATA', 'STRIPPED_PDFA_METADATA', 'Invalid PDF/A metadata was stripped.', (pdfDoc) => {
            const { PDFName } = require('pdf-lib');
            if (pdfDoc.catalog.has(PDFName.of('OutputIntents'))) {
                pdfDoc.catalog.delete(PDFName.of('OutputIntents'));
            }
        });
    }

    async normalizeStandardMetadata(inputPath, outputPath, options = {}) {
        return this._applyMetadataFix(inputPath, outputPath, 'NORMALIZE_STANDARD_METADATA', 'NORMALIZED_METADATA', 'Standard metadata normalized to non-certified state.', (pdfDoc) => {
            const { PDFName } = require('pdf-lib');
            if (pdfDoc.catalog.has(PDFName.of('OutputIntents'))) {
                pdfDoc.catalog.delete(PDFName.of('OutputIntents'));
            }
        });
    }

    async repairPdfxOutputIntent(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("REPAIR_PDFX_OUTPUTINTENT"); }
    async markStandardUncertified(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedStandardsCertification("MARK_STANDARD_UNCERTIFIED"); }
    
    async revokeFalseCertification(inputPath, outputPath, options = {}) {
        return this._applyMetadataFix(inputPath, outputPath, 'REVOKE_FALSE_CERTIFICATION', 'REVOKED_CERTIFICATION', 'Revoked false standard certification.', (pdfDoc) => {
            const { PDFName } = require('pdf-lib');
            if (pdfDoc.catalog.has(PDFName.of('OutputIntents'))) {
                pdfDoc.catalog.delete(PDFName.of('OutputIntents'));
            }
        });
    }

    async generateStandardValidationReport(inputPath, outputPath, options = {}) {
        // Phase 68A: attempt real veraPDF-backed report; fall back to honest scaffold.
        const veraPdf = require('./VeraPdfValidator');
        const available = await veraPdf.isAvailable();

        if (!available) {
            return this._scaffoldUnsupportedStandardsCertification("GENERATE_STANDARD_VALIDATION_REPORT");
        }

        const result = await veraPdf.validate(inputPath, options.flavour || 'auto');
        const complianceClaimAllowed = result.compliance_claim_allowed === true;

        return {
            success: result.validation_performed,
            status: result.validation_performed ? 'APPLIED' : 'FAILED',
            code: 'GENERATE_STANDARD_VALIDATION_REPORT',
            strategy: 'verapdf_report',
            requires_human_review: true,
            production_safe: false,
            validation_performed: result.validation_performed,
            validation_passed: result.validation_passed,
            validator_name: result.validator_name,
            validator_version: result.validator_version,
            standard_detected: result.standard_detected,
            validation_report_hash: result.validation_report_hash,
            compliance_claim_allowed: complianceClaimAllowed,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: complianceClaimAllowed,
            evidence: {
                report_type: 'VERAPDF_VALIDATION',
                validator_available: true,
                validator_name: result.validator_name,
                validator_version: result.validator_version,
                validation_performed: result.validation_performed,
                validation_passed: result.validation_passed,
                standard_detected: result.standard_detected,
                validation_report_hash: result.validation_report_hash,
                compliance_claim_allowed: complianceClaimAllowed,
                review_required: true,
                errors: result.errors || [],
                limitations: [
                    'Human review required before acting on validator results.',
                    'Validator evidence does not confer production certification.'
                ]
            }
        };
    }

    async generateStandardValidationReportInternal(inputPath, outputPath, options = {}) {
        await fs.copy(inputPath, outputPath); // Just pass through the file for internal report action
        return {
            success: true,
            status: 'APPLIED',
            code: 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL',
            strategy: 'internal_report_generator',
            description: 'Internal standards governance report was generated.',
            output: outputPath,
            risk_level: 'LOW',
            requires_human_review: false,
            production_safe: false,
            message: 'Internal standards governance report was generated.',
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false,
            compliance_claim_allowed: false,
            validator_available: false,
            validation_performed: false,
            validation_passed: false,
            evidence: {
                report_type: 'INTERNAL_GOVERNANCE',
                statement: 'This is an internal governance report, not an external PDF/X or PDF/A validator report.',
                limitations: [
                    'No real validator was executed.'
                ]
            }
        };
    }
    // --- Phase 64A: Ink / TAC / Black / Registration Color Fixes ---

    _scaffoldUnsupportedInkGovernance(fixId, message) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED_UNSUPPORTED",
            strategy: "UNSUPPORTED_INK_GOVERNANCE_FIX",
            risk_level: "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: true,
            destructive: true,
            executable: false,
            visual_change_expected: true,
            review_required: true,
            production_certified: false,
            compliance_claim_allowed: false,
            evidence: {
                reason: message || "Ink/color visual fixes cannot be safely automated without a rendering pipeline and evidence-backed visual verification.",
                tac_reduction_attempted: false,
                tac_reduction_applied: false,
                rich_black_text_mapped: false,
                registration_color_mapped: false,
                visual_change_expected: true,
                review_required: true,
                production_certified: false,
                limitations: [
                    "Ink/color content stream editing requires access to individual color operators and cannot be safely done without font/color pipeline.",
                    "No physical ink reduction or color remapping was performed.",
                    "Human review and operator correction are required."
                ],
                warnings: []
            }
        };
    }

    async detectTotalInkCoverage(inputPath, outputPath, options = {}) {
        return this._scaffoldUnsupportedInkGovernance("DETECT_TOTAL_INK_COVERAGE", "TAC detection requires rendering pipeline access; currently scaffolded.");
    }

    async reduceTotalInkCoverage(inputPath, outputPath, options = {}) {
        return this._scaffoldUnsupportedInkGovernance("REDUCE_TOTAL_INK_COVERAGE", "TAC reduction cannot be safely performed without a color rendering pipeline and before/after visual evidence.");
    }

    async mapRichBlackTextToKOnly(inputPath, outputPath, options = {}) {
        return this._scaffoldUnsupportedInkGovernance("MAP_RICH_BLACK_TEXT_TO_K_ONLY", "Mapping rich black text to K-only requires color content stream editing; not safely automatable without visual evidence.");
    }

    async mapRegistrationColorToBlack(inputPath, outputPath, options = {}) {
        return this._scaffoldUnsupportedInkGovernance("MAP_REGISTRATION_COLOR_TO_BLACK", "Mapping registration color to black requires color content stream editing; not safely automatable without visual evidence.");
    }

    async normalizeBlackText(inputPath, outputPath, options = {}) {
        return this._scaffoldUnsupportedInkGovernance("NORMALIZE_BLACK_TEXT", "Normalizing black text to K-only requires color content stream editing; not safely automatable without visual evidence.");
    }

    async detectSmallTextRichBlack(inputPath, outputPath, options = {}) {
        return {
            success: false,
            code: "DETECT_SMALL_TEXT_RICH_BLACK",
            status: "SKIPPED_UNSUPPORTED",
            strategy: "UNSUPPORTED_INK_GOVERNANCE_FIX",
            risk_level: "MEDIUM",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: true,
            destructive: false,
            executable: false,
            visual_change_expected: false,
            review_required: true,
            production_certified: false,
            compliance_claim_allowed: false,
            evidence: {
                reason: "Detection of small text using rich black requires text extraction and color space inspection; currently scaffolded.",
                tac_reduction_attempted: false,
                tac_reduction_applied: false,
                rich_black_text_mapped: false,
                registration_color_mapped: false,
                visual_change_expected: false,
                review_required: true,
                production_certified: false,
                limitations: [
                    "Small rich-black text detection requires glyph-level color analysis not currently available.",
                    "No physical correction was performed.",
                    "Human review required."
                ],
                warnings: []
            }
        };
    }

    async normalizeIccProfile(inputPath, outputPath, options = {}) { return this._scaffoldUnsupported("NORMALIZE_ICC_PROFILE"); }
    async reduceTac(inputPath, outputPath, options = {}) { return this._scaffoldUnsupportedInkGovernance("REDUCE_TAC", "Legacy TAC fix. Use REDUCE_TOTAL_INK_COVERAGE. TAC reduction requires rendering pipeline."); }
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

    // --- Phase 65A Selective Image Fixes ---

    _scaffoldSelectiveImageFix(fixId, message, evidenceOverrides = {}) {
        return {
            success: false,
            code: fixId,
            status: "SKIPPED_UNSUPPORTED",
            strategy: "UNSUPPORTED_SELECTIVE_IMAGE_FIX",
            risk_level: evidenceOverrides.risk_level || "HIGH",
            requires_human_review: true,
            production_safe: false,
            visually_sensitive: evidenceOverrides.visually_sensitive !== undefined ? evidenceOverrides.visually_sensitive : true,
            destructive: evidenceOverrides.destructive !== undefined ? evidenceOverrides.destructive : true,
            executable: false,
            visual_change_expected: evidenceOverrides.visual_change_expected !== undefined ? evidenceOverrides.visual_change_expected : true,
            review_required: true,
            production_certified: false,
            compliance_claim_allowed: false,
            evidence: {
                reason: message || "Selective image transformations cannot be safely automated without a color-managed rendering pipeline and before/after visual evidence.",
                images_scanned: 0,
                rgb_images_converted_count: 0,
                images_tagged_count: 0,
                icc_profiles_normalized_count: 0,
                images_downsampled_count: 0,
                low_res_images_flagged_count: 0,
                upscaling_performed: false,
                visual_change_expected: evidenceOverrides.visual_change_expected !== undefined ? evidenceOverrides.visual_change_expected : true,
                review_required: true,
                production_certified: false,
                limitations: evidenceOverrides.limitations || [
                    "Selective per-image stream replacement requires a color-managed rendering pipeline not currently available.",
                    "No global or destructive image conversion was performed.",
                    "Human review and source assets/customer approval are required."
                ],
                warnings: []
            }
        };
    }

    async convertImageRgbToCmykSelective(inputPath, outputPath, options = {}) {
        return this._scaffoldSelectiveImageFix(
            "CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE",
            "Selective RGB-to-CMYK image conversion requires per-image color-managed stream replacement; not safely automatable without a rendering pipeline and visual evidence. Global conversion is never performed."
        );
    }

    async tagUntaggedImages(inputPath, outputPath, options = {}) {
        return this._scaffoldSelectiveImageFix(
            "TAG_UNTAGGED_IMAGES",
            "Assigning an ICC profile to an untagged image changes color interpretation; the correct profile cannot be safely inferred without source/intent evidence.",
            { risk_level: "MEDIUM" }
        );
    }

    async normalizeImageIccProfile(inputPath, outputPath, options = {}) {
        return this._scaffoldSelectiveImageFix(
            "NORMALIZE_IMAGE_ICC_PROFILE",
            "Replacing or remapping an embedded image ICC profile changes color rendering; requires a color-managed pipeline and visual verification not currently available."
        );
    }

    async flagLowResImagesUnfixable(inputPath, outputPath, options = {}) {
        return this._scaffoldSelectiveImageFix(
            "FLAG_LOW_RES_IMAGES_UNFIXABLE",
            "Low-resolution images are flagged for review only. Automatic upscaling would invent visual detail and is never performed; source assets or customer approval are required.",
            { risk_level: "LOW", destructive: false, visually_sensitive: false, visual_change_expected: false,
              limitations: [
                  "Low-resolution images cannot be safely improved automatically.",
                  "Upscaling/interpolation is never performed because it would invent detail not present in the source.",
                  "Source assets or customer approval are required to resolve."
              ]
            }
        );
    }

    // --- Phase 62A Page Marks Fixes ---

    async addCropMarks(inputPath, outputPath, options = {}) {
        const { PDFDocument, PDFName, rgb } = require('pdf-lib');
        try {
            const bytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

            const markLength = options.markLength || 10; // pts
            const markOffset = options.markOffset || 5; // pts
            const strokeWidth = options.strokeWidth || 0.25; // pts

            let applied = false;
            let skipped = false;
            let skipReason = null;
            let safetyChecks = [];
            let markGeometry = [];
            let pagesProcessed = 0;
            let pageBoxesBefore = [];
            let pageBoxesAfter = [];

            const pages = pdfDoc.getPages();
            
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const trimBox = page.getTrimBox();
                const mediaBox = page.getMediaBox();
                const cropBox = page.getCropBox() || mediaBox;

                pageBoxesBefore.push({ trimBox, mediaBox, cropBox });

                if (!page.node.has(PDFName.of('TrimBox'))) {
                    skipped = true;
                    skipReason = 'TRIMBOX_MISSING';
                    safetyChecks.push('TrimBox is required but missing.');
                    break;
                }

                const bleedMarginLeft = trimBox.x - cropBox.x;
                const bleedMarginBottom = trimBox.y - cropBox.y;
                const bleedMarginRight = (cropBox.x + cropBox.width) - (trimBox.x + trimBox.width);
                const bleedMarginTop = (cropBox.y + cropBox.height) - (trimBox.y + trimBox.height);

                const requiredMargin = markLength + markOffset;

                if (bleedMarginLeft < requiredMargin || bleedMarginBottom < requiredMargin ||
                    bleedMarginRight < requiredMargin || bleedMarginTop < requiredMargin) {
                    skipped = true;
                    skipReason = 'INSUFFICIENT_MARGIN';
                    safetyChecks.push(`Margin insufficient. Required: ${requiredMargin}pt. Found L:${bleedMarginLeft}, R:${bleedMarginRight}, T:${bleedMarginTop}, B:${bleedMarginBottom}`);
                    break;
                }

                // Calculate marks
                const tLeft = trimBox.x;
                const tRight = trimBox.x + trimBox.width;
                const tBottom = trimBox.y;
                const tTop = trimBox.y + trimBox.height;

                const lines = [
                    // Bottom Left
                    { start: { x: tLeft - markOffset, y: tBottom }, end: { x: tLeft - markOffset - markLength, y: tBottom } },
                    { start: { x: tLeft, y: tBottom - markOffset }, end: { x: tLeft, y: tBottom - markOffset - markLength } },
                    // Bottom Right
                    { start: { x: tRight + markOffset, y: tBottom }, end: { x: tRight + markOffset + markLength, y: tBottom } },
                    { start: { x: tRight, y: tBottom - markOffset }, end: { x: tRight, y: tBottom - markOffset - markLength } },
                    // Top Left
                    { start: { x: tLeft - markOffset, y: tTop }, end: { x: tLeft - markOffset - markLength, y: tTop } },
                    { start: { x: tLeft, y: tTop + markOffset }, end: { x: tLeft, y: tTop + markOffset + markLength } },
                    // Top Right
                    { start: { x: tRight + markOffset, y: tTop }, end: { x: tRight + markOffset + markLength, y: tTop } },
                    { start: { x: tRight, y: tTop + markOffset }, end: { x: tRight, y: tTop + markOffset + markLength } }
                ];

                // Safety validation: Ensure no line intersects TrimBox or goes outside CropBox
                for (const line of lines) {
                    const lx1 = Math.min(line.start.x, line.end.x);
                    const lx2 = Math.max(line.start.x, line.end.x);
                    const ly1 = Math.min(line.start.y, line.end.y);
                    const ly2 = Math.max(line.start.y, line.end.y);

                    // Check TrimBox intersection (must be strictly outside)
                    if (!(lx2 <= tLeft || lx1 >= tRight || ly2 <= tBottom || ly1 >= tTop)) {
                        skipped = true;
                        skipReason = 'UNSAFE_MARK_GEOMETRY';
                        safetyChecks.push('Mark intersects TrimBox.');
                        break;
                    }

                    // Check CropBox boundary
                    if (lx1 < cropBox.x || lx2 > cropBox.x + cropBox.width ||
                        ly1 < cropBox.y || ly2 > cropBox.y + cropBox.height) {
                        skipped = true;
                        skipReason = 'UNSAFE_MARK_GEOMETRY';
                        safetyChecks.push('Mark falls outside CropBox.');
                        break;
                    }
                }

                if (skipped) break;

                // Draw marks using simple RGB black (avoid registration color semantics for now)
                for (const line of lines) {
                    page.drawLine({
                        start: line.start,
                        end: line.end,
                        thickness: strokeWidth,
                        color: rgb(0, 0, 0)
                    });
                    markGeometry.push({ ...line, page: i });
                }

                applied = true;
                pagesProcessed++;
                pageBoxesAfter.push({ trimBox: page.getTrimBox(), mediaBox: page.getMediaBox(), cropBox: page.getCropBox() });
            }

            if (skipped) {
                return {
                    success: false,
                    status: 'SKIPPED',
                    code: 'ADD_CROP_MARKS',
                    error: skipReason,
                    evidence: {
                        reason: skipReason,
                        safety_checks: safetyChecks,
                        page_boxes_before: pageBoxesBefore
                    }
                };
            }

            const modifiedBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, modifiedBytes);

            if (!(await fs.pathExists(outputPath))) return { success: false, error: 'Output file missing' };
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) return { success: false, error: 'Output file is empty' };

            // Verify output starts with %PDF
            const fd = await fs.open(outputPath, 'r');
            const buffer = Buffer.alloc(4);
            await fs.read(fd, buffer, 0, 4, 0);
            await fs.close(fd);
            if (buffer.toString('utf8', 0, 4) !== '%PDF') {
                return { success: false, error: 'Output file does not start with %PDF' };
            }

            return {
                success: true,
                status: 'APPLIED',
                code: 'ADD_CROP_MARKS',
                strategy: 'pdf_lib_draw_crop_marks',
                description: 'Crop marks were added outside TrimBox.',
                output: outputPath,
                risk_level: 'MEDIUM',
                requires_human_review: true,
                production_safe: false,
                visually_sensitive: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                message: 'Crop marks added successfully.',
                evidence: {
                    pages_processed: pagesProcessed,
                    page_boxes_before: pageBoxesBefore,
                    page_boxes_after: pageBoxesAfter,
                    mark_geometry: markGeometry,
                    safety_checks: safetyChecks,
                    detection_confidence: null,
                    warnings: [],
                    limitations: ["Simple RGB black stroke used. Not standard registration color."]
                }
            };

        } catch (e) {
             return {
                 success: false,
                 status: 'FAILED',
                 code: 'ADD_CROP_MARKS',
                 error: e.message,
                 evidence: { error: e.message }
             };
        }
    }

    async removeRegistrationMarks(inputPath, outputPath, options = {}) {
        return {
            success: false,
            status: 'SKIPPED',
            code: 'REMOVE_REGISTRATION_MARKS',
            error: 'DETECTION_OR_REMOVAL_NOT_SAFE',
            evidence: {
                reason: 'Physical removal of page marks is not yet safely verifiable at the content stream level.',
                pages_processed: 0,
                safety_checks: ['Avoided ambiguous artwork removal.'],
                warnings: ['Removal of complex stream objects deferred to prevent artwork corruption.'],
                limitations: []
            }
        };
    }

    async normalizePageMarks(inputPath, outputPath, options = {}) {
        return {
            success: false,
            status: 'SKIPPED',
            code: 'NORMALIZE_PAGE_MARKS',
            error: 'SKIPPED_UNSUPPORTED_PARTIAL',
            evidence: {
                reason: 'No safe non-artwork normalization was possible.',
                pages_processed: 0,
                safety_checks: [],
                warnings: [],
                limitations: ['Safe physical metadata normalization for marks not yet implemented.']
            }
        };
    }

    // --- Phase 69A: Visual Diff / Rendered Proof Generation ---
    // Governance: Evidence generation only. Never implies print-ready, production certification,
    // PDF/X compliance, or PDF/A compliance.

    /**
     * Detect available rendering tool (Ghostscript or mutool).
     * Returns { tool, version, available } or { available: false }.
     */
    async _detectRenderTool() {
        const path = require('path');
        const gsCandidates = process.platform === 'win32'
            ? ['gswin64c', 'gswin32c', 'gs']
            : ['gs'];

        for (const gsBin of gsCandidates) {
            try {
                const { stdout } = await execFileAsync(gsBin, ['--version'], { timeout: 5000 });
                const version = (stdout || '').trim();
                return { tool: 'ghostscript', bin: gsBin, version, available: true };
            } catch (_) { /* try next */ }
        }

        try {
            const { stdout } = await execFileAsync('mutool', ['--version'], { timeout: 5000 });
            const version = (stdout || '').split('\n')[0].trim();
            return { tool: 'mutool', bin: 'mutool', version, available: true };
        } catch (_) { /* not available */ }

        return { tool: null, bin: null, version: null, available: false };
    }

    /**
     * Read PNG dimensions from binary header (IHDR chunk).
     * Returns { width, height } or null if not parseable.
     */
    _readPngDimensions(buffer) {
        try {
            // PNG signature: 8 bytes, then IHDR chunk:
            //   4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height
            if (buffer.length < 24) return null;
            const sig = buffer.slice(0, 8).toString('hex');
            if (!sig.startsWith('89504e47')) return null; // PNG magic bytes
            const width = buffer.readUInt32BE(16);
            const height = buffer.readUInt32BE(20);
            return { width, height };
        } catch (_) {
            return null;
        }
    }

    /**
     * Compute a byte-level diff ratio between two PNG buffers as a proxy for changed_pixel_ratio.
     * This compares compressed bytes — not true per-pixel delta — and is honest about limitations.
     */
    _computeBytesDiffRatio(bufA, bufB) {
        const len = Math.max(bufA.length, bufB.length);
        if (len === 0) return 0;
        let diffBytes = Math.abs(bufA.length - bufB.length);
        const compareLen = Math.min(bufA.length, bufB.length);
        for (let i = 0; i < compareLen; i++) {
            if (bufA[i] !== bufB[i]) diffBytes++;
        }
        return diffBytes / len;
    }

    /**
     * Render PDF pages to PNG files.
     * Returns structured evidence; SKIPPED_UNSUPPORTED with tool_gap=true if no renderer available.
     */
    async renderPdfPages(inputPath, outputDir, options = {}) {
        const path = require('path');
        const os = require('os');
        const dpi = options.dpi || 72;
        const maxPages = options.maxPages || 10;

        const toolInfo = await this._detectRenderTool();

        if (!toolInfo.available) {
            return {
                success: false,
                status: 'SKIPPED_UNSUPPORTED',
                code: 'RENDER_PDF_PAGES',
                render_performed: false,
                pages_rendered: 0,
                render_tool: null,
                render_tool_version: null,
                tool_gap: true,
                requires_human_review: true,
                production_safe: false,
                print_ready_claim: false,
                visual_diff_governance: true,
                evidence: {
                    render_performed: false,
                    diff_performed: false,
                    pages_rendered: 0,
                    pages_compared: 0,
                    changed_pixel_ratio_max: null,
                    changed_pixel_ratio_avg: null,
                    dimensions_match: null,
                    render_tool: null,
                    render_tool_version: null,
                    diff_images: [],
                    thumbnails: [],
                    tool_gap: true,
                    visual_diff_governance: true,
                    warnings: ['No rendering tool available (Ghostscript or mutool required).'],
                    limitations: [
                        'Visual diff requires Ghostscript or mutool.',
                        'Install Ghostscript (gs/gswin64c) or mutool to enable rendering.',
                        'This result does not imply production-ready or production status.'
                    ]
                }
            };
        }

        const workDir = outputDir || path.join(require('os').tmpdir(), `ppos_render_${Date.now()}`);
        await fs.ensureDir(workDir);

        const outputPattern = path.join(workDir, 'page_%d.png');
        const warnings = [];
        const renderedPaths = [];

        try {
            if (toolInfo.tool === 'ghostscript') {
                await execFileAsync(toolInfo.bin, [
                    '-dBATCH', '-dNOPAUSE', '-dSAFER',
                    '-sDEVICE=png16m',
                    `-r${dpi}`,
                    `-dLastPage=${maxPages}`,
                    `-sOutputFile=${outputPattern}`,
                    inputPath
                ], { timeout: 60000 });
            } else if (toolInfo.tool === 'mutool') {
                await execFileAsync('mutool', [
                    'draw',
                    '-r', String(dpi),
                    '-o', outputPattern,
                    inputPath,
                    `1-${maxPages}`
                ], { timeout: 60000 });
            }
        } catch (err) {
            warnings.push(`Render execution warning: ${err.message}`);
        }

        // Collect rendered files
        try {
            const files = await fs.readdir(workDir);
            for (const f of files.sort()) {
                if (f.startsWith('page_') && f.endsWith('.png')) {
                    renderedPaths.push(path.join(workDir, f));
                }
            }
        } catch (_) { /* dir may be empty */ }

        return {
            success: renderedPaths.length > 0,
            status: renderedPaths.length > 0 ? 'APPLIED' : 'FAILED',
            code: 'RENDER_PDF_PAGES',
            render_performed: renderedPaths.length > 0,
            pages_rendered: renderedPaths.length,
            render_tool: toolInfo.tool,
            render_tool_version: toolInfo.version,
            output_dir: workDir,
            rendered_paths: renderedPaths,
            tool_gap: false,
            requires_human_review: true,
            production_safe: false,
            print_ready_claim: false,
            visual_diff_governance: true,
            evidence: {
                render_performed: renderedPaths.length > 0,
                diff_performed: false,
                pages_rendered: renderedPaths.length,
                pages_compared: 0,
                changed_pixel_ratio_max: null,
                changed_pixel_ratio_avg: null,
                dimensions_match: null,
                render_tool: toolInfo.tool,
                render_tool_version: toolInfo.version,
                diff_images: [],
                thumbnails: renderedPaths,
                tool_gap: false,
                visual_diff_governance: true,
                warnings,
                limitations: [
                    'Rendered images are evidence only.',
                    'Rendering does not imply production-ready or production status.',
                    'No standards compliance is claimed.'
                ]
            }
        };
    }

    /**
     * Compare two sets of rendered PNG pages and compute diff metrics.
     * origPaths and fixedPaths are arrays of PNG file paths (matched by index).
     */
    async _compareRenderedPages(origPaths, fixedPaths) {
        const results = [];
        const compareLen = Math.min(origPaths.length, fixedPaths.length);
        let maxRatio = 0;
        let totalRatio = 0;
        let dimensionsMatch = true;

        for (let i = 0; i < compareLen; i++) {
            try {
                const bufA = await fs.readFile(origPaths[i]);
                const bufB = await fs.readFile(fixedPaths[i]);
                const dimA = this._readPngDimensions(bufA);
                const dimB = this._readPngDimensions(bufB);
                const dimsMatch = dimA && dimB && dimA.width === dimB.width && dimA.height === dimB.height;
                if (!dimsMatch) dimensionsMatch = false;
                const ratio = this._computeBytesDiffRatio(bufA, bufB);
                if (ratio > maxRatio) maxRatio = ratio;
                totalRatio += ratio;
                results.push({
                    page: i + 1,
                    dim_orig: dimA,
                    dim_fixed: dimB,
                    dimensions_match: !!dimsMatch,
                    changed_pixel_ratio_proxy: ratio
                });
            } catch (err) {
                results.push({ page: i + 1, error: err.message });
            }
        }

        return {
            pages_compared: compareLen,
            max_pixel_delta_proxy: maxRatio,
            changed_pixel_ratio_max: maxRatio,
            changed_pixel_ratio_avg: compareLen > 0 ? totalRatio / compareLen : 0,
            dimensions_match: dimensionsMatch,
            per_page: results
        };
    }

    /**
     * Generate a visual diff between two PDFs.
     * Renders both and computes byte-level diff metrics as a proxy for pixel diff.
     */
    async generateVisualDiff(origPath, fixedPath, options = {}) {
        const path = require('path');
        const os = require('os');
        const dpi = options.dpi || 72;
        const maxPages = options.maxPages || 10;

        const toolInfo = await this._detectRenderTool();

        if (!toolInfo.available) {
            return {
                success: false,
                status: 'SKIPPED_UNSUPPORTED',
                code: 'GENERATE_VISUAL_DIFF',
                render_performed: false,
                diff_performed: false,
                tool_gap: true,
                requires_human_review: true,
                production_safe: false,
                print_ready_claim: false,
                visual_diff_governance: true,
                evidence: {
                    render_performed: false,
                    diff_performed: false,
                    pages_rendered: 0,
                    pages_compared: 0,
                    changed_pixel_ratio_max: null,
                    changed_pixel_ratio_avg: null,
                    dimensions_match: null,
                    render_tool: null,
                    render_tool_version: null,
                    diff_images: [],
                    thumbnails: [],
                    tool_gap: true,
                    visual_diff_governance: true,
                    warnings: ['No rendering tool available; visual diff cannot be performed.'],
                    limitations: [
                        'Visual diff requires Ghostscript or mutool.',
                        'Visual diff is evidence generation only; does not imply production-ready or production status.'
                    ]
                }
            };
        }

        const origDir = path.join(os.tmpdir(), `ppos_orig_${Date.now()}`);
        const fixedDir = path.join(os.tmpdir(), `ppos_fixed_${Date.now()}`);

        const origResult = await this.renderPdfPages(origPath, origDir, { dpi, maxPages });
        const fixedResult = await this.renderPdfPages(fixedPath, fixedDir, { dpi, maxPages });

        const warnings = [
            ...(origResult.evidence.warnings || []).map(w => `orig: ${w}`),
            ...(fixedResult.evidence.warnings || []).map(w => `fixed: ${w}`)
        ];

        if (!origResult.render_performed || !fixedResult.render_performed) {
            return {
                success: false,
                status: 'FAILED',
                code: 'GENERATE_VISUAL_DIFF',
                render_performed: false,
                diff_performed: false,
                tool_gap: false,
                requires_human_review: true,
                production_safe: false,
                print_ready_claim: false,
                visual_diff_governance: true,
                evidence: {
                    render_performed: false,
                    diff_performed: false,
                    pages_rendered: 0,
                    pages_compared: 0,
                    changed_pixel_ratio_max: null,
                    changed_pixel_ratio_avg: null,
                    dimensions_match: null,
                    render_tool: toolInfo.tool,
                    render_tool_version: toolInfo.version,
                    diff_images: [],
                    thumbnails: [],
                    tool_gap: false,
                    visual_diff_governance: true,
                    warnings,
                    limitations: [
                        'One or both PDFs failed to render; diff cannot be computed.',
                        'Visual diff is evidence generation only.'
                    ]
                }
            };
        }

        const diff = await this._compareRenderedPages(origResult.rendered_paths, fixedResult.rendered_paths);

        return {
            success: true,
            status: 'APPLIED',
            code: 'GENERATE_VISUAL_DIFF',
            render_performed: true,
            diff_performed: true,
            pages_rendered: origResult.pages_rendered + fixedResult.pages_rendered,
            pages_compared: diff.pages_compared,
            changed_pixel_ratio_max: diff.changed_pixel_ratio_max,
            changed_pixel_ratio_avg: diff.changed_pixel_ratio_avg,
            dimensions_match: diff.dimensions_match,
            tool_gap: false,
            requires_human_review: true,
            production_safe: false,
            print_ready_claim: false,
            visual_diff_governance: true,
            evidence: {
                render_performed: true,
                diff_performed: true,
                pages_rendered: origResult.pages_rendered + fixedResult.pages_rendered,
                pages_compared: diff.pages_compared,
                changed_pixel_ratio_max: diff.changed_pixel_ratio_max,
                changed_pixel_ratio_avg: diff.changed_pixel_ratio_avg,
                dimensions_match: diff.dimensions_match,
                render_tool: toolInfo.tool,
                render_tool_version: toolInfo.version,
                diff_images: [],
                thumbnails: origResult.rendered_paths,
                per_page_diff: diff.per_page,
                tool_gap: false,
                visual_diff_governance: true,
                warnings,
                limitations: [
                    'Pixel diff is computed as a compressed-byte proxy; not a true per-pixel delta.',
                    'Visual diff is evidence generation only; does not imply production-ready or production status.',
                    'No compliance, production, or standards certification claim is made.'
                ]
            }
        };
    }

    /**
     * Generate low-resolution proof thumbnails for a PDF.
     */
    async generateProofThumbnails(inputPath, outputDir, options = {}) {
        const thumbnailDpi = options.thumbnailDpi || 36;
        const result = await this.renderPdfPages(inputPath, outputDir, { dpi: thumbnailDpi, maxPages: options.maxPages || 10 });
        return {
            ...result,
            code: 'GENERATE_PROOF_THUMBNAILS',
            evidence: {
                ...result.evidence,
                limitations: [
                    'Thumbnails are low-resolution proofs for visual review only.',
                    'Thumbnails do not imply print-ready, production-safe, or standards-certified status.',
                    ...(result.evidence.limitations || [])
                ]
            }
        };
    }

    /**
     * Compare original PDF to fixed PDF: render both, compute diff metrics.
     */
    async compareOriginalToFixed(origPath, fixedPath, options = {}) {
        const result = await this.generateVisualDiff(origPath, fixedPath, options);
        return {
            ...result,
            code: 'COMPARE_ORIGINAL_TO_FIXED',
            evidence: result.evidence
                ? {
                    ...result.evidence,
                    comparison_type: 'original_vs_fixed',
                    limitations: [
                        'Visual comparison is evidence only.',
                        'A passing visual diff does not imply the fixed PDF is print-ready or production-certified.',
                        ...(result.evidence.limitations || [])
                    ]
                }
                : result.evidence
        };
    }

    /**
     * Compare fixed PDF to a certified reference: render both, compute diff metrics.
     * Visual similarity does NOT imply certification.
     */
    async compareFixedToCertified(fixedPath, certifiedPath, options = {}) {
        const result = await this.generateVisualDiff(fixedPath, certifiedPath, options);
        return {
            ...result,
            code: 'COMPARE_FIXED_TO_CERTIFIED',
            evidence: result.evidence
                ? {
                    ...result.evidence,
                    comparison_type: 'fixed_vs_certified_reference',
                    visual_match_implies_certification: false,
                    limitations: [
                        'Visual similarity to a certified reference does NOT imply certification.',
                        'Certification requires an authoritative validator, not visual comparison.',
                        ...(result.evidence.limitations || [])
                    ]
                }
                : result.evidence
        };
    }

    /**
     * Generate a full visual change report: renders original and fixed, computes diff, returns evidence object.
     */
    // --- Phase 70A — Proof Approval Contract Source ---

    /**
     * Hash a single file's content using SHA-256.
     * Returns null (with a warning) if the file does not exist or cannot be read.
     */
    async _hashArtifact(filePath) {
        const crypto = require('crypto');
        const fs = require('fs-extra');
        if (!filePath) return { hash: null, warning: 'No path provided' };
        try {
            const buf = await fs.readFile(filePath);
            return { hash: crypto.createHash('sha256').update(buf).digest('hex'), warning: null };
        } catch (err) {
            return { hash: null, warning: `Cannot hash artifact: ${err.message}` };
        }
    }

    /**
     * Generate SHA-256 content hashes for source, fixed, and (optionally) diff report artifacts.
     * diff_report may be a filesystem path or a plain JS object — if an object, it is serialised.
     * Raw paths are never emitted in the returned payload.
     */
    async generateProofArtifactHashes(pathsObj = {}, options = {}) {
        const crypto = require('crypto');
        const { source_path, fixed_path, diff_report } = pathsObj;
        const warnings = [];

        const sourceResult = await this._hashArtifact(source_path);
        if (sourceResult.warning) warnings.push(`source_artifact: ${sourceResult.warning}`);

        const fixedResult = await this._hashArtifact(fixed_path);
        if (fixedResult.warning) warnings.push(`fixed_artifact: ${fixedResult.warning}`);

        let diffReportHash = null;
        if (diff_report) {
            try {
                const payload = typeof diff_report === 'string'
                    ? require('fs-extra').readFileSync(diff_report)
                    : Buffer.from(JSON.stringify(diff_report));
                diffReportHash = crypto.createHash('sha256').update(payload).digest('hex');
            } catch (err) {
                warnings.push(`diff_report: Cannot hash: ${err.message}`);
            }
        }

        const hashes = {
            source_artifact_hash: sourceResult.hash,
            fixed_artifact_hash: fixedResult.hash,
            diff_report_hash: diffReportHash
        };

        return {
            success: true,
            status: 'APPLIED',
            code: 'GENERATE_PROOF_ARTIFACT_HASHES',
            requires_human_review: true,
            production_safe: false,
            proof_approval_governance: true,
            evidence: {
                ...hashes,
                hash_algorithm: 'sha256',
                warnings,
                limitations: [
                    'Artifact hashes are content fingerprints only.',
                    'A matching hash does not certify print-readiness or standards compliance.',
                    'Hashes enable stable downstream reference without raw filesystem paths.'
                ]
            }
        };
    }

    /**
     * Derive a stable, deterministic proof_id from content hashes.
     * proof_id = sha256(sourceHash + "|" + fixedHash + "|" + diffHash)
     * Deterministic: same inputs always produce the same proof_id across reruns.
     */
    generateProofId(sourceHash, fixedHash, diffReportHash) {
        const crypto = require('crypto');
        const input = [
            sourceHash || '',
            fixedHash || '',
            diffReportHash || ''
        ].join('|');
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    /**
     * Generate the full proof approval contract:
     * proof_id, artifact hashes, rendered_pages, generated_at.
     * No raw filesystem paths are included in the returned payload.
     * options.rendered_pages — page count from a prior Phase 69A render result (optional).
     * options.diff_report — JS object or path to diff report for hashing (optional).
     */
    async generateProofApprovalContract(origPath, fixedPath, options = {}) {
        const { rendered_pages = null, diff_report = null } = options;
        const warnings = [];

        const hashResult = await this.generateProofArtifactHashes(
            { source_path: origPath, fixed_path: fixedPath, diff_report },
            options
        );

        const { source_artifact_hash, fixed_artifact_hash, diff_report_hash } =
            hashResult.evidence || {};

        if (!source_artifact_hash) warnings.push('source_artifact_hash is null; proof_id may be unstable');
        if (!fixed_artifact_hash) warnings.push('fixed_artifact_hash is null; proof_id may be unstable');

        const proof_id = this.generateProofId(source_artifact_hash, fixed_artifact_hash, diff_report_hash);

        const contract = {
            proof_id,
            source_artifact_hash: source_artifact_hash || null,
            fixed_artifact_hash: fixed_artifact_hash || null,
            diff_report_hash: diff_report_hash || null,
            rendered_pages: rendered_pages !== null ? rendered_pages : null,
            generated_at: new Date().toISOString(),
            hash_algorithm: 'sha256',
            proof_id_algorithm: 'sha256(source_hash|fixed_hash|diff_hash)',
            warnings: [
                ...(hashResult.evidence && hashResult.evidence.warnings ? hashResult.evidence.warnings : []),
                ...warnings
            ],
            limitations: [
                'Proof contract is identity/evidence generation only.',
                'proof_id does not certify print-readiness, production approval, or standards compliance.',
                'Artifact hashes are content fingerprints; matching hashes do not imply visual or standards equivalence.',
                'No raw filesystem paths are included in this contract.'
            ]
        };

        return {
            success: true,
            status: 'APPLIED',
            code: 'GENERATE_PROOF_APPROVAL_CONTRACT',
            requires_human_review: true,
            production_safe: false,
            production_certified: false,
            proof_approval_governance: true,
            evidence: contract
        };
    }

    // --- Phase 71A — Production Package Evidence Source ---

    /**
     * Hash an artifact reference which may be a filesystem path (string) or an
     * in-memory JS object/payload (e.g. a fix_audit or validation_report object).
     * Returns null (with a warning) if the input is missing or cannot be hashed.
     */
    async _hashArtifactOrPayload(input) {
        const crypto = require('crypto');
        if (input === null || input === undefined) {
            return { hash: null, warning: 'No path or payload provided' };
        }
        if (typeof input === 'string') {
            return this._hashArtifact(input);
        }
        try {
            const payload = Buffer.from(JSON.stringify(input));
            return { hash: crypto.createHash('sha256').update(payload).digest('hex'), warning: null };
        } catch (err) {
            return { hash: null, warning: `Cannot hash payload: ${err.message}` };
        }
    }

    /**
     * Generate SHA-256 content hashes for the artifacts relevant to a production
     * handoff package: original, fixed, review, certified, fix_audit, and
     * validation_report. Each input may be a filesystem path or an in-memory object
     * (fix_audit / validation_report). No raw filesystem paths are emitted in the
     * returned payload, and a present hash never implies trust, certification, or
     * production approval — trust must never be inferred from filenames.
     */
    async generateArtifactHashManifest(pathsObj = {}, options = {}) {
        const {
            original_path = null,
            fixed_path = null,
            review_path = null,
            certified_path = null,
            fix_audit = null,
            validation_report = null
        } = pathsObj;

        const sources = {
            original_artifact_hash: ['original_artifact', original_path],
            fixed_artifact_hash: ['fixed_artifact', fixed_path],
            review_artifact_hash: ['review_artifact', review_path],
            certified_artifact_hash: ['certified_artifact', certified_path],
            fix_audit_hash: ['fix_audit', fix_audit],
            validation_report_hash: ['validation_report', validation_report]
        };

        const warnings = [];
        const hashes = {};
        for (const [field, [label, value]] of Object.entries(sources)) {
            const result = await this._hashArtifactOrPayload(value);
            hashes[field] = result.hash;
            if (result.warning && (value !== null && value !== undefined)) {
                warnings.push(`${label}: ${result.warning}`);
            }
        }

        const missing = Object.entries(hashes)
            .filter(([, hash]) => hash === null)
            .map(([field]) => field);

        return {
            success: true,
            status: 'APPLIED',
            code: 'GENERATE_ARTIFACT_HASH_MANIFEST',
            requires_human_review: true,
            production_safe: false,
            production_certified: false,
            production_package_evidence_governance: true,
            evidence: {
                ...hashes,
                hash_algorithm: 'sha256',
                generated_at: new Date().toISOString(),
                missing_hashes: missing,
                warnings,
                limitations: [
                    'Artifact hashes are content fingerprints only.',
                    'A present hash does not imply trust, certification, production approval, or standards compliance.',
                    'Trust must be derived from governance evidence, not from filenames, paths, or hash presence alone.',
                    'Missing hashes indicate the corresponding artifact was not available at generation time.'
                ]
            }
        };
    }

    /**
     * Verify that a candidate artifact (filesystem path or in-memory payload) matches
     * an expected SHA-256 hash. Used for hash-based artifact identity verification —
     * never as a substitute for filename-based trust, and a match never implies
     * certification or production approval.
     */
    async verifyArtifactHash(input, expectedHash) {
        const result = await this._hashArtifactOrPayload(input);
        const matches = !!(result.hash && expectedHash && result.hash === expectedHash);

        return {
            success: true,
            status: matches ? 'VERIFIED' : 'MISMATCH',
            code: 'VERIFY_ARTIFACT_HASH',
            requires_human_review: true,
            production_safe: false,
            production_certified: false,
            production_package_evidence_governance: true,
            evidence: {
                actual_hash: result.hash,
                expected_hash: expectedHash || null,
                matches,
                hash_algorithm: 'sha256',
                warnings: result.warning ? [result.warning] : [],
                limitations: [
                    'A hash match confirms content identity only.',
                    'A hash match does not imply certification, production approval, or standards compliance.'
                ]
            }
        };
    }

    // --- Phase 74A: Engine Audit Evidence Export ---

    /**
     * Build a stable audit evidence export manifest combining:
     *  - findings (normalized issues passed in)
     *  - fixes (fix plan / fix audit entries passed in)
     *  - artifact_hashes (Phase 71A SHA-256 content hash manifest)
     *  - tool_versions (render tool + standards validator, honestly reported)
     *  - validator_evidence (Phase 68A validation_report / validator_evidence passed in)
     *
     * This is evidence generation only. It never implies production certification,
     * standards compliance, or print-ready status, and never infers trust from
     * filenames or paths.
     */
    async generateAuditEvidenceExport(options = {}) {
        const {
            findings = [],
            fixes = [],
            original_path = null,
            fixed_path = null,
            review_path = null,
            certified_path = null,
            fix_audit = null,
            validation_report = null,
            validator_evidence = null
        } = options;

        const hashManifest = await this.generateArtifactHashManifest({
            original_path, fixed_path, review_path, certified_path, fix_audit, validation_report
        });

        const renderTool = await this._detectRenderTool();
        const veraPdf = require('./VeraPdfValidator');
        const validatorAvailable = await veraPdf.isAvailable();
        const validatorVersion = await veraPdf.getVersion();

        const tool_versions = {
            render_tool: renderTool.tool,
            render_tool_version: renderTool.version,
            render_tool_available: renderTool.available,
            validator_name: 'verapdf',
            validator_version: validatorVersion,
            validator_available: validatorAvailable
        };

        const warnings = [...(hashManifest.evidence.warnings || [])];
        if (!renderTool.available) warnings.push('RENDER_TOOL_UNAVAILABLE');
        if (!validatorAvailable) warnings.push('VALIDATOR_UNAVAILABLE');

        const validatorEvidence = validator_evidence || validation_report || null;
        if (!validatorEvidence) warnings.push('VALIDATOR_EVIDENCE_MISSING');

        const findingsExport = findings.map(f => ({
            id: f.id || f.code || null,
            code: f.code || f.id || null,
            severity: f.severity || null,
            category: f.category || null,
            message: f.message || null,
            fixable: !!f.fixable,
            repairStrategy: f.repairStrategy || f.fix_method || null
        }));

        const fixesExport = fixes.map(f => ({
            fix_id: f.fix_id || f.strategy || null,
            planned: !!f.planned,
            executable: !!f.executable,
            skipped: !!f.skipped,
            skip_reason: f.skip_reason || null,
            risk_level: f.risk_level || null,
            requires_human_review: f.requires_human_review !== false,
            source_finding: f.source_finding || null
        }));

        const complete = hashManifest.evidence.missing_hashes.length === 0 &&
            renderTool.available && validatorAvailable && !!validatorEvidence;

        return {
            success: true,
            status: complete ? 'APPLIED' : 'INCOMPLETE',
            code: complete ? 'AUDIT_EVIDENCE_EXPORT_GENERATED' : 'AUDIT_EVIDENCE_EXPORT_INCOMPLETE',
            requires_human_review: true,
            production_safe: false,
            production_certified: false,
            standard_certified: false,
            compliance_claim_allowed: false,
            audit_evidence_export_governance: true,
            evidence: {
                generated_at: new Date().toISOString(),
                findings: findingsExport,
                fixes: fixesExport,
                artifact_hashes: hashManifest.evidence,
                tool_versions,
                validator_evidence: validatorEvidence,
                complete,
                warnings,
                limitations: [
                    'This export is a stable evidence manifest only.',
                    'It does not imply production certification, standards compliance, or print-ready status.',
                    'Missing tool versions or validator evidence indicate the tool/evidence was unavailable at generation time, not that other evidence is invalid.',
                    'Artifact hash presence does not imply trust; trust is never inferred from filenames or paths.'
                ]
            }
        };
    }

    async generateVisualChangeReport(origPath, fixedPath, options = {}) {
        const toolInfo = await this._detectRenderTool();
        const diffResult = await this.generateVisualDiff(origPath, fixedPath, options);
        const thumbResult = await this.generateProofThumbnails(origPath, null, { maxPages: options.maxPages || 10 });

        const evidence = {
            render_performed: diffResult.render_performed || false,
            diff_performed: diffResult.diff_performed || false,
            pages_rendered: diffResult.pages_rendered || 0,
            pages_compared: diffResult.pages_compared || 0,
            changed_pixel_ratio_max: diffResult.changed_pixel_ratio_max ?? null,
            changed_pixel_ratio_avg: diffResult.changed_pixel_ratio_avg ?? null,
            dimensions_match: diffResult.dimensions_match ?? null,
            render_tool: toolInfo.tool,
            render_tool_version: toolInfo.version,
            diff_images: (diffResult.evidence && diffResult.evidence.diff_images) || [],
            thumbnails: (thumbResult.evidence && thumbResult.evidence.thumbnails) || [],
            tool_gap: !toolInfo.available,
            visual_diff_governance: true,
            per_page_diff: (diffResult.evidence && diffResult.evidence.per_page_diff) || [],
            warnings: [
                ...((diffResult.evidence && diffResult.evidence.warnings) || []),
                ...((thumbResult.evidence && thumbResult.evidence.warnings) || [])
            ],
            limitations: [
                'Visual change report is evidence generation only.',
                'Visual diff does not imply production-ready status.',
                'Visual diff does not imply production certification.',
                'Visual diff does not imply PDF/X or PDF/A compliance.',
                'Pixel diff values are byte-level proxies; not true per-pixel deltas.'
            ]
        };

        return {
            success: diffResult.success || false,
            status: diffResult.status || (toolInfo.available ? 'FAILED' : 'SKIPPED_UNSUPPORTED'),
            code: 'GENERATE_VISUAL_CHANGE_REPORT',
            render_performed: evidence.render_performed,
            diff_performed: evidence.diff_performed,
            tool_gap: evidence.tool_gap,
            requires_human_review: true,
            production_safe: false,
            print_ready_claim: false,
            visual_diff_governance: true,
            evidence
        };
    }
}

module.exports = PdfFixEngine;

