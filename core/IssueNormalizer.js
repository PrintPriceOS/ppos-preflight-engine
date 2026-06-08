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
                code: rawCode,
                analyzer: f.analyzer || 'PreflightEngine',
                severity: f.severity || (mappedCode.endsWith('_WARNING') ? 'warning' : 'error'),
                category: f.category || null,
                message: this.MESSAGES[mappedCode] || this.MESSAGES[rawCode] || f.message || 'Technical preflight finding',
                page: f.page !== undefined ? f.page : null,
                source: f.source,
                geometry: f.geometry,
                confidence: f.confidence !== undefined ? f.confidence : ((f.context && f.context.confidence) || 0.98),
                fixable: f.fixable !== undefined ? f.fixable : false,
                recommended_fix: f.recommended_fix || f.fix_method || null,
                fixRequired: f.fixRequired !== undefined ? f.fixRequired : (f.context && f.context.fixRequired) || false,
                safeToAutofix: f.safeToAutofix !== undefined ? f.safeToAutofix : (f.context && f.context.safeToAutofix) || false,
                destructiveFixRisk: f.destructiveFixRisk || (f.context && f.context.destructiveFixRisk) || null,
                fix_method: f.fix_method || f.recommended_fix || null,
                evidence: f.evidence || null
            };

            if (fixableGeometry) {
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'REBUILD_TRIMBOX';
                normalized.recommended_fix = 'REBUILD_TRIMBOX';
                normalized.repairStrategy = 'REBUILD_TRIMBOX';
                if (normalized.confidence === 0.8) normalized.confidence = 0.95;
                normalized.fixRequired = true;
                normalized.safeToAutofix = true;
                normalized.destructiveFixRisk = "LOW";
            }

            if (['BLEED_MISSING', 'BLEED_INSUFFICIENT', 'BLEEDBOX_MISSING'].includes(mappedCode)) {
                normalized.category = 'GEOMETRY';
                normalized.fixable = true;
                normalized.fix_method = 'APPLY_BLEED';
                normalized.recommended_fix = 'APPLY_BLEED';
                normalized.repairStrategy = 'APPLY_BLEED';
                normalized.confidence = 0.9;
                normalized.fixRequired = false;
                normalized.safeToAutofix = true;
                normalized.destructiveFixRisk = 'MEDIUM';
            }

            if (mappedCode === 'PAGE_SIZE_INCONSISTENT' || rawCode === 'IND_GEOM_009' || rawCode === 'IND_GEOM_010' || rawCode === 'IND_GEOM_011') {
                normalized.category = 'GEOMETRY';
                normalized.fixable = false;
                normalized.confidence = 0.95;
                normalized.fixRequired = false;
                normalized.safeToAutofix = false;
            }

            if (mappedCode === 'TRIM_MARGIN_WARNING' || mappedCode === 'TRIM_MARKS_NEAR_LIVE_AREA') {
                normalized.category = 'GEOMETRY';
                normalized.fixable = false;
                normalized.confidence = 0.5;
                normalized.fixRequired = false;
                normalized.safeToAutofix = false;
            }

            if (rawCode?.startsWith('IND_INK')) normalized.category = 'INK';
            if (rawCode?.startsWith('IND_COLOR')) normalized.category = 'COLOR';
            if (rawCode?.startsWith('IND_FONT')) normalized.category = 'FONT';
            if (rawCode?.startsWith('IND_IMG')) normalized.category = 'IMAGE';
            if (rawCode?.startsWith('IND_TRANS')) normalized.category = 'TRANSPARENCY';
            if (rawCode?.startsWith('IND_OVERPRINT')) normalized.category = 'OVERPRINT';
            if (rawCode?.startsWith('IND_MARK')) normalized.category = 'MARK';
            if (rawCode?.startsWith('IND_COMPLIANCE')) normalized.category = 'COMPLIANCE';
            if (rawCode?.startsWith('IND_STRUCT')) normalized.category = 'STRUCTURAL';
            if (rawCode?.includes('INTEGRITY')) normalized.category = 'INTEGRITY';

            // Phase 64A: Ink governance findings — runs after prefix checks to ensure INK category
            // takes precedence over generic IND_COLOR prefix assignment for ink-specific codes.
            const inkGovernanceCodes = [
                'INK_TOTAL_COVERAGE_EXCESSIVE', 'IND_INK_001',
                'TOTAL_INK_COVERAGE_EXCESSIVE', 'COLOR_TOTAL_INK_COVERAGE_EXCEEDED', 'IND_COLOR_005'
            ];
            const richBlackCodes = [
                'INK_RICH_BLACK_TEXT', 'IND_INK_002', 'RICH_BLACK_TEXT',
                'COLOR_RICH_BLACK_TEXT', 'IND_COLOR_008'
            ];
            const smallTextRichBlackCodes = ['INK_SMALL_TEXT_RICH_BLACK', 'IND_INK_003', 'SMALL_TEXT_RICH_BLACK'];
            const registrationColorCodes = [
                'INK_REGISTRATION_COLOR_MISUSE', 'IND_INK_004', 'REGISTRATION_COLOR_MISUSE',
                'COLOR_REGISTRATION_ABUSE', 'IND_COLOR_009'
            ];
            const blackTextCodes = ['INK_BLACK_TEXT_NOT_K_ONLY', 'IND_INK_005', 'BLACK_TEXT_NOT_K_ONLY'];

            if (inkGovernanceCodes.includes(rawCode) || inkGovernanceCodes.includes(mappedCode)) {
                normalized.category = 'INK';
                normalized.fixable = false;
                normalized.fix_method = 'REDUCE_TOTAL_INK_COVERAGE';
                normalized.recommended_fix = 'REDUCE_TOTAL_INK_COVERAGE';
                normalized.repairStrategy = 'REDUCE_TOTAL_INK_COVERAGE';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }
            if (richBlackCodes.includes(rawCode) || richBlackCodes.includes(mappedCode)) {
                normalized.category = 'INK';
                normalized.fixable = false;
                normalized.fix_method = 'MAP_RICH_BLACK_TEXT_TO_K_ONLY';
                normalized.recommended_fix = 'MAP_RICH_BLACK_TEXT_TO_K_ONLY';
                normalized.repairStrategy = 'MAP_RICH_BLACK_TEXT_TO_K_ONLY';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }
            if (smallTextRichBlackCodes.includes(rawCode) || smallTextRichBlackCodes.includes(mappedCode)) {
                normalized.category = 'INK';
                normalized.fixable = false;
                normalized.fix_method = 'DETECT_SMALL_TEXT_RICH_BLACK';
                normalized.recommended_fix = 'DETECT_SMALL_TEXT_RICH_BLACK';
                normalized.repairStrategy = 'DETECT_SMALL_TEXT_RICH_BLACK';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'MEDIUM';
            }
            if (registrationColorCodes.includes(rawCode) || registrationColorCodes.includes(mappedCode)) {
                normalized.category = 'INK';
                normalized.fixable = false;
                normalized.fix_method = 'MAP_REGISTRATION_COLOR_TO_BLACK';
                normalized.recommended_fix = 'MAP_REGISTRATION_COLOR_TO_BLACK';
                normalized.repairStrategy = 'MAP_REGISTRATION_COLOR_TO_BLACK';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }
            if (blackTextCodes.includes(rawCode) || blackTextCodes.includes(mappedCode)) {
                normalized.category = 'INK';
                normalized.fixable = false;
                normalized.fix_method = 'NORMALIZE_BLACK_TEXT';
                normalized.recommended_fix = 'NORMALIZE_BLACK_TEXT';
                normalized.repairStrategy = 'NORMALIZE_BLACK_TEXT';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }

            // Phase 65A: Selective image quality findings — runs after prefix checks to ensure
            // IMAGE category enrichment with selective (non-destructive-by-default) fix routing.
            const rgbImagesCodes = ['RGB_IMAGES_PRESENT', 'IND_IMG_017', 'IMG_RGB_IMAGE_DETECTED', 'IND_IMG_004'];
            const untaggedImageCodes = ['UNTAGGED_IMAGE', 'IND_IMG_018'];
            const imageIccMismatchCodes = ['IMAGE_ICC_MISMATCH', 'IND_IMG_019', 'COLOR_ICC_PROFILE_MISMATCH', 'IND_COLOR_007'];
            const excessiveResolutionImageCodes = ['EXCESSIVE_RESOLUTION_IMAGE', 'IND_IMG_020', 'EXCESSIVE_RESOLUTION', 'IND_IMG_006', 'IMG_IMAGE_EXCESSIVE_RESOLUTION', 'IND_IMG_002'];
            const lowResImagesCodes = ['LOW_RES_IMAGES', 'IND_IMG_005', 'IMG_IMAGE_LOW_RESOLUTION', 'IND_IMG_001'];

            if (rgbImagesCodes.includes(rawCode) || rgbImagesCodes.includes(mappedCode)) {
                normalized.category = 'IMAGE';
                normalized.fixable = false;
                normalized.fix_method = 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE';
                normalized.recommended_fix = 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE';
                normalized.repairStrategy = 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }
            if (untaggedImageCodes.includes(rawCode) || untaggedImageCodes.includes(mappedCode)) {
                normalized.category = 'IMAGE';
                normalized.fixable = false;
                normalized.fix_method = 'TAG_UNTAGGED_IMAGES';
                normalized.recommended_fix = 'TAG_UNTAGGED_IMAGES';
                normalized.repairStrategy = 'TAG_UNTAGGED_IMAGES';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'MEDIUM';
            }
            if (imageIccMismatchCodes.includes(rawCode) || imageIccMismatchCodes.includes(mappedCode)) {
                normalized.category = 'IMAGE';
                normalized.fixable = false;
                normalized.fix_method = 'NORMALIZE_IMAGE_ICC_PROFILE';
                normalized.recommended_fix = 'NORMALIZE_IMAGE_ICC_PROFILE';
                normalized.repairStrategy = 'NORMALIZE_IMAGE_ICC_PROFILE';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'HIGH';
            }
            if (excessiveResolutionImageCodes.includes(rawCode) || excessiveResolutionImageCodes.includes(mappedCode)) {
                normalized.category = 'IMAGE';
                normalized.fixable = false;
                normalized.fix_method = 'DOWNSAMPLE_EXCESSIVE_RESOLUTION';
                normalized.recommended_fix = 'DOWNSAMPLE_EXCESSIVE_RESOLUTION';
                normalized.repairStrategy = 'DOWNSAMPLE_EXCESSIVE_RESOLUTION';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = true;
                normalized.destructiveFixRisk = 'MEDIUM';
            }
            if (lowResImagesCodes.includes(rawCode) || lowResImagesCodes.includes(mappedCode)) {
                normalized.category = 'IMAGE';
                normalized.fixable = false;
                normalized.fix_method = 'FLAG_LOW_RES_IMAGES_UNFIXABLE';
                normalized.recommended_fix = 'FLAG_LOW_RES_IMAGES_UNFIXABLE';
                normalized.repairStrategy = 'FLAG_LOW_RES_IMAGES_UNFIXABLE';
                normalized.safeToAutofix = false;
                normalized.requires_human_review = true;
                normalized.review_required = true;
                normalized.production_safe = false;
                normalized.visually_sensitive = false;
                normalized.destructiveFixRisk = 'LOW';
            }

            return normalized;
        });
    }

    static get MESSAGES() {
        return {
            'INTENT_BOOK':                 'Book / Catalog Intent Detected',
            'HEURISTIC_TEXT_OUTLINED':     'Text Possibly Converted to Outlines',
            'BLEED_MISSING':               'Bleed Zone Missing',
            'BLEED_INSUFFICIENT':          'Insufficient Bleed (< 3mm)',
            'TRIMBOX_MISSING':             'TrimBox Not Defined',
            'TRIMBOX_INVALID':             'Invalid TrimBox Dimensions',
            'TRIMBOX_OUTSIDE_MEDIABOX':    'TrimBox Extends Outside MediaBox',
            'TRIM_MARGIN_WARNING':         'Trim Margin Too Narrow',
            'TRIM_MARKS_NEAR_LIVE_AREA':   'Trim Marks Overlap Live Area',
            'COLOR_PROFILE_MISMATCH':      'Color Profile Mismatch',
            'IMAGE_LOW_RESOLUTION':        'Low Resolution Image',
            'BLEEDBOX_MISSING':            'BleedBox Not Defined',
            'PAGE_SIZE_INCONSISTENT':      'Inconsistent Page Sizes Detected',
            
            // New Industrial Mappings
            'IND_COLOR_001': 'RGB Objects Detected',
            'IND_COLOR_002': 'ICC Profile Missing',
            'IND_COLOR_003': 'Mixed Color Spaces Detected',
            'IND_COLOR_004': 'Spot Color Detected',
            'IND_COLOR_005': 'Total Ink Coverage (TAC) Exceeded',
            'IND_COLOR_006': 'OutputIntent Missing',
            'IND_COLOR_007': 'ICC Profile Mismatch',
            'IND_COLOR_008': 'Rich Black Text Detected',
            'IND_COLOR_009': 'Registration Color Abuse',
            'IND_FONT_001': 'Font Not Embedded',
            'IND_FONT_002': 'Font Subset Detected',
            'IND_FONT_003': 'Type3 Font Detected',
            'IND_FONT_004': 'Missing Glyph Detected',
            'IND_IMG_001': 'Image Low Resolution',
            'IND_IMG_002': 'Image Excessive Resolution',
            'IND_IMG_003': 'JPEG Artifacts Detected',
            'IND_IMG_004': 'RGB Image Detected',
            'IND_TRANS_001': 'Live Transparency Detected',
            'IND_TRANS_002': 'Blend Mode Detected',
            'IND_TRANS_003': 'Soft Mask Detected',
            'IND_OVERPRINT_001': 'Overprint Detected',
            'IND_OVERPRINT_002': 'Knockout Conflict',
            'IND_MARK_001': 'Crop Marks Missing',
            'IND_MARK_002': 'Registration Marks Present',
            'IND_MARK_003': 'Color Bar Detected',
            'IND_GEOM_010': 'Page Rotation Detected',
            'IND_GEOM_011': 'Mixed Page Orientation',
            'IND_GEOM_012': 'Hairline / Thin Stroke Detected',
            'IND_COMPLIANCE_001': 'PDF/X Compliance Missing',
            'IND_COMPLIANCE_002': 'PDF/X OutputCondition Mismatch / Invalid',
            'IND_STRUCT_001': 'Annotations Present',
            'IND_STRUCT_002': 'Interactive Form / AcroForm Detected',
            'IND_STRUCT_003': 'JavaScript Embedded Action Detected',
            'IND_STRUCT_004': 'Broken XREF / Incremental Save Anomaly',
            'IND_STRUCT_005': 'Object Stream / Cross-Reference Issue',
            // Phase 64A ink governance
            'IND_INK_001': 'Total Ink Coverage Excessive',
            'IND_INK_002': 'Rich Black Text Detected',
            'IND_INK_003': 'Small Text Using Rich Black',
            'IND_INK_004': 'Registration Color Misuse Detected',
            'IND_INK_005': 'Black Text Not K-Only',
            'TOTAL_INK_COVERAGE_EXCESSIVE': 'Total Ink Coverage Excessive',
            'RICH_BLACK_TEXT': 'Rich Black Text Detected',
            'SMALL_TEXT_RICH_BLACK': 'Small Text Using Rich Black',
            'REGISTRATION_COLOR_MISUSE': 'Registration Color Misuse Detected',
            'BLACK_TEXT_NOT_K_ONLY': 'Black Text Not K-Only',

            // Phase 65A selective image fixes
            'IND_IMG_017': 'RGB Images Present',
            'IND_IMG_018': 'Untagged Image Detected',
            'IND_IMG_019': 'Image ICC Profile Mismatch',
            'IND_IMG_020': 'Excessive Resolution Image Detected',
            'RGB_IMAGES_PRESENT': 'RGB Images Present',
            'UNTAGGED_IMAGE': 'Untagged Image Detected',
            'IMAGE_ICC_MISMATCH': 'Image ICC Profile Mismatch',
            'EXCESSIVE_RESOLUTION_IMAGE': 'Excessive Resolution Image Detected',
            'LOW_RES_IMAGES': 'Low Resolution Images Detected',

            'IND_INTEGRITY_DEGRADED': 'Forensic Extraction Degraded',
            'IND_INTEGRITY_EXTRACTION_ERROR': 'Extraction Probe Failure',
            'IND_INTEGRITY_MISSING_TOOL': 'Required Industrial Tool Missing'
        };
    }

    static mapCode(code) {
        const map = {
            'GEOM_BLEED_MISSING': 'BLEED_MISSING',
            'IND_GEOM_001': 'BLEED_INSUFFICIENT',
            'IND_GEOM_002': 'BLEED_MISSING',
            'IND_GEOM_004': 'BLEEDBOX_MISSING',
            'GEOM_BLEEDBOX_MISSING': 'BLEEDBOX_MISSING',
            'IND_GEOM_009': 'PAGE_SIZE_INCONSISTENT',
            'GEOM_PAGE_SIZE_INCONSISTENT': 'PAGE_SIZE_INCONSISTENT',
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
