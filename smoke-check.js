/**
 * Smoke Test: ppos-preflight-engine
 */
const { createStandardEngine, PreflightEngine } = require('./index');

async function test() {
    console.log('--- TESTING: ppos-preflight-engine ---');
    
    if (!createStandardEngine || !PreflightEngine) {
        throw new Error('FAIL: Missing main exports');
    }
    console.log('PASS: Main exports present');

    const engine = createStandardEngine();
    console.log('PASS: Engine instantiation');

    // Mock analysis call
    try {
        const report = await engine.analyzePdf('mock.pdf', { metadata: { pages: 10 } });
        if (report.summary && report.summary.risk_level) {
            console.log(`PASS: analyzePdf execution (Mock). Risk: ${report.summary.risk_level}`);
        } else {
            throw new Error('FAIL: Invalid report structure');
        }
    } catch (e) {
        console.error('FAIL: analyzePdf error:', e.message);
        process.exit(1);
    }

    console.log('DONE: ppos-preflight-engine is structurally sound.');
}

test();
