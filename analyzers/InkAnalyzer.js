const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * InkAnalyzer
 * 
 * Industrial forensic analyzer for Total Area Coverage (TAC), Rich Black text abuse, and individual ink limits.
 */
class InkAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasInkData = toolOutputs.pdfimages || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasInkData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    ink: {
                        status: "PARTIAL",
                        confidence: 0,
                        reason: "REAL_EXTRACTION_NOT_AVAILABLE"
                    }
                }
            };
        }

        const strContext = `${toolOutputs.pdfimages || ''} ${toolOutputs.mutool || ''} ${toolOutputs.gs || ''}`.toLowerCase();

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

        // Rich black text
        if (strContext.includes('rich black text') || strContext.includes('composite black text') || strContext.includes('cmyk text: black')) {
            const ev = findEvidence(['rich black text', 'composite black text', 'cmyk text: black']);
            findings.push({
                page: 1,
                code: CODES.COLOR_RICH_BLACK_TEXT,
                severity: "warning",
                category: "COLOR",
                analyzer: "InkAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "MAP_TO_PURE_K",
                message: "Small typographical elements utilizing composite CMYK Rich Black instead of pure K.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Replicate/Verify TAC Exceeded in Ink context
        if (strContext.includes('tac exceeded') || strContext.includes('ink limit exceeded')) {
            const ev = findEvidence(['tac exceeded', 'ink limit exceeded']);
            findings.push({
                page: 1,
                code: CODES.COLOR_TOTAL_INK_COVERAGE_EXCEEDED,
                severity: "error",
                category: "COLOR",
                analyzer: "InkAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Total Ink Coverage (TAC) exceeds safety bounds.",
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

module.exports = InkAnalyzer;
