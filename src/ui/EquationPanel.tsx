import type { ReactNode } from 'react'
import type { Instant } from '../sim/types.ts'
import { capacitorCharging } from '../sim/physics.ts'
import { formatFixed, formatSi, signed } from './format.ts'

interface EquationPanelProps {
  instant: Instant
  realMode: boolean
  vf: number
  compact?: boolean
}

export function EquationPanel({ instant, realMode, vf, compact = false }: EquationPanelProps) {
  const on = instant.phase === 'on'
  const dcm = instant.phase === 'dcm'
  const charge = capacitorCharging(instant.iL, instant.iLoad)
  const slopeNote = on
    ? 'Positive vL means inductor current has a positive slope — not that the inductor voltage itself is growing.'
    : 'Negative vL means current ramps downward. The inductor reversed polarity to keep iL from stopping; current still flows left-to-right.'

  return (
    <aside className={`eq-panel${compact ? ' compact' : ''}`} aria-live="polite">
      <h2>Live KCL / KVL</h2>
      <p className="eq-kicker">
        {dcm
          ? 'Discontinuous interval. The inductor is empty; both switch and diode are off.'
          : on
            ? 'ON interval. Source connected, diode reverse-biased.'
            : 'OFF interval. Source disconnected; inductor current freewheels in the diode.'}
      </p>

      <Eq label="Inductor, left → right">
        v<sub>L</sub> = v<sub>SW</sub> − v<sub>OUT</sub> = {formatFixed(instant.vSW, 2)} − {formatFixed(instant.vOut, 2)} = {formatFixed(instant.vL, 2)} V
      </Eq>
      <Eq label="Output node KCL">
        i<sub>L</sub> = i<sub>C</sub> + i<sub>LOAD</sub>
        <br />
        {formatFixed(instant.iL, 3)} = {formatFixed(instant.iC, 3)} + {formatFixed(instant.iLoad, 3)} A
        <br />
        i<sub>C</sub> = i<sub>L</sub> − i<sub>LOAD</sub> = {signed(instant.iC, 3)} A
      </Eq>

      {on ? (
        <Eq label="Ideal ON KVL">
          V<sub>IN</sub> − v<sub>L</sub> − V<sub>OUT</sub> = 0
          <br />
          v<sub>L</sub> = V<sub>IN</sub> − V<sub>OUT</sub> &gt; 0
          <br />
          di<sub>L</sub>/dt = v<sub>L</sub>/L = {formatSi(instant.diLdt, 'A/s', 2)} &gt; 0
        </Eq>
      ) : dcm ? (
        <Eq label="DCM">
          i<sub>L</sub> = 0, &nbsp; v<sub>L</sub> ≈ 0
          <br />
          The diode is off. C and R share v<sub>OUT</sub> and slowly discharge together.
        </Eq>
      ) : (
        <Eq label={realMode && vf > 0 ? 'OFF with diode drop' : 'Ideal OFF KVL'}>
          {realMode && vf > 0 ? (
            <>
              v<sub>L</sub> = −(V<sub>OUT</sub> + V<sub>F</sub>) = {formatFixed(instant.vL, 2)} V
            </>
          ) : (
            <>
              v<sub>L</sub> + V<sub>OUT</sub> = 0
              <br />
              v<sub>L</sub> = −V<sub>OUT</sub> &lt; 0
            </>
          )}
          <br />
          di<sub>L</sub>/dt = v<sub>L</sub>/L = {formatSi(instant.diLdt, 'A/s', 2)} &lt; 0
        </Eq>
      )}

      <Eq label="Capacitor">
        i<sub>C</sub> = C dV<sub>OUT</sub>/dt
        <br />
        dV<sub>OUT</sub>/dt = i<sub>C</sub>/C = {formatSi(instant.dvOutdt, 'V/s', 2)}
        <br />
        {charge === 'charge'
          ? 'iL > iLOAD → iC > 0 → VOUT rises slightly (ripple up).'
          : charge === 'discharge'
            ? 'iL < iLOAD → iC < 0 → VOUT falls slightly (ripple down).'
            : 'iL ≈ iLOAD, so the capacitor current is near zero.'}
      </Eq>

      <Eq label="Stored energy">
        E<sub>L</sub> = ½ L i<sub>L</sub>² = {formatFixed(instant.energyL * 1e6, 2)} µJ
        <br />
        E<sub>C</sub> = ½ C V<sub>OUT</sub>² = {formatFixed(instant.energyC * 1e3, 2)} mJ
      </Eq>

      <ul className="eq-notes">
        <li>{slopeNote}</li>
        <li>The capacitor and load are in parallel, so v<sub>C</sub> = v<sub>OUT</sub>. They do not have separate series voltage drops.</li>
        <li>The capacitor can still charge early in OFF if i<sub>L</sub> remains greater than i<sub>LOAD</sub>.</li>
      </ul>
    </aside>
  )
}

function Eq({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="eq-block">
      <h3>{label}</h3>
      <p>{children}</p>
    </div>
  )
}
