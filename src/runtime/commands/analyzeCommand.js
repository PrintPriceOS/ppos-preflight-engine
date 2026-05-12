/**
 * AnalyzeCommand
 * 
 * Shared application logic for PDF analysis.
 * Classification: SHARED_RUNTIME_COMMAND
 * 
 * Invoked by CLI, HTTP, and Worker surfaces.
 * Respects Industrial DTO contracts.
 */
const {
    createStandardEngine
} = require('../../../index');

class AnalyzeCommand {
    /**
     * Executes the analysis orchestration.
     * @param {string} input - Absolute path to the PDF.
     * @param {object} config - Industrial configuration object.
     * @returns {Promise<object>} - Standardized AnalyzeResult DTO.
     */
    static async run(input, config) {
        const requestId = `req_${Date.now()}`;
        console.log(`[RUNTIME][COMMAND] Starting Analyze for ${input} [ID: ${requestId}]`);

        try {
            const engine = createStandardEngine();
            const result = await engine.analyzePdf(input, { ...config, requestId });
            
            console.log(`[RUNTIME][COMMAND] Analyze Success [ID: ${requestId}]: ${result.issues?.length || 0} issues normalized.`);

            return result;
        } catch (err) {
            console.error(`[RUNTIME][COMMAND] Analyze Failed [ID: ${requestId}]: ${err.message}`);
            throw err;
        }
    }
}

module.exports = AnalyzeCommand;
