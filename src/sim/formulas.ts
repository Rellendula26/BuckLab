import type { BuckParams } from './types.ts'
import { parasiticsOf, switchingPeriod, ton } from './physics.ts'

export function idealCcmVout(vin: number, duty: number): number {
  return duty * vin
}

export function voltSecondBalanceVout(vin: number, duty: number): number {
  return idealCcmVout(vin, duty)
}

export function inductorRippleApprox(
  vin: number,
  vOut: number,
  duty: number,
  L: number,
  fs: number,
): number {
  if (L <= 0 || fs <= 0) return 0
  return Math.max(0, vin - vOut) * duty / (L * fs)
}

export function inductorRippleFromTon(
  vin: number,
  vOut: number,
  tOn: number,
  L: number,
): number {
  if (L <= 0) return 0
  return Math.max(0, vin - vOut) * tOn / L
}

export function capacitorRippleApprox(deltaIl: number, C: number, fs: number): number {
  if (C <= 0 || fs <= 0) return 0
  return deltaIl / (8 * C * fs)
}

export function esrRippleApprox(deltaIl: number, esr: number): number {
  return deltaIl * esr
}

export function ccmDcmBoundaryCurrent(deltaIl: number): number {
  return deltaIl / 2
}

export function analyticalRipple(params: BuckParams, vOut: number) {
  const p = parasiticsOf(params)
  const tOn = ton(params)
  const deltaIl = inductorRippleFromTon(params.vin, vOut, tOn, params.L)
  const deltaVcap = capacitorRippleApprox(deltaIl, params.C, params.fs)
  const deltaVesr = params.realMode ? esrRippleApprox(deltaIl, p.esr) : 0
  return {
    period: switchingPeriod(params),
    tOn,
    deltaIl,
    deltaVcap,
    deltaVesr,
    deltaVout: deltaVcap + deltaVesr,
    boundaryCurrent: ccmDcmBoundaryCurrent(deltaIl),
  }
}

/** D(VIN − VOUT) + (1 − D)(−VOUT) = 0  →  VOUT = D VIN */
export function voltSecondResidual(vin: number, vOut: number, duty: number): number {
  return duty * (vin - vOut) + (1 - duty) * -vOut
}
