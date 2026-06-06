# Phase 56E.1 Engine Artifact Trust Regression

| Scenario | Filename | Trust Level | Review Req | Prod Cert | Std Cert | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- |
| 1. certified.pdf filename only | certified.pdf | FIXED_READY | false | false | false | ✅ PASS |
| 2. fixed.pdf with no blockers | fixed.pdf | FIXED_READY | false | false | false | ✅ PASS |
| 3. review.pdf required due to visual governance | review.pdf | FIXED_REVIEW_REQUIRED | true | false | false | ✅ PASS |
| 4. certified.pdf with font/color/image/transparency review blocker | certified.pdf | FIXED_REVIEW_REQUIRED | true | false | false | ✅ PASS |
| 5. certified.pdf production-certified but not standards-certified | certified.pdf | PRODUCTION_CERTIFIED | false | true | false | ✅ PASS |
| 6. certified.pdf standards-certified with complete validator evidence | certified.pdf | STANDARD_CERTIFIED | false | true | true | ✅ PASS |
| 7. OutputIntent injected | certified.pdf | FIXED_READY | false | false | false | ✅ PASS |
| 8. destructive visual fix applied | review.pdf | FIXED_REVIEW_REQUIRED | true | false | false | ✅ PASS |
| 9. detector_gap / validator_gap metadata | certified.pdf | FIXED_READY | false | false | false | ✅ PASS |
| 10. artifact role ordering | review.pdf | FIXED_REVIEW_REQUIRED | true | false | false | ✅ PASS |
