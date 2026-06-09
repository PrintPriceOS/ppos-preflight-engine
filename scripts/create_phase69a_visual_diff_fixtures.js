'use strict';

const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFString, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase69a');
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
 * Fixture: Original PDF — baseline for visual diff comparison.
 */
async function createOriginalDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Original Document — Phase 69A Visual Diff Fixture');

    pdfDoc.setTitle('Original Document — Phase 69A');
    pdfDoc.setSubject('Phase 69A: Visual Diff Baseline');

    page.drawText('This is the original (unfixed) version of the document.', {
        x: 80, y: 620, size: 12, color: rgb(0, 0, 0)
    });
    page.drawText('It serves as the baseline for visual diff comparison.', {
        x: 80, y: 598, size: 11, color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Governance: Visual diff is evidence generation only.', {
        x: 80, y: 560, size: 9, color: rgb(0.4, 0, 0)
    });
    page.drawText('Visual diff does not imply print-ready or production certification.', {
        x: 80, y: 542, size: 9, color: rgb(0.4, 0, 0)
    });

    // Large black rectangle — will differ from fixed version
    page.drawRectangle({ x: 80, y: 200, width: 400, height: 200, color: rgb(0, 0, 0) });
    page.drawText('ORIGINAL CONTENT BLOCK', { x: 140, y: 290, size: 16, color: rgb(1, 1, 1) });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase69a_fixture: PDFString.of('original_document'),
        expected_comparison: PDFString.of('COMPARE_ORIGINAL_TO_FIXED'),
        fixture_version: PDFString.of('original')
    });
    pdfDoc.catalog.set(PDFName.of('Phase69AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Fixed PDF — modified version for visual diff comparison.
 * Contains a visible change versus the original.
 */
async function createFixedDocument(outPath) {
    const { pdfDoc, page } = await basePdf('Fixed Document — Phase 69A Visual Diff Fixture');

    pdfDoc.setTitle('Fixed Document — Phase 69A');
    pdfDoc.setSubject('Phase 69A: Visual Diff Fixed Version');

    page.drawText('This is the fixed version of the document.', {
        x: 80, y: 620, size: 12, color: rgb(0, 0, 0)
    });
    page.drawText('It contains intentional visual changes versus the original.', {
        x: 80, y: 598, size: 11, color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Governance: Visual diff is evidence generation only.', {
        x: 80, y: 560, size: 9, color: rgb(0.4, 0, 0)
    });
    page.drawText('A passing visual diff does NOT imply the fixed PDF is print-ready.', {
        x: 80, y: 542, size: 9, color: rgb(0.4, 0, 0)
    });

    // Changed rectangle — different color from original
    page.drawRectangle({ x: 80, y: 200, width: 400, height: 200, color: rgb(0.1, 0.3, 0.7) });
    page.drawText('FIXED CONTENT BLOCK', { x: 145, y: 290, size: 16, color: rgb(1, 1, 1) });

    const ctx = pdfDoc.context;
    const infoDict = ctx.obj({
        phase69a_fixture: PDFString.of('fixed_document'),
        expected_comparison: PDFString.of('COMPARE_ORIGINAL_TO_FIXED'),
        fixture_version: PDFString.of('fixed')
    });
    pdfDoc.catalog.set(PDFName.of('Phase69AFixture'), infoDict);

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Identical clone — for zero-diff verification.
 * Should produce changed_pixel_ratio close to 0.
 */
async function createIdenticalClone(outPath, origPath) {
    const bytes = await fs.readFile(origPath);
    await fs.writeFile(outPath, bytes);
}

/**
 * Fixture: Multi-page PDF — for verifying page-by-page rendering.
 */
async function createMultiPageDocument(outPath) {
    const pdfDoc = await PDFDocument.create();

    for (let i = 1; i <= 3; i++) {
        const page = pdfDoc.addPage([600, 800]);
        page.drawText(`Page ${i} — Phase 69A Multi-Page Fixture`, {
            x: 80, y: 700, size: 18, color: rgb(0, 0, 0)
        });
        page.drawText(`Render test page ${i} of 3.`, {
            x: 80, y: 650, size: 12, color: rgb(0.2, 0.2, 0.2)
        });
        // Distinct fill per page to verify per-page rendering
        const fill = rgb(i * 0.25, 0.1, 0.5 - i * 0.1);
        page.drawRectangle({ x: 100, y: 200, width: 350, height: 150, color: fill });
    }

    pdfDoc.setTitle('Multi-Page Fixture — Phase 69A');
    pdfDoc.setSubject('Phase 69A: Multi-Page Render Test');

    const ctx = pdfDoc.context;
    pdfDoc.catalog.set(PDFName.of('Phase69AFixture'), ctx.obj({
        phase69a_fixture: PDFString.of('multi_page'),
        page_count: PDFString.of('3')
    }));

    await writeOut(pdfDoc, outPath);
}

/**
 * Fixture: Clean control — for smoke baseline.
 */
async function createCleanControl(outPath) {
    const { pdfDoc, page } = await basePdf('Clean Control — Phase 69A');

    pdfDoc.setTitle('Clean Control — Phase 69A');
    pdfDoc.setSubject('Phase 69A: Clean Control');

    page.drawText('This document has no simulated issues. Used as a rendering baseline.', {
        x: 80, y: 600, size: 12, color: rgb(0, 0, 0)
    });

    const ctx = pdfDoc.context;
    pdfDoc.catalog.set(PDFName.of('Phase69AFixture'), ctx.obj({
        phase69a_fixture: PDFString.of('clean_control'),
        expected_finding: PDFString.of('none')
    }));

    await writeOut(pdfDoc, outPath);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const origPath = path.join(FIXTURES_DIR, 'original_document.pdf');

    const fixtures = [
        { name: 'original_document.pdf', generator: () => createOriginalDocument(origPath) },
        { name: 'fixed_document.pdf', generator: () => createFixedDocument(path.join(FIXTURES_DIR, 'fixed_document.pdf')) },
        { name: 'identical_clone.pdf', generator: async () => {
            // Original must be created first
            if (!fs.existsSync(origPath)) await createOriginalDocument(origPath);
            await createIdenticalClone(path.join(FIXTURES_DIR, 'identical_clone.pdf'), origPath);
        }},
        { name: 'multi_page.pdf', generator: () => createMultiPageDocument(path.join(FIXTURES_DIR, 'multi_page.pdf')) },
        { name: 'clean_control.pdf', generator: () => createCleanControl(path.join(FIXTURES_DIR, 'clean_control.pdf')) }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase69a',
        category: 'visual_proofing',
        governance: 'Visual diff is evidence generation only. Visual diff does not imply print-ready, production certification, PDF/X compliance, or PDF/A compliance.',
        fixtures: []
    };

    // Create original first so identical_clone can copy it
    await createOriginalDocument(origPath);
    manifest.fixtures.push({ filename: 'original_document.pdf', path: origPath, role: 'baseline' });
    console.log('Generated: original_document.pdf');

    for (const f of fixtures.slice(1)) {
        const outPath = path.join(FIXTURES_DIR, f.name);
        await f.generator();
        manifest.fixtures.push({ filename: f.name, path: outPath, role: f.name.replace('.pdf', '') });
        console.log(`Generated: ${f.name}`);
    }

    await fs.writeJson(
        path.join(REPORTS_DIR, 'phase69a_visual_diff_fixture_manifest.json'),
        manifest,
        { spaces: 2 }
    );
    console.log('Manifest written to reports/phase69a_visual_diff_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
