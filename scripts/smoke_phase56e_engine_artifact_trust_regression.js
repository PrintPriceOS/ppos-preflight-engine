const fs = require('fs');
const path = require('path');
const { evaluateArtifactTrust, ARTIFACT_ROLES, ARTIFACT_TRUST_LEVELS } = require('../core/ArtifactTrustModel');

const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

const scenarios = [
    {
        name: "1. certified.pdf filename only",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            governance: {},
            standardsEvidence: {}
        },
        verify: (res) => {
            return !res.production_certified &&
                   !res.standard_certified &&
                   !res.customer_visible &&
                   res.trust_level !== ARTIFACT_TRUST_LEVELS.STANDARD_CERTIFIED &&
                   res.trust_level !== ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED;
        }
    },
    {
        name: "2. fixed.pdf with no blockers",
        input: {
            artifactFilename: "fixed.pdf",
            artifactRole: ARTIFACT_ROLES.fixed_pdf,
            governance: {},
            standardsEvidence: {},
            policyHints: { allow_production_certification: false }
        },
        verify: (res) => {
            return (res.trust_level === ARTIFACT_TRUST_LEVELS.FIXED_READY || res.trust_level === ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED) &&
                   !res.standard_certified &&
                   !res.evidence.pdfx_compliance_claimed;
        }
    },
    {
        name: "3. review.pdf required due to visual governance",
        input: {
            artifactFilename: "review.pdf",
            artifactRole: ARTIFACT_ROLES.review_pdf,
            governance: {
                color: { review_required: true }
            }
        },
        verify: (res) => {
            return res.trust_level === ARTIFACT_TRUST_LEVELS.FIXED_REVIEW_REQUIRED &&
                   res.review_required === true &&
                   res.production_certified === false &&
                   res.blocked_by_governance_domains.includes('color');
        }
    },
    {
        name: "4. certified.pdf with font/color/image/transparency review blocker",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            governance: {
                fonts: { review_required: true }
            }
        },
        verify: (res) => {
            return res.production_certified === false &&
                   res.standard_certified === false &&
                   res.customer_visible === false &&
                   res.primary_disallowed_reasons.includes('fonts');
        }
    },
    {
        name: "5. certified.pdf production-certified but not standards-certified",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            governance: {
                internal: { production_certified: true, certified_pdf_allowed: true }
            },
            standardsEvidence: {}
        },
        verify: (res) => {
            return res.production_certified === true &&
                   res.standard_certified === false &&
                   res.evidence.pdfx_compliance_claimed === false &&
                   res.trust_level === ARTIFACT_TRUST_LEVELS.PRODUCTION_CERTIFIED;
        }
    },
    {
        name: "6. certified.pdf standards-certified with complete validator evidence",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            governance: {
                internal: { production_certified: true, certified_pdf_allowed: true }
            },
            standardsEvidence: {
                validation_performed: true,
                validation_passed: true,
                validator_name: "verapdf",
                validator_version: "1.26.1",
                standard_detected: "PDF/X-4",
                validation_report_available: true,
                compliance_claim_allowed: true
            }
        },
        verify: (res) => {
            return res.standard_certified === true &&
                   res.evidence.pdfx_compliance_claimed === true &&
                   res.evidence.standard_claimed === "PDF/X-4" &&
                   res.trust_level === ARTIFACT_TRUST_LEVELS.STANDARD_CERTIFIED;
        }
    },
    {
        name: "7. OutputIntent injected",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            fixResults: {
                INJECT_OUTPUT_INTENT: { applied: true }
            },
            standardsEvidence: {
                validation_performed: true,
                validation_passed: true,
                validator_name: "verapdf",
                validator_version: "1.26.1",
                standard_detected: "PDF/X-4",
                validation_report_available: true,
                compliance_claim_allowed: true
            }
        },
        verify: (res) => {
            return res.standard_certified === false &&
                   res.evidence.pdfx_compliance_claimed === false &&
                   res.warnings.some(w => w.includes("OutputIntent"));
        }
    },
    {
        name: "8. destructive visual fix applied",
        input: {
            artifactFilename: "review.pdf",
            artifactRole: ARTIFACT_ROLES.review_pdf,
            governance: {
                transparency_overprint: { destructive_fix_applied: true, certified_pdf_allowed: false }
            }
        },
        verify: (res) => {
            return res.trust_level === ARTIFACT_TRUST_LEVELS.FIXED_REVIEW_REQUIRED &&
                   res.production_certified === false &&
                   res.customer_visible === true && // Because it's a review_pdf
                   res.blocked_by_governance_domains.includes('transparency_overprint');
        }
    },
    {
        name: "9. detector_gap / validator_gap metadata",
        input: {
            artifactFilename: "certified.pdf",
            artifactRole: ARTIFACT_ROLES.certified_pdf,
            standardsEvidence: {
                detector_gap: true,
                validator_gap: true
            }
        },
        verify: (res) => {
            return res.evidence.detector_gap === true &&
                   res.evidence.validator_gap === true &&
                   res.standard_certified === false;
        }
    },
    {
        name: "10. artifact role ordering",
        // Test by evaluating multiple and asserting their states
        input: {
            artifactFilename: "review.pdf",
            artifactRole: ARTIFACT_ROLES.review_pdf,
            governance: {
                color: { review_required: true }
            }
        },
        verify: (res) => {
            // Evaluated as review_pdf with review_required=true
            // It should be review_required=true, but review_pdf is customer visible in this case
            const certRes = evaluateArtifactTrust({
                artifactFilename: "certified.pdf",
                artifactRole: ARTIFACT_ROLES.certified_pdf,
                governance: {
                    color: { review_required: true }
                }
            });
            // certRes should NOT be customer visible, and not primary
            return res.customer_visible === true && 
                   certRes.customer_visible === false && 
                   certRes.is_primary_candidate === false;
        }
    }
];

