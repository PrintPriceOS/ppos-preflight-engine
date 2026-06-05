const REGISTRY = {
    // Existing implemented/partial fixes
    "REBUILD_TRIMBOX": {
        fix_id: "REBUILD_TRIMBOX",
        label: "Rebuild TrimBox",
        category: "geometry",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Document TrimBox was successfully rebuilt to standard production geometry.",
        operator_message: "TrimBox rebuilt based on MediaBox/production inference."
    },
    "APPLY_BLEED": {
        fix_id: "APPLY_BLEED",
        label: "Apply bleed box expansion",
        category: "geometry",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "MEDIUM",
        requires_human_review: true,
        production_safe: false,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Bleed box was expanded, but artwork was not visually extended.",
        operator_message: "Bleed box expansion only; true artwork bleed extension is not currently supported."
    },
    "CONVERT_CMYK": {
        fix_id: "CONVERT_CMYK",
        label: "Convert to CMYK",
        category: "color",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: ["Ghostscript"],
        supported_modes: ["REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Colorspace was converted to CMYK. Colors may shift.",
        operator_message: "Destructive CMYK conversion applied via Ghostscript."
    },
    "INJECT_OUTPUT_INTENT": {
        fix_id: "INJECT_OUTPUT_INTENT",
        label: "Inject OutputIntent",
        category: "color",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW", // Medium if profile mismatch or PDF/X claim is made
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Standard production color profile was injected.",
        operator_message: "OutputIntent with ICC profile injected into PDF catalog."
    },

    // New low-risk fixes
    "STRIP_JAVASCRIPT": {
        fix_id: "STRIP_JAVASCRIPT",
        label: "Strip JavaScript",
        category: "security",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "JavaScript actions were neutralized to ensure print safety.",
        operator_message: "Removed catalog OpenAction and JavaScript names."
    },
    "FLATTEN_ANNOTATIONS": {
        fix_id: "FLATTEN_ANNOTATIONS",
        label: "Flatten annotations",
        category: "interactive_content",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Interactive annotations were flattened into the PDF structure.",
        operator_message: "Annotation references removed to reduce print-production risk."
    },
    "FLATTEN_FORMS": {
        fix_id: "FLATTEN_FORMS",
        label: "Flatten forms",
        category: "interactive_content",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["pdf-lib"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "Interactive forms were flattened into the PDF structure.",
        operator_message: "AcroForm fields flattened to reduce print-production risk."
    },
    "REBUILD_XREF": {
        fix_id: "REBUILD_XREF",
        label: "Rebuild XREF",
        category: "structure",
        implemented: true,
        detectable: true,
        autofixable: true,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: ["qpdf"],
        supported_modes: ["SAFE", "REVIEW_REQUIRED", "EXPERIMENTAL"],
        customer_message: "PDF structure was sanitized for optimal compatibility.",
        operator_message: "Structural sanitization attempted via qpdf."
    },

    // Medium/high-risk scaffolding, not necessarily implemented yet
    "FLATTEN_TRANSPARENCY": {
        fix_id: "FLATTEN_TRANSPARENCY",
        label: "Flatten transparency",
        category: "transparency",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Transparency flattening is currently not supported.",
        operator_message: "Transparency flattening is currently scaffolded."
    },
    "FLATTEN_OVERPRINT": {
        fix_id: "FLATTEN_OVERPRINT",
        label: "Flatten overprint",
        category: "overprint",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Overprint flattening is currently not supported.",
        operator_message: "Overprint flattening is currently scaffolded."
    },
    "EMBED_FONTS": {
        fix_id: "EMBED_FONTS",
        label: "Embed fonts",
        category: "fonts",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Font embedding is currently not supported.",
        operator_message: "Font embedding is currently scaffolded."
    },
    "VALIDATE_PDFX": {
        fix_id: "VALIDATE_PDFX",
        label: "Validate PDF/X",
        category: "standards",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "MEDIUM",
        requires_human_review: true,
        production_safe: false,
        destructive: false,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "PDF/X validation is currently not supported.",
        operator_message: "PDF/X validation is currently scaffolded."
    },
    "GENERATE_PDFX": {
        fix_id: "GENERATE_PDFX",
        label: "Generate PDF/X",
        category: "standards",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "PDF/X generation is currently not supported.",
        operator_message: "PDF/X generation is currently scaffolded."
    },
    "DETECT_TOTAL_INK_COVERAGE": {
        fix_id: "DETECT_TOTAL_INK_COVERAGE",
        label: "Detect total ink coverage",
        category: "ink",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "LOW",
        requires_human_review: false,
        production_safe: true,
        destructive: false,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Total ink coverage detection is currently not supported.",
        operator_message: "Total ink coverage detection is currently scaffolded."
    },
    "MAP_RICH_BLACK_TEXT_TO_K_ONLY": {
        fix_id: "MAP_RICH_BLACK_TEXT_TO_K_ONLY",
        label: "Map rich black text to K only",
        category: "ink",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Mapping rich black text to K only is currently not supported.",
        operator_message: "Mapping rich black text to K only is currently scaffolded."
    },
    "MAP_REGISTRATION_COLOR_TO_BLACK": {
        fix_id: "MAP_REGISTRATION_COLOR_TO_BLACK",
        label: "Map registration color to black",
        category: "ink",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Mapping registration color to black is currently not supported.",
        operator_message: "Mapping registration color to black is currently scaffolded."
    },
    "OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION": {
        fix_id: "OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION",
        label: "Optimize excessive image resolution",
        category: "images",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "MEDIUM",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Image resolution optimization is currently not supported.",
        operator_message: "Image resolution optimization is currently scaffolded."
    },
    "VISUAL_BLEED_EXTENSION": {
        fix_id: "VISUAL_BLEED_EXTENSION",
        label: "Visual bleed extension",
        category: "geometry",
        implemented: false,
        detectable: true,
        autofixable: false,
        risk_level: "HIGH",
        requires_human_review: true,
        production_safe: false,
        destructive: true,
        toolchain: [],
        supported_modes: ["EXPERIMENTAL"],
        customer_message: "Visual bleed extension is currently not supported.",
        operator_message: "Visual bleed extension is currently scaffolded."
    }
};

function getFixCapability(fixId) {
    return REGISTRY[fixId] || null;
}

function listFixCapabilities() {
    return Object.values(REGISTRY);
}

function isFixImplemented(fixId) {
    const cap = REGISTRY[fixId];
    return cap ? cap.implemented : false;
}

function isFixAutofixable(fixId, policyMode = "SAFE") {
    const cap = REGISTRY[fixId];
    if (!cap || !cap.implemented || !cap.autofixable) return false;
    return cap.supported_modes.includes(policyMode);
}

function normalizeFixId(fixId) {
    if (REGISTRY[fixId]) return fixId;
    
    // Fallback normalizations for legacy codes
    const map = {
        'BLEED_MISSING': 'APPLY_BLEED',
        'COLOR_PROFILE_MISMATCH': 'CONVERT_CMYK',
        'TRANSPARENCY_PRESENT': 'FLATTEN_TRANSPARENCY',
        'TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
        'TRIMBOX_INVALID': 'REBUILD_TRIMBOX',
        'TRIMBOX_OUTSIDE_MEDIABOX': 'REBUILD_TRIMBOX',
        'GEOM_TRIMBOX_MISSING': 'REBUILD_TRIMBOX',
        'TRIM_BOX_ANOMALY': 'REBUILD_TRIMBOX',
        'BLEEDBOX_MISSING': 'APPLY_BLEED',
        'IND_COLOR_001': 'CONVERT_CMYK',
        'IND_COLOR_002': 'INJECT_OUTPUT_INTENT',
        'IND_COLOR_006': 'INJECT_OUTPUT_INTENT',
        'IND_GEOM_001': 'APPLY_BLEED',
        'IND_GEOM_002': 'APPLY_BLEED',
        'IND_GEOM_003': 'REBUILD_TRIMBOX',
        'COLOR_RGB_OBJECTS_DETECTED': 'CONVERT_CMYK',
        'COLOR_ICC_PROFILE_MISSING': 'INJECT_OUTPUT_INTENT',
        'COLOR_MIXED_COLOR_SPACES': 'CONVERT_CMYK',
        'COLOR_OUTPUT_INTENT_MISSING': 'INJECT_OUTPUT_INTENT',
        'TRANS_TRANSPARENCY_DETECTED': 'FLATTEN_TRANSPARENCY'
    };
    
    return map[fixId] || fixId;
}

module.exports = {
    REGISTRY,
    getFixCapability,
    listFixCapabilities,
    isFixImplemented,
    isFixAutofixable,
    normalizeFixId
};
