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
                message: 'Document classified as Book/Catalog based on page count'
            });
        }

        // 2. Vector Text Risk
        if (metadata.pages > 0 && (!metadata.fonts || metadata.fonts.length === 0)) {
            findings.push({
                id: 'HEURISTIC_TEXT_OUTLINED',
                severity: 'warning',
                message: 'No fonts detected. Text may be converted to outlines/paths.'
            });
        }

        return { findings };
    }
}

module.exports = HeuristicAnalyzer;
