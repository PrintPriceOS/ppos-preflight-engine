const { getFixCapability } = require('../fixes/FixRegistry');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const fs = require('fs');
const path = require('path');

async function runSmokeTest() {
    console.log("Starting Phase 52A Engine Color Policy Truth Smoke Test...\n");
    let pass = true;

    console.log("TEST 1: Color Governance Registry Constraints");

    const checks = [
        { id: 'CONVERT_CMYK', expectImplemented: true, expectAutofixable: false },
        { id: 'NORMALIZE_ICC_PROFILE', expectImplemented: false, expectAutofixable: false },
        { id: 'REDUCE_TAC', expectImplemented: false, expectAutofixable: false },
        { id: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY', expectImplemented: false, expectAutofixable: false },
        { id: 'MAP_REGISTRATION_COLOR_TO_BLACK', expectImplemented: false, expectAutofixable: false }
    ];

    checks.forEach(check => {
        const cap = getFixCapability(check.id);
        if (!cap) {
            console.error(`❌ Capability missing: ${check.id}`);
            pass = false;
            return;
        }

        if (cap.implemented === check.expectImplemented) {
            console.log(`✅ ${check.id} implemented = ${check.expectImplemented}`);
        } else {
            console.error(`❌ ${check.id} implemented should be ${check.expectImplemented}`);
            pass = false;
        }

        if (cap.autofixable === check.expectAutofixable) {
            console.log(`✅ ${check.id} autofixable = ${check.expectAutofixable}`);
        } else {
            console.error(`❌ ${check.id} autofixable should be ${check.expectAutofixable}`);
            pass = false;
        }

        if (cap.production_safe === false) {
            console.log(`✅ ${check.id} production_safe = false`);
        } else {
            console.error(`❌ ${check.id} production_safe MUST be false!`);
            pass = false;
        }

        if (cap.requires_human_review === true) {
            console.log(`✅ ${check.id} requires_human_review = true`);
        } else {
            console.error(`❌ ${check.id} requires_human_review MUST be true!`);
            pass = false;
        }
    });

    // Special check for INJECT_OUTPUT_INTENT
    const injectCap = getFixCapability('INJECT_OUTPUT_INTENT');
    if (injectCap && injectCap.production_safe === true && injectCap.requires_human_review === false) {
        console.log("✅ INJECT_OUTPUT_INTENT allowed to be production_safe (metadata injection only).");
    } else {
        console.warn("⚠️ INJECT_OUTPUT_INTENT changed its risk profile.");
    }

    console.log("\nTEST 2: Execution Engine Governance Guardrails");
    const engine = new AutofixExecutionEngine();
    
    // Simulate invoking an unimplemented scaffold
    const res = await engine.executeFix({
        input_path: 'dummy.pdf',
        output_path: 'out.pdf',
        fix_hint: 'REDUCE_TAC'
    });

    if (res.skipped === true && res.status === 'SKIPPED_UNSUPPORTED') {
        console.log("✅ Engine correctly skips/unsupported unimplemented color fixes.");
    } else {
        console.error("❌ Engine tried to apply an unimplemented color fix!");
        console.error(res);
        pass = false;
    }

    // Simulate CONVERT_CMYK fallback
    const resCmyk = await engine.executeFix({
        input_path: 'dummy.pdf',
        output_path: 'out.pdf',
        fix_hint: 'CONVERT_CMYK'
    });
    
    if (resCmyk.executable === false) {
        console.log("✅ Engine accurately passes capability constraints upward (executable=false)");
    } else {
        console.error("❌ Engine returned executable=true for CONVERT_CMYK!");
        pass = false;
    }

    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

    const validationReport = [{
        phase: "52A",
        scope: "engine-only",
        color_governance_truth: "verified",
        convert_cmyk_safe: false,
        convert_cmyk_implemented: true,
        scaffolds_implemented: false,
        pass: pass
    }];

    fs.writeFileSync(path.join(reportsDir, 'phase52a_engine_color_policy_truth.json'), JSON.stringify(validationReport, null, 2));

    if (pass) {
        console.log("\n✅ ALL PHASE 52A ENGINE COLOR GOVERNANCE TESTS PASSED");
        process.exit(0);
    } else {
        console.error("\n❌ PHASE 52A ENGINE TESTS FAILED");
        process.exit(1);
    }
}

runSmokeTest().catch(console.error);
