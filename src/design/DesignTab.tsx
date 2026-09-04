import { useEffect, useMemo, useState } from 'react'
import {
  DESIGN_REQUIREMENTS,
  designCapacitance,
  designInductance,
  diodeLossApprox,
  evaluateDesign,
  inductorSaturated,
  junctionTemp,
  minInductorCurrent,
  mosfetConductionLossApprox,
  peakInductorCurrent,
  predictedDeltaIl,
  predictedDeltaVout,
  predictedVout,
  runLineStep,
  runLoadStep,
  suggestedDuty,
  switchingLossApprox,
  targetInductorRipple,
  type DesignReview,
  type LineStepResult,
  type LoadStepResult,
} from '../sim/design.ts'
import { settleSimulation } from '../sim/integrate.ts'
import { baseIdealParams } from '../sim/presets.ts'
import type { BuckParams, Instant, Metrics, WaveformId } from '../sim/types.ts'
import { CircuitSvg, type CircuitHighlight, type UnsetPart } from '../ui/CircuitSvg.tsx'
import { Waveforms } from '../ui/Waveforms.tsx'
import { formatFixed, formatPercent, formatSi } from '../ui/format.ts'
import {
  CAPACITORS,
  DIODES,
  INDUCTORS,
  MOSFETS,
} from './parts.ts'
import {
  EMPTY_DESIGN,
  chosenCapacitor,
  chosenDiode,
  chosenInductor,
  chosenMosfet,
  designSignature,
  designToParams,
  parseDutyInput,
  resolvedL,
  selectedPartsOrNull,
  type StudentDesign,
} from './buildParams.ts'

export type DesignStage =
  | 'duty'
  | 'frequency'
  | 'inductor'
  | 'capacitor'
  | 'mosfet'
  | 'diode'
  | 'thermals'
  | 'loadStep'
  | 'lineStep'
  | 'review'

const STAGES: { id: DesignStage; title: string; highlight: CircuitHighlight[] }[] = [
  { id: 'duty', title: '1. Duty cycle', highlight: ['vin', 'switch'] },
  { id: 'frequency', title: '2. Switching frequency', highlight: ['switch'] },
  { id: 'inductor', title: '3. Inductor', highlight: ['inductor'] },
  { id: 'capacitor', title: '4. Output capacitor', highlight: ['capacitor'] },
  { id: 'mosfet', title: '5. MOSFET', highlight: ['switch'] },
  { id: 'diode', title: '6. Diode', highlight: ['diode'] },
  { id: 'thermals', title: '7. Power and thermals', highlight: ['switch', 'diode', 'inductor'] },
  { id: 'loadStep', title: '8. Load transient', highlight: ['capacitor', 'load', 'inductor'] },
  { id: 'lineStep', title: '9. Line transient', highlight: ['vin'] },
  { id: 'review', title: '10. Design review', highlight: [] },
]

const FREQS = [20_000, 100_000, 500_000, 2_000_000]

type Trend = 'up' | 'down' | 'same'

const FS_KEYS = [
  { id: 'vout', label: 'Average VOUT', correct: 'same' as Trend },
  { id: 'ilRipple', label: 'Inductor current ripple', correct: 'down' as Trend },
  { id: 'vRipple', label: 'Output voltage ripple', correct: 'down' as Trend },
  { id: 'size', label: 'Required L and C size', correct: 'down' as Trend },
  { id: 'sw', label: 'Switching losses', correct: 'up' as Trend },
] as const

const MOSFET_PROPS = [
  { id: 'vds', label: 'Voltage rating above VIN', correct: true },
  { id: 'id', label: 'Current rating above IL,peak', correct: true },
  { id: 'thermal', label: 'Thermal margin for the losses', correct: true },
  { id: 'color', label: 'Package color', correct: false },
]

const LOAD_QS = [
  { id: 'il', prompt: 'Can inductor current jump instantaneously?', yes: false },
  { id: 'vc', prompt: 'Can capacitor voltage jump instantaneously?', yes: false },
  { id: 'from', prompt: 'Does the extra load current initially come from the capacitor?', yes: true },
  { id: 'vout', prompt: 'Should VOUT droop at the instant of the step?', yes: true },
]

interface DesignTabProps {
  params: BuckParams
  instant: Instant
  history: Instant[]
  reducedMotion: boolean
  onPatch: (patch: Partial<BuckParams>) => void
  onScrub: (sample: Instant | null) => void
  onScrubEnd: () => void
  onPause: () => void
  onShowMosfet: (on: boolean) => void
}

