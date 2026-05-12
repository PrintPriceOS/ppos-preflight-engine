/**
 * HeuristicAnalyzer
 * 
 * Implements intent detection and structural risk heuristics.
 * Source: Refactored from heuristicService.js
 */
class HeuristicAnalyzer {
    async analyze(filePath, options = {}) {
        const metadata = options.metadata || { pages: 0, fonts: [] };
        
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

        // 2. Vector Text Risk
        if (metadata.pages > 0 && Array.isArray(metadata.fonts) && metadata.fonts.length === 0) {
            findings.push({
                id: 'HEURISTIC_TEXT_OUTLINED',
                code: 'HEURISTIC_TEXT_OUTLINED',
                page: 1,
                severity: 'warning',
                analyzer: 'HeuristicAnalyzer',
                confidence: 0.98,
                message: 'Text Possibly Converted to Outlines'
            });
        }

        return { findings };
    }
}

module.exports = HeuristicAnalyzer;
