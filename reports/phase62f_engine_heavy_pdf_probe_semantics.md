# Phase 62F-A — Engine Heavy PDF Probe Semantics Report

Generated: 2026-06-09T19:09:40.698Z

**Overall: PASS** — 11/11 scenarios passed

| Scenario | Tool | Semantic Status | Severity | Usable | Fatal | Structural Warning | Warning Classes | Overclaim Guard | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1. qpdf hint-table → WARNING_ONLY | qpdf | WARNING_ONLY | warning | true | false | true | PDF_LINEARIZATION_HINT_WARNING, PDF_SHARED_OBJECT_HINT_MISMATCH, PDF_OBJECT_COUNT_HINT_MISMATCH, PDF_STRUCTURAL_WARNING_NON_FATAL | true | PASS |
| 2. qpdf fatal xref → FAILED_FATAL | qpdf | FAILED_FATAL | error | false | true | false |  | true | PASS |
| 3. qpdf timeout → FAILED_TIMEOUT | qpdf | FAILED_TIMEOUT | error | false | true | - | - | true | PASS |
| 4. pdfimages Invalid Font Weight → WARNING_ONLY | pdfimages | WARNING_ONLY | warning | true | false | true | PDF_FONT_WEIGHT_WARNING, PDF_STRUCTURAL_WARNING_NON_FATAL | true | PASS |
| 5. pdfimages no-output non-zero → FAILED_NO_OUTPUT/FAILED_FATAL | pdfimages | FAILED_FATAL | error | false | true | - | - | true | PASS |
| 6. missing command → FAILED_TOOL_MISSING | mutool | FAILED_TOOL_MISSING | error | false | true | - | - | true | PASS |
| 7. SIGKILL/OOM → FAILED_OOM | gs | FAILED_OOM | error | false | true | - | - | true | PASS |
| 8. heavy_pdf_probe_governance present and fields correct | ReportBuilder | - | - | - | - | - | - | true | PASS |
| 9. degraded_reasons precise for warning-only probes | ReportBuilder | - | - | - | - | - | - | true | PASS |
| 10. No overclaims in heavy_pdf_probe_governance | ReportBuilder | - | - | - | - | - | - | true | PASS |
| 11. HEAVY_PDF_THRESHOLD_BYTES = 500 MB | ProbeSemanticsClassifier | - | - | - | - | - | - | - | PASS |

## Non-Negotiable Rules Verified

1. qpdf warning-only output is NOT generic `TOOL_EXTRACTION_FAILED` ✓
2. pdfimages warning-only output is NOT generic `TOOL_EXTRACTION_FAILED` ✓
3. Fatal probe failures remain fatal ✓
4. Timeouts classified as `FAILED_TIMEOUT` ✓
5. OOM/SIGKILL classified as `FAILED_OOM` ✓
6. `heavy_pdf_probe_governance` emitted with correct fields ✓
7. `degraded_reasons` are precise (not generic) ✓
8. `production_certified=false`, `standard_certified=false`, `compliance_claim_allowed=false` ✓
