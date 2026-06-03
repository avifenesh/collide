/// <reference types="@webgpu/types" />

import { buildLabResult, normalizeControls } from '../labs/workbench'
import {
  LAB_IDS,
  MAX_LANES,
  type LabId,
  type LabResult,
  type LaneRecord,
  type WebGpuRuntime,
  type WorkbenchControls,
} from './types'

const PARAM_WORDS = 20
const LANE_WORDS = 16
const SUMMARY_WORDS = 16

const LAB_INDEX: Record<LabId, number> = {
  coalescing: 0,
  banks: 1,
  divergence: 2,
  reduction: 3,
  occupancy: 4,
}

export const WGSL_SOURCE = `
struct Params {
  lab: u32,
  presetIndex: u32,
  step: u32,
  stride: u32,
  baseOffsetBytes: u32,
  elementSizeBytes: u32,
  warpSize: u32,
  randomSeed: u32,
  bankStride: u32,
  bankPadding: u32,
  branchPeriod: u32,
  branchSkew: u32,
  reductionMode: u32,
  registersPerThread: u32,
  sharedMemoryBytes: u32,
  threadsPerBlock: u32,
  smRegisterFile: u32,
  smSharedMemoryBytes: u32,
  maxResidentWarps: u32,
  pad0: u32,
}

struct LaneOut {
  lane: u32,
  address: u32,
  elementIndex: u32,
  transactionBase: u32,
  bank: u32,
  bankConflict: u32,
  isActive: u32,
  branchPath: u32,
  value: u32,
  partner: u32,
  phase: u32,
  occupancySlot: u32,
  waitCycles: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

struct SummaryOut {
  word0: u32,
  word1: u32,
  word2: u32,
  word3: u32,
  word4: u32,
  word5: u32,
  word6: u32,
  word7: u32,
  word8: u32,
  word9: u32,
  word10: u32,
  word11: u32,
  word12: u32,
  word13: u32,
  word14: u32,
  word15: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> lanes: array<LaneOut, 64>;
@group(0) @binding(2) var<storage, read_write> summary: SummaryOut;

fn line_base(address: u32) -> u32 {
  return (address / 128u) * 128u;
}

fn active_lane_count() -> u32 {
  if (params.lab == 4u) {
    return 64u;
  }
  return min(max(params.warpSize, 1u), 64u);
}

fn coalescing_address(lane: u32) -> u32 {
  let element = max(params.elementSizeBytes, 1u);
  if (params.presetIndex == 3u) {
    let permuted = (lane * 17u + params.randomSeed * 13u) % max(params.warpSize, 1u);
    return params.baseOffsetBytes + permuted * params.stride * element;
  }
  if (params.presetIndex == 4u) {
    return params.baseOffsetBytes + lane * element;
  }
  return params.baseOffsetBytes + lane * params.stride * element;
}

fn bank_element_index(lane: u32) -> u32 {
  let row = lane / 32u;
  return lane * params.bankStride + row * params.bankPadding;
}

fn branch_path(lane: u32) -> u32 {
  if (params.presetIndex == 0u) {
    return 0u;
  }
  if (params.presetIndex == 1u) {
    return lane % 2u;
  }
  if (params.presetIndex == 2u) {
    return select(0u, 1u, lane >= params.warpSize / 2u);
  }
  let period = max(params.branchPeriod, 2u);
  let shifted = (lane + params.branchSkew + params.randomSeed) % period;
  return select(0u, 1u, shifted >= ((period + 1u) / 2u));
}

fn branch_active(path: u32) -> u32 {
  if (params.step <= 2u || params.step >= 5u) {
    return 1u;
  }
  if (params.step == 3u) {
    return select(0u, 1u, path == 0u);
  }
  return select(0u, 1u, path == 1u);
}

fn pow2_offset() -> u32 {
  let stepIndex = min(max(params.step, 1u) - 1u, 5u);
  return 1u << stepIndex;
}

fn reduction_pair_value(lane: u32, offset: u32) -> u32 {
  let partner = lane + offset;
  if (partner >= params.warpSize) {
    return lane + 1u;
  }
  return lane + 1u + partner + 1u;
}

fn scan_value_at(lane: u32, offset: u32) -> u32 {
  let span = max(1u, offset * 2u);
  var start = 0u;
  if (lane + 1u > span) {
    start = lane + 1u - span;
  }
  var value = 0u;
  var i = start;
  loop {
    if (i > lane) {
      break;
    }
    value = value + i + 1u;
    i = i + 1u;
  }
  return value;
}

fn ceil_div(a: u32, b: u32) -> u32 {
  return (a + max(1u, b) - 1u) / max(1u, b);
}

fn write_lane_defaults(lane: u32) {
  lanes[lane].lane = lane;
  lanes[lane].address = 0u;
  lanes[lane].elementIndex = 0u;
  lanes[lane].transactionBase = 0u;
  lanes[lane].bank = 0u;
  lanes[lane].bankConflict = 0u;
  lanes[lane].isActive = select(0u, 1u, lane < active_lane_count());
  lanes[lane].branchPath = 0u;
  lanes[lane].value = lane + 1u;
  lanes[lane].partner = 0xffffffffu;
  lanes[lane].phase = 0u;
  lanes[lane].occupancySlot = 0u;
  lanes[lane].waitCycles = 0u;
}

fn set_summary(
  word0: u32,
  word1: u32,
  word2: u32,
  word3: u32,
  word4: u32,
  word5: u32,
  word6: u32,
  word7: u32,
  word8: u32,
  word9: u32,
) {
  summary.word0 = word0;
  summary.word1 = word1;
  summary.word2 = word2;
  summary.word3 = word3;
  summary.word4 = word4;
  summary.word5 = word5;
  summary.word6 = word6;
  summary.word7 = word7;
  summary.word8 = word8;
  summary.word9 = word9;
  summary.word10 = 1u;
  summary.word11 = params.lab;
  summary.word12 = 0u;
  summary.word13 = 0u;
  summary.word14 = 0u;
  summary.word15 = 0u;
}

fn coalescing_summary() {
  var bases: array<u32, 64>;
  var txCount = 0u;
  var i = 0u;

  loop {
    if (i >= params.warpSize || i >= 64u) {
      break;
    }

    let address = coalescing_address(i);
    var base = line_base(address);
    let endBase = line_base(address + max(params.elementSizeBytes, 1u) - 1u);

    loop {
      var exists = false;
      var j = 0u;
      loop {
        if (j >= txCount) {
          break;
        }
        if (bases[j] == base) {
          exists = true;
        }
        j = j + 1u;
      }
      if (!exists && txCount < 64u) {
        bases[txCount] = base;
        txCount = txCount + 1u;
      }
      if (base >= endBase) {
        break;
      }
      base = base + 128u;
    }
    i = i + 1u;
  }

  let useful = params.warpSize * max(params.elementSizeBytes, 1u);
  let fetched = txCount * 128u;
  let wasted = select(0u, fetched - useful, fetched > useful);
  let penalty = select(32u, 44u, params.presetIndex == 3u);
  set_summary(txCount, useful, fetched, wasted, select(0u, (useful * 1000u) / fetched, fetched > 0u), txCount * penalty, params.stride, params.baseOffsetBytes, 0u, 0u);
}

fn bank_summary() {
  var counts: array<u32, 32>;
  var lane = 0u;
  loop {
    if (lane >= params.warpSize || lane >= 64u) {
      break;
    }
    let bank = bank_element_index(lane) % 32u;
    counts[bank] = counts[bank] + 1u;
    lane = lane + 1u;
  }
  var touched = 0u;
  var maxConflict = 1u;
  var bank = 0u;
  loop {
    if (bank >= 32u) {
      break;
    }
    if (counts[bank] > 0u) {
      touched = touched + 1u;
      maxConflict = max(maxConflict, counts[bank]);
    }
    bank = bank + 1u;
  }
  let conflictLanes = params.warpSize - touched;
  let efficiency = (1000u * touched) / max(1u, params.warpSize);
  set_summary(maxConflict, touched, params.warpSize, conflictLanes, efficiency, 18u + maxConflict * 22u, params.bankStride, params.bankPadding, 0u, 0u);
}

fn divergence_summary() {
  var path0 = 0u;
  var path1 = 0u;
  var lane = 0u;
  loop {
    if (lane >= params.warpSize || lane >= 64u) {
      break;
    }
    let path = branch_path(lane);
    if (path == 0u) {
      path0 = path0 + 1u;
    } else {
      path1 = path1 + 1u;
    }
    lane = lane + 1u;
  }
  let paths = select(0u, 1u, path0 > 0u) + select(0u, 1u, path1 > 0u);
  let activePaths = max(1u, paths);
  let inactiveSlots = params.warpSize * activePaths - params.warpSize;
  set_summary(activePaths, path0, path1, inactiveSlots, 1000u / activePaths, activePaths * 28u, params.branchPeriod, params.branchSkew, 0u, 0u);
}

fn reduction_summary() {
  let offset = pow2_offset();
  var activeOps = 0u;
  var lane = 0u;
  loop {
    if (lane >= params.warpSize || lane >= 64u) {
      break;
    }
    var isActive = false;
    if (params.reductionMode == 0u) {
      isActive = (lane % (offset * 2u) == 0u) && (lane + offset < params.warpSize);
    } else {
      isActive = lane >= offset;
    }
    if (isActive) {
      activeOps = activeOps + 1u;
    }
    lane = lane + 1u;
  }
  let barriers = min(max(params.step, 1u), 6u);
  let finalValue = select(
    scan_value_at(params.warpSize - 1u, offset),
    (params.warpSize * (params.warpSize + 1u)) / 2u,
    params.reductionMode == 0u,
  );
  set_summary(activeOps, offset, barriers, finalValue, (1000u * activeOps) / max(1u, params.warpSize), barriers * 14u + activeOps * 2u, params.reductionMode, params.warpSize, 0u, 0u);
}

fn occupancy_values() {
  let warpsPerBlock = ceil_div(params.threadsPerBlock, 32u);
  let regsPerBlock = max(1u, params.registersPerThread * params.threadsPerBlock);
  let blocksByRegs = max(1u, params.smRegisterFile / regsPerBlock);
  var blocksByShared = 32u;
  if (params.sharedMemoryBytes > 0u) {
    blocksByShared = max(1u, params.smSharedMemoryBytes / params.sharedMemoryBytes);
  }
  let blocksByWarps = max(1u, params.maxResidentWarps / max(1u, warpsPerBlock));
  let residentBlocks = max(1u, min(32u, min(blocksByRegs, min(blocksByShared, blocksByWarps))));
  let residentWarps = min(params.maxResidentWarps, residentBlocks * warpsPerBlock);
  let occupancy = (residentWarps * 1000u) / params.maxResidentWarps;
  let latency = min(1000u, (residentWarps * 1000u) / 24u);
  let cycles = (420u * 1000u) / max(125u, latency);
  let minBlocks = min(blocksByRegs, min(blocksByShared, blocksByWarps));
  var limitCode = 3u;
  if (minBlocks == blocksByRegs) {
    limitCode = 1u;
  } else if (minBlocks == blocksByShared) {
    limitCode = 2u;
  }
  set_summary(residentWarps, residentBlocks, occupancy, latency, occupancy, cycles, warpsPerBlock, limitCode, blocksByRegs, blocksByShared);
}

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lane = gid.x;
  if (lane < 64u) {
    write_lane_defaults(lane);
    if (params.lab == 0u) {
      let activeLane = lane < params.warpSize;
      let address = select(0u, coalescing_address(lane), activeLane);
      lanes[lane].address = address;
      lanes[lane].elementIndex = address / max(params.elementSizeBytes, 1u);
      lanes[lane].transactionBase = line_base(address);
      lanes[lane].isActive = select(0u, 1u, activeLane);
    } else if (params.lab == 1u) {
      let activeLane = lane < params.warpSize;
      let elementIndex = bank_element_index(lane);
      let bank = elementIndex % 32u;
      var conflict = 0u;
      var other = 0u;
      loop {
        if (other >= params.warpSize || other >= 64u) {
          break;
        }
        if ((bank_element_index(other) % 32u) == bank) {
          conflict = conflict + 1u;
        }
        other = other + 1u;
      }
      lanes[lane].address = elementIndex * max(params.elementSizeBytes, 1u);
      lanes[lane].elementIndex = elementIndex;
      lanes[lane].bank = bank;
      lanes[lane].bankConflict = select(0u, conflict, activeLane);
      lanes[lane].isActive = select(0u, 1u, activeLane);
    } else if (params.lab == 2u) {
      let activeLane = lane < params.warpSize;
      let path = branch_path(lane);
      lanes[lane].branchPath = path;
      lanes[lane].phase = path;
      lanes[lane].isActive = select(0u, branch_active(path), activeLane);
    } else if (params.lab == 3u) {
      let activeLane = lane < params.warpSize;
      let offset = pow2_offset();
      var isActive = false;
      var partner = 0xffffffffu;
      var value = lane + 1u;
      if (params.reductionMode == 0u) {
        isActive = (lane % (offset * 2u) == 0u) && (lane + offset < params.warpSize);
        if (isActive) {
          partner = lane + offset;
        }
        value = reduction_pair_value(lane, offset);
      } else {
        isActive = lane >= offset;
        if (isActive) {
          partner = lane - offset;
        }
        value = scan_value_at(lane, offset);
      }
      lanes[lane].isActive = select(0u, 1u, activeLane && isActive);
      lanes[lane].partner = partner;
      lanes[lane].value = value;
      lanes[lane].phase = params.reductionMode;
    } else if (params.lab == 4u) {
      let warpsPerBlock = ceil_div(params.threadsPerBlock, 32u);
      let regsPerBlock = max(1u, params.registersPerThread * params.threadsPerBlock);
      let blocksByRegs = max(1u, params.smRegisterFile / regsPerBlock);
      var blocksByShared = 32u;
      if (params.sharedMemoryBytes > 0u) {
        blocksByShared = max(1u, params.smSharedMemoryBytes / params.sharedMemoryBytes);
      }
      let blocksByWarps = max(1u, params.maxResidentWarps / max(1u, warpsPerBlock));
      let residentBlocks = max(1u, min(32u, min(blocksByRegs, min(blocksByShared, blocksByWarps))));
      let residentWarps = min(params.maxResidentWarps, residentBlocks * warpsPerBlock);
      let latency = min(1000u, (residentWarps * 1000u) / 24u);
      lanes[lane].occupancySlot = lane;
      lanes[lane].isActive = select(0u, 1u, lane < residentWarps);
      lanes[lane].waitCycles = select(420u, max(0u, 420u - (420u * latency) / 1000u), lane < residentWarps);
    }
  }

  if (lane == 0u) {
    if (params.lab == 0u) {
      coalescing_summary();
    } else if (params.lab == 1u) {
      bank_summary();
    } else if (params.lab == 2u) {
      divergence_summary();
    } else if (params.lab == 3u) {
      reduction_summary();
    } else {
      occupancy_values();
    }
  }
}
`

