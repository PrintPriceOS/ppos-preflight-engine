# Phase 72A — Engine Policy Profile Contract

**Generated:** 2026-06-10T18:42:59.409Z  
**Smoke:** ✅ PASSED  
**Results:** 109/109 passed

## Built-in Profiles
- `NONE`
- `OFFSET_STANDARD`
- `PDFX4_STRICT`
- `PDFA2B_ARCHIVE`
- `DIGITAL_SCREEN`
- `SHEETFED_HIGH_END`

## Governance
| Invariant | Value |
|-----------|-------|
| profile_pass → production_certified | **false** |
| profile_pass → standard_certified | **false** |
| profile is certification authority | **false** |

## Test Results
| # | Test | Pass |
|---|------|------|
| 1 | 1.1 Built-in profile "NONE" exists | ✅ |
| 2 | 1.2 Profile NONE has key "profile_id" | ✅ |
| 3 | 1.2 Profile NONE has key "label" | ✅ |
| 4 | 1.2 Profile NONE has key "bleed_policy" | ✅ |
| 5 | 1.2 Profile NONE has key "tac_limit" | ✅ |
| 6 | 1.2 Profile NONE has key "color_policy" | ✅ |
| 7 | 1.2 Profile NONE has key "font_policy" | ✅ |
| 8 | 1.2 Profile NONE has key "security_policy" | ✅ |
| 9 | 1.2 Profile NONE has key "page_marks_policy" | ✅ |
| 10 | 1.3 Profile NONE passes shape validation | ✅ |
| 11 | 1.1 Built-in profile "OFFSET_STANDARD" exists | ✅ |
| 12 | 1.2 Profile OFFSET_STANDARD has key "profile_id" | ✅ |
| 13 | 1.2 Profile OFFSET_STANDARD has key "label" | ✅ |
| 14 | 1.2 Profile OFFSET_STANDARD has key "bleed_policy" | ✅ |
| 15 | 1.2 Profile OFFSET_STANDARD has key "tac_limit" | ✅ |
| 16 | 1.2 Profile OFFSET_STANDARD has key "color_policy" | ✅ |
| 17 | 1.2 Profile OFFSET_STANDARD has key "font_policy" | ✅ |
| 18 | 1.2 Profile OFFSET_STANDARD has key "security_policy" | ✅ |
| 19 | 1.2 Profile OFFSET_STANDARD has key "page_marks_policy" | ✅ |
| 20 | 1.3 Profile OFFSET_STANDARD passes shape validation | ✅ |
| 21 | 1.1 Built-in profile "PDFX4_STRICT" exists | ✅ |
| 22 | 1.2 Profile PDFX4_STRICT has key "profile_id" | ✅ |
| 23 | 1.2 Profile PDFX4_STRICT has key "label" | ✅ |
| 24 | 1.2 Profile PDFX4_STRICT has key "bleed_policy" | ✅ |
| 25 | 1.2 Profile PDFX4_STRICT has key "tac_limit" | ✅ |
| 26 | 1.2 Profile PDFX4_STRICT has key "color_policy" | ✅ |
| 27 | 1.2 Profile PDFX4_STRICT has key "font_policy" | ✅ |
| 28 | 1.2 Profile PDFX4_STRICT has key "security_policy" | ✅ |
| 29 | 1.2 Profile PDFX4_STRICT has key "page_marks_policy" | ✅ |
| 30 | 1.3 Profile PDFX4_STRICT passes shape validation | ✅ |
| 31 | 1.1 Built-in profile "PDFA2B_ARCHIVE" exists | ✅ |
| 32 | 1.2 Profile PDFA2B_ARCHIVE has key "profile_id" | ✅ |
| 33 | 1.2 Profile PDFA2B_ARCHIVE has key "label" | ✅ |
| 34 | 1.2 Profile PDFA2B_ARCHIVE has key "bleed_policy" | ✅ |
| 35 | 1.2 Profile PDFA2B_ARCHIVE has key "tac_limit" | ✅ |
| 36 | 1.2 Profile PDFA2B_ARCHIVE has key "color_policy" | ✅ |
| 37 | 1.2 Profile PDFA2B_ARCHIVE has key "font_policy" | ✅ |
| 38 | 1.2 Profile PDFA2B_ARCHIVE has key "security_policy" | ✅ |
| 39 | 1.2 Profile PDFA2B_ARCHIVE has key "page_marks_policy" | ✅ |
| 40 | 1.3 Profile PDFA2B_ARCHIVE passes shape validation | ✅ |
| 41 | 1.1 Built-in profile "DIGITAL_SCREEN" exists | ✅ |
| 42 | 1.2 Profile DIGITAL_SCREEN has key "profile_id" | ✅ |
| 43 | 1.2 Profile DIGITAL_SCREEN has key "label" | ✅ |
| 44 | 1.2 Profile DIGITAL_SCREEN has key "bleed_policy" | ✅ |
| 45 | 1.2 Profile DIGITAL_SCREEN has key "tac_limit" | ✅ |
| 46 | 1.2 Profile DIGITAL_SCREEN has key "color_policy" | ✅ |
| 47 | 1.2 Profile DIGITAL_SCREEN has key "font_policy" | ✅ |
| 48 | 1.2 Profile DIGITAL_SCREEN has key "security_policy" | ✅ |
| 49 | 1.2 Profile DIGITAL_SCREEN has key "page_marks_policy" | ✅ |
| 50 | 1.3 Profile DIGITAL_SCREEN passes shape validation | ✅ |
| 51 | 1.1 Built-in profile "SHEETFED_HIGH_END" exists | ✅ |
| 52 | 1.2 Profile SHEETFED_HIGH_END has key "profile_id" | ✅ |
| 53 | 1.2 Profile SHEETFED_HIGH_END has key "label" | ✅ |
| 54 | 1.2 Profile SHEETFED_HIGH_END has key "bleed_policy" | ✅ |
| 55 | 1.2 Profile SHEETFED_HIGH_END has key "tac_limit" | ✅ |
| 56 | 1.2 Profile SHEETFED_HIGH_END has key "color_policy" | ✅ |
| 57 | 1.2 Profile SHEETFED_HIGH_END has key "font_policy" | ✅ |
| 58 | 1.2 Profile SHEETFED_HIGH_END has key "security_policy" | ✅ |
| 59 | 1.2 Profile SHEETFED_HIGH_END has key "page_marks_policy" | ✅ |
| 60 | 1.3 Profile SHEETFED_HIGH_END passes shape validation | ✅ |
| 61 | 2.1 resolveProfile by id returns correct profile | ✅ |
| 62 | 2.2 resolveProfile by custom object returns it | ✅ |
| 63 | 2.3 resolveProfile unknown id falls back to NONE | ✅ |
| 64 | 2.4 resolveProfile null falls back to NONE | ✅ |
| 65 | 2.5 resolveProfile malformed object falls back to NONE | ✅ |
| 66 | 3.1 profile_passed is boolean | ✅ |
| 67 | 3.2 profile_blockers is array | ✅ |
| 68 | 3.3 profile_warnings is array | ✅ |
| 69 | 3.4 evaluated_at is string | ✅ |
| 70 | 3.5 production_certified always false | ✅ |
| 71 | 3.6 standard_certified always false | ✅ |
| 72 | 3.7 compliance_claim_allowed always false | ✅ |
| 73 | 3.8 print_ready_claim_allowed always false | ✅ |
| 74 | 3.9 NONE profile with no findings: profile_passed=true | ✅ |
| 75 | 3.10 NONE profile: no blockers | ✅ |
| 76 | 3.11 PDFX4_STRICT: production_certified=false even when passed | ✅ |
| 77 | 3.12 PDFX4_STRICT: standard_certified=false even when passed | ✅ |
| 78 | 4.1 Bleed violation → profile_passed=false | ✅ |
| 79 | 4.1 PROFILE_BLEED_REQUIRED blocker emitted | ✅ |
| 80 | 4.2 TAC finding → profile_passed=false | ✅ |
| 81 | 4.2 PROFILE_TAC_LIMIT_EXCEEDED blocker | ✅ |
| 82 | 4.3 Measured TAC > limit → profile_passed=false | ✅ |
| 83 | 4.3 PROFILE_TAC_LIMIT_EXCEEDED via measured | ✅ |
| 84 | 4.4 RGB finding on CMYK-only profile → failed | ✅ |
| 85 | 4.4 PROFILE_CMYK_REQUIRED blocker | ✅ |
| 86 | 4.5 Unembedded font → profile_passed=false | ✅ |
| 87 | 4.5 PROFILE_FONTS_MUST_BE_EMBEDDED | ✅ |
| 88 | 4.6 PROFILE_TYPE3_FONTS_NOT_ALLOWED | ✅ |
| 89 | 4.7 JS finding on no_javascript profile → failed | ✅ |
| 90 | 4.7 PROFILE_NO_JAVASCRIPT_VIOLATED | ✅ |
| 91 | 4.8 PROFILE_NO_EMBEDDED_FILES_VIOLATED | ✅ |
| 92 | 4.9 PROFILE_NO_LAUNCH_ACTIONS_VIOLATED | ✅ |
| 93 | 4.10 PROFILE_CROP_MARKS_REQUIRED | ✅ |
| 94 | 4.11 PROFILE_STANDARD_MISMATCH | ✅ |
| 95 | 4.12 no PROFILE_STANDARD_MISMATCH when null | ✅ |
| 96 | 4.12 warning emitted | ✅ |
| 97 | 4.13 DIGITAL_SCREEN allows RGB — no CMYK blocker | ✅ |
| 98 | 4.14 NONE profile with findings: profile_passed=true | ✅ |
| 99 | 4.14 NONE profile: no blockers regardless of findings | ✅ |
| 100 | 4.15 No duplicate warnings | ✅ |
| 101 | 5.1 evaluateFromFixAudit detects blockers from findings[] | ✅ |
| 102 | 5.1 bleed blocker from fix_audit.findings | ✅ |
| 103 | 5.1 JS blocker from fix_audit.findings | ✅ |
| 104 | 5.2 bleed blocker from fix_audit.plan[].source_finding | ✅ |
| 105 | 5.2 JS blocker from fix_audit.plan[].source_finding | ✅ |
| 106 | 5.3 evaluateFromFixAudit: production_certified always false | ✅ |
| 107 | 5.3 evaluateFromFixAudit: standard_certified always false | ✅ |
| 108 | 6.1 FixPlanner processes policy_profile_constraint without throwing | ✅ |
| 109 | 6.2 No policy_profile_constraint fix is auto-applied | ✅ |
