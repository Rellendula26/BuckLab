import { capacitorRippleApprox, esrRippleApprox, idealCcmVout, inductorRippleApprox } from './formulas.ts'
import { continueSimulation, physicsDt, settleSimulation } from './integrate.ts'
import { deriveInstant } from './physics.ts'
import type { BuckParams, BuckState, Instant, Metrics } from './types.ts'

export interface DesignRequirements {
  vin: number
  vOutTarget: number
  iOutMax: number
  rippleVmax: number
  rippleIlMin: number
  rippleIlMax: number
  efficiencyMin: number
  ta: number
  tjMax: number
  voltageMargin: number
}

export const DESIGN_REQUIREMENTS: DesignRequirements = {
  vin: 12,
  vOutTarget: 5,
  iOutMax: 2,
  rippleVmax: 0.05,
  rippleIlMin: 0.2,
  rippleIlMax: 0.4,
  efficiencyMin: 0.9,
  ta: 25,
  tjMax: 125,
  voltageMargin: 1.2,
}

export interface MosfetPart {
  id: string
  name: string
  note: string
  vdsMax: number
  idMax: number
  rdsOn: number
  qg: number
  tr: number
  tf: number
  thetaJa: number
}

export interface DiodePart {
  id: string
  name: string
  note: string
  vf: number
  ifMax: number
  vrMax: number
  recovery: 'none' | 'fast' | 'slow'
  thetaJa: number
}

export interface InductorPart {
  id: string
  name: string
  note: string
  L: number
  dcr: number
  isat: number
}

export interface CapacitorPart {
  id: string
  name: string
  note: string
  C: number
  esr: number
  vRated: number
}

export type CheckStatus = 'PASS' | 'FAIL'

export interface DesignCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface SelectedParts {
  mosfet: MosfetPart
  diode: DiodePart
  inductor: InductorPart
  capacitor: CapacitorPart
}

export interface DesignReview {
  checks: DesignCheck[]
  passed: boolean
  predictedVout: number
  simulatedVout: number
  predictedDeltaIl: number
  simulatedDeltaIl: number
  predictedDeltaVout: number
  simulatedDeltaVout: number
  iLpeak: number
  iLminPred: number
  iLminSim: number
  mode: Metrics['mode']
  pOut: number
  pMosCond: number
  pMosSwitch: number
  pDiode: number
  pInductor: number
  pEsr: number
  pTotalLoss: number
  pIn: number
  efficiency: number
  tjFet: number
  tjDiode: number
  saturated: boolean
}

export function suggestedDuty(vin: number, vOut: number): number {
  return vOut / vin
}

export function loadResistance(vOut: number, iOut: number): number {
  return vOut / Math.max(iOut, 1e-9)
}

export function targetInductorRipple(iOutMax: number, rippleFraction: number): number {
  return rippleFraction * iOutMax
}

export function designInductance(
  vin: number,
  vOut: number,
  duty: number,
  fs: number,
  deltaIl: number,
): number {
  if (fs <= 0 || deltaIl <= 0) return 0
  return Math.max(0, vin - vOut) * duty / (fs * deltaIl)
}

export function designCapacitance(deltaIl: number, fs: number, deltaV: number): number {
  if (fs <= 0 || deltaV <= 0) return 0
  return deltaIl / (8 * fs * deltaV)
}

export function peakInductorCurrent(iOut: number, deltaIl: number): number {
  return iOut + deltaIl / 2
}

export function minInductorCurrent(iOut: number, deltaIl: number): number {
  return iOut - deltaIl / 2
}

export function inductorSaturated(iPeak: number, isat: number): boolean {
  return isat > 0 && iPeak > isat
}

export function inductorRms(iOut: number, deltaIl: number): number {
  return Math.sqrt(iOut * iOut + (deltaIl * deltaIl) / 12)
}

export function mosfetConductionLossApprox(iRms: number, rdsOn: number, duty: number): number {
  return iRms * iRms * rdsOn * duty
}

export function switchingLossApprox(vin: number, current: number, trTf: number, fs: number): number {
  return 0.5 * vin * current * trTf * fs
}

export function diodeLossApprox(vf: number, iOut: number, duty: number): number {
  return vf * iOut * (1 - duty)
}

export function inductorDcrLossApprox(iRms: number, dcr: number): number {
  return iRms * iRms * dcr
}

export function esrLossApprox(deltaIl: number, esr: number): number {
  return ((deltaIl * deltaIl) / 12) * esr
}

export function estimatedEfficiency(pOut: number, pLoss: number): number {
  const pIn = pOut + pLoss
  return pIn > 0 ? pOut / pIn : 0
}

export function junctionTemp(ta: number, pLoss: number, thetaJa: number): number {
  return ta + pLoss * thetaJa
}

export function predictedVout(vin: number, duty: number): number {
  return idealCcmVout(vin, duty)
}

export function predictedDeltaIl(params: Pick<BuckParams, 'vin' | 'duty' | 'L' | 'fs'>, vOut: number): number {
  return inductorRippleApprox(params.vin, vOut, params.duty, params.L, params.fs)
}

