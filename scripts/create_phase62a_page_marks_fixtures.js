const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase62a');
const REPORTS_DIR = path.join(__dirname, '../reports');

async function createMissingCropMarksSafeMargin(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]); // MediaBox
    
    // Enough margin: TrimBox 100pt inside
    page.setTrimBox(100, 100, 500, 700); // x, y, right, top -> but pdf-lib is x,y,w,h so:
    // Wait, pdf-lib setTrimBox might take x, y, width, height or a box array?
    // Actually setTrimBox in pdf-lib usually takes (x, y, width, height)? Wait, the API for setTrimBox is usually not directly available unless we do page.node.set(...) or page.setTrimBox?
    // pdf-lib's setTrimBox was added. Let's assume standard pdf-lib (it's actually page.setTrimBox(x, y, width, height) maybe? No, let's use node.set)
    // Actually we can do this safely:
    
    const { PDFName } = require('pdf-lib');
    const trimBox = pdfDoc.context.obj([100, 100, 500, 700]); // [llx, lly, urx, ury]
    page.node.set(PDFName.of('TrimBox'), trimBox);
    page.node.set(PDFName.of('BleedBox'), pdfDoc.context.obj([90, 90, 510, 710]));

    page.drawText('Safe Margin Artwork', { x: 200, y: 400, size: 24, color: rgb(0, 0, 0) });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function createMissingCropMarksNoMargin(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]); // MediaBox
    
    const { PDFName } = require('pdf-lib');
    // No margin: TrimBox is same as MediaBox
    const trimBox = pdfDoc.context.obj([0, 0, 600, 800]); 
    page.node.set(PDFName.of('TrimBox'), trimBox);

    page.drawText('No Margin Artwork', { x: 200, y: 400, size: 24, color: rgb(0, 0, 0) });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function createExistingRegistrationMarksOutsideTrim(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    const { PDFName } = require('pdf-lib');
    const trimBox = pdfDoc.context.obj([100, 100, 500, 700]);
    page.node.set(PDFName.of('TrimBox'), trimBox);

    page.drawText('Center Artwork', { x: 200, y: 400, size: 24 });
    // Fake registration marks
    page.drawText('REG_MARK', { x: 50, y: 50, size: 10 }); // outside

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function createRegistrationMarksInsideTrim(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    const { PDFName } = require('pdf-lib');
    const trimBox = pdfDoc.context.obj([100, 100, 500, 700]);
    page.node.set(PDFName.of('TrimBox'), trimBox);

    page.drawText('Center Artwork', { x: 200, y: 400, size: 24 });
    // Fake registration marks inside trim
    page.drawText('REG_MARK', { x: 150, y: 150, size: 10 }); // inside

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function createInconsistentPageMarks(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    const { PDFName } = require('pdf-lib');
    const trimBox = pdfDoc.context.obj([100, 100, 500, 700]);
    page.node.set(PDFName.of('TrimBox'), trimBox);

    page.drawText('Inconsistent Marks', { x: 200, y: 400, size: 24 });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function createCleanControl(outPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    const { PDFName } = require('pdf-lib');
    const trimBox = pdfDoc.context.obj([100, 100, 500, 700]);
    page.node.set(PDFName.of('TrimBox'), trimBox);

    page.drawText('Clean Control', { x: 200, y: 400, size: 24 });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'missing_crop_marks_safe_margin.pdf', generator: createMissingCropMarksSafeMargin, marks_expected: 'safe' },
        { name: 'missing_crop_marks_no_margin.pdf', generator: createMissingCropMarksNoMargin, marks_expected: 'unsafe_margin' },
        { name: 'existing_registration_marks_outside_trim.pdf', generator: createExistingRegistrationMarksOutsideTrim, marks_expected: 'outside' },
        { name: 'registration_marks_inside_trim.pdf', generator: createRegistrationMarksInsideTrim, marks_expected: 'inside' },
        { name: 'inconsistent_page_marks.pdf', generator: createInconsistentPageMarks, marks_expected: 'inconsistent' },
        { name: 'clean_control.pdf', generator: createCleanControl, marks_expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        fixtures: []
    };

    for (const f of fixtures) {
        const outPath = path.join(FIXTURES_DIR, f.name);
        await f.generator(outPath);
        manifest.fixtures.push({
            filename: f.name,
            path: outPath,
            expected: f.marks_expected
        });
        console.log(`Generated: ${f.name}`);
    }

    await fs.writeJson(path.join(REPORTS_DIR, 'phase62a_page_marks_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase62a_page_marks_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
