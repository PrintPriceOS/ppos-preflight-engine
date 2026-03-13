# @ppos/preflight-engine Dockerfile
# Industrial Runtime for Printing Preflight

# 1. Base Image (Slim for production efficiency - using Node 20 per spec)
FROM node:20-bookworm-slim

# 2. Install Industrial Dependencies (Ghostscript)
# Non-interactive, clean up to keep image size small.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 3. Security: Create Non-Root User
RUN groupadd -r ppos && useradd -r -g ppos ppos-user
RUN mkdir -p /app /tmp/ppos-preflight && chown -R ppos-user:ppos /app /tmp/ppos-preflight

# 4. Create Application Directory
WORKDIR /app

# 5. Copy Package Manifests
COPY package.json package-lock.json ./

# 6. Install Production Dependencies
RUN npm ci --only=production

# 7. Copy Application Source
COPY index.js ./
COPY bin/ ./bin/
COPY detection/ ./detection/
COPY engine/ ./engine/
COPY execution/ ./execution/
COPY interpretation/ ./interpretation/
COPY math/ ./math/
COPY src/ ./src/

# 8. Symlink binary for global access
RUN npm link

# 9. Environment Configuration
ENV GS_COMMAND=gs
ENV PPOS_TEMP_DIR=/tmp/ppos-preflight
ENV PPOS_LOG_LEVEL=info

# 10. Security: Switch to Non-Root User
USER ppos-user

# 11. Execution Context
ENTRYPOINT ["ppos-preflight"]
CMD ["--help"]