export function predictedDeltaVout(deltaIl: number, C: number, fs: number, esr = 0): number {
  return capacitorRippleApprox(deltaIl, C, fs) + esrRippleApprox(deltaIl, esr)
}

export function voltageRatingOk(rating: number, stress: number, margin = DESIGN_REQUIREMENTS.voltageMargin): boolean {
  return rating + 1e-12 >= stress * margin
}

export function currentRatingOk(rating: number, peak: number): boolean {
  return rating + 1e-12 >= peak
}

export function evaluateDesign(
  req: DesignRequirements,
  params: BuckParams,
  metrics: Metrics,
  parts: SelectedParts,
): DesignReview {
  const predictedV = predictedVout(params.vin, params.duty)
  const deltaIlPred = predictedDeltaIl(params, req.vOutTarget)
  const deltaVpred = predictedDeltaVout(deltaIlPred, params.C, params.fs, params.realMode ? params.esr : 0)
  const iPeakPred = peakInductorCurrent(req.iOutMax, deltaIlPred)
  const iMinPred = minInductorCurrent(req.iOutMax, deltaIlPred)
  const iPeak = Math.max(metrics.iLmax, iPeakPred)
  const saturated = inductorSaturated(iPeak, parts.inductor.isat)

  const iRms = inductorRms(metrics.iOutAvg || req.iOutMax, metrics.iLpkpk || deltaIlPred)
  const pMosCond = params.realMode
    ? metrics.losses.mosfetConduction
    : mosfetConductionLossApprox(iRms, parts.mosfet.rdsOn, params.duty)
  const pMosSwitch = params.realMode
    ? metrics.losses.switching
    : switchingLossApprox(params.vin, req.iOutMax, parts.mosfet.tr + parts.mosfet.tf, params.fs)
  const pDiode = params.realMode ? metrics.losses.diode : diodeLossApprox(parts.diode.vf, req.iOutMax, params.duty)
  const pInductor = params.realMode ? metrics.losses.dcr : inductorDcrLossApprox(iRms, parts.inductor.dcr)
  const pEsr = params.realMode ? metrics.losses.esr : esrLossApprox(metrics.iLpkpk || deltaIlPred, parts.capacitor.esr)
  const pTotalLoss = pMosCond + pMosSwitch + pDiode + pInductor + pEsr
  const pOut = metrics.pOut
  const pInEst = pOut + pTotalLoss
  const efficiency = metrics.pIn > 1e-12 ? metrics.efficiency / 100 : estimatedEfficiency(pOut, pTotalLoss)
  const tjFet = junctionTemp(req.ta, pMosCond + pMosSwitch, parts.mosfet.thetaJa)
  const tjDiode = junctionTemp(req.ta, pDiode, parts.diode.thetaJa)

  const voutOk = Math.abs(metrics.vOutAvg - req.vOutTarget) <= req.vOutTarget * 0.08
  const rippleOk = metrics.vOutPkpk <= req.rippleVmax + 1e-6
  const peakOk = currentRatingOk(parts.mosfet.idMax, iPeak) && currentRatingOk(parts.diode.ifMax, iPeak)
  const ratingsOk =
    voltageRatingOk(parts.mosfet.vdsMax, params.vin, req.voltageMargin) &&
    voltageRatingOk(parts.diode.vrMax, params.vin, req.voltageMargin) &&
    voltageRatingOk(parts.capacitor.vRated, Math.max(metrics.vOutAvg, req.vOutTarget), req.voltageMargin)
  const effOk = efficiency >= req.efficiencyMin
  const thermalOk = tjFet < req.tjMax && tjDiode < req.tjMax

  const checks: DesignCheck[] = [
    {
      id: 'vout',
      label: 'VOUT regulation',
      status: voutOk ? 'PASS' : 'FAIL',
      detail: voutOk
        ? `Simulated ${metrics.vOutAvg.toFixed(2)} V is within 8% of the ${req.vOutTarget.toFixed(2)} V target.`
        : `Simulated ${metrics.vOutAvg.toFixed(2)} V missed the ${req.vOutTarget.toFixed(2)} V target. Open-loop VOUT ≈ D·VIN, and diode drop / DCM pull it off that estimate.`,
    },
    {
      id: 'ripple',
      label: 'Output ripple',
      status: rippleOk ? 'PASS' : 'FAIL',
      detail: rippleOk
        ? `Simulated ΔVOUT = ${(metrics.vOutPkpk * 1000).toFixed(1)} mV ≤ ${req.rippleVmax * 1000} mV.`
        : `Simulated ΔVOUT = ${(metrics.vOutPkpk * 1000).toFixed(1)} mV exceeds ${req.rippleVmax * 1000} mV. Raise C, cut ESR, or raise fS / L to shrink ΔiL.`,
    },
    {
      id: 'peakCurrent',
      label: 'Peak current margin',
      status: peakOk ? 'PASS' : 'FAIL',
      detail: peakOk
        ? `Peak iL ${iPeak.toFixed(2)} A is below MOSFET ${parts.mosfet.idMax} A and diode ${parts.diode.ifMax} A.`
        : `Peak iL ${iPeak.toFixed(2)} A exceeds a semiconductor current rating (MOSFET ${parts.mosfet.idMax} A, diode ${parts.diode.ifMax} A).`,
    },
    {
      id: 'saturation',
      label: 'Inductor saturation',
      status: saturated ? 'FAIL' : 'PASS',
      detail: saturated
        ? `IL,peak ${iPeak.toFixed(2)} A > Isat ${parts.inductor.isat.toFixed(2)} A. The core cannot support that flux; L collapses and di/dt explodes.`
        : `IL,peak ${iPeak.toFixed(2)} A stays at or below Isat ${parts.inductor.isat.toFixed(2)} A.`,
    },
    {
      id: 'voltageRatings',
      label: 'Voltage ratings',
      status: ratingsOk ? 'PASS' : 'FAIL',
      detail: ratingsOk
        ? `MOSFET, diode, and capacitor ratings include a ${((req.voltageMargin - 1) * 100).toFixed(0)}% margin over VIN / VOUT.`
        : `A voltage rating is too close to the stress: MOSFET must safely exceed VIN (${params.vin} V), the diode sees ≈ VIN when the MOSFET is ON, and C must exceed VOUT.`,
    },
    {
      id: 'efficiency',
      label: `Efficiency > ${(req.efficiencyMin * 100).toFixed(0)}%`,
      status: effOk ? 'PASS' : 'FAIL',
      detail: effOk
        ? `Measured η = ${(efficiency * 100).toFixed(1)}%.`
        : `Measured η = ${(efficiency * 100).toFixed(1)}% is below ${(req.efficiencyMin * 100).toFixed(0)}%. Diode VF, DCR, RDS(on), and switching edges are the usual culprits.`,
    },
    {
      id: 'thermal',
      label: 'Thermal margin',
      status: thermalOk ? 'PASS' : 'FAIL',
      detail: thermalOk
        ? `First-order TJ: MOSFET ${tjFet.toFixed(0)} °C, diode ${tjDiode.toFixed(0)} °C (limit ${req.tjMax} °C).`
        : `Estimated TJ is MOSFET ${tjFet.toFixed(0)} °C / diode ${tjDiode.toFixed(0)} °C. This is TA + Ploss·θJA, not a full thermal model.`,
    },
  ]

  return {
    checks,
    passed: checks.every((check) => check.status === 'PASS'),
    predictedVout: predictedV,
    simulatedVout: metrics.vOutAvg,
    predictedDeltaIl: deltaIlPred,
    simulatedDeltaIl: metrics.iLpkpk,
    predictedDeltaVout: deltaVpred,
    simulatedDeltaVout: metrics.vOutPkpk,
    iLpeak: iPeak,
    iLminPred: iMinPred,
    iLminSim: metrics.iLmin,
    mode: metrics.mode,
    pOut,
    pMosCond,
    pMosSwitch,
    pDiode,
    pInductor,
    pEsr,
    pTotalLoss,
    pIn: metrics.pIn > 0 ? metrics.pIn : pInEst,
    efficiency,
    tjFet,
    tjDiode,
    saturated,
  }
}

