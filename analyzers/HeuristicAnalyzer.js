/**
 * HeuristicAnalyzer
 * 
 * Implements intent detection and structural risk heuristics.
 * Source: Refactored from heuristicService.js
 */
class HeuristicAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || {};

        const findings = [];

        // 1. Classification (Intent)
        if (metadata.pages >= 48) {
            findings.push({
                id: 'INTENT_BOOK',
                code: 'INTENT_BOOK',
                page: 1,
                severity: 'info',
                analyzer: 'HeuristicAnalyzer',
                confidence: 0.98,
                message: 'Book / Catalog Intent Detected'
            });
        }

        // 2. Vector Text Risk — only fire when pdffonts probe ran and returned no font data rows.
        // pdffonts output structure: header row + dashes separator + 0..N data rows.
        // "No fonts" = at most 2 non-blank lines (header + dashes), meaning no data rows follow.
        const pdffontOutput = metadata.toolOutputs?.pdffonts;
        if (metadata.pages > 0 && pdffontOutput) {
            const fontLines = pdffontOutput.split('\n').map(l => l.trim()).filter(Boolean);
            const hasNoFonts = fontLines.length <= 2 &&
                fontLines.some(l => /^-+/.test(l) || /^name\s/i.test(l));
            if (hasNoFonts) {
                findings.push({
                    id: 'HEURISTIC_TEXT_OUTLINED',
                    code: 'HEURISTIC_TEXT_OUTLINED',
                    page: 1,
                    severity: 'warning',
                    analyzer: 'HeuristicAnalyzer',
                    confidence: 0.85,
                    message: 'Text Possibly Converted to Outlines (pdffonts reports no embedded fonts)',
                    evidence: {
                        tool: 'pdffonts',
                        source: 'CLI_PROBE',
                        page: 1,
                        confidence: 0.85,
                        raw: `pdffonts: ${fontLines.slice(0, 2).join(' | ')} — no data rows`
                    }
                });
            }
        }

        return { findings };
    }
}

module.exports = HeuristicAnalyzer;
