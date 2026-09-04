import type { BuckParams, Instant } from '../sim/types.ts'
import { capacitorCharging } from '../sim/physics.ts'
import { formatFixed, formatSi } from './format.ts'

export type CircuitHighlight =
  | 'vin'
  | 'switch'
  | 'vsw'
  | 'diode'
  | 'inductor'
  | 'capacitor'
  | 'load'
  | 'ground'
  | 'path-on'
  | 'path-off'

export type TransformStage = 1 | 2 | 3 | 4 | 5 | 6

type Point = { x: number; y: number }

const ON_PATH: Point[] = [
  { x: 78, y: 70 },
  { x: 300, y: 70 },
  { x: 560, y: 70 },
  { x: 700, y: 70 },
  { x: 700, y: 318 },
  { x: 78, y: 318 },
]

const OFF_PATH: Point[] = [
  { x: 300, y: 318 },
  { x: 300, y: 70 },
  { x: 560, y: 70 },
  { x: 700, y: 70 },
  { x: 700, y: 318 },
  { x: 300, y: 318 },
]

const CAP_PATH_UP: Point[] = [
  { x: 560, y: 318 },
  { x: 560, y: 70 },
]

export type UnsetPart = 'switch' | 'diode' | 'inductor' | 'capacitor'

interface CircuitSvgProps {
  instant: Instant
  params: BuckParams
  showMosfet: boolean
  highlights?: CircuitHighlight[]
  reducedMotion?: boolean
  stage?: TransformStage
  onNodeClick?: (id: CircuitHighlight) => void
  pickMode?: boolean
  unsetParts?: UnsetPart[]
  hideReadouts?: boolean
  heat?: { switch?: number; diode?: number }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function polylineLength(points: Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return length
}

function pointAt(points: Point[], u: number): Point {
  const total = polylineLength(points)
  let remain = ((u % 1) + 1) % 1 * total
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    const seg = Math.hypot(dx, dy)
    if (remain <= seg) {
      const t = seg === 0 ? 0 : remain / seg
      return { x: lerp(points[i - 1].x, points[i].x, t), y: lerp(points[i - 1].y, points[i].y, t) }
    }
    remain -= seg
  }
  return points[points.length - 1]
}

function voltageFill(voltage: number, vin: number): string {
  const u = Math.max(-0.15, Math.min(1, voltage / Math.max(vin, 1)))
  if (u < 0) {
    const t = Math.min(1, -u / 0.15)
    return `rgb(${Math.round(70 + 20 * t)} ${Math.round(90 + 10 * t)} ${Math.round(110 + 30 * t)})`
  }
  const r = Math.round(70 + u * 140)
  const g = Math.round(86 + u * 20)
  const b = Math.round(96 - u * 40)
  return `rgb(${r} ${g} ${b})`
}

function visibleAt(stage: TransformStage | undefined, need: TransformStage): boolean {
  return (stage ?? 6) >= need
}

