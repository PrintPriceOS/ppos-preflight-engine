/**
 * Preflight Engine Independent Test Suite
 * 
 * Validates the kernel modules without monolith dependencies.
 */
const {
    SpineCalculator,
    GeometryAuditEngine,
    FindingCodes,
    createStandardEngine
} = require('../index');

async function runTests() {
    console.log('--- PREFLIGHT ENGINE TEST SUITE ---');
    let passCount = 0;
    let failCount = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passCount++;
        } catch (err) {
            console.error(`[FAIL] ${name}: ${err.message}`);
            failCount++;
        }
    };

    // 1. Finding Codes Validation
    await test('FindingCodes Integrity', () => {
        if (!FindingCodes.GEOM_BLEED_INSUFFICIENT) throw new Error('Missing GEOM_BLEED_INSUFFICIENT code');
        if (FindingCodes.GEOM_BLEED_INSUFFICIENT !== 'IND_GEOM_001') throw new Error('Incorrect code value');
    });

    // 2. SpineCalculator Validation
    await test('SpineCalculator Math', () => {
        const calc = new SpineCalculator();
        const result = calc.calculateTheoreticalSpine({
            pageCount: 100,
            paperType: 'coated',
            paperGsm: 130
        });
        if (result.spine_mm !== 4.5) throw new Error(`Expected 4.5mm, got ${result.spine_mm}mm`);
    });

    // 3. GeometryAuditEngine Validation
    await test('GeometryAuditEngine Bleed Detection', () => {
        const engine = new GeometryAuditEngine({ minBleedMm: 3.0 });
        const mockGeom = {
            trimBox: [0, 0, 100, 100],
            bleedBox: [-10, -10, 110, 110] // 10pt = ~3.5mm
        };
        const audit = engine.auditBleed(mockGeom);
        if (audit.code !== null) throw new Error(`Expected PASS (null code), got ${audit.code}`);
    });

    await test('GeometryAuditEngine Insufficient Bleed', () => {
        const engine = new GeometryAuditEngine({ minBleedMm: 3.0 });
        const mockGeom = {
            trimBox: [0, 0, 100, 100],
            bleedBox: [-1, -1, 101, 101] // 1pt = ~0.35mm
        };
        const audit = engine.auditBleed(mockGeom);
        if (audit.code !== FindingCodes.GEOM_BLEED_INSUFFICIENT) throw new Error(`Expected ${FindingCodes.GEOM_BLEED_INSUFFICIENT}, got ${audit.code}`);
    });

    // 4. Required Minimum Tests for Refactored Architecture
    await test('PDF sin TrimBox debe emitir TRIMBOX_MISSING', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { geometry: { pages: [{ page: 1, mediaBox: [0, 0, 595, 842], bleedBox: [0, 0, 595, 842] }] } }
        });
        const hasMissingTrim = res.findings.some(f => f.code === FindingCodes.GEOM_TRIMBOX_MISSING && f.page === 1);
        if (!hasMissingTrim) throw new Error('No se detectó TRIMBOX_MISSING');
    });

    await test('PDF sin BleedBox debe emitir BLEEDBOX_MISSING', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { geometry: { pages: [{ page: 1, mediaBox: [0, 0, 595, 842], trimBox: [0, 0, 595, 842] }] } }
        });
        const hasMissingBleedBox = res.findings.some(f => f.code === FindingCodes.GEOM_BLEEDBOX_MISSING && f.page === 1);
        if (!hasMissingBleedBox) throw new Error('No se detectó BLEEDBOX_MISSING');
    });

    await test('PDF con BleedBox igual a TrimBox debe emitir BLEED_MISSING', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { geometry: { pages: [{ page: 1, mediaBox: [0, 0, 595, 842], trimBox: [10, 10, 100, 100], bleedBox: [10, 10, 100, 100] }] } }
        });
        const hasMissingBleed = res.findings.some(f => f.code === FindingCodes.GEOM_BLEED_MISSING && f.page === 1);
        if (!hasMissingBleed) throw new Error('No se detectó BLEED_MISSING');
    });

    await test('PDF con TrimBox fuera de MediaBox debe emitir TRIMBOX_OUTSIDE_MEDIABOX', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { geometry: { pages: [{ page: 1, mediaBox: [10, 10, 100, 100], trimBox: [0, 0, 110, 110], bleedBox: [0, 0, 110, 110] }] } }
        });
        const hasOutside = res.findings.some(f => f.code === FindingCodes.GEOM_TRIMBOX_OUTSIDE_MEDIABOX && f.page === 1);
        if (!hasOutside) throw new Error('No se detectó TRIMBOX_OUTSIDE_MEDIABOX');
    });

    await test('PDF multipágina con tamaños distintos debe emitir PAGE_SIZE_INCONSISTENT', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { 
                geometry: { 
                    pages: [
                        { page: 1, trimBox: [0, 0, 595, 842], bleedBox: [0, 0, 595, 842], mediaBox: [0, 0, 595, 842] },
                        { page: 2, trimBox: [0, 0, 200, 300], bleedBox: [0, 0, 200, 300], mediaBox: [0, 0, 200, 300] }
                    ] 
                } 
            }
        });
        const hasInconsistent = res.findings.some(f => f.code === FindingCodes.GEOM_PAGE_SIZE_INCONSISTENT);
        if (!hasInconsistent) throw new Error('No se detectó PAGE_SIZE_INCONSISTENT');
    });

    await test('PDF con problema solo en página 2 debe reportar page: 2', async () => {
        const engine = new GeometryAuditEngine();
        const res = await engine.analyze(null, {
            metadata: { 
                geometry: { 
                    pages: [
                        { page: 1, trimBox: [0, 0, 595, 842], bleedBox: [-10, -10, 605, 852], mediaBox: [0, 0, 595, 842] },
                        // Página 2 sin BleedBox
                        { page: 2, trimBox: [0, 0, 595, 842], mediaBox: [0, 0, 595, 842] }
                    ] 
                } 
            }
        });
        const findingP2 = res.findings.find(f => f.code === FindingCodes.GEOM_BLEEDBOX_MISSING && f.page === 2);
        if (!findingP2) throw new Error('No se detectó el finding específicamente en page: 2');
    });

    // 5. Rule 9 Compliance: Strict Forensic Mode & Degraded Extraction Verification
    await test('Extracción fallida genera UNKNOWN/0 confidence y analysisIntegrity con error', async () => {
        const engine = createStandardEngine();
        const report = await engine.analyzePdf('nonexistent_corrupt_file.pdf');
        
        if (report.analysis_type !== 'FAILED' && report.analysis_type !== 'DEGRADED') {
            throw new Error(`Expected analysis_type FAILED or DEGRADED, got ${report.analysis_type}`);
        }
        if (!report.analysisIntegrity || report.analysisIntegrity.realExtraction !== false) {
            throw new Error('analysisIntegrity no reporta realExtraction: false');
        }
        if (report.analysisIntegrity.extractionErrors.length === 0) {
            throw new Error('No se capturaron extractionErrors');
        }
        if (!report.forensic_events.includes('FORENSIC_DEGRADED_ANALYSIS')) {
            throw new Error('Falta el forensic event FORENSIC_DEGRADED_ANALYSIS');
        }
        // Verify confidence of any generated issue is 0
        const nonZeroConfIssue = report.issues.find(i => i.confidence > 0);
        if (nonZeroConfIssue) {
            throw new Error('Se generó un issue con confidence > 0 bajo fallback');
        }
    });

    await test('STRICT_FORENSIC_MODE invalida certifiable y safeToAutofix al fallar extracción', async () => {
        process.env.STRICT_FORENSIC_MODE = 'true';
        const engine = createStandardEngine();
        const report = await engine.analyzePdf('nonexistent_corrupt_file.pdf');
        
        if (report.ok !== false) throw new Error('report.ok debe ser false bajo strict mode');
        if (report.certifiable !== false) throw new Error('report.certifiable debe ser false bajo strict mode');
        const autofixableIssue = report.issues.find(i => i.safeToAutofix === true);
        if (autofixableIssue) throw new Error('Se permitió safeToAutofix bajo strict mode con fallback');
        
        delete process.env.STRICT_FORENSIC_MODE; // Restore environment
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
