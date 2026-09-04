import type { BuckParams } from '../sim/types.ts'
import { PRESETS } from '../sim/presets.ts'
import { formatPercent, formatSi } from './format.ts'

interface ControlsProps {
  params: BuckParams
  presetId: string
  onPreset: (id: string) => void
  onChange: (patch: Partial<BuckParams>) => void
  showMosfet: boolean
  onMosfet: (value: boolean) => void
}

export function DesignControls({ params, presetId, onPreset, onChange, showMosfet, onMosfet }: ControlsProps) {
  return (
    <section className="controls" aria-label="Design controls">
      <div className="preset-row">
        <label>
          Preset
          <select value={presetId} onChange={(event) => onPreset(event.target.value)}>
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
            {presetId === 'custom' ? <option value="custom">Custom</option> : null}
          </select>
        </label>
        <p className="preset-blurb">
          {PRESETS.find((p) => p.id === presetId)?.blurb ?? 'You are editing the power stage directly.'}
        </p>
      </div>

      <div className="control-grid">
        <Slider
          label="VIN"
          value={params.vin}
          min={3}
          max={48}
          step={0.1}
          display={formatSi(params.vin, 'V', 2)}
          onChange={(vin) => onChange({ vin })}
        />
        <Slider
          label="Duty cycle D"
          value={params.duty}
          min={0}
          max={1}
          step={0.001}
          display={formatPercent(params.duty)}
          hint="TON / T. Independent of switching frequency."
          onChange={(duty) => onChange({ duty })}
        />
        <Slider
          label="Switching frequency fS"
          value={Math.log10(params.fs)}
          min={3}
          max={6}
          step={0.01}
          display={formatSi(params.fs, 'Hz')}
          hint="Physical switching rate, not animation speed."
          onChange={(logFs) => onChange({ fs: 10 ** logFs })}
        />
        <Slider
          label="Inductance L"
          value={Math.log10(params.L)}
          min={-6}
          max={-3}
          step={0.01}
          display={formatSi(params.L, 'H')}
          onChange={(logL) => onChange({ L: 10 ** logL })}
        />
        <Slider
          label="Capacitance C"
          value={Math.log10(params.C)}
          min={-6}
          max={-2.7}
          step={0.01}
          display={formatSi(params.C, 'F')}
          onChange={(logC) => onChange({ C: 10 ** logC })}
        />
        <Slider
          label="Load R"
          value={Math.log10(params.R)}
          min={-0.3}
          max={2.7}
          step={0.01}
          display={formatSi(params.R, 'Ω')}
          onChange={(logR) => onChange({ R: 10 ** logR })}
        />
      </div>

      <fieldset className="mode-row">
        <legend>Component model</legend>
        <label>
          <input
            type="checkbox"
            checked={params.realMode}
            onChange={(event) => onChange({ realMode: event.target.checked })}
          />
          Real components (VF, DCR, RDS(on), ESR, switching loss)
        </label>
        <label>
          <input
            type="checkbox"
            checked={showMosfet}
            onChange={(event) => onMosfet(event.target.checked)}
          />
          Show MOSFET
        </label>
      </fieldset>

      {params.realMode ? (
        <div className="control-grid">
          <Slider label="Diode VF" value={params.vf} min={0} max={1.2} step={0.01} display={formatSi(params.vf, 'V', 2)} onChange={(vf) => onChange({ vf })} />
          <Slider label="Inductor DCR" value={params.dcr} min={0} max={1} step={0.005} display={formatSi(params.dcr, 'Ω', 2)} onChange={(dcr) => onChange({ dcr })} />
          <Slider label="MOSFET RDS(on)" value={params.rdsOn} min={0} max={0.5} step={0.005} display={formatSi(params.rdsOn, 'Ω', 2)} onChange={(rdsOn) => onChange({ rdsOn })} />
          <Slider label="Capacitor ESR" value={params.esr} min={0} max={0.5} step={0.005} display={formatSi(params.esr, 'Ω', 2)} onChange={(esr) => onChange({ esr })} />
        </div>
      ) : null}

      {showMosfet ? (
        <p className="mosfet-note">
          The controller applies PWM to the gate. The MOSFET is used as a switch, not as a variable resistor:
          while ON the voltage across it is ideally small, and while OFF the current through it is nearly zero.
          That is why conduction loss stays low compared with a linear pass element.
        </p>
      ) : null}
    </section>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  hint?: string
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step, display, hint, onChange }: SliderProps) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <label className="slider" htmlFor={id}>
      <span className="slider-top">
        <span>{label}</span>
        <span className="mono">{display}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}
