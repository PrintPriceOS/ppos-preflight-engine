/**
 * Preflight Engine Independent Test Suite
 * 
 * Validates the kernel modules without monolith dependencies.
 */
const {
    SpineCalculator,
    GeometryAuditEngine,
    FindingCodes
} = require('../index');

async function runTests() {
    console.log('--- PREFLIGHT ENGINE TEST SUITE ---');
    let passCount = 0;
    let failCount = 0;

    const test = (name, fn) => {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passCount++;
        } catch (err) {
            console.error(`[FAIL] ${name}: ${err.message}`);
            failCount++;
        }
    };

    // 1. Finding Codes Validation
    test('FindingCodes Integrity', () => {
        if (!FindingCodes.GEOM_BLEED_INSUFFICIENT) throw new Error('Missing GEOM_BLEED_INSUFFICIENT code');
        if (FindingCodes.GEOM_BLEED_INSUFFICIENT !== 'IND_GEOM_001') throw new Error('Incorrect code value');
    });

    // 2. SpineCalculator Validation
    test('SpineCalculator Math', () => {
        const calc = new SpineCalculator();
        const result = calc.calculateTheoreticalSpine({
            pageCount: 100,
            paperType: 'coated',
            paperGsm: 130
        });
        if (result.spine_mm !== 4.5) throw new Error(`Expected 4.5mm, got ${result.spine_mm}mm`);
    });

    // 3. GeometryAuditEngine Validation
    test('GeometryAuditEngine Bleed Detection', () => {
        const engine = new GeometryAuditEngine({ minBleedMm: 3.0 });
        const mockGeom = {
            trimBox: [0, 0, 100, 100],
            bleedBox: [-10, -10, 110, 110] // 10pt = ~3.5mm
        };
        const audit = engine.auditBleed(mockGeom);
        if (audit.code !== null) throw new Error(`Expected PASS (null code), got ${audit.code}`);
    });

    test('GeometryAuditEngine Insufficient Bleed', () => {
        const engine = new GeometryAuditEngine({ minBleedMm: 3.0 });
        const mockGeom = {
            trimBox: [0, 0, 100, 100],
            bleedBox: [-1, -1, 101, 101] // 1pt = ~0.35mm
        };
        const audit = engine.auditBleed(mockGeom);
        if (audit.code !== FindingCodes.GEOM_BLEED_INSUFFICIENT) throw new Error(`Expected ${FindingCodes.GEOM_BLEED_INSUFFICIENT}, got ${audit.code}`);
    });

    console.log('\n--- TEST SUMMARY ---');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test Runner Failed:', err);
    process.exit(1);
});