export interface LoadStepResult {
  tMinus: Instant
  tPlus: Instant
  history: Instant[]
  stepTime: number
  state: BuckState
}

export function runLoadStep(
  params: BuckParams,
  iLoadBefore: number,
  iLoadAfter: number,
  vOutNom: number,
): LoadStepResult {
  const beforeParams = { ...params, R: loadResistance(vOutNom, iLoadBefore) }
  const afterParams = { ...params, R: loadResistance(vOutNom, iLoadAfter) }
  const settled = settleSimulation(beforeParams)
  const tMinus = deriveInstant(settled.state, beforeParams)
  const tPlus = deriveInstant(settled.state, afterParams)
  const continued = continueSimulation(settled.state, afterParams, { capturePeriods: 10 })
  return {
    tMinus,
    tPlus,
    history: [...settled.history.slice(-80), ...continued.history],
    stepTime: settled.state.t,
    state: continued.state,
  }
}

export interface LineStepResult {
  before: Instant
  history: Instant[]
  metricsAfter: Metrics
  predictedAfter: number
}

export function runLineStep(params: BuckParams, vinAfter: number): LineStepResult {
  const settled = settleSimulation(params)
  const afterParams = { ...params, vin: vinAfter }
  const continued = continueSimulation(settled.state, afterParams, { capturePeriods: 24 })
  return {
    before: settled.history[settled.history.length - 1] ?? deriveInstant(settled.state, params),
    history: [...settled.history.slice(-60), ...continued.history],
    metricsAfter: continued.metrics,
    predictedAfter: idealCcmVout(vinAfter, params.duty),
  }
}

export function firstPostStepSample(history: Instant[], stepTime: number): Instant | undefined {
  return history.find((sample) => sample.t >= stepTime)
}

/** Exported only so tests can drive a few extra steps with a known dt. */
export function stepDuration(params: BuckParams): number {
  return physicsDt(params)
}
