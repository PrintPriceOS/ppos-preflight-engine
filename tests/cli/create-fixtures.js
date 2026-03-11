const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');

async function createFixture() {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]); // A4
    const pdfBytes = await pdfDoc.save();
    const fixturePath = path.join(__dirname, 'fixtures', 'small_valid.pdf');
    await fs.ensureDir(path.join(__dirname, 'fixtures'));
    await fs.writeFile(fixturePath, pdfBytes);
    console.log(`Fixture created at ${fixturePath}`);
}

createFixture().catch(console.error);
