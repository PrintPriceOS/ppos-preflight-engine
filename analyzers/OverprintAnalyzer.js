const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * OverprintAnalyzer
 * 
 * Industrial forensic analyzer for overprint fills, strokes, and knockout conflicts.
 */
class OverprintAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasOpData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasOpData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    overprint: {
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

        // Overprint detected (Eliminated filename heuristics)
        const hasOverprint = strContext.includes('overprint') || strContext.includes('/op true');
        if (hasOverprint) {
            const ev = findEvidence(['overprint', '/op true']);
            findings.push({
                page: 1,
                code: CODES.OVERPRINT_DETECTED,
                severity: "warning",
                category: "OVERPRINT",
                analyzer: "OverprintAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Overprint fill or stroke enabled.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Knockout conflict
        const hasKnockout = strContext.includes('knockout conflict') || strContext.includes('/opm 1');
        if (hasKnockout) {
            const ev = findEvidence(['knockout conflict', '/opm 1']);
            findings.push({
                page: 1,
                code: CODES.OVERPRINT_KNOCKOUT_CONFLICT,
                severity: "error",
                category: "OVERPRINT",
                analyzer: "OverprintAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "FLATTEN_OVERPRINT",
                message: "Overprint / Knockout transparency conflict detected.",
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

module.exports = OverprintAnalyzer;
