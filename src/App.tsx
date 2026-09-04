import { useEffect, useState } from 'react'
import { useSimulation, type TabId } from './hooks/useSimulation.ts'
import type { WaveformId } from './sim/types.ts'
import { CircuitSvg, type CircuitHighlight, type TransformStage } from './ui/CircuitSvg.tsx'
import { ComparisonPanel } from './ui/ComparisonPanel.tsx'
import { DesignControls } from './ui/Controls.tsx'
import { DutyExplainer } from './ui/DutyExplainer.tsx'
import { EquationPanel } from './ui/EquationPanel.tsx'
import { InterviewPrep } from './ui/InterviewPrep.tsx'
import { MetricsBar } from './ui/MetricsBar.tsx'
import type { MetricId } from './ui/metricExplainers.ts'
import { PlaybackBar } from './ui/PlaybackBar.tsx'
import { RipplePanel } from './ui/RipplePanel.tsx'
import { TransformMode } from './ui/TransformMode.tsx'
import { Waveforms } from './ui/Waveforms.tsx'
import { formatFixed } from './ui/format.ts'
import { idealCcmVout } from './sim/formulas.ts'
import { LabsTab } from './labs/LabsTab.tsx'
import { DesignTab } from './design/DesignTab.tsx'

const TABS: { id: TabId; label: string }[] = [
  { id: 'explore', label: 'Explore Circuit' },
  { id: 'walkthrough', label: 'ON/OFF Walkthrough' },
  { id: 'waveforms', label: 'Waveforms and Design' },
  { id: 'compare', label: 'Comparisons and Interview' },
  { id: 'labs', label: 'Concept Labs' },
  { id: 'design', label: 'Design a Buck' },
]

const DEFAULT_WAVES: WaveformId[] = ['pwm', 'vSW', 'vL', 'iL', 'vOUT']

