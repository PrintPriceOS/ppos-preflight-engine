const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFString, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase66a');
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
 * Fixture: PDF flagged as containing non-embedded fonts.
 * Real per-font embedding-flag inspection requires font-dictionary parsing
 * beyond pdf-lib's drawing API; this fixture annotates the expected scenario.
 */
async function createFontsNotEmbeddedDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Fonts Not Embedded Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Fonts Not Embedded Test Document');
    pdfDoc.setSubject('Phase 66A: Fonts Not Embedded');

    page.drawText('Document references fonts with no embedded font program (simulated)', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('fonts_not_embedded'),
        expected_finding: PDFString.of('FONTS_NOT_EMBEDDED')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing subsetted embedded fonts.
 */
async function createFontSubsetDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Font Subset Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Font Subset Test Document');
    pdfDoc.setSubject('Phase 66A: Font Subset Detected');

    page.drawText('Document contains fonts embedded as subsets (simulated; e.g. ABCDEF+Helvetica)', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('font_subset'),
        expected_finding: PDFString.of('FONT_SUBSET'),
        simulated_subset_prefix: PDFString.of('ABCDEF+')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing Type 3 (bitmap/procedure) fonts.
 */
async function createType3FontsDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Type3 Fonts Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Type3 Fonts Test Document');
    pdfDoc.setSubject('Phase 66A: Type3 Fonts Present');

    page.drawText('Document contains Type 3 (procedure-based) font definitions (simulated)', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('type3_fonts_present'),
        expected_finding: PDFString.of('TYPE3_FONTS_PRESENT'),
        simulated_font_subtype: PDFString.of('Type3')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as having an invalid/corrupted font encoding (CMap mismatch).
 */
async function createFontEncodingInvalidDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Font Encoding Invalid Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Font Encoding Invalid Test Document');
    pdfDoc.setSubject('Phase 66A: Font Encoding Invalid');

    page.drawText('Font Encoding/CMap does not match glyph-to-character mapping (simulated)', {
        x: 80, y: 600, size: 10, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('font_encoding_invalid'),
        expected_finding: PDFString.of('FONT_ENCODING_INVALID'),
        simulated_encoding: PDFString.of('Custom/Differences-mismatch')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing characters with no corresponding glyph in the font.
 * Policy: missing glyphs must be flagged, never invented/synthesized.
 */
async function createMissingGlyphsDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Missing Glyphs Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Missing Glyphs Test Document');
    pdfDoc.setSubject('Phase 66A: Missing Glyphs');

    page.drawText('Document references characters with no corresponding glyph in the embedded font (simulated)', {
        x: 80, y: 600, size: 10, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: missing glyphs cannot be synthesized — must be flagged for source font replacement.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('missing_glyphs'),
        expected_finding: PDFString.of('MISSING_GLYPHS')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Clean control — no font issues.
 */
async function createCleanControl(outPath) {
    const { pdfDoc, page } = await basePdf('Clean Control Fixture — No Font Issues');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Clean Control — Phase 66A');
    pdfDoc.setSubject('Phase 66A: Clean Control');

    page.drawText('This document has no simulated font issues.', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase66a_fixture: PDFString.of('clean_control'),
        expected_finding: PDFString.of('none')
    });
    pdfDoc.catalog.set(PDFName.of('Phase66AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'fonts_not_embedded.pdf', generator: createFontsNotEmbeddedDocument, expected: 'fonts_not_embedded' },
        { name: 'font_subset.pdf', generator: createFontSubsetDocument, expected: 'font_subset' },
        { name: 'type3_fonts_present.pdf', generator: createType3FontsDocument, expected: 'type3_fonts_present' },
        { name: 'font_encoding_invalid.pdf', generator: createFontEncodingInvalidDocument, expected: 'font_encoding_invalid' },
        { name: 'missing_glyphs.pdf', generator: createMissingGlyphsDocument, expected: 'missing_glyphs' },
        { name: 'clean_control.pdf', generator: createCleanControl, expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase66a',
        category: 'font_governance',
        note: 'Fixtures are metadata-annotated PDFs representing font fix scenarios. Physical per-font embedding/encoding/glyph-coverage extraction requires font-dictionary parsing beyond pdf-lib drawing primitives.',
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

    await fs.writeJson(path.join(REPORTS_DIR, 'phase66a_font_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase66a_font_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
