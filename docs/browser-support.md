# Browser Support

Collide needs WebGPU for compute-backed mode. It also has a readable CPU reference fallback so the curriculum remains viewable when WebGPU is unavailable.

## Recommended

- Chrome or Edge with WebGPU enabled.
- A secure context: HTTPS or `http://localhost`.
- Desktop is the primary experience; mobile is usable for reading, switching labs, and changing presets.

## Fallback

If `navigator.gpu` is unavailable, adapter creation fails, or the page is not in a secure context, the app shows CPU reference results and a status message explaining the requirement.

## Deployment

Production deployments must be served over HTTPS. Static hosting is enough after `npm run build`; no backend service is required.
