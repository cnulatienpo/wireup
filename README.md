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

- `/` serves the intro page (`index.html`)
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

## Run UI From Repo Root

The UI from `belt-fit-wizard` is imported under `ui/` and can be run from the
root of this repository.

```bash
npm run ui:install
npm run dev
```

Other commands:

```bash
npm run build
npm run preview
```