const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');

/**
 * FontInspector
 * 
 * Fast structural font inspection via PDF object graph traversal.
 * Designed to capture `fonts_before` and `fonts_after` evidence for fix capabilities.
 * 
 * LIMITATIONS:
 * - Structural inspection only.
 * - Does not validate glyph coverage.
 * - Does not verify visual equivalence.
 * - Does not validate font licensing.
 */
class FontInspector {
    /**
     * Inspects fonts in a PDF file.
     * @param {string} filePath - Path to the PDF file.
     * @returns {Promise<Object>} Inspection result object.
     */
    static async inspectFonts(filePath) {
        const result = {
            ok: true,
            fonts: [],
            non_embedded_fonts: [],
            errors: [],
            warnings: []
        };

        try {
            if (!fs.existsSync(filePath)) {
                result.ok = false;
                result.errors.push("File not found");
                return result;
            }

            const bytes = fs.readFileSync(filePath);
            
            // To detect non-embedded fonts, we check the raw object graph.
            // A font is typically considered embedded if it has a FontDescriptor
            // that contains FontFile, FontFile2, or FontFile3.
            
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const objects = doc.context.enumerateIndirectObjects();
            
            const fontMap = new Map();

            for (const [ref, obj] of objects) {
                if (!obj) continue;
                
                let dict = null;
                if (obj.constructor.name === 'PDFDict') dict = obj;
                else if (obj.constructor.name === 'PDFStream' || obj.constructor.name === 'PDFRawStream') dict = obj.dict;
                else if (obj.dict) dict = obj.dict; // fallback
                
                if (!dict) continue;
                
                const type = dict.get(PDFName.of('Type'));
                if (type && type.decodeText && type.decodeText() === 'Font') {
                    let baseFont = dict.get(PDFName.of('BaseFont'));
                    let rawName = (baseFont && baseFont.decodeText) ? baseFont.decodeText() : 'Unknown';
                    
                    // Standard fonts sometimes don't have BaseFont, or it might be called Name
                    if (rawName === 'Unknown') {
                        const nameObj = dict.get(PDFName.of('Name'));
                        if (nameObj && nameObj.decodeText) rawName = nameObj.decodeText();
                    }
                    
                    let normalizedName = rawName;
                    let subsetPrefix = null;
                    
                    // Parse subset prefix (e.g. ABCDEF+FontName)
                    if (rawName.includes('+') && rawName.indexOf('+') === 6) {
                        const parts = rawName.split('+');
                        subsetPrefix = parts[0];
                        normalizedName = parts.slice(1).join('+');
                    }

                    // Check if embedded
                    let isEmbedded = false;
                    const descriptorRef = dict.get(PDFName.of('FontDescriptor'));
                    if (descriptorRef) {
                        const descriptorObj = doc.context.lookup(descriptorRef);
                        
                        let descDict = null;
                        if (descriptorObj && descriptorObj.constructor.name === 'PDFDict') descDict = descriptorObj;
                        else if (descriptorObj && descriptorObj.dict) descDict = descriptorObj.dict;

                        if (descDict) {
                            if (descDict.has(PDFName.of('FontFile')) ||
                                descDict.has(PDFName.of('FontFile2')) ||
                                descDict.has(PDFName.of('FontFile3'))) {
                                isEmbedded = true;
                            }
                        }
                    }
                    
                    // De-duplicate by normalized name + subset status
                    const key = `${normalizedName}_${isEmbedded}`;
                    if (!fontMap.has(key)) {
                        fontMap.set(key, {
                            font_name: rawName,
                            normalized_font_name: normalizedName,
                            subset_prefix: subsetPrefix,
                            embedded: isEmbedded
                        });
                    }
                }
            }

            result.fonts = Array.from(fontMap.values());
            result.non_embedded_fonts = result.fonts.filter(f => !f.embedded).map(f => f.normalized_font_name);
            
            // Note: Standard14 fonts might not have a FontDescriptor, but they are conceptually 
            // "non-embedded" anyway. Our logic flags them as !isEmbedded which is correct for prepress checks.

        } catch (e) {
            result.ok = false;
            result.errors.push(e.message);
            result.warnings.push("Font inspection failed; review required.");
        }

        return result;
    }
}

module.exports = FontInspector;
