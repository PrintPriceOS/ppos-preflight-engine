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
    PdfTechnicalEngine,
    GeometryAuditEngine
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
            // 1. Technical Execution (Kernel)
            const technicalEngine = new PdfTechnicalEngine();
            const techResult = await technicalEngine.analyze(input);

            // 2. Technical Interpretation (Kernel)
            const geometryEngine = new GeometryAuditEngine(config);
            const findings = [];

            if (techResult.geometry) {
                const bleedFinding = geometryEngine.auditBleed(techResult.geometry);
                if (bleedFinding.code) findings.push(bleedFinding);

                const classFinding = geometryEngine.classifyDocument(techResult.geometry, techResult.info?.pages || 1);
                findings.push(classFinding);
            }

            console.log(`[RUNTIME][COMMAND] Analyze Success [ID: ${requestId}]: ${findings.length} findings.`);

            return {
                ok: techResult.ok,
                status: techResult.status,
                findings,
                wrapper_metadata: {
                    request_id: requestId,
                    timestamp: new Date().toISOString(),
                    pages: techResult.info?.pages || 0,
                    size_bytes: techResult.info?.size || 0
                }
            };
        } catch (err) {
            console.error(`[RUNTIME][COMMAND] Analyze Failed [ID: ${requestId}]: ${err.message}`);
            throw err;
        }
    }
}

module.exports = AnalyzeCommand;
