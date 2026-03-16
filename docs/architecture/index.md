# Architecture overview

This folder documents the important runtime architecture for `pea`.

`pea` is the stakeholder simulation service for the Epic Systems Engineering
Judgment Workshop. It is not the full learner-facing workshop app. The workshop
app owns the learning experience; `pea` owns the agent-side runtime and related
service behavior.

## System boundary

At a high level, `pea` is responsible for:

- stakeholder conversation runtime
- scenario and prompt behavior
- instructor/admin control surfaces
- integration endpoints used by the workshop app

The separate workshop app is responsible for:

- learner-facing exercise flow
- facilitation and curriculum delivery
- critique workflow outside the agent runtime
- broader workshop UX

## Core docs

- [Request Lifecycle](./request-lifecycle.md): how requests are routed in the
  Worker.
- [Authentication](./authentication.md): app session auth and OAuth-protected
  MCP auth.
- [Data Storage](./data-storage.md): what is stored in D1, KV, and Durable
  Objects.

## Source of truth in code

- Worker entrypoint: `worker/index.ts`
- Server request handler: `server/handler.ts`
- Router and HTTP route mapping: `server/router.ts` and `server/routes.ts`
- OAuth handlers: `worker/oauth-handlers.ts`
- MCP auth checks: `worker/mcp-auth.ts`
