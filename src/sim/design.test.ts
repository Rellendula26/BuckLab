import { describe, expect, it } from 'vitest'
import {
  DESIGN_REQUIREMENTS,
  currentRatingOk,
  designCapacitance,
  designInductance,
  diodeLossApprox,
  evaluateDesign,
  inductorSaturated,
  junctionTemp,
  minInductorCurrent,
  mosfetConductionLossApprox,
  peakInductorCurrent,
  predictedDeltaIl,
  predictedDeltaVout,
  predictedVout,
  runLineStep,
  runLoadStep,
  suggestedDuty,
  switchingLossApprox,
  targetInductorRipple,
  voltageRatingOk,
  type SelectedParts,
} from './design.ts'
import { inductorRippleApprox } from './formulas.ts'
import { settleSimulation } from './integrate.ts'
import { deriveInstant } from './physics.ts'
import { baseIdealParams } from './presets.ts'
import { CAPACITORS, DIODES, INDUCTORS, MOSFETS } from '../design/parts.ts'

const req = DESIGN_REQUIREMENTS

const goodParts: SelectedParts = {
  inductor: INDUCTORS.find((p) => p.id === 'l-47')!,
  capacitor: CAPACITORS.find((p) => p.id === 'c-100')!,
  mosfet: MOSFETS.find((p) => p.id === 'm-mid')!,
  diode: DIODES.find((p) => p.id === 'd-sch')!,
}

function nominalDesign(overrides: Parameters<typeof baseIdealParams>[0] = {}) {
  return baseIdealParams({
    vin: req.vin,
    duty: suggestedDuty(req.vin, req.vOutTarget),
    fs: 100_000,
    L: 47e-6,
    C: 220e-6,
    R: req.vOutTarget / req.iOutMax,
    realMode: true,
    vf: goodParts.diode.vf,
    dcr: 0.03,
    rdsOn: goodParts.mosfet.rdsOn,
    esr: 0.01,
    isat: goodParts.inductor.isat,
    trTf: goodParts.mosfet.tr + goodParts.mosfet.tf,
    ...overrides,
  })
}

describe('12 V → 5 V design equations', () => {
  it('starts from CCM volt-second balance: D ≈ VOUT / VIN', () => {
    expect(suggestedDuty(12, 5)).toBeCloseTo(5 / 12)
    expect(predictedVout(12, 5 / 12)).toBeCloseTo(5)
  })

  it('settles near 5 V for the nominal design', () => {
    const settled = settleSimulation(nominalDesign({ realMode: false, vf: 0, dcr: 0, rdsOn: 0, esr: 0 }))
    expect(settled.metrics.vOutAvg).toBeGreaterThan(4.75)
    expect(settled.metrics.vOutAvg).toBeLessThan(5.25)
    expect(settled.metrics.mode).toBe('CCM')
  })

  it('matches predicted vs simulated inductor ripple in ideal CCM', () => {
    const params = nominalDesign({ realMode: false, vf: 0, dcr: 0, rdsOn: 0, esr: 0 })
    const settled = settleSimulation(params)
    const predicted = predictedDeltaIl(params, settled.metrics.vOutAvg)
    expect(settled.metrics.iLpkpk).toBeGreaterThan(predicted * 0.85)
    expect(settled.metrics.iLpkpk).toBeLessThan(predicted * 1.15)
  })
})

