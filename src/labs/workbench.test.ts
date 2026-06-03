import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTROLS,
  LAB_DEFINITIONS,
  compareResults,
  controlsForLab,
  controlsForPreset,
  controlsFromQuery,
  encodeControlsToQuery,
  simulateReference,
} from './workbench'

describe('Collide lab reference models', () => {
  it('ships the five 1.0 labs', () => {
    expect(LAB_DEFINITIONS.map((lab) => lab.id)).toEqual([
      'coalescing',
      'banks',
      'divergence',
      'reduction',
      'occupancy',
    ])
  })

  it('coalesces contiguous f32 lanes into one 128-byte transaction', () => {
    const result = simulateReference(DEFAULT_CONTROLS)
    expect(result.rawSummary[0]).toBe(1)
    expect(result.rawSummary[1]).toBe(128)
    expect(result.rawSummary[2]).toBe(128)
    expect(result.rawSummary[4]).toBe(1000)
  })

  it('shows strided coalescing waste', () => {
    const result = simulateReference(controlsForPreset('coalescing', 'strided'))
    expect(result.rawSummary[0]).toBe(2)
    expect(result.rawSummary[2]).toBe(256)
    expect(result.rawSummary[4]).toBe(500)
  })

  it('models shared-memory bank conflicts and padding fixes', () => {
    const bad = simulateReference(controlsForPreset('banks', 'stride-16'))
    const fixed = simulateReference(controlsForPreset('banks', 'unit'))
    expect(bad.rawSummary[0]).toBeGreaterThan(fixed.rawSummary[0])
    expect(fixed.rawSummary[0]).toBe(1)
    expect(fixed.banks.filter((bank) => bank.conflict === 1)).toHaveLength(32)
  })

  it('models branch divergence as serialized SIMT paths', () => {
    const uniform = simulateReference(controlsForPreset('divergence', 'uniform'))
    const alternating = simulateReference(controlsForPreset('divergence', 'alternating'))
    expect(uniform.rawSummary[0]).toBe(1)
    expect(alternating.rawSummary[0]).toBe(2)
    expect(alternating.rawSummary[3]).toBe(32)
  })

  it('models reduction and scan partner phases', () => {
    const reduce = simulateReference(controlsForPreset('reduction', 'reduce-tree'))
    const scan = simulateReference(controlsForPreset('reduction', 'scan'))
    expect(reduce.lanes[0].partner).toBe(1)
    expect(scan.lanes[1].partner).toBe(0)
    expect(scan.rawSummary[0]).toBe(31)
  })

  it('models occupancy limits from register, shared-memory, and warp budgets', () => {
    const balanced = simulateReference(controlsForPreset('occupancy', 'balanced'))
    const sharedHeavy = simulateReference(controlsForPreset('occupancy', 'shared-heavy'))
    expect(balanced.rawSummary[0]).toBeGreaterThan(sharedHeavy.rawSummary[0])
    expect(sharedHeavy.details.limitingFactor).toBe('Shared Memory')
  })

  it('round-trips share URLs into normalized controls', () => {
    const controls = controlsForPreset('banks', 'stride-2')
    const encoded = encodeControlsToQuery({ ...controls, bankPadding: 1 })
    const decoded = controlsFromQuery(`?${encoded}`)
    expect(decoded.labId).toBe('banks')
    expect(decoded.presetId).toBe('stride-2')
    expect(decoded.bankPadding).toBe(1)
  })

  it('keeps preset defaults when a share URL omits optional numeric controls', () => {
    const decoded = controlsFromQuery('')
    expect(decoded.elementSizeBytes).toBe(4)
    expect(decoded.warpSize).toBe(32)
    expect(decoded.randomSeed).toBe(7)
    expect(decoded.threadsPerBlock).toBe(256)
  })

  it('compares compute results against the CPU reference contract', () => {
    const reference = simulateReference(controlsForLab('reduction'))
    expect(compareResults({ ...reference, source: 'webgpu' })).toBe(true)
  })
})
