# Remix v3 Beta 5 adoption audit

Audited against `remix@3.0.0-beta.5` and the upstream
[Beta 5 release](https://github.com/remix-run/remix/releases/tag/remix%403.0.0-beta.5).

## Current state

- `package.json` pins `remix` to `3.0.0-beta.5`; `bun.lock` resolves the same
  version.
- Client runtime imports already use `remix/ui` and `remix/ui/jsx-runtime`. The
  compatibility runtime in `client/remix-ui-compat/jsx-runtime.ts` preserves the
  existing `css` and `on` JSX props while they are migrated incrementally to
  native `mix` composition.
- Server routing already uses `remix/fetch-router`, and the data layer uses the
  Beta 5-compatible `remix/data-table` API.

## Prioritized recommendations

### High

1. **Minify production browser bundles — implemented.** `package.json` now
   passes `--minify` to the production esbuild commands for both
   `client/entry.tsx` and `client/mcp-apps/calculator-widget.ts`. The
   development watchers remain unminified. This adopts the relevant production
   asset improvement from the Beta 5 `remix new` template without replacing this
   app's esbuild and Wrangler pipeline.
2. **Adopt `remix/ui/checkbox` for the existing checkbox controls —
   implemented.** `client/routes/login.tsx` and `client/routes/admin-agents.tsx`
   now apply the first-party checkbox mixin to all three checkboxes. These
   controls have native semantics already, so the change adds consistent focus,
   disabled, checked, and mixed-state styling without changing form behavior.
3. **Keep active framework guidance on the Beta 5 entrypoints — implemented.**
   The active Remix index and TypeScript setup notes now describe `remix/ui`
   rather than the removed `remix/component` entrypoint. The one direct
   `@remix-run/cookie` application import in `server/auth-session.ts` now uses
   the supported umbrella export, `remix/cookie`.

### Medium

1. **Create app-branded button mixins on top of `remix/ui/button`.** Native
   buttons repeat similar primary, neutral, ghost, and destructive styles in
   `client/routes/chat.tsx`, `client/routes/admin-agents.tsx`,
   `client/routes/login.tsx`, `client/routes/oauth-authorize.tsx`,
   `client/routes/reset-password.tsx`, `client/app.tsx`,
   `client/notifications.tsx`, and `client/editable-text.tsx`. A small app-owned
   mixin layer could compose the first-party focus, disabled, and default button
   behavior with the tokens in `client/styles/tokens.ts`. Adopting the stock
   visual tones directly would replace the pea brand colors, so this needs a
   focused visual design pass rather than a mechanical swap.
2. **Adopt `remix/ui/input` in auth and admin forms.**
   `client/routes/login.tsx`, `client/routes/reset-password.tsx`, and
   `client/routes/admin-agents.tsx` repeat input frame and focus styles. Start
   with one complete form and verify focus, autofill, validation, and disabled
   states before expanding.
3. **Evaluate `remix/ui/select` for the admin model picker.**
   `client/routes/admin-agents.tsx` has the only native select. The first-party
   Select would add a consistent popover, keyboard navigation, and typeahead,
   but the current disabled visual divider and the untested admin workflow need
   explicit coverage before changing behavior.
4. **Centralize canonical-origin resolution.**
   `server/handlers/password-reset.ts` prefers `APP_BASE_URL`, while OAuth/MCP
   metadata and redirects mostly use `request.url`. If another ingress or
   canonical domain is added, use one helper that prefers `APP_BASE_URL` and
   otherwise falls back to the native request origin.

### Low or deferred

1. **Do not replace `client/agent-multi-select-combobox.tsx` wholesale.** It is
   a multi-select with a minimum-one selection rule, search, keyboard
   navigation, and chat-specific labels. Beta 5's high-level Combobox and Select
   are single-value controls. A future change could adopt only
   `remix/ui/popover` and lower-level listbox primitives while retaining the
   app-owned multi-select state, but this is not a drop-in simplification.
2. **Retire the JSX compatibility runtime only as a dedicated migration.**
   `client/remix-ui-compat/jsx-runtime.ts` supports hundreds of existing
   `css`/`on` props. Converting all call sites to native `mix` in this audit
   would create a broad, low-signal diff.
3. **Do not add unused primitives.** Accordion, breadcrumbs, menu, radio, tabs,
   and toggle have no matching UI in the current app. The calculator MCP app is
   server-rendered HTML plus vanilla browser code, so Remix UI primitives do not
   apply to it.

## `trustProxy`

`trustProxy` is not useful in the current deployment topology. It configures
`createRequest()` and `createRequestListener()` from `remix/node-fetch-server`
when a Node HTTP server is reachable only through a trusted reverse proxy. This
app instead enters through `worker/index.ts` as a Cloudflare Worker and passes
the runtime's native `Request` directly through `server/handler.ts` to
`remix/fetch-router`.

The Worker-specific handling should remain:

- `server/audit-log.ts` prefers Cloudflare's `CF-Connecting-IP`.
- `server/auth-session.ts` uses the forwarded protocol only to determine the
  cookie's `Secure` attribute.
- `APP_BASE_URL` provides a canonical origin for password-reset links.

Revisit `trustProxy` only if a Node server using `remix/node-fetch-server` is
added and clients cannot bypass a proxy that overwrites forwarded headers.

## Beta 5 template comparison

The default `remix new` template is a Node application using `remix/assets`,
`remix/node-fetch-server`, server/client frame resolution, and a `start` script.
Pea is intentionally different: Wrangler starts the Cloudflare Worker, the
Workers `ASSETS` binding serves static files, and esbuild creates the browser
bundles.

The template improvements map as follows:

| Beta 5 template improvement                        | Pea action                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Production `NODE_ENV=production`                   | Not needed for the Workers runtime; application code does not branch on `NODE_ENV`.                           |
| Minified browser assets                            | Adopted in the production esbuild commands.                                                                   |
| Client/server `Frame` resolution                   | Not applicable because pea does not render Remix UI `Frame` components.                                       |
| Dev-server watcher instead of asset-server watcher | Not applicable; `cli.ts` already runs dedicated esbuild watchers with Wrangler.                               |
| Node production `start` script                     | Not applicable; `bun run deploy` builds and deploys `worker/index.ts`, and Cloudflare starts Worker isolates. |
