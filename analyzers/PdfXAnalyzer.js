const { CODES } = require('../interpretation/IndustrialFindingCodes');

/**
 * PdfXAnalyzer
 * 
 * Industrial forensic analyzer for validating ISO PDF/X compliance attributes and embedded validation flags.
 */
class PdfXAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};
        const toolOutputs = metadata.toolOutputs || {};
        const findings = [];

        const hasPdfXData = toolOutputs.pdfinfo || toolOutputs.mutool || toolOutputs.gs || metadata.source === 'PDF_LIB';
        if (!hasPdfXData && metadata.analysisIntegrity?.realExtraction === false) {
            return {
                findings: [],
                partial: true,
                status: "PARTIAL",
                metadata: {
                    pdfx: {
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

        // Missing PDF/X conformance marker
        const isPdfX = strContext.includes('pdf/x') || strContext.includes('gts_pdfx') || strContext.includes('pdfxversion');
        if (!isPdfX) {
            findings.push({
                page: 1,
                code: CODES.COMPLIANCE_PDFX_MISSING,
                severity: "info",
                category: "COMPLIANCE",
                analyzer: "PdfXAnalyzer",
                confidence: 0.98,
                fixable: false,
                recommended_fix: null,
                message: "Document does not declare PDF/X compliance standard.",
                evidence: {
                    tool: 'pdfinfo / mutool',
                    source: metadata.source || 'CLI_PROBE',
                    page: 1,
                    confidence: 0.98,
                    raw: 'Absence of GTS_PDFXConformance / GTS_PDFXVersion markers'
                }
            });
        }

        // Invalid PDF/X Condition
        if (strContext.includes('pdf/x invalid') || strContext.includes('compliance error') || strContext.includes('outputcondition mismatch')) {
            const ev = findEvidence(['pdf/x invalid', 'compliance error', 'outputcondition mismatch']);
            findings.push({
                page: 1,
                code: CODES.COMPLIANCE_PDFX_INVALID,
                severity: "error",
                category: "COMPLIANCE",
                analyzer: "PdfXAnalyzer",
                confidence: 0.98,
                fixable: true,
                recommended_fix: "STRIP_PDFX",
                message: "Declared PDF/X compliance markers violate target structural parameters.",
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

module.exports = PdfXAnalyzer;
