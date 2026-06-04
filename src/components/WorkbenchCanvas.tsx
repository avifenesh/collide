import { useMemo, useState } from 'react'
import {
  BANK_COUNT,
  CACHE_LINE_BYTES,
  type BankGroup,
  type LabResult,
  type LaneRecord,
} from '../sim/types'
import { formatBytes, formatPercent, laneColor } from '../labs/workbench'

interface WorkbenchCanvasProps {
  result: LabResult
}

type CanvasSelection =
  | { labId: 'coalescing', kind: 'lane', id: number }
  | { labId: 'banks', kind: 'bank', id: number }
  | { labId: 'divergence', kind: 'divergence-lane', id: number }
  | { labId: 'reduction', kind: 'reduction-lane', id: number }
  | { labId: 'occupancy', kind: 'warp', id: number }

export function WorkbenchCanvas({ result }: WorkbenchCanvasProps) {
  const [selection, setSelection] = useState<CanvasSelection | null>(null)
  const activeSelection = selection?.labId === result.labId ? selection : null
  const selectionSummary = canvasSelectionSummary(result, activeSelection)

  return (
    <div className="workbench-canvas" data-testid="lab-canvas">
      <div className="canvas-header">
        <div className="canvas-title-block">
          <span>{result.source === 'webgpu' ? 'WebGPU compute result' : 'CPU reference preview'}</span>
          <h2>{result.summary.title}</h2>
          <div className={`canvas-selection ${activeSelection == null ? 'idle' : ''}`} data-testid="canvas-selection">
            <span>{selectionSummary.label}</span>
            <strong>{selectionSummary.title}</strong>
            <small>{selectionSummary.copy}</small>
          </div>
        </div>
        <div className="canvas-score">
          <small>{result.summary.label}</small>
          <strong>{result.summary.value}</strong>
          <span>{result.summary.subvalue}</span>
        </div>
      </div>
      {result.labId === 'coalescing' ? (
        <CoalescingView
          result={result}
          selectedLane={activeSelection?.kind === 'lane' ? activeSelection.id : null}
          onSelectLane={(id) => setSelection({ labId: 'coalescing', kind: 'lane', id })}
        />
      ) : null}
      {result.labId === 'banks' ? (
        <BankView
          result={result}
          selectedBank={activeSelection?.kind === 'bank' ? activeSelection.id : null}
          onSelectBank={(id) => setSelection({ labId: 'banks', kind: 'bank', id })}
        />
      ) : null}
      {result.labId === 'divergence' ? (
        <DivergenceView
          result={result}
          selectedLane={activeSelection?.kind === 'divergence-lane' ? activeSelection.id : null}
          onSelectLane={(id) => setSelection({ labId: 'divergence', kind: 'divergence-lane', id })}
        />
      ) : null}
      {result.labId === 'reduction' ? (
        <ReductionView
          result={result}
          selectedLane={activeSelection?.kind === 'reduction-lane' ? activeSelection.id : null}
          onSelectLane={(id) => setSelection({ labId: 'reduction', kind: 'reduction-lane', id })}
        />
      ) : null}
      {result.labId === 'occupancy' ? (
        <OccupancyView
          result={result}
          selectedWarp={activeSelection?.kind === 'warp' ? activeSelection.id : null}
          onSelectWarp={(id) => setSelection({ labId: 'occupancy', kind: 'warp', id })}
        />
      ) : null}
    </div>
  )
}

