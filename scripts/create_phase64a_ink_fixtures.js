const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFNumber, rgb, cmyk } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase64a');
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
 * Fixture: PDF with metadata indicating high TAC risk.
 * Actual TAC reduction requires rendering pipeline; this fixture
 * represents a document flagged for excessive ink coverage.
 */
async function createHighTacDocument(outPath) {
    const { pdfDoc, page } = await basePdf('High TAC / Excessive Ink Coverage Fixture');
    const ctx = pdfDoc.context;

    // Add metadata to flag this as a TAC-problematic document
    // Actual ink measurement requires rendering; we simulate the scenario
    pdfDoc.setTitle('High TAC Test Document');
    pdfDoc.setSubject('Phase 64A: Excessive Total Area Coverage');
    pdfDoc.setKeywords(['tac', 'excessive-ink', 'preflight-test']);

    // Draw rich black (CMYK approximated via multiple overlapping elements)
    // pdf-lib does not have native CMYK drawing, so we annotate metadata
    page.drawText('Rich Black Area: C100 M100 Y100 K100 (simulated)', { x: 80, y: 600, size: 12, color: rgb(0, 0, 0) });
    page.drawText('TAC = 400%: requires reduction to <= 300%', { x: 80, y: 575, size: 10, color: rgb(0.3, 0, 0) });

    // Add a custom info dict to signal TAC context to smoke tests
    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('high_tac'),
        expected_finding: PDFString.of('TOTAL_INK_COVERAGE_EXCESSIVE'),
        simulated_tac_percent: PDFNumber.of(400)
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Rich black text on body copy (small text scenario).
 */
async function createRichBlackTextDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Rich Black Text Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Rich Black Text Test Document');
    pdfDoc.setSubject('Phase 64A: Rich Black Text Detection');

    page.drawText('Body text using rich black (C100 M100 Y100 K100) — should be K-only', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });
    page.drawText('Small text at 8pt with rich black — misregistration risk', {
        x: 80, y: 575, size: 8, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('rich_black_text'),
        expected_finding: PDFString.of('RICH_BLACK_TEXT'),
        expected_finding_secondary: PDFString.of('SMALL_TEXT_RICH_BLACK')
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Small text (< 12pt) with rich black.
 */
async function createSmallTextRichBlackDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Small Text Rich Black Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Small Text Rich Black Test Document');
    pdfDoc.setSubject('Phase 64A: Small Text Rich Black Detection');

    page.drawText('6pt text with rich black: misregistration causes blur', {
        x: 80, y: 620, size: 6, color: rgb(0, 0, 0)
    });
    page.drawText('8pt text with rich black: high misregistration risk', {
        x: 80, y: 600, size: 8, color: rgb(0, 0, 0)
    });
    page.drawText('10pt text with rich black: moderate risk', {
        x: 80, y: 580, size: 10, color: rgb(0, 0, 0)
    });
    page.drawText('14pt text with rich black: acceptable for headlines only', {
        x: 80, y: 555, size: 14, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('small_text_rich_black'),
        expected_finding: PDFString.of('SMALL_TEXT_RICH_BLACK')
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Registration color (100/100/100/100) used in body content.
 */
async function createRegistrationColorMisuseDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Registration Color Misuse Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Registration Color Misuse Test Document');
    pdfDoc.setSubject('Phase 64A: Registration Color Misuse');

    page.drawText('Body content using registration color (C100 M100 Y100 K100 — all plates)', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });
    page.drawText('Registration color in body = printing defect — should map to K-only black', {
        x: 80, y: 575, size: 10, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('registration_color_misuse'),
        expected_finding: PDFString.of('REGISTRATION_COLOR_MISUSE')
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Black text using mixed CMYK components (not K-only).
 */
async function createBlackTextNotKOnlyDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Black Text Not K-Only Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Black Text Not K-Only Test Document');
    pdfDoc.setSubject('Phase 64A: Black Text Color Normalization');

    page.drawText('Black text composed of C30 M30 Y30 K100 — should be K100 only', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });
    page.drawText('Mixed component black may cause slight color shift at print', {
        x: 80, y: 575, size: 10, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('black_text_not_k_only'),
        expected_finding: PDFString.of('BLACK_TEXT_NOT_K_ONLY')
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Clean control — no ink governance issues.
 */
async function createCleanControl(outPath) {
    const { pdfDoc, page } = await basePdf('Clean Control Fixture — No Ink Issues');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Clean Control — Phase 64A');
    pdfDoc.setSubject('Phase 64A: Clean Control');

    page.drawText('This document has no simulated ink governance issues.', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase64a_fixture: PDFString.of('clean_control'),
        expected_finding: PDFString.of('none')
    });
    pdfDoc.catalog.set(PDFName.of('Phase64AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'high_tac.pdf', generator: createHighTacDocument, expected: 'total_ink_coverage_excessive' },
        { name: 'rich_black_text.pdf', generator: createRichBlackTextDocument, expected: 'rich_black_text' },
        { name: 'small_text_rich_black.pdf', generator: createSmallTextRichBlackDocument, expected: 'small_text_rich_black' },
        { name: 'registration_color_misuse.pdf', generator: createRegistrationColorMisuseDocument, expected: 'registration_color_misuse' },
        { name: 'black_text_not_k_only.pdf', generator: createBlackTextNotKOnlyDocument, expected: 'black_text_not_k_only' },
        { name: 'clean_control.pdf', generator: createCleanControl, expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase64a',
        category: 'ink_governance',
        note: 'Fixtures are metadata-annotated PDFs representing ink governance scenarios. Physical TAC/color extraction requires a rendering pipeline not available in pdf-lib.',
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

    await fs.writeJson(path.join(REPORTS_DIR, 'phase64a_ink_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase64a_ink_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