describe('inductor and capacitor sizing laws', () => {
  it('decreases ΔiL when L increases', () => {
    const small = inductorRippleApprox(12, 5, 5 / 12, 10e-6, 100_000)
    const large = inductorRippleApprox(12, 5, 5 / 12, 47e-6, 100_000)
    expect(large).toBeLessThan(small)
    const L = designInductance(12, 5, 5 / 12, 100_000, targetInductorRipple(2, 0.3))
    expect(L).toBeGreaterThan(40e-6)
    expect(L).toBeLessThan(55e-6)
  })

  it('decreases ΔiL when fs increases', () => {
    const slow = inductorRippleApprox(12, 5, 5 / 12, 22e-6, 20_000)
    const fast = inductorRippleApprox(12, 5, 5 / 12, 22e-6, 500_000)
    expect(fast).toBeLessThan(slow / 10)
  })

  it('decreases output ripple when C increases', () => {
    const deltaIl = 0.6
    expect(predictedDeltaVout(deltaIl, 220e-6, 100_000)).toBeLessThan(
      predictedDeltaVout(deltaIl, 22e-6, 100_000),
    )
    const C = designCapacitance(0.6, 100_000, 0.05)
    expect(C).toBeCloseTo(15e-6, 6)
  })

  it('increases output ripple when ESR increases', () => {
    const low = predictedDeltaVout(0.6, 100e-6, 100_000, 0.01)
    const high = predictedDeltaVout(0.6, 100e-6, 100_000, 0.08)
    expect(high).toBeGreaterThan(low)
    expect(high - low).toBeCloseTo(0.6 * 0.07, 6)
  })

  it('computes peak and min inductor current from IOUT ± ΔiL/2', () => {
    expect(peakInductorCurrent(2, 0.6)).toBeCloseTo(2.3)
    expect(minInductorCurrent(2, 0.6)).toBeCloseTo(1.7)
  })
})

describe('inductor saturation', () => {
  it('flags saturation when IL,peak exceeds Isat', () => {
    expect(inductorSaturated(2.4, 1.8)).toBe(true)
    expect(inductorSaturated(2.4, 6)).toBe(false)
  })

  it('reduces Leff and raises di/dt once current exceeds Isat', () => {
    const vC = 5
    const iL = 3
    const linear = deriveInstant({ t: 0, iL, vC }, baseIdealParams({ isat: 0 }))
    const sat = deriveInstant({ t: 0, iL, vC }, baseIdealParams({ isat: 1.5 }))
    expect(sat.leff).toBeLessThan(linear.leff * 0.3)
    expect(sat.diLdt).toBeGreaterThan(linear.diLdt * 3)
    expect(sat.vL).toBeCloseTo(linear.vL, 1)
  })
})

describe('semiconductor loss estimates', () => {
  it('scales MOSFET conduction loss with RDS(on)', () => {
    const iRms = 2
    const low = mosfetConductionLossApprox(iRms, 0.012, 0.42)
    const high = mosfetConductionLossApprox(iRms, 0.12, 0.42)
    expect(high).toBeCloseTo(low * 10, 8)

    const simLow = settleSimulation(nominalDesign({ rdsOn: 0.01, vf: 0, dcr: 0, esr: 0 }))
    const simHigh = settleSimulation(nominalDesign({ rdsOn: 0.1, vf: 0, dcr: 0, esr: 0 }))
    expect(simHigh.metrics.losses.mosfetConduction).toBeGreaterThan(simLow.metrics.losses.mosfetConduction * 5)
  })

  it('scales switching loss with fs', () => {
    expect(switchingLossApprox(12, 2, 40e-9, 500_000)).toBeCloseTo(
      switchingLossApprox(12, 2, 40e-9, 100_000) * 5,
    )
    const slow = settleSimulation(nominalDesign({ fs: 100_000, trTf: 80e-9, vf: 0, dcr: 0, esr: 0 }))
    const fast = settleSimulation(nominalDesign({ fs: 500_000, trTf: 80e-9, vf: 0, dcr: 0, esr: 0 }))
    expect(fast.metrics.losses.switching).toBeGreaterThan(slow.metrics.losses.switching * 2)
  })

  it('estimates diode loss as VF · IOUT · (1 − D)', () => {
    expect(diodeLossApprox(0.45, 2, 5 / 12)).toBeCloseTo(0.45 * 2 * (1 - 5 / 12))
    const settled = settleSimulation(nominalDesign({ rdsOn: 0, dcr: 0, esr: 0, vf: 0.45 }))
    expect(settled.metrics.losses.diode).toBeGreaterThan(0.3)
    expect(settled.metrics.losses.diode).toBeLessThan(0.8)
  })
})

