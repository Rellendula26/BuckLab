import type { Instant } from './types.ts'

export interface VoltSecondAreas {
  positive: number
  negative: number
  net: number
  onIdeal: number
  offIdeal: number
}

export function voltSecondAreas(history: Instant[]): VoltSecondAreas {
  let positive = 0
  let negative = 0
  for (let i = 1; i < history.length; i += 1) {
    const dt = history[i].t - history[i - 1].t
    if (dt <= 0) continue
    const v = 0.5 * (history[i - 1].vL + history[i].vL)
    if (v >= 0) positive += v * dt
    else negative += v * dt
  }
  return {
    positive,
    negative,
    net: positive + negative,
    onIdeal: 0,
    offIdeal: 0,
  }
}

export function idealVoltSecondTerms(vin: number, vOut: number, duty: number, period: number) {
  const on = (vin - vOut) * duty * period
  const off = -vOut * (1 - duty) * period
  return { on, off, net: on + off }
}

export function inductorCurrentDrift(history: Instant[], period: number): number {
  if (history.length < 2 || period <= 0) return 0
  const start = history[0].t
  const first = history.find((s) => s.t >= start)
  const later = history.find((s) => s.t >= start + period * 0.98)
  if (!first || !later) return history[history.length - 1].iL - history[0].iL
  return later.iL - first.iL
}
