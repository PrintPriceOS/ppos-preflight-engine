/**
 * Simple Fixture: Verifiable MagicFix Pipeline Demonstration
 * 
 * Demonstrates the execution of the full industrial chain:
 * Pre-analysis -> Fix Planning -> Safe Execution -> Post-analysis -> Diff -> Certification.
 */
const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const { MagicFixEngine } = require('../../index');

async function runFixture() {
    console.log('=== MAGICFIX SIMPLE INDUSTRIAL FIXTURE ===');
    const inputName = path.resolve(__dirname, 'fixture_input.pdf');
    const outputName = path.resolve(__dirname, 'fixture_output.pdf');

    try {
        // Create an initial dynamic document
        console.log('[FIXTURE] Generating original document...');
        const doc = await PDFDocument.create();
        doc.addPage([595, 842]);
        const bytes = await doc.save();
        await fs.writeFile(inputName, bytes);

        // Run MagicFix real chain
        console.log('[FIXTURE] Initializing MagicFixEngine...');
        const magicEngine = new MagicFixEngine({ minBleedMm: 3 });
        
        const result = await magicEngine.run(inputName, outputName, {
            jobId: 'fixture_job_001'
        });

        console.log('\n=== MAGICFIX OUTCOME PAYLOAD ===');
        console.log(JSON.stringify({
            ok: result.ok,
            mode: result.mode,
            input_issues_count: result.input_report?.issues?.length || 0,
            planned_steps: result.fix_plan?.map(p => p.strategy) || [],
            output_issues_count: result.output_report?.issues?.length || 0,
            diff: {
                resolved: result.resolved_issues,
                remaining: result.remaining_issues,
                new_regressions: result.new_issues
            },
            artifact: result.artifact,
            certificate: result.certificate,
            warnings: result.warnings
        }, null, 2));

        console.log('\n[FIXTURE] Verification complete.');
    } catch (err) {
        console.error('[FIXTURE] Execution Failed:', err);
    } finally {
        // Clean up fixture files
        await fs.remove(inputName).catch(() => {});
        await fs.remove(outputName).catch(() => {});
    }
}

if (require.main === module) {
    runFixture();
}

module.exports = runFixture;
