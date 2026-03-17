# Getting Started

Use this guide to run `pea` locally and understand the minimum setup needed for
development.

`pea` is the stakeholder simulation service used by the Epic Systems Engineering
Judgment Workshop. The separate workshop app owns the learner experience; this
repo owns the agent side of the system.

## Prerequisites

- Bun
- A recent Node runtime for tooling that Bun delegates to
- Cloudflare/Wrangler access when you need to deploy or use remote resources

## Install

We use Bun for installs and scripts.

```bash
bun install
```

## Environment

Copy `.env.example` to `.env` and fill in the values you need for your local
workflow.

The most common local requirement is:

- `COOKIE_SECRET` (generate with `openssl rand -hex 32`)

See `docs/setup-manifest.md` for infrastructure and secret expectations.

See `docs/cloudflare-offerings.md` for optional Cloudflare integrations.

## Run Locally

Start the local development environment:

```bash
bun run dev
```

Open **`http://localhost:3742`** — that is the main app. (Playwright uses a
separate port, often 8788, for isolated e2e runs; see `docs/agents/setup.md`.)

## Deploy

Deploy the service with:

```bash
bun run deploy
```

Production deploys ensure required Cloudflare resources exist before running
migrations and deploying the Worker.

## Local development

See `docs/agents/setup.md` for local dev commands and verification steps.

To create a deterministic test login in a running environment:

```bash
bun run migrate:local
bun tools/seed-test-data.ts --local
```

Default test credentials:

- Email: `kody@kcd.dev`
- Password: `kodylovesyou`

Admin test credentials (seed separately):

```bash
bun tools/seed-test-data.ts --local --email me@kentcdodds.com --password iliketwix
```

- Email: `me@kentcdodds.com`
- Password: `iliketwix`

Admin status is determined by email match in `shared/admin.ts`.

## Build

Build the project:

```bash
bun run build
```
