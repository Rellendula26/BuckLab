import { describe, expect, it } from 'vitest'
import { settleSimulation } from './integrate.ts'
import { deriveInstant, kvlOnResidual } from './physics.ts'
import { baseIdealParams } from './presets.ts'
import { idealVoltSecondTerms, voltSecondAreas } from './voltsecond.ts'

describe('component removal topology', () => {
  it('stops being a buck when the switch is stuck ON: VOUT → VIN', () => {
    const settled = settleSimulation(baseIdealParams({ switchMode: 'stuckOn' }), { periods: 80 })
    expect(settled.metrics.vOutAvg).toBeGreaterThan(11.2)
    expect(Math.abs(settled.metrics.vOutAvg - 12)).toBeLessThan(1)
  })

  it('lets the output die when the switch is stuck OFF', () => {
    const settled = settleSimulation(baseIdealParams({ switchMode: 'stuckOff', startupFromZero: true }))
    expect(settled.metrics.vOutAvg).toBeLessThan(0.4)
    expect(settled.history.every((s) => s.iIn === 0)).toBe(true)
  })

  it('makes load voltage a large triangle when C is removed', () => {
    const withC = settleSimulation(baseIdealParams())
    const noC = settleSimulation(baseIdealParams({ hasCapacitor: false }))
    expect(noC.metrics.vOutPkpk).toBeGreaterThan(withC.metrics.vOutPkpk * 8)
    const sample = noC.history[Math.floor(noC.history.length / 2)]
    expect(sample.iC).toBeCloseTo(0, 6)
    expect(sample.vOut).toBeCloseTo(sample.iL * 5, 2)
  })

  it('produces an unclamped switch-node spike when the diode is removed', () => {
    const settled = settleSimulation(baseIdealParams({ hasDiode: false }), { periods: 40 })
    const spike = settled.history.find((s) => s.inductiveSpike)
    expect(spike).toBeTruthy()
    expect(spike!.vSW).toBeLessThan(-30)
    expect(spike!.iD).toBe(0)
  })

  it('keeps KVL identity VIN − vSwitch − vL − VOUT = 0 during ON', () => {
    const on = deriveInstant({ t: 0, iL: 1, vC: 5 }, baseIdealParams())
    expect(on.phase).toBe('on')
    expect(kvlOnResidual(12, on.vSwitch, on.vL, on.vOut)).toBeCloseTo(0, 9)
  })
})

describe('volt-second balance', () => {
  it('has nearly canceling vL areas in settled CCM', () => {
    const settled = settleSimulation(baseIdealParams(), { capturePeriods: 4 })
    const areas = voltSecondAreas(settled.history)
    const period = 1 / settled.metrics.fs
    const ideal = idealVoltSecondTerms(12, settled.metrics.vOutAvg, 5 / 12, period)
    expect(Math.abs(areas.net)).toBeLessThan(2e-6)
    expect(ideal.net).toBeCloseTo(0, 3)
  })
})

describe('startup from zero', () => {
  it('builds vC from 0 toward the CCM target', () => {
    const run = settleSimulation(baseIdealParams({ startupFromZero: true }))
    expect(run.history[0].vC).toBeLessThan(1.2)
    expect(run.history[run.history.length - 1].vOut).toBeGreaterThan(run.history[0].vOut + 1)
  })
})

describe('energy flow signs', () => {
  it('sends power into the inductor while vL and iL have the same sign', () => {
    const on = deriveInstant({ t: 0, iL: 1, vC: 5 }, baseIdealParams())
    expect(on.pL).toBeGreaterThan(0)
    expect(on.pIn).toBeGreaterThan(on.pLoad)
  })
})
