import { useEffect, useMemo, useState } from 'react'
import { settleSimulation } from '../sim/integrate.ts'
import { kvlOnResidual } from '../sim/physics.ts'
import { baseIdealParams } from '../sim/presets.ts'
import { idealCcmVout } from '../sim/formulas.ts'
import { idealVoltSecondTerms, voltSecondAreas } from '../sim/voltsecond.ts'
import type { BuckParams, Instant, WaveformId } from '../sim/types.ts'
import { CircuitSvg, type CircuitHighlight } from '../ui/CircuitSvg.tsx'
import { Waveforms } from '../ui/Waveforms.tsx'
import { Slider } from '../ui/Controls.tsx'
import { formatFixed, formatSi, signed } from '../ui/format.ts'
import { LAB_GROUPS, LABS, labById, type LabQuestion } from './catalog.ts'

interface LabsTabProps {
  params: BuckParams
  instant: Instant
  history: Instant[]
  showMosfet: boolean
  reducedMotion: boolean
  onPatch: (patch: Partial<BuckParams>) => void
  onRestore: (params: BuckParams) => void
  onScrub: (sample: Instant | null) => void
  onScrubEnd: () => void
  onPause: () => void
}

const INTACT: Partial<BuckParams> = {
  switchMode: 'pwm',
  hasDiode: true,
  hasInductor: true,
  hasCapacitor: true,
  startupFromZero: false,
}

