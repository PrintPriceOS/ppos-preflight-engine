# Phase 75A — Engine Recommendation Signals

**Generated:** 2026-06-15T15:10:03.551Z  
**Smoke:** ✅ PASSED  
**Results:** 51/51 passed

## Signal Fields
- `finding_id`
- `finding_code`
- `fix_id`
- `fixability`
- `risk_level`
- `visual_sensitivity`
- `missing_tool`
- `validator_required`
- `operator_review_reason`

## Governance
| Invariant | Value |
|-----------|-------|
| signals are advisory only | **true** |
| recommendation_authority | **false** |
| auto_apply_authority | **false** |
| production_certified | **false** |
| standard_certified | **false** |
| compliance_claim_allowed | **false** |

## Test Results
| # | Test | Pass |
|---|------|------|
| 1 | 1.1 generated_at is string | ✅ |
| 2 | 1.2 findings is array | ✅ |
| 3 | 1.3 empty input: findings is empty | ✅ |
| 4 | 1.4 summary is object | ✅ |
| 5 | 1.5 empty input: total_findings=0 | ✅ |
| 6 | 1.6 governance is object | ✅ |
| 7 | 2.1 TRIMBOX_MISSING -> fixability=FIXABLE_AUTO | ✅ |
| 8 | 2.2 fix_id=REBUILD_TRIMBOX | ✅ |
| 9 | 2.3 risk_level=LOW | ✅ |
| 10 | 2.4 visual_sensitivity=false | ✅ |
| 11 | 2.5 missing_tool=null | ✅ |
| 12 | 2.6 validator_required=false | ✅ |
| 13 | 2.7 operator_review_reason=null | ✅ |
| 14 | 3.1 BLEED_MISSING -> fixability=FIXABLE_REVIEW_REQUIRED | ✅ |
| 15 | 3.2 fix_id=APPLY_BLEED | ✅ |
| 16 | 3.3 risk_level=MEDIUM | ✅ |
| 17 | 3.4 operator_review_reason=HUMAN_REVIEW_REQUIRED | ✅ |
| 18 | 4.1 PAGE_SIZE_INCONSISTENT -> fixability=NOT_FIXABLE | ✅ |
| 19 | 4.2 fix_id=null | ✅ |
| 20 | 4.3 operator_review_reason=null (no known capability) | ✅ |
| 21 | 5.1 TRANSPARENCY_PRESENT -> fixability=NOT_IMPLEMENTED | ✅ |
| 22 | 5.2 fix_id=FLATTEN_TRANSPARENCY | ✅ |
| 23 | 5.3 operator_review_reason=FIX_NOT_IMPLEMENTED | ✅ |
| 24 | 5.4 visual_sensitivity=true (transparency_overprint) | ✅ |
| 25 | 5.5 risk_level=HIGH | ✅ |
| 26 | 6.1 IND_INK_001 -> visual_sensitivity=true | ✅ |
| 27 | 6.2 REDUCE_TOTAL_INK_COVERAGE not implemented -> NOT_IMPLEMENTED | ✅ |
| 28 | 6.3 risk_level=HIGH (destructiveFixRisk from normalizer) | ✅ |
| 29 | 6.4 TRIM_MARGIN_WARNING -> visual_sensitivity=false | ✅ |
| 30 | 7.1 VALIDATE_PDFX -> validator_required=true | ✅ |
| 31 | 7.2 VALIDATE_PDFX -> fixability=FIXABLE_REVIEW_REQUIRED | ✅ |
| 32 | 7.3 operator_review_reason=VALIDATOR_REQUIRED | ✅ |
| 33 | 8.1 missing_tool=verapdf when toolchain tool unavailable | ✅ |
| 34 | 8.2 operator_review_reason=MISSING_TOOL:verapdf | ✅ |
| 35 | 8.3 fixability=FIXABLE_REVIEW_REQUIRED despite missing tool | ✅ |
| 36 | 8.4 unrelated missing tool does not affect this finding | ✅ |
| 37 | 9.1 signals_are_advisory_only=true | ✅ |
| 38 | 9.2 recommendation_authority=false | ✅ |
| 39 | 9.3 auto_apply_authority=false | ✅ |
| 40 | 9.4 production_certified=false | ✅ |
| 41 | 9.5 standard_certified=false | ✅ |
| 42 | 9.6 compliance_claim_allowed=false | ✅ |
| 43 | 9.7 summary.total_findings=3 | ✅ |
| 44 | 9.8 summary.fixable_auto_count=1 (REBUILD_TRIMBOX) | ✅ |
| 45 | 9.9 summary.not_implemented_count=2 | ✅ |
| 46 | 9.10 summary.visual_review_required_count=2 (ink + transparency) | ✅ |
| 47 | 10.1 report includes recommendation_signals | ✅ |
| 48 | 10.2 recommendation_signals.findings is array | ✅ |
| 49 | 10.3 one finding signal generated | ✅ |
| 50 | 10.4 finding signal fixability=FIXABLE_AUTO | ✅ |
| 51 | 10.5 governance carried through ReportBuilder | ✅ |