export async function initWebGpu(): Promise<WebGpuRuntime> {
  if (!window.isSecureContext) {
    throw new Error('WebGPU requires a secure context. Use localhost or HTTPS.')
  }
  if (!navigator.gpu) {
    throw new Error('navigator.gpu is unavailable in this browser.')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('No WebGPU adapter was returned by the browser.')
  }

  const device = await adapter.requestDevice()
  const label = adapter.features.size > 0 ? 'WebGPU adapter' : 'Default WebGPU adapter'
  return { adapter, device, label }
}

export async function runWebGpuSimulation(
  runtime: WebGpuRuntime,
  input: WorkbenchControls,
): Promise<LabResult> {
  const controls = normalizeControls(input)
  const device = runtime.device
  const paramData = new Uint32Array(PARAM_WORDS)
  paramData.set([
    LAB_INDEX[controls.labId],
    controls.presetIndex,
    controls.step,
    controls.stride,
    controls.baseOffsetBytes,
    controls.elementSizeBytes,
    controls.warpSize,
    controls.randomSeed,
    controls.bankStride,
    controls.bankPadding,
    controls.branchPeriod,
    controls.branchSkew,
    controls.reductionMode,
    controls.registersPerThread,
    controls.sharedMemoryBytes,
    controls.threadsPerBlock,
    65_536,
    100 * 1024,
    64,
    0,
  ])

  const paramBuffer = device.createBuffer({
    size: paramData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const laneBufferSize = MAX_LANES * LANE_WORDS * Uint32Array.BYTES_PER_ELEMENT
  const summaryBufferSize = SUMMARY_WORDS * Uint32Array.BYTES_PER_ELEMENT
  const laneBuffer = device.createBuffer({
    size: laneBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const summaryBuffer = device.createBuffer({
    size: summaryBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const readLaneBuffer = device.createBuffer({
    size: laneBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const readSummaryBuffer = device.createBuffer({
    size: summaryBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  device.queue.writeBuffer(paramBuffer, 0, paramData)

  const shaderModule = device.createShaderModule({
    label: `collide-${controls.labId}-compute`,
    code: WGSL_SOURCE,
  })
  const pipeline = device.createComputePipeline({
    label: `collide-${controls.labId}-pipeline`,
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  })
  const bindGroup = device.createBindGroup({
    label: `collide-${controls.labId}-bind-group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      { binding: 1, resource: { buffer: laneBuffer } },
      { binding: 2, resource: { buffer: summaryBuffer } },
    ],
  })

  const encoder = device.createCommandEncoder({ label: `collide-${controls.labId}-encoder` })
  const pass = encoder.beginComputePass({ label: `collide-${controls.labId}-pass` })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(2)
  pass.end()
  encoder.copyBufferToBuffer(laneBuffer, 0, readLaneBuffer, 0, laneBufferSize)
  encoder.copyBufferToBuffer(summaryBuffer, 0, readSummaryBuffer, 0, summaryBufferSize)
  device.queue.submit([encoder.finish()])

  await Promise.all([
    readLaneBuffer.mapAsync(GPUMapMode.READ),
    readSummaryBuffer.mapAsync(GPUMapMode.READ),
  ])

  const laneWords = new Uint32Array(readLaneBuffer.getMappedRange().slice(0))
  const summaryWords = new Uint32Array(readSummaryBuffer.getMappedRange().slice(0))
  readLaneBuffer.unmap()
  readSummaryBuffer.unmap()

  const lanes = Array.from({ length: controls.labId === 'occupancy' ? 64 : controls.warpSize }, (_, index) => {
    const offset = index * LANE_WORDS
    return decodeLane(laneWords, offset)
  })

  return buildLabResult(controls, lanes, Array.from(summaryWords), 'webgpu')
}

export function shaderExcerptFor(labId: LabId): string {
  const markers: Record<LabId, string> = {
    coalescing: 'fn coalescing_address',
    banks: 'fn bank_element_index',
    divergence: 'fn branch_path',
    reduction: 'fn pow2_offset',
    occupancy: 'fn occupancy_values',
  }
  const lines = WGSL_SOURCE.split('\n')
  const start = Math.max(0, lines.findIndex((line) => line.includes(markers[labId])))
  return lines.slice(start, start + 36).join('\n')
}

export function labIdFromIndex(index: number): LabId {
  return LAB_IDS[index] ?? 'coalescing'
}

function decodeLane(words: Uint32Array, offset: number): LaneRecord {
  const partner = words[offset + 9]
  return {
    lane: words[offset],
    address: words[offset + 1],
    elementIndex: words[offset + 2],
    transactionBase: words[offset + 3],
    bank: words[offset + 4],
    bankConflict: words[offset + 5],
    active: words[offset + 6] === 1,
    branchPath: words[offset + 7],
    value: words[offset + 8],
    partner: partner === 0xffffffff ? null : partner,
    phase: words[offset + 10],
    occupancySlot: words[offset + 11],
    waitCycles: words[offset + 12],
  }
}
