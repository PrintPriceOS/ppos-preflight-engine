const PdfFixEngine = require('./PdfFixEngine');
const path = require('path');
const fs = require('fs-extra');
const { normalizeFixId, getFixCapability, isFixImplemented } = require('../fixes/FixRegistry');

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
        
        // Maps fix_id to method name in PdfFixEngine
        this.fixMethods = {
            'REBUILD_TRIMBOX': 'rebuildTrimBox',
            'APPLY_BLEED': 'applyBleed',
            'CONVERT_CMYK': 'applyCmyk',
            'INJECT_OUTPUT_INTENT': 'injectOutputIntent',
            'STRIP_JAVASCRIPT': 'stripJavascript',
            'FLATTEN_ANNOTATIONS': 'flattenAnnotations',
            'FLATTEN_FORMS': 'flattenForms',
            'REBUILD_XREF': 'rebuildXref',
            'FLATTEN_TRANSPARENCY': 'flattenTransparency',
            'FLATTEN_OVERPRINT': 'flattenOverprint',
            'EMBED_FONTS': 'embedFonts',
            'VALIDATE_PDFX': 'validatePdfX',
            'GENERATE_PDFX': 'generatePdfX',
            'DETECT_TOTAL_INK_COVERAGE': 'detectTotalInkCoverage',
            'MAP_RICH_BLACK_TEXT_TO_K_ONLY': 'mapRichBlackTextToKOnly',
            'MAP_REGISTRATION_COLOR_TO_BLACK': 'mapRegistrationColorToBlack',
            'OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION': 'optimizeExcessiveImageResolution',
            'VISUAL_BLEED_EXTENSION': 'visualBleedExtension'
        };
    }

    /**
     * Higher-level fix execution (Standardized for CLI/Monolith).
     */
    async executeFix(paramsObj) {
        const { input_path, output_path, fix_hint } = paramsObj;
        const fixId = normalizeFixId(fix_hint || paramsObj.fix_id);
        const capability = getFixCapability(fixId);
        
        // Contract setup
        const payload = {
            fix_id: fixId,
            detected: true,
            planned: paramsObj.planned !== false, // Default to true if executeFix is called directly
            executable: capability ? capability.autofixable : false,
            applied: false,
            skipped: false,
            failed: false,
            status: "PENDING",
            risk_level: capability ? capability.risk_level : "HIGH",
            requires_human_review: capability ? capability.requires_human_review : true,
            before_state: {},
            after_state: {},
            evidence: {},
            toolchain: capability ? capability.toolchain : [],
            message: ""
        };

        if (!capability) {
            console.log(`[AUTOFIX-ENGINE] executeFix: Unrecognized fix hint '${fix_hint}', returning FIX_UNSUPPORTED.`);
            payload.skipped = true;
            payload.status = "SKIPPED_UNSUPPORTED";
            payload.skip_reason = "UNKNOWN_FIX_CAPABILITY";
            payload.message = "Requested fix strategy is not recognized or supported.";
            
            return {
                ...payload,
                ok: false,
                output_path: null,
                warnings: [payload.message],
                verification_status: 'FAILED',
                // legacy
                noopFix: false,
                fixApplied: false,
                rewritten: false,
                fixedPath: null,
                artifacts: {}
            };
        }

        if (!capability.implemented) {
            console.log(`[AUTOFIX-ENGINE] executeFix: Fix '${fixId}' is scaffolded but not implemented.`);
            payload.skipped = true;
            payload.status = "SKIPPED_UNSUPPORTED";
            payload.skip_reason = "FIX_NOT_IMPLEMENTED";
            payload.message = capability.customer_message;
            payload.evidence = { implemented: false };
            payload.executable = false;

            return {
                ...payload,
                ok: false,
                output_path: null,
                warnings: [payload.message],
                verification_status: 'FAILED',
                // legacy
                noopFix: false,
                fixApplied: false,
                rewritten: false,
                fixedPath: null,
                artifacts: {}
            };
        }

        const methodName = this.fixMethods[fixId];
        if (!methodName || typeof this.pdfFixEngine[methodName] !== 'function') {
             console.log(`[AUTOFIX-ENGINE] executeFix: Method mapping missing for '${fixId}'.`);
             payload.failed = true;
             payload.status = "FAILED";
             payload.error_code = "METHOD_MISSING";
             payload.error_message = `Fix engine method missing for ${fixId}`;
             
             return {
                 ...payload,
                 ok: false,
                 output_path: null,
                 warnings: [payload.error_message],
                 verification_status: 'FAILED'
             };
        }

        console.log(`[AUTOFIX-ENGINE] executeFix: resolving ${fixId} to ${methodName}`);

        try {
            let result;
            const methodParams = this._extractParams(methodName, this.config);
            
            // Execute method from PdfFixEngine
            if (methodParams.length > 0) {
                 result = await this.pdfFixEngine[methodName](input_path, output_path, ...methodParams, this.config);
            } else {
                 result = await this.pdfFixEngine[methodName](input_path, output_path, this.config);
            }

            // Map result to contract
            if (result.success || result.ok) {
                 payload.applied = true;
                 payload.status = "APPLIED";
                 payload.message = result.message || capability.customer_message;
                 payload.evidence = result.evidence || {};
                 payload.before_state = result.before_state || {};
                 payload.after_state = result.after_state || {};
                 
                 // Update dynamic risk or review requirement from result
                 if (result.requires_human_review !== undefined) {
                     payload.requires_human_review = result.requires_human_review;
                 }
                 if (result.risk_level) {
                     payload.risk_level = result.risk_level;
                 }
                 
                 if (result.status === 'NO_CHANGE') {
                      payload.applied = false;
                      payload.skipped = true;
                      payload.status = "NO_CHANGE";
                 }
            } else {
                 payload.failed = true;
                 payload.status = result.status || "FAILED";
                 payload.error_code = result.error_code || "EXECUTION_ERROR";
                 payload.error_message = result.error || "Unknown execution error";
                 payload.evidence = result.evidence || {};
            }

            const warnings = result.error ? [result.error] : (result.warnings || []);
            const isDestructive = payload.requires_human_review || payload.risk_level === 'HIGH' || payload.risk_level === 'CRITICAL';
            
            const artifacts = {};
            if (payload.applied && output_path) {
                artifacts.fixed_pdf = {
                    path: output_path,
                    filename: path.basename(output_path)
                };
                if (isDestructive) {
                    artifacts.review_pdf = {
                        path: output_path,
                        filename: path.basename(output_path)
                    };
                } else {
                    artifacts.certified_pdf = {
                        path: output_path,
                        filename: path.basename(output_path)
                    };
                }
            }

            return {
                ...payload,
                ok: payload.applied, // Use applied for ok
                industrial_quality: result.industrial_quality || 'STANDARD',
                production_certified: !isDestructive && payload.applied,
                output_path: payload.applied ? output_path : (result.output_path || null),
                warnings,
                verification_status: payload.applied ? (isDestructive ? 'HUMAN_REVIEW_REQUIRED' : 'VERIFIED') : 'FAILED',
                // legacy
                noopFix: payload.status === 'NO_CHANGE',
                fixApplied: payload.applied,
                rewritten: payload.applied,
                fixedPath: payload.applied ? output_path : null,
                findings: result.findings || [],
                artifacts
            };

        } catch (error) {
             console.error(`[AUTOFIX-ENGINE] Exception during ${methodName}:`, error);
             payload.failed = true;
             payload.status = "FAILED";
             payload.error_code = "EXCEPTION";
             payload.error_message = error.message;
             
             return {
                 ...payload,
                 ok: false,
                 output_path: null,
                 warnings: [error.message],
                 verification_status: 'FAILED'
             };
        }
    }

    /**
     * Executes a planned fix step.
     */
    async executeStep(findingCode, inputPath, outputPath, options = {}) {
        const fixId = normalizeFixId(findingCode);
        return this.executeFix({
            input_path: inputPath,
            output_path: outputPath,
            fix_hint: fixId,
            jobId: options.jobId
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
        const fixId = normalizeFixId(findingCode);
        return isFixImplemented(fixId);
    }
}

module.exports = AutofixExecutionEngine;
