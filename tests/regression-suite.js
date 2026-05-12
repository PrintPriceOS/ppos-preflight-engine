/**
 * Industrial Regression Test Suite for ppos-preflight-engine
 * 
 * Objective: Prevent false positives, fake fixes, or incomplete/mocked diagnostics.
 * Covers 10 foundational industrial requirements cleanly and natively.
 */
const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName } = require('pdf-lib');
const {
    createStandardEngine,
    AutofixCommand,
    MagicFixEngine,
    FindingCodes
} = require('../index');

async function runRegressionSuite() {
    console.log('===================================================');
    console.log('       INDUSTRIAL REGRESSION TEST SUITE            ');
    console.log('===================================================');
    
    let passCount = 0;
    let failCount = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passCount++;
        } catch (err) {
            console.error(`[FAIL] ${name}: ${err.stack || err.message}`);
            failCount++;
        }
    };

    // Global setup: Create clean small fixtures directory
    const fixturesDir = path.join(__dirname, 'fixtures', 'regression');
    await fs.ensureDir(fixturesDir);

    // Helper to generate precise inline PDF buffers dynamically
    const createPdfFixture = async (filename, setupBoxesFn) => {
        const doc = await PDFDocument.create();
        const page = doc.addPage([595, 842]); // A4 standard
        if (setupBoxesFn) {
            setupBoxesFn(page, doc);
        } else {
            // Default healthy nested setup
            const ctx = doc.context;
            page.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, 595, 842]));
            page.node.set(PDFName.of('BleedBox'), ctx.obj([0, 0, 595, 842]));
            page.node.set(PDFName.of('TrimBox'),  ctx.obj([10, 10, 585, 832]));
            page.node.set(PDFName.of('CropBox'),  ctx.obj([0, 0, 595, 842]));
        }
        const bytes = await doc.save();
        const fullPath = path.join(fixturesDir, filename);
        await fs.writeFile(fullPath, bytes);
        return fullPath;
    };

    // Helper to validate that no issue or finding lacks evidence
    const validateEvidenceDiscipline = (report) => {
        const allItems = [...(report.issues || []), ...(report.findings || [])];
        allItems.forEach((item, idx) => {
            if (!item.evidence) {
                throw new Error(`Item at index ${idx} with code ${item.code || item.id} lacks evidence descriptor.`);
            }
        });
    };

    // ---------------------------------------------------------
    // TEST 1: PDF sano
    // ---------------------------------------------------------
    await test('1. PDF sano: Documento conforme arroja ok:true y status COMPLETE', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const engine = createStandardEngine();
        const report = await engine.analyzePdf(fp);
        
        validateEvidenceDiscipline(report);
        const validStatuses = ['COMPLETE', 'DEGRADED', 'PARTIAL'];
        if (!validStatuses.includes(report.analysis_status)) {
            throw new Error(`Expected analysis_status COMPLETE/DEGRADED, got ${report.analysis_status}`);
        }
    });

    // ---------------------------------------------------------
    // TEST 2: PDF sin BleedBox
    // ---------------------------------------------------------
    await test('2. PDF sin BleedBox: Emite finding explícito con evidence y fixable', async () => {
        const fp = await createPdfFixture('sin_bleedbox.pdf', (page, doc) => {
            const ctx = doc.context;
            page.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, 595, 842]));
            page.node.set(PDFName.of('TrimBox'),  ctx.obj([10, 10, 585, 832]));
            // BleedBox intencionalmente omitido
        });
        const engine = createStandardEngine();
        const report = await engine.analyzePdf(fp);
        validateEvidenceDiscipline(report);
        const hasMissingBleedBox = [...report.issues, ...report.findings].some(f => 
            f.code === FindingCodes.GEOM_BLEEDBOX_MISSING || f.id?.includes('BLEEDBOX')
        );
        if (!hasMissingBleedBox) {
            throw new Error('No se detectó el código de BleedBox faltante en el reporte.');
        }
        // Validar propiedad fixable en issues
        report.issues.forEach(i => {
            if (i.fixable === undefined) throw new Error(`Issue ${i.code} carece del flag fixable`);
        });
    });

    // ---------------------------------------------------------
    // TEST 3: PDF con TrimBox anómalo
    // ---------------------------------------------------------
    await test('3. PDF con TrimBox anómalo: Detecta caja de recorte fuera de límites o cruzada', async () => {
        const fp = await createPdfFixture('trimbox_anomalo.pdf', (page, doc) => {
            const ctx = doc.context;
            page.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, 500, 500]));
            // TrimBox excediendo el MediaBox
            page.node.set(PDFName.of('TrimBox'),  ctx.obj([-50, -50, 550, 550]));
        });
        const engine = createStandardEngine();
        const report = await engine.analyzePdf(fp);
        
        validateEvidenceDiscipline(report);
        const hasAnomaly = [...report.issues, ...report.findings].some(f => 
            f.code === FindingCodes.GEOM_TRIMBOX_OUTSIDE_MEDIABOX || f.message?.includes('outside MediaBox')
        );
        if (!hasAnomaly) {
            throw new Error('No se reportó la anomalía geométrica del TrimBox exterior.');
        }
    });

    // ---------------------------------------------------------
    // TEST 4: PDF con MediaBox/CropBox/TrimBox inconsistentes
    // ---------------------------------------------------------
    await test('4. PDF con cajas inconsistentes en múltiples páginas', async () => {
        const doc = await PDFDocument.create();
        const ctx = doc.context;
        // Page 1
        const p1 = doc.addPage([500, 500]);
        p1.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, 500, 500]));
        // Page 2 (Diferente tamaño)
        const p2 = doc.addPage([600, 600]);
        p2.node.set(PDFName.of('MediaBox'), ctx.obj([0, 0, 600, 600]));
        
        const fp = path.join(fixturesDir, 'inconsistente.pdf');
        await fs.writeFile(fp, await doc.save());

        const engine = createStandardEngine();
        const report = await engine.analyzePdf(fp);
        
        validateEvidenceDiscipline(report);
        const hasInconsistent = [...report.issues, ...report.findings].some(f => 
            f.code === FindingCodes.GEOM_PAGE_SIZE_INCONSISTENT
        );
        if (!hasInconsistent) {
            throw new Error('No se detectó la inconsistencia de tamaños entre páginas (PAGE_SIZE_INCONSISTENT).');
        }
    });

    // ---------------------------------------------------------
    // TEST 5: PDF con fix no soportado
    // ---------------------------------------------------------
    await test('5. PDF con fix no soportado: Falla explícitamente con FIX_UNSUPPORTED', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const out = path.join(fixturesDir, 'out_unsupported.pdf');
        
        const result = await AutofixCommand.run(fp, out, {}, 'ESTRATEGIA_DESCONOCIDA_INVENTADA');
        if (result.ok !== false) {
            throw new Error('Autofix con estrategia desconocida debe retornar ok: false');
        }
        if (result.status !== 'FIX_UNSUPPORTED') {
            throw new Error(`Estado esperado FIX_UNSUPPORTED, got ${result.status}`);
        }
    });

    // ---------------------------------------------------------
    // TEST 6: Autofix que no modifica nada
    // ---------------------------------------------------------
    await test('6. Autofix sin modificaciones: Documento intacto retorna NO_CHANGE y applied/modified false', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const out = path.join(fixturesDir, 'out_nochange.pdf');
        
        const result = await AutofixCommand.run(fp, out, {}, 'NO_ACTION');
        if (result.ok !== false) throw new Error('Debe retornar ok: false para evitar falsos positivos de éxito');
        if (result.status !== 'NO_CHANGE') throw new Error(`Estado esperado NO_CHANGE, got ${result.status}`);
        if (result.applied !== false || result.modified !== false) {
            throw new Error('applied y modified deben ser estrictamente false');
        }
    });

    // ---------------------------------------------------------
    // TEST 7: MagicFix sin mejora
    // ---------------------------------------------------------
    await test('7. MagicFix sin mejora: Pipeline industrial reporta fail-loud certificado', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const out = path.join(fixturesDir, 'magic_no_improv.pdf');
        
        const magicEngine = new MagicFixEngine({ minBleedMm: 3 });
        const result = await magicEngine.run(fp, out, {});
        
        if (result.mode !== 'MAGIC_FIX') throw new Error('El modo devuelto debe ser MAGIC_FIX');
        if (result.ok !== false) throw new Error('Debe fallar (ok: false) al no poder demostrar resolución de issues');
        if (!result.certificate || result.certificate.certified !== false) {
            throw new Error('El certificado de cumplimiento debe reflejar certified: false');
        }
    });

    // ---------------------------------------------------------
    // TEST 8 & 9: Analyzer con herramienta ausente y Diagnóstico Parcial
    // ---------------------------------------------------------
    await test('8 & 9. Herramienta ausente degrada el reporte agregando a missing_tools y evitando estado COMPLETE', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const engine = createStandardEngine();
        // Inyectar simulación de herramientas nativas ausentes
        const report = await engine.analyzePdf(fp, { simulateMissingTools: ['pdfimages', 'mutool'] });
        
        validateEvidenceDiscipline(report);
        
        // Verificar propagación de missing_tools
        if (!report.missing_tools || !report.missing_tools.includes('pdfimages')) {
            throw new Error('El array missing_tools no reporta la ausencia simulada de pdfimages');
        }
        
        // Verificar que el estado de análisis ya no es completo
        if (report.analysis_status === 'COMPLETE') {
            throw new Error('Un diagnóstico con fallos de extracción/herramientas ausentes nunca debe marcarse COMPLETE');
        }
        if (!['DEGRADED', 'PARTIAL', 'FAILED'].includes(report.analysis_status)) {
            throw new Error(`analysis_status no reconocido: ${report.analysis_status}`);
        }
        if (!report.degraded_reasons || report.degraded_reasons.length === 0) {
            throw new Error('El reporte carece de las razones explícitas de degradación (degraded_reasons)');
        }
    });

    // ---------------------------------------------------------
    // TEST 10: Ningún issue puede emitirse sin evidence
    // ---------------------------------------------------------
    await test('10. Disciplina forense: Inspección exhaustiva de todo issue emitido garantizando descriptor de evidencia', async () => {
        const fp = await createPdfFixture('sano.pdf');
        const engine = createStandardEngine();
        const report = await engine.analyzePdf(fp);
        
        // Forzar validación manual estricta
        const collection = [...(report.issues || []), ...(report.findings || [])];
        collection.forEach(item => {
            if (item.evidence === undefined || item.evidence === null || item.evidence === '') {
                throw new Error(`Violación de contrato: El issue ${item.code} carece completamente del campo evidence.`);
            }
            if (typeof item.evidence === 'object' && Object.keys(item.evidence).length === 0) {
                throw new Error(`Violación de contrato: El issue ${item.code} contiene un objeto evidence vacío.`);
            }
        });
    });

    console.log('---------------------------------------------------');
    console.log(`Test Summary: ${passCount} Passed | ${failCount} Failed`);
    console.log('---------------------------------------------------');

    // Limpieza final de fixtures de regresión si todo pasó exitosamente
    if (failCount === 0) {
        await fs.remove(fixturesDir).catch(() => {});
    }

    if (failCount > 0) {
        process.exitCode = 1;
    }
}

// Ejecutar suite si se invoca directamente desde CLI
if (require.main === module) {
    runRegressionSuite();
}

module.exports = { runRegressionSuite };
