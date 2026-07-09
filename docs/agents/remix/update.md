# Updating Remix package docs

Use this checklist to refresh `docs/agents/remix/**/*.md` from upstream.

## 1) List packages

```sh
gh api repos/remix-run/remix/contents/packages --jq '.[].name'
```

## 2) Refresh each package README

For each package name, download the README from upstream:

```sh
curl -L "https://raw.githubusercontent.com/remix-run/remix/main/packages/<package>/README.md"
```

Replace the corresponding README content in docs:

- For single-file packages, update `docs/agents/remix/<package>.md`.
- For split packages, update the README chunks under
  `docs/agents/remix/<package>/`.

Keep each Markdown file to roughly 200 lines or fewer. If a README grows beyond
that, split it into multiple files and update the package `index.md` to link the
new chunks.

## 3) Refresh UI docs

Remix Beta 5 replaced the alpha `component` and `interaction` entrypoints with
`ui`. Refresh the current package README from:

```
https://github.com/remix-run/remix/tree/main/packages/ui
```

Keep `docs/agents/remix/beta-5-adoption-audit.md` focused on this repository's
usage. The existing `component/` and `interaction/` directories are historical
alpha references; do not present them as current API guidance.

## 4) Keep the index current

If a package is added or removed upstream, update `docs/agents/remix/index.md`:

- Add/remove package rows in the table.
- Update the "Start here" section if new docs are important.
- If a package moves to a folder, update links to `./<package>/index.md`.

## 5) Audit export coverage

Confirm `docs/agents/remix/index.md` package rows still cover all top-level
exports from the installed `remix` package:

```sh
bun -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('node_modules/remix/package.json','utf8'));const top=[...new Set(Object.keys(pkg.exports).filter(k=>k!=='./package.json').map(k=>k.slice(2).split('/')[0]))].sort();const idx=fs.readFileSync('docs/agents/remix/index.md','utf8');const docs=[...new Set([...idx.matchAll(/^\\|\\s*([a-z0-9-]+)\\s*\\|/gm)].map(m=>m[1]).filter(x=>!['Package','--------------------------'].includes(x)))].sort();const missing=top.filter(x=>!docs.includes(x));console.log(missing.length===0?'No missing package docs in index.':'Missing docs for: '+missing.join(', '));"
```

If any package names are missing, add them to `docs/agents/remix/index.md` and
add the corresponding docs file(s).

## 6) Verify

Run formatting and validation before committing:

```sh
bun run format
bun run validate
```
