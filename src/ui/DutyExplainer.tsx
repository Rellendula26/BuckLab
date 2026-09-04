import { formatFixed } from './format.ts'

export function DutyExplainer() {
  return (
    <section className="duty-explainer" aria-label="Duty cycle versus frequency">
      <h2>Duty cycle and frequency are different knobs</h2>
      <p>
        D = T<sub>ON</sub> / T and f<sub>S</sub> = 1 / T. Increasing D at fixed frequency lengthens the ON interval
        and raises average V<sub>OUT</sub>. Increasing frequency at fixed D shortens T<sub>ON</sub> and T<sub>OFF</sub>
        by the same ratio, so the ideal average stays V<sub>OUT</sub> = D V<sub>IN</sub>.
      </p>
      <p className="eq-line">
        D(V<sub>IN</sub> − V<sub>OUT</sub>) + (1 − D)(−V<sub>OUT</sub>) = 0 → V<sub>OUT</sub> = D V<sub>IN</sub>
      </p>
      <div className="pwm-compare">
        <PwmCard title="100 kHz · D = 50%" periodUs={10} cycles={2} />
        <PwmCard title="200 kHz · D = 50%" periodUs={5} cycles={4} />
      </div>
      <p>
        Both trains spend half of each period high, so both have the same ideal average:
        {' '}{formatFixed(0.5 * 12, 1)} V if V<sub>IN</sub> = 12 V. The 200 kHz case just completes twice as many
        shorter triangles per millisecond, which is why ripple shrinks.
      </p>
    </section>
  )
}

function PwmCard({ title, periodUs, cycles }: { title: string; periodUs: number; cycles: number }) {
  const width = 280
  const height = 78
  const totalUs = 20
  let d = `M 8 52`
  for (let i = 0; i < cycles; i += 1) {
    const x0 = 8 + (i * periodUs / totalUs) * (width - 16)
    const xMid = 8 + ((i + 0.5) * periodUs / totalUs) * (width - 16)
    const x1 = 8 + ((i + 1) * periodUs / totalUs) * (width - 16)
    d += ` H ${x0.toFixed(1)} V 18 H ${xMid.toFixed(1)} V 52 H ${x1.toFixed(1)}`
  }
  return (
    <figure>
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <path d={d} fill="none" stroke="#2b5f8a" strokeWidth="2" />
        <text x="8" y="72" className="tiny">T = {periodUs} µs</text>
      </svg>
    </figure>
  )
}
