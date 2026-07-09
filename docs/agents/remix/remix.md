# remix

Source: https://github.com/remix-run/remix/tree/main/packages/remix

## README

A modern web framework for JavaScript.

See [remix.run](https://remix.run) for framework docs.

## Installation

This repository pins the Beta 5 release:

```sh
bun add remix@3.0.0-beta.5 --exact
```

## Package usage in Remix 3 Beta 5

The `remix` package is used through subpath imports.

- ✅ `import { createRouter } from 'remix/fetch-router'`
- ✅ `import { route } from 'remix/fetch-router/routes'`
- ✅ `import { createRoot } from 'remix/ui'`
- ✅ `import checkbox from 'remix/ui/checkbox'`
- ❌ `import { ... } from 'remix'` (there is no root API entrypoint)
- ❌ `import { ... } from 'remix/component'` (replaced by `remix/ui`)

The installed `remix/package.json` is the source of truth for the complete
export list. Entry points used by pea include:

- UI: `remix/ui`, `remix/ui/jsx-runtime`, and focused `remix/ui/*` component
  modules
- Routing: `remix/fetch-router` and `remix/fetch-router/routes`
- Data: `remix/data-schema`, `remix/data-table`, and `remix/data-table/sqlite`
- Responses: `remix/html-template` and `remix/response/html`
- Cookies: `remix/cookie`

See the [Beta 5 adoption audit](./beta-5-adoption-audit.md) for repository-
specific recommendations, the `trustProxy` assessment, and the default-template
comparison.

## Navigation

- [Remix package index](./index.md)
