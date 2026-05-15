const PdfFixEngine = require('./PdfFixEngine');
const path = require('path');
const fs = require('fs-extra');
const { CODES: FindingCodes } = require('../interpretation/IndustrialFindingCodes');

/**
 * AutofixExecutionEngine
 * 
 * Portable execution logic for PDF fixes.
 * Classification: INDUSTRIAL_RUNTIME (Technical Orchestration)
 */
const ICC_DIR = process.env.ICC_PROFILES_DIR || path.resolve(__dirname, '../../icc-profiles');
const ICC_PROFILE_MAP = {
    'iso_coated_v3': 'PSO_Coated_v3.icc',
    'iso_uncoated_v3': 'PSOuncoated_v3_FOGRA52.icc',
    'iso_coated_v2_to_v3': 'ISOcoated_v2_to_PSOcoated_v3_DeviceLink.icc',
};

function resolveIccPath(name) {
    const filename = ICC_PROFILE_MAP[name || 'iso_coated_v3'];
    return filename ? path.join(ICC_DIR, filename) : null;
}

class AutofixExecutionEngine {
    constructor(config = {}) {
        this.config = config;
        this.pdfFixEngine = new PdfFixEngine();
        // Technical mapping of finding codes to engine methods
        this.fixStrategies = {
            [FindingCodes.GEOM_BLEED_MISSING]: 'applyBleed',
            [FindingCodes.GEOM_BLEED_INSUFFICIENT]: 'applyBleed',
            [FindingCodes.GEOM_TRIMBOX_MISSING]: 'rebuildTrimBox',
            [FindingCodes.GEOM_TRIMBOX_INVALID]: 'rebuildTrimBox',
            [FindingCodes.GEOM_TRIMBOX_OUTSIDE_MEDIABOX]: 'rebuildTrimBox',
            'TRIMBOX_MISSING': 'rebuildTrimBox',
            'IND_GEOM_003': 'rebuildTrimBox',
            'TRIM_BOX_ANOMALY': 'rebuildTrimBox',
            'APPLY_BLEED': 'applyBleed',
            'ADD_BLEED': 'applyBleed',
            'REBUILD_TRIMBOX': 'rebuildTrimBox',
            'CONVERT_CMYK': 'applyCmyk',
            'CONVERT_TO_CMYK': 'applyCmyk',
            'INJECT_OUTPUT_INTENT': 'injectOutputIntent',
            'FLATTEN_PDF': 'flattenPdf',
            'NO_ACTION': 'noop'
        };
    }

