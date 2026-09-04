import { useState } from 'react'
import type { CircuitHighlight } from './CircuitSvg.tsx'

export interface InterviewQuestion {
  id: string
  prompt: string
  answer: string
  highlights: CircuitHighlight[]
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'on-path',
    prompt: 'What is the current path when the switch is ON?',
    answer: 'VIN+ through the closed switch, into the inductor, to the output node, then through the load and capacitor branches to ground and back to the source. The diode is off. The source is powering the output.',
    highlights: ['path-on', 'switch', 'inductor', 'vin'],
  },
  {
    id: 'diode-reverse',
    prompt: 'Why is the diode reverse-biased during the ON state?',
    answer: 'The cathode sits at the switch node, which is near VIN, while the anode is at ground. Cathode more positive than anode means reverse bias. The diode should not conduct; if it did, it would short VIN to ground.',
    highlights: ['diode', 'vsw', 'vin'],
  },
  {
    id: 'il-continuous',
    prompt: 'Why can inductor current not stop instantaneously?',
    answer: 'Flux linkage (or equivalently stored magnetic energy ½Li²) cannot jump. vL = L di/dt says a finite voltage produces a finite slope, not a step in current. Opening the switch without a freewheel path would demand a huge voltage spike.',
    highlights: ['inductor'],
  },
  {
    id: 'il-direction',
    prompt: 'Does inductor current reverse direction when its voltage polarity reverses?',
    answer: 'No. Voltage polarity tells you the sign of di/dt — whether current is increasing or decreasing — not the direction of current. In a buck, iL stays left-to-right while vL flips from VIN − VOUT to about −VOUT.',
    highlights: ['inductor', 'vsw'],
  },
  {
    id: 'diode-off',
    prompt: 'Why does the diode conduct during the OFF state?',
    answer: 'When the switch opens, inductor current must continue. The left side of L falls until the switch node is below ground by about a diode drop, forward-biasing the diode and completing the freewheel loop: ground → diode → L → output → ground.',
    highlights: ['path-off', 'diode', 'inductor'],
  },
  {
    id: 'parallel',
    prompt: 'Why are the capacitor and load at the same voltage?',
    answer: 'They are connected in parallel between VOUT and ground. Parallel elements share voltage. KCL, not KVL, is what splits the inductor current between C and R.',
    highlights: ['capacitor', 'load'],
  },
  {
    id: 'cap-charge',
    prompt: 'Under what condition does the capacitor charge or discharge?',
    answer: 'KCL: iC = iL − iLOAD. If iL > iLOAD, iC > 0 and C charges. If iL < iLOAD, C discharges. This can happen in both ON and OFF. Do not say the capacitor always discharges for the whole OFF interval.',
    highlights: ['capacitor', 'load'],
  },
  {
    id: 'triangle',
    prompt: 'Why is inductor current triangular?',
    answer: 'vL is approximately rectangular. Integrating a constant positive voltage gives a rising ramp; integrating a constant negative voltage gives a falling ramp. Piece those ramps together and you get a triangle (CCM) or a triangle that returns to zero (DCM).',
    highlights: ['inductor'],
  },
  {
    id: 'dc-out',
    prompt: 'Why is output voltage nearly DC?',
    answer: 'The inductor already smoothed current. The capacitor absorbs the AC part of that current. Because iC = C dV/dt, a large C turns a modest iC into a small dV/dt. The result is a DC level plus a small periodic ripple.',
    highlights: ['capacitor', 'load'],
  },
  {
    id: 'duty',
    prompt: 'What does duty cycle control?',
    answer: 'The fraction of each period the switch is ON. In ideal CCM, volt-second balance requires VOUT = D VIN. Duty cycle is not switching frequency. You can change how often you switch without changing D.',
    highlights: ['switch', 'vin'],
  },
  {
    id: 'freq-ripple',
    prompt: 'Why does increasing frequency reduce ripple?',
    answer: 'TON = D/fS and TOFF = (1−D)/fS both shrink. The inductor has less time to ramp, so ΔiL ≈ (VIN−VOUT)D/(L fS) falls. The capacitor has less time to charge or discharge, so ΔVOUT ≈ ΔiL/(8C fS) falls further.',
    highlights: ['inductor', 'capacitor'],
  },
  {
    id: 'not-max-fs',
    prompt: 'Why would a designer not always maximize switching frequency?',
    answer: 'Every extra edge costs switching loss, gate-drive energy, heat, and EMI. Magnetics get smaller, but the MOSFET and layout get harder. The design point is a tradeoff, not “as fast as possible.”',
    highlights: ['switch'],
  },
  {
    id: 'power',
    prompt: 'Is power conserved in an ideal buck, and what changes in a real buck?',
    answer: 'Ideal: PIN = POUT, so VIN IIN = VOUT IOUT. Stepping voltage down increases available output current for a given input current; the load still chooses IOUT. Real: RDS(on), VF, DCR, ESR, and switching transitions make POUT < PIN.',
    highlights: ['vin', 'load'],
  },
  {
    id: 'ldo',
    prompt: 'When might a linear regulator be preferable?',
    answer: 'Small load current, small VIN−VOUT, or noise-sensitive analog nodes (references, sensors, comparators) where ripple and EMI are more expensive than a few hundred milliwatts of heat. Also when you want simplicity and no magnetics.',
    highlights: ['load'],
  },
]

interface InterviewPrepProps {
  onHighlight: (highlights: CircuitHighlight[]) => void
  onPause: () => void
}

export function InterviewPrep({ onHighlight, onPause }: InterviewPrepProps) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const q = INTERVIEW_QUESTIONS[index]

  const reveal = () => {
    onPause()
    onHighlight(q.highlights)
    setRevealed(true)
  }

  const go = (next: number) => {
    setIndex(next)
    setRevealed(false)
    onHighlight([])
  }

  return (
    <section className="interview" aria-label="Interview preparation">
      <h2>Interview prep</h2>
      <p className="eq-kicker">Question {index + 1} of {INTERVIEW_QUESTIONS.length}. Form an answer, then reveal the lab-book version.</p>
      <p className="prompt">{q.prompt}</p>
      {revealed ? <p className="answer">{q.answer}</p> : (
        <button type="button" onClick={reveal}>Reveal explanation</button>
      )}
      <div className="interview-nav">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>Previous</button>
        <button type="button" disabled={index === INTERVIEW_QUESTIONS.length - 1} onClick={() => go(index + 1)}>Next</button>
      </div>
    </section>
  )
}
