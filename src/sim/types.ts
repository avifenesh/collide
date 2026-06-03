export const CACHE_LINE_BYTES = 128
export const MAX_LANES = 64
export const BANK_COUNT = 32
export const SM_REGISTER_FILE = 65_536
export const SM_SHARED_MEMORY_BYTES = 100 * 1024
export const MAX_RESIDENT_WARPS = 64

export const LAB_IDS = [
  'coalescing',
  'banks',
  'divergence',
  'reduction',
  'occupancy',
] as const

export type LabId = (typeof LAB_IDS)[number]
export type RuntimeSource = 'reference' | 'webgpu'
export type MetricTone = 'neutral' | 'good' | 'warn' | 'danger' | 'hot'

export interface WorkbenchControls {
  labId: LabId
  presetId: string
  presetIndex: number
  step: number
  stride: number
  baseOffsetBytes: number
  elementSizeBytes: number
  warpSize: number
  randomSeed: number
  bankStride: number
  bankPadding: number
  branchPeriod: number
  branchSkew: number
  reductionMode: number
  registersPerThread: number
  sharedMemoryBytes: number
  threadsPerBlock: number
}

export interface LaneRecord {
  lane: number
  address: number
  elementIndex: number
  transactionBase: number
  bank: number
  bankConflict: number
  active: boolean
  branchPath: number
  value: number
  partner: number | null
  phase: number
  occupancySlot: number
  waitCycles: number
}

export interface TransactionBand {
  id: number
  base: number
  end: number
  lanes: number[]
  usefulBytes: number
}

export interface BankGroup {
  bank: number
  lanes: number[]
  conflict: number
}

export interface Metric {
  label: string
  value: string
  tone?: MetricTone
}

export interface TimelineStage {
  title: string
  copy: string
  cycles: string
}

export interface LabSummary {
  title: string
  label: string
  value: string
  subvalue: string
  estimatedCycles: number
  efficiency: number
}

export interface LabDetails {
  maxAddress?: number
  maxConflict?: number
  activePaths?: number
  pathCounts?: [number, number]
  inactiveSlots?: number
  offset?: number
  activeOperations?: number
  barrierCount?: number
  residentBlocks?: number
  residentWarps?: number
  occupancyPermille?: number
  latencyPermille?: number
  limitingFactor?: string
  warpsPerBlock?: number
}

export interface LabResult {
  labId: LabId
  controls: WorkbenchControls
  source: RuntimeSource
  lanes: LaneRecord[]
  transactions: TransactionBand[]
  banks: BankGroup[]
  metrics: Metric[]
  summary: LabSummary
  details: LabDetails
  timeline: TimelineStage[]
  rawSummary: number[]
}

export interface WebGpuRuntime {
  adapter: GPUAdapter
  device: GPUDevice
  label: string
}

export interface LabPreset {
  id: string
  title: string
  subtitle: string
  why: string
  controls: Partial<WorkbenchControls>
  spark: number[]
}

export type NumericControlKey = {
  [Key in keyof WorkbenchControls]: WorkbenchControls[Key] extends number ? Key : never
}[keyof WorkbenchControls]

export interface NumericControlSpec {
  type: 'range'
  key: NumericControlKey
  label: string
  suffix: string
  min: number
  max: number
  step: number
  marks: number[]
}

export interface ChoiceControlSpec {
  type: 'choice'
  key: NumericControlKey
  label: string
  choices: Array<{ label: string; value: number }>
}

export type ControlSpec = NumericControlSpec | ChoiceControlSpec

export interface LabDefinition {
  id: LabId
  title: string
  shortTitle: string
  subtitle: string
  concept: string
  presets: LabPreset[]
  controls: ControlSpec[]
  timeline: TimelineStage[]
  shaderFocus: string
  accuracyNote: string
}
