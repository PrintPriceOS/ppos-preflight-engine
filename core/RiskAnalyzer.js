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
    score(issues, metadata, options = {}) {
        if (metadata.environmentFailure) {
            return {
                score: null,
                level: 'UNKNOWN',
                scoreBasis: 'ENVIRONMENT_FAILURE',
                warnings: 0,
                criticals: 0
            };
        }

        let score = 0;
        let criticalsOrErrors = 0;
        
        issues.forEach(issue => {
            const severity = (issue.severity || 'low').toLowerCase();
            if (severity === 'critical' || severity === 'error') {
                score += 35;
                criticalsOrErrors++;
            }
            if (severity === 'warning') score += 10;
            if (severity === 'info') score += 2;
        });

        const isOffsetPolicy = options.policy === 'OFFSET_MODERN_COATED_F51' || 
                               options.profile === 'OFFSET_MODERN_COATED_F51' ||
                               options.policy?.includes('OFFSET') ||
                               options.profile?.includes('OFFSET');

        const hasRgb = issues.some(i => i.code === 'IND_COLOR_001' || i.code?.includes('RGB'));
        const missingIcc = issues.some(i => i.code === 'IND_COLOR_002' || i.code === 'IND_COLOR_006' || i.code?.includes('ICC') || i.code?.includes('OutputIntent'));

        if (isOffsetPolicy && hasRgb && missingIcc) {
            score += 50; // Meaningfully ensure it crosses to CRITICAL risk under offset policy
        }

        // Meaningfully ensure any error/critical forces a baseline score of at least 50 (HIGH/CRITICAL risk)
        if (criticalsOrErrors > 0 && score < 50) {
            score = 50;
        }

        // Heuristic: Multi-page risks (from heuristicService)
        if (metadata.pageCount >= 48) score += 5; // Long doc complexity
        if (metadata.fonts === 0 && metadata.pageCount > 0) score += 15; // Vector text risk

        const normalizedScore = Math.min(100, score);
        
        return {
            score: normalizedScore,
            level: this.determineLevel(normalizedScore),
            scoreBasis: 'DOCUMENT_FINDINGS',
            warnings: issues.length,
            criticals: criticalsOrErrors
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
