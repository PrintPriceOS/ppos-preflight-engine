/**
 * @ppos/preflight-engine CLI Command Handlers
 * 
 * Orchestrates engine execution based on parsed arguments and config.
 */
const fs = require('fs-extra');
const path = require('path');
const {
    PdfTechnicalEngine,
    GeometryAuditEngine,
    AutofixExecutionEngine
} = require('../../index');

class CommandHandler {
    static async execute(args) {
        const { command, input, options } = args;
        const config = await this._resolveConfig(options);
        const isVerbose = options.verbose;

        if (isVerbose) {
            console.error(`[CLI][DEBUG] Resolved Config: ${JSON.stringify(config)}`);
            console.error(`[CLI][DEBUG] Executing command: ${command} on ${input}`);
        }

        switch (command) {
            case 'analyze':
                return this._handleAnalyze(input, config, options);
            case 'autofix':
                return this._handleAutofix(input, config, options);
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    static async _handleAnalyze(input, config, options) {
        if (!await fs.pathExists(input)) {
            return { exitCode: 2, error: 'INPUT_ERROR', message: `Input file not found: ${input}` };
        }

        try {
            // 1. Technical Execution
            const technicalEngine = new PdfTechnicalEngine();
            const techResult = await technicalEngine.analyze(input);

            // 2. Technical Interpretation
            const geometryEngine = new GeometryAuditEngine(config);
            const findings = [];

            if (techResult.geometry) {
                const bleedFinding = geometryEngine.auditBleed(techResult.geometry);
                if (bleedFinding.code) findings.push(bleedFinding);

                const classFinding = geometryEngine.classifyDocument(techResult.geometry, techResult.info?.pages || 1);
                findings.push(classFinding);
            }

            return {
                exitCode: findings.filter(f => f.code && f.code.startsWith('IND_GEOM')).length > 0 ? 1 : 0,
                data: {
                    operation: 'analyze',
                    file: input,
                    engine_result: {
                        ok: techResult.ok,
                        status: techResult.status,
                        findings
                    }
                }
            };
        } catch (err) {
            return { exitCode: 4, error: 'ENGINE_ERROR', message: err.message };
        }
    }

    static async _handleAutofix(input, config, options) {
        const { output, fix } = options;
        if (!await fs.pathExists(input)) {
            return { exitCode: 2, error: 'INPUT_ERROR', message: `Input file not found: ${input}` };
        }

        try {
            const autofixEngine = new AutofixExecutionEngine(config);
            const result = await autofixEngine.executeFix({
                input_path: input,
                output_path: output,
                fix_hint: fix
            });

            const status = result.success ? 'SUCCESS' : 'NO_ACTION_TAKEN';

            return {
                exitCode: 0, // No-op and Success both exit 0 per policy
                data: {
                    operation: 'autofix',
                    status,
                    file: input,
                    output: result.success ? output : null,
                    reason: result.success ? 'FIX_APPLIED' : 'DOCUMENT_ALREADY_COMPLIANT',
                    engine_result: {
                        ok: result.success,
                        findings: result.findings || []
                    }
                }
            };
        } catch (err) {
            return { exitCode: 4, error: 'ENGINE_ERROR', message: err.message };
        }
    }

    static async _resolveConfig(options) {
        // Defaults
        let config = {
            minBleedMm: 3.0,
            safeAreaMm: 5.0,
            standardSpinePerSheetMm: 0.1
        };

        // Load from file if provided
        if (options.config) {
            if (await fs.pathExists(options.config)) {
                try {
                    const fileConfig = await fs.readJson(options.config);
                    config = { ...config, ...fileConfig };
                } catch (err) {
                    throw new Error(`CONFIG_ERROR: Invalid JSON in ${options.config}`);
                }
            } else {
                throw new Error(`CONFIG_ERROR: Config file not found: ${options.config}`);
            }
        }

        // Environment Variables (Precedence over File)
        if (process.env.PPOS_MIN_BLEED) config.minBleedMm = parseFloat(process.env.PPOS_MIN_BLEED);
        if (process.env.PPOS_SAFE_AREA) config.safeAreaMm = parseFloat(process.env.PPOS_SAFE_AREA);

        // CLI Flags (Highest Precedence - Example specific flags if we had them)
        // For now we only support the --config flag, but individual flags would go here.

        return config;
    }
}

module.exports = { CommandHandler };
