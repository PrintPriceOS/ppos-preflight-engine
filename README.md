# ppos-preflight-engine

Canonical Deterministic Analysis Core for PrintPrice OS.

## Responsibilities
- PDF Geometry Analysis
- Technical PDF Validation
- Industrial Risk Scoring
- Autofix Planning

## Usage
```javascript
const { createStandardEngine } = require('@ppos/preflight-engine');
const engine = createStandardEngine();
const report = await engine.analyzePdf('path/to/file.pdf', { options });
```