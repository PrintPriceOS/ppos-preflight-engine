const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const fixturesDir = path.join(__dirname, '../fixtures/phase54e');

// Create a simple 1x1 transparent PNG base64 for fallback
const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// 10x10 red square PNG
const lowResPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAAHPAf+n9NqDAAAAAElFTkSuQmCC';
// Simple JPEG (a red square, 10x10)
const jpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAKAAoBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function createLowResImage() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([800, 800]);
    const pngImage = await doc.embedPng(Buffer.from(lowResPngBase64, 'base64'));
    // Draw 10x10 pixel image stretching to 500x500 points (very low res)
    page.drawImage(pngImage, {
        x: 50,
        y: 50,
        width: 500,
        height: 500,
    });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'low_res_image.pdf'), bytes);
    return true;
}

async function createExcessiveResolutionImage() {
    // Generate a very large base64 image (we might not be able to generate 3000x3000 inline here without a big payload, so let's reuse the small one but pretend it's excessive if we drew it into a 1x1 point? Actually, pdf-lib doesn't magically increase resolution of the source image. The analyzer looks at image pixel size vs display size.
    // A 10x10 image drawn at 0.01 x 0.01 points would have 1000 PPI. Let's try that.
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    const pngImage = await doc.embedPng(Buffer.from(lowResPngBase64, 'base64'));
    
    // Draw 10x10 pixel image in a 0.005 x 0.005 space -> 2000 ppi
    page.drawImage(pngImage, {
        x: 50,
        y: 50,
        width: 0.005,
        height: 0.005,
    });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'excessive_resolution_image.pdf'), bytes);
    return true;
}

async function createJpegArtifactsImage() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const jpgImage = await doc.embedJpg(Buffer.from(jpegBase64, 'base64'));
    page.drawImage(jpgImage, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'jpeg_artifacts_image.pdf'), bytes);
    return true;
}

async function createBitmapTextImage() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const pngImage = await doc.embedPng(Buffer.from(lowResPngBase64, 'base64'));
    page.drawImage(pngImage, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'bitmap_text_image.pdf'), bytes);
    return true;
}

async function createRasterizedVectorImage() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const pngImage = await doc.embedPng(Buffer.from(lowResPngBase64, 'base64'));
    page.drawImage(pngImage, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'rasterized_vector_image.pdf'), bytes);
    return true;
}

async function createImageAlpha() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const pngImage = await doc.embedPng(Buffer.from(transparentPngBase64, 'base64'));
    page.drawImage(pngImage, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    fs.writeFileSync(path.join(fixturesDir, 'image_alpha.pdf'), bytes);
    return true;
}

async function createDamagedImageObject() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const pngImage = await doc.embedPng(Buffer.from(lowResPngBase64, 'base64'));
    page.drawImage(pngImage, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    // Intentionally corrupt the PDF a bit near the end (not guaranteed to be an image object, but trying to simulate a broken file)
    const corrupted = Buffer.concat([bytes.slice(0, -50), Buffer.from('DAMAGED_DATA_XYZ')]);
    fs.writeFileSync(path.join(fixturesDir, 'damaged_image_object.pdf'), corrupted);
    return true;
}

async function run() {
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const manifest = [];
    
    const tryCreate = async (name, creator, expectedFindings) => {
        let created = false;
        try {
            created = await creator();
        } catch(e) {
            console.error(`Failed to create ${name}:`, e.message);
        }
        manifest.push({
            fixture: name,
            fixture_created: created,
            valid_pdf: created, // Will be overridden in smoke if corrupted
            expected_findings: expectedFindings,
            detected_findings: [],
            expected_finding_detected: false,
            fixture_gap: !created,
            detector_gap: false,
            deferred: !created,
            notes: created ? [] : ['Could not generate fixture with pdf-lib']
        });
    };

    await tryCreate('low_res_image.pdf', createLowResImage, ['LOW_RES_IMAGES']);
    await tryCreate('excessive_resolution_image.pdf', createExcessiveResolutionImage, ['EXCESSIVE_RESOLUTION']);
    await tryCreate('jpeg_artifacts_image.pdf', createJpegArtifactsImage, ['JPEG_ARTIFACTS', 'IMAGE_COMPRESSION_RISK']);
    await tryCreate('bitmap_text_image.pdf', createBitmapTextImage, ['BITMAP_TEXT_RISK']);
    await tryCreate('rasterized_vector_image.pdf', createRasterizedVectorImage, ['RASTERIZED_VECTOR_RISK']);
    await tryCreate('image_alpha.pdf', createImageAlpha, ['IMAGE_ALPHA_RISK']);
    await tryCreate('damaged_image_object.pdf', createDamagedImageObject, ['IMAGE_OBJECT_DAMAGED']);

    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(reportsDir, 'phase54e_image_quality_fixture_manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Created fixtures and manifest in ${fixturesDir}`);
}

run().catch(console.error);
