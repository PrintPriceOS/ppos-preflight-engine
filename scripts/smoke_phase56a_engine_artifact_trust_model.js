const fs = require('fs-extra');
const path = require('path');
const { evaluateArtifactTrust, ARTIFACT_ROLES, ARTIFACT_TRUST_LEVELS } = require('../core/ArtifactTrustModel');

async function runSmokeTests() {
    console.log("Starting Phase 56A Artifact Trust Model Smoke Tests...");
    const reportPathJson = path.join(__dirname, '../reports/phase56a_engine_artifact_trust_model.json');
    const reportPathMd = path.join(__dirname, '../reports/phase56a_engine_artifact_trust_model.md');
    
    await fs.ensureDir(path.dirname(reportPathJson));

    const scenarios = [
        {
            name: "1. certified.pdf filename only",
            params: {
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                artifactFilename: "certified.pdf",
                governance: {},
                standardsEvidence: {}
            },
            expectations: (res) => !res.production_certified && !res.standard_certified && !res.customer_visible && res.trust_level !== ARTIFACT_TRUST_LEVELS.STANDARD_CERTIFIED
        },
        {
            name: "2. fixed.pdf with no review blockers",
            params: {
                artifactRole: ARTIFACT_ROLES.fixed_pdf,
                artifactFilename: "fixed.pdf",
                governance: { color: { review_required: false, production_certified: true } },
                standardsEvidence: {}
            },
            expectations: (res) => res.trust_level === ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED && res.production_certified && !res.standard_certified
        },
        {
            name: "3. review.pdf with visual-risk governance",
            params: {
                artifactRole: ARTIFACT_ROLES.review_pdf,
                artifactFilename: "review.pdf",
                governance: { color: { review_required: true } }
            },
            expectations: (res) => res.trust_level === ARTIFACT_TRUST_LEVELS.FIXED_REVIEW_REQUIRED && !res.production_certified && res.blocked_by_governance_domains.includes('color')
        },
        {
            name: "4. certified.pdf with font review required",
            params: {
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                artifactFilename: "certified.pdf",
                governance: { fonts: { review_required: true } }
            },
            expectations: (res) => !res.production_certified && !res.standard_certified && res.primary_disallowed_reasons.includes('fonts')
        },
        {
            name: "5. certified.pdf with valid internal production governance but no standards evidence",
            params: {
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                artifactFilename: "certified.pdf",
                governance: { image_quality: { production_certified: true, certified_pdf_allowed: true } }
            },
            expectations: (res) => res.production_certified && !res.standard_certified && !res.evidence.pdfx_compliance_claimed && res.trust_level === ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED
        },
        {
            name: "6. certified.pdf with complete standards validator evidence",
            params: {
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                artifactFilename: "certified.pdf",
                governance: { structural: { production_certified: true } },
                standardsEvidence: {
                    validation_performed: true,
                    validation_passed: true,
                    validator_name: "verapdf",
                    validator_version: "1.24.1",
                    standard_detected: "PDF/X-4",
                    validation_report_available: true,
                    compliance_claim_allowed: true
                }
            },
            expectations: (res) => res.standard_certified && res.evidence.pdfx_compliance_claimed && res.trust_level === ARTIFACT_TRUST_LEVELS.STANDARD_CERTIFIED
        },
        {
            name: "7. OutputIntent injected",
            params: {
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                artifactFilename: "certified.pdf",
                governance: { outputintent_metadata: { outputintent_changed: true } },
                standardsEvidence: {
                    validation_performed: true,
                    validation_passed: true,
                    validator_name: "verapdf",
                    validator_version: "1.24.1",
                    standard_detected: "PDF/X-4",
                    validation_report_available: true,
                    compliance_claim_allowed: true
                }
            },
            expectations: (res) => res.evidence.outputintent_changed && !res.standard_certified && !res.evidence.pdfx_compliance_claimed && res.warnings.some(w => w.includes('OutputIntent'))
        },
        {
            name: "8. destructive visual fix applied",
            params: {
                artifactRole: ARTIFACT_ROLES.review_pdf,
                artifactFilename: "review.pdf",
                governance: { transparency_overprint: { destructive_fix_applied: true, certified_pdf_allowed: false } }
            },
            expectations: (res) => res.trust_level === ARTIFACT_TRUST_LEVELS.FIXED_REVIEW_REQUIRED && !res.production_certified && res.customer_visible
        },
        {
            name: "9. detector_gap / validator_gap metadata",
            params: {
                artifactRole: ARTIFACT_ROLES.fixed_pdf,
                artifactFilename: "fixed.pdf",
                standardsEvidence: { detector_gap: true }
            },
            expectations: (res) => res.evidence.detector_gap === true && !res.standard_certified
        },
        {
            name: "10. artifact role ordering (trust-based selection)",
            params: {
                artifactRole: ARTIFACT_ROLES.fixed_pdf,
                artifactFilename: "fixed.pdf",
                governance: { test: { review_required: true } }
            },
            expectations: (res) => !res.is_primary_candidate && res.primary_disallowed_reasons.includes('test')
        }
    ];

    const results = [];
    let allPassed = true;

    for (const scenario of scenarios) {
        const result = evaluateArtifactTrust(scenario.params);
        const passed = scenario.expectations(result);
        if (!passed) {
            allPassed = false;
        }

        results.push({
            scenario: scenario.name,
            pass: passed,
            artifact_role: result.artifact_role,
            artifact_filename: result.artifact_filename,
            input_governance: scenario.params.governance,
            trust_level: result.trust_level,
            review_required: result.review_required,
            production_certified: result.production_certified,
            standard_certified: result.standard_certified,
            customer_visible: result.customer_visible,
            is_primary_candidate: result.is_primary_candidate,
            blocked_by_governance_domains: result.blocked_by_governance_domains,
            certification_labels: result.certification_labels,
            warnings: result.warnings,
            evidence: result.evidence
        });
    }

    await fs.writeJson(reportPathJson, results, { spaces: 2 });

    let mdContent = `# Phase 56A Artifact Trust Model Smoke Test\n\n`;
    for (const res of results) {
        mdContent += `## ${res.scenario}\n`;
        mdContent += `- **Pass**: ${res.pass ? '✅' : '❌'}\n`;
        mdContent += `- **Artifact Role**: ${res.artifact_role}\n`;
        mdContent += `- **Artifact Filename**: ${res.artifact_filename}\n`;
        mdContent += `- **Trust Level**: ${res.trust_level}\n`;
        mdContent += `- **Review Required**: ${res.review_required}\n`;
        mdContent += `- **Production Certified**: ${res.production_certified}\n`;
        mdContent += `- **Standard Certified**: ${res.standard_certified}\n`;
        mdContent += `- **Customer Visible**: ${res.customer_visible}\n`;
        mdContent += `- **Is Primary Candidate**: ${res.is_primary_candidate}\n`;
        mdContent += `- **Blocked By**: ${res.blocked_by_governance_domains.join(', ') || 'None'}\n`;
        mdContent += `- **Warnings**: ${res.warnings.join(', ') || 'None'}\n\n`;
    }

    await fs.writeFile(reportPathMd, mdContent);

    if (allPassed) {
        console.log("All Phase 56A smoke tests passed!");
        process.exit(0);
    } else {
        console.error("Some Phase 56A smoke tests failed. See report.");
        process.exit(1);
    }
}

runSmokeTests().catch(err => {
    console.error(err);
    process.exit(1);
});