function CoalescingView({ result, selectedLane, onSelectLane }: {
  result: LabResult
  selectedLane: number | null
  onSelectLane: (lane: number) => void
}) {
  const maxAddress = result.details.maxAddress ?? CACHE_LINE_BYTES * 4
  const lines = useMemo(() => {
    const next = []
    for (let base = 0; base < maxAddress; base += CACHE_LINE_BYTES) {
      next.push(base)
    }
    return next
  }, [maxAddress])
  const transactionBases = new Set(result.transactions.map((transaction) => transaction.base))
  const touchedAddresses = new Set(result.lanes.map((lane) => lane.address))
  const selectedRecord = selectedLane == null ? null : result.lanes.find((lane) => lane.lane === selectedLane) ?? null
  const width = Math.max(1180, result.controls.warpSize * 34)
  const height = 380 + Math.max(0, lines.length - 1) * 74

  return (
    <div className="diagram-scroll">
      <svg
        className="memory-diagram"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label="Lane addresses and memory transactions"
      >
        <text x="28" y="34" className="diagram-label">WARP LANES</text>
        {result.lanes.map((lane, index) => {
          const x = 112 + index * laneGap(result.controls.warpSize)
          const targetX = addressX(lane.address, maxAddress)
          const color = laneColor(index, result.controls.warpSize)
          const isSelected = selectedLane === lane.lane
          return (
            <g key={lane.lane} className={`lane-node ${isSelected ? 'selected' : ''}`}>
              <rect
                x={x - 13}
                y="52"
                width="26"
                height="30"
                rx="5"
                fill={color}
                stroke={isSelected ? '#f6fbff' : 'transparent'}
                strokeWidth={isSelected ? 3 : 0}
              />
              <text x={x} y="72" className="lane-text">{lane.lane}</text>
              <path
                d={`M ${x} 84 C ${x} 130, ${targetX} 126, ${targetX} 170`}
                stroke={color}
                strokeWidth={isSelected ? 3 : 1.4}
                fill="none"
                opacity={isSelected ? 1 : 0.72}
              />
              <circle
                cx={targetX}
                cy="176"
                r={isSelected ? 7 : 4}
                fill={color}
                stroke={isSelected ? '#f6fbff' : 'transparent'}
                strokeWidth={isSelected ? 2 : 0}
              />
              <rect
                x={x - 16}
                y="49"
                width="32"
                height="36"
                rx="7"
                fill="transparent"
                className="lane-hit-target"
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Select lane ${lane.lane}, address ${formatBytes(lane.address)}, ${formatCacheLine(lane.transactionBase)}`}
                onClick={() => onSelectLane(lane.lane)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectLane(lane.lane)
                  }
                }}
              />
            </g>
          )
        })}
        <text x="28" y="182" className="diagram-label">BYTE ADDRESSES</text>
        {result.lanes.map((lane) => (
          <text
            key={`${lane.lane}-${lane.address}`}
            x={addressX(lane.address, maxAddress)}
            y="214"
            className="address-text"
            fill={laneColor(lane.lane, result.controls.warpSize)}
          >
            {lane.address}
          </text>
        ))}
        <text x="28" y="270" className="diagram-label">128B CACHE LINES</text>
        {lines.map((base, lineIndex) => {
          const y = 296 + lineIndex * 74
          const fetched = transactionBases.has(base)
          return (
            <g key={base}>
              <text x="28" y={y + 22} className="line-label">0x{base.toString(16).padStart(4, '0')}</text>
              <rect
                x="112"
                y={y}
                width="820"
                height="42"
                rx="6"
                className={fetched ? 'line-box fetched' : 'line-box'}
              />
              {Array.from({ length: 32 }, (_, cell) => {
                const address = base + cell * 4
                const x = 122 + cell * 25
                const touched = touchedAddresses.has(address)
                const selected = selectedRecord?.address === address
                return (
                  <rect
                    key={address}
                    x={x}
                    y={y + 10}
                    width="17"
                    height="22"
                    rx="3"
                    className={`${touched ? 'memory-byte useful' : fetched ? 'memory-byte wasted' : 'memory-byte'} ${selected ? 'selected' : ''}`}
                  />
                )
              })}
              <text x="964" y={y + 25} className={fetched ? 'transaction-label hot' : 'transaction-label'}>
                {fetched ? 'fetched' : 'idle'}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function canvasSelectionSummary(result: LabResult, selection: CanvasSelection | null): { label: string, title: string, copy: string } {
  if (result.labId === 'coalescing') {
    return coalescingSelectionSummary(result, selection?.kind === 'lane' ? selection.id : null)
  }
  if (result.labId === 'banks') {
    return bankSelectionSummary(result, selection?.kind === 'bank' ? selection.id : null)
  }
  if (result.labId === 'divergence') {
    return divergenceSelectionSummary(result, selection?.kind === 'divergence-lane' ? selection.id : null)
  }
  if (result.labId === 'reduction') {
    return reductionSelectionSummary(result, selection?.kind === 'reduction-lane' ? selection.id : null)
  }
  return occupancySelectionSummary(result, selection?.kind === 'warp' ? selection.id : null)
}

function coalescingSelectionSummary(result: LabResult, selectedLane: number | null): { label: string, title: string, copy: string } {
  const lane = selectedLane == null ? null : result.lanes.find((record) => record.lane === selectedLane)
  if (!lane) {
    return {
      label: 'Lane trace',
      title: 'No lane selected',
      copy: 'Pick a lane number to follow one thread through address, cache-line, and transaction counters.',
    }
  }

  const transaction = result.transactions.find((band) => band.base === lane.transactionBase)
  const sharedLaneCount = transaction?.lanes.length ?? 1
  const lineLabel = formatCacheLine(lane.transactionBase)
  return {
    label: 'Lane trace',
    title: `Lane ${lane.lane} -> ${formatBytes(lane.address)}`,
    copy: `${lineLabel} fetch serves ${sharedLaneCount} ${sharedLaneCount === 1 ? 'lane' : 'lanes'} and contributes ${formatBytes(result.controls.elementSizeBytes)} of useful payload.`,
  }
}

function bankSelectionSummary(result: LabResult, selectedBank: number | null): { label: string, title: string, copy: string } {
  const bank = selectedBank == null ? null : result.banks.find((record) => record.bank === selectedBank)
  if (!bank) {
    return {
      label: 'Bank trace',
      title: 'No bank selected',
      copy: 'Pick a shared-memory bank column to see which lanes map there and whether replay is required.',
    }
  }

  const laneCopy = bank.lanes.length ? `lanes ${bank.lanes.join(', ')}` : 'no lanes'
  return {
    label: 'Bank trace',
    title: `Bank ${bank.bank} -> ${bank.conflict} ${bank.conflict === 1 ? 'lane' : 'lanes'}`,
    copy: bank.lanes.length
      ? `This bank receives ${laneCopy}; replay degree is ${Math.max(1, bank.conflict)}x for this column.`
      : 'This bank is idle for the selected pattern, so it adds no replay pressure.',
  }
}

function divergenceSelectionSummary(result: LabResult, selectedLane: number | null): { label: string, title: string, copy: string } {
  const lane = selectedLane == null ? null : result.lanes.find((record) => record.lane === selectedLane)
  if (!lane) {
    return {
      label: 'Branch trace',
      title: 'No lane selected',
      copy: 'Pick a lane cell to see which branch body it follows and what other lanes wait during serialization.',
    }
  }

  const path = lane.branchPath === 0 ? 'Path A' : 'Path B'
  const pathCount = result.details.pathCounts?.[lane.branchPath] ?? result.lanes.filter((record) => record.branchPath === lane.branchPath).length
  const waitingCount = result.controls.warpSize - pathCount
  return {
    label: 'Branch trace',
    title: `Lane ${lane.lane} -> ${path}`,
    copy: `${pathCount} ${pathCount === 1 ? 'lane takes' : 'lanes take'} ${path}; ${waitingCount} ${waitingCount === 1 ? 'lane waits' : 'lanes wait'} while the other serialized body issues.`,
  }
}

function reductionSelectionSummary(result: LabResult, selectedLane: number | null): { label: string, title: string, copy: string } {
  const lane = selectedLane == null ? null : result.lanes.find((record) => record.lane === selectedLane)
  if (!lane) {
    return {
      label: 'Operation trace',
      title: 'No lane selected',
      copy: 'Pick a lane value to see whether this step performs work, which partner it reads, and where the barrier lands.',
    }
  }

  const partnerCopy = lane.partner == null ? 'has no partner this step' : `reads L${lane.partner}`
  const mode = result.controls.reductionMode === 0 ? 'tree reduction' : 'scan'
  return {
    label: 'Operation trace',
    title: `Lane ${lane.lane} -> ${lane.active ? 'active' : 'idle'}`,
    copy: `Value ${lane.value}; ${partnerCopy} at offset ${result.details.offset ?? 1} in the ${mode} schedule.`,
  }
}

function occupancySelectionSummary(result: LabResult, selectedWarp: number | null): { label: string, title: string, copy: string } {
  const lane = selectedWarp == null ? null : result.lanes.find((record) => record.lane === selectedWarp)
  if (!lane) {
    return {
      label: 'Warp trace',
      title: 'No warp selected',
      copy: 'Pick a warp slot to see whether it is resident and how the current resource limit affects latency hiding.',
    }
  }

  const residentWarps = result.details.residentWarps ?? result.lanes.filter((record) => record.active).length
  return {
    label: 'Warp trace',
    title: `Warp ${lane.lane} -> ${lane.active ? 'resident' : 'not resident'}`,
    copy: `${residentWarps} resident warps fit because ${result.details.limitingFactor} is currently limiting this block shape.`,
  }
}

function formatCacheLine(base: number): string {
  return `cache line 0x${base.toString(16).padStart(4, '0')}`
}

function BankView({ result, selectedBank, onSelectBank }: {
  result: LabResult
  selectedBank: number | null
  onSelectBank: (bank: number) => void
}) {
  const maxConflict = Math.max(1, result.details.maxConflict ?? 1)

  return (
    <div className="bank-layout">
      <div className="bank-strip" aria-label="Shared memory banks">
        {result.banks.map((bank) => (
          <BankColumn
            key={bank.bank}
            bank={bank}
            maxConflict={maxConflict}
            selected={selectedBank === bank.bank}
            onSelect={() => onSelectBank(bank.bank)}
          />
        ))}
      </div>
      <div className="bank-readout">
        <strong>{maxConflict}x replay degree</strong>
        <span>{result.rawSummary[1]} banks touched out of {BANK_COUNT}</span>
        <p>Padding or unit-stride layouts spread lanes across banks; power-of-two strides collapse lanes onto the same few banks.</p>
      </div>
    </div>
  )
}

function BankColumn({ bank, maxConflict, selected, onSelect }: {
  bank: BankGroup
  maxConflict: number
  selected: boolean
  onSelect: () => void
}) {
  const height = Math.max(12, (bank.conflict / maxConflict) * 156)
  const laneLabel = bank.lanes.length > 4 ? `${bank.lanes.length}x` : bank.lanes.length ? bank.lanes.join(',') : '-'
  return (
    <button
      type="button"
      className={`bank-column ${bank.conflict > 1 ? 'conflict' : bank.conflict === 1 ? 'clean' : ''} ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      aria-label={`Select bank ${bank.bank}, ${bank.lanes.length} ${bank.lanes.length === 1 ? 'lane' : 'lanes'}`}
      onClick={onSelect}
    >
      <span className="bank-number">{bank.bank}</span>
      <div className="bank-meter">
        <i style={{ height }} />
      </div>
      <span className="bank-lanes">{laneLabel}</span>
    </button>
  )
}

function DivergenceView({ result, selectedLane, onSelectLane }: {
  result: LabResult
  selectedLane: number | null
  onSelectLane: (lane: number) => void
}) {
  const pathA = result.lanes.filter((lane) => lane.branchPath === 0)
  const pathB = result.lanes.filter((lane) => lane.branchPath === 1)

  return (
    <div className="divergence-layout">
      <BranchLaneRow title="Path A" lanes={pathA} result={result} selectedLane={selectedLane} onSelectLane={onSelectLane} />
      <BranchLaneRow title="Path B" lanes={pathB} result={result} selectedLane={selectedLane} onSelectLane={onSelectLane} />
      <div className="simt-issue">
        {[0, 1].map((path) => {
          const count = path === 0 ? pathA.length : pathB.length
          const active = count > 0
          return (
            <div key={path} className={`issue-slot ${active ? 'active' : ''}`}>
              <strong>Serialized body {path === 0 ? 'A' : 'B'}</strong>
              <span>{active ? `${count} active lanes, ${result.controls.warpSize - count} inactive slots` : 'skipped'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BranchLaneRow({ title, lanes, result, selectedLane, onSelectLane }: {
  title: string
  lanes: LaneRecord[]
  result: LabResult
  selectedLane: number | null
  onSelectLane: (lane: number) => void
}) {
  return (
    <section className="branch-row">
      <div className="branch-title">
        <strong>{title}</strong>
        <span>{lanes.length} lanes</span>
      </div>
      <div className="lane-grid">
        {Array.from({ length: result.controls.warpSize }, (_, lane) => {
          const record = result.lanes[lane]
          const belongs = record?.branchPath === (title === 'Path A' ? 0 : 1)
          const activeNow = belongs && record.active
          const selected = selectedLane === lane && belongs
          return (
            <button
              type="button"
              key={lane}
              className={`${belongs ? 'belongs' : ''} ${activeNow ? 'active' : ''} ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              aria-label={`${belongs ? 'Select' : 'Inspect'} ${title} lane ${lane}`}
              title={`lane ${lane}`}
              onClick={() => onSelectLane(lane)}
            >
              {lane}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ReductionView({ result, selectedLane, onSelectLane }: {
  result: LabResult
  selectedLane: number | null
  onSelectLane: (lane: number) => void
}) {
  const offset = result.details.offset ?? 1
  const activeLanes = result.lanes.filter((lane) => lane.active)

  return (
    <div className="reduction-layout">
      <div className="reduction-head">
        <strong>{result.controls.reductionMode === 0 ? 'Tree reduction' : 'Hillis-Steele scan'}</strong>
        <span>offset {offset}, {activeLanes.length} lane operations</span>
      </div>
      <div className="reduction-lanes">
        {result.lanes.map((lane) => (
          <button
            type="button"
            key={lane.lane}
            className={`reduce-lane ${lane.active ? 'active' : ''} ${selectedLane === lane.lane ? 'selected' : ''}`}
            aria-pressed={selectedLane === lane.lane}
            aria-label={`Select reduction lane ${lane.lane}`}
            onClick={() => onSelectLane(lane.lane)}
          >
            <span>L{lane.lane}</span>
            <strong>{lane.value}</strong>
            <small>{lane.partner == null ? 'idle' : `with L${lane.partner}`}</small>
          </button>
        ))}
      </div>
      <div className="barrier-strip">
        {Array.from({ length: Math.min(6, result.controls.step) }, (_, index) => (
          <span key={index}>barrier {index + 1}</span>
        ))}
      </div>
    </div>
  )
}

function OccupancyView({ result, selectedWarp, onSelectWarp }: {
  result: LabResult
  selectedWarp: number | null
  onSelectWarp: (warp: number) => void
}) {
  const activeWarps = result.lanes.filter((lane) => lane.active).length
  const occupancy = result.details.occupancyPermille ?? 0
  const latency = result.details.latencyPermille ?? 0

  return (
    <div className="occupancy-layout">
      <div className="resource-gauges">
        <Gauge label="Occupancy" value={occupancy} />
        <Gauge label="Latency Hidden" value={latency} />
        <Gauge label="Resident Blocks" value={(result.details.residentBlocks ?? 0) * 100} max={3200} />
      </div>
      <div className="warp-slots" aria-label="Resident warp slots">
        {result.lanes.map((lane) => (
          <button
            type="button"
            key={lane.lane}
            className={`${lane.active ? 'resident' : ''} ${selectedWarp === lane.lane ? 'selected' : ''}`}
            aria-pressed={selectedWarp === lane.lane}
            aria-label={`Select warp ${lane.lane}`}
            onClick={() => onSelectWarp(lane.lane)}
          >
            {lane.lane}
          </button>
        ))}
      </div>
      <div className="occupancy-note">
        <strong>{activeWarps} resident warps</strong>
        <span>{result.details.limitingFactor} is the current limiting resource.</span>
        <p>{formatBytes(result.controls.sharedMemoryBytes)} shared memory per block, {result.controls.registersPerThread} registers per thread, {result.controls.threadsPerBlock} threads per block.</p>
      </div>
    </div>
  )
}

function Gauge({ label, value, max = 1000 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="resource-gauge">
      <span>{label}</span>
      <div><i style={{ width: `${pct}%` }} /></div>
      <strong>{max === 1000 ? formatPercent(value) : Math.round(value / 100)}</strong>
    </div>
  )
}

function addressX(address: number, maxAddress: number): number {
  return 112 + (address / Math.max(1, maxAddress)) * 820
}

function laneGap(warpSize: number): number {
  if (warpSize <= 16) {
    return 56
  }
  if (warpSize <= 32) {
    return 31
  }
  return 16
}
