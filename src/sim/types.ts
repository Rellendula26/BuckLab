export type ConductionMode = 'CCM' | 'DCM'
export type SwitchPhase = 'on' | 'off' | 'dcm'
export type SwitchMode = 'pwm' | 'stuckOn' | 'stuckOff'
export type WaveformId =
  | 'pwm'
  | 'vSW'
  | 'vL'
  | 'iL'
  | 'iIN'
  | 'iD'
  | 'iC'
  | 'iLOAD'
  | 'vOUT'

export interface BuckParams {
  vin: number
  duty: number
  fs: number
  L: number
  C: number
  R: number
  vf: number
  dcr: number
  rdsOn: number
  esr: number
  realMode: boolean
  switchMode: SwitchMode
  hasDiode: boolean
  hasInductor: boolean
  hasCapacitor: boolean
  startupFromZero: boolean
  /** Peak current where L begins to collapse. 0 disables saturation. */
  isat: number
  /** MOSFET rise+fall time used by the switching-loss estimate. */
  trTf: number
}

export interface BuckState {
  t: number
  iL: number
  vC: number
}

export interface Parasitics {
  vf: number
  dcr: number
  rdsOn: number
  esr: number
}

export interface Instant {
  t: number
  pwm: number
  switchOn: boolean
  diodeOn: boolean
  phase: SwitchPhase
  modeHint: ConductionMode
  vSW: number
  vL: number
  vOut: number
  vC: number
  iL: number
  iIn: number
  iD: number
  iC: number
  iLoad: number
  diLdt: number
  dvOutdt: number
  energyL: number
  energyC: number
  pMosfet: number
  pDiode: number
  pDcr: number
  pEsr: number
  pIn: number
  pL: number
  pC: number
  pLoad: number
  vSwitch: number
  inductiveSpike: boolean
  leff: number
}

export interface LossBreakdown {
  mosfetConduction: number
  diode: number
  dcr: number
  esr: number
  switching: number
  total: number
}

export interface Metrics {
  vin: number
  vOutAvg: number
  duty: number
  fs: number
  iInAvg: number
  iOutAvg: number
  iLpkpk: number
  vOutPkpk: number
  pIn: number
  pOut: number
  efficiency: number
  mode: ConductionMode
  losses: LossBreakdown
  deltaIlApprox: number
  deltaVoutApprox: number
  deltaVoutEsrApprox: number
  iLmin: number
  iLmax: number
}

export interface Preset {
  id: string
  name: string
  blurb: string
  params: BuckParams
}

export interface SettleOptions {
  periods?: number
  stepsPerPeriod?: number
  capturePeriods?: number
}
