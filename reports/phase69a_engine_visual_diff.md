# Phase 69A — Engine Visual Diff / Rendered Proof Generation

**Smoke Test Passed:** ✅ YES
**Scenarios:** 12 | **Passed:** 12 | **Failed:** 0

## Render Tool Status
- **Available:** Yes
- **Tool:** ghostscript
- **Version:** ghostscript 10.06.0

## Visual Diff Governance

> Visual diff is evidence generation, not certification.
> Visual diff does not imply print-ready status.
> Visual diff does not imply production certification.
> Visual diff does not imply PDF/X or PDF/A compliance.

## Target Capabilities
- `RENDER_PDF_PAGES`
- `GENERATE_VISUAL_DIFF`
- `GENERATE_PROOF_THUMBNAILS`
- `COMPARE_ORIGINAL_TO_FIXED`
- `COMPARE_FIXED_TO_CERTIFIED`
- `GENERATE_VISUAL_CHANGE_REPORT`

## Phase 69A Finding Codes
| Code | Meaning |
| --- | --- |
| IND_VISUAL_001 | Visual Diff Required |
| IND_VISUAL_002 | Visual Change Detected |
| IND_VISUAL_003 | Visual Diff Tool Unavailable |
| IND_VISUAL_004 | Rendered Proof Required |
| IND_VISUAL_005 | Rendered Proof Generated |

## Required Evidence Fields
| Field | Description |
| --- | --- |
| render_performed | Whether rendering was attempted and succeeded |
| diff_performed | Whether pixel diff was computed |
| pages_rendered | Number of pages successfully rendered |
| pages_compared | Number of pages compared |
| changed_pixel_ratio_max | Max per-page byte-level diff ratio (proxy) |
| changed_pixel_ratio_avg | Average per-page byte-level diff ratio (proxy) |
| dimensions_match | Whether rendered page dimensions match across both PDFs |
| render_tool | Tool used for rendering (ghostscript/mutool/null) |
| render_tool_version | Version of the render tool |
| diff_images | Array of diff image paths (if generated) |
| thumbnails | Array of thumbnail/rendered page paths |
| warnings | Render or diff warnings |
| limitations | Honest limitations of the diff result |

## Scenario Matrix
| Scenario | Capability | Status | Passed | Notes |
| --- | --- | --- | --- | --- |
| FixRegistry Phase 69A visual_proofing capabilities check | RENDER_PDF_PAGES, GENERATE_VISUAL_DIFF, GENERATE_PROOF_THUMBNAILS, COMPARE_ORIGINAL_TO_FIXED, COMPARE_FIXED_TO_CERTIFIED, GENERATE_VISUAL_CHANGE_REPORT | VERIFIED | ✅ | All Phase 69A visual_proofing capabilities registered with correct policy fields. |
| IndustrialFindingCodes Phase 69A visual diff codes | — | VERIFIED | ✅ | All Phase 69A visual diff finding codes registered correctly (IND_VISUAL_001-005). |
| FixPlanner Phase 69A visual_proofing guardrails | — | VERIFIED | ✅ | FixPlanner correctly blocks all Phase 69A visual_proofing capabilities from auto-execution in any policy mode. |
| Render tool detection (Ghostscript / mutool) | — | VERIFIED | ✅ | Render tool available: true; Tool: ghostscript (gswin64c), version: 10.06.0 |
| RENDER_PDF_PAGES — original document | RENDER_PDF_PAGES | APPLIED | ✅ | RENDER_PDF_PAGES correctly renders or honestly reports tool gap. |
| GENERATE_VISUAL_DIFF — original vs fixed (expected changes) | GENERATE_VISUAL_DIFF | APPLIED | ✅ | GENERATE_VISUAL_DIFF correctly computes diff metrics between original and fixed. |
| GENERATE_VISUAL_DIFF — original vs identical clone (expected zero/near-zero diff) | GENERATE_VISUAL_DIFF | APPLIED | ✅ | GENERATE_VISUAL_DIFF correctly reports zero or near-zero diff for identical clone. |
| GENERATE_PROOF_THUMBNAILS — multi-page document | GENERATE_PROOF_THUMBNAILS | APPLIED | ✅ | GENERATE_PROOF_THUMBNAILS correctly renders thumbnails or reports tool gap. |
| COMPARE_ORIGINAL_TO_FIXED — evidence type correct | COMPARE_ORIGINAL_TO_FIXED | APPLIED | ✅ | COMPARE_ORIGINAL_TO_FIXED returns correct evidence with comparison_type. |
| COMPARE_FIXED_TO_CERTIFIED — visual match does not imply certification | COMPARE_FIXED_TO_CERTIFIED | APPLIED | ✅ | COMPARE_FIXED_TO_CERTIFIED correctly sets visual_match_implies_certification=false. |
| GENERATE_VISUAL_CHANGE_REPORT — full evidence structure | GENERATE_VISUAL_CHANGE_REPORT | APPLIED | ✅ | GENERATE_VISUAL_CHANGE_REPORT returns complete evidence structure. |
| Visual diff governance overclaim regression (aggregate) | — | VERIFIED | ✅ | No Phase 69A operation produced production_certified, standard_certified, production_safe, compliance_claim_allowed, or print_ready_claim=true. |

## Governance Summary
Verified across all scenarios that:
- All Phase 69A `visual_proofing` capabilities are registered with `production_safe=false`, `requires_human_review=true`, `compliance_claim_allowed=false`, `print_ready_claim_allowed=false`, `visual_diff_governance=true`, `evidence_required=true`.
- FixPlanner blocks all `visual_proofing` capabilities from auto-execution in every policy mode with `skip_reason=VISUAL_PROOFING_EVIDENCE_ONLY_HUMAN_REVIEW_REQUIRED`.
- `RENDER_PDF_PAGES` uses Ghostscript or mutool when available; returns `SKIPPED_UNSUPPORTED` with `tool_gap=true` when no renderer is found.
- `GENERATE_VISUAL_DIFF` renders both PDFs and computes byte-level diff metrics as a proxy for pixel diff. Honest about limitations.
- `COMPARE_FIXED_TO_CERTIFIED` explicitly sets `visual_match_implies_certification=false`.
- `GENERATE_VISUAL_CHANGE_REPORT` returns the complete required evidence structure.
- No operation claims `production_certified`, `standard_certified`, `production_safe`, `compliance_claim_allowed`, or `print_ready_claim=true`.
- No visual diff is faked — if no rendering tool is available, honest `SKIPPED_UNSUPPORTED` with `tool_gap=true` is returned.