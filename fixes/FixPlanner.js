/**
 * FixPlanner
 * 
 * Maps findings to technical fix strategies.
 * Source: Refactored from autofixRegistry.js
 */
class FixPlanner {
    constructor() {
        this.strategyMap = {
            'BLEED_MISSING': 'ADD_BLEED',
            'COLOR_PROFILE_MISMATCH': 'CONVERT_CMYK',
            'TRANSPARENCY_PRESENT': 'FLATTEN_PDF'
        };
    }

    plan(issues) {
        const plan = [];
        issues.forEach(issue => {
            const strategy = this.strategyMap[issue.id];
            if (strategy) {
                plan.push({
                    issue_id: issue.id,
                    strategy,
                    status: 'PENDING'
                });
            }
        });
        return plan;
    }
}

module.exports = FixPlanner;
