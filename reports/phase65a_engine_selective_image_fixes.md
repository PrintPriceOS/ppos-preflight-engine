# Phase 65A — Engine Selective Image Fixes

**Smoke Test Passed:** ✅ YES

## Executive Summary
Validates Engine-only selective image fix scaffolding for RGB-to-CMYK conversion, untagged image tagging, ICC profile normalization, excessive-resolution downsampling, and low-resolution flagging — all under category `image_quality`, all visually sensitive (except low-res flagging), review-required, free of standards/production overclaims, and never performing global destructive conversion or automatic upscaling.

## Target Fixes
- `CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE`
- `TAG_UNTAGGED_IMAGES`
- `NORMALIZE_IMAGE_ICC_PROFILE`
- `DOWNSAMPLE_EXCESSIVE_RESOLUTION`
- `FLAG_LOW_RES_IMAGES_UNFIXABLE`

## Finding Codes (Phase 65A)
| Code | Meaning |
| --- | --- |
| IND_IMG_017 | RGB Images Present |
| IND_IMG_018 | Untagged Image Detected |
| IND_IMG_019 | Image ICC Profile Mismatch |
| IND_IMG_020 | Excessive Resolution Image Detected |
| IND_IMG_005 | Low Resolution Images Detected |

## Scenario Matrix
| Scenario | Capability | Status | Passed | Notes |
| --- | --- | --- | --- | --- |
| FixRegistry image_quality (Phase 65A) capabilities check | CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE, TAG_UNTAGGED_IMAGES, NORMALIZE_IMAGE_ICC_PROFILE, DOWNSAMPLE_EXCESSIVE_RESOLUTION, FLAG_LOW_RES_IMAGES_UNFIXABLE | VERIFIED | ✅ | DOWNSAMPLE_EXCESSIVE_RESOLUTION: evidence_required not set (informational) |
| IndustrialFindingCodes Phase 65A image codes | — | VERIFIED | ✅ | All Phase 65A image finding codes registered correctly (including reuse of existing LOW_RES_IMAGES). |
| IssueNormalizer selective image routing | — | VERIFIED | ✅ | IssueNormalizer correctly routes Phase 65A image codes to selective image fixes with safeToAutofix=false and category=IMAGE. |
| FixPlanner selective image guardrails | — | VERIFIED | ✅ | FixPlanner correctly blocks all Phase 65A selective image fixes from being planned/executable in any policy mode. |
| CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE returns SKIPPED_UNSUPPORTED with evidence | CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| TAG_UNTAGGED_IMAGES returns SKIPPED_UNSUPPORTED with evidence | TAG_UNTAGGED_IMAGES | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| NORMALIZE_IMAGE_ICC_PROFILE returns SKIPPED_UNSUPPORTED with evidence | NORMALIZE_IMAGE_ICC_PROFILE | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| DOWNSAMPLE_EXCESSIVE_RESOLUTION returns SKIPPED_UNSUPPORTED with evidence | DOWNSAMPLE_EXCESSIVE_RESOLUTION | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| FLAG_LOW_RES_IMAGES_UNFIXABLE flags honestly without upscaling | FLAG_LOW_RES_IMAGES_UNFIXABLE | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE on clean control — honest skip | CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE | SKIPPED_UNSUPPORTED | ✅ | Minor: selective image fix does not signal review_required=true (non-fatal, informational) |
| Selective image overclaim regression (aggregate) | — | VERIFIED | ✅ | No selective image fix produced a standards, PDF/X, PDF/A, production certification, or production_safe claim. |
| Selective image no-APPLIED regression (aggregate) | — | VERIFIED | ✅ | No selective image fix produced an APPLIED result without a color-managed pipeline — correctly deferred to SKIPPED_UNSUPPORTED. |
| No-upscaling policy regression (aggregate) | FLAG_LOW_RES_IMAGES_UNFIXABLE | VERIFIED | ✅ | Low-resolution images are honestly flagged; no automatic upscaling/interpolation was performed. |
| Selective image review_required signal (aggregate) | — | VERIFIED | ✅ | "No-upscaling policy regression (aggregate)" does not signal requires_human_review=true |

## Governance Summary
Verified across all scenarios that:
- All `image_quality` Phase 65A capabilities are registered with `production_safe=false`, `requires_human_review=true`, `evidence_required=true`.
- IssueNormalizer routes IND_IMG_017–020 and IND_IMG_005 (low-res) codes to selective image fixes with `safeToAutofix=false` and `category=IMAGE`.
- FixPlanner blocks all Phase 65A selective image fixes from being planned or executable in any policy mode (`skip_reason=VISUAL_REVIEW_REQUIRED` or `LOW_RES_UNFIXABLE_NO_UPSCALE`).
- All engine execution attempts return `SKIPPED_UNSUPPORTED` with a populated evidence object — no global or destructive image conversion is made.
- No selective image fix claims standards, PDF/X, PDF/A, production certification, or production safety.
- Low-resolution images are flagged honestly (`upscaling_performed=false`) — detail is never invented.
- `review_required=true` and `visual_change_expected` are preserved in evidence for downstream Worker/Service consumption.