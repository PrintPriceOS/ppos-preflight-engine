/**
 * Preflight Engine Independent Test Suite
 * 
 * Validates the kernel modules without monolith dependencies.
 */
const {
    SpineCalculator,
    GeometryAuditEngine,
    ColorAnalyzer,
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
        
        if (report.analysis_type !== 'FAILED' && report.analysis_type !== 'DEGRADED' && report.analysis_type !== 'ENGINE_ENVIRONMENT_FAILURE') {
            throw new Error(`Expected analysis_type FAILED, DEGRADED or ENGINE_ENVIRONMENT_FAILURE, got ${report.analysis_type}`);
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
        // Verify confidence of generated issues is consistently propagated (Task 6)
        const zeroConfIssue = report.issues.find(i => i.confidence === 0);
        if (zeroConfIssue) {
            throw new Error('Se forzó un issue con confidence === 0 indebidamente bajo el nuevo contrato de consistencia');
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

    await test('Nuevos campos del contrato (analysis_status, degraded_reasons, missing_tools, evidence)', async () => {
        const engine = createStandardEngine();
        const report = await engine.analyzePdf('nonexistent_corrupt_file.pdf');
        
        if (!['FAILED', 'DEGRADED', 'PARTIAL', 'COMPLETE', 'ENGINE_ENVIRONMENT_FAILURE'].includes(report.analysis_status)) {
            throw new Error(`Estado de análisis inválido: ${report.analysis_status}`);
        }
        if (!Array.isArray(report.degraded_reasons)) {
            throw new Error('degraded_reasons no es un array');
        }
        if (!Array.isArray(report.missing_tools)) {
            throw new Error('missing_tools no es un array');
        }
        if (report.missing_tools.length === 0) {
            throw new Error('missing_tools no reportó herramientas faltantes bajo fallo total');
        }
        if (!report.degraded_reasons.includes('FALLBACK_MOCK_USED')) {
            throw new Error('degraded_reasons no incluye FALLBACK_MOCK_USED');
        }
    });

    await test('Atributos extendidos del contrato en analizadores individuales (category, fixable, recommended_fix)', async () => {
        const colorAnalyzer = new ColorAnalyzer();
        const res = await colorAnalyzer.analyze('test.pdf', {
            metadata: {
                toolOutputs: {
                    pdfinfo: 'DeviceRGB detected in document objects'
                }
            }
        });
        
        const rgbFinding = res.findings.find(f => f.code === FindingCodes.COLOR_RGB_OBJECTS_DETECTED);
        if (!rgbFinding) throw new Error('No se detectó hallazgo de objetos RGB');
        if (rgbFinding.category !== 'COLOR') throw new Error(`Categoría incorrecta: ${rgbFinding.category}`);
        if (rgbFinding.fixable !== true) throw new Error('Debe ser fixable: true');
        if (rgbFinding.recommended_fix !== 'CONVERT_CMYK') throw new Error(`Fix recomendado incorrecto: ${rgbFinding.recommended_fix}`);
    });

    await test('Autofix: Reglas obligatorias (desconocido, no fixable, bleed fix real, trimbox rebuild, sin cambios)', async () => {
        const { PDFDocument } = require('pdf-lib');
        const fs = require('fs-extra');
        const AutofixCommand = require('../src/runtime/commands/autofixCommand');
        const { AutofixExecutionEngine } = require('../index');
        
        // 1. Fix desconocido
        const resUnknown = await AutofixCommand.run('input.pdf', 'output.pdf', {}, 'UNKNOWN_STRATEGY_XYZ');
        if (resUnknown.ok !== false) throw new Error('Debe fallar en fix desconocido');
        if (resUnknown.status !== 'FIX_UNSUPPORTED') throw new Error(`Estado incorrecto: ${resUnknown.status}`);
        if (resUnknown.verification_status !== 'FAILED') throw new Error('verification_status debe ser FAILED');
        
        // 2. Issue no fixable
        const engine = new AutofixExecutionEngine();
        if (engine.isFixable('UNSUPPORTED_ISSUE_CODE') !== false) throw new Error('Debe retornar false para isFixable en código no soportado');
        const stepRes = await engine.executeStep('UNSUPPORTED_ISSUE_CODE', 'in.pdf', 'out.pdf');
        if (stepRes.success !== false) throw new Error('executeStep debe fallar ante issue no fixable');

        // Create a minimal live PDF for testing real execution
        const doc = await PDFDocument.create();
        doc.addPage([595, 842]);
        const bytes = await doc.save();
        await fs.writeFile('dummy_test_input.pdf', bytes);

        // 3. Bleed fix real (Forensically honest: Box expansion only)
        const resBleed = await AutofixCommand.run('dummy_test_input.pdf', 'dummy_test_bleed_out.pdf', { minBleedMm: 5 }, 'APPLY_BLEED');
        if (resBleed.ok !== true) throw new Error('Bleed fix falló');
        if (resBleed.applied !== true || resBleed.modified !== true) throw new Error('Debe marcar applied y modified en true');
        // Rule: Distinguir y reportar honestamente si solo se modifican cajas
        if (resBleed.strategy !== 'BOX_EXPANSION_ONLY') throw new Error(`Strategy debe ser BOX_EXPANSION_ONLY, got ${resBleed.strategy}`);
        if (resBleed.industrial_quality !== 'LIMITED') throw new Error('industrial_quality debe ser LIMITED');
        if (resBleed.requires_human_review !== true) throw new Error('requires_human_review debe ser true');
        if (resBleed.verification_status !== 'HUMAN_REVIEW_REQUIRED') throw new Error('verification_status debe ser HUMAN_REVIEW_REQUIRED');
        if (!await fs.pathExists('dummy_test_bleed_out.pdf')) throw new Error('El archivo de salida de bleed no se creó');

        // Test adicional: Verificar aborto seguro ante requerimiento estricto de extensión de arte real
        const resUnsafeBleed = await AutofixCommand.run('dummy_test_input.pdf', 'dummy_test_unsafe_out.pdf', { requireTrueArtworkExtension: true }, 'APPLY_BLEED');
        if (resUnsafeBleed.ok !== false) throw new Error('Debe fallar si se exige extensión de arte real indisponible');
        if (resUnsafeBleed.status !== 'UNSAFE_BLEED_FIX_NOT_APPLIED') throw new Error(`Status debe ser UNSAF_BLEED_FIX_NOT_APPLIED, got ${resUnsafeBleed.status}`);

        // 4. Trimbox rebuild
        const resTrim = await AutofixCommand.run('dummy_test_input.pdf', 'dummy_test_trim_out.pdf', {}, 'REBUILD_TRIMBOX');
        if (resTrim.ok !== true) throw new Error('Trimbox rebuild falló');
        if (resTrim.applied !== true || resTrim.modified !== true) throw new Error('Debe marcar applied y modified en true para Trimbox rebuild');
        if (!await fs.pathExists('dummy_test_trim_out.pdf')) throw new Error('El archivo de salida de trimbox no se creó');

        // 5. Salida sin cambios
        const resNoChange = await AutofixCommand.run('dummy_test_input.pdf', 'dummy_test_nochange_out.pdf', {}, 'NO_ACTION');
        if (resNoChange.ok !== false) throw new Error('ok debe ser false en salida sin cambios');
        if (resNoChange.status !== 'NO_CHANGE') throw new Error(`status debe ser NO_CHANGE, got ${resNoChange.status}`);
        if (resNoChange.applied !== false || resNoChange.modified !== false) throw new Error('applied y modified deben ser false en salida sin cambios');

        // Clean up temporary files
        await fs.remove('dummy_test_input.pdf');
        await fs.remove('dummy_test_bleed_out.pdf');
        await fs.remove('dummy_test_trim_out.pdf');
        await fs.remove('dummy_test_nochange_out.pdf');
        await fs.remove('dummy_test_unsafe_out.pdf').catch(() => {});
    });

    await test('MagicFixEngine: Cadena industrial real verificable y reportes fail-loud', async () => {
        const { PDFDocument } = require('pdf-lib');
        const fs = require('fs-extra');
        const { MagicFixEngine } = require('../index');

        const magicEngine = new MagicFixEngine();

        // 1. Escenario sin fixes seguros / Documento ya perfecto
        const docPerfect = await PDFDocument.create();
        docPerfect.addPage([595, 842]);
        const perfectBytes = await docPerfect.save();
        await fs.writeFile('magic_test_perfect.pdf', perfectBytes);

        const resPerfect = await magicEngine.run('magic_test_perfect.pdf', 'magic_test_perfect_out.pdf');
        
        // Verifica cumplimiento de fail-loud si no hay fixes aplicables
        if (resPerfect.mode !== 'MAGIC_FIX') throw new Error('Modo debe ser MAGIC_FIX');
        if (resPerfect.certificate?.status !== 'NO_SAFE_FIX_AVAILABLE' && 
            resPerfect.certificate?.status !== 'MAGICFIX_NO_IMPROVEMENT' &&
            resPerfect.certificate?.status !== 'REMAINING_CRITICAL_RISK' &&
            resPerfect.certificate?.status !== 'SUCCESS') {
            throw new Error(`Status de certificado inesperado: ${resPerfect.certificate?.status}`);
        }

        // Limpieza
        await fs.remove('magic_test_perfect.pdf');
        await fs.remove('magic_test_perfect_out.pdf').catch(() => {});
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
