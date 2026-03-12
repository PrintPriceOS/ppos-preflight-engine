const PdfFixEngine = require('./PdfFixEngine');
const path = require('path');
const fs = require('fs-extra');
const { CODES: FindingCodes } = require('../interpretation/industrialFindingCodes');

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
            [FindingCodes.GEOM_BLEED_INSUFFICIENT]: 'applyBleed'
        };
    }

    /**
     * Higher-level fix execution (Standardized for CLI/Monolith).
     */
    async executeFix({ input_path, output_path, fix_hint }) {
        // Simple No-Op logic for mock baseline
        // In a real scenario, this would check techResult findings
        if (fix_hint === 'NO_ACTION') {
            return { success: false, findings: [] };
        }

        // Default to successful fix for mock reliability
        const result = await this.pdfFixEngine.applyBleed(input_path, output_path, this.config.minBleedMm || 3);
        return { success: result.success, findings: result.findings || [] };
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
