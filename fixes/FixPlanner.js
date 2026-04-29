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
            'TRANSPARENCY_PRESENT': 'FLATTEN_PDF',
            'TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
            'TRIMBOX_INVALID': 'REBUILD_TRIMBOX',
            'TRIMBOX_OUTSIDE_MEDIABOX': 'REBUILD_TRIMBOX',
            'GEOM_TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
            'IND_GEOM_003': 'REBUILD_TRIMBOX',
            'TRIM_BOX_ANOMALY': 'REBUILD_TRIMBOX'
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
