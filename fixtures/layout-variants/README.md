# layout-variants

Two repository shapes the scanner must resolve links in, neither of which is
this repository's own monorepo layout (Phase 4 Wave A todo 0).

- `monorepo-aliases/` — a pnpm-style workspace whose packages are imported by
  name (`@demo/core`), through a subpath export (`@demo/core/util`), through a
  barrel (`index.ts` re-exports), and through a tsconfig path alias (`~/*`).
- `next-fastapi/` — a Next.js frontend using the conventional `@/*` alias next
  to a FastAPI backend whose modules are imported from the `backend/` source
  root (`from app.core.config import settings`).

Nothing here is installed or executed. The scanner reads these files as a
repository tree, so every expectation about them is a link expectation.
