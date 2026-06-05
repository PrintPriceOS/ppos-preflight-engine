const { REGISTRY, getFixCapability, normalizeFixId, isFixImplemented } = require('../fixes/FixRegistry');
const AutofixExecutionEngine = require('../execution/AutofixExecutionEngine');
const fs = require('fs-extra');
const path = require('path');

async function runSmokeTest() {
    console.log("Starting Phase 54A Engine Image Quality Capability Truth + Policy Contract Smoke Test...\n");

    const engine = new AutofixExecutionEngine();
    
    const targets = [
        { cap: "UPSCALE_LOW_RES_IMAGES", finding: "LOW_RES_IMAGES" },
        { cap: "DOWNSAMPLE_EXCESSIVE_RESOLUTION", finding: "EXCESSIVE_RESOLUTION" },
        { cap: "RECOMPRESS_IMAGES", finding: "IMAGE_COMPRESSION_RISK" },
        { cap: "REPLACE_LOW_RES_IMAGES", finding: "IMAGE_REPLACEMENT_REQUIRED" },
        { cap: "REPAIR_JPEG_ARTIFACTS", finding: "JPEG_ARTIFACTS" },
        { cap: "NORMALIZE_IMAGE_COLORSPACE", finding: "IMAGE_COLORSPACE_RISK" },
        { cap: "REMOVE_IMAGE_ALPHA", finding: "IMAGE_ALPHA_RISK" },
        { cap: "REPAIR_DAMAGED_IMAGE_OBJECT", finding: "IMAGE_OBJECT_DAMAGED" },
        { cap: "VECTORIZE_BITMAP_TEXT", finding: "BITMAP_TEXT_RISK" },
        { cap: "RESTORE_RASTERIZED_VECTOR", finding: "RASTERIZED_VECTOR_RISK" }
    ];

    let allPassed = true;
    const reportData = [];

    for (const target of targets) {
        const capability = getFixCapability(target.cap);
        const isImplemented = isFixImplemented(target.cap);
        
        console.log(`Testing capability: ${target.cap}`);
        const result = await engine.executeFix({
            input_path: 'fake.pdf',
            output_path: 'out.pdf',
            fix_hint: target.cap
        });
        
        let pass = true;
        const notes = [];
        
        if (capability) {
            if (capability.production_safe) {
                pass = false;
                notes.push("VIOLATION: capability is production_safe.");
            }
            if (!capability.requires_human_review) {
                pass = false;
                notes.push("VIOLATION: capability does not require human review.");
            }
        } else {
            pass = false;
            notes.push(`VIOLATION: capability ${target.cap} is missing from registry.`);
        }
        
        let truthStatus = "UNKNOWN";
        if (capability && !capability.implemented) {
            truthStatus = "DECLARED_NOT_IMPLEMENTED";
        } else if (capability && capability.implemented) {
            truthStatus = "REVIEW_REQUIRED_CAPABILITY";
        }
        
        // Ensure findings don't map to implemented autofixes that execute safely
        const findingCapability = normalizeFixId(target.finding);
        if (findingCapability === target.finding) {
             // It didn't map to a fix id
             if (truthStatus === "UNKNOWN") truthStatus = "DIAGNOSTIC_ONLY";
        }

        if (result.status !== "SKIPPED" && result.status !== "SKIPPED_UNSUPPORTED" && !isImplemented) {
            pass = false;
            notes.push(`VIOLATION: execution status is ${result.status} instead of SKIPPED/SKIPPED_UNSUPPORTED for unimplemented fix.`);
        }
        
        if (result.applied) {
            pass = false;
            notes.push("VIOLATION: unsupported fix was applied.");
        }
        
        if (pass) {
            notes.push("OK: Policy honored.");
        } else {
            allPassed = false;
        }

        reportData.push({
            capability: target.cap,
            category: capability ? capability.category : "image_quality",
            implemented: capability ? capability.implemented : false,
            autofixable: capability ? capability.autofixable : false,
            production_safe: capability ? capability.production_safe : false,
            requires_human_review: capability ? capability.requires_human_review : true,
            risk_level: capability ? capability.risk_level : "HIGH",
            visually_sensitive: capability ? capability.visually_sensitive : true,
            destructive: capability ? capability.destructive : true,
            supported_modes: capability ? capability.supported_modes : [],
            execution_status: result.status,
            truth_status: truthStatus,
            pass,
            notes
        });
    }

    // Write reports
    const reportDir = path.join(__dirname, '../reports');
    await fs.ensureDir(reportDir);

    const jsonPath = path.join(reportDir, 'phase54a_engine_image_quality_policy.json');
    await fs.writeJson(jsonPath, reportData, { spaces: 2 });
    
    let mdContent = `# Phase 54A Engine Image Quality Policy Report\n\n`;
    reportData.forEach(r => {
        mdContent += `## ${r.capability}\n`;
        mdContent += `- Pass: ${r.pass}\n`;
        mdContent += `- Implemented: ${r.implemented}\n`;
        mdContent += `- Production Safe: ${r.production_safe}\n`;
        mdContent += `- Requires Human Review: ${r.requires_human_review}\n`;
        mdContent += `- Risk Level: ${r.risk_level}\n`;
        mdContent += `- Execution Status: ${r.execution_status}\n`;
        mdContent += `- Truth Status: ${r.truth_status}\n`;
        mdContent += `- Notes:\n  - ${r.notes.join('\n  - ')}\n\n`;
    });
    
    const mdPath = path.join(reportDir, 'phase54a_engine_image_quality_policy.md');
    await fs.writeFile(mdPath, mdContent);

    if (allPassed) {
        console.log("SMOKE TEST PASSED: Engine honestly declares image capability limits and policies.");
        process.exit(0);
    } else {
        console.error("SMOKE TEST FAILED: One or more image capabilities violated policy constraints.");
        process.exit(1);
    }
}

runSmokeTest().catch(console.error);
