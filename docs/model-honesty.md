# Model Honesty

Collide teaches systems intuition, not vendor-profiler exactness. The shader computations are real WebGPU compute dispatches and the lane-level mappings are explicit. The cost numbers are educational estimates.

## Hardware-Faithful Parts

- Coalescing groups lane byte addresses into 128-byte transaction bands.
- Shared-memory bank conflicts use 32 banks and word-index modulo mapping.
- SIMT divergence shows branch masks and serialized paths.
- Reduction and scan show power-of-two partner offsets and synchronization phases.
- Occupancy computes resident blocks/warps from register, shared-memory, and warp-slot budgets.

## Estimated Parts

- Cycle counts are simplified scores chosen for teaching clarity.
- Cache hierarchy, compiler scheduling, memory-level parallelism, dual-ported banks, broadcasts, and architecture-specific occupancy limits are not modeled in detail.
- The WebGPU shader emits counters for one selected teaching scenario rather than replaying a full production CUDA kernel.

## Why This Is Still Compute-Backed

The app does not draw diagrams first and invent numbers second. Each lab has a CPU reference implementation and a WebGPU compute path that emits the same raw lane records and summary counters. If those paths disagree, Collide falls back to the CPU reference and tells the user.
