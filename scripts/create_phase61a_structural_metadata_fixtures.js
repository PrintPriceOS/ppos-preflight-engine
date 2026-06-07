const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/phase61a');
const REPORTS_DIR = path.resolve(__dirname, '../reports');

async function createBasePdf() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.drawText('Phase 61A Fixture', { x: 50, y: 100 });
    return doc;
}

async function addOutputIntent(doc, standardStr) {
    const outputIntentDict = doc.context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of(standardStr),
        OutputConditionIdentifier: PDFString.of('Custom Profile')
    });
    const outputIntentRef = doc.context.register(outputIntentDict);
    doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntentRef]));
}

async function run() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const manifest = {
        name: "Phase 61A Structural and Metadata Fixtures",
        fixtures: []
    };

    // 1. object_streams_candidate.pdf
    const doc1 = await createBasePdf();
    await fs.writeFile(path.join(FIXTURES_DIR, 'object_streams_candidate.pdf'), await doc1.save({ useObjectStreams: false }));
    manifest.fixtures.push({ id: 'object_streams_candidate', file: 'object_streams_candidate.pdf', description: 'PDF to normalize object streams' });

    // 2. fake_pdfx_claim.pdf
    const doc2 = await createBasePdf();
    await addOutputIntent(doc2, 'GTS_PDFX');
    await fs.writeFile(path.join(FIXTURES_DIR, 'fake_pdfx_claim.pdf'), await doc2.save());
    manifest.fixtures.push({ id: 'fake_pdfx_claim', file: 'fake_pdfx_claim.pdf', description: 'Fake PDF/X claim' });

    // 3. fake_pdfa_claim.pdf
    const doc3 = await createBasePdf();
    await addOutputIntent(doc3, 'GTS_PDFA1');
    await fs.writeFile(path.join(FIXTURES_DIR, 'fake_pdfa_claim.pdf'), await doc3.save());
    manifest.fixtures.push({ id: 'fake_pdfa_claim', file: 'fake_pdfa_claim.pdf', description: 'Fake PDF/A claim' });

    // 4. conflicting_standard_metadata.pdf
    const doc4 = await createBasePdf();
    const outputIntentDict4 = doc4.context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of('GTS_PDFX'),
        OutputConditionIdentifier: PDFString.of('Custom Profile')
    });
    const outputIntentDict4b = doc4.context.obj({
        Type: PDFName.of('OutputIntent'),
        S: PDFName.of('GTS_PDFA1'),
        OutputConditionIdentifier: PDFString.of('Custom Profile')
    });
    const outputIntentRef4 = doc4.context.register(outputIntentDict4);
    const outputIntentRef4b = doc4.context.register(outputIntentDict4b);
    doc4.catalog.set(PDFName.of('OutputIntents'), doc4.context.obj([outputIntentRef4, outputIntentRef4b]));
    await fs.writeFile(path.join(FIXTURES_DIR, 'conflicting_standard_metadata.pdf'), await doc4.save());
    manifest.fixtures.push({ id: 'conflicting_standard_metadata', file: 'conflicting_standard_metadata.pdf', description: 'Conflicting standards claims' });

    // 5. certified_filename_no_standard.pdf
    const doc5 = await createBasePdf();
    await fs.writeFile(path.join(FIXTURES_DIR, 'certified_filename_no_standard.pdf'), await doc5.save());
    manifest.fixtures.push({ id: 'certified_filename_no_standard', file: 'certified_filename_no_standard.pdf', description: 'Certified filename but no claim inside' });

    // 6. clean_control.pdf
    const doc6 = await createBasePdf();
    await fs.writeFile(path.join(FIXTURES_DIR, 'clean_control.pdf'), await doc6.save());
    manifest.fixtures.push({ id: 'clean_control', file: 'clean_control.pdf', description: 'Clean normal PDF' });

    await fs.writeJson(path.join(REPORTS_DIR, 'phase61a_structural_metadata_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log(`Created ${manifest.fixtures.length} fixtures for Phase 61A.`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
