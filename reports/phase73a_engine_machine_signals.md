# Phase 73A — Engine Machine Capability Signals

**Generated:** 2026-06-15T14:16:33.041Z  
**Smoke:** ✅ PASSED  
**Results:** 80/80 passed

## Signal Groups
- `page_signals`
- `color_signals`
- `ink_signals`
- `finishing_signals`
- `standards_signals`
- `media_requirements`

## Governance
| Invariant | Value |
|-----------|-------|
| signals are advisory only | **true** |
| machine_match_authority | **false** |
| production_certified | **false** |
| standard_certified | **false** |
| compliance_claim_allowed | **false** |

## Test Results
| # | Test | Pass |
|---|------|------|
| 1 | 1.1 generated_at is string | ✅ |
| 2 | 1.2 page_signals is object | ✅ |
| 3 | 1.3 color_signals is object | ✅ |
| 4 | 1.4 ink_signals is object | ✅ |
| 5 | 1.5 finishing_signals is object | ✅ |
| 6 | 1.6 standards_signals is object | ✅ |
| 7 | 1.7 media_requirements is object | ✅ |
| 8 | 1.8 warnings is array | ✅ |
| 9 | 1.9 empty input: page_count=0 | ✅ |
| 10 | 1.10 empty input: PAGE_COUNT_UNAVAILABLE warning | ✅ |
| 11 | 1.11 empty input: PAGE_SIZE_UNAVAILABLE warning | ✅ |
| 12 | 1.12 empty input: orientation=UNKNOWN | ✅ |
| 13 | 1.13 empty input: color_mode=CMYK_OR_UNSPECIFIED | ✅ |
| 14 | 1.14 empty input: ink_risk=LOW | ✅ |
| 15 | 1.15 empty input: finishing_marks_risk=LOW | ✅ |
| 16 | 1.16 empty input: standard_status=UNKNOWN | ✅ |
| 17 | 2.1 page_count=1 | ✅ |
| 18 | 2.2 page_size_mm.width=210 | ✅ |
| 19 | 2.3 page_size_mm.height=297 | ✅ |
| 20 | 2.4 A4 portrait → orientation=PORTRAIT | ✅ |
| 21 | 2.5 single page → page_size_consistent=true | ✅ |
| 22 | 2.6 no mixed orientation finding → false | ✅ |
| 23 | 2.7 wide page → orientation=LANDSCAPE | ✅ |
| 24 | 2.8 equal width/height → orientation=SQUARE | ✅ |
| 25 | 2.9 differing page dims → page_size_consistent=false | ✅ |
| 26 | 2.10 PAGE_SIZE_INCONSISTENT finding → page_size_consistent=false | ✅ |
| 27 | 3.1 RGB finding → rgb_detected=true | ✅ |
| 28 | 3.2 RGB finding → color_mode=RGB_PRESENT | ✅ |
| 29 | 3.3 mixed color space finding → mixed_color_spaces=true | ✅ |
| 30 | 3.4 mixed color space finding → color_mode=MIXED_COLOR_SPACES | ✅ |
| 31 | 3.5 spot color finding → spot_color_detected=true | ✅ |
| 32 | 3.6 ICC missing finding → icc_profile_missing=true | ✅ |
| 33 | 3.7 no findings → rgb_detected=false | ✅ |
| 34 | 3.8 no findings → color_mode=CMYK_OR_UNSPECIFIED | ✅ |
| 35 | 4.1 TAC exceeded finding → tac_exceeded=true | ✅ |
| 36 | 4.2 TAC exceeded → ink_risk=HIGH | ✅ |
| 37 | 4.3 rich black finding → rich_black_risk=true | ✅ |
| 38 | 4.4 rich black only → ink_risk=MEDIUM | ✅ |
| 39 | 4.5 registration color misuse → flag true | ✅ |
| 40 | 4.6 registration color misuse → ink_risk=HIGH | ✅ |
| 41 | 4.7 tac_measured passed through from jobMeta | ✅ |
| 42 | 4.8 no ink findings → ink_risk=LOW | ✅ |
| 43 | 4.9 no jobMeta → tac_measured=null | ✅ |
| 44 | 5.1 crop marks missing finding → flag true | ✅ |
| 45 | 5.2 bleed missing finding → flag true | ✅ |
| 46 | 5.3 crop marks + bleed missing → finishing_marks_risk=HIGH | ✅ |
| 47 | 5.4 bleed missing only → finishing_marks_risk=MEDIUM | ✅ |
| 48 | 5.5 registration marks inside trim → flag true | ✅ |
| 49 | 5.6 registration marks inside trim → finishing_marks_risk=HIGH | ✅ |
| 50 | 5.7 page marks inconsistent → flag true | ✅ |
| 51 | 5.8 page marks inconsistent only → finishing_marks_risk=MEDIUM | ✅ |
| 52 | 5.9 no findings → finishing_marks_risk=LOW | ✅ |
| 53 | 5.10 no findings → bleed_missing=false | ✅ |
| 54 | 6.1 STANDARD_VALIDATION_PASSED → standard_status=VALIDATED | ✅ |
| 55 | 6.2 detected_standard passed through | ✅ |
| 56 | 6.3 claimed-not-validated → standard_status=CLAIMED_NOT_VALIDATED | ✅ |
| 57 | 6.4 PDFX_INVALID → standard_status=INVALID | ✅ |
| 58 | 6.5 standard_invalid=true | ✅ |
| 59 | 6.6 PDF_STANDARD_UNKNOWN → standard_status=NOT_CLAIMED | ✅ |
| 60 | 6.7 no standards findings → standard_status=UNKNOWN | ✅ |
| 61 | 6.8 no jobMeta → detected_standard=null | ✅ |
| 62 | 6.9 INVALID takes priority over VALIDATED | ✅ |
| 63 | 7.1 default min_bleed_mm=3 | ✅ |
| 64 | 7.2 no bleed finding → bleed_present=true | ✅ |
| 65 | 7.3 no jobMeta → paper_type=null | ✅ |
| 66 | 7.4 no jobMeta → paper_gsm=null | ✅ |
| 67 | 7.5 bleed missing finding → bleed_present=false | ✅ |
| 68 | 7.6 RGB present → requires_cmyk_conversion=true | ✅ |
| 69 | 7.7 paper_type passed through from jobMeta | ✅ |
| 70 | 7.8 paper_gsm passed through from jobMeta | ✅ |
| 71 | 7.9 media_requirements.page_size_mm mirrors page_signals | ✅ |
| 72 | 8.1 signals_are_advisory_only=true | ✅ |
| 73 | 8.2 machine_match_authority=false | ✅ |
| 74 | 8.3 production_certified=false even when standard validated | ✅ |
| 75 | 8.4 standard_certified=false even when standard validated | ✅ |
| 76 | 8.5 compliance_claim_allowed=false | ✅ |
| 77 | 9.1 report includes machine_capability_signals | ✅ |
| 78 | 9.2 report signals reflect BLEED_MISSING finding | ✅ |
| 79 | 9.3 report signals reflect page_count | ✅ |
| 80 | 9.4 report signals carry governance invariants | ✅ |
