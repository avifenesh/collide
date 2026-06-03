# Collide Architecture

Collide 1.0 is a React + Vite WebGPU workbench. The first screen is the lab: navigation, presets, live controls, a canvas, metrics, shader excerpts, and an execution timeline.

## Runtime Contract

- `src/labs/workbench.ts` owns the curriculum model, presets, CPU reference simulators, URL state, and the normalized `LabResult` shape.
- `src/sim/webgpu.ts` owns WebGPU initialization and one WGSL compute program that branches by lab id. It emits lane records plus raw summary words.
- `src/components/WorkbenchCanvas.tsx` renders lab-specific visualizations from the same `LabResult` shape used for CPU/WebGPU comparison.
- `src/App.tsx` composes the shell, runtime status, URL sharing, timeline transport, and inspector tabs.

## Correctness Path

Every control change runs the CPU reference model immediately. When WebGPU is available, the shader dispatch runs too. The WebGPU result is displayed only if `compareResults()` proves that lane records and summary counters match the CPU reference contract for the selected lab.

## Labs

- Memory Coalescing: lane addresses, 128-byte line grouping, useful/fetched/wasted bytes.
- Shared Memory Bank Conflicts: 32-bank mapping, max conflict degree, replay estimate.
- Warp Divergence / SIMT: branch masks, serialized path count, inactive issue slots.
- Reduction / Prefix Scan: partner lane graph, active operations, barrier count.
- Occupancy / Latency Hiding: registers, shared memory, block size, resident warps, latency-hiding estimate.

## Build And QA

CI runs unit tests, lint, production build, Playwright E2E, and a Playwright visual smoke that screenshots every lab canvas. Local WebGPU QA should be run over `localhost` or HTTPS.
