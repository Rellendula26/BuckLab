import { useState } from 'react'
import { formatFixed, formatPercent, formatSi } from './format.ts'

export function ComparisonPanel() {
  const [vin, setVin] = useState(12)
  const [vOut, setVout] = useState(5)
  const [iOut, setIout] = useState(1)
  const [rLoad, setRload] = useState(10_000)

  const pOut = vOut * iOut
  const ldoLoss = Math.max(0, vin - vOut) * iOut
  const ldoEta = vin > 0 ? (vOut / vin) * 100 : 0
  const buckEta = 0.94
  const buckLoss = pOut / buckEta - pOut

  const r2 = 10_000
  const r1 = r2 * (vin / Math.max(vOut, 0.2) - 1)
  const r2p = 1 / (1 / r2 + 1 / Math.max(rLoad, 0.1))
  const dividerV = vin * r2p / (r1 + r2p)
  const dividerIin = vin / (r1 + r2p)
  const dividerPout = dividerV * (dividerV / Math.max(rLoad, 0.1))
  const dividerPin = vin * dividerIin

  return (
    <section className="compare-topos">
      <h2>Voltage divider · linear regulator · buck</h2>
      <div className="compare-controls">
        <label>VIN <input type="range" min={6} max={24} step={0.1} value={vin} onChange={(e) => setVin(Number(e.target.value))} /> <span className="mono">{formatFixed(vin, 1, 'V')}</span></label>
        <label>Target VOUT <input type="range" min={1} max={vin - 0.5} step={0.1} value={Math.min(vOut, vin - 0.5)} onChange={(e) => setVout(Number(e.target.value))} /> <span className="mono">{formatFixed(vOut, 1, 'V')}</span></label>
        <label>Load current <input type="range" min={0.05} max={3} step={0.05} value={iOut} onChange={(e) => setIout(Number(e.target.value))} /> <span className="mono">{formatFixed(iOut, 2, 'A')}</span></label>
        <label>Divider load R <input type="range" min={2} max={5} step={0.01} value={Math.log10(rLoad)} onChange={(e) => setRload(10 ** Number(e.target.value))} /> <span className="mono">{formatSi(rLoad, 'Ω')}</span></label>
      </div>

      <div className="compare-cards">
        <article>
          <h3>Voltage divider</h3>
          <p>Best for low-current references. The load becomes part of the divider, so VOUT moves when the load moves.</p>
          <p className="mono">No-load ≈ {formatFixed(vOut, 2, 'V')} · with this load ≈ {formatFixed(dividerV, 2, 'V')}</p>
          <p className="mono">η ≈ {formatPercent(dividerPin > 0 ? dividerPout / dividerPin : 0)}</p>
          <p>A poor choice for delivering meaningful regulated power.</p>
        </article>
        <article>
          <h3>Linear regulator</h3>
          <p>A pass transistor continuously carries IOUT while supporting VIN − VOUT.</p>
          <p className="mono">PLOSS ≈ (VIN − VOUT) IOUT = {formatFixed(ldoLoss, 2, 'W')}</p>
          <p className="mono">η ≈ VOUT/VIN = {formatFixed(ldoEta, 1)}%</p>
          <p>Simple, generally quiet. Useful for small loads, small drops, analog references, sensors, and comparators.</p>
        </article>
        <article>
          <h3>Buck converter</h3>
          <p>Switches rather than sitting in the linear region. Energy is stored and released instead of being burned as (VIN − VOUT) IOUT.</p>
          <p className="mono">Illustrative η ≈ {formatFixed(buckEta * 100, 0)}% · PLOSS ≈ {formatFixed(buckLoss, 2, 'W')}</p>
          <p>Usually the right choice for large drops or real load current. The price is ripple, EMI, and control complexity.</p>
        </article>
      </div>

      <h3>Buck vs boost</h3>
      <div className="buck-boost">
        <svg viewBox="0 0 280 110" role="img" aria-label="Buck places the switch before the inductor">
          <text x="8" y="18" className="label-strong">Buck</text>
          <path d="M20 50 H70" stroke="#2c2a26" fill="none" />
          <rect x="70" y="38" width="28" height="24" fill="none" stroke="#c4622a" />
          <text x="74" y="54" className="tiny">SW</text>
          <path d="M98 50 H130 c 8 -16 24 -16 32 0 H200" stroke="#2c2a26" fill="none" />
          <path d="M114 50 V86" stroke="#2b5f8a" fill="none" />
          <text x="200" y="46" className="tiny">VOUT &lt; VIN</text>
        </svg>
        <svg viewBox="0 0 280 110" role="img" aria-label="Boost places the inductor at the input">
          <text x="8" y="18" className="label-strong">Boost</text>
          <path d="M20 50 H70 c 8 -16 24 -16 32 0 H140" stroke="#2c2a26" fill="none" />
          <path d="M102 50 V86" stroke="#c4622a" fill="none" />
          <rect x="96" y="86" width="16" height="10" fill="none" stroke="#c4622a" />
          <path d="M140 50 H200" stroke="#2b5f8a" fill="none" />
          <text x="200" y="46" className="tiny">VOUT &gt; VIN</text>
        </svg>
      </div>
      <p>
        Both use a switch, diode, inductor, and capacitor, but the arrangement changes the energy path.
        A buck puts the switch in front of the inductor so the output sees a duty-weighted average of VIN.
        A boost puts the inductor at the input and later stacks the inductor’s released energy in series with the source, raising the output.
      </p>
    </section>
  )
}
