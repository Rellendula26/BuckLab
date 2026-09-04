import type { BuckParams, WaveformId } from '../sim/types.ts'

export interface Choice {
  id: string
  label: string
  correct: boolean
}

export interface LabQuestion {
  id: string
  prompt: string
  choices: Choice[]
  explain: string
}

export interface LabDef {
  id: string
  group: string
  title: string
  tease: string
  questions: LabQuestion[]
  patch: Partial<BuckParams>
  traces: WaveformId[]
  reveal: string
}

export const LAB_GROUPS = [
  { id: 'removal', title: '1. Why each part exists' },
  { id: 'kvl', title: '2. Write KVL / KCL' },
  { id: 'inductor', title: '3. Inductor law' },
  { id: 'capacitor', title: '4. Capacitor law' },
  { id: 'volts', title: '5. Why VOUT = D VIN' },
  { id: 'dutyfs', title: '6. Duty vs frequency' },
  { id: 'dcm', title: '7. CCM / DCM boundary' },
  { id: 'startup', title: '8. Startup from zero' },
  { id: 'energy', title: '9. Energy transfer' },
  { id: 'gauntlet', title: '10. Interview gauntlet' },
] as const

export const LABS: LabDef[] = [
  {
    id: 'remove-l',
    group: 'removal',
    title: 'Bypass the inductor',
    tease: 'Short L so VSW is tied to VOUT. PWM still switches. Predict the waveforms.',
    traces: ['pwm', 'vSW', 'iL', 'vOUT'],
    patch: { hasInductor: false },
    questions: [
      {
        id: 'vout-shape',
        prompt: 'Without L, what does VOUT look like compared with a normal buck?',
        choices: [
          { id: 'dc', label: 'Still nearly DC — PWM already averages voltage', correct: false },
          { id: 'pwm-slam', label: 'A slammed, spiky rail: each ON pulse connects VIN almost directly into C', correct: true },
          { id: 'zero', label: 'VOUT collapses to 0 because nothing can carry current', correct: false },
        ],
        explain: 'L is what turns a voltage rectangle into a current triangle. Without it, the switch dumps VIN onto C. Current spikes; VOUT is a crude RC-filtered square wave, not a current-fed DC rail.',
      },
      {
        id: 'why-l',
        prompt: 'Why is PWM alone not a buck converter?',
        choices: [
          { id: 'avg', label: 'Because averaging a square wave already is a buck', correct: false },
          { id: 'current', label: 'Because a buck controls energy by forcing a continuous inductor current, not by connecting VIN to the load', correct: true },
          { id: 'diode', label: 'Because the diode would short VIN without L — wait, during ON the diode is off anyway', correct: false },
        ],
        explain: 'A buck is a controlled current source into a parallel C||R. PWM voltage averaging without L is just hard-switching a capacitor — huge RMS current, ugly ripple, no volt-second conversion mechanism.',
      },
    ],
    reveal: 'The numerical model replaces L with 80 nH of trace inductance. Watch iL spike and VOUT lurch toward VIN each ON pulse. That is why the inductor is not optional decoration.',
  },
  {
    id: 'remove-c',
    group: 'removal',
    title: 'Remove the capacitor',
    tease: 'C is gone. The load is the only path at the output node.',
    traces: ['iL', 'iC', 'vOUT'],
    patch: { hasCapacitor: false },
    questions: [
      {
        id: 'vout',
        prompt: 'If C is removed, what is VOUT instantaneously?',
        choices: [
          { id: 'dv', label: 'Still D·VIN, because duty cycle sets voltage', correct: false },
          { id: 'ir', label: 'VOUT = iL · R — the load sees the inductor triangle directly', correct: true },
          { id: 'zero', label: 'Zero, because only capacitors hold voltage', correct: false },
        ],
        explain: 'Without C, KCL says iL = iLOAD. For a resistor, VOUT = iL R. The triangle in current becomes a triangle in voltage. Duty cycle still affects the average of that triangle, but the ripple is enormous.',
      },
    ],
    reveal: 'iC is identically zero. VOUT tracks iL. The capacitor’s job is not “make DC from PWM.” It is to absorb iL − iLOAD so voltage barely moves.',
  },
  {
    id: 'remove-d',
    group: 'removal',
    title: 'Remove the diode',
    tease: 'MOSFET still PWMs. When it opens, iL has no freewheel path.',
    traces: ['pwm', 'vSW', 'vL', 'iL'],
    patch: { hasDiode: false },
    questions: [
      {
        id: 'il',
        prompt: 'The MOSFET just opened. iL was 1 A left-to-right. What happens immediately?',
        choices: [
          { id: 'stop', label: 'iL jumps to 0 — the switch is open, so current must stop', correct: false },
          { id: 'reverse', label: 'iL reverses through the MOSFET body', correct: false },
          { id: 'spike', label: 'iL cannot jump; VSW flies wildly negative as the inductor opposes di/dt', correct: true },
        ],
        explain: 'v = L di/dt. Forcing di to be a step requires infinite voltage. In the model, VSW spikes to about −8 VIN so iL can collapse. In hardware that is a dead FET, an arc, or a snubber. The diode exists to give iL a voltage-clamped path.',
      },
    ],
    reveal: 'Look at vSW during the first OFF edge: a large negative spike, iD = 0, then iL crashes to zero. That is an unclamped inductive load, not a converter.',
  },
  {
    id: 'stuck-on',
    group: 'removal',
    title: 'MOSFET welded ON',
    tease: 'The switch never opens. D is meaningless.',
    traces: ['vSW', 'iL', 'vOUT'],
    patch: { switchMode: 'stuckOn' },
    questions: [
      {
        id: 'vout',
        prompt: 'If the MOSFET stays ON, what does VOUT settle to?',
        choices: [
          { id: 'dvin', label: 'D·VIN, because that formula always holds', correct: false },
          { id: 'vin', label: 'VIN — this is just an RL-C charging toward the source', correct: true },
          { id: 'half', label: 'VIN/2 because L and C form a divider', correct: false },
        ],
        explain: 'A buck needs a switch that opens. Volt-second balance requires a negative vL interval. With the switch stuck ON, vL → 0 and VOUT → VIN. You have a filter, not a converter.',
      },
    ],
    reveal: 'VSW sits at VIN. iL settles at VIN/R. There is no OFF interval, no diode conduction, no conversion ratio.',
  },
  {
    id: 'kvl-on',
    group: 'kvl',
    title: 'Construct ON-state KVL',
    tease: 'Click the ON loop. Assemble VIN − vSWITCH − vL − VOUT = 0 from live numbers.',
    traces: ['vSW', 'vL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'which',
        prompt: 'During ON, which drop is ideally almost zero?',
        choices: [
          { id: 'vl', label: 'vL, because the inductor is a short at DC', correct: false },
          { id: 'sw', label: 'The switch drop — it is ON, so vDS ≈ 0 and VSW ≈ VIN', correct: true },
          { id: 'vout', label: 'VOUT, because C shorts AC', correct: false },
        ],
        explain: 'The inductor is not a short during switching; it has vL = VIN − VOUT. The closed switch is the near-short. That is the whole point of using it as a switch rather than a linear resistor.',
      },
    ],
    reveal: 'Live KVL: VIN − vSWITCH − vL − VOUT is identically 0. Positive vL is the leftover after VOUT is subtracted from VIN.',
  },
  {
    id: 'kcl-out',
    group: 'kvl',
    title: 'Construct output KCL',
    tease: 'The output node has one arriving current and two leaving paths.',
    traces: ['iL', 'iC', 'iLOAD'],
    patch: {},
    questions: [
      {
        id: 'kcl',
        prompt: 'At the output node, which statement is always true?',
        choices: [
          { id: 'onoff', label: 'iC > 0 during ON and iC < 0 during the entire OFF interval', correct: false },
          { id: 'split', label: 'iL = iC + iLOAD, so the capacitor charges only when iL > iLOAD', correct: true },
          { id: 'series', label: 'vC and VOUT add, because C and R are in series', correct: false },
        ],
        explain: 'C and R are parallel: same voltage. KCL, not the switch state, decides charge vs discharge. Early OFF, iL can still exceed iLOAD.',
      },
    ],
    reveal: 'Watch iC change sign in the middle of OFF when iL crosses iLOAD. That crossing — not the PWM edge — is when the capacitor starts supplying the load.',
  },
  {
    id: 'l-law',
    group: 'inductor',
    title: 'vL = L diL/dt',
    tease: 'Predict the slope signs, then watch vL and iL together.',
    traces: ['vL', 'iL'],
    patch: {},
    questions: [
      {
        id: 'sign',
        prompt: 'Which quantity can jump when the MOSFET opens: vL or iL?',
        choices: [
          { id: 'both', label: 'Both jump — they are linked by L', correct: false },
          { id: 'vl', label: 'vL can reverse instantly; iL cannot', correct: true },
          { id: 'il', label: 'iL reverses; vL stays the same', correct: false },
        ],
        explain: 'Voltage is the derivative of current. A derivative can jump when the function has a corner. The function iL(t) itself stays continuous.',
      },
      {
        id: 'double-l',
        prompt: 'If L doubles and everything else stays put, current ripple ΔiL…',
        choices: [
          { id: 'same', label: 'stays the same — D sets ripple', correct: false },
          { id: 'half', label: 'roughly halves, because di/dt = vL/L', correct: true },
          { id: 'double', label: 'doubles — more inductance stores more current', correct: false },
        ],
        explain: 'ΔiL ≈ (VIN − VOUT) D / (L fS). Double L, half the slope, half the triangle height.',
      },
    ],
    reveal: 'Positive vL: iL climbs. Negative vL: iL falls. Zero vL (DCM empty): iL stays 0. Energy ½LiL² grows and shrinks with the magnetic field drawn around L.',
  },
  {
    id: 'c-law',
    group: 'capacitor',
    title: 'iC = C dvC/dt',
    tease: 'The capacitor is slaved to iL − iLOAD, not to the PWM edge.',
    traces: ['iL', 'iC', 'iLOAD', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'off',
        prompt: 'During OFF, does the capacitor always discharge?',
        choices: [
          { id: 'yes', label: 'Yes — OFF means the source is gone, so C must supply the load', correct: false },
          { id: 'no', label: 'No — if iL is still greater than iLOAD, C keeps charging', correct: true },
          { id: 'idle', label: 'C is idle during OFF because the diode has taken over', correct: false },
        ],
        explain: 'The diode carries iL, but iL is still arriving at the output node. Only the excess or deficit versus iLOAD goes through C.',
      },
      {
        id: 'double-c',
        prompt: 'If C doubles, voltage ripple ΔVOUT…',
        choices: [
          { id: 'half', label: 'roughly halves — same iC, half the dv/dt', correct: true },
          { id: 'same', label: 'is unchanged because L sets ripple', correct: false },
          { id: 'zero', label: 'becomes exactly zero', correct: false },
        ],
        explain: 'ΔVOUT ≈ ΔiL / (8 C fS). C is the voltage smoother. L is the current smoother.',
      },
    ],
    reveal: 'The iC waveform crosses zero when iL crosses iLOAD — often mid-OFF. VOUT is still rising there. That is the picture that kills the “C discharges all OFF” myth.',
  },
  {
    id: 'voltsecond',
    group: 'volts',
    title: 'Derive VOUT = D VIN',
    tease: 'Do not memorize the formula. Balance the areas under vL(t).',
    traces: ['vL', 'iL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'why-zero',
        prompt: 'In steady-state CCM, why must the net area under vL over one period be zero?',
        choices: [
          { id: 'kcl', label: 'KCL at the output requires it', correct: false },
          { id: 'il', label: 'Otherwise iL would finish the period higher or lower than it started — it would drift forever', correct: true },
          { id: 'power', label: 'Because PIN = POUT', correct: false },
        ],
        explain: '∫vL dt = L ΔiL. If the integral is not zero, iL ratchets each cycle. Steady state forbids that. That single fact produces VOUT = D VIN.',
      },
    ],
    reveal: '(VIN − VOUT) D T + (−VOUT)(1 − D)T = 0 → VOUT = D VIN. The filled areas on vL(t) are those two terms. If they do not cancel, watch iL walk.',
  },
  {
    id: 'duty-fs',
    group: 'dutyfs',
    title: 'D vs fS, 10× frequency',
    tease: 'Same D, fS × 10. Predict average VOUT and ripple before you see it.',
    traces: ['vL', 'iL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'avg',
        prompt: 'Hold D = 50% and raise fS from 20 kHz to 200 kHz. Ideal average VOUT…',
        choices: [
          { id: 'times10', label: 'rises 10× because there are more pulses', correct: false },
          { id: 'same', label: 'stays about the same — D still sets the conversion ratio', correct: true },
          { id: 'half', label: 'halves because each pulse is shorter', correct: false },
        ],
        explain: 'D is the fraction. Frequency scales both TON and TOFF together. The ratio — and therefore the volt-second balance — is unchanged.',
      },
      {
        id: 'ripple',
        prompt: 'That same 10× increase in fS does what to ΔiL?',
        choices: [
          { id: 'same', label: 'Nothing — ripple is set by L and C only', correct: false },
          { id: 'down', label: 'Cuts it by about 10×: less time to ramp each interval', correct: true },
          { id: 'up', label: 'Increases it because the inductor switches harder', correct: false },
        ],
        explain: 'ΔiL ≈ (VIN − VOUT) D / (L fS). Frequency is a ripple and size knob, not a conversion-ratio knob.',
      },
    ],
    reveal: 'Two numerical runs, same D, fS different by 10×: averages match, triangles shrink. D → conversion ratio. fS → ripple and component size.',
  },
  {
    id: 'boundary',
    group: 'dcm',
    title: 'Walk iL,min to zero',
    tease: 'Raise R until the triangle just kisses zero.',
    traces: ['iL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'hold',
        prompt: 'Once iL,min hits 0, does VOUT = D VIN still have to hold?',
        choices: [
          { id: 'yes', label: 'Yes — volt-second balance always gives that', correct: false },
          { id: 'no', label: 'No. In DCM the diode turns off early, vL = 0 for a dwell, and VOUT becomes load-dependent', correct: true },
          { id: 'zero', label: 'VOUT falls to 0 because the inductor is empty', correct: false },
        ],
        explain: 'Volt-second balance still applies, but the OFF interval is no longer the whole (1−D)T. There is a third interval with vL ≈ 0. Solving that with the load current gives VOUT > D VIN for an open-loop asynchronous buck.',
      },
    ],
    reveal: 'Drag R up. When iL,min reaches 0 the mode chip flips to DCM and VOUT climbs above D·VIN. The formula you memorized was a CCM result.',
  },
  {
    id: 'startup',
    group: 'startup',
    title: 'Start at vC = 0, iL = 0',
    tease: 'The steady-state equations are not true on the first cycle.',
    traces: ['iL', 'vOUT', 'vL'],
    patch: { startupFromZero: true },
    questions: [
      {
        id: 'first',
        prompt: 'On the first ON pulse, vL is about VIN − 0 = VIN. What happens to iL?',
        choices: [
          { id: 'now', label: 'It immediately sits at the steady-state triangle around VOUT/R', correct: false },
          { id: 'ramp', label: 'It ramps from 0 with a steep slope. Energy in L and C accumulates over many cycles', correct: true },
          { id: 'vout', label: 'VOUT appears instantly because D·VIN is an algebraic law', correct: false },
        ],
        explain: 'D·VIN is a periodic-steady-state result. At t = 0 there is no stored energy. Each cycle stuffs a bit more into ½Li² and ½Cv² until the volt-second areas balance.',
      },
    ],
    reveal: 'The capture starts at the origin. VOUT walks up. iL’s triangle rides on a rising pedestal. Steady-state formulas describe the destination, not the path.',
  },
  {
    id: 'energy',
    group: 'energy',
    title: 'Where the joules go',
    tease: 'A linear regulator burns (VIN − VOUT) IOUT. A buck stores and redirects it.',
    traces: ['iIN', 'iL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'off-power',
        prompt: 'During OFF, PIN is zero. Who is powering the load?',
        choices: [
          { id: 'magic', label: 'Nothing — the load must also go to zero', correct: false },
          { id: 'store', label: 'The inductor (and C if iL < iLOAD) — previously stored energy', correct: true },
          { id: 'diode', label: 'The diode generates power because it is forward-biased', correct: false },
        ],
        explain: 'PIN is pulsed. PLOAD is nearly continuous. L and C are the buffer. That is why you do not have to dissipate 7 V × 1 A as heat to make 5 V from 12 V.',
      },
    ],
    reveal: 'Gauges show PIN pulsing, PL reversing each half-cycle, PC oscillating around zero, PLOAD steady. Energy is relocated, not thrown away.',
  },
  {
    id: 'gauntlet',
    group: 'gauntlet',
    title: 'Interview gauntlet',
    tease: 'Answer first. The circuit only moves after you commit.',
    traces: ['pwm', 'vSW', 'vL', 'iL', 'vOUT'],
    patch: {},
    questions: [
      {
        id: 'q1',
        prompt: 'MOSFET just opened. What happens to iL immediately?',
        choices: [
          { id: 'a', label: 'It drops to zero', correct: false },
          { id: 'b', label: 'It continues; only its slope changes', correct: true },
          { id: 'c', label: 'It reverses through the diode', correct: false },
        ],
        explain: 'Current in an inductor is a state. The diode exists so that statement can remain true without a voltage spike.',
      },
      {
        id: 'q2',
        prompt: 'Why does the diode turn on in OFF?',
        choices: [
          { id: 'a', label: 'The controller biases it', correct: false },
          { id: 'b', label: 'The inductor pulls VSW below ground until the diode is forward-biased', correct: true },
          { id: 'c', label: 'It always conducts 1−D of the time by definition', correct: false },
        ],
        explain: 'The diode is not clocked. It is a consequence of the inductor enforcing continuous iL.',
      },
      {
        id: 'q3',
        prompt: 'If fS doubles and D is fixed, average VOUT…',
        choices: [
          { id: 'a', label: 'Doubles', correct: false },
          { id: 'b', label: 'Stays about the same; ripple falls', correct: true },
          { id: 'c', label: 'Goes to VIN', correct: false },
        ],
        explain: 'Conversion ratio is D. Frequency is ripple.',
      },
      {
        id: 'q4',
        prompt: 'What physically determines VOUT in CCM?',
        choices: [
          { id: 'a', label: 'The load resistor, like a divider', correct: false },
          { id: 'b', label: 'Volt-second balance on L: the average of vL must be zero, which forces VOUT = D VIN', correct: true },
          { id: 'c', label: 'The capacitor voltage rating', correct: false },
        ],
        explain: 'The load sets current, not the CCM voltage. That is the opposite of a linear divider.',
      },
      {
        id: 'q5',
        prompt: 'Why isn’t a buck “just averaging a PWM voltage”?',
        choices: [
          { id: 'a', label: 'It is — LC is only for EMI', correct: false },
          { id: 'b', label: 'Averaging VIN·D is the result, not the mechanism. The mechanism is a switched current source plus energy storage', correct: true },
          { id: 'c', label: 'Because the diode rectifies like a transformer', correct: false },
        ],
        explain: 'If it were only averaging, removing L would still give clean DC after C. The removal lab showed that it does not.',
      },
    ],
    reveal: 'These answers are the ones you should be able to say out loud with the circuit in front of you. Run any earlier lab again if one of them still feels like a slogan.',
  },
]

export function labsInGroup(group: string): LabDef[] {
  return LABS.filter((lab) => lab.group === group)
}

export function labById(id: string): LabDef {
  return LABS.find((lab) => lab.id === id) ?? LABS[0]
}
