import { describe, expect, it } from 'vitest'
import { capacitorCharging, deriveInstant } from './physics.ts'
import { advanceMany, physicsDt, settleSimulation } from './integrate.ts'
import { baseIdealParams, presetById } from './presets.ts'

describe('time-domain integration', () => {
  it('ramps inductor current up while ON and down while OFF', () => {
    const params = baseIdealParams()
    const dt = physicsDt(params)
    const onStart = { t: 0, iL: 1, vC: 5 }
    const afterOn = advanceMany(onStart, params, 0.3 / params.fs, dt).state
    expect(afterOn.iL).toBeGreaterThan(onStart.iL)

    const offStart = { t: 0.5 / params.fs, iL: 1.2, vC: 5 }
    const afterOff = advanceMany(offStart, params, 0.3 / params.fs, dt).state
    expect(afterOff.iL).toBeLessThan(offStart.iL)
    expect(afterOff.iL).toBeGreaterThan(0)
  })

  it('never allows negative inductor current in the asynchronous converter', () => {
    const params = baseIdealParams({ R: 200, L: 8e-6 })
    const settled = settleSimulation(params, { periods: 60, capturePeriods: 3 })
    expect(Math.min(...settled.history.map((s) => s.iL))).toBeGreaterThanOrEqual(-1e-9)
    expect(settled.history.some((s) => s.phase === 'dcm')).toBe(true)
    expect(settled.metrics.mode).toBe('DCM')
  })

  it('raises VOUT above D VIN in open-loop light-load DCM', () => {
    const params = baseIdealParams({ R: 80 })
    const settled = settleSimulation(params)
    expect(settled.metrics.mode).toBe('DCM')
    expect(settled.metrics.vOutAvg).toBeGreaterThan(params.duty * params.vin + 0.5)
  })

  it('turns the diode off in DCM so diode current is not negative', () => {
    const params = baseIdealParams({ R: 200, L: 8e-6 })
    const settled = settleSimulation(params, { periods: 60, capturePeriods: 3 })
    const dcmSamples = settled.history.filter((s) => s.phase === 'dcm')
    expect(dcmSamples.length).toBeGreaterThan(0)
    for (const sample of dcmSamples) {
      expect(sample.iL).toBeCloseTo(0)
      expect(sample.iD).toBeCloseTo(0)
      expect(sample.diodeOn).toBe(false)
      expect(sample.iIn).toBeCloseTo(0)
    }
  })

  it('charges the capacitor when iL > iLOAD and discharges when iL < iLOAD', () => {
    const params = baseIdealParams()
    const settled = settleSimulation(params, { periods: 40 })
    const charge = settled.history.filter((s) => capacitorCharging(s.iL, s.iLoad) === 'charge')
    const discharge = settled.history.filter((s) => capacitorCharging(s.iL, s.iLoad) === 'discharge')
    expect(charge.length).toBeGreaterThan(0)
    expect(discharge.length).toBeGreaterThan(0)
    expect(charge.every((s) => s.iC > 0)).toBe(true)
    expect(discharge.every((s) => s.iC < 0)).toBe(true)
  })
})

describe('12 V to 5 V preset', () => {
  it('settles near 5 V in ideal CCM', () => {
    const preset = presetById('nominal-12-5')
    const settled = settleSimulation(preset.params, { periods: 50, capturePeriods: 4 })
    expect(settled.metrics.vOutAvg).toBeGreaterThan(4.75)
    expect(settled.metrics.vOutAvg).toBeLessThan(5.25)
    expect(settled.metrics.mode).toBe('CCM')
    expect(preset.params.duty).toBeCloseTo(5 / 12)
  })

  it('conserves power in ideal mode', () => {
    const settled = settleSimulation(baseIdealParams())
    expect(settled.metrics.pIn).toBeGreaterThan(0)
    expect(settled.metrics.efficiency).toBeGreaterThan(98)
    expect(Math.abs(settled.metrics.pIn - settled.metrics.pOut) / settled.metrics.pIn).toBeLessThan(0.03)
  })

  it('dissipates power in real mode so POUT < PIN', () => {
    const params = baseIdealParams({
      realMode: true,
      vf: 0.45,
      dcr: 0.08,
      rdsOn: 0.05,
      esr: 0.03,
    })
    const settled = settleSimulation(params, { periods: 60 })
    expect(settled.metrics.pOut).toBeLessThan(settled.metrics.pIn)
    expect(settled.metrics.efficiency).toBeLessThan(98)
    expect(settled.metrics.losses.total).toBeGreaterThan(0)
  })
})

describe('derived signs during a captured cycle', () => {
  it('keeps inductor current direction unchanged when vL reverses', () => {
    const settled = settleSimulation(baseIdealParams(), { periods: 40 })
    const onSample = settled.history.find((s) => s.phase === 'on' && s.vL > 0)
    const offSample = settled.history.find((s) => s.phase === 'off' && s.vL < 0)
    expect(onSample).toBeTruthy()
    expect(offSample).toBeTruthy()
    expect(onSample!.iL).toBeGreaterThan(0)
    expect(offSample!.iL).toBeGreaterThan(0)
    expect(deriveInstant({ t: offSample!.t, iL: offSample!.iL, vC: offSample!.vC }, baseIdealParams()).iL).toBeGreaterThan(0)
  })
})
