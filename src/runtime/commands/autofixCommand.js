/**
 * AutofixCommand
 * 
 * Shared application logic for PDF autofixing.
 * Classification: SHARED_RUNTIME_COMMAND
 * 
 * Invoked by CLI, HTTP, and Worker surfaces.
 */
const {
    AutofixExecutionEngine
} = require('../../../index');

class AutofixCommand {
    /**
     * Executes the autofix orchestration.
     * @param {string} input - Input PDF path.
     * @param {string} output - Output PDF path.
     * @param {object} config - Industrial config.
     * @param {string} fixHint - Optional hint (e.g., NO_ACTION for tests).
     * @returns {Promise<object>} - Standardized AutofixResult DTO.
     */
    static async run(input, output, config, fixHint) {
        const jobId = `job_${Date.now()}`;
        console.log(`[RUNTIME][COMMAND] Starting Autofix for ${input} -> ${output} [ID: ${jobId}]`);

        try {
            const autofixEngine = new AutofixExecutionEngine(config);

            const result = await autofixEngine.executeFix({
                input_path: input,
                output_path: output,
                fix_hint: fixHint
            });

            console.log(`[RUNTIME][COMMAND] Autofix Complete [ID: ${jobId}]: Success=${result.success}`);

            return {
                success: result.success,
                findings: result.findings || [],
                wrapper_metadata: {
                    job_id: jobId,
                    status: result.success ? 'SUCCESS' : 'NO_ACTION_TAKEN',
                    timestamp: new Date().toISOString()
                }
            };
        } catch (err) {
            console.error(`[RUNTIME][COMMAND] Autofix Failed [ID: ${jobId}]: ${err.message}`);
            throw err;
        }
    }
}

module.exports = AutofixCommand;
坐
