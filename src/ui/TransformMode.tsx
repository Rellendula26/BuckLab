import type { TransformStage } from './CircuitSvg.tsx'

const STAGES: { stage: TransformStage; title: string; body: string }[] = [
  {
    stage: 1,
    title: 'Source only',
    body: 'VIN is constant DC. Nothing is switching. Voltage is a level, not something that flows.',
  },
  {
    stage: 2,
    title: 'Add the switch',
    body: 'PWM opens and closes the path from VIN. VSW becomes a rectangular pulse: about VIN, then open.',
  },
  {
    stage: 3,
    title: 'Add the diode',
    body: 'The diode does not smooth voltage. It gives inductor current a place to go when the switch opens, so iL is not forced to stop instantly.',
  },
  {
    stage: 4,
    title: 'Add the inductor',
    body: 'Rectangular vL integrates into a gradually rising and falling current. The inductor smoothes current.',
  },
  {
    stage: 5,
    title: 'Add the capacitor',
    body: 'When iL > iLOAD the extra current charges C. When iL < iLOAD, C supplies the missing current. That is what reduces voltage ripple.',
  },
  {
    stage: 6,
    title: 'Add the load',
    body: 'The resistor is the powered circuitry. It draws iLOAD = VOUT / R. The converter does not invent load current; the load asks for it.',
  },
]

interface TransformModeProps {
  stage: TransformStage
  onStage: (stage: TransformStage) => void
}

export function TransformMode({ stage, onStage }: TransformModeProps) {
  const current = STAGES[stage - 1]
  return (
    <section className="transform" aria-label="How each component transforms the waveform">
      <h2>How each component transforms the waveform</h2>
      <div className="stage-steps" role="tablist" aria-label="Build-up stages">
        {STAGES.map((item) => (
          <button
            key={item.stage}
            type="button"
            role="tab"
            aria-selected={stage === item.stage}
            className={stage === item.stage ? 'on' : ''}
            onClick={() => onStage(item.stage)}
          >
            {item.stage}
          </button>
        ))}
      </div>
      <h3>{current.title}</h3>
      <p>{current.body}</p>
    </section>
  )
}