export function LabsTab({
  params,
  instant,
  history,
  showMosfet,
  reducedMotion,
  onPatch,
  onRestore,
  onScrub,
  onScrubEnd,
  onPause,
}: LabsTabProps) {
  const [labId, setLabId] = useState(LABS[0].id)
  const [committed, setCommitted] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<CircuitHighlight[]>([])
  const [kclGuess, setKclGuess] = useState<string[]>([])
  const lab = labById(labId)
  const allAnswered = lab.questions.every((q) => committed[q.id])
  const allCorrect = lab.questions.every((q) => {
    const choice = q.choices.find((c) => c.id === committed[q.id])
    return choice?.correct
  })

  useEffect(() => {
    onPause()
    setCommitted({})
    setRevealed(false)
    setPicked([])
    setKclGuess([])
    onPatch({ ...baseIdealParams() })
    // Intentionally only when the experiment changes — not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId])

  const selectLab = (id: string) => {
    onPatch({ ...INTACT, L: 22e-6, C: 100e-6, R: 5, fs: 100_000, duty: 5 / 12, startupFromZero: false })
    setLabId(id)
  }

  const commit = (question: LabQuestion, choiceId: string) => {
    if (committed[question.id]) return
    setCommitted((prev) => ({ ...prev, [question.id]: choiceId }))
  }

  const reveal = () => {
    if (!allAnswered) return
    setRevealed(true)
    onPatch({ ...INTACT, ...baseIdealParams(), ...lab.patch })
  }

  return (
    <div className="labs">
      <aside className="lab-nav" aria-label="Concept labs">
        {LAB_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="lab-group">{group.title}</p>
            {LABS.filter((item) => item.group === group.id).map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === labId ? 'on' : ''}
                onClick={() => selectLab(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="lab-main">
        <p className="eq-kicker">{lab.tease}</p>
        <div className="lab-questions">
          {lab.questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              picked={committed[question.id]}
              onPick={(id) => commit(question, id)}
            />
          ))}
        </div>

        {!revealed ? (
          <button type="button" disabled={!allAnswered} onClick={reveal}>
            {allAnswered ? 'Run the numerical experiment' : 'Answer every question first'}
          </button>
        ) : (
          <p className="answer">{lab.reveal}</p>
        )}

        {revealed ? (
          <div className="layout-stack">
            <CircuitSvg
              instant={instant}
              params={params}
              showMosfet={showMosfet || lab.id === 'stuck-on'}
              highlights={picked}
              reducedMotion={reducedMotion}
              pickMode={lab.group === 'kvl'}
              onNodeClick={(id) => setPicked((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            />
            <Waveforms
              history={history}
              instant={instant}
              enabled={lab.traces as WaveformId[]}
              onToggle={() => undefined}
              hideToggles
              onScrub={onScrub}
              onScrubEnd={onScrubEnd}
            />
            {lab.id === 'kvl-on' ? <KvlBuilder instant={instant} vin={params.vin} picked={picked} /> : null}
            {lab.id === 'kcl-out' ? <KclBuilder instant={instant} guess={kclGuess} onGuess={setKclGuess} /> : null}
            {lab.id === 'voltsecond' ? <VoltSecondView history={history} params={params} vOut={instant.vOut} /> : null}
            {lab.id === 'duty-fs' ? <DutyFsCompare base={params} /> : null}
            {lab.id === 'boundary' ? (
              <BoundaryControls
                params={params}
                iLmin={Math.min(...history.map((s) => s.iL))}
                vOutAvg={instant.vOut}
                onR={(R) => onPatch({ R })}
              />
            ) : null}
            {lab.id === 'l-law' ? (
              <Slider
                label="Inductance L"
                value={Math.log10(params.L)}
                min={-6}
                max={-3.6}
                step={0.01}
                display={formatSi(params.L, 'H')}
                onChange={(logL) => onPatch({ L: 10 ** logL })}
              />
            ) : null}
            {lab.id === 'c-law' ? (
              <Slider
                label="Capacitance C"
                value={Math.log10(params.C)}
                min={-6}
                max={-3.2}
                step={0.01}
                display={formatSi(params.C, 'F')}
                onChange={(logC) => onPatch({ C: 10 ** logC })}
              />
            ) : null}
            {lab.id === 'energy' ? <EnergyGauges instant={instant} /> : null}
            {lab.id === 'l-law' ? (
              <p className="eq-line">
                v<sub>L</sub> = {formatFixed(instant.vL, 2, 'V')} → di<sub>L</sub>/dt = {formatSi(instant.diLdt, 'A/s')}
                {' · '}
                E<sub>L</sub> = ½Li<sub>L</sub>² = {formatFixed(instant.energyL * 1e6, 2)} µJ
                {instant.vL > 0.05 ? ' · energy entering the field' : instant.vL < -0.05 ? ' · energy leaving the field' : ' · energy idle'}
              </p>
            ) : null}
            {lab.id === 'c-law' ? (
              <p className="eq-line">
                i<sub>C</sub> = i<sub>L</sub> − i<sub>LOAD</sub> = {signed(instant.iC, 3)} A
                {' · '}
                dv<sub>C</sub>/dt = {formatSi(instant.dvOutdt, 'V/s')}
                {' · '}
                {instant.iC > 0 ? 'C charging, including possibly during OFF' : 'C discharging'}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="metric-hint">The simulator is paused until you commit. No canned animation will leak the answer.</p>
        )}

        {revealed && !allCorrect ? (
          <p className="hint">At least one prediction was wrong — that is the point. Compare it with the live numbers.</p>
        ) : null}

        <button type="button" className="ghost" onClick={() => onRestore(baseIdealParams())}>
          Restore intact 12 V → 5 V converter
        </button>
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  picked,
  onPick,
}: {
  question: LabQuestion
  picked?: string
  onPick: (id: string) => void
}) {
  const choice = question.choices.find((item) => item.id === picked)
  return (
    <section className="lab-q">
      <p className="prompt">{question.prompt}</p>
      <div className="choice-row">
        {question.choices.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={Boolean(picked)}
            className={picked === item.id ? (item.correct ? 'on' : 'wrong') : ''}
            onClick={() => onPick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {choice ? <p className="answer">{question.explain}</p> : null}
    </section>
  )
}

function KvlBuilder({ instant, vin, picked }: { instant: Instant; vin: number; picked: CircuitHighlight[] }) {
  const residual = kvlOnResidual(vin, instant.vSwitch, instant.vL, instant.vOut)
  const ready = picked.includes('vin') && picked.includes('switch') && picked.includes('inductor') && picked.includes('capacitor')
  return (
    <section className="lab-tool">
      <h2>ON-loop KVL</h2>
      <p>Click VIN, the switch, L, and VOUT on the circuit. Live node voltages are already on the drawing.</p>
      <p className="mono">
        VIN = {formatFixed(vin, 2)} · vSWITCH = {formatFixed(instant.vSwitch, 2)} · vL = {formatFixed(instant.vL, 2)} · VOUT = {formatFixed(instant.vOut, 2)}
      </p>
      {ready ? (
        <p className="eq-line">
          {formatFixed(vin, 2)} − {formatFixed(instant.vSwitch, 2)} − {formatFixed(instant.vL, 2)} − {formatFixed(instant.vOut, 2)} = {formatFixed(residual, 3)} V
        </p>
      ) : (
        <p className="hint">Equation hidden until those four parts are clicked. Clicked: {picked.join(', ') || 'none'}.</p>
      )}
    </section>
  )
}

function KclBuilder({
  instant,
  guess,
  onGuess,
}: {
  instant: Instant
  guess: string[]
  onGuess: (next: string[]) => void
}) {
  const terms = ['iC', 'iLOAD', 'iIN', 'iD']
  const correct = guess.length === 2 && guess.includes('iC') && guess.includes('iLOAD')
  return (
    <section className="lab-tool">
      <h2>Output-node KCL</h2>
      <p>i<sub>L</sub> arrives. Which two currents leave? Pick both.</p>
      <div className="choice-row">
        {terms.map((term) => (
          <button
            key={term}
            type="button"
            className={guess.includes(term) ? 'on' : ''}
            onClick={() => onGuess(guess.includes(term) ? guess.filter((item) => item !== term) : [...guess, term])}
          >
            {term}
          </button>
        ))}
      </div>
      {correct ? (
        <p className="eq-line">
          {formatFixed(instant.iL, 3)} = {formatFixed(instant.iC, 3)} + {formatFixed(instant.iLoad, 3)} A
        </p>
      ) : (
        <p className="hint">The sum stays hidden until you pick iC and iLOAD.</p>
      )}
    </section>
  )
}

function VoltSecondView({ history, params, vOut }: { history: Instant[]; params: BuckParams; vOut: number }) {
  const areas = useMemo(() => voltSecondAreas(history), [history])
  const period = 1 / params.fs
  const ideal = idealVoltSecondTerms(params.vin, vOut, params.duty, period)
  const width = 640
  const height = 160
  const t0 = history[0]?.t ?? 0
  const t1 = history[history.length - 1]?.t ?? 1
  const span = Math.max(t1 - t0, 1e-12)
  const vMax = Math.max(...history.map((s) => Math.abs(s.vL)), 1)
  const xOf = (t: number) => 36 + ((t - t0) / span) * (width - 48)
  const yOf = (v: number) => height / 2 - (v / vMax) * 58
  const pos = history.filter((s) => s.vL >= 0)
  const neg = history.filter((s) => s.vL < 0)
  const areaPath = (samples: Instant[]) => {
    if (samples.length === 0) return ''
    const mid = height / 2
    return `M ${xOf(samples[0].t)} ${mid} ` + samples.map((s) => `L ${xOf(s.t)} ${yOf(s.vL)}`).join(' ') + ` L ${xOf(samples[samples.length - 1].t)} ${mid} Z`
  }
  return (
    <section className="lab-tool">
      <h2>Volt-second areas</h2>
      <svg viewBox={`0 0 ${width} ${height}`} className="wave-svg" role="img" aria-label="Inductor voltage areas">
        <line x1="36" y1={height / 2} x2={width - 12} y2={height / 2} stroke="#c9b99a" />
        <path d={areaPath(pos)} fill="rgba(196,98,42,0.28)" />
        <path d={areaPath(neg)} fill="rgba(43,95,138,0.28)" />
        <path
          d={history.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.t).toFixed(1)} ${yOf(s.vL).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#2b5f8a"
          strokeWidth="1.6"
        />
      </svg>
      <p className="eq-line">
        ∫v<sub>L</sub>dt = {formatSi(areas.net, 'V·s')} (orange ON area {formatSi(areas.positive, 'V·s')}, blue OFF area {formatSi(areas.negative, 'V·s')})
      </p>
      <p className="eq-line">
        (V<sub>IN</sub> − V<sub>OUT</sub>)DT = {formatSi(ideal.on, 'V·s')}
        {' · '}
        −V<sub>OUT</sub>(1 − D)T = {formatSi(ideal.off, 'V·s')}
      </p>
      <p>
        Adding those and requiring a zero sum is exactly V<sub>OUT</sub> = D V<sub>IN</sub>
        {' = '}
        {formatFixed(idealCcmVout(params.vin, params.duty), 2, 'V')}.
        {Math.abs(areas.net) > 2e-6
          ? ' Areas are not balanced — iL is still drifting, as in startup or a load step.'
          : ' Areas cancel: this is periodic steady state.'}
      </p>
    </section>
  )
}

function DutyFsCompare({ base }: { base: BuckParams }) {
  const slow = useMemo(
    () => settleSimulation({ ...base, ...INTACT, duty: 0.5, fs: 20_000, startupFromZero: false }),
    [base],
  )
  const fast = useMemo(
    () => settleSimulation({ ...base, ...INTACT, duty: 0.5, fs: 200_000, startupFromZero: false }),
    [base],
  )
  return (
    <section className="lab-tool">
      <h2>Same D = 50%, fS × 10</h2>
      <div className="compare-cards">
        <article>
          <h3>20 kHz</h3>
          <p className="mono">⟨VOUT⟩ {formatFixed(slow.metrics.vOutAvg, 2, 'V')}</p>
          <p className="mono">ΔiL {formatFixed(slow.metrics.iLpkpk, 3, 'A')}</p>
        </article>
        <article>
          <h3>200 kHz</h3>
          <p className="mono">⟨VOUT⟩ {formatFixed(fast.metrics.vOutAvg, 2, 'V')}</p>
          <p className="mono">ΔiL {formatFixed(fast.metrics.iLpkpk, 3, 'A')}</p>
        </article>
      </div>
      <p>
        Averages agree (both ≈ 6 V from 12 V). Ripple does not. D set the ratio; fS set how long each ramp was allowed to run.
      </p>
    </section>
  )
}

function BoundaryControls({
  params,
  iLmin,
  vOutAvg,
  onR,
}: {
  params: BuckParams
  iLmin: number
  vOutAvg: number
  onR: (R: number) => void
}) {
  const target = idealCcmVout(params.vin, params.duty)
  const dcm = iLmin < 0.02
  return (
    <section className="lab-tool">
      <h2>Raise R until iL,min = 0</h2>
      <Slider
        label="Load R"
        value={Math.log10(params.R)}
        min={0}
        max={2.2}
        step={0.01}
        display={formatSi(params.R, 'Ω')}
        onChange={(logR) => onR(10 ** logR)}
      />
      <p className="eq-line">
        i<sub>L,min</sub> = {formatFixed(iLmin, 3, 'A')}
        {dcm ? ' · boundary crossed · DCM' : ' · still CCM'}
      </p>
      <p>
        D·VIN = {formatFixed(target, 2, 'V')}. Measured VOUT ≈ {formatFixed(vOutAvg, 2, 'V')}
        {dcm ? ' — higher, because the empty-L dwell is extra volt-seconds that CCM accounting ignored.' : '.'}
      </p>
    </section>
  )
}

function EnergyGauges({ instant }: { instant: Instant }) {
  const max = Math.max(Math.abs(instant.pIn), Math.abs(instant.pLoad), Math.abs(instant.pL), Math.abs(instant.pC), 0.4)
  const bar = (value: number, color: string) => {
    const w = (Math.abs(value) / max) * 140
    return (
      <svg width="160" height="14" aria-hidden="true">
        <rect x="0" y="3" width="140" height="8" fill="#efe6d4" />
        <rect x="0" y="3" width={w} height="8" fill={color} />
      </svg>
    )
  }
  return (
    <section className="lab-tool">
      <h2>Live energy flow</h2>
      <ul className="energy-list">
        <li><span>P<sub>IN</sub></span> {bar(instant.pIn, '#c4622a')} {formatFixed(instant.pIn, 3, 'W')}</li>
        <li><span>P<sub>L</sub> = v<sub>L</sub> i<sub>L</sub></span> {bar(instant.pL, '#2b5f8a')} {formatFixed(instant.pL, 3, 'W')}</li>
        <li><span>P<sub>C</sub> = v<sub>OUT</sub> i<sub>C</sub></span> {bar(instant.pC, '#3d6b58')} {formatFixed(instant.pC, 3, 'W')}</li>
        <li><span>P<sub>LOAD</sub></span> {bar(instant.pLoad, '#2c2a26')} {formatFixed(instant.pLoad, 3, 'W')}</li>
      </ul>
      <p className="eq-line">
        E<sub>L</sub> = {formatFixed(instant.energyL * 1e6, 2)} µJ · E<sub>C</sub> = {formatFixed(instant.energyC * 1e3, 2)} mJ
      </p>
      <p>
        {instant.switchOn
          ? 'ON: the source fills L and supplies the load. Extra current also packs charge into C.'
          : 'OFF: PIN = 0. L (and C if needed) are the source. Voltage dropped without burning (VIN − VOUT) IOUT.'}
      </p>
    </section>
  )
}
