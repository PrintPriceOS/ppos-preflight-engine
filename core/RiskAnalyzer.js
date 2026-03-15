/**
 * RiskAnalyzer
 * 
 * Scores the document based on technical findings and industrial context.
 * Source: Refactored from heuristicService & reportCore.
 */
class RiskAnalyzer {
    /**
     * Calculates an industrial risk score and level.
     */
    score(issues, metadata) {
        let score = 0;
        
        issues.forEach(issue => {
            const severity = (issue.severity || 'low').toLowerCase();
            if (severity === 'critical' || severity === 'error') score += 30;
            if (severity === 'warning') score += 10;
            if (severity === 'info') score += 2;
        });

        // Heuristic: Multi-page risks (from heuristicService)
        if (metadata.pageCount >= 48) score += 5; // Long doc complexity
        if (metadata.fonts === 0 && metadata.pageCount > 0) score += 15; // Vector text risk

        const normalizedScore = Math.min(100, score);
        
        return {
            score: normalizedScore,
            level: this.determineLevel(normalizedScore),
            warnings: issues.length,
            criticals: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length
        };
    }

    determineLevel(score) {
        if (score >= 70) return 'CRITICAL';
        if (score >= 40) return 'HIGH';
        if (score >= 15) return 'MEDIUM';
        return 'LOW';
    }
}

module.exports = RiskAnalyzer;
