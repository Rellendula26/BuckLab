import { analyticalRipple } from './formulas.ts'
import { switchingPeriod } from './physics.ts'
import type { BuckParams, Instant, LossBreakdown, Metrics } from './types.ts'

const DEFAULT_TR_TF = 60e-9

function timeWeightedMean(history: Instant[], pick: (sample: Instant) => number): number {
  if (history.length === 0) return 0
  if (history.length === 1) return pick(history[0])
  let energy = 0
  let duration = 0
  for (let i = 1; i < history.length; i += 1) {
    const dt = history[i].t - history[i - 1].t
    if (dt <= 0) continue
    energy += 0.5 * (pick(history[i - 1]) + pick(history[i])) * dt
    duration += dt
  }
  return duration > 0 ? energy / duration : pick(history[history.length - 1])
}

function peakToPeak(values: number[]): number {
  if (values.length === 0) return 0
  let min = values[0]
  let max = values[0]
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  return max - min
}

function switchingLoss(params: BuckParams, history: Instant[]): number {
  if (!params.realMode || history.length < 2) return 0
  let energy = 0
  for (let i = 1; i < history.length; i += 1) {
    if (history[i].switchOn !== history[i - 1].switchOn) {
      const trTf = params.trTf > 0 ? params.trTf : DEFAULT_TR_TF
      energy += 0.5 * params.vin * Math.abs(history[i].iL) * trTf
    }
  }
  const duration = history[history.length - 1].t - history[0].t
  if (duration <= 0) return 0
  return energy / duration
}

function completePeriods(history: Instant[], params: BuckParams): Instant[] {
  if (history.length < 8) return history
  const period = switchingPeriod(params)
  const startT = history[0].t
  const endT = history[history.length - 1].t
  const firstEdge = Math.ceil(startT / period) * period
  const lastEdge = Math.floor(endT / period) * period
  if (lastEdge - firstEdge < period * 0.5) return history
  const slice = history.filter((sample) => sample.t >= firstEdge && sample.t < lastEdge)
  return slice.length > 8 ? slice : history
}

export function metricsFromHistory(
  params: BuckParams,
  history: Instant[],
  options: { expectedVout?: number } = {},
): Metrics {
  history = completePeriods(history, params)
  if (history.length === 0) {
    const emptyLosses: LossBreakdown = {
      mosfetConduction: 0,
      diode: 0,
      dcr: 0,
      esr: 0,
      switching: 0,
      total: 0,
    }
    return {
      vin: params.vin,
      vOutAvg: 0,
      duty: params.duty,
      fs: params.fs,
      iInAvg: 0,
      iOutAvg: 0,
      iLpkpk: 0,
      vOutPkpk: 0,
      pIn: 0,
      pOut: 0,
      efficiency: 0,
      mode: 'CCM',
      losses: emptyLosses,
      deltaIlApprox: 0,
      deltaVoutApprox: 0,
      deltaVoutEsrApprox: 0,
      iLmin: 0,
      iLmax: 0,
    }
  }

  const vOuts = history.map((s) => s.vOut)
  const iLs = history.map((s) => s.iL)
  const vOutAvg = timeWeightedMean(history, (s) => s.vOut)
  const iInAvg = timeWeightedMean(history, (s) => s.iIn)
  const iOutAvg = timeWeightedMean(history, (s) => s.iLoad)
  const pIn = timeWeightedMean(history, (s) => params.vin * s.iIn)
  const pOut = timeWeightedMean(history, (s) => s.vOut * s.iLoad)
  const sawDcm = history.some((sample) => sample.phase === 'dcm')

  const losses: LossBreakdown = {
    mosfetConduction: timeWeightedMean(history, (s) => s.pMosfet),
    diode: timeWeightedMean(history, (s) => s.pDiode),
    dcr: timeWeightedMean(history, (s) => s.pDcr),
    esr: timeWeightedMean(history, (s) => s.pEsr),
    switching: switchingLoss(params, history),
    total: 0,
  }
  losses.total = losses.mosfetConduction + losses.diode + losses.dcr + losses.esr + losses.switching

  const ripple = analyticalRipple(params, options.expectedVout ?? vOutAvg)
  const efficiency = pIn > 1e-12 ? (pOut / pIn) * 100 : 0

  return {
    vin: params.vin,
    vOutAvg,
    duty: params.duty,
    fs: params.fs,
    iInAvg,
    iOutAvg,
    iLpkpk: peakToPeak(iLs),
    vOutPkpk: peakToPeak(vOuts),
    pIn,
    pOut,
    efficiency: Math.min(100, Math.max(0, efficiency)),
    mode: sawDcm ? 'DCM' : 'CCM',
    losses,
    deltaIlApprox: ripple.deltaIl,
    deltaVoutApprox: ripple.deltaVcap,
    deltaVoutEsrApprox: ripple.deltaVesr,
    iLmin: iLs.length ? Math.min(...iLs) : 0,
    iLmax: iLs.length ? Math.max(...iLs) : 0,
  }
}
