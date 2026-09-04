export function formatSi(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return `— ${unit}`
  const abs = Math.abs(value)
  const units: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ]
  if (abs === 0) return `0 ${unit}`
  const match = units.find(([scale]) => abs >= scale) ?? units[units.length - 1]
  const scaled = value / match[0]
  const precision = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : digits
  return `${scaled.toFixed(precision)} ${match[1]}${unit}`
}

export function formatFixed(value: number, digits = 2, unit = ''): string {
  if (!Number.isFinite(value)) return '—'
  const body = value.toFixed(digits)
  return unit ? `${body} ${unit}` : body
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatEfficiency(percent: number): string {
  return `${percent.toFixed(1)}%`
}

export function signed(value: number, digits = 2): string {
  const abs = Math.abs(value).toFixed(digits)
  if (value > 1e-9) return `+${abs}`
  if (value < -1e-9) return `−${abs}`
  return abs
}
