const PdfFixEngine = require('./PdfFixEngine');
const pdfFixEngine = new PdfFixEngine();
const { CODES: FindingCodes } = require('../interpretation/industrialFindingCodes');

/**
 * AutofixExecutionEngine
 * 
 * Portable execution logic for PDF fixes.
 * Classification: INDUSTRIAL_RUNTIME (Technical Orchestration)
 */
class AutofixExecutionEngine {
    constructor() {
        // Technical mapping of finding codes to engine methods
        this.fixStrategies = {
            [FindingCodes.GEOM_BLEED_MISSING]: 'applyBleed',
            [FindingCodes.GEOM_BLEED_INSUFFICIENT]: 'applyBleed',
            // Future: [FindingCodes.COLOR_MISMATCH]: 'applyCmyk'
        };
    }

    /**
     * Executes a planned fix step.
     * Agnostic of monolith-specific paths or asset objects.
     */
    async executeStep(findingCode, inputPath, outputPath, options = {}) {
        const method = this.fixStrategies[findingCode];
        if (!method || typeof pdfFixEngine[method] !== 'function') {
            return { success: false, error: `No fix strategy for code: ${findingCode}` };
        }

        // Extract technical parameters from options
        const params = this._extractParams(method, options);

        console.log(`[AUTOFIX-ENGINE] Executing ${method} for ${findingCode}`);
        return pdfFixEngine[method](inputPath, outputPath, ...params, { reqId: options.jobId });
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

module.exports = new AutofixExecutionEngine();
