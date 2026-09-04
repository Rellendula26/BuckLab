import { analyticalRipple, idealCcmVout } from './formulas.ts'
import {
  clamp,
  deriveInstant,
  guessedOperatingPoint,
  IL_FLOOR,
  pwmHigh,
  stateDerivatives,
  switchingPeriod,
} from './physics.ts'
import type { BuckParams, BuckState, Instant, Metrics, SettleOptions } from './types.ts'
import { metricsFromHistory } from './metrics.ts'

export const DEFAULT_STEPS_PER_PERIOD = 400
export const DEFAULT_SETTLE_PERIODS = 48
export const DEFAULT_CAPTURE_PERIODS = 4

export function recommendedSettlePeriods(params: BuckParams): number {
  const period = switchingPeriod(params)
  const tau = Math.max(params.R * params.C, params.L / Math.max(params.R, 1e-6))
  const needed = Math.ceil((6 * tau) / period)
  return clamp(needed + 16, 32, 600)
}

export function cloneState(state: BuckState): BuckState {
  return { t: state.t, iL: state.iL, vC: state.vC }
}

function applyClamp(next: BuckState, params: BuckParams): BuckState {
  let iL = next.iL
  let vC = next.vC
  if (iL < 0) iL = 0
  if (!params.hasCapacitor) vC = iL * params.R
  return { t: next.t, iL, vC }
}

export function stepHeun(state: BuckState, params: BuckParams, dt: number): BuckState {
  const k1 = stateDerivatives(state, params)
  const mid: BuckState = applyClamp(
    {
      t: state.t + dt,
      iL: state.iL + k1.diL * dt,
      vC: state.vC + k1.dvC * dt,
    },
    params,
  )
  const k2 = stateDerivatives(mid, params)
  const next = applyClamp(
    {
      t: state.t + dt,
      iL: state.iL + 0.5 * (k1.diL + k2.diL) * dt,
      vC: state.vC + 0.5 * (k1.dvC + k2.dvC) * dt,
    },
    params,
  )
  if (!pwmHigh(next.t, params) && next.iL <= IL_FLOOR) {
    return { t: next.t, iL: 0, vC: next.vC }
  }
  return next
}

export function physicsDt(params: BuckParams, stepsPerPeriod = DEFAULT_STEPS_PER_PERIOD): number {
  return switchingPeriod(params) / stepsPerPeriod
}

function dtUntilPwmEdge(t: number, params: BuckParams, dt: number): number {
  if (params.duty <= 0 || params.duty >= 1) return dt
  const period = switchingPeriod(params)
  const frac = t / period - Math.floor(t / period)
  const toEdge = frac < params.duty
    ? (params.duty - frac) * period
    : (1 - frac) * period
  if (toEdge > 1e-18 && toEdge < dt) return toEdge
  return dt
}

export function advance(
  state: BuckState,
  params: BuckParams,
  dt: number,
): { state: BuckState; instant: Instant } {
  const first = dtUntilPwmEdge(state.t, params, dt)
  let next = stepHeun(state, params, first)
  if (first < dt - 1e-18) {
    next = stepHeun(next, params, dt - first)
  }
  return { state: next, instant: deriveInstant(next, params) }
}

export function advanceMany(
  state: BuckState,
  params: BuckParams,
  totalTime: number,
  dt: number,
  onSample?: (instant: Instant, state: BuckState) => void,
): { state: BuckState; last: Instant } {
  let current = cloneState(state)
  let last = deriveInstant(current, params)
  const target = current.t + totalTime
  let guard = 0
  const maxSteps = Math.ceil(totalTime / dt) + 8
  while (current.t < target - dt * 0.25 && guard < maxSteps) {
    const stepped = advance(current, params, dt)
    current = stepped.state
    last = stepped.instant
    onSample?.(last, current)
    guard += 1
  }
  return { state: current, last }
}

export function settleSimulation(
  params: BuckParams,
  options: SettleOptions = {},
): { state: BuckState; history: Instant[]; metrics: Metrics } {
  const stepsPerPeriod = options.stepsPerPeriod ?? DEFAULT_STEPS_PER_PERIOD
  const capturePeriods = options.capturePeriods ?? (params.startupFromZero ? 36 : DEFAULT_CAPTURE_PERIODS)
  const settlePeriods = params.startupFromZero
    ? 0
    : (options.periods ?? recommendedSettlePeriods(params))
  const dt = physicsDt(params, stepsPerPeriod)
  const period = switchingPeriod(params)

  let state = guessedOperatingPoint(params)
  if (settlePeriods > 0) {
    state = advanceMany(state, params, settlePeriods * period, dt).state
  }

  const history: Instant[] = []
  const captured = advanceMany(
    state,
    params,
    capturePeriods * period,
    dt,
    (instant) => {
      history.push(instant)
    },
  )

  const idealVout = idealCcmVout(params.vin, params.duty)
  const metrics = metricsFromHistory(params, history, {
    expectedVout: captured.last.vOut || idealVout,
  })

  return { state: captured.state, history, metrics }
}

