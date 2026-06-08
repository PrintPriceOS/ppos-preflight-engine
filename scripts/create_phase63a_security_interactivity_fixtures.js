const fs = require('fs-extra');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFNumber, rgb } = require('pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase63a');
const REPORTS_DIR = path.join(__dirname, '../reports');

async function basePdf(text) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(text, { x: 80, y: 700, size: 18, color: rgb(0, 0, 0) });
    return { pdfDoc, page };
}

async function createJavascriptAction(outPath) {
    const { pdfDoc } = await basePdf('JavaScript Action Fixture');
    const ctx = pdfDoc.context;

    const jsAction = ctx.obj({
        S: PDFName.of('JavaScript'),
        JS: PDFString.of("app.alert('hello');")
    });
    pdfDoc.catalog.set(PDFName.of('OpenAction'), jsAction);

    const jsEntry = ctx.obj({
        S: PDFName.of('JavaScript'),
        JS: PDFString.of("app.alert('doc-level');")
    });
    const namesArray = ctx.obj([PDFString.of('DocJS'), jsEntry]);
    const jsTree = ctx.obj({ Names: namesArray });
    const namesDict = ctx.obj({ JavaScript: jsTree });
    pdfDoc.catalog.set(PDFName.of('Names'), namesDict);

    await writeOut(pdfDoc, outPath);
}

async function createLaunchAction(outPath) {
    const { pdfDoc, page } = await basePdf('Launch Action Fixture');
    const ctx = pdfDoc.context;

    const launchAction = ctx.obj({
        S: PDFName.of('Launch'),
        F: PDFString.of('calc.exe')
    });
    pdfDoc.catalog.set(PDFName.of('OpenAction'), launchAction);

    // Page-level annotation with launch action
    const annotDict = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: ctx.obj([100, 100, 200, 150]),
        A: ctx.obj({ S: PDFName.of('Launch'), F: PDFString.of('notes.exe') })
    });
    const annotRef = ctx.register(annotDict);
    page.node.set(PDFName.of('Annots'), ctx.obj([annotRef]));

    await writeOut(pdfDoc, outPath);
}

async function createEmbeddedFile(outPath) {
    const { pdfDoc, page } = await basePdf('Embedded File Fixture');
    const ctx = pdfDoc.context;

    const fileBytes = Buffer.from('embedded-file-payload', 'utf8');
    const efStream = ctx.flateStream(fileBytes, { Type: PDFName.of('EmbeddedFile') });
    const efStreamRef = ctx.register(efStream);

    const fileSpec = ctx.obj({
        Type: PDFName.of('Filespec'),
        F: PDFString.of('payload.txt'),
        EF: ctx.obj({ F: efStreamRef })
    });
    const fileSpecRef = ctx.register(fileSpec);

    const namesArray = ctx.obj([PDFString.of('payload.txt'), fileSpecRef]);
    const efTree = ctx.obj({ Names: namesArray });
    const namesDict = ctx.obj({ EmbeddedFiles: efTree });
    pdfDoc.catalog.set(PDFName.of('Names'), namesDict);

    // Also add a FileAttachment annotation referencing the file spec
    const annotDict = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('FileAttachment'),
        Rect: ctx.obj([300, 300, 350, 350]),
        FS: fileSpecRef
    });
    const annotRef = ctx.register(annotDict);
    page.node.set(PDFName.of('Annots'), ctx.obj([annotRef]));

    await writeOut(pdfDoc, outPath);
}

async function createDocumentOpenAction(outPath) {
    const { pdfDoc } = await basePdf('Document Open Action Fixture');
    const ctx = pdfDoc.context;

    const gotoAction = ctx.obj({
        S: PDFName.of('GoTo'),
        D: ctx.obj([PDFNumber.of(0), PDFName.of('Fit')])
    });
    pdfDoc.catalog.set(PDFName.of('OpenAction'), gotoAction);

    const aaDict = ctx.obj({
        WC: ctx.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of("app.alert('will-close');") })
    });
    pdfDoc.catalog.set(PDFName.of('AA'), aaDict);

    await writeOut(pdfDoc, outPath);
}

