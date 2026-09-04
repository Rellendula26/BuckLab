# BuckLab

An interactive, physically meaningful lesson on the asynchronous buck converter. The site is for an early electrical-engineering student who needs to *explain* the circuit in an interview: not only what each part does, but why the waveforms look that way, using KCL, KVL, energy storage, and the component equations.

There is no backend. Everything runs in the browser from a numerical time-domain model.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm test          # unit tests for the simulation
npm run build     # production build
npm run preview   # serve the build
```

## Architecture

```
src/sim/           Pure TypeScript physics — no React
  types.ts         Parameters, state, instantaneous quantities, metrics
  physics.ts       PWM, switch/diode phases, KCL/KVL, stored energy
  integrate.ts     Heun (improved Euler) stepper, DCM clamp, settle/capture
  metrics.ts       Averages, ripple, efficiency, estimated losses
  formulas.ts      Closed-form CCM ripple and volt-second balance
  presets.ts       Six teaching operating points

src/hooks/         Animation loop and reduced-motion handling
src/ui/            SVG circuit, waveforms, equations, interview mode
src/labs/          Concept Labs predict-then-run experiments
src/design/        Design a Buck staged challenge (parts catalog + wizard)
src/App.tsx        Six sections and keyboard shortcuts
```

The UI never invents waveform arrays. It displays samples produced by `advance()` / `settleSimulation()`. The circuit animation, live equations, metric chips, and the waveform cursor all read the same `Instant`.

### Why the model is separate

If the integrator and the drawing code share one file, it becomes impossible to test “does iL go negative?” without mounting React. Keeping `src/sim` pure means the interview claims (CCM vs DCM, capacitor charge sign, VOUT ≈ D VIN) are executable tests, not comments.

## How the simulation works

State variables: inductor current `iL` and capacitor voltage `vC`.

Each step:

1. Decide the PWM state from `t`, `D`, and `fS`. `TON = D / fS`. Animation speed is a viewing control and does not change these.
2. Resolve the phase:
   - **ON** — switch closed, diode reverse-biased.
   - **OFF** — switch open, diode conducting while `iL > 0`.
   - **DCM** — `iL` reached zero during OFF. Diode turns off. `iL` is held at 0 until the next ON pulse.
3. Compute the output network (capacitor and load are **parallel**, so they share voltage):

   ```
   iLOAD = VOUT / R
   iC    = iL − iLOAD
   ```

   With ESR, `VOUT = (iL·ESR + vC) / (1 + ESR/R)`. With ESR = 0, `VOUT = vC`.
4. Define inductor voltage left-to-right:

   ```
   vL = vSW − VOUT
   diL/dt = (vL − iL·DCR) / L
   ```

   Ideal ON: `vSW = VIN`, `vL = VIN − VOUT > 0`, current ramps **up**.
   Ideal OFF: `vSW = 0`, `vL = −VOUT < 0`, current ramps **down** but does **not** reverse direction.
   Real diode OFF: `vSW = −VF`, `vL = −(VOUT + VF)`.
5. Integrate with Heun’s method. Timestep is `T / 400`, much smaller than the switching period.
6. If a step would make `iL < 0` while the switch is open, clamp to zero (asynchronous topology: the diode cannot conduct backwards).

Initial state is the ideal guess `vC = D·VIN`, `iL = VOUT / R`, then the solver runs about 50 periods so ripple and DCM detection settle.

## Formulas shown in the UI

Inductor volt-second balance (ideal CCM):

```
D(VIN − VOUT) + (1 − D)(−VOUT) = 0
VOUT = D VIN
```

Current ripple:

```
ΔiL ≈ (VIN − VOUT) TON / L
    ≈ (VIN − VOUT) D / (L fS)
