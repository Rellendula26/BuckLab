import { describe, expect, it } from 'vitest'
import { inductorRippleApprox, inductorRippleFromTon, voltSecondResidual } from './formulas.ts'
import {
  capacitorCharging,
  deriveInstant,
  inductorVoltage,
  outputNetwork,
  pwmHigh,
} from './physics.ts'
import { baseIdealParams } from './presets.ts'

describe('circuit identities', () => {
  it('defines inductor voltage left-to-right as vSW − vOUT', () => {
    expect(inductorVoltage(12, 5)).toBe(7)
    expect(inductorVoltage(0, 5)).toBe(-5)
    expect(inductorVoltage(-0.4, 5)).toBeCloseTo(-5.4)
  })

  it('keeps capacitor and load at the same voltage when ESR is zero', () => {
    const out = outputNetwork(1.2, 5, 5, 0)
    expect(out.vOut).toBe(5)
    expect(out.iLoad).toBeCloseTo(1)
    expect(out.iC).toBeCloseTo(0.2)
  })

  it('enforces KCL at the output node: iL = iC + iLOAD', () => {
    const iL = 1.4
    const out = outputNetwork(iL, 5, 5, 0)
    expect(out.iC + out.iLoad).toBeCloseTo(iL)
  })

  it('charges the capacitor only when iL > iLOAD', () => {
    expect(capacitorCharging(1.2, 1)).toBe('charge')
    expect(capacitorCharging(0.7, 1)).toBe('discharge')
    expect(capacitorCharging(1, 1)).toBe('idle')
  })
})

describe('ideal ON and OFF slopes', () => {
  const params = baseIdealParams()

  it('gives vL = VIN − VOUT and a positive diL/dt while ON', () => {
    const instant = deriveInstant({ t: 0, iL: 1, vC: 5 }, params)
    expect(instant.phase).toBe('on')
    expect(instant.vSW).toBeCloseTo(12)
    expect(instant.vL).toBeCloseTo(7)
    expect(instant.diLdt).toBeCloseTo((12 - 5) / params.L)
    expect(instant.diLdt).toBeGreaterThan(0)
    expect(instant.diodeOn).toBe(false)
    expect(instant.iIn).toBeCloseTo(1)
    expect(instant.iD).toBe(0)
  })

  it('reverses inductor voltage but not inductor current while OFF', () => {
    const tOff = (1 / params.fs) * 0.6
    const instant = deriveInstant({ t: tOff, iL: 1.1, vC: 5 }, params)
    expect(instant.phase).toBe('off')
    expect(instant.vSW).toBeCloseTo(0)
    expect(instant.vL).toBeCloseTo(-5)
    expect(instant.diLdt).toBeCloseTo(-5 / params.L)
    expect(instant.diLdt).toBeLessThan(0)
    expect(instant.iL).toBeGreaterThan(0)
    expect(instant.iIn).toBe(0)
    expect(instant.iD).toBeCloseTo(1.1)
  })

  it('uses vL = −(VOUT + VF) in real-diode OFF', () => {
    const real = baseIdealParams({ realMode: true, vf: 0.4, dcr: 0, rdsOn: 0, esr: 0 })
    const tOff = (1 / real.fs) * 0.6
    const instant = deriveInstant({ t: tOff, iL: 1, vC: 5 }, real)
    expect(instant.vSW).toBeCloseTo(-0.4)
    expect(instant.vL).toBeCloseTo(-5.4)
    expect(instant.diLdt).toBeCloseTo(-5.4 / real.L)
  })
})

describe('PWM and formulas', () => {
  it('treats duty cycle as TON/T, independent of frequency', () => {
    const slow = baseIdealParams({ fs: 100_000, duty: 0.5 })
    const fast = baseIdealParams({ fs: 200_000, duty: 0.5 })
    expect(pwmHigh(0, slow)).toBe(true)
    expect(pwmHigh(0, fast)).toBe(true)
    expect(pwmHigh(0.6 / slow.fs, slow)).toBe(false)
    expect(pwmHigh(0.6 / fast.fs, fast)).toBe(false)
    expect(idealDutyAverage(slow.vin, slow.duty)).toBe(idealDutyAverage(fast.vin, fast.duty))
  })

  it('matches the two inductor-ripple formulas', () => {
    const params = baseIdealParams()
    const a = inductorRippleApprox(params.vin, 5, params.duty, params.L, params.fs)
    const b = inductorRippleFromTon(params.vin, 5, params.duty / params.fs, params.L)
    expect(a).toBeCloseTo(b)
  })

  it('satisfies inductor volt-second balance at VOUT = D VIN', () => {
    expect(voltSecondResidual(12, 5, 5 / 12)).toBeCloseTo(0)
  })
})

function idealDutyAverage(vin: number, duty: number): number {
  return duty * vin
}
