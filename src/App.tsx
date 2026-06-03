import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Gauge,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SkipBack,
  SkipForward,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { WorkbenchCanvas } from './components/WorkbenchCanvas'
import {
  DEFAULT_CONTROLS,
  LAB_DEFINITIONS,
  compareResults,
  controlsForLab,
  controlsForPreset,
  controlsFromQuery,
  controlsSignature,
  currentPreset,
  encodeControlsToQuery,
  formatBytes,
  getLabDefinition,
  normalizeControls,
  simulateReference,
} from './labs/workbench'
import type {
  ChoiceControlSpec,
  LabDefinition,
  LabId,
  LabPreset,
  LabResult,
  Metric as MetricType,
  NumericControlSpec,
  WorkbenchControls,
  WebGpuRuntime,
} from './sim/types'
import { initWebGpu, runWebGpuSimulation, shaderExcerptFor } from './sim/webgpu'
import './App.css'

function App() {
  const [controls, setControls] = useState<WorkbenchControls>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CONTROLS
    }
    return controlsFromQuery(window.location.search)
  })
  const [runtime, setRuntime] = useState<WebGpuRuntime | null>(null)
  const [webGpuResult, setWebGpuResult] = useState<ReturnType<typeof simulateReference> | null>(null)
  const [webGpuError, setWebGpuError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<'shader' | 'notes'>('shader')
  const [activeHelp, setActiveHelp] = useState<string | null>(null)
  const runId = useRef(0)
  const inspectorRef = useRef<HTMLElement | null>(null)
  const presetsRef = useRef<HTMLElement | null>(null)

  const lab = getLabDefinition(controls.labId)
  const referenceResult = useMemo(() => simulateReference(controls), [controls])
  const result = webGpuResult && controlsSignature(webGpuResult.controls) === controlsSignature(controls)
    ? webGpuResult
    : referenceResult
  const selectedPreset = currentPreset(controls)
  const activeLabIndex = LAB_DEFINITIONS.findIndex((labOption) => labOption.id === lab.id)
  const baselineResult = useMemo(() => {
    const baselinePreset = lab.presets[0]
    return simulateReference(controlsForPreset(lab.id, baselinePreset.id, controls))
  }, [controls, lab.id, lab.presets])
  const status = runtime ? 'Ready' : webGpuError ? 'Unavailable' : 'Initializing'
  const verified = result.source === 'webgpu' && compareResults(result)

  useEffect(() => {
    let cancelled = false
    initWebGpu()
      .then((nextRuntime) => {
        if (!cancelled) {
          setRuntime(nextRuntime)
          setWebGpuError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRuntime(null)
          setWebGpuError(error instanceof Error ? error.message : 'WebGPU failed to initialize.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!runtime) {
      return
    }

    const currentRun = ++runId.current
    runWebGpuSimulation(runtime, controls)
      .then((nextResult) => {
        if (runId.current !== currentRun) {
          return
        }
        if (compareResults(nextResult)) {
          setWebGpuResult(nextResult)
          setWebGpuError(null)
        } else {
          setWebGpuResult(null)
          setWebGpuError('WebGPU output did not match the CPU reference model; showing the verified reference result.')
        }
      })
      .catch((error: unknown) => {
        if (runId.current === currentRun) {
          setWebGpuResult(null)
          setWebGpuError(error instanceof Error ? error.message : 'WebGPU dispatch failed.')
        }
      })
  }, [controls, runtime])

  useEffect(() => {
    const nextQuery = encodeControlsToQuery(controls)
    const nextUrl = `${window.location.pathname}?${nextQuery}`
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [controls])

  useEffect(() => {
    if (!isPlaying) {
      return
    }
    const id = window.setInterval(() => {
      setControls((current) => normalizeControls({
        ...current,
        step: current.step >= 5 ? 1 : current.step + 1,
      }))
    }, 950)
    return () => window.clearInterval(id)
  }, [isPlaying])

  function patchControls(patch: Partial<WorkbenchControls>) {
    setControls((current) => normalizeControls({ ...current, ...patch }))
  }

  function showHelp(key: string) {
    setActiveHelp((current) => current === key ? null : key)
  }

  function selectLab(labId: LabId) {
    setIsPlaying(false)
    setShareUrl(null)
    setControls((current) => controlsForLab(labId, current))
  }

  function selectPreset(labId: LabId, presetId: string) {
    setIsPlaying(false)
    setShareUrl(null)
    setControls((current) => controlsForPreset(labId, presetId, current))
  }

  function openDocs() {
    setInspectorTab('notes')
    showHelp('notes')
    window.requestAnimationFrame(() => {
      inspectorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  function cycleExample() {
    const nextPreset = lab.presets[(controls.presetIndex + 1) % lab.presets.length]
    selectPreset(lab.id, nextPreset.id)
    window.requestAnimationFrame(() => {
      presetsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  async function shareState() {
    const url = `${window.location.origin}${window.location.pathname}?${encodeControlsToQuery(controls)}`
    setShareUrl(url)
    try {
      await navigator.clipboard?.writeText(url)
    } catch {
      // The visible link below is the fallback when clipboard permission is denied.
    }
    setShareStatus('copied')
    window.setTimeout(() => setShareStatus('idle'), 1500)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Collide">
          <div className="brand-mark" aria-hidden="true">C</div>
          <strong>Collide</strong>
          <span className="divider" />
          <h1>{lab.title}</h1>
        </div>
        <LearningPath activeIndex={activeLabIndex} onSelect={selectLab} />
        <nav className="top-actions" aria-label="Workbench actions">
          <button type="button" className="icon-button" onClick={openDocs} title="Open lab notes" aria-label="Docs">
            <BookOpen size={18} />
            <span>Docs</span>
          </button>
          <button type="button" className="icon-button" onClick={cycleExample} title="Cycle to the next guided example" aria-label="Next Example">
            <Sparkles size={18} />
            <span>Example</span>
          </button>
          <button type="button" className="icon-button" onClick={shareState} title="Copy share link" aria-label={shareStatus === 'copied' ? 'Copied' : 'Share'}>
            {shareStatus === 'copied' ? <CheckCircle2 size={18} /> : <Share2 size={18} />}
            <span>{shareStatus === 'copied' ? 'Copied' : 'Share'}</span>
          </button>
          <button type="button" className="icon-button help-top-button" onClick={() => showHelp('workbench')} title="Explain the workbench" aria-label="Help">
            <HelpCircle size={18} />
            <span>Help</span>
          </button>
          <div className={`webgpu-pill ${runtime ? 'ok' : 'warn'}`} data-testid="webgpu-status">
            <span className="status-dot" />
            WebGPU: {runtime ? 'Enabled' : status}
            <HelpButton id="webgpu" activeHelp={activeHelp} onToggle={showHelp} />
          </div>
        </nav>
      </header>
      {activeHelp === 'workbench' ? (
        <div className="global-help" data-testid="help-panel">
          <strong>Workbench map</strong>
          <span>Pick a lab on the left, choose a guided pattern, adjust parameters, read the live hardware counters, then inspect the WGSL and model notes on the right.</span>
        </div>
      ) : null}

      <main className="workspace">
        <aside className="control-rail" aria-label="Labs and simulation controls">
          <section className="rail-section lab-switcher">
            <SectionTitle title="Labs" helpId="labs" activeHelp={activeHelp} onHelp={showHelp} />
            <div className="lab-list">
              {LAB_DEFINITIONS.map((labOption, index) => (
                <button
                  key={labOption.id}
                  type="button"
                  className={`lab-button ${controls.labId === labOption.id ? 'active' : ''}`}
                  onClick={() => selectLab(labOption.id)}
                >
                  <span>{index + 1}</span>
                  <strong>{labOption.shortTitle}</strong>
                  <small>{labOption.subtitle}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="rail-section" ref={presetsRef}>
            <SectionTitle title="Guided Presets" helpId="presets" activeHelp={activeHelp} onHelp={showHelp} />
            <LearningCoach
              lab={lab}
              preset={selectedPreset}
              result={result}
              baselineResult={baselineResult}
              activeHelp={activeHelp}
              onHelp={showHelp}
            />
            <div className="preset-list">
              {lab.presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-card ${controls.presetId === preset.id ? 'active' : ''}`}
                  onClick={() => selectPreset(lab.id, preset.id)}
                >
                  <span className="spark" aria-hidden="true">
                    {preset.spark.map((on, index) => (
                      <i key={index} className={on ? 'on' : ''} />
                    ))}
                  </span>
                  <span>
                    <strong>{preset.title}</strong>
                    <small>{preset.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rail-section">
            <SectionTitle title="Parameters" helpId="parameters" activeHelp={activeHelp} onHelp={showHelp} />
            <ControlList lab={lab} controls={controls} onPatch={patchControls} activeHelp={activeHelp} onHelp={showHelp} />
            <button
              type="button"
              className="reset-button"
              onClick={() => {
                setIsPlaying(false)
                setShareUrl(null)
                setControls(controlsForLab(controls.labId))
              }}
            >
              <RotateCcw size={16} />
              Reset Lab
            </button>
            <InlineHelp id="reset" activeHelp={activeHelp} />
          </section>
        </aside>

        <section className="canvas-panel" aria-label="Interactive simulation canvas">
          <div className="canvas-help-anchor">
            <HelpButton id="canvas" activeHelp={activeHelp} onToggle={showHelp} />
          </div>
          <WorkbenchCanvas result={result} />
          <div className="transport" aria-label="Execution timeline controls">
            <button type="button" className="transport-button" onClick={() => patchControls({ step: 1 })} title="Back to dispatch" disabled={controls.step === 1}>
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              className="transport-button primary"
              onClick={() => setIsPlaying((value) => !value)}
              title={isPlaying ? 'Pause timeline' : 'Play timeline'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              type="button"
              className="transport-button"
              onClick={() => patchControls({ step: controls.step >= 5 ? 1 : controls.step + 1 })}
              title="Next stage"
            >
              <SkipForward size={18} />
            </button>
            <span className="step-readout">Stage <strong>{controls.step}</strong> / 5</span>
            <div className="step-track">
              {result.timeline.map((stage, index) => (
                <button
                  key={stage.title}
                  type="button"
                  className={`step-dot ${controls.step === index + 1 ? 'active' : ''}`}
                  onClick={() => patchControls({ step: index + 1 })}
                >
                  <span />
                  {stage.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="inspector" aria-label="Live metrics and shader" ref={inspectorRef}>
          <section className="metric-panel">
            <div className="panel-title">
              <SectionTitle title="Metrics (Live)" helpId="metrics" activeHelp={activeHelp} onHelp={showHelp} />
              <Gauge size={17} />
            </div>
            {result.metrics.map((metric) => (
              <Metric key={metric.label} metric={metric} activeHelp={activeHelp} onHelp={showHelp} />
            ))}
            <div className="cycle-box">
              <span>Estimated Cycles <HelpButton id="cycles" activeHelp={activeHelp} onToggle={showHelp} /></span>
              <strong>{result.summary.estimatedCycles}</strong>
              <small>{lab.accuracyNote}</small>
            </div>
          </section>

          <section className="status-panel">
            <h2>Status <span className={runtime ? 'ok-text' : 'warn-text'}>{status}</span> <HelpButton id="status" activeHelp={activeHelp} onToggle={showHelp} /></h2>
            <dl>
              <div><dt>Runtime</dt><dd>{result.source === 'webgpu' ? 'WebGPU compute' : 'CPU reference'}</dd></div>
              <div><dt>Adapter</dt><dd>{runtime?.label ?? 'Unavailable'}</dd></div>
              <div><dt>Verification</dt><dd>{result.source === 'webgpu' ? (verified ? 'Matches CPU reference' : 'Mismatch detected') : webGpuError ? 'Reference fallback active' : 'Waiting for WebGPU'}</dd></div>
            </dl>
            {webGpuError ? (
              <p className="unavailable-note" data-testid="webgpu-unavailable">
                {webGpuError} Use a WebGPU browser in a secure context such as localhost or HTTPS for compute-backed mode.
              </p>
            ) : null}
          </section>

          <section className="shader-panel">
            <div className="inspector-tabs">
              <button type="button" className={inspectorTab === 'shader' ? 'active' : ''} onClick={() => setInspectorTab('shader')}>
                <Code2 size={15} />
                WGSL
              </button>
              <button type="button" className={inspectorTab === 'notes' ? 'active' : ''} onClick={() => setInspectorTab('notes')}>
                <TerminalSquare size={15} />
                Notes
              </button>
            </div>
            {inspectorTab === 'shader' ? (
              <>
                <h2>Shader Focus <HelpButton id="shader" activeHelp={activeHelp} onToggle={showHelp} /><span>{lab.shaderFocus}</span></h2>
                <pre><code>{shaderExcerptFor(lab.id)}</code></pre>
              </>
            ) : (
              <div className="notes-panel">
                <h2>What This Shows <HelpButton id="notes" activeHelp={activeHelp} onToggle={showHelp} /></h2>
                <p>{lab.concept}</p>
                <h2>Model Honesty</h2>
                <p>{lab.accuracyNote}</p>
              </div>
            )}
          </section>
        </aside>
      </main>

      <section className="pipeline" aria-label="Pipeline timeline">
        {result.timeline.map((stage, index) => (
          <article key={stage.title} className={`pipeline-card ${controls.step === index + 1 ? 'active' : ''}`}>
            <div className="pipeline-head">
              <span>{index + 1}</span>
              <strong>{stage.title}</strong>
              <HelpButton id={`stage-${index}`} activeHelp={activeHelp} onToggle={showHelp} />
              <small>{controls.step === index + 1 ? 'Active' : 'Pending'}</small>
            </div>
            <p>{stage.copy}</p>
            <small>Cycles: {stage.cycles}</small>
          </article>
        ))}
      </section>

      <footer className="status-footer">
        <span>Collide 1.0 workbench</span>
        <span className="footer-separator" />
        <span>{lab.shortTitle}</span>
        <span className="footer-separator" />
        <span>Runtime <i className={runtime ? 'ok-dot' : 'warn-dot'} /></span>
        <strong>Current preset:</strong>
        <span>{selectedPreset.title}</span>
        <em>Hardware mappings are explicit; cycle and throughput counters are estimates.</em>
      </footer>
      {shareUrl ? (
        <div className="share-toast" data-testid="share-url">
          <strong>Share link ready</strong>
          <input readOnly value={shareUrl} aria-label="Share URL" onFocus={(event) => event.currentTarget.select()} />
        </div>
      ) : null}
    </div>
  )
}

export default App

function LearningPath({ activeIndex, onSelect }: {
  activeIndex: number
  onSelect: (labId: LabId) => void
}) {
  return (
    <div className="learning-path" aria-label="Learning path" data-testid="learning-path">
      <span>Learning Path</span>
      <div className="learning-steps">
        {LAB_DEFINITIONS.map((labOption, index) => (
          <button
            key={labOption.id}
            type="button"
            className={index === activeIndex ? 'active' : index < activeIndex ? 'complete' : ''}
            aria-label={`Jump to ${labOption.shortTitle}`}
            title={labOption.title}
            onClick={() => onSelect(labOption.id)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <strong>{Math.max(0, activeIndex) + 1} / {LAB_DEFINITIONS.length}</strong>
    </div>
  )
}

function LearningCoach({ lab, preset, result, baselineResult, activeHelp, onHelp }: {
  lab: LabDefinition
  preset: LabPreset
  result: LabResult
  baselineResult: LabResult
  activeHelp: string | null
  onHelp: (key: string) => void
}) {
  const cycleDelta = result.summary.estimatedCycles - baselineResult.summary.estimatedCycles
  const efficiencyDelta = result.summary.efficiency - baselineResult.summary.efficiency
  const tone = cycleDelta < 0 || efficiencyDelta > 0 ? 'good' : cycleDelta > 0 || efficiencyDelta < 0 ? 'warn' : 'neutral'

  return (
    <article className={`learning-coach ${tone}`} data-testid="learning-coach">
      <div className="coach-head">
        <span>What changed</span>
        <HelpButton id="coach" activeHelp={activeHelp} onToggle={onHelp} />
      </div>
      <p>{preset.why}</p>
      <div className="coach-compare" aria-label="Current pattern compared with the baseline preset">
        <div>
          <small>Baseline</small>
          <strong>{baselineResult.summary.value}</strong>
          <span>{baselineResult.summary.label}</span>
        </div>
        <ArrowRight size={16} aria-hidden="true" />
        <div>
          <small>Current</small>
          <strong>{result.summary.value}</strong>
          <span>{result.summary.label}</span>
        </div>
      </div>
      <dl className="coach-delta">
        <div>
          <dt>Cycle delta</dt>
          <dd>{formatCycleDelta(cycleDelta)}</dd>
        </div>
        <div>
          <dt>Efficiency</dt>
          <dd>{formatPercentRatio(result.summary.efficiency)}</dd>
        </div>
      </dl>
      <span className="coach-probe">{probeCopy(lab.id)}</span>
      <InlineHelp id="coach" activeHelp={activeHelp} />
    </article>
  )
}

interface ControlListProps {
  lab: LabDefinition
  controls: WorkbenchControls
  onPatch: (patch: Partial<WorkbenchControls>) => void
  activeHelp: string | null
  onHelp: (key: string) => void
}

function ControlList({ lab, controls, onPatch, activeHelp, onHelp }: ControlListProps) {
  return (
    <div className="control-list">
      {lab.controls.map((control) => {
        if (control.type === 'choice') {
          return (
            <ChoiceControl
              key={control.key}
              control={control}
              value={controls[control.key]}
              onChange={(value) => onPatch({ [control.key]: value })}
              activeHelp={activeHelp}
              onHelp={onHelp}
            />
          )
        }
        return (
          <Slider
            key={control.key}
            control={control}
            value={controls[control.key]}
            onChange={(value) => onPatch({ [control.key]: value })}
            activeHelp={activeHelp}
            onHelp={onHelp}
          />
        )
      })}
    </div>
  )
}

function ChoiceControl({ control, value, onChange, activeHelp, onHelp }: {
  control: ChoiceControlSpec
  value: number
  onChange: (value: number) => void
  activeHelp: string | null
  onHelp: (key: string) => void
}) {
  const helpId = `control-${control.key}`
  return (
    <div className="choice-control">
      <span>{control.label} <HelpButton id={helpId} activeHelp={activeHelp} onToggle={onHelp} /></span>
      <div>
        {control.choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className={value === choice.value ? 'active' : ''}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <InlineHelp id={helpId} activeHelp={activeHelp} />
    </div>
  )
}

function Slider({ control, value, onChange, activeHelp, onHelp }: {
  control: NumericControlSpec
  value: number
  onChange: (value: number) => void
  activeHelp: string | null
  onHelp: (key: string) => void
}) {
  const helpId = `control-${control.key}`
  return (
    <div className="slider-control">
      <span className="slider-heading">
        <span className="slider-label-line">
          <label htmlFor={`control-${control.key}`}>
            {control.label} <small>({control.suffix})</small>
          </label>
          <HelpButton id={helpId} activeHelp={activeHelp} onToggle={onHelp} />
        </span>
        <output>{formatControlValue(control.key, value)}</output>
      </span>
      <input
        id={`control-${control.key}`}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="slider-marks">
        {control.marks.map((mark) => <i key={mark}>{formatMark(control.key, mark)}</i>)}
      </span>
      <InlineHelp id={helpId} activeHelp={activeHelp} />
    </div>
  )
}

function Metric({ metric, activeHelp, onHelp }: {
  metric: MetricType
  activeHelp: string | null
  onHelp: (key: string) => void
}) {
  const helpId = `metric-${metric.label}`
  return (
    <div className="metric-row">
      <span>{metric.label} <HelpButton id={helpId} activeHelp={activeHelp} onToggle={onHelp} /></span>
      <strong className={metric.tone ?? ''}>{metric.value}</strong>
      <InlineHelp id={helpId} activeHelp={activeHelp} />
    </div>
  )
}

function SectionTitle({ title, helpId, activeHelp, onHelp }: {
  title: string
  helpId: string
  activeHelp: string | null
  onHelp: (key: string) => void
}) {
  return (
    <h2>
      {title}
      <HelpButton id={helpId} activeHelp={activeHelp} onToggle={onHelp} />
    </h2>
  )
}

function HelpButton({ id, activeHelp, onToggle }: {
  id: string
  activeHelp: string | null
  onToggle: (key: string) => void
}) {
  return (
    <span className="help-wrap">
      <button
        type="button"
        className={`help-button ${activeHelp === id ? 'active' : ''}`}
        aria-label={`Explain ${helpLabel(id)}`}
        title={helpText(id)}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(id)
        }}
      >
        ?
      </button>
      {activeHelp === id ? (
        <span className="help-popover" role="tooltip" data-testid="help-popover">
          {helpText(id)}
        </span>
      ) : null}
    </span>
  )
}

function InlineHelp({ id, activeHelp }: { id: string; activeHelp: string | null }) {
  if (activeHelp !== id) {
    return null
  }

  return (
    <p className="inline-help" data-testid="inline-help">
      {helpText(id)}
    </p>
  )
}

function formatControlValue(key: NumericControlSpec['key'], value: number): string {
  if (key === 'sharedMemoryBytes') {
    return formatBytes(value)
  }
  return value.toLocaleString()
}

function formatMark(key: NumericControlSpec['key'], value: number): string {
  if (key === 'sharedMemoryBytes') {
    return value >= 1024 ? `${Math.round(value / 1024)}K` : String(value)
  }
  return String(value)
}

function formatCycleDelta(delta: number): string {
  if (delta === 0) {
    return 'no change'
  }
  const sign = delta > 0 ? '+' : '-'
  return `${sign}${Math.abs(delta).toLocaleString()} cycles`
}

function formatPercentRatio(value: number): string {
  return `${(value * 100).toFixed(1)} %`
}

function probeCopy(labId: LabId): string {
  const copy: Record<LabId, string> = {
    coalescing: 'Probe: raise stride, then fix it with unit-stride layout.',
    banks: 'Probe: try a power-of-two bank stride, then add one padding word.',
    divergence: 'Probe: compare alternating branches with a uniform branch.',
    reduction: 'Probe: switch Reduce to Scan and step through partner offsets.',
    occupancy: 'Probe: increase shared memory until the limiter changes.',
  }
  return copy[labId]
}

function helpLabel(id: string): string {
  return id
    .replace(/^control-/, '')
    .replace(/^metric-/, '')
    .replace(/^stage-/, 'timeline stage ')
    .replace(/([A-Z])/g, ' $1')
}

function helpText(id: string): string {
  if (id.startsWith('metric-')) {
    return metricHelp(id.slice('metric-'.length))
  }

  if (id.startsWith('stage-')) {
    return [
      'Dispatch writes the chosen controls into GPU-visible buffers.',
      'Compute is where lanes calculate addresses, branches, banks, partners, or occupancy slots.',
      'Memory accounts for transaction pressure, bank replay pressure, or latency pressure.',
      'Barrier marks the synchronization point used by reductions, scans, and shared-memory reasoning.',
      'Return copies shader counters back so the CPU reference checker and UI can compare them.',
    ][Number(id.slice('stage-'.length))] ?? 'This timeline stage shows where the selected cost appears.'
  }

  const copy: Record<string, string> = {
    docs: 'Docs opens the Notes inspector and focuses the explanation for the current lab.',
    labs: 'Switch labs to change the primitive being simulated. Each lab has its own CPU reference model and WebGPU compute path.',
    presets: 'Guided presets are small challenges: a bad pattern, a fixed pattern, and a short reason why the metric changes.',
    parameters: 'Parameters mutate the shader input. The CPU reference updates immediately; WebGPU replaces it only after matching the reference.',
    reset: 'Reset Lab restores the current lab to its first guided preset and stops timeline playback.',
    canvas: 'The center canvas draws the actual lane records and summary counters returned by the simulator.',
    coach: 'What changed compares the selected preset with the lab baseline so the hardware consequence is visible before you inspect the shader.',
    metrics: 'Metrics are live counters decoded from the current result: WebGPU when verified, CPU reference as fallback.',
    cycles: 'Estimated cycles are teaching scores, not vendor-profiler timing. They let patterns be compared consistently.',
    status: 'Status tells you whether WebGPU is available, which runtime is displayed, and whether GPU output matched the CPU reference.',
    shader: 'WGSL shows the relevant compute-shader fragment for the active lab, so the teaching artifact and implementation stay connected.',
    notes: 'Notes explain the concept and model honesty: what is hardware-shaped and what is simplified.',
    webgpu: 'WebGPU Enabled means the browser returned an adapter and Collide is dispatching compute shaders in this page.',
    'control-stride': 'Stride is the distance between consecutive lane elements. Larger strides usually split one warp across more cache lines.',
    'control-baseOffsetBytes': 'Base Offset shifts the first address. Misalignment can make an otherwise contiguous warp cross a 128-byte boundary.',
    'control-elementSizeBytes': 'Element Size changes how many bytes each lane consumes. Wider elements can touch more cache lines.',
    'control-warpSize': 'Warp Size controls how many lanes participate in this teaching model, up to 64 for comparison.',
    'control-bankStride': 'Bank Stride is the word distance between lanes in shared memory. Powers of two often collide on the same banks.',
    'control-bankPadding': 'Row Padding inserts extra words per row to break repeated bank alignment in tiled shared memory.',
    'control-branchPeriod': 'Branch Period controls how often the branch mask changes across lanes.',
    'control-branchSkew': 'Mask Skew shifts the branch mask, modeling data-dependent branch boundaries.',
    'control-reductionMode': 'Primitive switches between tree reduction and prefix scan partner rules.',
    'control-step': 'Algorithm Step selects the current power-of-two phase for reduction or scan.',
    'control-registersPerThread': 'Registers per thread consume the SM register file and can reduce resident blocks.',
    'control-sharedMemoryBytes': 'Shared Memory per block consumes the SM shared-memory budget and can limit occupancy.',
    'control-threadsPerBlock': 'Block Size controls warps per block. Too few warps may not hide latency; too many can hit resource limits.',
  }

  return copy[id] ?? 'This control updates the live simulation and is included in the share URL.'
}

function metricHelp(label: string): string {
  if (label.includes('Transactions')) {
    return 'How many 128-byte memory transactions the current warp needs.'
  }
  if (label.includes('Useful')) {
    return 'Bytes actually requested by active lanes.'
  }
  if (label.includes('Fetched')) {
    return 'Bytes fetched because whole transaction lines must be moved.'
  }
  if (label.includes('Efficiency') || label.includes('Utilization')) {
    return 'Useful work divided by the modeled cost surface; higher means less waste.'
  }
  if (label.includes('Wasted')) {
    return 'Fetched bytes not used by the lanes.'
  }
  if (label.includes('Conflict')) {
    return 'How many lanes collide on the same shared-memory bank and require replay.'
  }
  if (label.includes('Banks')) {
    return 'How many of the 32 shared-memory banks receive at least one lane.'
  }
  if (label.includes('Serialized')) {
    return 'How many branch bodies the warp must issue because lanes disagree.'
  }
  if (label.includes('Inactive')) {
    return 'Issue slots occupied by lanes that are masked off during a divergent path.'
  }
  if (label.includes('Active Operations')) {
    return 'Lane operations participating in the selected reduction or scan phase.'
  }
  if (label.includes('Partner')) {
    return 'Power-of-two lane distance used by this algorithm phase.'
  }
  if (label.includes('Barrier')) {
    return 'Synchronization points needed before the next shared-memory phase.'
  }
  if (label.includes('Resident Warps')) {
    return 'Warps that can live on one SM after register, shared-memory, and warp-slot limits.'
  }
  if (label.includes('Resident Blocks')) {
    return 'Thread blocks that fit concurrently on the modeled SM.'
  }
  if (label.includes('Occupancy')) {
    return 'Resident warps divided by the modeled maximum resident warps.'
  }
  if (label.includes('Latency')) {
    return 'Estimated ability to cover memory stalls with other resident warps.'
  }
  if (label.includes('Limiter')) {
    return 'The resource currently preventing more blocks or warps from becoming resident.'
  }
  return 'A live counter from the active CPU/WebGPU simulation result.'
}
