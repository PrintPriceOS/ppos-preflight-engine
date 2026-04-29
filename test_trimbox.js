const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const PreflightEngine = require('./core/PreflightEngine');
const GeometryAuditEngine = require('./engine/GeometryAuditEngine');

async function createTestPdfs() {
    // 1. PDF Without TrimBox
    const doc1 = await PDFDocument.create();
    const page1 = doc1.addPage([595.28, 841.89]); // A4
    await fs.writeFile('test_artifacts/no_trimbox.pdf', await doc1.save());

    // 2. PDF With TrimBox
    const doc2 = await PDFDocument.create();
    const page2 = doc2.addPage([595.28, 841.89]);
    page2.setTrimBox(10, 10, 575.28, 821.89);
    await fs.writeFile('test_artifacts/has_trimbox.pdf', await doc2.save());
}

async function runTests() {
    await fs.ensureDir('test_artifacts');
    await createTestPdfs();

    const engine = new PreflightEngine([new GeometryAuditEngine()]);

    console.log('--- TEST 1: PDF without TrimBox ---');
    const res1 = await engine.analyzePdf('test_artifacts/no_trimbox.pdf', {
        metadata: { geometry: { bleedBox: [0, 0, 595, 842], trimBox: null } }
    });
    const trimboxIssue = res1.issues.find(i => i.id === 'TRIMBOX_MISSING');
    console.log('Detected TRIMBOX_MISSING?', !!trimboxIssue);
    console.log('Fixable?', trimboxIssue?.fixable);
    
    if (trimboxIssue?.fixable) {
        const fixPlan = {
            type: 'geometry',
            strategy: trimboxIssue.repairStrategy
        };
        const fixRes = await engine.autofixPdf('test_artifacts/no_trimbox.pdf', fixPlan, { outputDir: 'test_artifacts' });
        console.log('Fix applied?', fixRes.ok);
        console.log('Repairs output:', fixRes.repairs);
        
        // Verify output PDF has TrimBox
        const fixedBytes = await fs.readFile(fixRes.fixedPath);
        const fixedDoc = await PDFDocument.load(fixedBytes);
        const fixedPage = fixedDoc.getPages()[0];
        const trimBox = fixedPage.getTrimBox();
        const mediaBox = fixedPage.getMediaBox();
        console.log('Fixed PDF TrimBox:', trimBox);
        console.log('Fixed PDF MediaBox:', mediaBox);
        console.log('MediaBox == TrimBox?', 
            mediaBox.width === trimBox.width && mediaBox.height === trimBox.height
        );
    }

    console.log('\n--- TEST 2: PDF already valid ---');
    const res2 = await engine.analyzePdf('test_artifacts/has_trimbox.pdf', {
        metadata: { geometry: { bleedBox: [0, 0, 595, 842], trimBox: [10, 10, 585, 832] } }
    });
    const trimboxIssue2 = res2.issues.find(i => i.id === 'TRIMBOX_MISSING');
    console.log('Detected TRIMBOX_MISSING?', !!trimboxIssue2);
}

runTests().catch(console.error);