```

Ideal capacitor voltage ripple:

```
ΔVOUT ≈ ΔiL / (8 C fS)
```

ESR adds about `ΔiL · ESR` when real-component mode is on.

Power:

```
PIN  = VIN × average(iIN)
POUT = average(VOUT × iLOAD)
η    = POUT / PIN
```

Stored energy (animated on the inductor field and capacitor fill):

```
EL = ½ L iL²
EC = ½ C VOUT²
```

## Assumptions and limitations

- One-switch asynchronous buck. No synchronous rectifier, no current-mode control loop, no compensation.
- PWM duty cycle is an open-loop command. There is no feedback regulator holding 5 V if you change VIN or the load.
- In DCM with fixed D, VOUT is load-dependent and typically **higher** than `D·VIN`. That is physical, not a bug.
- MOSFET and diode are piecewise-ideal switches plus optional RDS(on) and VF. No reverse recovery, no Coss ringing, no dead time.
- Switching loss is a compact estimate (`½ VIN |iL| (tr+tf)` at each edge), not a SPICE device model.
- Magnetic saturation is optional advanced physics (`isat` > 0 collapses L as iL² / Isat²). Temperature uses a first-order TJ ≈ TA + Ploss·θJA estimate, not a board model. Layout parasitics are omitted.
- The animation clock is deliberately slower than real switching. 100 kHz is not drawn at 100 kHz; otherwise the ON/OFF states would be invisible.

## Presets

| Preset | Intent |
| --- | --- |
| 12 V → 5 V nominal | Ideal CCM, `D = 5/12 ≈ 0.417` |
| High-ripple example | Smaller L, C, fS so the triangle is obvious |
| Low-ripple example | Larger L, C, higher fS |
| Light-load DCM | Same power stage, large R so iL touches zero |
| High-frequency compact | 500 kHz, smaller L and C |
| Low-frequency efficient | 20 kHz, larger magnetics and capacitor |

## Concept Labs

The **Concept Labs** tab is predict-then-run. The numerical model does not change until you answer. That is deliberate: the metrics bar would otherwise leak the punchline.

| Lab | What the model actually does |
| --- | --- |
| Bypass L | Replaces L with 80 nH. PWM slams C. |
| Remove C | VOUT = iL R. Triangle voltage. |
| Remove diode | Unclamped VSW spike (~ −8 VIN) when the switch opens. |
| MOSFET welded ON | Always ON. Settles to VIN. |
| KVL / KCL | Live node voltages; equation hidden until you click the loop. |
| Inductor / capacitor laws | Same integrator; sliders after you predict. |
| Volt-second | Integrates vL(t) from the captured samples. |
| D vs fS | Two real settles: 20 kHz and 200 kHz at D = 50%. |
| CCM/DCM | Raise R until iL,min = 0. VOUT leaves D·VIN. |
| Startup | vC(0) = iL(0) = 0. No warmup to steady state. |
| Energy | Instantaneous PIN, PL, PC, PLOAD from the same Instant. |

## Design a Buck

The **Design a Buck** tab is a guided 12 V → 5 V, 2 A challenge. It does not invent a second simulator. After each prediction the same `settleSimulation` / `continueSimulation` engine tests the student's D, fS, L, C, MOSFET, and diode. Failed designs stay failed.

| Stage | What is tested |
| --- | --- |
| Duty | Student D vs simulated VOUT. Ideal CCM says D ≈ 5/12. |
| Frequency | 20 kHz … 2 MHz. D sets VOUT; fS sets ripple and switching loss. |
| Inductor | L = (VIN−VOUT)D / (fS ΔiL). Peak vs Isat. Optional L collapse. |
| Capacitor | C ≈ ΔiL / (8 fS ΔV). ESR is a first-class term. |
| MOSFET / diode | Ratings, Pcond, Psw, VF·I·(1−D). Sync buck is explained, not simulated. |
| Thermals | PIN ≈ POUT + losses. TJ ≈ TA + Ploss·θJA. |
| Load step | 0.5 A → 2 A. iL and vC cannot jump; C supplies the KCL deficit. |
| Line step | VIN 12 → 15 V at fixed D. Open-loop VOUT moves. Feedback is the next lesson. |
| Review | Per-requirement PASS/FAIL. Nothing is auto-corrected. |

## Keyboard

- `Space` play / pause
- `[` step to the next OFF interval
- `]` step to the next ON interval
- `R` reset to a settled operating point
- `1`–`6` switch sections

Sliders, waveform scrubbing, and interview reveals also work with a keyboard. `prefers-reduced-motion` disables particle motion and autoplay.

## Tests worth reading

`src/sim/physics.test.ts` and `src/sim/integrate.test.ts` encode the teaching claims:

- `vL = vSW − VOUT`
- Parallel capacitor and load share voltage
- `iL = iC + iLOAD`, and the capacitor charges only when `iL > iLOAD`
- ON slope is `(VIN − VOUT)/L`; OFF slope is `−VOUT/L` (or `−(VOUT+VF)/L`)
- Inductor current keeps its direction when voltage polarity reverses
- Asynchronous DCM never produces negative inductor or diode current
- The 12 V-to-5 V preset settles near 5 V in ideal CCM
- Ideal mode conserves power; real mode does not
