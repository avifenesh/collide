import { useMemo } from 'react'
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

export function WorkbenchCanvas({ result }: WorkbenchCanvasProps) {
  return (
    <div className="workbench-canvas" data-testid="lab-canvas">
      <div className="canvas-header">
        <div>
          <span>{result.source === 'webgpu' ? 'WebGPU compute result' : 'CPU reference preview'}</span>
          <h2>{result.summary.title}</h2>
        </div>
        <div className="canvas-score">
          <small>{result.summary.label}</small>
          <strong>{result.summary.value}</strong>
          <span>{result.summary.subvalue}</span>
        </div>
      </div>
      {result.labId === 'coalescing' ? <CoalescingView result={result} /> : null}
      {result.labId === 'banks' ? <BankView result={result} /> : null}
      {result.labId === 'divergence' ? <DivergenceView result={result} /> : null}
      {result.labId === 'reduction' ? <ReductionView result={result} /> : null}
      {result.labId === 'occupancy' ? <OccupancyView result={result} /> : null}
    </div>
  )
}

function CoalescingView({ result }: { result: LabResult }) {
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
  const width = Math.max(1180, result.controls.warpSize * 34)

  return (
    <div className="diagram-scroll">
      <svg className="memory-diagram" viewBox={`0 0 ${width} 620`} role="img" aria-label="Lane addresses and memory transactions">
        <text x="28" y="34" className="diagram-label">WARP LANES</text>
        {result.lanes.map((lane, index) => {
          const x = 112 + index * laneGap(result.controls.warpSize)
          const targetX = addressX(lane.address, maxAddress)
          const color = laneColor(index, result.controls.warpSize)
          return (
            <g key={lane.lane}>
              <rect x={x - 13} y="52" width="26" height="30" rx="5" fill={color} />
              <text x={x} y="72" className="lane-text">{lane.lane}</text>
              <path
                d={`M ${x} 84 C ${x} 130, ${targetX} 126, ${targetX} 170`}
                stroke={color}
                strokeWidth="1.4"
                fill="none"
                opacity="0.72"
              />
              <circle cx={targetX} cy="176" r="4" fill={color} />
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
                return (
                  <rect
                    key={address}
                    x={x}
                    y={y + 10}
                    width="17"
                    height="22"
                    rx="3"
                    className={touched ? 'memory-byte useful' : fetched ? 'memory-byte wasted' : 'memory-byte'}
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

function BankView({ result }: { result: LabResult }) {
  const maxConflict = Math.max(1, result.details.maxConflict ?? 1)

  return (
    <div className="bank-layout">
      <div className="bank-strip" aria-label="Shared memory banks">
        {result.banks.map((bank) => (
          <BankColumn key={bank.bank} bank={bank} maxConflict={maxConflict} />
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

function BankColumn({ bank, maxConflict }: { bank: BankGroup; maxConflict: number }) {
  const height = Math.max(12, (bank.conflict / maxConflict) * 156)
  return (
    <div className={`bank-column ${bank.conflict > 1 ? 'conflict' : bank.conflict === 1 ? 'clean' : ''}`}>
      <span className="bank-number">{bank.bank}</span>
      <div className="bank-meter">
        <i style={{ height }} />
      </div>
      <span className="bank-lanes">{bank.lanes.length ? bank.lanes.join(',') : '-'}</span>
    </div>
  )
}

function DivergenceView({ result }: { result: LabResult }) {
  const pathA = result.lanes.filter((lane) => lane.branchPath === 0)
  const pathB = result.lanes.filter((lane) => lane.branchPath === 1)

  return (
    <div className="divergence-layout">
      <BranchLaneRow title="Path A" lanes={pathA} result={result} />
      <BranchLaneRow title="Path B" lanes={pathB} result={result} />
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

function BranchLaneRow({ title, lanes, result }: { title: string; lanes: LaneRecord[]; result: LabResult }) {
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
          return (
            <i
              key={lane}
              className={`${belongs ? 'belongs' : ''} ${activeNow ? 'active' : ''}`}
              title={`lane ${lane}`}
            >
              {lane}
            </i>
          )
        })}
      </div>
    </section>
  )
}

function ReductionView({ result }: { result: LabResult }) {
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
          <div key={lane.lane} className={`reduce-lane ${lane.active ? 'active' : ''}`}>
            <span>L{lane.lane}</span>
            <strong>{lane.value}</strong>
            <small>{lane.partner == null ? 'idle' : `with L${lane.partner}`}</small>
          </div>
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

function OccupancyView({ result }: { result: LabResult }) {
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
          <span key={lane.lane} className={lane.active ? 'resident' : ''}>
            {lane.lane}
          </span>
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
