/**
 * @ppos/preflight-engine CLI Command Handlers
 * 
 * Orchestrates engine execution by delegating to the Shared Command Layer.
 * Classification: RUNTIME_CLI_ADAPTER
 */
const fs = require('fs-extra');
const AnalyzeCommand = require('../runtime/commands/analyzeCommand');
const AutofixCommand = require('../runtime/commands/autofixCommand');

class CommandHandler {
    static async execute(args) {
        const { command, input, options } = args;
        const config = await this._resolveConfig(options);
        const isVerbose = options.verbose;

        if (isVerbose) {
            console.error(`[CLI][DEBUG] Resolved Config: ${JSON.stringify(config)}`);
            console.error(`[CLI][DEBUG] Executing command: ${command} on ${input}`);
        }

        if (command === 'analyze') {
            return this._handleAnalyze(input, config, options);
        } else if (command === 'autofix') {
            return this._handleAutofix(input, config, options);
        } else {
            throw new Error(`Unknown command: ${command}`);
        }
    }

    static async _handleAnalyze(input, config, options) {
        if (!await fs.pathExists(input)) {
            return { exitCode: 2, error: 'INPUT_ERROR', message: `Input file not found: ${input}` };
        }

        try {
            const result = await AnalyzeCommand.run(input, config);

            return {
                exitCode: result.findings.filter(f => f.code && f.code.startsWith('IND_GEOM')).length > 0 ? 1 : 0,
                data: {
                    operation: 'analyze',
                    file: input,
                    wrapper_metadata: result.wrapper_metadata,
                    engine_result: {
                        ok: result.ok,
                        status: result.status,
                        findings: result.findings
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
            const result = await AutofixCommand.run(input, output, config, fix);

            const status = result.wrapper_metadata.status;
            const reason = result.success ? 'FIX_APPLIED' : 'DOCUMENT_ALREADY_COMPLIANT';

            if (!options.json) {
                if (result.success) {
                    console.log(`[SUCCESS] Fix applied to ${output}`);
                } else {
                    console.log(`[INFO] Document already compliant, no action needed.`);
                }
            }

            return {
                exitCode: 0,
                data: {
                    operation: 'autofix',
                    status,
                    file: input,
                    output: result.success ? output : null,
                    reason,
                    wrapper_metadata: result.wrapper_metadata,
                    engine_result: {
                        ok: result.success,
                        findings: result.findings
                    }
                }
            };
        } catch (err) {
            return { exitCode: 4, error: 'ENGINE_ERROR', message: err.message };
        }
    }

    static async _resolveConfig(options) {
        let config = {
            minBleedMm: 3.0,
            safeAreaMm: 5.0,
            standardSpinePerSheetMm: 0.1
        };

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

        if (process.env.PPOS_MIN_BLEED) config.minBleedMm = parseFloat(process.env.PPOS_MIN_BLEED);
        if (process.env.PPOS_SAFE_AREA) config.safeAreaMm = parseFloat(process.env.PPOS_SAFE_AREA);

        return config;
    }
}

module.exports = { CommandHandler };
