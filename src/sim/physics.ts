import type { BuckParams, BuckState, Instant, Parasitics, SwitchPhase } from './types.ts'

export const IL_FLOOR = 1e-12
export const TRACE_L = 80e-9
export const UNCLAMPED_SW_FACTOR = 8

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function switchingPeriod(params: BuckParams): number {
  return 1 / params.fs
}

export function ton(params: BuckParams): number {
  return params.duty * switchingPeriod(params)
}

export function parasiticsOf(params: BuckParams): Parasitics {
  if (!params.realMode) {
    return { vf: 0, dcr: 0, rdsOn: 0, esr: 0 }
  }
  return {
    vf: params.vf,
    dcr: params.dcr,
    rdsOn: params.rdsOn,
    esr: params.esr,
  }
}

export function saturatedInductance(L: number, iL: number, isat: number): number {
  if (isat <= 0 || iL <= isat) return L
  const over = iL / isat
  return Math.max(L / (over * over), L * 0.05)
}

export function effectiveInductance(params: BuckParams, iL = 0): number {
  const base = params.hasInductor ? params.L : TRACE_L
  return saturatedInductance(base, iL, params.isat)
}

export function unclampedSwitchNode(vin: number): number {
  return -Math.max(40, UNCLAMPED_SW_FACTOR * vin)
}

export function pwmHigh(t: number, params: BuckParams): boolean {
  if (params.switchMode === 'stuckOn') return true
  if (params.switchMode === 'stuckOff') return false
  if (params.duty >= 1) return true
  if (params.duty <= 0) return false
  const period = switchingPeriod(params)
  const frac = t / period - Math.floor(t / period)
  return frac < params.duty
}

export function outputNetwork(
  iL: number,
  vC: number,
  loadOhms: number,
  esr: number,
  hasCapacitor = true,
): { vOut: number; iLoad: number; iC: number } {
  const r = Math.max(loadOhms, 1e-9)
  if (!hasCapacitor) {
    const vOut = iL * r
    return { vOut, iLoad: iL, iC: 0 }
  }
  if (esr < 1e-12) {
    const vOut = vC
    const iLoad = vOut / r
    return { vOut, iLoad, iC: iL - iLoad }
  }
  const vOut = (iL * esr + vC) / (1 + esr / r)
  const iLoad = vOut / r
  return { vOut, iLoad, iC: iL - iLoad }
}

export function resolvePhase(t: number, iL: number, params: BuckParams): SwitchPhase {
  if (pwmHigh(t, params)) return 'on'
  if (iL <= IL_FLOOR) return 'dcm'
  return 'off'
}

export function switchNodeVoltage(
  phase: SwitchPhase,
  iL: number,
  vOut: number,
  vin: number,
  p: Parasitics,
  hasDiode: boolean,
): number {
  if (phase === 'on') return vin - iL * p.rdsOn
  if (phase === 'off') {
    if (hasDiode) return -p.vf
    return unclampedSwitchNode(vin)
  }
  return vOut
}

export function inductorVoltage(vSW: number, vOut: number): number {
  return vSW - vOut
}

export function inductorSlope(vL: number, iL: number, L: number, dcr: number, phase: SwitchPhase): number {
  if (phase === 'dcm' || L <= 0) return 0
  return (vL - iL * dcr) / L
}

export function deriveInstant(state: BuckState, params: BuckParams): Instant {
  const p = parasiticsOf(params)
  const phase = resolvePhase(state.t, state.iL, params)
  const iL = phase === 'dcm' ? 0 : state.iL
  const out = outputNetwork(iL, state.vC, params.R, p.esr, params.hasCapacitor)
  const vSW = switchNodeVoltage(phase, iL, out.vOut, params.vin, p, params.hasDiode)
  const vL = inductorVoltage(vSW, out.vOut)
  const L = effectiveInductance(params, iL)
  const diLdt = inductorSlope(vL, iL, L, params.hasInductor ? p.dcr : 0, phase)
  const dvCdt = params.hasCapacitor ? out.iC / Math.max(params.C, 1e-18) : 0
  const switchOn = phase === 'on'
  const diodeOn = phase === 'off' && params.hasDiode
  const inductiveSpike = phase === 'off' && !params.hasDiode && iL > IL_FLOOR
  const iIn = switchOn ? iL : 0
  const iD = diodeOn ? iL : 0
  const vSwitch = switchOn ? params.vin - vSW : params.vin
  const energyL = params.hasInductor ? 0.5 * params.L * iL * iL : 0
  const energyC = params.hasCapacitor ? 0.5 * params.C * out.vOut * out.vOut : 0

  return {
    t: state.t,
    pwm: switchOn ? 1 : 0,
    switchOn,
    diodeOn,
    phase,
    modeHint: phase === 'dcm' ? 'DCM' : 'CCM',
    vSW,
    vL,
    vOut: out.vOut,
    vC: params.hasCapacitor ? state.vC : out.vOut,
    iL,
    iIn,
    iD,
    iC: out.iC,
    iLoad: out.iLoad,
    diLdt,
    dvOutdt: dvCdt,
    energyL,
    energyC,
    pMosfet: iIn * iIn * p.rdsOn,
    pDiode: iD * p.vf,
    pDcr: iL * iL * p.dcr,
    pEsr: out.iC * out.iC * p.esr,
    pIn: params.vin * iIn,
    pL: vL * iL,
    pC: out.vOut * out.iC,
    pLoad: out.vOut * out.iLoad,
    vSwitch,
    inductiveSpike,
    leff: L,
  }
}

export function stateDerivatives(
  state: BuckState,
  params: BuckParams,
): { diL: number; dvC: number } {
  const instant = deriveInstant(state, params)
  return { diL: instant.diLdt, dvC: instant.dvOutdt }
}

export function guessedOperatingPoint(params: BuckParams): BuckState {
  if (params.startupFromZero) {
    return { t: 0, iL: 0, vC: 0 }
  }
  if (params.switchMode === 'stuckOn') {
    return { t: 0, iL: params.vin / Math.max(params.R, 1e-6), vC: params.vin }
  }
  if (params.switchMode === 'stuckOff') {
    return { t: 0, iL: 0, vC: 0 }
  }
  const vGuess = clamp(params.duty * params.vin, 0, params.vin)
  const iGuess = vGuess / Math.max(params.R, 1e-6)
  const triangle = params.L > 0 && params.fs > 0
    ? Math.max(0, params.vin - vGuess) * params.duty / (params.L * params.fs)
    : 0
  return { t: 0, iL: Math.max(0, iGuess - triangle / 2), vC: params.hasCapacitor ? vGuess : iGuess * params.R }
}

export function capacitorCharging(iL: number, iLoad: number): 'charge' | 'discharge' | 'idle' {
  const eps = 1e-9
  if (iL > iLoad + eps) return 'charge'
  if (iL < iLoad - eps) return 'discharge'
  return 'idle'
}

export function kvlOnResidual(vin: number, vSwitch: number, vL: number, vOut: number): number {
  return vin - vSwitch - vL - vOut
}
