# Phase 56A Artifact Trust Model Smoke Test

## 1. certified.pdf filename only
- **Pass**: ✅
- **Artifact Role**: certified_pdf
- **Artifact Filename**: certified.pdf
- **Trust Level**: FIXED_READY
- **Review Required**: false
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: false
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: Filename implies certification but evidence is lacking.

## 2. fixed.pdf with no review blockers
- **Pass**: ✅
- **Artifact Role**: fixed_pdf
- **Artifact Filename**: fixed.pdf
- **Trust Level**: PRODUCTION_CERTIFIED
- **Review Required**: false
- **Production Certified**: true
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: None

## 3. review.pdf with visual-risk governance
- **Pass**: ✅
- **Artifact Role**: review_pdf
- **Artifact Filename**: review.pdf
- **Trust Level**: FIXED_REVIEW_REQUIRED
- **Review Required**: true
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: false
- **Blocked By**: color
- **Warnings**: None

## 4. certified.pdf with font review required
- **Pass**: ✅
- **Artifact Role**: certified_pdf
- **Artifact Filename**: certified.pdf
- **Trust Level**: FIXED_REVIEW_REQUIRED
- **Review Required**: true
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: false
- **Is Primary Candidate**: false
- **Blocked By**: fonts
- **Warnings**: Filename implies certification but evidence is lacking.

## 5. certified.pdf with valid internal production governance but no standards evidence
- **Pass**: ✅
- **Artifact Role**: certified_pdf
- **Artifact Filename**: certified.pdf
- **Trust Level**: PRODUCTION_CERTIFIED
- **Review Required**: false
- **Production Certified**: true
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: None

## 6. certified.pdf with complete standards validator evidence
- **Pass**: ✅
- **Artifact Role**: certified_pdf
- **Artifact Filename**: certified.pdf
- **Trust Level**: STANDARD_CERTIFIED
- **Review Required**: false
- **Production Certified**: true
- **Standard Certified**: true
- **Customer Visible**: true
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: None

## 7. OutputIntent injected
- **Pass**: ✅
- **Artifact Role**: certified_pdf
- **Artifact Filename**: certified.pdf
- **Trust Level**: PRODUCTION_CERTIFIED
- **Review Required**: false
- **Production Certified**: true
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: OutputIntent does not prove PDF/X.

## 8. destructive visual fix applied
- **Pass**: ✅
- **Artifact Role**: review_pdf
- **Artifact Filename**: review.pdf
- **Trust Level**: FIXED_REVIEW_REQUIRED
- **Review Required**: true
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: false
- **Blocked By**: transparency_overprint
- **Warnings**: None

## 9. detector_gap / validator_gap metadata
- **Pass**: ✅
- **Artifact Role**: fixed_pdf
- **Artifact Filename**: fixed.pdf
- **Trust Level**: FIXED_READY
- **Review Required**: false
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: true
- **Is Primary Candidate**: true
- **Blocked By**: None
- **Warnings**: None

## 10. artifact role ordering (trust-based selection)
- **Pass**: ✅
- **Artifact Role**: fixed_pdf
- **Artifact Filename**: fixed.pdf
- **Trust Level**: FIXED_REVIEW_REQUIRED
- **Review Required**: true
- **Production Certified**: false
- **Standard Certified**: false
- **Customer Visible**: false
- **Is Primary Candidate**: false
- **Blocked By**: test
- **Warnings**: None

