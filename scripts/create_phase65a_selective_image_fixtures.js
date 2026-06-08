const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFString, PDFNumber, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase65a');
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
 * Fixture: PDF flagged as containing RGB images destined for CMYK print.
 * Real per-image colorspace inspection requires content-stream/XObject parsing
 * beyond pdf-lib's drawing API; this fixture annotates the expected scenario.
 */
async function createRgbImagesDocument(outPath) {
    const { pdfDoc, page } = await basePdf('RGB Images Present Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('RGB Images Test Document');
    pdfDoc.setSubject('Phase 65A: RGB Images Present');

    page.drawText('Document contains DeviceRGB images intended for CMYK print (simulated)', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('rgb_images_present'),
        expected_finding: PDFString.of('RGB_IMAGES_PRESENT'),
        simulated_colorspace: PDFString.of('DeviceRGB')
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing images without an embedded ICC/colorspace tag.
 */
async function createUntaggedImageDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Untagged Image Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Untagged Image Test Document');
    pdfDoc.setSubject('Phase 65A: Untagged Image Detection');

    page.drawText('Document contains images with no embedded color profile / colorspace tag (simulated)', {
        x: 80, y: 600, size: 11, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('untagged_image'),
        expected_finding: PDFString.of('UNTAGGED_IMAGE')
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing images whose embedded ICC profile
 * mismatches the document OutputIntent.
 */
async function createImageIccMismatchDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Image ICC Mismatch Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Image ICC Mismatch Test Document');
    pdfDoc.setSubject('Phase 65A: Image ICC Profile Mismatch');

    page.drawText('Image ICC profile (sRGB) mismatches document OutputIntent (US Web Coated SWOP) — simulated', {
        x: 80, y: 600, size: 10, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('image_icc_mismatch'),
        expected_finding: PDFString.of('IMAGE_ICC_MISMATCH'),
        simulated_image_profile: PDFString.of('sRGB IEC61966-2.1'),
        simulated_output_intent: PDFString.of('U.S. Web Coated (SWOP) v2')
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing images at excessive resolution (> 450 DPI for print).
 */
async function createExcessiveResolutionDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Excessive Resolution Image Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Excessive Resolution Test Document');
    pdfDoc.setSubject('Phase 65A: Excessive Resolution Image Detection');

    page.drawText('Image effective resolution = 1200 DPI at placed size (simulated; > 450 DPI threshold)', {
        x: 80, y: 600, size: 10, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('excessive_resolution_image'),
        expected_finding: PDFString.of('EXCESSIVE_RESOLUTION_IMAGE'),
        simulated_effective_dpi: PDFNumber.of(1200)
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: PDF flagged as containing low-resolution images (< 150 DPI for print).
 * Policy: low-res images must be flagged, never upscaled/invented.
 */
async function createLowResImagesDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Low Resolution Images Fixture');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Low Resolution Images Test Document');
    pdfDoc.setSubject('Phase 65A: Low Resolution Images');

    page.drawText('Image effective resolution = 72 DPI at placed size (simulated; below 150 DPI print minimum)', {
        x: 80, y: 600, size: 10, color: rgb(0, 0, 0)
    });
    page.drawText('Policy: cannot be safely upscaled — must be flagged for source asset replacement.', {
        x: 80, y: 575, size: 9, color: rgb(0.3, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('low_res_images'),
        expected_finding: PDFString.of('LOW_RES_IMAGES'),
        simulated_effective_dpi: PDFNumber.of(72)
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Clean control — no image quality issues.
 */
async function createCleanControl(outPath) {
    const { pdfDoc, page } = await basePdf('Clean Control Fixture — No Image Issues');
    const ctx = pdfDoc.context;

    pdfDoc.setTitle('Clean Control — Phase 65A');
    pdfDoc.setSubject('Phase 65A: Clean Control');

    page.drawText('This document has no simulated image quality issues.', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });

    const infoDict = ctx.obj({
        phase65a_fixture: PDFString.of('clean_control'),
        expected_finding: PDFString.of('none')
    });
    pdfDoc.catalog.set(PDFName.of('Phase65AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'rgb_images_present.pdf', generator: createRgbImagesDocument, expected: 'rgb_images_present' },
        { name: 'untagged_image.pdf', generator: createUntaggedImageDocument, expected: 'untagged_image' },
        { name: 'image_icc_mismatch.pdf', generator: createImageIccMismatchDocument, expected: 'image_icc_mismatch' },
        { name: 'excessive_resolution_image.pdf', generator: createExcessiveResolutionDocument, expected: 'excessive_resolution_image' },
        { name: 'low_res_images.pdf', generator: createLowResImagesDocument, expected: 'low_res_images' },
        { name: 'clean_control.pdf', generator: createCleanControl, expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase65a',
        category: 'image_quality',
        note: 'Fixtures are metadata-annotated PDFs representing selective image quality scenarios. Physical per-image colorspace/resolution extraction requires content-stream/XObject parsing beyond pdf-lib drawing primitives.',
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

    await fs.writeJson(path.join(REPORTS_DIR, 'phase65a_selective_image_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase65a_selective_image_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
