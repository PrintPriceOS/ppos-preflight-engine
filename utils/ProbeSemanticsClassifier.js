'use strict';

/**
 * ProbeSemanticsClassifier
 *
 * Phase 62F-A — Probe Semantics Layer
 * Classifies CLI probe results (qpdf, pdfimages, etc.) into precise semantic
 * statuses instead of collapsing everything to generic FAILED.
 *
 * Classification: INDUSTRIAL_RUNTIME (Technical Interpretation)
 */

const HEAVY_PDF_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB

const SEMANTIC_STATUSES = {
    SUCCESS: 'SUCCESS',
    SUCCESS_WITH_WARNINGS: 'SUCCESS_WITH_WARNINGS',
    WARNING_ONLY: 'WARNING_ONLY',
    PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
    SKIPPED_UNSUPPORTED: 'SKIPPED_UNSUPPORTED',
    FAILED_FATAL: 'FAILED_FATAL',
    FAILED_TIMEOUT: 'FAILED_TIMEOUT',
    FAILED_OOM: 'FAILED_OOM',
    FAILED_TOOL_MISSING: 'FAILED_TOOL_MISSING',
    FAILED_NO_OUTPUT: 'FAILED_NO_OUTPUT',
    FAILED_UNCLASSIFIED: 'FAILED_UNCLASSIFIED'
};

// qpdf warning patterns — non-zero exit but recoverable / advisory
const QPDF_WARNING_PATTERNS = [
    { pattern: /linearization|hint\s+table/i,                                                  cls: 'PDF_LINEARIZATION_HINT_WARNING' },
    { pattern: /shared\s+(?:identifier|object).*?hint\s+table|hint\s+table.*?shared\s+object/i, cls: 'PDF_SHARED_OBJECT_HINT_MISMATCH' },
    { pattern: /object\s+count.*?hint|hint.*?object\s+count|object\s+count\s+mismatch/i,        cls: 'PDF_OBJECT_COUNT_HINT_MISMATCH' },
    { pattern: /operation\s+succeeded\s+with\s+warnings/i,                                      cls: 'PDF_STRUCTURAL_WARNING_NON_FATAL' },
    { pattern: /WARNING:/,                                                                       cls: 'PDF_STRUCTURAL_WARNING_NON_FATAL' }
];

// qpdf fatal patterns — document cannot be reliably used.
// NOTE: "No syntax or stream encoding errors found." is qpdf's SUCCESS message and must NOT match here.
// Use specific phrasing ("errors found while checking", "may not be usable") to avoid false positives.
const QPDF_FATAL_PATTERNS = [
    { pattern: /file\s+is\s+damaged(?!\s+but\s+can\s+be\s+repaired)/i,               cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /unable\s+to\s+find\s+trailer\s+dictionary/i,                          cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /unable\s+to\s+find\s+\/root\s+dictionary/i,                           cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /not\s+a\s+pdf\s+file/i,                                               cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /invalid\s+xref/i,                                                      cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /errors?\s+found\s+while\s+checking|this\s+file\s+may\s+not\s+be\s+usable/i, cls: 'PDF_STRUCTURAL_ERROR_FATAL' }
];

// pdfimages warning patterns
const PDFIMAGES_WARNING_PATTERNS = [
    { pattern: /syntax\s+warning:\s+invalid\s+font\s+weight/i, cls: 'PDF_FONT_WEIGHT_WARNING' },
    { pattern: /syntax\s+warning:/i,                            cls: 'PDF_STRUCTURAL_WARNING_NON_FATAL' }
];

