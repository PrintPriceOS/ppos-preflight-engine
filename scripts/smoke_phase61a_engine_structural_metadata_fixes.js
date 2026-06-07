const fs = require('fs-extra');
const path = require('path');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const { evaluateArtifactTrust } = require('../core/ArtifactTrustModel');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/phase61a');
const OUTPUT_DIR = path.resolve(__dirname, '../fixtures/phase61a_out');
const REPORTS_DIR = path.resolve(__dirname, '../reports');

async function run() {
    await fs.ensureDir(OUTPUT_DIR);
    
    const engine = new AutofixExecutionEngine({ jobId: 'smoke_61a' });
    const results = [];
    let hasFailures = false;

    async function executeScenario(scenarioName, fixtureName, capabilityId, expectedStatus) {
        const inputPath = path.join(FIXTURES_DIR, fixtureName);
        const outputPath = path.join(OUTPUT_DIR, `${scenarioName.replace(/ /g, '_')}_out.pdf`);

        console.log(`Running scenario: ${scenarioName}`);
        
        let result;
        try {
            result = await engine.executeFix({
                input_path: inputPath,
                output_path: outputPath,
                fix_hint: capabilityId
            });
        } catch (e) {
            console.error(`Exception in ${scenarioName}:`, e);
            hasFailures = true;
            return;
        }

        const report = {
            scenario: scenarioName,
            fixture: fixtureName,
            capability: capabilityId,
            status: result.status,
            output_pdf_valid: false,
            evidence_present: !!result.evidence,
            qpdf_available: null,
            standard_certified: result.standard_certified || false,
            pdfx_compliance_claimed: result.pdfx_compliance_claimed || false,
            pdfa_compliance_claimed: result.pdfa_compliance_claimed || false,
            compliance_claim_allowed: result.compliance_claim_allowed || false,
            production_safe: result.production_safe || false,
            requires_human_review: result.requires_human_review || false,
            fixture_gap: result.evidence?.fixture_gap || false,
            tool_gap: result.evidence?.tooling_gap || result.evidence?.tool_missing || false,
            pass: true,
            notes: []
        };

        if (!report.evidence_present) {
            report.pass = false;
            report.notes.push("Evidence is missing");
        }

        if (result.status === 'APPLIED') {
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                if (stats.size > 0) {
                    const fd = fs.openSync(outputPath, 'r');
                    const buffer = Buffer.alloc(4);
                    fs.readSync(fd, buffer, 0, 4, 0);
                    fs.closeSync(fd);
                    if (buffer.toString('utf8', 0, 4) === '%PDF') {
                        report.output_pdf_valid = true;
                    }
                }
            }
            if (!report.output_pdf_valid && capabilityId !== 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL') {
                report.pass = false;
                report.notes.push("Output PDF is missing or invalid after an APPLIED fix");
            }
        }

        if (result.standard_certified || result.pdfx_compliance_claimed || result.pdfa_compliance_claimed || result.compliance_claim_allowed) {
            report.pass = false;
            report.notes.push("Metadata fix incorrectly claims standard certification or compliance");
        }

        if (capabilityId === 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL') {
            if (result.evidence?.statement?.includes('external PDF/X') === false) {
                report.pass = false;
                report.notes.push("Internal report does not explicitly state it is not an external validator");
            }
            if (result.validation_performed) {
                report.pass = false;
                report.notes.push("Internal report treated as external validator evidence");
            }
        }
        
        if (fixtureName === 'certified_filename_no_standard.pdf') {
            const mockFixAudit = [result];
            const trust = evaluateArtifactTrust([{ filename: 'certified_filename_no_standard.pdf', source: 'customer' }], mockFixAudit, 'SAFE');
            if (trust.standard_certified || trust.pdfx_compliance_claimed || trust.pdfa_compliance_claimed) {
                report.pass = false;
                report.notes.push("certified.pdf filename created standards claim");
            }
        }
        
        if (capabilityId === 'NORMALIZE_OBJECT_STREAMS') {
             if (result.evidence?.tool_missing) {
                 if (result.status === 'APPLIED') {
                     report.pass = false;
                     report.notes.push("qpdf missing but reported as success");
                 }
             } else {
                 if (result.status === 'APPLIED' && !report.output_pdf_valid) {
                     report.pass = false;
                     report.notes.push("qpdf output missing/invalid");
                 }
             }
        }

        if (!report.pass) hasFailures = true;
        results.push(report);
    }

    await executeScenario('1. NORMALIZE_OBJECT_STREAMS real run', 'object_streams_candidate.pdf', 'NORMALIZE_OBJECT_STREAMS');
    await executeScenario('2. REVOKE_FALSE_CERTIFICATION on fake PDF/X claim', 'fake_pdfx_claim.pdf', 'REVOKE_FALSE_CERTIFICATION');
    await executeScenario('3. STRIP_INVALID_PDFX_METADATA', 'fake_pdfx_claim.pdf', 'STRIP_INVALID_PDFX_METADATA');
    await executeScenario('4. STRIP_INVALID_PDFA_METADATA', 'fake_pdfa_claim.pdf', 'STRIP_INVALID_PDFA_METADATA');
    await executeScenario('5. NORMALIZE_STANDARD_METADATA', 'conflicting_standard_metadata.pdf', 'NORMALIZE_STANDARD_METADATA');
    await executeScenario('6. GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL', 'fake_pdfx_claim.pdf', 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL');
    await executeScenario('7. certified filename no standard', 'certified_filename_no_standard.pdf', 'NORMALIZE_STANDARD_METADATA');
    await executeScenario('8. clean control', 'clean_control.pdf', 'NORMALIZE_STANDARD_METADATA');

    const mdReport = [
        '# Phase 61A Engine Structural / Metadata Safe Fixes',
        '',
        '## Executive Summary',
        hasFailures ? 'Smoke test FAILED.' : 'Smoke test PASSED.',
        '',
        '## Capability Matrix',
        '| Scenario | Capability | Status | Passed | Notes |',
        '|---|---|---|---|---|',
        ...results.map(r => `| ${r.scenario} | ${r.capability} | ${r.status} | ${r.pass ? '✅' : '❌'} | ${r.notes.join(', ')} |`),
        '',
        '## Recommendation for Phase 61B',
        'Integrate metadata capabilities into Worker flow and define structural fix audits for Control Plane.'
    ].join('\n');

    await fs.writeJson(path.join(REPORTS_DIR, 'phase61a_engine_structural_metadata_fixes.json'), results, { spaces: 2 });
    await fs.writeFile(path.join(REPORTS_DIR, 'phase61a_engine_structural_metadata_fixes.md'), mdReport);

    if (hasFailures) {
        console.error("SMOKE TEST FAILED");
        process.exit(1);
    } else {
        console.log("SMOKE TEST PASSED");
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
