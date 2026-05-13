const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * OutputIntentAnalyzer
 * 
 * Industrial forensic analyzer for PDF OutputIntents, GTS_PDFX targets, and ICC Profile consistency.
 */
class OutputIntentAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasIntentData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasIntentData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    outputIntent: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfinfo || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();

        const findEvidence = (keywords) => {
            for (const [tool, output] of Object.entries(toolOutputs)) {
                if (!output) continue;
                const lower = output.toLowerCase();
                for (const kw of keywords) {
                    if (lower.includes(kw)) {
                        const lines = output.split('\n');
                        const matchingLine = lines.find(l => l.toLowerCase().includes(kw)) || kw;
                        return { tool, source: 'CLI_PROBE', raw: matchingLine.trim() };
                    }
                }
            }
            return { tool: 'composite_probe', source: metadata.source || 'CLI_PROBE', raw: keywords[0] };
        };

        // Missing OutputIntent
        const hasOutputIntent = strContext.includes('outputintent') || strContext.includes('destoutputprofile') || strContext.includes('gts_pdfx');
        if (!hasOutputIntent) {
            findings.push({
                page: 1,
                code: CODES.COLOR_OUTPUT_INTENT_MISSING,
                severity: "warning",
                category: "COLOR",
                analyzer: "OutputIntentAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "INJECT_OUTPUT_INTENT",
                message: "Document lacks an explicit OutputIntent array.",
                evidence: {
                    tool: 'pdfinfo / mutool',
                    source: metadata.source || 'CLI_PROBE',
                    page: 1,
                    confidence: 0.98,
                    raw: 'OutputIntent structure not detected in catalog dictionary'
                }
            });
        }

        // Profile Mismatch
        if (strContext.includes('profile mismatch') || strContext.includes('icc mismatch')) {
            const ev = findEvidence(['profile mismatch', 'icc mismatch']);
            findings.push({
                page: 1,
                code: CODES.COLOR_ICC_PROFILE_MISMATCH,
                severity: "error",
                category: "COLOR",
                analyzer: "OutputIntentAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "CONVERT_CMYK",
                message: "Embedded ICC profile contradicts intended print condition.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        return { findings, status: "SUCCESS" };
    }
}

module.exports = OutputIntentAnalyzer;