// pdfimages fatal patterns
const PDFIMAGES_FATAL_PATTERNS = [
    { pattern: /command\s+failed/i,      cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /couldn'?t?\s+open\s+file/i, cls: 'PDF_STRUCTURAL_ERROR_FATAL' },
    { pattern: /not\s+a\s+pdf\s+file/i,  cls: 'PDF_STRUCTURAL_ERROR_FATAL' }
];

function _excerpt(text, maxLen = 500) {
    if (!text) return '';
    const s = String(text).trim();
    return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
}

function _matchPatterns(text, patterns) {
    const classes = [];
    for (const { pattern, cls } of patterns) {
        if (pattern.test(text)) classes.push(cls);
    }
    return [...new Set(classes)];
}

function _isToolMissing(exitCode, error) {
    if (exitCode === 'ENOENT' || exitCode === 127) return true;
    if (error?.code === 'ENOENT' || error?.code === 127) return true;
    const msg = error?.message || '';
    return msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized') || msg.includes('command not found');
}

function _isTimeout(timedOut, signal, error) {
    if (timedOut) return true;
    return !!(error?.killed && (signal === 'SIGTERM' || error?.signal === 'SIGTERM'));
}

function _isOOM(signal, error) {
    if (signal === 'SIGKILL' || error?.signal === 'SIGKILL') return true;
    const msg = error?.message || '';
    return msg.includes('out of memory') || msg.includes('OOM') || (error?.killed && signal !== 'SIGTERM');
}

function _buildResult(tool, semanticStatus, opts = {}) {
    const {
        exitCode = null,
        stdout = '',
        stderr = '',
        durationMs = null,
        signal = null,
        usableOutput,
        structuralWarning = false,
        structuralFatal = false,
        warningClasses = [],
        fatalClasses = [],
        summary = ''
    } = opts;

    const fatalStatuses = new Set([
        SEMANTIC_STATUSES.FAILED_FATAL,
        SEMANTIC_STATUSES.FAILED_TIMEOUT,
        SEMANTIC_STATUSES.FAILED_OOM,
        SEMANTIC_STATUSES.FAILED_TOOL_MISSING,
        SEMANTIC_STATUSES.FAILED_NO_OUTPUT,
        SEMANTIC_STATUSES.FAILED_UNCLASSIFIED
    ]);

    const fatal = fatalStatuses.has(semanticStatus);

    let severity = 'info';
    if (fatal) severity = 'error';
    else if ([SEMANTIC_STATUSES.WARNING_ONLY, SEMANTIC_STATUSES.PARTIAL_SUCCESS, SEMANTIC_STATUSES.SUCCESS_WITH_WARNINGS].includes(semanticStatus)) severity = 'warning';

    const usable = usableOutput !== undefined
        ? usableOutput
        : [SEMANTIC_STATUSES.SUCCESS, SEMANTIC_STATUSES.SUCCESS_WITH_WARNINGS, SEMANTIC_STATUSES.WARNING_ONLY, SEMANTIC_STATUSES.PARTIAL_SUCCESS].includes(semanticStatus);

    const rawStatus = fatal ? 'FAILED' : 'SUCCESS';

    return {
        tool,
        raw_status: rawStatus,
        semantic_status: semanticStatus,
        severity,
        usable_output: usable,
        fatal,
        structural_warning: structuralWarning,
        structural_fatal: structuralFatal,
        warning_classes: [...new Set(warningClasses)],
        fatal_classes: [...new Set(fatalClasses)],
        summary: summary || semanticStatus,
        evidence: {
            exit_code: exitCode,
            stderr_excerpt: _excerpt(stderr),
            stdout_excerpt: _excerpt(stdout),
            duration_ms: durationMs,
            signal: signal || null
        }
    };
}

/**
 * Classify qpdf --check probe result.
 */
function classifyQpdfCheck({ exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable }) {
    if (_isToolMissing(exitCode, error)) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_TOOL_MISSING, { exitCode, stdout, stderr, durationMs, signal, summary: 'qpdf not installed or not on PATH' });
    }
    if (_isTimeout(timedOut, signal, error)) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_TIMEOUT, { exitCode, stdout, stderr, durationMs, signal, summary: 'qpdf --check timed out' });
    }
    if (_isOOM(signal, error)) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_OOM, { exitCode, stdout, stderr, durationMs, signal, summary: 'qpdf killed (OOM or SIGKILL)' });
    }

    const combined = `${stdout || ''}\n${stderr || ''}`;
    const fatalClasses = _matchPatterns(combined, QPDF_FATAL_PATTERNS);
    const warningClasses = _matchPatterns(combined, QPDF_WARNING_PATTERNS);

    if (exitCode === 0) {
        if (warningClasses.length > 0) {
            return _buildResult('qpdf', SEMANTIC_STATUSES.SUCCESS_WITH_WARNINGS, {
                exitCode, stdout, stderr, durationMs, signal,
                structuralWarning: true,
                warningClasses,
                summary: `qpdf check succeeded with warnings: ${warningClasses.join(', ')}`
            });
        }
        return _buildResult('qpdf', SEMANTIC_STATUSES.SUCCESS, { exitCode, stdout, stderr, durationMs, signal, summary: 'qpdf check completed successfully' });
    }

    // Non-zero exit
    if (fatalClasses.length > 0 && warningClasses.length === 0) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_FATAL, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: false,
            structuralFatal: true,
            fatalClasses,
            summary: `qpdf reported fatal structural error(s): ${fatalClasses.join(', ')}`
        });
    }

    if (warningClasses.length > 0) {
        if (fatalClasses.length > 0) {
            return _buildResult('qpdf', SEMANTIC_STATUSES.PARTIAL_SUCCESS, {
                exitCode, stdout, stderr, durationMs, signal,
                usableOutput: !!combined.trim(),
                structuralWarning: true, structuralFatal: true,
                warningClasses, fatalClasses,
                summary: 'qpdf reported both structural warnings and fatal errors'
            });
        }
        return _buildResult('qpdf', SEMANTIC_STATUSES.WARNING_ONLY, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: true,
            structuralWarning: true,
            warningClasses,
            summary: `qpdf warning-only: ${warningClasses.join(', ')}`
        });
    }

    // No recognized patterns — classify by output presence
    if (!outputAvailable && !combined.trim()) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_NO_OUTPUT, { exitCode, stdout, stderr, durationMs, signal, summary: 'qpdf exited non-zero with no output' });
    }

    // Check loosely for warning-only language
    const hasWarningWord = /\bwarning\b/i.test(combined);
    const hasErrorWord = /\b(?:error|damaged|corrupt|invalid)\b/i.test(combined);
    if (hasWarningWord && !hasErrorWord) {
        return _buildResult('qpdf', SEMANTIC_STATUSES.WARNING_ONLY, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: true, structuralWarning: true,
            warningClasses: ['PDF_STRUCTURAL_WARNING_NON_FATAL'],
            summary: 'qpdf reported warnings (unclassified pattern)'
        });
    }

    return _buildResult('qpdf', SEMANTIC_STATUSES.FAILED_UNCLASSIFIED, {
        exitCode, stdout, stderr, durationMs, signal,
        usableOutput: !!combined.trim(),
        summary: 'qpdf exited non-zero with unclassified output'
    });
}

