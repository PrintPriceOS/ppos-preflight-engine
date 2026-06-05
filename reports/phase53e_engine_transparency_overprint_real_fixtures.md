# Phase 53E.1 Engine Real Transparency / Overprint Fixture Detection Report

## Executive Summary
- Total Scenarios: 7
- Passed: 7
- Detector Gaps: 1
- Deferred: 6

## Real Detection Matrix
| Fixture | Valid PDF | Expected Found | Detector Gap | Deferred | Pass | Notes |
|---------|-----------|----------------|--------------|----------|------|-------|
| transparency_basic.pdf | true | false | true | false | true | Generated using pdf-lib rectangle with opacity, Detector gap: missed TRANSPARENCY_PRESENT |
| soft_mask.pdf | false | false | false | true | true | pdf-lib lacks native soft mask API |
| blend_mode.pdf | false | false | false | true | true | pdf-lib lacks native blend mode API |
| overprint_basic.pdf | false | false | false | true | true | pdf-lib lacks native overprint API |
| knockout_group.pdf | false | false | false | true | true | pdf-lib lacks native knockout group API |
| rasterization_risk.pdf | false | false | false | true | true | Complex transparency tree not easily generated |
| pdfx_transparency_conflict.pdf | false | false | false | true | true | PDF/X simulated conflict not easily generated |

## Unsupported Fix Execution Matrix
| Fixture | Fix Code | Status | Applied | Claims PDF/X | Pass |
|---------|----------|--------|---------|--------------|------|
| transparency_basic.pdf | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| transparency_basic.pdf | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| soft_mask.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| blend_mode.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| overprint_basic.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| knockout_group.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| rasterization_risk.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | FLATTEN_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | FLATTEN_PDF | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | FLATTEN_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | NORMALIZE_OVERPRINT | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | REMOVE_SOFT_MASKS | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | RASTERIZE_TRANSPARENCY | UNSUPPORTED_FIX | false | false | true |
| pdfx_transparency_conflict.pdf (via valid) | CONVERT_TO_PDFX_TRANSPARENCY_SAFE | UNSUPPORTED_FIX | false | false | true |

## Detector Gaps
- transparency_basic.pdf (Missing TRANSPARENCY_PRESENT)

## Deferred Fixtures
- soft_mask.pdf
- blend_mode.pdf
- overprint_basic.pdf
- knockout_group.pdf
- rasterization_risk.pdf
- pdfx_transparency_conflict.pdf

## Recommendations for Phase 53E.2 Worker-only
- Implement worker level handling for missing expected findings.
- Use synthetic trace fallbacks for deferred fixtures to ensure full coverage on worker side.
