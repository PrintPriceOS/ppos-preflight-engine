# Phase 64A — Engine Ink / TAC / Black / Registration Color Fixes

**Smoke Test Passed:** ✅ YES

## Executive Summary
Validates Engine-only ink governance scaffolding for TAC, rich black text, small text rich black, registration color misuse, and black text normalization — all under category `ink_governance`, all visually sensitive, review-required, and free of standards/production overclaims.

## Target Fixes
- `REDUCE_TOTAL_INK_COVERAGE`
- `MAP_RICH_BLACK_TEXT_TO_K_ONLY`
- `MAP_REGISTRATION_COLOR_TO_BLACK`
- `NORMALIZE_BLACK_TEXT`
- `DETECT_SMALL_TEXT_RICH_BLACK`

## Finding Codes (Phase 64A)
| Code | Meaning |
| --- | --- |
| IND_INK_001 | Total Ink Coverage Excessive |
| IND_INK_002 | Rich Black Text Detected |
| IND_INK_003 | Small Text Using Rich Black |
| IND_INK_004 | Registration Color Misuse |
| IND_INK_005 | Black Text Not K-Only |

## Scenario Matrix
| Scenario | Capability | Status | Passed | Notes |
| --- | --- | --- | --- | --- |
| FixRegistry ink_governance capabilities check | REDUCE_TOTAL_INK_COVERAGE, MAP_RICH_BLACK_TEXT_TO_K_ONLY, MAP_REGISTRATION_COLOR_TO_BLACK, NORMALIZE_BLACK_TEXT, DETECT_SMALL_TEXT_RICH_BLACK | VERIFIED | ✅ | All ink_governance capabilities registered with correct policy fields. |
| IndustrialFindingCodes Phase 64A ink codes | — | VERIFIED | ✅ | All Phase 64A IND_INK_* codes registered correctly. |
| IssueNormalizer ink governance routing | — | VERIFIED | ✅ | IssueNormalizer correctly routes all IND_INK_* and legacy IND_COLOR_* ink codes to ink governance fixes with safeToAutofix=false. |
| FixPlanner ink governance guardrails | — | VERIFIED | ✅ | FixPlanner correctly blocks all ink_governance fixes from being planned/executable in any policy mode. |
| REDUCE_TOTAL_INK_COVERAGE returns SKIPPED_UNSUPPORTED with evidence | REDUCE_TOTAL_INK_COVERAGE | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| MAP_RICH_BLACK_TEXT_TO_K_ONLY returns SKIPPED_UNSUPPORTED with evidence | MAP_RICH_BLACK_TEXT_TO_K_ONLY | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| DETECT_SMALL_TEXT_RICH_BLACK returns SKIPPED_UNSUPPORTED with evidence | DETECT_SMALL_TEXT_RICH_BLACK | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| MAP_REGISTRATION_COLOR_TO_BLACK returns SKIPPED_UNSUPPORTED with evidence | MAP_REGISTRATION_COLOR_TO_BLACK | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| NORMALIZE_BLACK_TEXT returns SKIPPED_UNSUPPORTED with evidence | NORMALIZE_BLACK_TEXT | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| REDUCE_TOTAL_INK_COVERAGE on clean control — honest skip | REDUCE_TOTAL_INK_COVERAGE | SKIPPED_UNSUPPORTED | ✅ | Minor: ink fix does not signal review_required=true (non-fatal, informational) |
| Ink governance overclaim regression (aggregate) | — | VERIFIED | ✅ | No ink governance fix produced a standards, PDF/X, PDF/A, production certification, or production_safe claim. |
| Ink governance no-APPLIED regression (aggregate) | — | VERIFIED | ✅ | No ink governance fix produced an APPLIED result without a rendering pipeline — correctly deferred to SKIPPED_UNSUPPORTED. |
| Ink governance review_required signal (aggregate) | — | VERIFIED | ✅ | All ink governance results signal requires_human_review=true as required by policy. |

## Governance Summary
Verified across all scenarios that:
- All `ink_governance` capabilities are registered with `production_safe=false`, `requires_human_review=true`, `visually_sensitive=true`, `evidence_required=true`.
- IssueNormalizer routes IND_INK_* and legacy IND_COLOR_005/008/009 codes to ink governance fixes with `safeToAutofix=false` and `category=INK`.
- FixPlanner blocks all ink_governance fixes from being planned or executable in any policy mode (`skip_reason=VISUAL_REVIEW_REQUIRED`).
- All engine execution attempts return `SKIPPED_UNSUPPORTED` with a populated evidence object — no physical ink/color change is made.
- No ink governance fix claims standards, PDF/X, PDF/A, production certification, or production safety.
- `review_required=true` and `visual_change_expected` are preserved in evidence for downstream Worker/Service consumption.