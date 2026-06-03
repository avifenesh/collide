# Deployment

Collide has no backend. Production deployment is the `dist/` directory produced by `npm run build`.

Canonical production URL: `https://avifenesh.github.io/collide/`.

## Requirements

- Serve over HTTPS. WebGPU compute mode requires a secure context.
- Preserve query strings. Share links encode lab state in the URL query.
- Serve `index.html` for the root path. Collide does not need server-side routing.
- Use a browser target with WebGPU support for live compute mode; unsupported browsers keep the CPU reference fallback.

## Static Host Checklist

1. Run `npm ci`.
2. Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, and `npm run test:visual`.
3. Upload `dist/` to the static host.
4. Confirm the final URL starts with `https://`.
5. Run `COLLIDE_URL=https://your-host.example npm run qa:live` from a machine/browser with WebGPU support.

For GitHub Pages project hosting, the Pages workflow sets `GITHUB_PAGES=true` so Vite emits assets under `/collide/`.

## Local HTTPS Production Preview

For a local proof that the production build works under an HTTPS origin:

```bash
npm run build
npm run preview:https
COLLIDE_URL=https://127.0.0.1:4173/ npm run qa:live
```

`preview:https` creates a short-lived self-signed localhost certificate in `.cert/`. It is useful for secure-context QA, not a substitute for a trusted public production certificate.

The Vite preview config allows `.trycloudflare.com` and `.loca.lt` hostnames so short-lived HTTPS tunnel checks can reach the static preview. Do not treat those tunnels as durable hosting.
