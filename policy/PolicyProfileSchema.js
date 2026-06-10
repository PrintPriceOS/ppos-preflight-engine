'use strict';
/**
 * Phase 72A — PolicyProfileSchema
 *
 * Defines the canonical policy profile schema for preflight evaluation.
 * A profile is a CONSTRAINTS DOCUMENT only — never a certification authority.
 *
 * Core principle:
 *   profile_passed = true does NOT imply:
 *     - production_certified
 *     - standard_certified
 *     - compliance_claim_allowed
 *     - print_ready_claim_allowed
 */

/**
 * Built-in named profiles. Each profile represents a set of print-production
 * constraints. The Engine evaluates findings against the active profile to
 * produce profile_passed / profile_blockers / profile_warnings.
 */
const BUILT_IN_PROFILES = {

    // ── No profile active ───────────────────────────────────────────────────
    NONE: {
        profile_id: 'NONE',
        label: 'No policy profile',
        required_standard: null,
        bleed_policy: { required: false, min_mm: 0 },
        tac_limit: null,
        color_policy:      { require_cmyk: false, allow_rgb: true,  allow_spot_colors: true  },
        font_policy:       { require_embedded: false, allow_type3: true  },
        security_policy:   { no_javascript: false, no_embedded_files: false, no_launch_actions: false },
        page_marks_policy: { crop_marks_required: false, registration_marks_allowed: true  }
    },

    // ── Offset Standard (generic commercial offset printing) ─────────────────
    OFFSET_STANDARD: {
        profile_id: 'OFFSET_STANDARD',
        label: 'Offset Standard',
        required_standard: null,
        bleed_policy: { required: true, min_mm: 3 },
        tac_limit: 320,
        color_policy:      { require_cmyk: true,  allow_rgb: false, allow_spot_colors: true  },
        font_policy:       { require_embedded: true,  allow_type3: false },
        security_policy:   { no_javascript: true,  no_embedded_files: true,  no_launch_actions: true  },
        page_marks_policy: { crop_marks_required: false, registration_marks_allowed: false }
    },

    // ── PDF/X-4 Strict ───────────────────────────────────────────────────────
    PDFX4_STRICT: {
        profile_id: 'PDFX4_STRICT',
        label: 'PDF/X-4 Strict',
        required_standard: 'PDF/X-4',
        bleed_policy: { required: true, min_mm: 3 },
        tac_limit: 300,
        color_policy:      { require_cmyk: true,  allow_rgb: false, allow_spot_colors: true  },
        font_policy:       { require_embedded: true,  allow_type3: false },
        security_policy:   { no_javascript: true,  no_embedded_files: true,  no_launch_actions: true  },
        page_marks_policy: { crop_marks_required: false, registration_marks_allowed: false }
    },

    // ── PDF/A-2b Archive ─────────────────────────────────────────────────────
    PDFA2B_ARCHIVE: {
        profile_id: 'PDFA2B_ARCHIVE',
        label: 'PDF/A-2b Archive',
        required_standard: 'PDF/A-2b',
        bleed_policy: { required: false, min_mm: 0 },
        tac_limit: null,
        color_policy:      { require_cmyk: false, allow_rgb: true, allow_spot_colors: false },
        font_policy:       { require_embedded: true, allow_type3: false },
        security_policy:   { no_javascript: true,  no_embedded_files: false, no_launch_actions: true  },
        page_marks_policy: { crop_marks_required: false, registration_marks_allowed: true  }
    },

    // ── Digital / Screen (relaxed, no CMYK requirement) ──────────────────────
    DIGITAL_SCREEN: {
        profile_id: 'DIGITAL_SCREEN',
        label: 'Digital / Screen',
        required_standard: null,
        bleed_policy: { required: false, min_mm: 0 },
        tac_limit: null,
        color_policy:      { require_cmyk: false, allow_rgb: true, allow_spot_colors: false },
        font_policy:       { require_embedded: false, allow_type3: true },
        security_policy:   { no_javascript: false, no_embedded_files: false, no_launch_actions: false },
        page_marks_policy: { crop_marks_required: false, registration_marks_allowed: true }
    },

    // ── High-End Sheetfed (stricter TAC, strict security) ────────────────────
    SHEETFED_HIGH_END: {
        profile_id: 'SHEETFED_HIGH_END',
        label: 'High-End Sheetfed',
        required_standard: null,
        bleed_policy: { required: true, min_mm: 5 },
        tac_limit: 280,
        color_policy:      { require_cmyk: true,  allow_rgb: false, allow_spot_colors: true  },
        font_policy:       { require_embedded: true,  allow_type3: false },
        security_policy:   { no_javascript: true,  no_embedded_files: true,  no_launch_actions: true  },
        page_marks_policy: { crop_marks_required: true,  registration_marks_allowed: false }
    }
};

/**
 * Validate that a profile object has the required structural fields.
 * Returns { valid: bool, missing: string[] }.
 */
function validateProfileShape(profile) {
    const required = [
        'profile_id', 'label',
        'bleed_policy', 'color_policy', 'font_policy',
        'security_policy', 'page_marks_policy'
    ];
    const missing = required.filter(k => !(k in profile));
    return { valid: missing.length === 0, missing };
}

/**
 * Resolve a profile by id (from built-ins) or return a custom profile object.
 * Always returns a valid profile — falls back to NONE if unresolvable.
 */
function resolveProfile(profileIdOrObject) {
    if (!profileIdOrObject) return BUILT_IN_PROFILES.NONE;
    if (typeof profileIdOrObject === 'object' && profileIdOrObject.profile_id) {
        const { valid } = validateProfileShape(profileIdOrObject);
        return valid ? profileIdOrObject : BUILT_IN_PROFILES.NONE;
    }
    if (typeof profileIdOrObject === 'string') {
        return BUILT_IN_PROFILES[profileIdOrObject] || BUILT_IN_PROFILES.NONE;
    }
    return BUILT_IN_PROFILES.NONE;
}

module.exports = {
    BUILT_IN_PROFILES,
    validateProfileShape,
    resolveProfile
};
