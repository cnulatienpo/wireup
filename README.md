# wireup

## Render Deployment (Server-backed)

Wireup Outpost requires the backend server because the UI calls `/api/rayray`.
Do not deploy this as a static-only site.

This repo now includes `render.yaml` for a Render Web Service.

### Required mode

- Service type: `Web Service` (Node)
- Start command: `npm run shack`
- Health check: `/healthz`

### Required env vars

- `DEEPSEEK_API_KEY` (if using DeepSeek)
- `OPENAI_API_KEY` (if using OpenAI)

### Route behavior assumptions

- `/` redirects to `/outpost`
- `/outpost` serves the Wireup Outpost app (`wireup-outpost.html`)
- `/api/rayray` handles chat requests
- `/wireup-shack.html` redirects to `/outpost`

## Machine-Readable Publish Bundle

Machine-facing resources are published to `ipld/published` and served at:

- `/machines`
- `/machines/index.json`
- `/machines/files/<filename>.json`

To regenerate the machine bundle:

```bash
npm run ipld:publish
```

The publish list is configurable in `ipld/publish-config.json`.
Each resource entry must include:

- `source`: path relative to `ipld/`
- `target`: output filename in `ipld/published/`
- `purpose`: short machine-readable description

## Run Wireup Outpost From Repo Root

Start the server-backed Outpost app locally:

```bash
npm run dev
```

## Run UI Sandbox From Repo Root

The UI from `belt-fit-wizard` is imported under `ui/` and can be run from the
root of this repository.

```bash
npm run ui:install
npm run ui:dev
```

Other commands:

```bash
npm run build
npm run preview
```

## Runtime Knowledge Architecture

Canonical runtime knowledge now lives in `data/wireup_runtime/`:

- `master_index.json`
- `operator_lookup.json`
- `concept_index.json`
- `concept_graph.json`
- `runtime_rules.json`

Runtime modules:

- `runtime/loader/index.js` (browser loader)
- `runtime/retrieval/index.js` (operator/context retrieval)
- `runtime/reasoning/index.js` (pattern detection + explanation modes)
- `runtime/index.cjs` (server runtime API)

Explanation modes supported end-to-end:

- `td`
- `eli5`
- `dual`

## Deprecated Legacy Knowledge Sources

The following files are deprecated and no longer used by the runtime path:

- `rayray_index.json`
- `touch designer tops.json`
- `td simple glossery.json`
- `touch designer glossery part 3.json`