export function CircuitSvg({
  instant,
  params,
  showMosfet,
  highlights = [],
  reducedMotion = false,
  stage,
  onNodeClick,
  pickMode = false,
  unsetParts = [],
  hideReadouts = false,
  heat,
}: CircuitSvgProps) {
  const on = instant.phase === 'on'
  const off = instant.phase === 'off'
  const dcm = instant.phase === 'dcm'
  const charge = capacitorCharging(instant.iL, instant.iLoad)
  const hi = (key: CircuitHighlight) => (highlights.includes(key) ? ' is-lit' : '')
  const vin = Math.max(params.vin, 1)
  const field = Math.min(1, instant.energyL / Math.max(0.5 * params.L * (instant.iLoad + 1) ** 2, 1e-9))
  const capFill = Math.min(1, Math.max(0, instant.vC / vin))
  const phase = reducedMotion ? 0.25 : (instant.t * params.fs * 4) % 1
  const onSpeed = Math.min(1.4, Math.abs(instant.iIn) / Math.max(instant.iLoad, 0.15))
  const offSpeed = Math.min(1.4, Math.abs(instant.iD) / Math.max(instant.iLoad, 0.15))
  const showOn = visibleAt(stage, 2) && on && Math.abs(instant.iIn) > 1e-4
  const showOff = visibleAt(stage, 3) && off && instant.diodeOn && Math.abs(instant.iD) > 1e-4
  const showL = visibleAt(stage, 4) && params.hasInductor
  const showC = visibleAt(stage, 5) && params.hasCapacitor
  const showR = visibleAt(stage, 6)
  const click = (id: CircuitHighlight) => (pickMode && onNodeClick ? () => onNodeClick(id) : undefined)

  const particles = (path: Point[], count: number, speed: number, active: boolean, color: string) => {
    if (!active) return null
    return Array.from({ length: count }, (_, i) => {
      const u = reducedMotion ? (i + 0.5) / count : (phase * speed + i / count) % 1
      const p = pointAt(path, u)
      return <circle key={`${color}-${i}`} cx={p.x} cy={p.y} r={3.1} fill={color} className="current-dot" />
    })
  }

  return (
    <svg
      className="circuit-svg"
      viewBox="0 0 800 390"
      role="img"
      aria-label={`Buck converter, switch ${on ? 'ON' : 'OFF'}, ${instant.modeHint}, inductor current ${formatFixed(instant.iL, 2, 'A')}`}
    >
      <title>Asynchronous buck converter</title>
      <desc>
        VIN feeds a controlled switch into the switch node. A freewheeling diode sits from ground to the switch node.
        An inductor connects the switch node to the output. A capacitor and load resistor sit in parallel from VOUT to ground.
      </desc>

      <line className={`wire${hi('ground')}`} x1="78" y1="318" x2="700" y2="318" />
      <GroundSymbol x={78} y={318} />
      <GroundSymbol x={300} y={318} />
      <GroundSymbol x={560} y={318} />
      <GroundSymbol x={700} y={318} />

      <g className={`comp vin${hi('vin')}${pickMode ? ' is-pick' : ''}`} onClick={click('vin')} role={pickMode ? 'button' : undefined}>
        <line className="wire" x1="78" y1="70" x2="78" y2="132" />
        <line className="wire" x1="78" y1="256" x2="78" y2="318" />
        <line x1="58" y1="148" x2="98" y2="148" stroke="currentColor" strokeWidth="3.5" />
        <line x1="66" y1="168" x2="90" y2="168" stroke="currentColor" strokeWidth="3.5" />
        <line x1="58" y1="220" x2="98" y2="220" stroke="currentColor" strokeWidth="3.5" />
        <line x1="66" y1="240" x2="90" y2="240" stroke="currentColor" strokeWidth="3.5" />
        <line className="wire" x1="78" y1="168" x2="78" y2="220" />
        <text x="36" y="198" className="label-strong">VIN</text>
        <text x="28" y="128" className="value">{formatFixed(params.vin, 2, 'V')}</text>
        <text x="92" y="146" className="tiny">+</text>
        <text x="92" y="248" className="tiny">−</text>
        <PotentialMarker x={18} y={70} height={248} voltage={params.vin} vin={vin} label="VIN" />
      </g>

      {visibleAt(stage, 2) ? (
        <g className={`comp switch${hi('switch')}${pickMode ? ' is-pick' : ''}`} onClick={click('switch')}>
          {heat?.switch ? (
            <circle cx="188" cy="70" r={28 + heat.switch * 10} className="hot-glow" style={{ ['--heat' as string]: heat.switch }} />
          ) : null}
          <line className="wire" x1="78" y1="70" x2={showMosfet ? 148 : 156} y2="70" />
          {showMosfet ? (
            <Mosfet closed={on} />
          ) : (
            <KnifeSwitch closed={on} />
          )}
          <text x="168" y="38" className="label-strong">
            {unsetParts.includes('switch') ? 'MOSFET ?' : showMosfet ? 'N-MOSFET' : 'Switch'}
          </text>
          <text x="154" y="54" className="tiny">
            {unsetParts.includes('switch')
              ? 'unselected'
              : params.switchMode === 'stuckOn'
                ? 'welded ON'
                : params.switchMode === 'stuckOff'
                  ? 'removed / open'
                  : on ? 'ON · low vDS' : 'OFF · i ≈ 0'}
          </text>
        </g>
      ) : (
        <line className="wire is-dim" x1="78" y1="70" x2="300" y2="70" />
      )}

      {visibleAt(stage, 2) ? (
        <g className={`comp vsw${hi('vsw')}${pickMode ? ' is-pick' : ''}`} onClick={click('vsw')}>
          <line className="wire" x1="236" y1="70" x2="300" y2="70" />
          <circle cx="300" cy="70" r="5.5" fill={voltageFill(instant.vSW, vin)} stroke="#2c2a26" strokeWidth="1.4" />
          <text x="308" y="40" className="label-strong">VSW</text>
          <text x="308" y="56" className="value">{hideReadouts ? '—' : formatFixed(instant.vSW, 2, 'V')}</text>
          <PotentialMarker x={268} y={70} height={248} voltage={instant.vSW} vin={vin} label="VSW" />
        </g>
      ) : null}

      {visibleAt(stage, 3) ? (
        <g className={`comp diode${hi('diode')}${params.hasDiode ? '' : ' is-gone'}${pickMode ? ' is-pick' : ''}`} onClick={click('diode')}>
          {heat?.diode ? (
            <circle cx="300" cy="186" r={26 + heat.diode * 10} className="hot-glow" style={{ ['--heat' as string]: heat.diode }} />
          ) : null}
          <line className="wire" x1="300" y1="70" x2="300" y2="132" />
          <line className="wire" x1="300" y1="236" x2="300" y2="318" />
          <polygon
            points="300,148 278,214 322,214"
            fill={instant.diodeOn ? '#c4622a' : 'none'}
            stroke="#2c2a26"
            strokeWidth="2"
          />
          <line x1="278" y1="148" x2="322" y2="148" stroke="#2c2a26" strokeWidth="2.4" />
          <text x="328" y="186" className="label-strong">{unsetParts.includes('diode') ? 'D ?' : 'D'}</text>
          <text x="328" y="202" className="tiny">
            {unsetParts.includes('diode') ? 'unselected' : params.hasDiode ? (instant.diodeOn ? 'forward' : 'reverse') : 'REMOVED'}
          </text>
          {params.hasDiode ? null : <path d="M278 148 L322 214 M322 148 L278 214" stroke="#c4622a" strokeWidth="2" />}
          <text x="232" y="300" className="tiny">anode</text>
          <text x="318" y="136" className="tiny">cathode</text>
        </g>
      ) : null}

      {showL ? (
        <g className={`comp inductor${hi('inductor')}${pickMode ? ' is-pick' : ''}`} onClick={click('inductor')}>
          <line className="wire" x1="300" y1="70" x2="328" y2="70" />
          <InductorCoils x={328} />
          <line className="wire" x1="508" y1="70" x2="560" y2="70" />
          {field > 0.02 ? (
            <g className="field" opacity={0.25 + field * 0.7} aria-hidden="true">
              <ellipse cx="418" cy="70" rx={36 + field * 16} ry={22 + field * 10} />
              <ellipse cx="418" cy="70" rx={50 + field * 18} ry={32 + field * 12} />
            </g>
          ) : null}
          <text x="400" y="28" className="label-strong">{unsetParts.includes('inductor') ? 'L ?' : 'L'}</text>
          <text x="386" y="44" className="tiny">
            {unsetParts.includes('inductor')
              ? 'unselected'
              : instant.leff > 0 && params.isat > 0 && instant.leff < params.L * 0.98
                ? `${formatSi(instant.leff, 'H')} sat`
                : formatSi(params.L, 'H')}
          </text>
          <text x="368" y="118" className="value">vL {hideReadouts ? '—' : formatFixed(instant.vL, 2, 'V')}</text>
          <text x="368" y="134" className="tiny">iL {hideReadouts ? '—' : `${formatFixed(instant.iL, 2, 'A')} →`}</text>
        </g>
      ) : (
        visibleAt(stage, 2) ? (
          <g>
            <line className="wire is-dim" x1="300" y1="70" x2="560" y2="70" strokeDasharray="6 5" />
            <text x="390" y="58" className="tiny">L bypassed</text>
          </g>
        ) : null
      )}

      <g className={`comp vout${hi('capacitor')}${pickMode ? ' is-pick' : ''}`} onClick={click('capacitor')}>
        <circle cx="560" cy="70" r="5.5" fill={voltageFill(instant.vOut, vin)} stroke="#2c2a26" strokeWidth="1.4" />
        <text x="572" y="40" className="label-strong">VOUT</text>
        <text x="572" y="56" className="value">{hideReadouts ? '—' : formatFixed(instant.vOut, 2, 'V')}</text>
        <PotentialMarker x={534} y={70} height={248} voltage={instant.vOut} vin={vin} label="VOUT" />
      </g>

      {showC ? (
        <g className={`comp capacitor${hi('capacitor')}${pickMode ? ' is-pick' : ''}`} onClick={click('capacitor')}>
          <line className="wire" x1="560" y1="70" x2="560" y2="148" />
          <line className="wire" x1="560" y1="236" x2="560" y2="318" />
          <line x1="538" y1="168" x2="582" y2="168" stroke="#2c2a26" strokeWidth="3.2" />
          <line x1="538" y1="216" x2="582" y2="216" stroke="#2c2a26" strokeWidth="3.2" />
          <rect x="546" y={216 - capFill * 40} width="28" height={capFill * 40} fill="#2b5f8a" opacity="0.28" />
          <text x="588" y="198" className="label-strong">{unsetParts.includes('capacitor') ? 'C ?' : 'C'}</text>
          <text x="588" y="214" className="tiny">{unsetParts.includes('capacitor') ? 'unselected' : formatSi(params.C, 'F')}</text>
          <text x="500" y="250" className="tiny">
            {charge === 'charge' ? 'charging' : charge === 'discharge' ? 'discharging' : 'iC ≈ 0'}
          </text>
        </g>
      ) : null}

      {showR ? (
        <g className={`comp load${hi('load')}`}>
          <line className="wire" x1="560" y1="70" x2="700" y2="70" />
          <line className="wire" x1="700" y1="70" x2="700" y2="142" />
          <line className="wire" x1="700" y1="246" x2="700" y2="318" />
          <Resistor x={700} y={142} />
          <text x="718" y="198" className="label-strong">R</text>
          <text x="718" y="214" className="tiny">{formatSi(params.R, 'Ω')}</text>
          <text x="628" y="268" className="tiny">iLOAD {formatFixed(instant.iLoad, 2, 'A')}</text>
        </g>
      ) : (
        showC ? <line className="wire is-dim" x1="560" y1="70" x2="620" y2="70" /> : null
      )}

      <g className={`path-layer${hi(on ? 'path-on' : 'path-off')}`}>
        {showOn ? <polyline className="path-glow on" points={ON_PATH.map((p) => `${p.x},${p.y}`).join(' ')} /> : null}
        {showOff ? <polyline className="path-glow off" points={OFF_PATH.map((p) => `${p.x},${p.y}`).join(' ')} /> : null}
        {particles(ON_PATH, 10, 0.55 + onSpeed, showOn, '#c4622a')}
        {particles(OFF_PATH, 10, 0.55 + offSpeed, showOff, '#2b5f8a')}
        {showC && Math.abs(instant.iC) > 0.02
          ? particles(charge === 'discharge' ? CAP_PATH_UP : [...CAP_PATH_UP].reverse(), 4, 0.45, true, '#3d6b58')
          : null}
      </g>

      <g className="state-chip">
        <rect x="20" y="348" width="760" height="30" rx="4" fill="#efe6d4" stroke="#c9b99a" />
        <text x="36" y="368" className="chip-text">
          {instant.inductiveSpike
            ? 'No diode · inductor current has no freewheel path. VSW spikes violently negative to oppose diL/dt.'
            : !params.hasInductor
              ? 'L bypassed · VSW is tied to VOUT. PWM slams the capacitor; this is not a current-fed buck.'
              : !params.hasCapacitor
                ? 'C removed · VOUT = iL R. The load sees the inductor triangle directly.'
                : params.switchMode === 'stuckOn'
                  ? 'Switch welded ON · this is an RL-C circuit charging toward VIN. No conversion.'
                  : params.switchMode === 'stuckOff'
                    ? 'Switch open · VIN never connects. Stored energy drains into the load.'
                    : dcm
                      ? 'DCM · iL reached 0. Diode off. Capacitor and load hold VOUT until the next ON pulse.'
                      : on
                        ? 'ON · VIN → switch → L → output. Diode reverse-biased. vL > 0 so iL ramps up. Source supplies the load.'
                        : 'OFF · source disconnected. iL keeps flowing left-to-right. vL reverses and the diode freewheels.'}
        </text>
      </g>
    </svg>
  )
}