    /**
     * Higher-level fix execution (Standardized for CLI/Monolith).
     */
    async executeFix(paramsObj) {
        const { input_path, output_path, fix_hint } = paramsObj;
        const { PDFDocument, PDFName } = require('pdf-lib');
        
        const fixId = paramsObj.fix_id || paramsObj.jobId || `fix_${Date.now()}`;
        const issueCodes = Array.isArray(paramsObj.issue_codes) ? paramsObj.issue_codes : [fix_hint || 'UNKNOWN'];

        // MANDATORY RULE 1: Si el fix no está reconocido, devolver error explícito
        const method = this.fixStrategies[fix_hint];
        if (!method) {
            console.log(`[AUTOFIX-ENGINE] executeFix: Unrecognized fix hint '${fix_hint}', returning FIX_UNSUPPORTED.`);
            return {
                ok: false,
                status: 'FIX_UNSUPPORTED',
                error: 'NO_SAFE_FIX_AVAILABLE',
                fix_id: fixId,
                input_issue_codes: issueCodes,
                strategy: fix_hint || 'UNKNOWN',
                applied: false,
                modified: false,
                output_path: null,
                warnings: ['Requested fix strategy is not recognized or supported.'],
                verification_status: 'FAILED',
                // legacy compatibility fields:
                noopFix: false,
                fixApplied: false,
                rewritten: false,
                fixedPath: null,
                findings: [],
                artifacts: {},
                repairs: [{
                    code: fix_hint || 'UNKNOWN',
                    status: 'UNSUPPORTED',
                    reason: 'Requested fix strategy is not recognized or supported.',
                    destructiveFixRisk: 'LOW',
                    requires_human_review: true
                }]
            };
        }
        
        // 1. Technical No-Op Detection (Selective)
        if (fix_hint === 'REBUILD_TRIMBOX' || fix_hint === 'NO_ACTION') {
            try {
                const bytes = await fs.readFile(input_path);
                const pdfDoc = await PDFDocument.load(bytes);
                const pages = pdfDoc.getPages();
                let allValid = fix_hint === 'NO_ACTION';

                if (!allValid) {
                    allValid = true;
                    for (const page of pages) {
                        const trimBox = page.node.lookup(PDFName.of('TrimBox'));
                        const mediaBox = page.node.lookup(PDFName.of('MediaBox'));
                        if (!trimBox || !mediaBox) { allValid = false; break; }
                        
                        const trimArray = trimBox.asArray().map(v => v.asNumber());
                        const mediaArray = mediaBox.asArray().map(v => v.asNumber());
                        const width = trimArray[2] - trimArray[0];
                        const height = trimArray[3] - trimArray[1];
                        const isFinite = trimArray.every(n => Number.isFinite(n));
                        const isInside = trimArray[0] >= mediaArray[0] && trimArray[1] >= mediaArray[1] &&
                                        trimArray[2] <= mediaArray[2] && trimArray[3] <= mediaArray[3];

                        if (!isFinite || width <= 0 || height <= 0 || !isInside) { allValid = false; break; }
                    }
                }

                if (allValid) {
                    console.log(`[ENGINE][AUTOFIX] No-op detected: Document already compliant or copied without changes.`);
                    if (output_path && input_path !== output_path) {
                        try {
                            await fs.copy(input_path, output_path);
                        } catch (err) {
                            console.warn(`[AUTOFIX-ENGINE] Failed to copy unmodified source: ${err.message}`);
                        }
                    }
                    const finalPath = (output_path && input_path !== output_path && await fs.pathExists(output_path)) ? output_path : input_path;

                    return {
                        ok: false, // MANDATORY RULE 3: Nunca devolver ok: true si no se ha modificado realmente el PDF
                        status: 'NO_CHANGE', // MANDATORY RULE 5: status:NO_CHANGE
                        fix_id: fixId,
                        input_issue_codes: issueCodes,
                        strategy: fix_hint,
                        applied: false, // MANDATORY RULE 5: applied:false
                        modified: false, // MANDATORY RULE 5: modified:false
                        output_path: finalPath,
                        warnings: ['Document copied without modification.'],
                        verification_status: 'VERIFIED',
                        // legacy compatibility fields:
                        noopFix: true,
                        fixApplied: false,
                        rewritten: false,
                        certificationMode: "CERTIFIED_WITHOUT_MODIFICATION",
                        fixedPath: finalPath,
                        artifacts: {
                            certified_pdf: {
                                source_preserved: true,
                                rewrite: false,
                                path: finalPath,
                                filename: path.basename(finalPath)
                            },
                            fixed_pdf: {
                                path: finalPath,
                                filename: path.basename(finalPath),
                                is_certified_original: true
                            }
                        },
                        findings: [],
                        repairs: [{
                            code: fix_hint || 'UNKNOWN',
                            status: 'SKIPPED',
                            reason: 'Document copied without modification.',
                            destructiveFixRisk: 'LOW',
                            requires_human_review: false
                        }]
                    };
                }
            } catch (err) {
                console.warn(`[AUTOFIX-ENGINE] Pre-fix validation failed, proceeding with fix: ${err.message}`);
            }
        }

        // 2. Technical Execution
        console.log(`[AUTOFIX-ENGINE] executeFix: resolving ${fix_hint} to ${method}`);

        let result;
        if (method === 'rebuildTrimBox') {
            result = await this.pdfFixEngine.rebuildTrimBox(input_path, output_path);
        } else if (method === 'applyBleed') {
            result = await this.pdfFixEngine.applyBleed(input_path, output_path, this.config.minBleedMm || 3, this.config);
        } else if (method === 'applyCmyk') {
            result = await this.pdfFixEngine.applyCmyk(input_path, output_path, this.config.iccPath);
        } else if (method === 'injectOutputIntent') {
            const iccPath = this.config.iccPath || resolveIccPath(this.config.iccProfile || 'iso_coated_v3');
            result = await this.pdfFixEngine.injectOutputIntent(input_path, output_path, iccPath);
        } else {
            result = { success: false, error: `Strategy method ${method} not implemented` };
        }
        
        if (result.success) {
            console.log(`[ENGINE][AUTOFIX][OUTPUT-GENERATED] Successfully generated fixed file: ${output_path}`);
        } else {
            console.log(`[ENGINE][AUTOFIX][NO-OUTPUT] Fix engine failed: ${result.error || 'Unknown error'}`);
        }

        const warnings = result.error ? [result.error] : (result.warnings || []);
        const returnStatus = result.status || (result.success ? 'SUCCESS' : 'FAILURE');

        return { 
            ok: result.success,
            status: returnStatus,
            fix_id: fixId,
            input_issue_codes: issueCodes,
            strategy: result.strategy || fix_hint,
            industrial_quality: result.industrial_quality || 'STANDARD',
            requires_human_review: result.requires_human_review || false,
            bleed_fix_mode: result.bleed_fix_mode || null,
            applied: result.success,
            modified: result.success,
            output_path: result.success ? output_path : null,
            warnings,
            verification_status: result.success ? (result.requires_human_review ? 'HUMAN_REVIEW_REQUIRED' : 'VERIFIED') : 'FAILED',
            // legacy compatibility fields:
            noopFix: false,
            fixApplied: result.success,
            rewritten: result.success,
            fixedPath: result.success ? output_path : null,
            findings: result.findings || [],
            artifacts: result.success ? {
                fixed_pdf: {
                    path: output_path,
                    filename: path.basename(output_path)
                }
            } : {},
            repairs: result.repairs || [{
                code: fix_hint || 'UNKNOWN',
                status: result.success ? 'APPLIED' : 'FAILED',
                strategy: result.strategy || fix_hint,
                reason: result.error,
                destructiveFixRisk: result.destructiveFixRisk || 'LOW',
                requires_human_review: result.requires_human_review || false
            }]
        };
    }

    /**
     * Executes a planned fix step.
     * Agnostic of monolith-specific paths or asset objects.
     */
    async executeStep(findingCode, inputPath, outputPath, options = {}) {
        const method = this.fixStrategies[findingCode];
        if (!method || typeof this.pdfFixEngine[method] !== 'function') {
            return { success: false, error: `No fix strategy for code: ${findingCode}` };
        }

        // Extract technical parameters from options
        const params = this._extractParams(method, options);

        // Security/Concurrency: Ensure unique temporary isolation
        console.log(`[AUTOFIX-ENGINE] Executing ${method} for ${findingCode}`);
        return this.pdfFixEngine[method](inputPath, outputPath, ...params, {
            reqId: options.jobId || `fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        });
    }

    _extractParams(method, options) {
        if (method === 'applyBleed') return [options.bleedMm || 3];
        if (method === 'applyCmyk') return [options.iccPath];
        if (method === 'injectOutputIntent') return [options.iccPath];
        return [];
    }

    /**
     * Determines if a technical finding code is fixable by this engine.
     */
    isFixable(findingCode) {
        return !!this.fixStrategies[findingCode];
    }
}

module.exports = AutofixExecutionEngine;
