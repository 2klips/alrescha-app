# Arr worker — the job drain loop (scan → analyze → enrich → judge/coach).
# The web app and hosted MCP live on Vercel; this container is ONLY the
# long-running queue consumer, so it exposes no port.
#
# Build from the REPO ROOT (the workspace context is required):
#   docker build -f apps/worker/Dockerfile .
# or let fly.toml (repo root) do it: fly deploy

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" CI=1
RUN corepack enable

WORKDIR /app

# Workspace manifests first so dependency layers cache across code changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile --filter @arr/worker...

# The worker runs TypeScript directly through tsx (same as run-local),
# so source is all it needs — no build step, no bundling drift.
COPY packages/core packages/core
COPY apps/worker apps/worker
COPY tsconfig.json ./

# Required at runtime: DATABASE_URL, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY.
# Optional: ANTHROPIC_API_KEY / OPENAI_API_KEY (platform judgment + enrich),
# BYOK_ENCRYPTION_KEY. Set them as Fly secrets, never in this image.
CMD ["node", "--import", "tsx", "apps/worker/src/run-local.ts"]
