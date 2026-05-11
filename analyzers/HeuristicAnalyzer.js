/**
 * HeuristicAnalyzer
 * 
 * Implements intent detection and structural risk heuristics.
 * Source: Refactored from heuristicService.js
 */
class HeuristicAnalyzer {
    async analyze(filePath, options = {}) {
        // In a real implementation, we would probe the PDF for metadata
        // For now, we use the passed metadata if available or mock
        const metadata = options.metadata || { pages: 0, fonts: [] };
        
        const findings = [];
        
        // 1. Classification (Intent)
        if (metadata.pages >= 48) {
            findings.push({
                id: 'INTENT_BOOK',
                severity: 'info',
                message: 'Book / Catalog Intent Detected'
            });
        }

        // 2. Vector Text Risk
        if (metadata.pages > 0 && Array.isArray(metadata.fonts) && metadata.fonts.length === 0) {
            findings.push({
                id: 'HEURISTIC_TEXT_OUTLINED',
                severity: 'warning',
                message: 'Text Possibly Converted to Outlines'
            });
        }

        return { findings };
    }
}

module.exports = HeuristicAnalyzer;
