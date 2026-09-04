export type MetricId =
  | 'vin'
  | 'vout'
  | 'duty'
  | 'fs'
  | 'iin'
  | 'iout'
  | 'dil'
  | 'dvout'
  | 'eta'
  | 'mode'
  | 'losses'

export const METRIC_EXPLAINERS: Record<MetricId, { title: string; body: string }> = {
  vin: {
    title: 'Input voltage VIN',
    body: 'The DC source feeding the converter. It is constant. Raising VIN at fixed D raises ideal CCM VOUT = D VIN. It also increases ON-state inductor voltage VIN − VOUT, so current ripple grows unless L or fS increases.',
  },
  vout: {
    title: 'Average output voltage',
    body: 'Time-average of the load voltage. In ideal CCM, volt-second balance gives VOUT ≈ D VIN. In DCM the average is load-dependent and usually higher than D VIN for the same duty cycle. Real drops (VF, DCR, RDS(on)) pull it slightly down.',
  },
  duty: {
    title: 'Duty cycle D = TON / T',
    body: 'The fraction of each switching period the switch is closed. Duty cycle is not frequency. Holding fS constant and increasing D lengthens TON and raises average VOUT. Holding D constant and changing fS leaves the ideal average voltage essentially unchanged.',
  },
  fs: {
    title: 'Switching frequency fS = 1 / T',
    body: 'How often the switch opens and closes. Higher fS shortens both TON and TOFF, so the inductor has less time to change current and the capacitor has less time to charge or discharge. Ripple falls and L, C can shrink, but switching loss and EMI rise.',
  },
  iin: {
    title: 'Average input current',
    body: 'Average of the pulsed source current. Current is drawn from VIN mainly while the switch is ON. In an ideal converter PIN = VIN × IIN = POUT, so stepping voltage down increases the available output current for a given input current. The load still decides how much current it draws.',
  },
  iout: {
    title: 'Average output / load current',
    body: 'For a resistor, iLOAD = VOUT / R. The buck does not force extra current into the load. If the load asks for more current (smaller R), inductor current rises until the output node KCL is satisfied on average.',
  },
  dil: {
    title: 'Inductor current ripple',
    body: 'Peak-to-peak iL. Approximately (VIN − VOUT) TON / L or (VIN − VOUT) D / (L fS). Large ripple raises peak and RMS current, heats the inductor, and can push the core toward saturation. The triangle exists because rectangular vL is integrated by L.',
  },
  dvout: {
    title: 'Output voltage ripple',
    body: 'Peak-to-peak VOUT. For an ideal capacitor in CCM, ΔVOUT ≈ ΔiL / (8 C fS). ESR adds about ΔiL × ESR. Ripple matters because sensors, comparators, and communication circuits see the supply as a noisy DC rail if it is too large.',
  },
  eta: {
    title: 'Efficiency η = POUT / PIN',
    body: 'Ideal mode has no parasitic resistances or switching energy, so PIN ≈ POUT and η ≈ 100%. Real mode burns power in RDS(on), VF, DCR, ESR, and each switching edge. Then POUT < PIN and the missing power becomes heat.',
  },
  mode: {
    title: 'CCM vs DCM',
    body: 'Continuous conduction: inductor current stays positive all period and the diode conducts the entire OFF interval. Discontinuous: iL reaches zero during OFF, the diode turns off, and iL stays at zero until the next ON pulse. An asynchronous buck cannot have negative diode current.',
  },
  losses: {
    title: 'Estimated real-mode losses',
    body: 'Conduction terms come from i²R in the MOSFET and inductor, VF × iD in the diode, and iC² × ESR. Switching loss is a compact estimate VIN × |iL| × tSW at each edge. It is intentionally simple — enough to show why frequency is a thermal tradeoff, not a full SPICE loss model.',
  },
}
