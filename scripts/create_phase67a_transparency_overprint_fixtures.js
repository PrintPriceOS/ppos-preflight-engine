'use strict';

const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFString, PDFNumber, PDFArray, PDFDict, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase67a');
const REPORTS_DIR = path.join(__dirname, '../reports');

async function basePdf(text, pageSize = [600, 800]) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage(pageSize);
    page.drawText(text, { x: 80, y: 700, size: 18, color: rgb(0, 0, 0) });
    return { pdfDoc, page };
}

async function writeOut(pdfDoc, outPath) {
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

/**
 * Fixture: PDF flagged as containing live transparency (transparent objects).
 * Simulated via metadata annotation; physical transparency detection requires
 * content-stream-level parsing beyond pdf-lib primitives.
 */
async function createTransparencyPresentDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Transparency Present Fixture');

    pdfDoc.setTitle('Transparency Present Test Document');
    pdfDoc.setSubject('Phase 67A: Transparency Present');

    page.drawText('Document contains transparent objects (simulated via metadata annotation).', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: FLATTEN_TRANSPARENCY requires rendering safety proof before applying.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('transparency_present'),
        expected_finding: PDFString.of('TRANSPARENCY_PRESENT'),
        expected_fix: PDFString.of('FLATTEN_TRANSPARENCY'),
        simulated_issue: PDFString.of('Live transparency objects detected in content streams')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing non-default blend modes.
 * Expected fix: NORMALIZE_BLEND_MODES
 */
async function createBlendModeDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Blend Mode Detected Fixture');

    pdfDoc.setTitle('Blend Mode Detected Test Document');
    pdfDoc.setSubject('Phase 67A: Blend Mode Detected');

    page.drawText('Document uses non-default blend modes (e.g. Multiply, Screen) in content.', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: NORMALIZE_BLEND_MODES requires rendering safety proof before applying.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('blend_mode_detected'),
        expected_finding: PDFString.of('BLEND_MODE_PRESENT'),
        expected_fix: PDFString.of('NORMALIZE_BLEND_MODES'),
        simulated_issue: PDFString.of('Non-default blend modes in ExtGState resources')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing overprint settings.
 * Expected fix: FLATTEN_OVERPRINT
 */
async function createOverprintDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Overprint Detected Fixture');

    pdfDoc.setTitle('Overprint Detected Test Document');
    pdfDoc.setSubject('Phase 67A: Overprint Detected');

    page.drawText('Document uses overprint settings (OP/op flags in ExtGState).', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: FLATTEN_OVERPRINT is critical-risk; never production_safe.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('overprint_detected'),
        expected_finding: PDFString.of('OVERPRINT_DETECTED'),
        expected_fix: PDFString.of('FLATTEN_OVERPRINT'),
        simulated_issue: PDFString.of('Overprint flags (OP=true) present in ExtGState resources')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing OPM (Overprint Mode) settings.
 * Expected fix: SIMULATE_OVERPRINT_PREVIEW
 */
async function createOverprintModeDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Overprint Mode Present Fixture');

    pdfDoc.setTitle('Overprint Mode Present Test Document');
    pdfDoc.setSubject('Phase 67A: Overprint Mode Present');

    page.drawText('Document has OPM (Overprint Mode) settings that affect color knockout.', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: SIMULATE_OVERPRINT_PREVIEW requires visual verification; never production_safe.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('overprint_mode_present'),
        expected_finding: PDFString.of('OVERPRINT_MODE_PRESENT'),
        expected_fix: PDFString.of('SIMULATE_OVERPRINT_PREVIEW'),
        simulated_issue: PDFString.of('OPM=1 in ExtGState, overprint mode active')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as having soft masks (opacity masks).
 * Expected fix: FLATTEN_TRANSPARENCY (soft masks are a transparency variant)
 */
async function createSoftMaskDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Soft Mask Present Fixture');

    pdfDoc.setTitle('Soft Mask Present Test Document');
    pdfDoc.setSubject('Phase 67A: Soft Mask Present');

    page.drawText('Document contains soft masks (SMask entries in ExtGState/XObject).', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: FLATTEN_TRANSPARENCY covers soft mask flattening; always review_required.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('soft_mask_present'),
        expected_finding: PDFString.of('SOFT_MASK_PRESENT'),
        expected_fix: PDFString.of('FLATTEN_TRANSPARENCY'),
        simulated_issue: PDFString.of('SMask (soft mask / opacity mask) entries in ExtGState')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Clean control — no transparency or overprint issues.
 */
async function createCleanControl(outPath) {
    const { pdfDoc, page } = await basePdf('Clean Control Fixture — No Transparency / Overprint Issues');

    pdfDoc.setTitle('Clean Control — Phase 67A');
    pdfDoc.setSubject('Phase 67A: Clean Control');

    page.drawText('This document has no simulated transparency or overprint issues.', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase67a_fixture: PDFString.of('clean_control'),
        expected_finding: PDFString.of('none')
    });
    pdfDoc.catalog.set(PDFName.of('Phase67AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'transparency_present.pdf', generator: createTransparencyPresentDocument, expected: 'transparency_present' },
        { name: 'blend_mode_detected.pdf', generator: createBlendModeDocument, expected: 'blend_mode_detected' },
        { name: 'overprint_detected.pdf', generator: createOverprintDocument, expected: 'overprint_detected' },
        { name: 'overprint_mode_present.pdf', generator: createOverprintModeDocument, expected: 'overprint_mode_present' },
        { name: 'soft_mask_present.pdf', generator: createSoftMaskDocument, expected: 'soft_mask_present' },
        { name: 'clean_control.pdf', generator: createCleanControl, expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase67a',
        category: 'transparency_overprint',
        note: 'Fixtures are metadata-annotated PDFs representing transparency/overprint fix scenarios. Physical transparency/overprint detection requires content-stream-level parsing beyond pdf-lib drawing primitives.',
        fixtures: []
    };

    for (const f of fixtures) {
        const outPath = path.join(FIXTURES_DIR, f.name);
        await f.generator(outPath);
        manifest.fixtures.push({
            filename: f.name,
            path: outPath,
            expected: f.expected
        });
        console.log(`Generated: ${f.name}`);
    }

    await fs.writeJson(path.join(REPORTS_DIR, 'phase67a_transparency_overprint_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase67a_transparency_overprint_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
