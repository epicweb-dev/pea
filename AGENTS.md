# pea agent index

Use Bun for installs and scripts (`bun install`, `bun run ...`). Do not use npm.

This file is intentionally brief. Detailed instructions live in focused docs:

- Setup, checks, docs maintenance, preview deploys, and seeding:
  - [docs/agents/setup.md](./docs/agents/setup.md)
- Code style conventions:
  - [docs/agents/code-style.md](./docs/agents/code-style.md)
- Testing guidance:
  - [docs/agents/testing-principles.md](./docs/agents/testing-principles.md)
  - [docs/agents/end-to-end-testing.md](./docs/agents/end-to-end-testing.md)
- Tooling and framework references:
  - [docs/agents/harness-engineering.md](./docs/agents/harness-engineering.md)
  - [docs/agents/oxlint-js-plugins.md](./docs/agents/oxlint-js-plugins.md)
  - [docs/agents/remix/index.md](./docs/agents/remix/index.md)
  - [docs/agents/cloudflare-agents-sdk.md](./docs/agents/cloudflare-agents-sdk.md)
  - [docs/agents/mcp-apps-starter-guide.md](./docs/agents/mcp-apps-starter-guide.md)
- Project setup references:
  - [docs/getting-started.md](./docs/getting-started.md)
  - [docs/environment-variables.md](./docs/environment-variables.md)
  - [docs/setup-manifest.md](./docs/setup-manifest.md)
- Architecture references:
  - [docs/architecture/index.md](./docs/architecture/index.md)
  - [docs/architecture/request-lifecycle.md](./docs/architecture/request-lifecycle.md)
  - [docs/architecture/authentication.md](./docs/architecture/authentication.md)
  - [docs/architecture/data-storage.md](./docs/architecture/data-storage.md)

## Cursor Cloud specific instructions

See [.cursor/CLOUD.md](./.cursor/CLOUD.md) for the full quick-reference table.

### Non-obvious gotchas

- **Dev server port is 3742**, not 8787. The CLI (`cli.ts`) defaults to port
  3742 and auto-finds a free port in the range 3742-3751.
- **`.env` must exist** before running `bun run dev`. Copy `.env.example` to
  `.env` and ensure `COOKIE_SECRET` is at least 32 characters (generate with
  `openssl rand -hex 32`).
- **Mock servers auto-start**: `bun run dev` automatically starts mock Resend
  (email) and mock AI workers. No external services or Docker needed.
- **Seed test accounts** before testing login flows:
  - Regular user: `bun run migrate:local && bun tools/seed-test-data.ts --local`
    (email: `kody@kcd.dev`, password: `kodylovesyou`).
  - Admin user:
    `bun tools/seed-test-data.ts --local --email me@kentcdodds.com --password iliketwix`
    (email: `me@kentcdodds.com`, password: `iliketwix`). Admin status is
    determined by email match in `shared/admin.ts`.
- **No git hooks or pre-commit** checks are configured. Run `bun run validate`
  manually before pushing.