function KnifeSwitch({ closed }: { closed: boolean }) {
  return (
    <g transform="translate(156 70)">
      <circle cx="0" cy="0" r="4" fill="#f7f1e4" stroke="#2c2a26" strokeWidth="1.6" />
      <circle cx="80" cy="0" r="4" fill="#f7f1e4" stroke="#2c2a26" strokeWidth="1.6" />
      <line
        x1="4"
        y1="0"
        x2={closed ? 76 : 58}
        y2={closed ? 0 : -22}
        stroke="#2c2a26"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line x1="80" y1="0" x2="80" y2="0" />
    </g>
  )
}

function Mosfet({ closed }: { closed: boolean }) {
  return (
    <g transform="translate(168 70)">
      <line className="wire" x1="-20" y1="0" x2="0" y2="0" />
      <line x1="0" y1="-22" x2="0" y2="22" stroke="#2c2a26" strokeWidth="2.2" />
      <line x1="10" y1="-18" x2="10" y2="-6" stroke="#2c2a26" strokeWidth="2.4" />
      <line x1="10" y1="-2" x2="10" y2="10" stroke="#2c2a26" strokeWidth="2.4" />
      <line x1="10" y1="14" x2="10" y2="22" stroke="#2c2a26" strokeWidth="2.4" />
      <line x1="10" y1="-12" x2="36" y2="-12" stroke="#2c2a26" strokeWidth="1.8" />
      <line x1="10" y1="18" x2="36" y2="18" stroke="#2c2a26" strokeWidth="1.8" />
      <line x1="36" y1="-12" x2="36" y2="18" stroke="#2c2a26" strokeWidth="1.8" />
      <line className="wire" x1="36" y1="0" x2="68" y2="0" />
      <polygon points="20,6 10,10 20,14" fill="#2c2a26" />
      <line x1="0" y1="4" x2="-16" y2="28" stroke="#2c2a26" strokeWidth="1.6" />
      <text x="-28" y="44" className="tiny">G · PWM</text>
      <circle cx="36" cy="0" r="3" fill={closed ? '#c4622a' : '#f7f1e4'} stroke="#2c2a26" />
    </g>
  )
}