export default function App() {
  const sim = useSimulation()
  const [waves, setWaves] = useState<WaveformId[]>(DEFAULT_WAVES)
  const [metric, setMetric] = useState<MetricId | null>(null)
  const [highlights, setHighlights] = useState<CircuitHighlight[]>([])
  const [stage, setStage] = useState<TransformStage>(6)
  const [transformOn, setTransformOn] = useState(false)

  const toggleWave = (id: WaveformId) => {
    setWaves((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const { setPlaying, reset, stepPhase, setTab } = sim
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        setPlaying((playing) => !playing)
      } else if (event.key === 'r' || event.key === 'R') {
        reset()
      } else if (event.key === ']') {
        stepPhase('on')
      } else if (event.key === '[') {
        stepPhase('off')
      } else if (['1', '2', '3', '4', '5', '6'].includes(event.key)) {
        setTab(TABS[Number(event.key) - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reset, setPlaying, setTab, stepPhase])

  const circuitHighlights =
    sim.tab === 'walkthrough' && highlights.length === 0
      ? sim.instant.phase === 'on'
        ? (['path-on', 'switch', 'vin', 'inductor'] as CircuitHighlight[])
        : sim.instant.phase === 'off'
          ? (['path-off', 'diode', 'inductor'] as CircuitHighlight[])
          : (['capacitor', 'load'] as CircuitHighlight[])
      : highlights

  const idealV = idealCcmVout(sim.params.vin, sim.params.duty)

  return (
    <div className={sim.tab === 'design' ? 'app is-wide' : 'app'}>
      <header className="topbar">
        <div>
          <p className="eyebrow">BuckLab</p>
          <h1>How a buck converter really works</h1>
        </div>
        <p className="lede">
          A time-domain model with KCL, KVL, and energy storage — built for an early EE interview, not a static infographic.
        </p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={sim.tab === tab.id ? 'on' : ''}
            aria-current={sim.tab === tab.id ? 'page' : undefined}
            onClick={() => sim.setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {sim.tab === 'design' ? null : (
        <MetricsBar
          metrics={sim.metrics}
          realMode={sim.params.realMode}
          selected={metric}
          onSelect={setMetric}
        />
      )}

      {sim.tab === 'design' ? null : (
        <PlaybackBar
          playing={sim.playing}
          animSpeed={sim.animSpeed}
          onPlay={() => sim.setPlaying(true)}
          onPause={() => sim.setPlaying(false)}
          onReset={sim.reset}
          onStepOn={() => sim.stepPhase('on')}
          onStepOff={() => sim.stepPhase('off')}
          onSpeed={sim.setAnimSpeed}
        />
      )}

      {sim.tab === 'explore' ? (
        <div className="layout-split">
          <div className="viz">
            <CircuitSvg
              instant={sim.instant}
              params={sim.params}
              showMosfet={sim.showMosfet}
              highlights={circuitHighlights}
              reducedMotion={sim.reducedMotion}
            />
            <DesignControls
              params={sim.params}
              presetId={sim.presetId}
              onPreset={sim.applyPreset}
              onChange={sim.updateParams}
              showMosfet={sim.showMosfet}
              onMosfet={sim.setShowMosfet}
            />
          </div>
          <EquationPanel instant={sim.instant} realMode={sim.params.realMode} vf={sim.params.vf} />
        </div>
      ) : null}

      {sim.tab === 'walkthrough' ? (
        <div className="layout-split">
          <div className="viz">
            <CircuitSvg
              instant={sim.instant}
              params={sim.params}
              showMosfet={sim.showMosfet}
              highlights={circuitHighlights}
              reducedMotion={sim.reducedMotion}
            />
            <WalkthroughCopy instantPhase={sim.instant.phase} iL={sim.instant.iL} iLoad={sim.instant.iLoad} />
          </div>
          <EquationPanel instant={sim.instant} realMode={sim.params.realMode} vf={sim.params.vf} />
        </div>
      ) : null}

      {sim.tab === 'waveforms' ? (
        <div className="layout-stack">
          <Waveforms
            history={sim.history}
            instant={sim.instant}
            enabled={waves}
            onToggle={toggleWave}
            onScrub={sim.scrubTo}
            onScrubEnd={sim.endScrub}
          />
          <div className="layout-split">
            <CircuitSvg
              instant={sim.instant}
              params={sim.params}
              showMosfet={sim.showMosfet}
              highlights={circuitHighlights}
              reducedMotion={sim.reducedMotion}
              stage={transformOn ? stage : 6}
            />
            <EquationPanel instant={sim.instant} realMode={sim.params.realMode} vf={sim.params.vf} compact />
          </div>
          <label className="inline-check">
            <input type="checkbox" checked={transformOn} onChange={(e) => setTransformOn(e.target.checked)} />
            How each component transforms the waveform
          </label>
          {transformOn ? <TransformMode stage={stage} onStage={setStage} /> : null}
          <DesignControls
            params={sim.params}
            presetId={sim.presetId}
            onPreset={sim.applyPreset}
            onChange={sim.updateParams}
            showMosfet={sim.showMosfet}
            onMosfet={sim.setShowMosfet}
          />
          <PowerNotes
            pIn={sim.metrics.pIn}
            pOut={sim.metrics.pOut}
            eta={sim.metrics.efficiency}
            real={sim.params.realMode}
            vin={sim.params.vin}
            vOut={sim.metrics.vOutAvg}
            iIn={sim.metrics.iInAvg}
            iOut={sim.metrics.iOutAvg}
            idealV={idealV}
          />
          <DutyExplainer />
          <RipplePanel params={sim.params} metrics={sim.metrics} />
        </div>
      ) : null}

      {sim.tab === 'labs' ? (
        <LabsTab
          params={sim.params}
          instant={sim.instant}
          history={sim.history}
          showMosfet={sim.showMosfet}
          reducedMotion={sim.reducedMotion}
          onPatch={sim.updateParams}
          onRestore={() => sim.applyPreset('nominal-12-5')}
          onScrub={sim.scrubTo}
          onScrubEnd={sim.endScrub}
          onPause={() => sim.setPlaying(false)}
        />
      ) : null}

      {sim.tab === 'design' ? (
        <DesignTab
          params={sim.params}
          instant={sim.instant}
          history={sim.history}
          reducedMotion={sim.reducedMotion}
          onPatch={sim.updateParams}
          onScrub={sim.scrubTo}
          onScrubEnd={sim.endScrub}
          onPause={() => sim.setPlaying(false)}
          onShowMosfet={sim.setShowMosfet}
        />
      ) : null}

      {sim.tab === 'compare' ? (
        <div className="layout-split">
          <div className="viz">
            <CircuitSvg
              instant={sim.instant}
              params={sim.params}
              showMosfet={sim.showMosfet}
              highlights={highlights}
              reducedMotion={sim.reducedMotion}
            />
            <ComparisonPanel />
          </div>
          <InterviewPrep onHighlight={setHighlights} onPause={() => sim.setPlaying(false)} />
        </div>
      ) : null}

      <footer className="colophon">
        <p>
          {sim.tab === 'design'
            ? 'Design a Buck uses the same numerical model as the rest of BuckLab. Live averages stay hidden until you commit a prediction.'
            : `Ideal CCM target for this duty: VOUT = D VIN = ${formatFixed(idealV, 2, 'V')}. Simulated average ${formatFixed(sim.metrics.vOutAvg, 2, 'V')} · ${sim.metrics.mode}.`}
          {' '}
          Keyboard: space play/pause, [ Step OFF, ] Step ON, R reset, 1–6 tabs.
        </p>
      </footer>
    </div>
  )
}

function WalkthroughCopy({
  instantPhase,
  iL,
  iLoad,
}: {
  instantPhase: 'on' | 'off' | 'dcm'
  iL: number
  iLoad: number
}) {
  const cap =
    iL > iLoad
      ? 'iL is still above iLOAD, so the capacitor is charging even if the switch is already off.'
      : 'iL is below iLOAD, so the capacitor supplies the missing current and VOUT droops slightly.'

  return (
    <section className="walkthrough-copy">
      <h2>{instantPhase === 'on' ? 'ON state' : instantPhase === 'off' ? 'OFF state' : 'Discontinuous pause'}</h2>
      {instantPhase === 'on' ? (
        <ol>
          <li>VSW is approximately VIN. The diode cathode is high, so the diode is reverse-biased and idle.</li>
          <li>Current runs left-to-right through the inductor. The source is powering the load.</li>
          <li>vL = VIN − VOUT &gt; 0, so diL/dt &gt; 0. Current ramps up; the magnetic field grows as ½LiL² rises.</li>
          <li>{cap}</li>
        </ol>
      ) : instantPhase === 'off' ? (
        <ol>
          <li>Input current is zero. The source is disconnected. Inductor current cannot jump to zero.</li>
          <li>The inductor keeps iL left-to-right by reversing vL. The left side of L falls below VOUT and pulls VSW low.</li>
          <li>That forward-biases the diode and creates the freewheel loop: ground → diode → L → output → ground.</li>
          <li>Stored magnetic energy now supplies the output. iL ramps down. {cap}</li>
        </ol>
      ) : (
        <ol>
          <li>iL reached zero. An asynchronous diode cannot conduct backwards, so the inductor stays empty.</li>
          <li>VSW is no longer clamped. The load is powered only by the capacitor until the next ON pulse.</li>
        </ol>
      )}
    </section>
  )
}

function PowerNotes({
  pIn,
  pOut,
  eta,
  real,
  vin,
  vOut,
  iIn,
  iOut,
  idealV,
}: {
  pIn: number
  pOut: number
  eta: number
  real: boolean
  vin: number
  vOut: number
  iIn: number
  iOut: number
  idealV: number
}) {
  return (
    <section className="power-notes">
      <h2>Power</h2>
      <p className="eq-line">
        P<sub>IN</sub> = V<sub>IN</sub> ⟨i<sub>IN</sub>⟩ = {formatFixed(pIn, 3, 'W')}
        {' · '}
        P<sub>OUT</sub> = ⟨V<sub>OUT</sub> i<sub>LOAD</sub>⟩ = {formatFixed(pOut, 3, 'W')}
        {' · '}
        η = {formatFixed(eta, 1)}%
      </p>
      {real ? (
        <p>
          Real devices dissipate energy, so POUT &lt; PIN. The gap is MOSFET conduction, diode drop, inductor DCR, capacitor ESR, and switching edges.
        </p>
      ) : (
        <p>
          Ideal mode keeps PIN ≈ POUT. Stepping voltage from {formatFixed(vin, 1)} V toward {formatFixed(idealV, 1)} V
          increases available output current ({formatFixed(iIn, 3)} A in → {formatFixed(iOut, 3)} A out at {formatFixed(vOut, 2)} V).
          The converter does not force extra current into the load; the load still sets iLOAD = VOUT / R.
        </p>
      )}
    </section>
  )
}