function runSmoke() {
    let allPassed = true;
    const reportRows = [];

    scenarios.forEach(scenario => {
        let res;
        try {
            res = evaluateArtifactTrust(scenario.input);
        } catch (e) {
            console.error(`Scenario ${scenario.name} failed during evaluation:`, e);
            allPassed = false;
            return;
        }

        const passed = scenario.verify(res);
        if (!passed) {
            allPassed = false;
            console.error(`❌ Scenario Failed: ${scenario.name}`);
            console.error(JSON.stringify(res, null, 2));
        } else {
            console.log(`✅ Scenario Passed: ${scenario.name}`);
        }

        reportRows.push({
            scenario: scenario.name,
            input_artifact: scenario.input.artifactFilename,
            input_governance: scenario.input.governance,
            artifact_trust: "evaluated",
            trust_level: res.trust_level,
            review_required: res.review_required,
            production_certified: res.production_certified,
            standard_certified: res.standard_certified,
            customer_visible: res.customer_visible,
            certified_pdf_allowed: res.blocked_by_governance_domains.length === 0, // Simplified
            primary_artifact_type: scenario.input.artifactRole,
            blocked_by_governance_domains: res.blocked_by_governance_domains,
            primary_disallowed_reasons: res.primary_disallowed_reasons,
            warnings: res.warnings,
            pass: passed,
            notes: passed ? "As expected" : "Failed verification"
        });
    });

    const jsonPath = path.join(reportsDir, 'phase56e_engine_artifact_trust_regression.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportRows, null, 2));

    const mdPath = path.join(reportsDir, 'phase56e_engine_artifact_trust_regression.md');
    let md = `# Phase 56E.1 Engine Artifact Trust Regression\n\n`;
    md += `| Scenario | Filename | Trust Level | Review Req | Prod Cert | Std Cert | Pass/Fail |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
    reportRows.forEach(r => {
        md += `| ${r.scenario} | ${r.input_artifact} | ${r.trust_level} | ${r.review_required} | ${r.production_certified} | ${r.standard_certified} | ${r.pass ? '✅ PASS' : '❌ FAIL'} |\n`;
    });
    fs.writeFileSync(mdPath, md);

    if (allPassed) {
        console.log("\nAll smoke tests PASSED.");
        process.exit(0);
    } else {
        console.log("\nSome smoke tests FAILED.");
        process.exit(1);
    }
}

runSmoke();
