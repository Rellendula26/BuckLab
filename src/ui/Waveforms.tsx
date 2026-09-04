import { useMemo, useRef } from 'react'
import type { Instant, WaveformId } from '../sim/types.ts'
import { formatFixed, formatSi } from './format.ts'

interface TraceDef {
  id: WaveformId
  label: string
  unit: string
  color: string
  note: string
}

export const TRACE_DEFS: TraceDef[] = [
  { id: 'pwm', label: 'PWM / gate', unit: '', color: '#2c2a26', note: 'Rectangular command. High means the switch should be ON.' },
  { id: 'vSW', label: 'vSW', unit: 'V', color: '#c4622a', note: 'Switch node. ≈ VIN while ON, ≈ 0 (−VF if real) while the diode conducts.' },
  { id: 'vL', label: 'vL', unit: 'V', color: '#2b5f8a', note: 'Rectangular: VIN − VOUT while ON, ≈ −VOUT while OFF. Polarity, not current direction.' },
  { id: 'iL', label: 'iL', unit: 'A', color: '#1f4e79', note: 'Triangle in CCM. vL = L diL/dt, so a rectangle in voltage integrates to a ramp in current.' },
  { id: 'iIN', label: 'iIN', unit: 'A', color: '#a8441f', note: 'Pulsed. Input current exists primarily during the ON interval.' },
  { id: 'iD', label: 'iD', unit: 'A', color: '#8a4b2f', note: 'Exists during OFF and follows iL. Zero in DCM after the inductor empties.' },
  { id: 'iC', label: 'iC', unit: 'A', color: '#3d6b58', note: 'iC = iL − iLOAD. Oscillates around zero; positive means the capacitor is charging.' },
  { id: 'iLOAD', label: 'iLOAD', unit: 'A', color: '#5c574e', note: 'Nearly DC because iLOAD = VOUT / R and VOUT is nearly constant.' },
  { id: 'vOUT', label: 'VOUT', unit: 'V', color: '#c4622a', note: 'DC with small periodic ripple — not a perfectly flat rail.' },
]

const VALUE: Record<WaveformId, (s: Instant) => number> = {
  pwm: (s) => s.pwm,
  vSW: (s) => s.vSW,
  vL: (s) => s.vL,
  iL: (s) => s.iL,
  iIN: (s) => s.iIn,
  iD: (s) => s.iD,
  iC: (s) => s.iC,
  iLOAD: (s) => s.iLoad,
  vOUT: (s) => s.vOut,
}

interface WaveformsProps {
  history: Instant[]
  instant: Instant
  enabled: WaveformId[]
  onToggle: (id: WaveformId) => void
  onScrub: (sample: Instant | null) => void
  onScrubEnd: () => void
  hideToggles?: boolean
  markers?: { t: number; label: string }[]
}

export function Waveforms({ history, instant, enabled, onToggle, onScrub, onScrubEnd, hideToggles = false, markers = [] }: WaveformsProps) {
  const traces = TRACE_DEFS.filter((def) => enabled.includes(def.id))
  const width = 920
  const rowH = 78
  const left = 58
  const right = 18
  const plotW = width - left - right
  const height = Math.max(120, traces.length * rowH + 28)

  const t0 = history[0]?.t ?? 0
  const t1 = history[history.length - 1]?.t ?? 1
  const span = Math.max(t1 - t0, 1e-12)
  const xOf = (t: number) => left + ((t - t0) / span) * plotW
  const cursorX = xOf(instant.t)

  const ranges = useMemo(() => {
    const map = new Map<WaveformId, { min: number; max: number }>()
    for (const def of TRACE_DEFS) {
      const values = history.map((s) => VALUE[def.id](s))
      let min = Math.min(...values, 0)
      let max = Math.max(...values, 0)
      if (def.id === 'pwm') {
        min = -0.1
        max = 1.1
      }
      if (max - min < 1e-6) {
        min -= 0.5
        max += 0.5
      }
      const pad = 0.08 * (max - min)
      map.set(def.id, { min: min - pad, max: max + pad })
    }
    return map
  }, [history])

  const svgRef = useRef<SVGSVGElement>(null)

  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || history.length === 0) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    const u = Math.min(1, Math.max(0, (x - left) / plotW))
    const t = t0 + u * span
    let best = history[0]
    let bestErr = Infinity
    for (const sample of history) {
      const err = Math.abs(sample.t - t)
      if (err < bestErr) {
        best = sample
        bestErr = err
      }
    }
    onScrub(best)
  }

  return (
    <section className="waveforms" aria-label="Synchronized waveforms">
      {hideToggles ? null : <div className="wave-toggles" role="group" aria-label="Waveform visibility">
        {TRACE_DEFS.map((def) => (
          <label key={def.id} className={enabled.includes(def.id) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={enabled.includes(def.id)}
              onChange={() => onToggle(def.id)}
            />
            <span style={{ color: def.color }}>{def.label}</span>
          </label>
        ))}
      </div>}

      <svg
        ref={svgRef}
        className="wave-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Time-aligned converter waveforms. Hover or drag to scrub the circuit to that instant."
        onPointerDown={(event) => {
          ;(event.target as Element).setPointerCapture?.(event.pointerId)
          pick(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.buttons) pick(event.clientX)
        }}
        onPointerUp={onScrubEnd}
        onPointerLeave={onScrubEnd}
      >
        {traces.map((def, index) => {
          const y0 = 10 + index * rowH
          const range = ranges.get(def.id) ?? { min: -1, max: 1 }
          const yOf = (v: number) => y0 + 12 + (1 - (v - range.min) / (range.max - range.min)) * (rowH - 24)
          const d = history.map((s, i) => {
            const x = xOf(s.t)
            const y = yOf(VALUE[def.id](s))
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
          }).join(' ')
          const zeroY = range.min < 0 && range.max > 0 ? yOf(0) : null
          return (
            <g key={def.id}>
              <text x="8" y={y0 + 18} className="wave-label" fill={def.color}>{def.label}</text>
              <text x="8" y={y0 + 34} className="wave-unit">{def.unit || ' '}</text>
              <line x1={left} y1={y0 + 8} x2={left} y2={y0 + rowH - 10} stroke="#c9b99a" />
              {zeroY !== null ? (
                <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="#d7cbb3" strokeDasharray="3 4" />
              ) : null}
              <path d={d} fill="none" stroke={def.color} strokeWidth="1.7" />
              <text x={width - 8} y={y0 + 18} className="wave-now" textAnchor="end">
                {formatFixed(VALUE[def.id](instant), 2, def.unit)}
              </text>
            </g>
          )
        })}
        {markers.map((marker) => {
          const x = xOf(marker.t)
          return (
            <g key={`${marker.t}-${marker.label}`}>
              <line x1={x} y1="8" x2={x} y2={height - 16} stroke="#c4622a" strokeDasharray="4 3" strokeWidth="1.2" />
              <text x={x + 4} y="16" className="wave-unit" fill="#c4622a">{marker.label}</text>
            </g>
          )
        })}
        <line x1={cursorX} y1="8" x2={cursorX} y2={height - 16} className="cursor" />
        <text x={left} y={height - 2} className="wave-unit">
          {formatSi(span, 's')} window · drag to inspect an instant
        </text>
      </svg>
    </section>
  )
}
