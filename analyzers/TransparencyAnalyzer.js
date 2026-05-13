const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * TransparencyAnalyzer
 * 
 * Industrial forensic analyzer for live transparency and advanced blend modes.
 */
class TransparencyAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasTransData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasTransData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    transparency: {
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

        // Transparency detected (Eliminated filename heuristics)
        const hasTrans = strContext.includes('transparency') || strContext.includes('ca:') || strContext.includes('/ca ');
        if (hasTrans) {
            const ev = findEvidence(['transparency', 'ca:', '/ca ']);
            findings.push({
                page: 1,
                code: CODES.TRANS_TRANSPARENCY_DETECTED,
                severity: "warning",
                category: "TRANSPARENCY",
                analyzer: "TransparencyAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Live transparency detected in document.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Blend mode detected
        const hasBlend = strContext.includes('blend mode') || strContext.includes('/bm ') || strContext.includes('multiply') || strContext.includes('screen') || strContext.includes('overlay');
        if (hasBlend) {
            const ev = findEvidence(['blend mode', '/bm ', 'multiply', 'screen', 'overlay']);
            findings.push({
                page: 1,
                code: CODES.TRANS_BLEND_MODE_DETECTED,
                severity: "warning",
                category: "TRANSPARENCY",
                analyzer: "TransparencyAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Non-normal blend mode detected.",
                evidence: {
                    tool: ev.tool,
                    source: ev.source,
                    page: 1,
                    confidence: 0.98,
                    raw: ev.raw
                }
            });
        }

        // Soft mask detected
        const hasSoftMask = strContext.includes('soft mask') || strContext.includes('/smask');
        if (hasSoftMask) {
            const ev = findEvidence(['soft mask', '/smask']);
            findings.push({
                page: 1,
                code: CODES.TRANS_SOFT_MASK_DETECTED,
                severity: "warning",
                category: "TRANSPARENCY",
                analyzer: "TransparencyAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Soft mask transparency detected.",
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

module.exports = TransparencyAnalyzer;
