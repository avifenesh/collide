import {
  BANK_COUNT,
  CACHE_LINE_BYTES,
  LAB_IDS,
  MAX_RESIDENT_WARPS,
  SM_REGISTER_FILE,
  SM_SHARED_MEMORY_BYTES,
  type BankGroup,
  type LabDefinition,
  type LabId,
  type LabPreset,
  type LabResult,
  type LaneRecord,
  type Metric,
  type RuntimeSource,
  type TimelineStage,
  type TransactionBand,
  type WorkbenchControls,
} from '../sim/types'

const COMMON_TIMELINE: TimelineStage[] = [
  {
    title: 'Dispatch',
    copy: 'The workgroup launches and writes the selected controls into the shader uniform buffer.',
    cycles: '~0',
  },
  {
    title: 'Compute',
    copy: 'Each lane evaluates its address, branch path, bank, partner, or resource slot.',
    cycles: '~1-12',
  },
  {
    title: 'Memory',
    copy: 'The model accounts for transactions, bank replays, or memory latency pressure.',
    cycles: 'model',
  },
  {
    title: 'Barrier',
    copy: 'Synchronization is shown where the primitive needs a warp or workgroup rendezvous.',
    cycles: '~0-24',
  },
  {
    title: 'Return',
    copy: 'Counters return to the CPU reference checker and the live canvas redraws.',
    cycles: '~1',
  },
]

export const DEFAULT_CONTROLS: WorkbenchControls = {
  labId: 'coalescing',
  presetId: 'contiguous',
  presetIndex: 0,
  step: 1,
  stride: 1,
  baseOffsetBytes: 0,
  elementSizeBytes: 4,
  warpSize: 32,
  randomSeed: 7,
  bankStride: 1,
  bankPadding: 0,
  branchPeriod: 2,
  branchSkew: 0,
  reductionMode: 0,
  registersPerThread: 32,
  sharedMemoryBytes: 16_384,
  threadsPerBlock: 256,
}

const baseSpark = [1, 1, 1, 1, 1, 1, 1, 1]