/**
 * Classify pdfimages -list probe result.
 */
function classifyPdfImagesList({ exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable }) {
    if (_isToolMissing(exitCode, error)) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_TOOL_MISSING, { exitCode, stdout, stderr, durationMs, signal, summary: 'pdfimages not installed or not on PATH' });
    }
    if (_isTimeout(timedOut, signal, error)) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_TIMEOUT, { exitCode, stdout, stderr, durationMs, signal, summary: 'pdfimages -list timed out' });
    }
    if (_isOOM(signal, error)) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_OOM, { exitCode, stdout, stderr, durationMs, signal, summary: 'pdfimages killed (OOM or SIGKILL)' });
    }

    const combined = `${stdout || ''}\n${stderr || ''}`;
    const fatalClasses = _matchPatterns(combined, PDFIMAGES_FATAL_PATTERNS);
    const warningClasses = _matchPatterns(combined, PDFIMAGES_WARNING_PATTERNS);

    // Detect usable tabular image list output (rows like "   1     0 image ...")
    const hasUsableImageTable = /^\s+\d+\s+\d+\s+\w+\s+\d+/m.test(stdout || '');

    if (exitCode === 0) {
        if (warningClasses.length > 0) {
            return _buildResult('pdfimages', SEMANTIC_STATUSES.SUCCESS_WITH_WARNINGS, {
                exitCode, stdout, stderr, durationMs, signal,
                structuralWarning: true, warningClasses,
                summary: `pdfimages succeeded with warnings: ${warningClasses.join(', ')}`
            });
        }
        return _buildResult('pdfimages', SEMANTIC_STATUSES.SUCCESS, { exitCode, stdout, stderr, durationMs, signal, summary: 'pdfimages extraction succeeded' });
    }

    // Non-zero exit
    if (fatalClasses.length > 0 && !hasUsableImageTable) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_FATAL, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: false, structuralFatal: true, fatalClasses,
            summary: `pdfimages fatal: ${fatalClasses.join(', ')}`
        });
    }

    if (warningClasses.length > 0) {
        const usable = hasUsableImageTable || !!combined.trim();
        if (fatalClasses.length === 0) {
            return _buildResult('pdfimages', SEMANTIC_STATUSES.WARNING_ONLY, {
                exitCode, stdout, stderr, durationMs, signal,
                usableOutput: usable, structuralWarning: true, warningClasses,
                summary: `pdfimages warning-only: ${warningClasses.join(', ')}`
            });
        }
        return _buildResult('pdfimages', SEMANTIC_STATUSES.PARTIAL_SUCCESS, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: hasUsableImageTable,
            structuralWarning: true, structuralFatal: true,
            warningClasses, fatalClasses,
            summary: 'pdfimages reported both warnings and fatal errors'
        });
    }

    if (!outputAvailable && !combined.trim()) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_NO_OUTPUT, { exitCode, stdout, stderr, durationMs, signal, summary: 'pdfimages exited non-zero with no output' });
    }

    if (hasUsableImageTable) {
        return _buildResult('pdfimages', SEMANTIC_STATUSES.PARTIAL_SUCCESS, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: true,
            summary: 'pdfimages returned partial image data with non-zero exit'
        });
    }

    return _buildResult('pdfimages', SEMANTIC_STATUSES.FAILED_UNCLASSIFIED, {
        exitCode, stdout, stderr, durationMs, signal,
        usableOutput: false,
        summary: 'pdfimages exited non-zero with unclassified output'
    });
}

