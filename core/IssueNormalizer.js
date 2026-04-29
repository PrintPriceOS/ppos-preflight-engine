/**
 * IssueNormalizer
 * 
 * Standardizes technical findings into canonical codes and severities.
 */
class IssueNormalizer {
    static normalize(findings) {
        return findings.map(f => {
            const rawCode = f.code || f.id;
            const mappedCode = this.mapCode(rawCode);
            
            const fixableGeometry = [
                'TRIMBOX_MISSING',
                'TRIMBOX_INVALID',
                'TRIMBOX_OUTSIDE_MEDIABOX'
            ].includes(mappedCode);
            
            const normalized = {
                id: mappedCode,
                severity: f.severity || (mappedCode.endsWith('_WARNING') ? 'warning' : 'error'),
                message: f.message || 'Technical preflight finding',
                page: f.page,
                source: f.source,
                geometry: f.geometry,
                confidence: f.confidence || (f.context && f.context.confidence) || 0.8,
                fixRequired: f.fixRequired !== undefined ? f.fixRequired : (f.context && f.context.fixRequired) || false,
                safeToAutofix: f.safeToAutofix !== undefined ? f.safeToAutofix : (f.context && f.context.safeToAutofix) || false,
                destructiveFixRisk: f.destructiveFixRisk || (f.context && f.context.destructiveFixRisk) || null,
                fix_method: f.fix_method || null
            };

            if (fixableGeometry) {
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'REBUILD_TRIMBOX';
                normalized.repairStrategy = 'REBUILD_TRIMBOX';
                // Override with standard industrial values if not provided
                if (normalized.confidence === 0.8) normalized.confidence = 0.95;
                normalized.fixRequired = true;
                normalized.safeToAutofix = true;
                normalized.destructiveFixRisk = "LOW";
            }

            if (mappedCode === 'TRIM_MARGIN_WARNING' || mappedCode === 'TRIM_MARKS_NEAR_LIVE_AREA') {
                normalized.category = 'GEOMETRY';
                normalized.fixable = false;
                normalized.confidence = 0.5;
                normalized.fixRequired = false;
                normalized.safeToAutofix = false;
            }

            return normalized;
        });
    }

    static mapCode(code) {
        const map = {
            'GEOM_BLEED_MISSING': 'BLEED_MISSING',
            'GEOM_TRIMBOX_MISSING': 'TRIMBOX_MISSING',
            'IND_GEOM_003': 'TRIMBOX_MISSING',
            'IND_GEOM_005': 'TRIMBOX_INVALID',
            'IND_GEOM_006': 'TRIMBOX_OUTSIDE_MEDIABOX',
            'IND_GEOM_007': 'TRIM_MARGIN_WARNING',
            'IND_GEOM_008': 'TRIM_MARKS_NEAR_LIVE_AREA',
            'IND_TRIM': 'TRIMBOX_MISSING',
            'TRIM_BOX_ANOMALY': 'TRIMBOX_MISSING',
            'COLOR_MISMATCH': 'COLOR_PROFILE_MISMATCH',
            'LOW_RES': 'IMAGE_LOW_RESOLUTION'
        };
        return map[code] || code;
    }
}

module.exports = IssueNormalizer;
