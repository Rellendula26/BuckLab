import type { BuckParams, Metrics } from '../sim/types.ts'
import { formatFixed, formatSi } from './format.ts'
import { analyticalRipple } from '../sim/formulas.ts'

interface RipplePanelProps {
  params: BuckParams
  metrics: Metrics
}

export function RipplePanel({ params, metrics }: RipplePanelProps) {
  const ripple = analyticalRipple(params, metrics.vOutAvg)
  return (
    <section className="ripple-panel">
      <h2>Ripple and switching frequency</h2>
      <p className="eq-line">
        Δi<sub>L</sub> ≈ (V<sub>IN</sub> − V<sub>OUT</sub>) T<sub>ON</sub> / L = (V<sub>IN</sub> − V<sub>OUT</sub>) D / (L f<sub>S</sub>)
        {' '}≈ {formatFixed(ripple.deltaIl, 3, 'A')}
      </p>
      <p className="eq-line">
        ΔV<sub>OUT</sub> ≈ Δi<sub>L</sub> / (8 C f<sub>S</sub>) ≈ {formatFixed(ripple.deltaVcap, 4, 'V')}
        {params.realMode ? `  +  ESR term ≈ ${formatFixed(ripple.deltaVesr, 4, 'V')}` : ''}
      </p>
      <p>
        Simulated pk-pk: Δi<sub>L</sub> = {formatFixed(metrics.iLpkpk, 3, 'A')}, ΔV<sub>OUT</sub> = {formatFixed(metrics.vOutPkpk, 4, 'V')}.
        Boundary current Δi<sub>L</sub>/2 ≈ {formatFixed(ripple.boundaryCurrent, 3, 'A')}.
        Average load {formatFixed(metrics.iOutAvg, 3, 'A')}
        {metrics.iOutAvg < ripple.boundaryCurrent ? ' sits below the boundary, so DCM is expected.' : ' sits above the boundary, so CCM is expected.'}
      </p>
      <p>
        Higher frequency shortens each ON and OFF interval, so the inductor has less time to change current and
        the capacitor has less time to charge or discharge. That is why {formatSi(params.fs, 'Hz')} can use smaller L and C
        than a 20 kHz design. The cost is more switching edges per second: more switching loss, heat, gate-drive energy, and EMI.
      </p>
      <p>
        Lower frequency does the opposite: fewer edges, usually cooler switching and quieter high-frequency noise,
        but longer ramps, larger ripple, and physically larger L and C.
      </p>
      <p className="tradeoff">
        Higher fS → lower ripple, smaller parts, more switching loss and EMI.
        Lower fS → less switching loss and EMI, more ripple, larger parts.
      </p>
      <ul>
        <li>Current ripple raises peak and RMS current, conduction heating, and the chance of inductor saturation.</li>
        <li>Voltage ripple can disturb sensors, comparators, and communication circuits.</li>
        <li>Excessive ripple means the output is a worse DC supply than the name “5 V rail” suggests.</li>
      </ul>
    </section>
  )
}
