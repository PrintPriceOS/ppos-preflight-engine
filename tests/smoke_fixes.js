const { REGISTRY, getFixCapability, isFixImplemented, isFixAutofixable, normalizeFixId } = require('../fixes/FixRegistry');
const FixPlanner = require('../fixes/FixPlanner');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');

async function run() {
    console.log("Running smoke tests for Phase 44 Fix Expansion...\n");
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ [PASS] ${message}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${message}`);
            failed++;
        }
    }

    // A. Registry Tests
    console.log("--- A. Registry Tests ---");
    assert(isFixImplemented('REBUILD_TRIMBOX') === true, "REBUILD_TRIMBOX is implemented");
    assert(isFixImplemented('STRIP_JAVASCRIPT') === true, "STRIP_JAVASCRIPT is implemented");
    assert(isFixImplemented('FLATTEN_ANNOTATIONS') === true, "FLATTEN_ANNOTATIONS is implemented");
    assert(isFixImplemented('FLATTEN_FORMS') === true, "FLATTEN_FORMS is implemented");
    assert(isFixImplemented('REBUILD_XREF') === true, "REBUILD_XREF is implemented");
    assert(isFixImplemented('EMBED_FONTS') === false, "EMBED_FONTS is NOT implemented");
    assert(isFixImplemented('FLATTEN_TRANSPARENCY') === false, "FLATTEN_TRANSPARENCY is NOT implemented");
    assert(isFixImplemented('VISUAL_BLEED_EXTENSION') === false, "VISUAL_BLEED_EXTENSION is NOT implemented");

    // B. Planner Tests
    console.log("\n--- B. Planner Tests ---");
    const planner = new FixPlanner();
    const mockIssues = [
        { code: 'TRIMBOX_MISSING', fixable: true },
        { code: 'EMBED_FONTS', fixable: true },
        { code: 'COLOR_PROFILE_MISMATCH', fixable: true },
        { code: 'BLEED_MISSING', fixable: true }
    ];
    
    const plan = planner.plan(mockIssues);
    
    const trimboxPlan = plan.find(p => p.fix_id === 'REBUILD_TRIMBOX');
    assert(trimboxPlan && trimboxPlan.planned === true, "Implemented safe fixes (REBUILD_TRIMBOX) can be planned");
    
    const fontPlan = plan.find(p => p.fix_id === 'EMBED_FONTS');
    assert(fontPlan && fontPlan.planned === false && fontPlan.skipped === true, "Unsupported fixes (EMBED_FONTS) are diagnostic/skipped");
    
    const cmykPlan = plan.find(p => p.fix_id === 'CONVERT_CMYK');
    assert(cmykPlan && cmykPlan.requires_human_review === true, "CONVERT_CMYK requires human review");
    
    const bleedPlan = plan.find(p => p.fix_id === 'APPLY_BLEED');
    assert(bleedPlan && bleedPlan.requires_human_review === true, "APPLY_BLEED requires human review");

    // C. Execution payload structure and E. unsupported scaffold
    console.log("\n--- C. Execution & E. Unsupported Scaffold Tests ---");
    const engine = new AutofixExecutionEngine();
    
    const scaffoldRes = await engine.executeFix({
        fix_hint: 'EMBED_FONTS',
        input_path: 'dummy.pdf',
        output_path: 'dummy_out.pdf'
    });
    
    assert(scaffoldRes.fix_id === 'EMBED_FONTS', "Payload contains fix_id");
    assert(scaffoldRes.detected === true, "Payload contains detected");
    assert(scaffoldRes.applied === false, "Payload applied is false for scaffold");
    assert(scaffoldRes.skipped === true, "Payload skipped is true for scaffold");
    assert(scaffoldRes.failed === false, "Payload failed is false for scaffold");
    assert(scaffoldRes.status === 'SKIPPED_UNSUPPORTED', "Payload status is SKIPPED_UNSUPPORTED");
    assert(scaffoldRes.risk_level === 'HIGH', "Payload risk_level is HIGH");
    assert(scaffoldRes.requires_human_review === true, "Payload requires_human_review is true");
    assert(scaffoldRes.evidence && scaffoldRes.evidence.implemented === false, "Payload has correct evidence for unsupported");

    // D. qpdf/rebuildXref graceful fail
    console.log("\n--- D. qpdf Graceful Fail Test ---");
    const xrefRes = await engine.executeFix({
        fix_hint: 'REBUILD_XREF',
        input_path: 'dummy.pdf',
        output_path: 'dummy_out.pdf'
    });
    // This will either succeed (if qpdf exists) or fail gracefully. Either way it shouldn't throw an unhandled exception.
    assert(xrefRes.applied === true || (xrefRes.failed === true && xrefRes.status === 'TOOL_NOT_AVAILABLE' || xrefRes.status === 'FAILED'), "qpdf behaves gracefully");

    console.log(`\nSmoke tests finished. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error("Test suite threw an unexpected error:", err);
    process.exit(1);
});