function InductorCoils({ x }: { x: number }) {
  const loops = [0, 1, 2, 3]
  return (
    <g fill="none" stroke="#2c2a26" strokeWidth="2.1">
      {loops.map((i) => (
        <path key={i} d={`M ${x + i * 45} 70 c 8 -22 37 -22 45 0`} />
      ))}
    </g>
  )
}

function Resistor({ x, y }: { x: number; y: number }) {
  const zig = [0, 1, 2, 3, 4, 5]
  let d = `M ${x} ${y}`
  zig.forEach((i) => {
    d += ` l ${i % 2 === 0 ? 12 : -12} 14`
  })
  d += ` L ${x} ${y + 104}`
  return <path d={d} fill="none" stroke="#2c2a26" strokeWidth="2" />
}

function GroundSymbol({ x, y }: { x: number; y: number }) {
  return (
    <g className="ground" stroke="#2c2a26" strokeWidth="1.6">
      <line x1={x - 12} y1={y} x2={x + 12} y2={y} />
      <line x1={x - 8} y1={y + 6} x2={x + 8} y2={y + 6} />
      <line x1={x - 4} y1={y + 12} x2={x + 4} y2={y + 12} />
    </g>
  )
}

function PotentialMarker({
  x,
  y,
  height,
  voltage,
  vin,
  label,
}: {
  x: number
  y: number
  height: number
  voltage: number
  vin: number
  label: string
}) {
  const u = Math.max(0, Math.min(1, voltage / vin))
  return (
    <g className="potential" aria-label={`${label} potential marker`}>
      <line x1={x} y1={y} x2={x} y2={y + height} stroke="#c9b99a" strokeWidth="2" />
      <rect x={x - 4} y={y + height * (1 - u)} width="8" height={height * u} fill={voltageFill(voltage, vin)} opacity="0.85" />
    </g>
  )
}