async function createPageOpenAction(outPath) {
    const { pdfDoc, page } = await basePdf('Page Open Action Fixture');
    const ctx = pdfDoc.context;

    const aaDict = ctx.obj({
        O: ctx.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of("app.alert('page-open');") }),
        C: ctx.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of("app.alert('page-close');") })
    });
    page.node.set(PDFName.of('AA'), aaDict);

    await writeOut(pdfDoc, outPath);
}

async function createAnnotationsBasic(outPath) {
    const { pdfDoc, page } = await basePdf('Annotations Basic Fixture');
    const ctx = pdfDoc.context;

    // Link annotation (no visual appearance) - safe to flatten
    const linkAnnot = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: ctx.obj([80, 600, 250, 630]),
        Border: ctx.obj([0, 0, 0])
    });

    const annots = ctx.obj([ctx.register(linkAnnot)]);
    page.node.set(PDFName.of('Annots'), annots);

    await writeOut(pdfDoc, outPath);
}

async function createAcroformBasic(outPath) {
    const { pdfDoc, page } = await basePdf('AcroForm Basic Fixture');
    const ctx = pdfDoc.context;

    const form = pdfDoc.getForm();
    const textField = form.createTextField('basic.name');
    textField.setText('Sample value');
    textField.addToPage(page, { x: 80, y: 500, width: 200, height: 24 });

    await writeOut(pdfDoc, outPath);
}

async function createMixedInteractiveContent(outPath) {
    const { pdfDoc, page } = await basePdf('Mixed Interactive Content Fixture');
    const ctx = pdfDoc.context;

    const jsAction = ctx.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of("app.alert('mixed');") });
    pdfDoc.catalog.set(PDFName.of('OpenAction'), jsAction);

    const launchAnnot = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: ctx.obj([80, 600, 200, 630]),
        A: ctx.obj({ S: PDFName.of('Launch'), F: PDFString.of('mixed.exe') })
    });
    page.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(launchAnnot)]));

    page.node.set(PDFName.of('AA'), ctx.obj({
        O: ctx.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of("app.alert('page-open-mixed');") })
    }));

    const form = pdfDoc.getForm();
    const textField = form.createTextField('mixed.field');
    textField.setText('mixed value');
    textField.addToPage(page, { x: 300, y: 500, width: 180, height: 24 });

    await writeOut(pdfDoc, outPath);
}

async function createCleanControl(outPath) {
    const { pdfDoc } = await basePdf('Clean Control Fixture');
    await writeOut(pdfDoc, outPath);
}

async function writeOut(pdfDoc, outPath) {
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outPath, pdfBytes);
}

async function main() {
    await fs.ensureDir(FIXTURES_DIR);
    await fs.ensureDir(REPORTS_DIR);

    const fixtures = [
        { name: 'javascript_action.pdf', generator: createJavascriptAction, expected: 'javascript_present' },
        { name: 'launch_action.pdf', generator: createLaunchAction, expected: 'launch_action_present' },
        { name: 'embedded_file.pdf', generator: createEmbeddedFile, expected: 'embedded_files_present' },
        { name: 'document_open_action.pdf', generator: createDocumentOpenAction, expected: 'document_open_action_present' },
        { name: 'page_open_action.pdf', generator: createPageOpenAction, expected: 'page_open_action_present' },
        { name: 'annotations_basic.pdf', generator: createAnnotationsBasic, expected: 'annotations_present_safe_to_flatten' },
        { name: 'acroform_basic.pdf', generator: createAcroformBasic, expected: 'acroform_present' },
        { name: 'mixed_interactive_content.pdf', generator: createMixedInteractiveContent, expected: 'mixed_interactive_content' },
        { name: 'clean_control.pdf', generator: createCleanControl, expected: 'clean' }
    ];

    const manifest = {
        generated_at: new Date().toISOString(),
        phase: 'phase63a',
        category: 'pdf_security_interactivity',
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

    await fs.writeJson(path.join(REPORTS_DIR, 'phase63a_security_interactivity_fixture_manifest.json'), manifest, { spaces: 2 });
    console.log('Manifest written to reports/phase63a_security_interactivity_fixture_manifest.json');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
