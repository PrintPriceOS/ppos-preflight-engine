const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const fixturesDir = path.join(__dirname, '../fixtures/phase55e');
const reportsDir = path.join(__dirname, '../reports');

if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

const manifestPath = path.join(reportsDir, 'phase55e_standards_fixture_manifest.json');

const manifest = [];

async function createBasicPdf(filePath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    page.drawText('Test PDF', { x: 50, y: 700 });
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filePath, pdfBytes);
}

async function createFakePdfx(filePath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    page.drawText('Fake PDF/X', { x: 50, y: 700 });
    
    // Set some custom metadata properties to simulate a fake claim
    pdfDoc.setTitle('Fake PDF/X File');
    pdfDoc.setAuthor('Test Script');
    pdfDoc.setSubject('PDF/X');
    
    // pdf-lib doesn't easily let us inject raw XMP without extensions or low-level manipulation, 
    // but we can set basic properties that a naive detector might interpret as PDF/X or we just rely on filename or simple properties for our tests.
    // Actually, we can add a custom dictionary entry.
    // For now we just create a file and let the engine test report the gap if it can't detect it, or we simulate the finding.
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filePath, pdfBytes);
}

async function run() {
    console.log("Generating Phase 55E real PDF standards fixtures...");

    // 1. basic_no_pdfx.pdf
    await createBasicPdf(path.join(fixturesDir, 'basic_no_pdfx.pdf'));
    manifest.push({
        fixture: "basic_no_pdfx.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: ["PDFX_MISSING", "PDF_STANDARD_UNKNOWN", "STANDARD_VALIDATION_REQUIRED"],
        expected_capability_results: [],
        generation_method: "pdf-lib",
        fixture_gap: false,
        validator_gap: true,
        deferred: false,
        notes: []
    });

    // 2. outputintent_not_pdfx.pdf
    await createBasicPdf(path.join(fixturesDir, 'outputintent_not_pdfx.pdf'));
    manifest.push({
        fixture: "outputintent_not_pdfx.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: ["OUTPUTINTENT_PRESENT_NOT_PDFX", "PDF_STANDARD_UNKNOWN"],
        expected_capability_results: [],
        generation_method: "pdf-lib",
        fixture_gap: true, // We couldn't properly inject OutputIntent with pdf-lib without ICC
        validator_gap: true,
        deferred: true,
        notes: ["Deferred because pdf-lib OutputIntent injection requires valid ICC profile bytes"]
    });

    // 3. fake_pdfx_metadata.pdf
    await createFakePdfx(path.join(fixturesDir, 'fake_pdfx_metadata.pdf'));
    manifest.push({
        fixture: "fake_pdfx_metadata.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: ["PDFX_CLAIMED_BUT_NOT_VALIDATED", "PDFX_METADATA_CONFLICT"],
        expected_capability_results: [],
        generation_method: "pdf-lib|fake-metadata",
        fixture_gap: true,
        validator_gap: true,
        deferred: true,
        notes: ["Deferred due to difficulty synthesizing exact PDF/X XMP metadata in pure JS"]
    });

    // 4. conflicting_pdfx_metadata.pdf
    manifest.push({
        fixture: "conflicting_pdfx_metadata.pdf",
        fixture_created: false,
        valid_pdf: false,
        expected_findings: ["PDFX_METADATA_CONFLICT", "PDFX_CLAIMED_BUT_NOT_VALIDATED"],
        expected_capability_results: [],
        generation_method: "deferred",
        fixture_gap: true,
        validator_gap: true,
        deferred: true,
        notes: ["Deferred: Synthesizing conflicting metadata reliably is complex"]
    });

    // 5. fake_pdfa_metadata.pdf
    manifest.push({
        fixture: "fake_pdfa_metadata.pdf",
        fixture_created: false,
        valid_pdf: false,
        expected_findings: ["PDFA_METADATA_CONFLICT", "PDF_STANDARD_UNKNOWN", "STANDARD_VALIDATION_REQUIRED"],
        expected_capability_results: [],
        generation_method: "deferred",
        fixture_gap: true,
        validator_gap: true,
        deferred: true,
        notes: ["Deferred: Synthesizing fake PDF/A metadata is complex"]
    });

    // 6. certified_filename_no_validator.pdf
    await createBasicPdf(path.join(fixturesDir, 'certified_filename_no_validator.pdf'));
    manifest.push({
        fixture: "certified_filename_no_validator.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: ["CERTIFIED_PDF_NOT_STANDARD_CERTIFIED", "STANDARD_VALIDATION_REQUIRED"],
        expected_capability_results: [],
        generation_method: "pdf-lib",
        fixture_gap: false,
        validator_gap: true,
        deferred: false,
        notes: []
    });

    // 7. outputintent_injected_fixture.pdf
    await createBasicPdf(path.join(fixturesDir, 'outputintent_injected_fixture.pdf'));
    manifest.push({
        fixture: "outputintent_injected_fixture.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: [],
        expected_capability_results: [],
        generation_method: "pdf-lib",
        fixture_gap: false,
        validator_gap: true,
        deferred: false,
        notes: ["Used to test INJECT_OUTPUT_INTENT behavior"]
    });

    // 8. validator_unavailable_fixture.pdf
    await createBasicPdf(path.join(fixturesDir, 'validator_unavailable_fixture.pdf'));
    manifest.push({
        fixture: "validator_unavailable_fixture.pdf",
        fixture_created: true,
        valid_pdf: true,
        expected_findings: ["STANDARD_VALIDATOR_UNAVAILABLE"],
        expected_capability_results: [],
        generation_method: "pdf-lib",
        fixture_gap: false,
        validator_gap: true,
        deferred: false,
        notes: ["Tests VALIDATE_PDFX when no validator is available"]
    });
    
    // 9. validated_pdfx_pass_fixture.pdf
    manifest.push({
        fixture: "validated_pdfx_pass_fixture.pdf",
        fixture_created: false,
        valid_pdf: false,
        expected_findings: [],
        expected_capability_results: [],
        generation_method: "deferred",
        fixture_gap: true,
        validator_gap: true,
        deferred: true,
        notes: ["Deferred until a real validator is implemented"]
    });

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Generated ${manifest.filter(m => m.fixture_created).length} physical fixtures.`);
    console.log(`Manifest saved to ${manifestPath}`);
}

run().catch(console.error);
