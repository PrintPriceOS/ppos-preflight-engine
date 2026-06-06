const ARTIFACT_TRUST_LEVELS = {
    RAW_INPUT: 'RAW_INPUT',
    FIX_ATTEMPTED: 'FIX_ATTEMPTED',
    FIXED_REVIEW_REQUIRED: 'FIXED_REVIEW_REQUIRED',
    FIXED_READY: 'FIXED_READY',
    PRODUCTION_CERTIFIED: 'PRODUCTION_CERTIFIED',
    STANDARD_CERTIFIED: 'STANDARD_CERTIFIED',
    CUSTOMER_VISIBLE_SAFE: 'CUSTOMER_VISIBLE_SAFE'
};

const ARTIFACT_ROLES = {
    input_pdf: 'input_pdf',
    fixed_pdf: 'fixed_pdf',
    review_pdf: 'review_pdf',
    certified_pdf: 'certified_pdf',
    audit_json: 'audit_json',
    delta_report: 'delta_report',
    human_report: 'human_report',
    validation_report: 'validation_report'
};

const CERTIFICATION_FLAGS = {
    production_certified: 'production_certified',
    standard_certified: 'standard_certified',
    pdfx_compliance_claimed: 'pdfx_compliance_claimed',
    pdfa_compliance_claimed: 'pdfa_compliance_claimed',
    compliance_claim_allowed: 'compliance_claim_allowed',
    customer_visible: 'customer_visible',
    is_primary: 'is_primary',
    review_required: 'review_required'
};

function evaluateArtifactTrust({
    artifactRole,
    artifactFilename,
    fixResults = {},
    governance = {},
    standardsEvidence = {},
    policyHints = {}
}) {
    let trust_level = ARTIFACT_TRUST_LEVELS.FIXED_READY;
    let review_required = false;
    let production_certified = false;
    let standard_certified = false;
    let customer_visible = false;
    let is_primary_candidate = true;
    let primary_disallowed_reasons = [];
    let certification_labels = [];
    let blocked_by_governance_domains = [];
    let warnings = [];
    let evidence = {};

    let pdfx_compliance_claimed = false;
    let pdfa_compliance_claimed = false;
    let standard_claimed = null;

    // OutputIntent check
    let outputintent_changed = false;
    if (governance.outputintent_metadata?.outputintent_changed === true ||
        fixResults?.INJECT_OUTPUT_INTENT?.applied === true) {
        outputintent_changed = true;
        warnings.push("OutputIntent does not prove PDF/X.");
    }

    // 2. Review-required domains block production certification
    for (const [domain, govState] of Object.entries(governance)) {
        if (
            govState.review_required === true ||
            govState.certified_pdf_allowed === false ||
            govState.production_certified === false ||
            govState.human_review_required === true ||
            govState.destructive_fix_applied === true ||
            (govState.visually_sensitive === true && !govState.operator_approved)
        ) {
            // Check for operator override
            if (policyHints.operator_approved === true && policyHints.approved_domains?.includes(domain)) {
                continue;
            }
            review_required = true;
            blocked_by_governance_domains.push(domain);
        }
    }

    if (review_required) {
        trust_level = ARTIFACT_TRUST_LEVELS.FIXED_REVIEW_REQUIRED;
        production_certified = false;
        is_primary_candidate = false;
        primary_disallowed_reasons.push(...blocked_by_governance_domains);
    } else {
        // Evaluate production_certified
        let all_domains_allow = true;
        let has_domains = Object.keys(governance).length > 0;
        
        if (has_domains) {
            for (const [domain, govState] of Object.entries(governance)) {
                if (govState.production_certified === false || govState.certified_pdf_allowed === false) {
                    all_domains_allow = false;
                }
            }
        } else {
            all_domains_allow = false;
        }

        if (policyHints.allow_production_certification === true || (has_domains && all_domains_allow)) {
            production_certified = true;
            trust_level = ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED;
        } else {
            production_certified = false;
        }
    }

    // 3. Standards certification requires validator evidence
    const validator_passed = standardsEvidence?.validation_performed === true && standardsEvidence?.validation_passed === true;
    const validator_has_identity = standardsEvidence?.validator_name && standardsEvidence?.validator_version && standardsEvidence?.standard_detected;
    const has_report = standardsEvidence?.validation_report_available === true || standardsEvidence?.validation_report_hash || standardsEvidence?.report_path;
    const claim_allowed = standardsEvidence?.compliance_claim_allowed === true;

    if (validator_passed && validator_has_identity && has_report && claim_allowed) {
        if (!outputintent_changed) {
             standard_certified = true;
             standard_claimed = standardsEvidence.standard_detected;
             if (standard_claimed.includes('PDF/X')) {
                 pdfx_compliance_claimed = true;
             }
             if (standard_claimed.includes('PDF/A')) {
                 pdfa_compliance_claimed = true;
             }
             if (!review_required) {
                 trust_level = ARTIFACT_TRUST_LEVELS.STANDARD_CERTIFIED;
             }
        }
    }

    // Filename overclaims protection
    if (artifactFilename?.includes('certified.pdf') || artifactFilename?.includes('production.pdf')) {
        if (!production_certified && !standard_certified) {
            warnings.push("Filename implies certification but evidence is lacking.");
        }
    }

    // 6. Customer visibility
    if (!review_required) {
        if (production_certified || standard_certified) {
            customer_visible = true;
        } else if (artifactFilename?.includes('fixed.pdf')) {
            customer_visible = true;
        }
    } else if (artifactRole === ARTIFACT_ROLES.review_pdf) {
        customer_visible = true; // safe to show as review artifact
    } else {
        customer_visible = false;
    }
    
    // Gaps
    if (standardsEvidence?.detector_gap) {
        evidence.detector_gap = standardsEvidence.detector_gap;
    }
    if (standardsEvidence?.validator_gap) {
        evidence.validator_gap = standardsEvidence.validator_gap;
    }

    return {
        artifact_role: artifactRole,
        artifact_filename: artifactFilename,
        trust_level,
        review_required,
        production_certified,
        standard_certified,
        customer_visible,
        is_primary_candidate,
        primary_disallowed_reasons,
        certification_labels,
        blocked_by_governance_domains,
        warnings,
        evidence: {
            ...evidence,
            outputintent_changed,
            standard_claimed,
            pdfx_compliance_claimed,
            pdfa_compliance_claimed
        }
    };
}

module.exports = {
    ARTIFACT_TRUST_LEVELS,
    ARTIFACT_ROLES,
    CERTIFICATION_FLAGS,
    evaluateArtifactTrust
};
