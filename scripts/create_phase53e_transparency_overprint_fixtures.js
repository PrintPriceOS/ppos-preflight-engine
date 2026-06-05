const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase53e');
const REPORTS_DIR = path.join(__dirname, '../reports');

const MANIFEST_PATH = path.join(REPORTS_DIR, 'phase53e_transparency_overprint_fixture_manifest.json');

async function createFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const manifest = [];

  // 1. transparency_basic.pdf
  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 500]);
    // Draw something with transparency
    page.drawRectangle({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      color: rgb(1, 0, 0),
      opacity: 0.5 // This creates a transparent ExtGState
    });
    const bytes = await doc.save();
    const filepath = path.join(FIXTURES_DIR, 'transparency_basic.pdf');
    fs.writeFileSync(filepath, bytes);
    
    // validate %PDF
    const isPdf = Buffer.from(bytes.slice(0, 4)).toString() === '%PDF';

    manifest.push({
      fixture: "transparency_basic.pdf",
      fixture_created: true,
      valid_pdf: isPdf,
      expected_findings: ["TRANSPARENCY_PRESENT"],
      generation_method: "pdf-lib",
      fixture_gap: false,
      deferred: false,
      notes: ["Generated using pdf-lib rectangle with opacity"]
    });
  } catch (e) {
    manifest.push({
      fixture: "transparency_basic.pdf",
      fixture_created: false,
      valid_pdf: false,
      expected_findings: ["TRANSPARENCY_PRESENT"],
      generation_method: "pdf-lib",
      fixture_gap: true,
      deferred: true,
      notes: ["Failed to generate: " + e.message]
    });
  }

  // Helper for deferred fixtures
  const deferredFixtures = [
    { name: 'soft_mask.pdf', findings: ['SOFT_MASK_PRESENT'], reason: 'pdf-lib lacks native soft mask API' },
    { name: 'blend_mode.pdf', findings: ['BLEND_MODE_PRESENT'], reason: 'pdf-lib lacks native blend mode API' },
    { name: 'overprint_basic.pdf', findings: ['OVERPRINT_PRESENT', 'OVERPRINT_MODE_PRESENT'], reason: 'pdf-lib lacks native overprint API' },
    { name: 'knockout_group.pdf', findings: ['KNOCKOUT_GROUP_PRESENT'], reason: 'pdf-lib lacks native knockout group API' },
    { name: 'rasterization_risk.pdf', findings: ['RASTERIZATION_RISK', 'TRANSPARENCY_PRESENT'], reason: 'Complex transparency tree not easily generated' },
    { name: 'pdfx_transparency_conflict.pdf', findings: ['UNSUPPORTED_TRANSPARENCY_FOR_PDFX'], reason: 'PDF/X simulated conflict not easily generated' },
  ];

  for (const f of deferredFixtures) {
    manifest.push({
      fixture: f.name,
      fixture_created: false,
      valid_pdf: false,
      expected_findings: f.findings,
      generation_method: "deferred",
      fixture_gap: true,
      deferred: true,
      notes: [f.reason]
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Created manifest at ${MANIFEST_PATH}`);
  console.log(`Generated ${manifest.filter(m => m.fixture_created).length} fixtures.`);
}

createFixtures().catch(console.error);