describe('efficiency and thermals', () => {
  it('accounts for POUT + losses as the input power budget', () => {
    const settled = settleSimulation(nominalDesign())
    const review = evaluateDesign(req, nominalDesign(), settled.metrics, goodParts)
    expect(review.pIn).toBeGreaterThan(review.pOut)
    expect(review.pTotalLoss).toBeGreaterThan(0)
    expect(review.efficiency).toBeGreaterThan(0.85)
    expect(review.efficiency).toBeLessThan(1)
    expect(Math.abs(review.pOut + review.pTotalLoss - review.pIn) / review.pIn).toBeLessThan(0.15)
  })

  it('estimates junction temperature as TA + Ploss · θJA', () => {
    expect(junctionTemp(25, 1, 40)).toBe(65)
  })
})

describe('transients', () => {
  it('makes the capacitor supply the load-step deficit because iL cannot jump', () => {
    const step = runLoadStep(nominalDesign({ realMode: false, vf: 0, dcr: 0, rdsOn: 0, esr: 0 }), 0.5, 2, 5)
    expect(step.tPlus.iL).toBeCloseTo(step.tMinus.iL, 6)
    expect(step.tPlus.vC).toBeCloseTo(step.tMinus.vC, 6)
    expect(step.tPlus.iLoad).toBeGreaterThan(step.tMinus.iLoad + 1)
    expect(step.tPlus.iC).toBeLessThan(step.tMinus.iC - 1)
    expect(step.tPlus.iL).toBeCloseTo(step.tPlus.iC + step.tPlus.iLoad, 6)
  })

  it('raises VOUT when VIN steps and duty stays fixed', () => {
    const params = nominalDesign({ realMode: false, vf: 0, dcr: 0, rdsOn: 0, esr: 0 })
    const line = runLineStep(params, 15)
    expect(params.duty).toBeCloseTo(5 / 12)
    expect(line.predictedAfter).toBeCloseTo(15 * (5 / 12))
    expect(line.metricsAfter.vOutAvg).toBeGreaterThan(5.6)
    expect(line.metricsAfter.vOutAvg).toBeLessThan(7)
  })
})

describe('ratings and design review', () => {
  it('detects voltage and current rating violations', () => {
    expect(voltageRatingOk(12, 12, 1.2)).toBe(false)
    expect(voltageRatingOk(14, 12, 1.2)).toBe(false)
    expect(voltageRatingOk(30, 12, 1.2)).toBe(true)
    expect(currentRatingOk(1.5, 2.3)).toBe(false)
    expect(currentRatingOk(20, 2.3)).toBe(true)
  })

  it('passes a complete 12 V → 5 V, 2 A design', () => {
    const params = nominalDesign()
    const settled = settleSimulation(params)
    const review = evaluateDesign(req, params, settled.metrics, goodParts)
    expect(review.passed).toBe(true)
    expect(review.checks.every((check) => check.status === 'PASS')).toBe(true)
  })

  it('fails a sloppy design without correcting it', () => {
    const parts: SelectedParts = {
      inductor: INDUCTORS.find((p) => p.id === 'l-sat')!,
      capacitor: CAPACITORS.find((p) => p.id === 'c-lowv')!,
      mosfet: MOSFETS.find((p) => p.id === 'm-tight')!,
      diode: DIODES.find((p) => p.id === 'd-slow')!,
    }
    const params = nominalDesign({
      L: parts.inductor.L,
      C: parts.capacitor.C,
      esr: parts.capacitor.esr,
      isat: parts.inductor.isat,
      rdsOn: parts.mosfet.rdsOn,
      vf: parts.diode.vf,
      trTf: parts.mosfet.tr + parts.mosfet.tf,
      fs: 2_000_000,
    })
    const settled = settleSimulation(params)
    const review = evaluateDesign(req, params, settled.metrics, parts)
    expect(review.passed).toBe(false)
    expect(review.checks.find((c) => c.id === 'saturation')?.status).toBe('FAIL')
    expect(review.checks.find((c) => c.id === 'voltageRatings')?.status).toBe('FAIL')
    expect(params.L).toBe(4.7e-6)
    expect(params.duty).toBeCloseTo(5 / 12)
  })
})
