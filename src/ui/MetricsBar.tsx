import type { Metrics } from '../sim/types.ts'
import { formatEfficiency, formatFixed, formatPercent, formatSi } from './format.ts'
import { METRIC_EXPLAINERS, type MetricId } from './metricExplainers.ts'

interface MetricsBarProps {
  metrics: Metrics
  realMode: boolean
  selected: MetricId | null
  onSelect: (id: MetricId | null) => void
}

const ITEMS: { id: MetricId; label: string; text: (m: Metrics) => string }[] = [
  { id: 'vin', label: 'VIN', text: (m) => formatFixed(m.vin, 2, 'V') },
  { id: 'vout', label: 'Avg VOUT', text: (m) => formatFixed(m.vOutAvg, 2, 'V') },
  { id: 'duty', label: 'Duty D', text: (m) => formatPercent(m.duty) },
  { id: 'fs', label: 'fS', text: (m) => formatSi(m.fs, 'Hz') },
  { id: 'iin', label: 'Avg iIN', text: (m) => formatFixed(m.iInAvg, 3, 'A') },
  { id: 'iout', label: 'Avg iOUT', text: (m) => formatFixed(m.iOutAvg, 3, 'A') },
  { id: 'dil', label: 'ΔiL pk-pk', text: (m) => formatFixed(m.iLpkpk, 3, 'A') },
  { id: 'dvout', label: 'ΔVOUT pk-pk', text: (m) => formatFixed(m.vOutPkpk, 3, 'V') },
  { id: 'eta', label: 'Efficiency', text: (m) => formatEfficiency(m.efficiency) },
  { id: 'mode', label: 'Mode', text: (m) => m.mode },
]

export function MetricsBar({ metrics, realMode, selected, onSelect }: MetricsBarProps) {
  const explainer = selected ? METRIC_EXPLAINERS[selected] : null
  return (
    <section className="metrics" aria-label="Live measurements">
      <div className="metric-chips">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={selected === item.id ? 'metric on' : 'metric'}
            onClick={() => onSelect(selected === item.id ? null : item.id)}
            aria-expanded={selected === item.id}
          >
            <span className="metric-label">{item.label}</span>
            <span className="metric-value mono">{item.text(metrics)}</span>
          </button>
        ))}
        {realMode ? (
          <button
            type="button"
            className={selected === 'losses' ? 'metric on' : 'metric'}
            onClick={() => onSelect(selected === 'losses' ? null : 'losses')}
          >
            <span className="metric-label">Losses</span>
            <span className="metric-value mono">{formatFixed(metrics.losses.total, 3, 'W')}</span>
          </button>
        ) : null}
      </div>
      {explainer ? (
        <div className="metric-explain" role="region" aria-label={explainer.title}>
          <h3>{explainer.title}</h3>
          <p>{explainer.body}</p>
          {selected === 'losses' ? (
            <ul>
              <li>MOSFET conduction {formatFixed(metrics.losses.mosfetConduction, 3, 'W')}</li>
              <li>Diode {formatFixed(metrics.losses.diode, 3, 'W')}</li>
              <li>Inductor DCR {formatFixed(metrics.losses.dcr, 3, 'W')}</li>
              <li>Capacitor ESR {formatFixed(metrics.losses.esr, 3, 'W')}</li>
              <li>Switching estimate {formatFixed(metrics.losses.switching, 3, 'W')}</li>
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="metric-hint">Click a measurement to see what it means and which knobs move it.</p>
      )}
    </section>
  )
}
