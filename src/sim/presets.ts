import type { BuckParams, Preset } from './types.ts'

export function baseIdealParams(overrides: Partial<BuckParams> = {}): BuckParams {
  return {
    vin: 12,
    duty: 5 / 12,
    fs: 100_000,
    L: 22e-6,
    C: 100e-6,
    R: 5,
    vf: 0.45,
    dcr: 0.04,
    rdsOn: 0.03,
    esr: 0.02,
    realMode: false,
    switchMode: 'pwm',
    hasDiode: true,
    hasInductor: true,
    hasCapacitor: true,
    startupFromZero: false,
    isat: 0,
    trTf: 60e-9,
    ...overrides,
  }
}

export const PRESETS: Preset[] = [
  {
    id: 'nominal-12-5',
    name: '12 V → 5 V nominal',
    blurb: 'Ideal CCM buck with D = 5/12. The volt-second balance target is 5 V.',
    params: baseIdealParams(),
  },
  {
    id: 'high-ripple',
    name: 'High-ripple example',
    blurb: 'Lower L, C, and fS so triangular current and output ripple are obvious.',
    params: baseIdealParams({
      fs: 50_000,
      L: 10e-6,
      C: 47e-6,
      R: 1.5,
    }),
  },
  {
    id: 'low-ripple',
    name: 'Low-ripple example',
    blurb: 'Larger L and C plus higher fS keep ΔiL and ΔVOUT small.',
    params: baseIdealParams({
      fs: 200_000,
      L: 47e-6,
      C: 470e-6,
      R: 5,
    }),
  },
  {
    id: 'light-dcm',
    name: 'Light-load DCM',
    blurb: 'Same power stage, much lighter load. Inductor current reaches zero each cycle.',
    params: baseIdealParams({
      R: 80,
      L: 22e-6,
      C: 100e-6,
      fs: 100_000,
    }),
  },
  {
    id: 'hf-compact',
    name: 'High-frequency compact',
    blurb: '500 kHz lets L and C shrink. More edges per second, more switching loss in real mode.',
    params: baseIdealParams({
      fs: 500_000,
      L: 4.7e-6,
      C: 22e-6,
      R: 5,
    }),
  },
  {
    id: 'lf-efficient',
    name: 'Low-frequency efficient',
    blurb: '20 kHz needs a larger inductor and capacitor, but there are fewer switching events.',
    params: baseIdealParams({
      fs: 20_000,
      L: 100e-6,
      C: 470e-6,
      R: 5,
    }),
  },
]

export function presetById(id: string): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}
