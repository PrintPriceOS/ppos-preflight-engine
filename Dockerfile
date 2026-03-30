# @ppos/preflight-engine Dockerfile
FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests from its repo folder
COPY ppos-preflight-engine/package*.json ./
RUN npm install --only=production --no-audit

# Copy source from its repo folder
COPY ppos-preflight-engine/index.js ./
COPY ppos-preflight-engine/bin/ ./bin/
COPY ppos-preflight-engine/analyzers/ ./analyzers/
COPY ppos-preflight-engine/core/ ./core/
COPY ppos-preflight-engine/detection/ ./detection/
COPY ppos-preflight-engine/engine/ ./engine/
COPY ppos-preflight-engine/execution/ ./execution/
COPY ppos-preflight-engine/fixes/ ./fixes/
COPY ppos-preflight-engine/interpretation/ ./interpretation/
COPY ppos-preflight-engine/math/ ./math/
COPY ppos-preflight-engine/src/ ./src/

# Link binary
RUN npm link

# Environment
ENV GS_COMMAND=gs
ENV PPOS_TEMP_DIR=/tmp/ppos-preflight

USER node
ENTRYPOINT ["ppos-preflight"]
CMD ["--help"]
