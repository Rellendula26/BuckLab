import type { CapacitorPart, DiodePart, InductorPart, MosfetPart } from '../sim/design.ts'

export const INDUCTORS: InductorPart[] = [
  {
    id: 'l-sat',
    name: '4.7 µH / 1.8 A sat',
    note: 'Compact, but Isat is below a 2 A design peak.',
    L: 4.7e-6,
    dcr: 0.008,
    isat: 1.8,
  },
  {
    id: 'l-10',
    name: '10 µH / 3.5 A sat',
    note: 'Reasonable at a few hundred kHz. Modest DCR.',
    L: 10e-6,
    dcr: 0.02,
    isat: 3.5,
  },
  {
    id: 'l-22',
    name: '22 µH / 4.5 A sat',
    note: 'A common 100 kHz starting point.',
    L: 22e-6,
    dcr: 0.04,
    isat: 4.5,
  },
  {
    id: 'l-47',
    name: '47 µH / 6 A sat',
    note: 'Larger core, more DCR, plenty of current margin.',
    L: 47e-6,
    dcr: 0.08,
    isat: 6,
  },
  {
    id: 'l-220',
    name: '220 µH / 4 A sat',
    note: 'Sized for low fS. Physically large.',
    L: 220e-6,
    dcr: 0.16,
    isat: 4,
  },
]

export const CAPACITORS: CapacitorPart[] = [
  {
    id: 'c-lowv',
    name: '22 µF / 6.3 V / 80 mΩ',
    note: 'Small, but the voltage rating is too close to 5 V and ESR is high.',
    C: 22e-6,
    esr: 0.08,
    vRated: 6.3,
  },
  {
    id: 'c-cer',
    name: '22 µF ceramic / 16 V / 3 mΩ',
    note: 'Little capacitance, almost no ESR. Ripple is then mostly the C term.',
    C: 22e-6,
    esr: 0.003,
    vRated: 16,
  },
  {
    id: 'c-47',
    name: '47 µF / 10 V / 40 mΩ',
    note: 'Mid-size electrolytic. ESR still matters.',
    C: 47e-6,
    esr: 0.04,
    vRated: 10,
  },
  {
    id: 'c-100',
    name: '100 µF / 16 V / 15 mΩ',
    note: 'Comfortable C and ESR for this 50 mV budget at 100 kHz.',
    C: 100e-6,
    esr: 0.015,
    vRated: 16,
  },
  {
    id: 'c-470',
    name: '470 µF / 16 V / 80 mΩ',
    note: 'Huge C, sloppy ESR. Biggest is not automatically quietest.',
    C: 470e-6,
    esr: 0.08,
    vRated: 16,
  },
]

export const MOSFETS: MosfetPart[] = [
  {
    id: 'm-lossy',
    name: 'BL20N08',
    note: '20 V, high RDS(on). Fine voltage, wasteful conduction.',
    vdsMax: 20,
    idMax: 8,
    rdsOn: 0.08,
    qg: 8e-9,
    tr: 10e-9,
    tf: 10e-9,
    thetaJa: 50,
  },
  {
    id: 'm-mid',
    name: 'BL30N12',
    note: '30 V, 12 mΩ. A balanced 12 V-class part.',
    vdsMax: 30,
    idMax: 20,
    rdsOn: 0.012,
    qg: 25e-9,
    tr: 20e-9,
    tf: 20e-9,
    thetaJa: 40,
  },
  {
    id: 'm-fat',
    name: 'BL20N04',
    note: 'Very low RDS(on), large Qg and slow edges. Conduction wins; switching pays.',
    vdsMax: 20,
    idMax: 40,
    rdsOn: 0.004,
    qg: 80e-9,
    tr: 40e-9,
    tf: 40e-9,
    thetaJa: 35,
  },
  {
    id: 'm-tight',
    name: 'BL12N25',
    note: '12 V rating on a 12 V rail — no margin at all.',
    vdsMax: 12,
    idMax: 5,
    rdsOn: 0.025,
    qg: 6e-9,
    tr: 6e-9,
    tf: 6e-9,
    thetaJa: 60,
  },
]

export const DIODES: DiodePart[] = [
  {
    id: 'd-si',
    name: 'BL-S3A20',
    note: 'Silicon, VF ≈ 0.70 V, slow recovery.',
    vf: 0.7,
    ifMax: 3,
    vrMax: 20,
    recovery: 'slow',
    thetaJa: 70,
  },
  {
    id: 'd-sch',
    name: 'BL-SK5A40',
    note: 'Schottky, VF ≈ 0.45 V, 40 V. A sensible asynchronous pick.',
    vf: 0.45,
    ifMax: 5,
    vrMax: 40,
    recovery: 'none',
    thetaJa: 55,
  },
  {
    id: 'd-tight',
    name: 'BL-SK3A15',
    note: 'Low VF, but 15 V reverse on a 12 V input.',
    vf: 0.35,
    ifMax: 3,
    vrMax: 15,
    recovery: 'none',
    thetaJa: 65,
  },
  {
    id: 'd-slow',
    name: 'BL-S2A100',
    note: '1.0 V drop and only 2 A. Efficient? No.',
    vf: 1,
    ifMax: 2,
    vrMax: 100,
    recovery: 'slow',
    thetaJa: 80,
  },
]

export function inductorById(id: string): InductorPart | undefined {
  return INDUCTORS.find((part) => part.id === id)
}

export function capacitorById(id: string): CapacitorPart | undefined {
  return CAPACITORS.find((part) => part.id === id)
}

export function mosfetById(id: string): MosfetPart | undefined {
  return MOSFETS.find((part) => part.id === id)
}

export function diodeById(id: string): DiodePart | undefined {
  return DIODES.find((part) => part.id === id)
}
