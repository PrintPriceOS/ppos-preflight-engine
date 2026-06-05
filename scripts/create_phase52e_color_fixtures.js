const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, cmyk } = require('pdf-lib');

const fixturesDir = path.join(__dirname, '../fixtures/phase52e');
if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1x1 Red PNG Base64
const pngImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const manifest = [];

async function generateRgbText() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    page.drawText('This is RGB text', { x: 50, y: 400, size: 24, color: rgb(1, 0, 0) });
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'rgb_text_device_rgb.pdf');
    fs.writeFileSync(filePath, bytes);
    manifest.push({
        fixture: 'rgb_text_device_rgb.pdf',
        created: true,
        valid_pdf: true,
        expected_findings: ['RGB_DEVICE_COLOR', 'DEVICE_RGB_USAGE'],
        notes: []
    });
}

async function generateRgbImage() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    const image = await doc.embedPng(Buffer.from(pngImageBase64, 'base64'));
    page.drawImage(image, { x: 50, y: 300, width: 100, height: 100 });
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'rgb_image.pdf');
    fs.writeFileSync(filePath, bytes);
    manifest.push({
        fixture: 'rgb_image.pdf',
        created: true,
        valid_pdf: true,
        expected_findings: ['RGB_IMAGES', 'RGB_DEVICE_COLOR'],
        notes: []
    });
}

async function generateMixedRgbCmyk() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    page.drawText('This is RGB text', { x: 50, y: 400, size: 24, color: rgb(1, 0, 0) });
    page.drawText('This is CMYK text', { x: 50, y: 350, size: 24, color: cmyk(1, 0, 0, 0) });
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'mixed_rgb_cmyk.pdf');
    fs.writeFileSync(filePath, bytes);
    manifest.push({
        fixture: 'mixed_rgb_cmyk.pdf',
        created: true,
        valid_pdf: true,
        expected_findings: ['MIXED_RGB_CMYK'],
        notes: []
    });
}

async function generateMissingOutputIntent() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    page.drawText('This is CMYK text, no OutputIntent', { x: 50, y: 400, size: 24, color: cmyk(1, 0, 0, 0) });
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'missing_outputintent.pdf');
    fs.writeFileSync(filePath, bytes);
    manifest.push({
        fixture: 'missing_outputintent.pdf',
        created: true,
        valid_pdf: true,
        expected_findings: ['MISSING_OUTPUT_INTENT'],
        notes: []
    });
}

async function generateRgbConvertCmyk() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    page.drawText('Convert me to CMYK', { x: 50, y: 400, size: 24, color: rgb(0, 1, 0) });
    const bytes = await doc.save();
    const filePath = path.join(fixturesDir, 'rgb_convert_cmyk.pdf');
    fs.writeFileSync(filePath, bytes);
    manifest.push({
        fixture: 'rgb_convert_cmyk.pdf',
        created: true,
        valid_pdf: true,
        expected_findings: ['RGB_DEVICE_COLOR'],
        notes: []
    });
}

async function run() {
    console.log("Generating physical Phase 52E color fixtures...");
    
    await generateRgbText();
    await generateRgbImage();
    await generateMixedRgbCmyk();
    await generateMissingOutputIntent();
    await generateRgbConvertCmyk();

    // Deferred difficult fixtures
    manifest.push({
        fixture: 'icc_mismatch_or_profile_conflict.pdf',
        created: false,
        valid_pdf: false,
        expected_findings: ['ICC_MISMATCH', 'INVALID_OUTPUT_INTENT'],
        notes: ['Deferred: Difficult to generate reliable conflicting ICC profiles directly in pdf-lib']
    });

    manifest.push({
        fixture: 'rich_black_text.pdf',
        created: false,
        valid_pdf: false,
        expected_findings: ['RICH_BLACK_TEXT'],
        notes: ['Deferred: Explicit text rich black detection requires more complex objects']
    });

    manifest.push({
        fixture: 'registration_color_misuse.pdf',
        created: false,
        valid_pdf: false,
        expected_findings: ['REGISTRATION_COLOR_MISUSE'],
        notes: ['Deferred: Registration color misuse generation deferred']
    });

    manifest.push({
        fixture: 'excessive_tac.pdf',
        created: false,
        valid_pdf: false,
        expected_findings: ['EXCESSIVE_TAC'],
        notes: ['Deferred: Generating exact TAC coverage violations deferred']
    });

    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    
    fs.writeFileSync(path.join(reportsDir, 'phase52e_color_fixture_manifest.json'), JSON.stringify(manifest, null, 2));
    
    console.log("Fixtures generated in fixtures/phase52e/");
}

run().catch(err => {
    console.error("Failed to generate fixtures:", err);
    process.exit(1);
});