export const LAB_DEFINITIONS: LabDefinition[] = [
  {
    id: 'coalescing',
    title: 'Memory Coalescing',
    shortTitle: 'Coalescing',
    subtitle: 'Lanes to addresses to 128B transactions.',
    concept: 'See how a warp turns lane addresses into cache-line transactions, useful bytes, wasted bytes, and an estimated memory cost.',
    shaderFocus: 'lane_address() plus the transaction-base dedupe loop',
    accuracyNote: 'The 128-byte line grouping is hardware-faithful for modern NVIDIA-style teaching. Cycle counts are estimated and intentionally simple.',
    timeline: COMMON_TIMELINE,
    presets: [
      preset('contiguous', 'Contiguous', 'Ideal pattern', 'All lanes consume adjacent f32 values, so one 128B transaction serves the warp.', {
        stride: 1,
        baseOffsetBytes: 0,
        elementSizeBytes: 4,
        warpSize: 32,
      }, baseSpark),
      preset('strided', 'Strided', 'Bad pattern', 'Every lane jumps over useful data. More lines are fetched for the same useful payload.', {
        stride: 2,
        baseOffsetBytes: 0,
        elementSizeBytes: 4,
        warpSize: 32,
      }, [1, 0, 1, 0, 1, 0, 1, 0]),
      preset('offset', 'Misaligned', 'Boundary split', 'The same contiguous access crosses a 128B line and forces a second transaction.', {
        stride: 1,
        baseOffsetBytes: 96,
        elementSizeBytes: 4,
        warpSize: 32,
      }, [0, 0, 1, 1, 1, 1, 0, 0]),
      preset('random', 'Permuted', 'Scattered order', 'A deterministic permutation keeps correctness but destroys locality.', {
        stride: 5,
        baseOffsetBytes: 0,
        elementSizeBytes: 4,
        warpSize: 32,
        randomSeed: 11,
      }, [1, 0, 0, 1, 0, 1, 1, 0]),
      preset('soa', 'SoA fix', 'Layout fix', 'Switch the field access back to a unit stride to model a struct-of-arrays rewrite.', {
        stride: 1,
        baseOffsetBytes: 0,
        elementSizeBytes: 4,
        warpSize: 32,
      }, [1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    controls: [
      range('stride', 'Stride', 'elements', 1, 32, 1, [1, 2, 4, 8, 16, 32]),
      range('baseOffsetBytes', 'Base Offset', 'bytes', 0, 1024, 32, [0, 128, 256, 512, 1024]),
      range('elementSizeBytes', 'Element Size', 'bytes', 1, 32, 1, [1, 4, 8, 16, 32]),
      range('warpSize', 'Warp Size', 'lanes', 8, 64, 8, [8, 16, 32, 64]),
    ],
  },
  {
    id: 'banks',
    title: 'Shared Memory Bank Conflicts',
    shortTitle: 'Bank Conflicts',
    subtitle: '32 banks, lane mapping, conflict degree, padding fixes.',
    concept: 'Map each lane to one of 32 shared-memory banks and watch conflict replay cost rise or fall as stride and padding change.',
    shaderFocus: 'bank = shared_word_index % 32 and max lanes per bank',
    accuracyNote: 'Bank mapping is modeled as 32 four-byte banks. Broadcast and architecture-specific dual-port behavior are not modeled.',
    timeline: COMMON_TIMELINE,
    presets: [
      preset('unit', 'Unit Stride', 'No conflict', 'Lane N touches bank N, so all 32 banks serve one lane.', {
        bankStride: 1,
        bankPadding: 0,
        warpSize: 32,
      }, baseSpark),
      preset('stride-2', 'Stride 2', 'Two-way conflict', 'Only the even banks are used, so each touched bank replays two lanes.', {
        bankStride: 2,
        bankPadding: 0,
        warpSize: 32,
      }, [1, 0, 1, 0, 1, 0, 1, 0]),
      preset('stride-16', 'Stride 16', 'Worst pattern', 'Two banks receive the entire warp, creating a high replay degree.', {
        bankStride: 16,
        bankPadding: 0,
        warpSize: 32,
      }, [1, 0, 0, 0, 1, 0, 0, 0]),
      preset('padded', 'Padded Tile', 'Fix pattern', 'Adding one word of padding per warp row breaks the repeated bank alignment.', {
        bankStride: 1,
        bankPadding: 1,
        warpSize: 64,
      }, [1, 1, 1, 1, 0, 1, 1, 1]),
    ],
    controls: [
      range('bankStride', 'Bank Stride', 'words', 1, 32, 1, [1, 2, 4, 8, 16, 32]),
      range('bankPadding', 'Row Padding', 'words', 0, 8, 1, [0, 1, 2, 4, 8]),
      range('warpSize', 'Active Lanes', 'lanes', 8, 64, 8, [8, 16, 32, 64]),
    ],
  },
  {
    id: 'divergence',
    title: 'Warp Divergence / SIMT',
    shortTitle: 'Divergence',
    subtitle: 'Branch masks, serialized paths, active and inactive lanes.',
    concept: 'Toggle branch patterns and watch SIMT execution serialize paths while inactive lanes occupy issue slots.',
    shaderFocus: 'branch_path(lane) and active path count',
    accuracyNote: 'The mask behavior is SIMT-faithful. The cycle estimate treats each divergent path as equal-length teaching code.',
    timeline: COMMON_TIMELINE,
    presets: [
      preset('uniform', 'Uniform Branch', 'All lanes agree', 'Every lane takes the same path, so the warp executes one branch body.', {
        branchPeriod: 64,
        branchSkew: 0,
        warpSize: 32,
      }, baseSpark),
      preset('alternating', 'Alternating', 'Worst mask', 'Even and odd lanes split across both paths, forcing serialized execution.', {
        branchPeriod: 2,
        branchSkew: 0,
        warpSize: 32,
      }, [1, 0, 1, 0, 1, 0, 1, 0]),
      preset('half', 'Half Warp', 'Structured split', 'The first half takes one path and the second half takes the other.', {
        branchPeriod: 16,
        branchSkew: 0,
        warpSize: 32,
      }, [1, 1, 1, 1, 0, 0, 0, 0]),
      preset('hashed', 'Data Dependent', 'Irregular mask', 'A deterministic data-like mask creates an unpredictable branch pattern.', {
        branchPeriod: 3,
        branchSkew: 5,
        warpSize: 32,
        randomSeed: 19,
      }, [1, 0, 0, 1, 1, 0, 1, 0]),
    ],
    controls: [
      range('branchPeriod', 'Branch Period', 'lanes', 1, 64, 1, [1, 2, 4, 8, 16, 32, 64]),
      range('branchSkew', 'Mask Skew', 'lanes', 0, 31, 1, [0, 4, 8, 16, 31]),
      range('warpSize', 'Warp Size', 'lanes', 8, 64, 8, [8, 16, 32, 64]),
    ],
  },
  {
    id: 'reduction',
    title: 'Reduction / Prefix Scan',
    shortTitle: 'Reduce / Scan',
    subtitle: 'Tree steps, scan offsets, barriers, and workgroup layout.',
    concept: 'Step through the lane partners used by a tree reduction or Hillis-Steele scan and count operations plus barriers.',
    shaderFocus: 'offset = 1 << step and partner lane selection',
    accuracyNote: 'The partner masks and barrier counts follow the algorithm. The shader visualizes one phase, not a full optimized library primitive.',
    timeline: COMMON_TIMELINE,
    presets: [
      preset('reduce-tree', 'Tree Reduce', 'Pair then fold', 'Active lanes combine with partners at an increasing power-of-two offset.', {
        reductionMode: 0,
        warpSize: 32,
        step: 1,
      }, [1, 0, 1, 0, 1, 0, 1, 0]),
      preset('scan', 'Prefix Scan', 'Inclusive scan', 'Each lane accumulates values from earlier lanes as the offset doubles.', {
        reductionMode: 1,
        warpSize: 32,
        step: 1,
      }, [0, 1, 1, 1, 1, 1, 1, 1]),
      preset('small', 'Small Tile', 'Easy to inspect', 'Use fewer lanes so the partner graph is readable.', {
        reductionMode: 0,
        warpSize: 16,
        step: 2,
      }, [1, 0, 1, 0, 0, 0, 0, 0]),
      preset('wide-scan', 'Wide Scan', 'More barriers', 'A 64-lane group exposes the cost of more scan phases.', {
        reductionMode: 1,
        warpSize: 64,
        step: 3,
      }, [1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    controls: [
      choice('reductionMode', 'Primitive', [
        { label: 'Reduce', value: 0 },
        { label: 'Scan', value: 1 },
      ]),
      range('step', 'Algorithm Step', 'phase', 1, 6, 1, [1, 2, 3, 4, 5, 6]),
      range('warpSize', 'Active Lanes', 'lanes', 8, 64, 8, [8, 16, 32, 64]),
    ],
  },
  {
    id: 'occupancy',
    title: 'Occupancy / Latency Hiding',
    shortTitle: 'Occupancy',
    subtitle: 'Registers, shared memory, resident warps, stall hiding.',
    concept: 'Budget registers, shared memory, and block size to see how many warps can reside on an SM and hide memory latency.',
    shaderFocus: 'min(blocks by registers, shared memory, warps) times warps per block',
    accuracyNote: 'Resource arithmetic follows CUDA-style occupancy math. Throughput and latency-hiding scores are educational estimates.',
    timeline: COMMON_TIMELINE,
    presets: [
      preset('balanced', 'Balanced Kernel', 'High occupancy', 'Moderate register and shared-memory use leaves many resident warps.', {
        registersPerThread: 32,
        sharedMemoryBytes: 16_384,
        threadsPerBlock: 256,
        warpSize: 64,
      }, baseSpark),
      preset('register-heavy', 'Register Heavy', 'Register limited', 'More registers per thread reduce the number of resident blocks.', {
        registersPerThread: 96,
        sharedMemoryBytes: 8_192,
        threadsPerBlock: 256,
        warpSize: 64,
      }, [1, 1, 0, 0, 1, 0, 0, 0]),
      preset('shared-heavy', 'Shared Heavy', 'SMEM limited', 'A large shared-memory tile leaves room for fewer blocks per SM.', {
        registersPerThread: 32,
        sharedMemoryBytes: 65_536,
        threadsPerBlock: 256,
        warpSize: 64,
      }, [1, 0, 0, 1, 0, 0, 1, 0]),
      preset('tiny-blocks', 'Tiny Blocks', 'Not enough warps', 'Small blocks may fit, but each block contributes too few warps to hide stalls.', {
        registersPerThread: 24,
        sharedMemoryBytes: 4_096,
        threadsPerBlock: 64,
        warpSize: 64,
      }, [1, 1, 0, 0, 0, 0, 0, 0]),
    ],
    controls: [
      range('registersPerThread', 'Registers', 'per thread', 16, 160, 8, [16, 32, 64, 96, 128, 160]),
      range('sharedMemoryBytes', 'Shared Memory', 'bytes/block', 0, 98_304, 4096, [0, 16_384, 32_768, 65_536, 98_304]),
      range('threadsPerBlock', 'Block Size', 'threads', 32, 1024, 32, [32, 128, 256, 512, 1024]),
    ],
  },
]

export function getLabDefinition(labId: LabId): LabDefinition {
  return LAB_DEFINITIONS.find((lab) => lab.id === labId) ?? LAB_DEFINITIONS[0]
}

export function controlsForLab(labId: LabId, previous: WorkbenchControls = DEFAULT_CONTROLS): WorkbenchControls {
  const lab = getLabDefinition(labId)
  return normalizeControls({
    ...DEFAULT_CONTROLS,
    ...previous,
    labId,
    presetId: lab.presets[0].id,
    presetIndex: 0,
    step: 1,
    ...lab.presets[0].controls,
  })
}

export function controlsForPreset(
  labId: LabId,
  presetId: string,
  previous: WorkbenchControls = DEFAULT_CONTROLS,
): WorkbenchControls {
  const lab = getLabDefinition(labId)
  const presetIndex = Math.max(0, lab.presets.findIndex((presetItem) => presetItem.id === presetId))
  const selected = lab.presets[presetIndex] ?? lab.presets[0]
  return normalizeControls({
    ...previous,
    labId,
    presetId: selected.id,
    presetIndex,
    step: selected.controls.step ?? 1,
    ...selected.controls,
  })
}

export function normalizeControls(input: WorkbenchControls): WorkbenchControls {
  const labId = LAB_IDS.includes(input.labId) ? input.labId : DEFAULT_CONTROLS.labId
  const lab = getLabDefinition(labId)
  const presetIndex = clampInteger(input.presetIndex, 0, Math.max(0, lab.presets.length - 1))
  const presetId = lab.presets.some((presetItem) => presetItem.id === input.presetId)
    ? input.presetId
    : lab.presets[presetIndex]?.id ?? lab.presets[0].id

  return {
    labId,
    presetId,
    presetIndex,
    step: clampInteger(input.step, 1, 6),
    stride: clampInteger(input.stride, 1, 32),
    baseOffsetBytes: clampInteger(input.baseOffsetBytes, 0, 1024),
    elementSizeBytes: clampToAllowed(input.elementSizeBytes, [1, 2, 4, 8, 16, 32]),
    warpSize: labId === 'occupancy'
      ? MAX_RESIDENT_WARPS
      : clampToAllowed(input.warpSize, [8, 16, 32, 64]),
    randomSeed: clampInteger(input.randomSeed, 1, 997),
    bankStride: clampInteger(input.bankStride, 1, 32),
    bankPadding: clampInteger(input.bankPadding, 0, 8),
    branchPeriod: clampInteger(input.branchPeriod, 1, 64),
    branchSkew: clampInteger(input.branchSkew, 0, 31),
    reductionMode: clampInteger(input.reductionMode, 0, 1),
    registersPerThread: clampToMultiple(input.registersPerThread, 16, 160, 8),
    sharedMemoryBytes: clampToMultiple(input.sharedMemoryBytes, 0, 98_304, 4096),
    threadsPerBlock: clampToMultiple(input.threadsPerBlock, 32, 1024, 32),
  }
}

export function controlsSignature(controls: WorkbenchControls): string {
  const c = normalizeControls(controls)
  return [
    c.labId,
    c.presetId,
    c.presetIndex,
    c.step,
    c.stride,
    c.baseOffsetBytes,
    c.elementSizeBytes,
    c.warpSize,
    c.randomSeed,
    c.bankStride,
    c.bankPadding,
    c.branchPeriod,
    c.branchSkew,
    c.reductionMode,
    c.registersPerThread,
    c.sharedMemoryBytes,
    c.threadsPerBlock,
  ].join(':')
}

export function simulateReference(input: WorkbenchControls): LabResult {
  const controls = normalizeControls(input)
  const raw = simulateRaw(controls)
  return buildLabResult(controls, raw.lanes, raw.summary, 'reference')
}

export function buildLabResult(
  input: WorkbenchControls,
  lanes: LaneRecord[],
  rawSummary: number[],
  source: RuntimeSource,
): LabResult {
  const controls = normalizeControls(input)
  const normalizedLanes = lanes.slice(0, controls.labId === 'occupancy' ? MAX_RESIDENT_WARPS : controls.warpSize)
  const transactions = controls.labId === 'coalescing'
    ? buildTransactions(normalizedLanes, controls.elementSizeBytes)
    : []
  const banks = controls.labId === 'banks'
    ? buildBanks(normalizedLanes)
    : []
  const timeline = timelineFor(controls, rawSummary)
  const summary = summaryFor(controls, rawSummary)
  const metrics = metricsFor(controls, rawSummary)
  const details = detailsFor(controls, rawSummary)

  return {
    labId: controls.labId,
    controls,
    source,
    lanes: normalizedLanes,
    transactions,
    banks,
    metrics,
    summary,
    details,
    timeline,
    rawSummary: rawSummary.slice(0, 16),
  }
}

export function compareResults(actual: LabResult): boolean {
  const reference = simulateReference(actual.controls)
  return (
    controlsSignature(reference.controls) === controlsSignature(actual.controls) &&
    sameSummary(reference.rawSummary, actual.rawSummary) &&
    reference.lanes.every((lane, index) => sameLane(lane, actual.lanes[index], actual.labId))
  )
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KiB`
  }
  return `${bytes.toLocaleString()} B`
}

export function formatPercent(permille: number): string {
  return `${(permille / 10).toFixed(1)} %`
}

export function laneColor(lane: number, total: number): string {
  const hue = 172 + (lane / Math.max(1, total - 1)) * 174
  return `hsl(${hue.toFixed(1)} 78% 48%)`
}

export function encodeControlsToQuery(controls: WorkbenchControls): string {
  const c = normalizeControls(controls)
  const params = new URLSearchParams()
  params.set('lab', c.labId)
  params.set('preset', c.presetId)
  params.set('step', String(c.step))
  for (const key of numericQueryKeys) {
    params.set(key, String(c[key]))
  }
  return params.toString()
}

export function controlsFromQuery(search: string): WorkbenchControls {
  const params = new URLSearchParams(search)
  const labParam = params.get('lab')
  const labId = LAB_IDS.includes(labParam as LabId) ? labParam as LabId : DEFAULT_CONTROLS.labId
  const lab = getLabDefinition(labId)
  const presetId = params.get('preset') ?? lab.presets[0].id
  const base = controlsForPreset(labId, presetId, controlsForLab(labId))
  const patch: Partial<WorkbenchControls> = {}
  const step = Number(params.get('step'))
  if (params.has('step') && Number.isFinite(step)) {
    patch.step = step
  }
  for (const key of numericQueryKeys) {
    const value = Number(params.get(key))
    if (params.has(key) && Number.isFinite(value)) {
      patch[key] = value as never
    }
  }
  return normalizeControls({ ...base, ...patch })
}

export function currentPreset(controls: WorkbenchControls): LabPreset {
  const lab = getLabDefinition(controls.labId)
  return lab.presets.find((presetItem) => presetItem.id === controls.presetId) ?? lab.presets[0]
}

function simulateRaw(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  switch (controls.labId) {
    case 'coalescing':
      return simulateCoalescing(controls)
    case 'banks':
      return simulateBanks(controls)
    case 'divergence':
      return simulateDivergence(controls)
    case 'reduction':
      return simulateReduction(controls)
    case 'occupancy':
      return simulateOccupancy(controls)
  }
}

function simulateCoalescing(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  const lanes = Array.from({ length: controls.warpSize }, (_, lane) => {
    const address = coalescingAddress(lane, controls)
    return laneRecord({
      lane,
      address,
      elementIndex: Math.floor(address / controls.elementSizeBytes),
      transactionBase: transactionBase(address),
    })
  })
  const transactions = buildTransactions(lanes, controls.elementSizeBytes)
  const usefulBytes = controls.warpSize * controls.elementSizeBytes
  const fetchedBytes = transactions.length * CACHE_LINE_BYTES
  const wastedBytes = Math.max(0, fetchedBytes - usefulBytes)
  const penalty = controls.presetId === 'random' ? 44 : 32
  return {
    lanes,
    summary: summaryWords([
      transactions.length,
      usefulBytes,
      fetchedBytes,
      wastedBytes,
      fetchedBytes === 0 ? 0 : Math.floor((usefulBytes * 1000) / fetchedBytes),
      transactions.length * penalty,
      controls.stride,
      controls.baseOffsetBytes,
    ]),
  }
}

function simulateBanks(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  const bankCounts = Array.from({ length: BANK_COUNT }, () => 0)
  const lanes = Array.from({ length: controls.warpSize }, (_, lane) => {
    const elementIndex = bankElementIndex(lane, controls)
    const bank = positiveMod(elementIndex, BANK_COUNT)
    bankCounts[bank] += 1
    return laneRecord({
      lane,
      address: elementIndex * controls.elementSizeBytes,
      elementIndex,
      bank,
    })
  })
  const lanesWithConflicts = lanes.map((lane) => ({
    ...lane,
    bankConflict: bankCounts[lane.bank] ?? 0,
  }))
  const touchedBanks = bankCounts.filter((count) => count > 0).length
  const maxConflict = Math.max(1, ...bankCounts)
  const conflictLanes = controls.warpSize - touchedBanks
  const efficiencyPermille = Math.floor((1000 * touchedBanks) / Math.max(1, controls.warpSize))
  return {
    lanes: lanesWithConflicts,
    summary: summaryWords([
      maxConflict,
      touchedBanks,
      controls.warpSize,
      conflictLanes,
      efficiencyPermille,
      18 + maxConflict * 22,
      controls.bankStride,
      controls.bankPadding,
    ]),
  }
}

function simulateDivergence(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  let path0 = 0
  let path1 = 0
  const lanes = Array.from({ length: controls.warpSize }, (_, lane) => {
    const branchPath = branchPathFor(lane, controls)
    if (branchPath === 0) {
      path0 += 1
    } else {
      path1 += 1
    }
    return laneRecord({
      lane,
      branchPath,
      active: isLaneActiveForBranchStep(branchPath, controls.step),
      phase: branchPath,
    })
  })
  const activePaths = (path0 > 0 ? 1 : 0) + (path1 > 0 ? 1 : 0)
  const inactiveSlots = controls.warpSize * Math.max(1, activePaths) - controls.warpSize
  const efficiencyPermille = Math.floor(1000 / Math.max(1, activePaths))
  return {
    lanes,
    summary: summaryWords([
      activePaths,
      path0,
      path1,
      inactiveSlots,
      efficiencyPermille,
      activePaths * 28,
      controls.branchPeriod,
      controls.branchSkew,
    ]),
  }
}

function simulateReduction(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  const offset = 1 << Math.min(5, controls.step - 1)
  let activeOperations = 0
  const lanes = Array.from({ length: controls.warpSize }, (_, lane) => {
    const reduceMode = controls.reductionMode === 0
    const active = reduceMode
      ? lane % (offset * 2) === 0 && lane + offset < controls.warpSize
      : lane >= offset
    const partner = active ? (reduceMode ? lane + offset : lane - offset) : null
    if (active) {
      activeOperations += 1
    }
    return laneRecord({
      lane,
      active,
      partner,
      value: reduceMode
        ? reductionPairValue(lane, offset, controls.warpSize)
        : scanValueAt(lane, offset),
      phase: controls.reductionMode,
    })
  })
  const barrierCount = Math.min(6, controls.step)
  const finalValue = controls.reductionMode === 0
    ? (controls.warpSize * (controls.warpSize + 1)) / 2
    : scanValueAt(controls.warpSize - 1, 1 << Math.min(5, controls.step - 1))
  const efficiencyPermille = Math.floor((1000 * activeOperations) / Math.max(1, controls.warpSize))
  return {
    lanes,
    summary: summaryWords([
      activeOperations,
      offset,
      barrierCount,
      finalValue,
      efficiencyPermille,
      barrierCount * 14 + activeOperations * 2,
      controls.reductionMode,
      controls.warpSize,
    ]),
  }
}

function simulateOccupancy(controls: WorkbenchControls): { lanes: LaneRecord[]; summary: number[] } {
  const occupancy = occupancyMath(controls)
  const lanes = Array.from({ length: MAX_RESIDENT_WARPS }, (_, lane) => laneRecord({
    lane,
    active: lane < occupancy.residentWarps,
    occupancySlot: lane,
    waitCycles: lane < occupancy.residentWarps
      ? Math.max(0, 420 - Math.floor(420 * occupancy.latencyPermille / 1000))
      : 420,
  }))
  return {
    lanes,
    summary: summaryWords([
      occupancy.residentWarps,
      occupancy.residentBlocks,
      occupancy.occupancyPermille,
      occupancy.latencyPermille,
      occupancy.occupancyPermille,
      occupancy.estimatedCycles,
      occupancy.warpsPerBlock,
      occupancy.limitCode,
      occupancy.blocksByRegs,
      occupancy.blocksByShared,
    ]),
  }
}

function coalescingAddress(lane: number, controls: WorkbenchControls): number {
  if (controls.presetId === 'random') {
    const permuted = (lane * 17 + controls.randomSeed * 13) % controls.warpSize
    return controls.baseOffsetBytes + permuted * controls.stride * controls.elementSizeBytes
  }
  if (controls.presetId === 'soa') {
    return controls.baseOffsetBytes + lane * controls.elementSizeBytes
  }
  return controls.baseOffsetBytes + lane * controls.stride * controls.elementSizeBytes
}

function bankElementIndex(lane: number, controls: WorkbenchControls): number {
  const row = Math.floor(lane / BANK_COUNT)
  return lane * controls.bankStride + row * controls.bankPadding
}

function branchPathFor(lane: number, controls: WorkbenchControls): number {
  if (controls.presetId === 'uniform') {
    return 0
  }
  if (controls.presetId === 'alternating') {
    return lane % 2
  }
  if (controls.presetId === 'half') {
    return lane >= controls.warpSize / 2 ? 1 : 0
  }
  const period = Math.max(1, controls.branchPeriod)
  const shifted = (lane + controls.branchSkew + controls.randomSeed) % Math.max(2, period)
  return shifted < Math.ceil(period / 2) ? 0 : 1
}

function isLaneActiveForBranchStep(branchPath: number, step: number): boolean {
  if (step <= 2 || step >= 5) {
    return true
  }
  if (step === 3) {
    return branchPath === 0
  }
  return branchPath === 1
}

function reductionPairValue(lane: number, offset: number, warpSize: number): number {
  const partner = lane + offset
  if (partner >= warpSize) {
    return lane + 1
  }
  return lane + 1 + partner + 1
}

function scanValueAt(lane: number, offset: number): number {
  const span = Math.max(1, offset * 2)
  const start = Math.max(0, lane - span + 1)
  let value = 0
  for (let i = start; i <= lane; i += 1) {
    value += i + 1
  }
  return value
}

function buildTransactions(lanes: LaneRecord[], elementSizeBytes: number): TransactionBand[] {
  const byBase = new Map<number, { lanes: Set<number>; useful: number }>()

  for (const lane of lanes) {
    const start = lane.address
    const end = lane.address + elementSizeBytes - 1
    for (let base = transactionBase(start); base <= transactionBase(end); base += CACHE_LINE_BYTES) {
      const lineEnd = base + CACHE_LINE_BYTES - 1
      const overlapStart = Math.max(start, base)
      const overlapEnd = Math.min(end, lineEnd)
      const useful = Math.max(0, overlapEnd - overlapStart + 1)
      const band = byBase.get(base) ?? { lanes: new Set<number>(), useful: 0 }
      band.lanes.add(lane.lane)
      band.useful += useful
      byBase.set(base, band)
    }
  }

  return Array.from(byBase.entries())
    .sort(([a], [b]) => a - b)
    .map(([base, band], id) => ({
      id,
      base,
      end: base + CACHE_LINE_BYTES - 1,
      lanes: Array.from(band.lanes).sort((a, b) => a - b),
      usefulBytes: band.useful,
    }))
}

function buildBanks(lanes: LaneRecord[]): BankGroup[] {
  const groups = Array.from({ length: BANK_COUNT }, (_, bank) => ({
    bank,
    lanes: [] as number[],
    conflict: 0,
  }))
  for (const lane of lanes) {
    groups[lane.bank]?.lanes.push(lane.lane)
  }
  return groups.map((group) => ({ ...group, conflict: group.lanes.length }))
}

function transactionBase(address: number): number {
  return Math.floor(address / CACHE_LINE_BYTES) * CACHE_LINE_BYTES
}

function occupancyMath(controls: WorkbenchControls) {
  const warpsPerBlock = Math.ceil(controls.threadsPerBlock / 32)
  const regsPerBlock = controls.registersPerThread * controls.threadsPerBlock
  const blocksByRegs = Math.max(1, Math.floor(SM_REGISTER_FILE / Math.max(1, regsPerBlock)))
  const blocksByShared = controls.sharedMemoryBytes === 0
    ? 32
    : Math.max(1, Math.floor(SM_SHARED_MEMORY_BYTES / controls.sharedMemoryBytes))
  const blocksByWarps = Math.max(1, Math.floor(MAX_RESIDENT_WARPS / Math.max(1, warpsPerBlock)))
  const residentBlocks = Math.max(1, Math.min(32, blocksByRegs, blocksByShared, blocksByWarps))
  const residentWarps = Math.min(MAX_RESIDENT_WARPS, residentBlocks * warpsPerBlock)
  const occupancyPermille = Math.floor((residentWarps * 1000) / MAX_RESIDENT_WARPS)
  const latencyPermille = Math.min(1000, Math.floor((residentWarps * 1000) / 24))
  const estimatedCycles = Math.floor((420 * 1000) / Math.max(125, latencyPermille))
  const minBlocks = Math.min(blocksByRegs, blocksByShared, blocksByWarps)
  const limitCode = minBlocks === blocksByRegs ? 1 : minBlocks === blocksByShared ? 2 : 3
  return {
    warpsPerBlock,
    blocksByRegs,
    blocksByShared,
    blocksByWarps,
    residentBlocks,
    residentWarps,
    occupancyPermille,
    latencyPermille,
    estimatedCycles,
    limitCode,
  }
}

function summaryFor(controls: WorkbenchControls, raw: number[]) {
  switch (controls.labId) {
    case 'coalescing':
      return {
        title: 'Transaction Pressure',
        label: '128B Transactions',
        value: String(raw[0]),
        subvalue: `${formatBytes(raw[3])} wasted`,
        estimatedCycles: raw[5],
        efficiency: raw[4] / 1000,
      }
    case 'banks':
      return {
        title: 'Replay Pressure',
        label: 'Max Conflict',
        value: `${raw[0]}x`,
        subvalue: `${raw[1]} / 32 banks touched`,
        estimatedCycles: raw[5],
        efficiency: raw[4] / 1000,
      }
    case 'divergence':
      return {
        title: 'SIMT Mask Cost',
        label: 'Serialized Paths',
        value: String(raw[0]),
        subvalue: `${raw[3]} inactive lane slots`,
        estimatedCycles: raw[5],
        efficiency: raw[4] / 1000,
      }
    case 'reduction':
      return {
        title: controls.reductionMode === 0 ? 'Reduction Step' : 'Scan Step',
        label: 'Active Ops',
        value: String(raw[0]),
        subvalue: `offset ${raw[1]}, ${raw[2]} barriers`,
        estimatedCycles: raw[5],
        efficiency: raw[4] / 1000,
      }
    case 'occupancy':
      return {
        title: 'Latency Hiding',
        label: 'Resident Warps',
        value: `${raw[0]} / ${MAX_RESIDENT_WARPS}`,
        subvalue: `${formatPercent(raw[3])} latency score`,
        estimatedCycles: raw[5],
        efficiency: raw[4] / 1000,
      }
  }
}

function metricsFor(controls: WorkbenchControls, raw: number[]): Metric[] {
  switch (controls.labId) {
    case 'coalescing':
      return [
        metric('Transactions (128B)', raw[0], 'hot'),
        metric('Useful Bytes', formatBytes(raw[1])),
        metric('Fetched Bytes', formatBytes(raw[2])),
        metric('Efficiency', formatPercent(raw[4]), raw[4] >= 750 ? 'good' : 'warn'),
        metric('Wasted Bytes', formatBytes(raw[3]), raw[3] > 0 ? 'danger' : 'good'),
      ]
    case 'banks':
      return [
        metric('Conflict Degree', `${raw[0]}x`, raw[0] <= 1 ? 'good' : raw[0] <= 2 ? 'warn' : 'danger'),
        metric('Banks Touched', `${raw[1]} / ${BANK_COUNT}`),
        metric('Conflict Lanes', raw[3], raw[3] === 0 ? 'good' : 'danger'),
        metric('Bank Efficiency', formatPercent(raw[4]), raw[4] >= 900 ? 'good' : 'warn'),
        metric('Replay Cycles', raw[5], 'hot'),
      ]
    case 'divergence':
      return [
        metric('Serialized Paths', raw[0], raw[0] === 1 ? 'good' : 'danger'),
        metric('Path A Lanes', raw[1]),
        metric('Path B Lanes', raw[2]),
        metric('Inactive Slots', raw[3], raw[3] === 0 ? 'good' : 'danger'),
        metric('SIMT Efficiency', formatPercent(raw[4]), raw[4] === 1000 ? 'good' : 'warn'),
      ]
    case 'reduction':
      return [
        metric('Active Operations', raw[0], 'hot'),
        metric('Partner Offset', raw[1]),
        metric('Barrier Count', raw[2], raw[2] <= 2 ? 'good' : 'warn'),
        metric(controls.reductionMode === 0 ? 'Full Sum' : 'Visible Prefix', raw[3]),
        metric('Lane Utilization', formatPercent(raw[4]), raw[4] >= 500 ? 'good' : 'warn'),
      ]
    case 'occupancy':
      return [
        metric('Resident Warps', `${raw[0]} / ${MAX_RESIDENT_WARPS}`, raw[0] >= 24 ? 'good' : 'warn'),
        metric('Resident Blocks', raw[1]),
        metric('Occupancy', formatPercent(raw[2]), raw[2] >= 500 ? 'good' : 'warn'),
        metric('Latency Hidden', formatPercent(raw[3]), raw[3] >= 800 ? 'good' : 'danger'),
        metric('Limiter', limitLabel(raw[7]), raw[7] === 3 ? 'warn' : 'danger'),
      ]
  }
}

function detailsFor(controls: WorkbenchControls, raw: number[]) {
  switch (controls.labId) {
    case 'coalescing':
      return {
        maxAddress: Math.max(
          CACHE_LINE_BYTES * 4,
          transactionBase(Math.max(0, ...simulateRaw(controls).lanes.map((lane) => lane.address + controls.elementSizeBytes))) + CACHE_LINE_BYTES,
        ),
      }
    case 'banks':
      return { maxConflict: raw[0] }
    case 'divergence':
      return {
        activePaths: raw[0],
        pathCounts: [raw[1], raw[2]] as [number, number],
        inactiveSlots: raw[3],
      }
    case 'reduction':
      return {
        activeOperations: raw[0],
        offset: raw[1],
        barrierCount: raw[2],
      }
    case 'occupancy':
      return {
        residentWarps: raw[0],
        residentBlocks: raw[1],
        occupancyPermille: raw[2],
        latencyPermille: raw[3],
        warpsPerBlock: raw[6],
        limitingFactor: limitLabel(raw[7]),
      }
  }
}

function timelineFor(controls: WorkbenchControls, raw: number[]): TimelineStage[] {
  if (controls.labId === 'coalescing') {
    return withCycle(COMMON_TIMELINE, 2, `~${raw[5]}`)
  }
  if (controls.labId === 'banks') {
    return withCycle(COMMON_TIMELINE, 2, `${raw[0]} replays`)
  }
  if (controls.labId === 'divergence') {
    return withCycle(COMMON_TIMELINE, 1, `${raw[0]} paths`)
  }
  if (controls.labId === 'reduction') {
    return withCycle(COMMON_TIMELINE, 3, `${raw[2]} barriers`)
  }
  return withCycle(COMMON_TIMELINE, 2, `${formatPercent(raw[3])} hidden`)
}

function withCycle(timeline: TimelineStage[], index: number, cycles: string): TimelineStage[] {
  return timeline.map((stage, stageIndex) => stageIndex === index ? { ...stage, cycles } : stage)
}

function summaryWords(values: number[]): number[] {
  const words = Array.from({ length: 16 }, () => 0)
  values.forEach((value, index) => {
    words[index] = Math.max(0, Math.floor(value))
  })
  return words
}

function laneRecord(patch: Partial<LaneRecord> & { lane: number }): LaneRecord {
  return {
    lane: patch.lane,
    address: patch.address ?? 0,
    elementIndex: patch.elementIndex ?? 0,
    transactionBase: patch.transactionBase ?? 0,
    bank: patch.bank ?? 0,
    bankConflict: patch.bankConflict ?? 0,
    active: patch.active ?? true,
    branchPath: patch.branchPath ?? 0,
    value: patch.value ?? patch.lane + 1,
    partner: patch.partner ?? null,
    phase: patch.phase ?? 0,
    occupancySlot: patch.occupancySlot ?? 0,
    waitCycles: patch.waitCycles ?? 0,
  }
}

function sameSummary(a: number[], b: number[]): boolean {
  return a.slice(0, 10).every((value, index) => value === b[index])
}

function sameLane(a: LaneRecord, b: LaneRecord | undefined, labId: LabId): boolean {
  if (!b) {
    return false
  }
  if (a.lane !== b.lane || a.active !== b.active) {
    return false
  }
  if (labId === 'coalescing') {
    return a.address === b.address && a.transactionBase === b.transactionBase
  }
  if (labId === 'banks') {
    return a.bank === b.bank && a.bankConflict === b.bankConflict
  }
  if (labId === 'divergence') {
    return a.branchPath === b.branchPath
  }
  if (labId === 'reduction') {
    return a.partner === b.partner && a.value === b.value
  }
  return a.occupancySlot === b.occupancySlot && a.waitCycles === b.waitCycles
}

function preset(
  id: string,
  title: string,
  subtitle: string,
  why: string,
  controls: Partial<WorkbenchControls>,
  spark: number[],
): LabPreset {
  return { id, title, subtitle, why, controls, spark }
}

function range(
  key: Parameters<typeof rangeKey>[0],
  label: string,
  suffix: string,
  min: number,
  max: number,
  step: number,
  marks: number[],
) {
  return {
    type: 'range' as const,
    key: rangeKey(key),
    label,
    suffix,
    min,
    max,
    step,
    marks,
  }
}

function choice(
  key: Parameters<typeof rangeKey>[0],
  label: string,
  choices: Array<{ label: string; value: number }>,
) {
  return {
    type: 'choice' as const,
    key: rangeKey(key),
    label,
    choices,
  }
}

function rangeKey(key: keyof WorkbenchControls) {
  return key as never
}

function metric(label: string, value: string | number, tone?: Metric['tone']): Metric {
  return { label, value: String(value), tone }
}

function limitLabel(code: number): string {
  if (code === 1) {
    return 'Registers'
  }
  if (code === 2) {
    return 'Shared Memory'
  }
  return 'Warp Slots'
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampToAllowed(value: number, allowed: number[]): number {
  return allowed.reduce((best, next) =>
    Math.abs(next - value) < Math.abs(best - value) ? next : best,
  )
}

function clampToMultiple(value: number, min: number, max: number, multiple: number): number {
  const clamped = Math.min(max, Math.max(min, Math.round(value)))
  return Math.round(clamped / multiple) * multiple
}

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

const numericQueryKeys = [
  'stride',
  'baseOffsetBytes',
  'elementSizeBytes',
  'warpSize',
  'randomSeed',
  'bankStride',
  'bankPadding',
  'branchPeriod',
  'branchSkew',
  'reductionMode',
  'registersPerThread',
  'sharedMemoryBytes',
  'threadsPerBlock',
] as const