export function DesignTab({
  params,
  instant,
  history,
  reducedMotion,
  onPatch,
  onScrub,
  onScrubEnd,
  onPause,
  onShowMosfet,
}: DesignTabProps) {
  const req = DESIGN_REQUIREMENTS
  const [stage, setStage] = useState<DesignStage>('duty')
  const [design, setDesign] = useState<StudentDesign>(EMPTY_DESIGN)
  const [done, setDone] = useState<Partial<Record<DesignStage, boolean>>>({})
  const [dutyRaw, setDutyRaw] = useState('')
  const [dutyLocked, setDutyLocked] = useState(false)
  const [fsGuess, setFsGuess] = useState<Record<string, Trend | ''>>({})
  const [fsLocked, setFsLocked] = useState(false)
  const [satGuess, setSatGuess] = useState<'up' | 'down' | 'same' | ''>('')
  const [mosProps, setMosProps] = useState<string[]>([])
  const [mosLocked, setMosLocked] = useState(false)
  const [diodeWhen, setDiodeWhen] = useState<'off' | 'on' | 'always' | ''>('')
  const [loadAns, setLoadAns] = useState<Record<string, boolean | null>>({})
  const [loadLocked, setLoadLocked] = useState(false)
  const [lineGuess, setLineGuess] = useState<'up' | 'down' | 'same' | ''>('')
  const [lineLocked, setLineLocked] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [captured, setCaptured] = useState<Instant[] | null>(null)
  const [loadStep, setLoadStep] = useState<LoadStepResult | null>(null)
  const [lineStep, setLineStep] = useState<LineStepResult | null>(null)
  const [review, setReview] = useState<DesignReview | null>(null)
  const [simSig, setSimSig] = useState('')
  const [playIdx, setPlayIdx] = useState(0)
  const [playingTransient, setPlayingTransient] = useState(false)
  const [luH, setLuH] = useState('')

  useEffect(() => {
    onPause()
    onShowMosfet(true)
    onPatch(designToParams(EMPTY_DESIGN))
    return () => onPatch(baseIdealParams())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stageIndex = STAGES.findIndex((item) => item.id === stage)
  const canOpen = (id: DesignStage) => {
    const idx = STAGES.findIndex((item) => item.id === id)
    if (idx <= 0) return true
    return Boolean(done[STAGES[idx - 1].id])
  }

  const resultMetrics = done[stage] && simSig === designSignature(design) ? metrics : null
  const hideReadouts = !resultMetrics
  const liveParams = designToParams(design)
  const inductor = chosenInductor(design)
  const capacitor = chosenCapacitor(design)
  const mosfet = chosenMosfet(design)
  const diode = chosenDiode(design)
  const L = resolvedL(design)
  const deltaIlTarget = design.ripplePct ? targetInductorRipple(req.iOutMax, design.ripplePct) : null
  const lSuggested =
    design.duty && design.fs && deltaIlTarget
      ? designInductance(req.vin, req.vOutTarget, design.duty, design.fs, deltaIlTarget)
      : null
  const cSuggested = (() => {
    if (!design.duty || !design.fs || !L) return null
    const di = predictedDeltaIl({ vin: req.vin, duty: design.duty, L, fs: design.fs }, req.vOutTarget)
    return designCapacitance(di, design.fs, req.rippleVmax)
  })()

  const unsetParts: UnsetPart[] = []
  if (!design.mosfetId) unsetParts.push('switch')
  if (!design.diodeId) unsetParts.push('diode')
  if (!inductor && !L) unsetParts.push('inductor')
  if (!capacitor) unsetParts.push('capacitor')

  const displayHistory = useMemo(() => {
    if (stage === 'loadStep' && loadStep) return loadStep.history
    if (stage === 'lineStep' && lineStep) return lineStep.history
    return captured ?? history
  }, [captured, history, lineStep, loadStep, stage])

  const displayInstant = useMemo(() => {
    if ((stage === 'loadStep' && loadStep) || (stage === 'lineStep' && lineStep)) {
      return displayHistory[Math.min(playIdx, displayHistory.length - 1)] ?? instant
    }
    return instant
  }, [displayHistory, instant, lineStep, loadStep, playIdx, stage])

  const displayParams =
    stage === 'loadStep' && loadStep
      ? { ...liveParams, R: req.vOutTarget / 2 }
      : stage === 'lineStep' && lineStep
        ? { ...liveParams, vin: 15 }
        : params

  useEffect(() => {
    if (!playingTransient) return
    if (reducedMotion) {
      setPlayIdx(displayHistory.length - 1)
      setPlayingTransient(false)
      return
    }
    const id = window.setInterval(() => {
      setPlayIdx((idx) => {
        if (idx >= displayHistory.length - 1) {
          setPlayingTransient(false)
          return idx
        }
        return idx + Math.max(1, Math.round(displayHistory.length / 180))
      })
    }, 40)
    return () => window.clearInterval(id)
  }, [displayHistory.length, playingTransient, reducedMotion])

  const runSteady = (next: StudentDesign = design) => {
    const nextParams = designToParams(next)
    const settled = settleSimulation(nextParams)
    setMetrics(settled.metrics)
    setCaptured(settled.history)
    setSimSig(designSignature(next))
    onPatch(nextParams)
    setDone((prev) => ({ ...prev, [stage]: true }))
    return settled
  }

  const wavesForStage = (): WaveformId[] => {
    if (stage === 'inductor') return ['vL', 'iL']
    if (stage === 'capacitor') return ['iL', 'iC', 'vOUT']
    if (stage === 'loadStep') return ['iLOAD', 'iL', 'iC', 'vOUT']
    if (stage === 'lineStep') return ['vOUT', 'iL']
    if (stage === 'thermals' || stage === 'review') return ['iL', 'iC', 'vOUT']
    return ['pwm', 'vSW', 'iL', 'vOUT']
  }

  const heat =
    (stage === 'thermals' || stage === 'review') && resultMetrics
      ? {
          switch: Math.min(1, (resultMetrics.losses.mosfetConduction + resultMetrics.losses.switching) / 2),
          diode: Math.min(1, resultMetrics.losses.diode / 2),
        }
      : undefined

  const patchDesign = (partial: Partial<StudentDesign>) => {
    setDesign((prev) => ({ ...prev, ...partial }))
    setReview(null)
  }

  return (
    <div className="design">
      <aside className="design-rail" aria-label="Requirements and decisions">
        <p className="eq-kicker">Requirements</p>
        <h2>Design a buck converter</h2>
        <dl className="req-card">
          <div><dt>VIN</dt><dd>12 V</dd></div>
          <div><dt>VOUT target</dt><dd>5 V</dd></div>
          <div><dt>IOUT,max</dt><dd>2 A</dd></div>
          <div><dt>ΔVOUT,max</dt><dd>50 mV</dd></div>
          <div><dt>ΔiL target</dt><dd>20–40% of 2 A</dd></div>
          <div><dt>Efficiency</dt><dd>&gt; 90%</dd></div>
          <div><dt>Ambient</dt><dd>25 °C</dd></div>
        </dl>
        <p className="hint">Component values start blank. You choose them. Bad designs are allowed.</p>
        <ol className="design-steps">
          {STAGES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === stage ? 'on' : ''}
                disabled={!canOpen(item.id)}
                onClick={() => setStage(item.id)}
              >
                {item.title}
                {done[item.id] ? ' · done' : ''}
              </button>
            </li>
          ))}
        </ol>
        <DecisionList design={design} L={L} />
      </aside>

      <div className="design-center">
        <CircuitSvg
          instant={displayInstant}
          params={displayParams}
          showMosfet
          highlights={STAGES[stageIndex]?.highlight ?? []}
          reducedMotion={reducedMotion}
          unsetParts={unsetParts}
          hideReadouts={hideReadouts && stage !== 'loadStep' && stage !== 'lineStep'}
          heat={heat}
        />
        {displayHistory.length > 1 && (resultMetrics || loadStep || lineStep) ? (
          <Waveforms
            history={displayHistory}
            instant={displayInstant}
            enabled={wavesForStage()}
            hideToggles
            markers={
              loadStep
                ? [{ t: loadStep.stepTime, label: 'load step' }]
                : []
            }
            onToggle={() => undefined}
            onScrub={(sample) => {
              if (stage === 'loadStep' || stage === 'lineStep') {
                if (!sample) return
                const idx = displayHistory.findIndex((item) => item.t === sample.t)
                if (idx >= 0) setPlayIdx(idx)
                return
              }
              onScrub(sample)
            }}
            onScrubEnd={onScrubEnd}
          />
        ) : (
          <p className="hint">Waveforms appear after you commit a prediction and run the numerical model.</p>
        )}
      </div>

      <section className="design-coach" aria-label="Current design stage">
        {stage === 'duty' ? (
          <DutyStage
            raw={dutyRaw}
            locked={dutyLocked}
            design={design}
            metrics={resultMetrics}
            onRaw={setDutyRaw}
            onCommit={() => {
              const duty = parseDutyInput(dutyRaw)
              if (duty === null) return
              setDutyLocked(true)
              const next = { ...design, duty }
              setDesign(next)
            }}
            onSim={() => {
              if (design.duty === null) return
              runSteady()
            }}
            onReset={() => {
              setDutyLocked(false)
              patchDesign({ duty: null })
              setDutyRaw('')
            }}
          />
        ) : null}

        {stage === 'frequency' ? (
          <FrequencyStage
            design={design}
            guesses={fsGuess}
            locked={fsLocked}
            metrics={resultMetrics}
            onPick={(fs) => patchDesign({ fs })}
            onGuess={(id, value) => setFsGuess((prev) => ({ ...prev, [id]: value }))}
            onLock={() => setFsLocked(true)}
            onSim={() => runSteady()}
          />
        ) : null}

        {stage === 'inductor' ? (
          <InductorStage
            design={design}
            luH={luH}
            lSuggested={lSuggested}
            deltaIlTarget={deltaIlTarget}
            satGuess={satGuess}
            metrics={resultMetrics}
            onLuH={setLuH}
            onRipple={(ripplePct) => patchDesign({ ripplePct })}
            onPick={(id) => patchDesign({ inductorId: id })}
            onSatPhysics={(on) => {
              const next = { ...design, satPhysics: on }
              setDesign(next)
              runSteady(next)
            }}
            onSatGuess={setSatGuess}
            onSim={() => {
              const next = {
                ...design,
                customLuH: design.inductorId ? design.customLuH : luH,
              }
              setDesign(next)
              runSteady(next)
            }}
          />
        ) : null}

        {stage === 'capacitor' ? (
          <CapacitorStage
            design={design}
            cSuggested={cSuggested}
            metrics={resultMetrics}
            onPick={(id) => patchDesign({ capacitorId: id })}
            onSim={() => runSteady()}
          />
        ) : null}

        {stage === 'mosfet' ? (
          <MosfetStage
            design={design}
            picked={mosProps}
            locked={mosLocked}
            metrics={resultMetrics}
            onToggle={(id) =>
              setMosProps((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
            }
            onLock={() => setMosLocked(true)}
            onPick={(id) => patchDesign({ mosfetId: id })}
            onSim={() => runSteady()}
          />
        ) : null}

        {stage === 'diode' ? (
          <DiodeStage
            design={design}
            when={diodeWhen}
            metrics={resultMetrics}
            onWhen={setDiodeWhen}
            onPick={(id) => patchDesign({ diodeId: id })}
            onSim={() => runSteady()}
          />
        ) : null}

        {stage === 'thermals' ? (
          <ThermalStage
            design={design}
            metrics={resultMetrics}
            onRun={() => runSteady()}
          />
        ) : null}

        {stage === 'loadStep' ? (
          <LoadStage
            answers={loadAns}
            locked={loadLocked}
            result={loadStep}
            onAnswer={(id, yes) => setLoadAns((prev) => ({ ...prev, [id]: yes }))}
            onLock={() => setLoadLocked(true)}
            onRun={() => {
              const result = runLoadStep(designToParams(design, 0.5), 0.5, 2, req.vOutTarget)
              setLoadStep(result)
              setPlayIdx(Math.max(0, result.history.findIndex((s) => s.t >= result.stepTime)))
              setPlayingTransient(false)
              setDone((prev) => ({ ...prev, loadStep: true }))
            }}
            onPlay={() => {
              if (!loadStep) return
              setPlayIdx(Math.max(0, loadStep.history.findIndex((s) => s.t >= loadStep.stepTime)))
              setPlayingTransient(true)
            }}
          />
        ) : null}

        {stage === 'lineStep' ? (
          <LineStage
            guess={lineGuess}
            locked={lineLocked}
            result={lineStep}
            duty={design.duty}
            onGuess={setLineGuess}
            onLock={() => setLineLocked(true)}
            onRun={() => {
              const result = runLineStep(designToParams(design), 15)
              setLineStep(result)
              setPlayIdx(0)
              setPlayingTransient(true)
              setDone((prev) => ({ ...prev, lineStep: true }))
            }}
          />
        ) : null}

        {stage === 'review' ? (
          <ReviewStage
            design={design}
            metrics={resultMetrics}
            review={review}
            L={L}
            onEvaluate={() => {
              const parts = selectedPartsOrNull(design)
              if (!parts) return
              const settled = runSteady()
              setReview(evaluateDesign(req, designToParams(design), settled.metrics, parts))
              setDone((prev) => ({ ...prev, review: true }))
            }}
          />
        ) : null}

        {stageIndex < STAGES.length - 1 && done[stage] ? (
          <button type="button" onClick={() => setStage(STAGES[stageIndex + 1].id)}>
            Next: {STAGES[stageIndex + 1].title}
          </button>
        ) : null}
      </section>
    </div>
  )
}

function DecisionList({ design, L }: { design: StudentDesign; L: number | null }) {
  return (
    <ul className="decision-list">
      <li>D {design.duty === null ? '—' : formatFixed(design.duty, 3)}</li>
      <li>fS {design.fs === null ? '—' : formatSi(design.fs, 'Hz')}</li>
      <li>L {L === null ? '—' : formatSi(L, 'H')}</li>
      <li>C {chosenCapacitor(design) ? formatSi(chosenCapacitor(design)!.C, 'F') : '—'}</li>
      <li>MOSFET {chosenMosfet(design)?.name ?? '—'}</li>
      <li>Diode {chosenDiode(design)?.name ?? '—'}</li>
    </ul>
  )
}

function DutyStage({
  raw,
  locked,
  design,
  metrics,
  onRaw,
  onCommit,
  onSim,
  onReset,
}: {
  raw: string
  locked: boolean
  design: StudentDesign
  metrics: Metrics | null
  onRaw: (value: string) => void
  onCommit: () => void
  onSim: () => void
  onReset: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const predicted = design.duty === null ? null : predictedVout(req.vin, design.duty)
  const textbook = suggestedDuty(req.vin, req.vOutTarget)
  return (
    <>
      <p className="eq-kicker">Stage 1</p>
      <h2>What duty cycle would you start with?</h2>
      <p>Do not look up a canned number. Commit a duty, then we will test it on the same time-domain model used in the rest of BuckLab.</p>
      <label className="design-field">
        Duty cycle D
        <input
          value={raw}
          disabled={locked}
          inputMode="decimal"
          placeholder="0 to 1, or percent"
          onChange={(event) => onRaw(event.target.value)}
        />
      </label>
      {!locked ? (
        <button type="button" disabled={parseDutyInput(raw) === null} onClick={onCommit}>
          Commit duty
        </button>
      ) : (
        <>
          <p>
            You chose D = {formatFixed(design.duty ?? 0, 3)}. Your implied VOUT is D·VIN = {formatFixed(predicted ?? 0, 2, 'V')}.
          </p>
          <p>
            In ideal CCM, volt-second balance on the inductor gives ∫ vL dt = 0 over a period, which rearranges to
            VOUT ≈ D VIN, so D ≈ VOUT / VIN = 5/12 ≈ {formatFixed(textbook, 3)}. That is an initial estimate, not a universal law.
            Diode drop, DCM, and losses move the real average.
          </p>
          {!metrics ? (
            <button type="button" onClick={onSim}>Run simulation</button>
          ) : (
            <Compare
              predicted={predicted ?? 0}
              simulated={metrics.vOutAvg}
              unit="V"
              label="VOUT"
            />
          )}
          <button type="button" className="ghost" onClick={onReset}>Choose a different D</button>
        </>
      )}
    </>
  )
}

function FrequencyStage({
  design,
  guesses,
  locked,
  metrics,
  onPick,
  onGuess,
  onLock,
  onSim,
}: {
  design: StudentDesign
  guesses: Record<string, Trend | ''>
  locked: boolean
  metrics: Metrics | null
  onPick: (fs: number) => void
  onGuess: (id: string, value: Trend) => void
  onLock: () => void
  onSim: () => void
}) {
  const allGuessed = FS_KEYS.every((item) => guesses[item.id])
  return (
    <>
      <p className="eq-kicker">Stage 2</p>
      <h2>Choose a switching frequency</h2>
      <p>There is no universally correct fS. You are trading magnetics size against switching loss and layout difficulty.</p>
      <div className="choice-row">
        {FREQS.map((fs) => (
          <button key={fs} type="button" className={design.fs === fs ? 'on' : ''} onClick={() => onPick(fs)}>
            {formatSi(fs, 'Hz')}
          </button>
        ))}
      </div>
      <h3>If fS increases while D stays constant, what happens?</h3>
      {FS_KEYS.map((item) => (
        <TrendRow
          key={item.id}
          label={item.label}
          value={guesses[item.id] ?? ''}
          locked={locked}
          correct={item.correct}
          onPick={(value) => onGuess(item.id, value)}
        />
      ))}
      {!locked ? (
        <button type="button" disabled={!allGuessed || design.fs === null} onClick={onLock}>
          Commit predictions
        </button>
      ) : (
        <>
          <div className="tradeoff-grid">
            <article>
              <h3>Higher fS</h3>
              <p>+ smaller L and C for the same ripple</p>
              <p>+ smaller ripple for fixed L and C</p>
              <p>− more switching events per second</p>
              <p>− potentially higher switching loss</p>
              <p>− greater EMI and layout difficulty</p>
            </article>
            <article>
              <h3>Lower fS</h3>
              <p>+ potentially lower switching losses</p>
              <p>− larger passive components</p>
              <p>− larger ripple for fixed L and C</p>
            </article>
          </div>
          <p>
            Average VOUT stays near D·VIN because duty, not frequency, sets the volt-second ratio.
            ΔiL = (VIN − VOUT) D / (L fS) falls as fS rises.
          </p>
          {!metrics ? <button type="button" onClick={onSim}>Simulate this frequency</button> : (
            <p>
              Simulated VOUT {formatFixed(metrics.vOutAvg, 2, 'V')} · ΔiL {formatFixed(metrics.iLpkpk, 3, 'A')} ·
              edges at {formatSi(metrics.fs, 'Hz')}.
            </p>
          )}
        </>
      )}
    </>
  )
}

function InductorStage({
  design,
  luH,
  lSuggested,
  deltaIlTarget,
  satGuess,
  metrics,
  onLuH,
  onRipple,
  onPick,
  onSatPhysics,
  onSatGuess,
  onSim,
}: {
  design: StudentDesign
  luH: string
  lSuggested: number | null
  deltaIlTarget: number | null
  satGuess: 'up' | 'down' | 'same' | ''
  metrics: Metrics | null
  onLuH: (value: string) => void
  onRipple: (value: number) => void
  onPick: (id: string) => void
  onSatPhysics: (on: boolean) => void
  onSatGuess: (value: 'up' | 'down' | 'same') => void
  onSim: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const L = resolvedL(design) ?? parseFloat(luH) * 1e-6
  const pred = design.duty && design.fs && Number.isFinite(L) && L > 0
    ? predictedDeltaIl({ vin: req.vin, duty: design.duty, L, fs: design.fs }, req.vOutTarget)
    : null
  const peak = pred !== null ? peakInductorCurrent(req.iOutMax, pred) : null
  const iMin = pred !== null ? minInductorCurrent(req.iOutMax, pred) : null
  const part = chosenInductor(design)
  const sat = peak !== null && part ? inductorSaturated(peak, part.isat) : false

  return (
    <>
      <p className="eq-kicker">Stage 3</p>
      <h2>Design the inductor</h2>
      <p>From vL = L diL/dt during ON: VIN − VOUT = L ΔiL / (D / fS). Rearranged:</p>
      <p className="eq-line">L = (VIN − VOUT) D / (fS ΔiL)</p>
      <p>Target ripple as a fraction of IOUT,max = 2 A.</p>
      <div className="choice-row">
        {[0.2, 0.3, 0.4].map((pct) => (
          <button key={pct} type="button" className={design.ripplePct === pct ? 'on' : ''} onClick={() => onRipple(pct)}>
            {(pct * 100).toFixed(0)}%
          </button>
        ))}
      </div>
      {deltaIlTarget && lSuggested ? (
        <p>
          ΔiL,target = {formatFixed(deltaIlTarget, 2, 'A')}. For your D and fS the equation wants
          L ≈ {formatSi(lSuggested, 'H')}. Enter a value or pick a real part — including ones that are too small.
        </p>
      ) : null}
      <label className="design-field">
        L (µH)
        <input value={luH} inputMode="decimal" onChange={(event) => onLuH(event.target.value)} placeholder="e.g. 47" />
      </label>
      <div className="part-grid">
        {INDUCTORS.map((item) => (
          <button key={item.id} type="button" className={design.inductorId === item.id ? 'on' : ''} onClick={() => onPick(item.id)}>
            <strong>{item.name}</strong>
            <span>DCR {formatFixed(item.dcr * 1000, 0, 'mΩ')} · Isat {formatFixed(item.isat, 1, 'A')}</span>
            <em>{item.note}</em>
          </button>
        ))}
      </div>
      <button type="button" disabled={!(Number(luH) > 0 || design.inductorId)} onClick={onSim}>
        Simulate inductor
      </button>
      {metrics && pred !== null && peak !== null && iMin !== null ? (
        <>
          <Compare predicted={pred} simulated={metrics.iLpkpk} unit="A" label="ΔiL" />
          <p>
            IL,peak = IOUT + ΔiL/2 = {formatFixed(peak, 2, 'A')}.
            IL,min = IOUT − ΔiL/2 = {formatFixed(iMin, 2, 'A')}.
            Peak sets saturation and MOSFET/diode current. Min crossing zero is the CCM/DCM boundary.
          </p>
          {part && sat ? (
            <p className="sat-flag">INDUCTOR SATURATION — IL,peak {formatFixed(Math.max(peak, metrics.iLmax), 2, 'A')} &gt; Isat {formatFixed(part.isat, 2, 'A')}</p>
          ) : null}
          {part ? (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={design.satPhysics}
                onChange={(event) => onSatPhysics(event.target.checked)}
              />
              Advanced physics: collapse L once iL exceeds Isat
            </label>
          ) : null}
          <h3>If L suddenly becomes smaller while vL stays similar, what happens to di/dt?</h3>
          <TrendRow label="diL/dt" value={satGuess} locked={Boolean(satGuess)} correct="up" onPick={onSatGuess} />
          {satGuess ? (
            <p>
              vL = L diL/dt, so di/dt = vL / L. A saturating core shrinks L, the slope steepens, and current runs away.
              That is why Isat is a rating, not a suggestion.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  )
}

function CapacitorStage({
  design,
  cSuggested,
  metrics,
  onPick,
  onSim,
}: {
  design: StudentDesign
  cSuggested: number | null
  metrics: Metrics | null
  onPick: (id: string) => void
  onSim: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const L = resolvedL(design)
  const pred = design.duty && design.fs && L && chosenCapacitor(design)
    ? predictedDeltaVout(
        predictedDeltaIl({ vin: req.vin, duty: design.duty, L, fs: design.fs }, req.vOutTarget),
        chosenCapacitor(design)!.C,
        design.fs,
        chosenCapacitor(design)!.esr,
      )
    : null
  const cap = chosenCapacitor(design)
  const di = design.duty && design.fs && L
    ? predictedDeltaIl({ vin: req.vin, duty: design.duty, L, fs: design.fs }, req.vOutTarget)
    : null

  return (
    <>
      <p className="eq-kicker">Stage 4</p>
      <h2>Design the output capacitor</h2>
      <p>The triangle on iC integrates to a small voltage bow. Ideal CCM:</p>
      <p className="eq-line">ΔVOUT ≈ ΔiL / (8 fS C)  →  C ≈ ΔiL / (8 fS ΔVOUT)</p>
      {cSuggested ? (
        <p>For ΔVOUT = 50 mV the capacitance term wants C ≈ {formatSi(cSuggested, 'F')}. That is not the whole story.</p>
      ) : null}
      <p>ESR adds ΔVESR ≈ ΔiL · ESR. A huge capacitor with sloppy ESR can still miss 50 mV.</p>
      <div className="part-grid">
        {CAPACITORS.map((item) => (
          <button key={item.id} type="button" className={design.capacitorId === item.id ? 'on' : ''} onClick={() => onPick(item.id)}>
            <strong>{item.name}</strong>
            <span>ESR {formatFixed(item.esr * 1000, 1, 'mΩ')} · {formatFixed(item.vRated, 1, 'V')}</span>
            <em>{item.note}</em>
          </button>
        ))}
      </div>
      <button type="button" disabled={!design.capacitorId} onClick={onSim}>Simulate capacitor</button>
      {metrics && pred !== null && cap && di !== null ? (
        <>
          <Compare predicted={pred} simulated={metrics.vOutPkpk} unit="V" label="ΔVOUT" />
          <p>
            Capacitance term {formatFixed(predictedDeltaVout(di, cap.C, design.fs ?? 0, 0) * 1000, 1, 'mV')},
            ESR term {formatFixed(di * cap.esr * 1000, 1, 'mV')}.
            Voltage rating {formatFixed(cap.vRated, 1, 'V')} vs VOUT target 5 V.
          </p>
        </>
      ) : null}
    </>
  )
}

function MosfetStage({
  design,
  picked,
  locked,
  metrics,
  onToggle,
  onLock,
  onPick,
  onSim,
}: {
  design: StudentDesign
  picked: string[]
  locked: boolean
  metrics: Metrics | null
  onToggle: (id: string) => void
  onLock: () => void
  onPick: (id: string) => void
  onSim: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const part = chosenMosfet(design)
  const L = resolvedL(design)
  const di = design.duty && design.fs && L
    ? predictedDeltaIl({ vin: req.vin, duty: design.duty, L, fs: design.fs }, req.vOutTarget)
    : 0.6
  return (
    <>
      <p className="eq-kicker">Stage 5</p>
      <h2>Select a MOSFET</h2>
      <p>It is no longer an ideal switch. What properties actually matter for this converter?</p>
      <div className="choice-row">
        {MOSFET_PROPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={picked.includes(item.id) ? 'on' : ''}
            disabled={locked}
            onClick={() => onToggle(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {!locked ? (
        <button type="button" disabled={picked.length === 0} onClick={onLock}>Commit what matters</button>
      ) : (
        <p>
          It needs voltage rating, current rating, and thermal margin.
          Package color does not enter vDS, iD, or P = I²R. The gate is also not free: Qg must be charged every cycle,
          but we are not designing the gate driver yet.
        </p>
      )}
      <div className="part-grid">
        {MOSFETS.map((item) => (
          <button key={item.id} type="button" className={design.mosfetId === item.id ? 'on' : ''} onClick={() => onPick(item.id)}>
            <strong>{item.name}</strong>
            <span>VDS {item.vdsMax} V · ID {item.idMax} A · RDS(on) {formatFixed(item.rdsOn * 1000, 0, 'mΩ')}</span>
            <span>Qg {formatFixed(item.qg * 1e9, 0, 'nC')} · tr+tf {formatFixed((item.tr + item.tf) * 1e9, 0, 'ns')}</span>
            <em>{item.note}</em>
          </button>
        ))}
      </div>
      {part ? (
        <p className="eq-line">
          Pcond ≈ IRMS² RDS(on) D = {formatFixed(mosfetConductionLossApprox(req.iOutMax, part.rdsOn, design.duty ?? 5 / 12), 3, 'W')}
          {' · '}
          Psw ≈ ½ VIN I (tr+tf) fS = {formatFixed(switchingLossApprox(req.vin, req.iOutMax, part.tr + part.tf, design.fs ?? 100_000), 3, 'W')}
        </p>
      ) : null}
      <p>Lower RDS(on) cuts conduction loss. Higher fS multiplies switching events. Peak current ≈ {formatFixed(peakInductorCurrent(req.iOutMax, di), 2, 'A')}.</p>
      <button type="button" disabled={!locked || !design.mosfetId} onClick={onSim}>Simulate with this MOSFET</button>
      {metrics && part ? (
        <p>
          Simulated conduction {formatFixed(metrics.losses.mosfetConduction, 3, 'W')},
          switching {formatFixed(metrics.losses.switching, 3, 'W')}.
        </p>
      ) : null}
    </>
  )
}

function DiodeStage({
  design,
  when,
  metrics,
  onWhen,
  onPick,
  onSim,
}: {
  design: StudentDesign
  when: 'off' | 'on' | 'always' | ''
  metrics: Metrics | null
  onWhen: (value: 'off' | 'on' | 'always') => void
  onPick: (id: string) => void
  onSim: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const part = chosenDiode(design)
  return (
    <>
      <p className="eq-kicker">Stage 6</p>
      <h2>Select a diode</h2>
      <p>When does the diode conduct?</p>
      <div className="choice-row">
        <button type="button" className={when === 'off' ? 'on' : ''} disabled={Boolean(when)} onClick={() => onWhen('off')}>MOSFET OFF</button>
        <button type="button" className={when === 'on' ? 'on' : ''} disabled={Boolean(when)} onClick={() => onWhen('on')}>MOSFET ON</button>
        <button type="button" className={when === 'always' ? 'on' : ''} disabled={Boolean(when)} onClick={() => onWhen('always')}>Always</button>
      </div>
      {when ? (
        <p>
          {when === 'off' ? 'Correct. ' : 'Not quite. '}
          When the MOSFET opens, inductor current cannot stop. The diode is the freewheel path:
          ground → diode → L → output.
        </p>
      ) : null}
      <div className="part-grid">
        {DIODES.map((item) => (
          <button key={item.id} type="button" className={design.diodeId === item.id ? 'on' : ''} onClick={() => onPick(item.id)}>
            <strong>{item.name}</strong>
            <span>VF {formatFixed(item.vf, 2, 'V')} · IF {item.ifMax} A · VR {item.vrMax} V</span>
            <span>recovery {item.recovery}</span>
            <em>{item.note}</em>
          </button>
        ))}
      </div>
      {part ? (
        <p>
          PD ≈ VF IOUT (1 − D) = {formatFixed(diodeLossApprox(part.vf, req.iOutMax, design.duty ?? 5 / 12), 3, 'W')}.
          Reverse rating must safely exceed the voltage across the diode when the MOSFET is ON — about VIN.
        </p>
      ) : null}
      <button type="button" disabled={!when || !design.diodeId} onClick={onSim}>Simulate this diode</button>
      {metrics ? <p>Simulated diode loss {formatFixed(metrics.losses.diode, 3, 'W')} · η {formatFixed(metrics.efficiency, 1)}%.</p> : null}
      {metrics ? (
        <div className="sync-note">
          <h3>Synchronous buck</h3>
          <p>
            A second MOSFET can replace the diode. You trade VF·I·(1−D) for I²RDS(on)·(1−D), which is usually smaller.
            BuckLab does not simulate that rectifier yet — this is why engineers leave the asynchronous topology.
          </p>
        </div>
      ) : null}
    </>
  )
}

function ThermalStage({
  design,
  metrics,
  onRun,
}: {
  design: StudentDesign
  metrics: Metrics | null
  onRun: () => void
}) {
  const req = DESIGN_REQUIREMENTS
  const mos = chosenMosfet(design)
  const dio = chosenDiode(design)
  if (!metrics) {
    return (
      <>
        <p className="eq-kicker">Stage 7</p>
        <h2>Power and thermals</h2>
        <p>Combine the losses from the parts you chose. First-order only: TJ ≈ TA + Ploss · θJA.</p>
        <button type="button" onClick={onRun}>Run loss budget</button>
      </>
    )
  }
  const pMos = metrics.losses.mosfetConduction + metrics.losses.switching
  const tjFet = mos ? junctionTemp(req.ta, pMos, mos.thetaJa) : null
  const tjDio = dio ? junctionTemp(req.ta, metrics.losses.diode, dio.thetaJa) : null
  const bars = [
    { label: 'POUT', w: metrics.pOut, c: '#3d6b58' },
    { label: 'MOS cond', w: metrics.losses.mosfetConduction, c: '#c4622a' },
    { label: 'MOS sw', w: metrics.losses.switching, c: '#a8441f' },
    { label: 'Diode', w: metrics.losses.diode, c: '#2b5f8a' },
    { label: 'DCR', w: metrics.losses.dcr, c: '#5c574e' },
    { label: 'ESR', w: metrics.losses.esr, c: '#8a4b2f' },
  ]
  const max = Math.max(...bars.map((b) => b.w), 1e-6)
  return (
    <>
      <p className="eq-kicker">Stage 7</p>
      <h2>Power and thermals</h2>
      <p className="eq-line">
        POUT {formatFixed(metrics.pOut, 3, 'W')} · PIN {formatFixed(metrics.pIn, 3, 'W')} ·
        η {formatFixed(metrics.efficiency, 1)}% · losses {formatFixed(metrics.losses.total, 3, 'W')}
      </p>
      <p>PIN ≈ POUT + Ptotal loss. Efficiency = POUT / PIN. This is not a SPICE thermal model.</p>
      <ul className="energy-list">
        {bars.map((bar) => (
          <li key={bar.label}>
            <span>{bar.label}</span>
            <span className="loss-bar" style={{ width: `${(bar.w / max) * 100}%`, background: bar.c }} />
            <span>{formatFixed(bar.w, 3, 'W')}</span>
          </li>
        ))}
      </ul>
      <p>
        Ambient {req.ta} °C.
        MOSFET TJ ≈ {tjFet === null ? '—' : formatFixed(tjFet, 0, '°C')}.
        Diode TJ ≈ {tjDio === null ? '—' : formatFixed(tjDio, 0, '°C')}.
        Limit 125 °C. Components glow as their loss rises — a first-order engineering estimate only.
      </p>
    </>
  )
}

function LoadStage({
  answers,
  locked,
  result,
  onAnswer,
  onLock,
  onRun,
  onPlay,
}: {
  answers: Record<string, boolean | null>
  locked: boolean
  result: LoadStepResult | null
  onAnswer: (id: string, yes: boolean) => void
  onLock: () => void
  onRun: () => void
  onPlay: () => void
}) {
  const all = LOAD_QS.every((q) => answers[q.id] !== undefined && answers[q.id] !== null)
  return (
    <>
      <p className="eq-kicker">Stage 8</p>
      <h2>Load step · 0.5 A → 2 A</h2>
      <p>The converter will be frozen at the instant the load changes. Answer before it runs.</p>
      {LOAD_QS.map((q) => (
        <div key={q.id} className="q-mini">
          <p>{q.prompt}</p>
          <div className="choice-row">
            <button type="button" disabled={locked} className={answers[q.id] === true ? 'on' : ''} onClick={() => onAnswer(q.id, true)}>Yes</button>
            <button type="button" disabled={locked} className={answers[q.id] === false ? 'on' : ''} onClick={() => onAnswer(q.id, false)}>No</button>
          </div>
          {locked ? (
            <p className="hint">{answers[q.id] === q.yes ? 'Yes — ' : 'The useful answer: '}{q.yes ? 'yes.' : 'no.'}</p>
          ) : null}
        </div>
      ))}
      {!locked ? (
        <button type="button" disabled={!all} onClick={onLock}>Commit answers</button>
      ) : !result ? (
        <button type="button" onClick={onRun}>Freeze at the step, then simulate</button>
      ) : (
        <>
          <p className="eq-line">
            iL(0+) = iL(0−) = {formatFixed(result.tPlus.iL, 3, 'A')}
            {' · '}
            vC(0+) = vC(0−) = {formatFixed(result.tPlus.vC, 3, 'V')}
          </p>
          <p>
            Output KCL: iL = iC + iLOAD.
            Load jumped to {formatFixed(result.tPlus.iLoad, 2, 'A')} while iL stayed
            {formatFixed(result.tMinus.iL, 2, 'A')}, so iC became {formatFixed(result.tPlus.iC, 2, 'A')} — the capacitor supplies the deficit and VOUT starts to droop.
          </p>
          <button type="button" onClick={onPlay}>Play the transient slowly</button>
        </>
      )}
    </>
  )
}

function LineStage({
  guess,
  locked,
  result,
  duty,
  onGuess,
  onLock,
  onRun,
}: {
  guess: 'up' | 'down' | 'same' | ''
  locked: boolean
  result: LineStepResult | null
  duty: number | null
  onGuess: (value: 'up' | 'down' | 'same') => void
  onLock: () => void
  onRun: () => void
}) {
  return (
    <>
      <p className="eq-kicker">Stage 9</p>
      <h2>Line transient · VIN 12 V → 15 V</h2>
      <p>Duty cycle stays exactly where you left it. This is still open-loop.</p>
      <h3>What do you think happens to VOUT?</h3>
      <TrendRow label="VOUT" value={guess} locked={locked} correct="up" onPick={onGuess} />
      {!locked ? (
        <button type="button" disabled={!guess} onClick={onLock}>Commit prediction</button>
      ) : !result ? (
        <button type="button" onClick={onRun}>Simulate the line step</button>
      ) : (
        <>
          <Compare predicted={result.predictedAfter} simulated={result.metricsAfter.vOutAvg} unit="V" label="VOUT after VIN = 15 V" />
          <p>
            VOUT ≈ D VIN. D is still {formatFixed(duty ?? 0, 3)}, so the converter does not defend 5 V.
            That is the limitation of open-loop control.
          </p>
          <p>
            So how does a real buck hold 5 V? Feedback control measures VOUT and trims D.
            That is the next module — we are not implementing the compensator yet.
          </p>
        </>
      )}
    </>
  )
}

function ReviewStage({
  design,
  metrics,
  review,
  L,
  onEvaluate,
}: {
  design: StudentDesign
  metrics: Metrics | null
  review: DesignReview | null
  L: number | null
  onEvaluate: () => void
}) {
  const parts = selectedPartsOrNull(design)
  return (
    <>
      <p className="eq-kicker">Stage 10</p>
      <h2>Engineering design review</h2>
      <dl className="req-card">
        <div><dt>D</dt><dd>{design.duty === null ? '—' : formatFixed(design.duty, 3)}</dd></div>
        <div><dt>fS</dt><dd>{design.fs === null ? '—' : formatSi(design.fs, 'Hz')}</dd></div>
        <div><dt>L</dt><dd>{L === null ? '—' : formatSi(L, 'H')}</dd></div>
        <div><dt>Isat</dt><dd>{chosenInductor(design) ? formatFixed(chosenInductor(design)!.isat, 2, 'A') : '—'}</dd></div>
        <div><dt>DCR</dt><dd>{chosenInductor(design) ? formatFixed(chosenInductor(design)!.dcr * 1000, 0, 'mΩ') : '—'}</dd></div>
        <div><dt>C</dt><dd>{chosenCapacitor(design) ? formatSi(chosenCapacitor(design)!.C, 'F') : '—'}</dd></div>
        <div><dt>ESR</dt><dd>{chosenCapacitor(design) ? formatFixed(chosenCapacitor(design)!.esr * 1000, 1, 'mΩ') : '—'}</dd></div>
        <div><dt>MOSFET</dt><dd>{chosenMosfet(design)?.name ?? '—'}</dd></div>
        <div><dt>Diode</dt><dd>{chosenDiode(design)?.name ?? '—'}</dd></div>
      </dl>
      <button type="button" disabled={!parts} onClick={onEvaluate}>
        {parts ? 'Evaluate this design' : 'Select L, C, MOSFET, and diode first'}
      </button>
      {review && metrics ? (
        <>
          <ul className="review-metrics">
            <li>VOUT pred {formatFixed(review.predictedVout, 2, 'V')} / sim {formatFixed(review.simulatedVout, 2, 'V')}</li>
            <li>ΔiL pred {formatFixed(review.predictedDeltaIl, 3, 'A')} / sim {formatFixed(review.simulatedDeltaIl, 3, 'A')}</li>
            <li>ΔVOUT pred {formatFixed(review.predictedDeltaVout * 1000, 1, 'mV')} / sim {formatFixed(review.simulatedDeltaVout * 1000, 1, 'mV')}</li>
            <li>IL peak {formatFixed(review.iLpeak, 2, 'A')} · min {formatFixed(review.iLminSim, 2, 'A')} · {review.mode}</li>
            <li>η {formatPercent(review.efficiency, 1)} · losses {formatFixed(review.pTotalLoss, 3, 'W')}</li>
            <li>TJ MOSFET {formatFixed(review.tjFet, 0, '°C')} · diode {formatFixed(review.tjDiode, 0, '°C')}</li>
          </ul>
          <ul className="review-checks">
            {review.checks.map((check) => (
              <li key={check.id} className={check.status === 'PASS' ? 'is-pass' : 'is-fail'}>
                <strong>{check.status}</strong> {check.label}
                <p>{check.detail}</p>
              </li>
            ))}
          </ul>
          <p className={review.passed ? 'design-banner is-pass' : 'design-banner is-fail'}>
            {review.passed ? 'DESIGN PASSES' : 'DESIGN DOES NOT MEET REQUIREMENTS'}
          </p>
          {!review.passed ? (
            <p>Nothing was auto-corrected. Change a part on an earlier stage and evaluate again.</p>
          ) : null}
        </>
      ) : null}
    </>
  )
}

function Compare({
  predicted,
  simulated,
  unit,
  label,
}: {
  predicted: number
  simulated: number
  unit: string
  label: string
}) {
  return (
    <p className="compare-line">
      {label}: predicted {formatFixed(predicted, 3, unit)} vs simulated {formatFixed(simulated, 3, unit)}.
    </p>
  )
}

function TrendRow({
  label,
  value,
  locked,
  correct,
  onPick,
}: {
  label: string
  value: Trend | ''
  locked: boolean
  correct: Trend
  onPick: (value: Trend) => void
}) {
  const mark = locked && value ? (value === correct ? 'right' : 'wrong') : ''
  return (
    <div className={`trend-row ${mark}`}>
      <span>{label}</span>
      {(['down', 'same', 'up'] as Trend[]).map((item) => (
        <button
          key={item}
          type="button"
          className={value === item ? 'on' : ''}
          disabled={locked}
          onClick={() => onPick(item)}
        >
          {item === 'up' ? '↑' : item === 'down' ? '↓' : 'same'}
        </button>
      ))}
      {locked ? <em>{correct === 'up' ? 'rises' : correct === 'down' ? 'falls' : 'stays similar'}</em> : null}
    </div>
  )
}
