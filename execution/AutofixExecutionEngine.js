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
            'TRIM_BOX_ANOMALY': 'rebuildTrimBox'
        };
    }

    /**
     * Higher-level fix execution (Standardized for CLI/Monolith).
     */
    async executeFix({ input_path, output_path, fix_hint }) {
        const { PDFDocument, PDFName } = require('pdf-lib');
        
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
                    console.log(`[ENGINE][AUTOFIX] No-op detected: Document already compliant.`);
                    return {
                        ok: true,
                        status: 'SUCCESS',
                        noopFix: true,
                        fixApplied: false,
                        rewritten: false,
                        certificationMode: "CERTIFIED_WITHOUT_MODIFICATION",
                        fixedPath: input_path, // Fallback to input
                        artifacts: {
                            certified_pdf: {
                                source_preserved: true,
                                rewrite: false,
                                path: input_path,
                                filename: path.basename(input_path)
                            },
                            // Add fixed_pdf as alias to prevent frontend hangs if it strictly expects it
                            fixed_pdf: {
                                path: input_path,
                                filename: path.basename(input_path),
                                is_certified_original: true
                            }
                        },
                        findings: []
                    };
                }
            } catch (err) {
                console.warn(`[AUTOFIX-ENGINE] Pre-fix validation failed, proceeding with fix: ${err.message}`);
            }
        }

        // 2. Technical Execution
        const method = this.fixStrategies[fix_hint] || 'applyBleed';
        console.log(`[AUTOFIX-ENGINE] executeFix: resolving ${fix_hint} to ${method}`);

        let result;
        if (method === 'rebuildTrimBox') {
            result = await this.pdfFixEngine.rebuildTrimBox(input_path, output_path);
        } else if (method === 'applyBleed') {
            result = await this.pdfFixEngine.applyBleed(input_path, output_path, this.config.minBleedMm || 3);
        } else {
            result = await this.pdfFixEngine.applyBleed(input_path, output_path, this.config.minBleedMm || 3);
        }
        
        if (result.success) {
            console.log(`[ENGINE][AUTOFIX][OUTPUT-GENERATED] Successfully generated fixed file: ${output_path}`);
        } else {
            console.log(`[ENGINE][AUTOFIX][NO-OUTPUT] Fix engine failed: ${result.error || 'Unknown error'}`);
        }

        return { 
            ok: result.success,
            status: result.success ? 'SUCCESS' : 'FAILURE',
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
            } : {}
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
