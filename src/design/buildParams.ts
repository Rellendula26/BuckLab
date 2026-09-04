import {
  DESIGN_REQUIREMENTS,
  type CapacitorPart,
  type DiodePart,
  type InductorPart,
  type MosfetPart,
  type SelectedParts,
} from '../sim/design.ts'
import { loadResistance } from '../sim/design.ts'
import { baseIdealParams } from '../sim/presets.ts'
import type { BuckParams } from '../sim/types.ts'
import { capacitorById, diodeById, inductorById, mosfetById } from './parts.ts'

export interface StudentDesign {
  duty: number | null
  fs: number | null
  ripplePct: number | null
  inductorId: string | null
  customLuH: string
  satPhysics: boolean
  capacitorId: string | null
  mosfetId: string | null
  diodeId: string | null
}

export const EMPTY_DESIGN: StudentDesign = {
  duty: null,
  fs: null,
  ripplePct: null,
  inductorId: null,
  customLuH: '',
  satPhysics: false,
  capacitorId: null,
  mosfetId: null,
  diodeId: null,
}

export function parseDutyInput(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n > 1 && n <= 100) return n / 100
  if (n >= 0 && n <= 1) return n
  return null
}

export function parseMicro(raw: string, scale: number): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n * scale
}

export function chosenInductor(design: StudentDesign): InductorPart | undefined {
  return design.inductorId ? inductorById(design.inductorId) : undefined
}

export function chosenCapacitor(design: StudentDesign): CapacitorPart | undefined {
  return design.capacitorId ? capacitorById(design.capacitorId) : undefined
}

export function chosenMosfet(design: StudentDesign): MosfetPart | undefined {
  return design.mosfetId ? mosfetById(design.mosfetId) : undefined
}

export function chosenDiode(design: StudentDesign): DiodePart | undefined {
  return design.diodeId ? diodeById(design.diodeId) : undefined
}

export function resolvedL(design: StudentDesign): number | null {
  const part = chosenInductor(design)
  if (part) return part.L
  return parseMicro(design.customLuH, 1e-6)
}

export function designToParams(design: StudentDesign, iOut = DESIGN_REQUIREMENTS.iOutMax): BuckParams {
  const req = DESIGN_REQUIREMENTS
  const inductor = chosenInductor(design)
  const capacitor = chosenCapacitor(design)
  const mosfet = chosenMosfet(design)
  const diode = chosenDiode(design)
  const haveDevices = Boolean(mosfet || diode)
  return baseIdealParams({
    vin: req.vin,
    duty: design.duty ?? suggestedFallbackDuty(),
    fs: design.fs ?? 100_000,
    L: resolvedL(design) ?? 22e-6,
    C: capacitor?.C ?? 100e-6,
    R: loadResistance(req.vOutTarget, iOut),
    realMode: haveDevices,
    vf: diode?.vf ?? 0,
    dcr: inductor?.dcr ?? 0,
    rdsOn: mosfet?.rdsOn ?? 0,
    esr: capacitor?.esr ?? 0,
    isat: design.satPhysics ? inductor?.isat ?? 0 : 0,
    trTf: mosfet ? mosfet.tr + mosfet.tf : 60e-9,
  })
}

function suggestedFallbackDuty(): number {
  return DESIGN_REQUIREMENTS.vOutTarget / DESIGN_REQUIREMENTS.vin
}

export function selectedPartsOrNull(design: StudentDesign): SelectedParts | null {
  const inductor = chosenInductor(design)
  const capacitor = chosenCapacitor(design)
  const mosfet = chosenMosfet(design)
  const diode = chosenDiode(design)
  if (!inductor || !capacitor || !mosfet || !diode) return null
  return { inductor, capacitor, mosfet, diode }
}

export function designSignature(design: StudentDesign): string {
  return [
    design.duty,
    design.fs,
    design.ripplePct,
    design.inductorId,
    design.customLuH,
    design.satPhysics,
    design.capacitorId,
    design.mosfetId,
    design.diodeId,
  ].join('|')
}