/**
 * Generic probe classifier — used for tools other than qpdf/pdfimages.
 */
function classifyGenericProbe({ tool, exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable }) {
    if (_isToolMissing(exitCode, error)) {
        return _buildResult(tool, SEMANTIC_STATUSES.FAILED_TOOL_MISSING, { exitCode, stdout, stderr, durationMs, signal });
    }
    if (_isTimeout(timedOut, signal, error)) {
        return _buildResult(tool, SEMANTIC_STATUSES.FAILED_TIMEOUT, { exitCode, stdout, stderr, durationMs, signal });
    }
    if (_isOOM(signal, error)) {
        return _buildResult(tool, SEMANTIC_STATUSES.FAILED_OOM, { exitCode, stdout, stderr, durationMs, signal });
    }

    if (exitCode === 0) {
        return _buildResult(tool, SEMANTIC_STATUSES.SUCCESS, { exitCode, stdout, stderr, durationMs, signal });
    }

    const combined = `${stdout || ''}\n${stderr || ''}`;
    if (!outputAvailable && !combined.trim()) {
        return _buildResult(tool, SEMANTIC_STATUSES.FAILED_NO_OUTPUT, { exitCode, stdout, stderr, durationMs, signal });
    }

    const hasWarning = /\bwarning\b/i.test(combined);
    const hasError = /\berror\b/i.test(combined);

    if (hasWarning && !hasError) {
        return _buildResult(tool, SEMANTIC_STATUSES.WARNING_ONLY, {
            exitCode, stdout, stderr, durationMs, signal,
            structuralWarning: true,
            warningClasses: ['PDF_STRUCTURAL_WARNING_NON_FATAL'],
            summary: `${tool} reported warnings`
        });
    }

    if (outputAvailable || combined.trim()) {
        return _buildResult(tool, SEMANTIC_STATUSES.PARTIAL_SUCCESS, {
            exitCode, stdout, stderr, durationMs, signal,
            usableOutput: true,
            summary: `${tool} exited non-zero with partial output`
        });
    }

    return _buildResult(tool, SEMANTIC_STATUSES.FAILED_UNCLASSIFIED, { exitCode, stdout, stderr, durationMs, signal });
}

/**
 * Entry point — routes to tool-specific classifier.
 */
function classifyProbeResult({ tool, command, exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable }) {
    switch (tool) {
        case 'qpdf':      return classifyQpdfCheck({ exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable });
        case 'pdfimages': return classifyPdfImagesList({ exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable });
        default:          return classifyGenericProbe({ tool, exitCode, stdout, stderr, error, timedOut, signal, durationMs, outputAvailable });
    }
}

module.exports = {
    HEAVY_PDF_THRESHOLD_BYTES,
    SEMANTIC_STATUSES,
    classifyProbeResult,
    classifyQpdfCheck,
    classifyPdfImagesList,
    classifyGenericProbe
};
