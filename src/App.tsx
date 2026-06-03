import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Gauge,
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
  const [inspectorTab, setInspectorTab] = useState<'shader' | 'notes'>('shader')
  const runId = useRef(0)

  const lab = getLabDefinition(controls.labId)
  const referenceResult = useMemo(() => simulateReference(controls), [controls])
  const result = webGpuResult && controlsSignature(webGpuResult.controls) === controlsSignature(controls)
    ? webGpuResult
    : referenceResult
  const selectedPreset = currentPreset(controls)
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

  function selectLab(labId: LabId) {
    setIsPlaying(false)
    setControls((current) => controlsForLab(labId, current))
  }

  function selectPreset(labId: LabId, presetId: string) {
    setIsPlaying(false)
    setControls((current) => controlsForPreset(labId, presetId, current))
  }

  async function shareState() {
    const url = `${window.location.origin}${window.location.pathname}?${encodeControlsToQuery(controls)}`
    await navigator.clipboard?.writeText(url)
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
        <nav className="top-actions" aria-label="Workbench actions">
          <button type="button" className="icon-button" onClick={() => setInspectorTab('notes')} title="Open lab notes" aria-label="Docs">
            <BookOpen size={18} />
            <span>Docs</span>
          </button>
          <button type="button" className="icon-button" onClick={() => selectPreset(lab.id, lab.presets[0].id)} title="Load the first guided example" aria-label="Examples">
            <Sparkles size={18} />
            <span>Examples</span>
          </button>
          <button type="button" className="icon-button" onClick={shareState} title="Copy share link" aria-label={shareStatus === 'copied' ? 'Copied' : 'Share'}>
            {shareStatus === 'copied' ? <CheckCircle2 size={18} /> : <Share2 size={18} />}
            <span>{shareStatus === 'copied' ? 'Copied' : 'Share'}</span>
          </button>
          <div className={`webgpu-pill ${runtime ? 'ok' : 'warn'}`} data-testid="webgpu-status">
            <span className="status-dot" />
            WebGPU: {runtime ? 'Enabled' : status}
          </div>
        </nav>
      </header>

      <main className="workspace">
        <aside className="control-rail" aria-label="Labs and simulation controls">
          <section className="rail-section lab-switcher">
            <h2>Labs</h2>
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

          <section className="rail-section">
            <h2>Guided Presets</h2>
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
            <p className="challenge-copy">{selectedPreset.why}</p>
          </section>

          <section className="rail-section">
            <h2>Parameters</h2>
            <ControlList lab={lab} controls={controls} onPatch={patchControls} />
            <button type="button" className="reset-button" onClick={() => setControls(controlsForLab(controls.labId))}>
              <RotateCcw size={16} />
              Reset Lab
            </button>
          </section>
        </aside>

        <section className="canvas-panel" aria-label="Interactive simulation canvas">
          <WorkbenchCanvas result={result} />
          <div className="transport" aria-label="Execution timeline controls">
            <button type="button" className="transport-button" onClick={() => patchControls({ step: 1 })} title="Back to dispatch">
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

        <aside className="inspector" aria-label="Live metrics and shader">
          <section className="metric-panel">
            <div className="panel-title">
              <h2>Metrics (Live)</h2>
              <Gauge size={17} />
            </div>
            {result.metrics.map((metric) => (
              <Metric key={metric.label} metric={metric} />
            ))}
            <div className="cycle-box">
              <span>Estimated Cycles</span>
              <strong>{result.summary.estimatedCycles}</strong>
              <small>{lab.accuracyNote}</small>
            </div>
          </section>

          <section className="status-panel">
            <h2>Status <span className={runtime ? 'ok-text' : 'warn-text'}>{status}</span></h2>
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
                <h2>Shader Focus <span>{lab.shaderFocus}</span></h2>
                <pre><code>{shaderExcerptFor(lab.id)}</code></pre>
              </>
            ) : (
              <div className="notes-panel">
                <h2>What This Shows</h2>
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
    </div>
  )
}

export default App

interface ControlListProps {
  lab: LabDefinition
  controls: WorkbenchControls
  onPatch: (patch: Partial<WorkbenchControls>) => void
}

function ControlList({ lab, controls, onPatch }: ControlListProps) {
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
            />
          )
        }
        return (
          <Slider
            key={control.key}
            control={control}
            value={controls[control.key]}
            onChange={(value) => onPatch({ [control.key]: value })}
          />
        )
      })}
    </div>
  )
}

function ChoiceControl({ control, value, onChange }: {
  control: ChoiceControlSpec
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="choice-control">
      <span>{control.label}</span>
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
    </div>
  )
}

function Slider({ control, value, onChange }: {
  control: NumericControlSpec
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-control">
      <span className="slider-heading">
        <span>{control.label} <small>({control.suffix})</small></span>
        <output>{formatControlValue(control.key, value)}</output>
      </span>
      <input
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
    </label>
  )
}

function Metric({ metric }: { metric: MetricType }) {
  return (
    <div className="metric-row">
      <span>{metric.label}</span>
      <strong className={metric.tone ?? ''}>{metric.value}</strong>
    </div>
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