/** Continue from an existing state without re-guessing the operating point. */
export function continueSimulation(
  state: BuckState,
  params: BuckParams,
  options: SettleOptions = {},
): { state: BuckState; history: Instant[]; metrics: Metrics } {
  const stepsPerPeriod = options.stepsPerPeriod ?? DEFAULT_STEPS_PER_PERIOD
  const capturePeriods = options.capturePeriods ?? DEFAULT_CAPTURE_PERIODS
  const dt = physicsDt(params, stepsPerPeriod)
  const period = switchingPeriod(params)
  const history: Instant[] = []
  const captured = advanceMany(
    cloneState(state),
    params,
    capturePeriods * period,
    dt,
    (instant) => {
      history.push(instant)
    },
  )
  const metrics = metricsFromHistory(params, history, {
    expectedVout: captured.last.vOut || idealCcmVout(params.vin, params.duty),
  })
  return { state: captured.state, history, metrics }
}

export function historyWindowDuration(history: Instant[]): number {
  if (history.length < 2) return 0
  return history[history.length - 1].t - history[0].t
}

export function sampleAtTime(history: Instant[], t: number): Instant {
  if (history.length === 0) {
    throw new Error('empty history')
  }
  const start = history[0].t
  const end = history[history.length - 1].t
  const span = end - start
  if (span <= 0) return history[0]
  let wrapped = t
  if (t < start || t > end) {
    const frac = ((t - start) % span + span) % span
    wrapped = start + frac
  }
  let lo = 0
  let hi = history.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (history[mid].t < wrapped) lo = mid + 1
    else hi = mid
  }
  const idx = clampIndex(lo, history.length)
  const prev = history[Math.max(0, idx - 1)]
  const cur = history[idx]
  return Math.abs(cur.t - wrapped) < Math.abs(prev.t - wrapped) ? cur : prev
}

function clampIndex(index: number, length: number): number {
  return Math.min(length - 1, Math.max(0, index))
}

export function indexAtTime(history: Instant[], t: number): number {
  const sample = sampleAtTime(history, t)
  return history.findIndex((item) => item.t === sample.t && item.iL === sample.iL)
}

export function stateFromInstant(instant: Instant): BuckState {
  return { t: instant.t, iL: instant.iL, vC: instant.vC }
}

export function nextPhaseTime(
  t: number,
  params: BuckParams,
  target: 'on' | 'off',
): number {
  const period = switchingPeriod(params)
  const frac = t / period - Math.floor(t / period)
  const cycleStart = t - frac * period
  if (target === 'on') {
    if (frac < params.duty && pwmHigh(t, params)) {
      return cycleStart + period
    }
    if (frac >= params.duty) {
      return cycleStart + period
    }
    return cycleStart
  }
  const offTime = cycleStart + params.duty * period
  if (frac < params.duty) return offTime
  return offTime + period
}

export function advanceToPhase(
  state: BuckState,
  params: BuckParams,
  target: 'on' | 'off',
  dt: number,
): { state: BuckState; historyDelta: Instant[] } {
  const historyDelta: Instant[] = []
  let current = cloneState(state)
  const startPhase = deriveInstant(current, params).phase
  const maxTime = switchingPeriod(params) * 2.2
  const end = current.t + maxTime
  let leftStart = startPhase !== target
  let extra = 0
  const extraNeeded = Math.max(8, Math.round(DEFAULT_STEPS_PER_PERIOD * 0.08))

  while (current.t < end) {
    const stepped = advance(current, params, dt)
    current = stepped.state
    historyDelta.push(stepped.instant)
    if (!leftStart && stepped.instant.phase !== target) leftStart = true
    if (leftStart && stepped.instant.phase === target) {
      extra += 1
      if (extra >= extraNeeded) break
    }
  }
  return { state: current, historyDelta }
}

export function appendHistory(history: Instant[], incoming: Instant[], maxSamples: number): Instant[] {
  const merged = history.concat(incoming)
  if (merged.length <= maxSamples) return merged
  return merged.slice(merged.length - maxSamples)
}

export function recommendedCaptureSamples(
  stepsPerPeriod = DEFAULT_STEPS_PER_PERIOD,
  capturePeriods = DEFAULT_CAPTURE_PERIODS,
): number {
  return stepsPerPeriod * capturePeriods + 8
}

export function rippleEstimates(params: BuckParams, vOut: number) {
  return analyticalRipple(params, vOut)
}
