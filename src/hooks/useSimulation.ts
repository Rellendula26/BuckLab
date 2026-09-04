import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advance,
  advanceToPhase,
  appendHistory,
  physicsDt,
  recommendedCaptureSamples,
  settleSimulation,
  stateFromInstant,
} from '../sim/integrate.ts'
import { metricsFromHistory } from '../sim/metrics.ts'
import { deriveInstant } from '../sim/physics.ts'
import { presetById, PRESETS } from '../sim/presets.ts'
import type { BuckParams, BuckState, Instant, Metrics } from '../sim/types.ts'
import { usePrefersReducedMotion } from './usePrefersReducedMotion.ts'

const PERIOD_VIEW_SEC = 1.2

export type TabId = 'explore' | 'walkthrough' | 'waveforms' | 'compare' | 'labs' | 'design'

export function useSimulation() {
  const reducedMotion = usePrefersReducedMotion()
  const [params, setParams] = useState<BuckParams>(PRESETS[0].params)
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [playing, setPlaying] = useState(!reducedMotion)
  const [animSpeed, setAnimSpeed] = useState(1)
  const [showMosfet, setShowMosfet] = useState(false)
  const [tab, setTab] = useState<TabId>('explore')
  const [history, setHistory] = useState<Instant[]>([])
  const [metrics, setMetrics] = useState<Metrics>(() => settleSimulation(PRESETS[0].params).metrics)
  const [instant, setInstant] = useState<Instant>(() =>
    deriveInstant({ t: 0, iL: 1, vC: 5 }, PRESETS[0].params),
  )
  const [scrubbing, setScrubbing] = useState(false)

  const stateRef = useRef<BuckState>({ t: 0, iL: 1, vC: 5 })
  const historyRef = useRef<Instant[]>([])
  const paramsRef = useRef(params)
  const playingRef = useRef(playing)
  const speedRef = useRef(animSpeed)
  const scrubbingRef = useRef(scrubbing)

  useEffect(() => {
    paramsRef.current = params
    playingRef.current = playing
    speedRef.current = animSpeed
    scrubbingRef.current = scrubbing
  }, [animSpeed, params, playing, scrubbing])

  const dt = useMemo(() => physicsDt(params), [params])
  const maxSamples = recommendedCaptureSamples()

  const publish = useCallback((nextInstant: Instant, nextHistory: Instant[], nextMetrics?: Metrics) => {
    setInstant(nextInstant)
    setHistory(nextHistory)
    if (nextMetrics) setMetrics(nextMetrics)
  }, [])

  const resettle = useCallback(
    (nextParams: BuckParams) => {
      const settled = settleSimulation(nextParams, { capturePeriods: 4 })
      stateRef.current = settled.state
      historyRef.current = settled.history
      publish(settled.history[settled.history.length - 1] ?? deriveInstant(settled.state, nextParams), settled.history, settled.metrics)
    },
    [publish],
  )

  useEffect(() => {
    resettle(params)
  }, [params, resettle])

  useEffect(() => {
    if (reducedMotion) setPlaying(false)
  }, [reducedMotion])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let viewAcc = 0

    const tick = (now: number) => {
      const wallDt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (playingRef.current && !scrubbingRef.current) {
        const currentParams = paramsRef.current
        const period = 1 / currentParams.fs
        const simPerWall = (period / PERIOD_VIEW_SEC) * speedRef.current
        const simDt = simPerWall * wallDt
        const step = physicsDt(currentParams)
        const steps = Math.max(1, Math.min(80, Math.ceil(simDt / step)))
        const incoming: Instant[] = []
        let current = stateRef.current
        for (let i = 0; i < steps; i += 1) {
          const advanced = advance(current, currentParams, step)
          current = advanced.state
          incoming.push(advanced.instant)
        }
        stateRef.current = current
        historyRef.current = appendHistory(historyRef.current, incoming, maxSamples)
        viewAcc += wallDt
        if (viewAcc >= 1 / 24) {
          viewAcc = 0
          const lastInstant = incoming[incoming.length - 1]
          publish(lastInstant, historyRef.current, metricsFromHistory(currentParams, historyRef.current))
        }
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [maxSamples, publish])

  const updateParams = useCallback((patch: Partial<BuckParams>) => {
    setPresetId('custom')
    setParams((prev) => ({ ...prev, ...patch }))
  }, [])

  const applyPreset = useCallback((id: string) => {
    const preset = presetById(id)
    setPresetId(preset.id)
    setParams(preset.params)
  }, [])

  const reset = useCallback(() => {
    resettle(paramsRef.current)
  }, [resettle])

  const stepPhase = useCallback((target: 'on' | 'off') => {
    setPlaying(false)
    const currentParams = paramsRef.current
    const stepped = advanceToPhase(stateRef.current, currentParams, target, physicsDt(currentParams))
    stateRef.current = stepped.state
    historyRef.current = appendHistory(historyRef.current, stepped.historyDelta, maxSamples)
    const lastInstant = stepped.historyDelta[stepped.historyDelta.length - 1] ?? deriveInstant(stepped.state, currentParams)
    publish(lastInstant, historyRef.current, metricsFromHistory(currentParams, historyRef.current))
  }, [maxSamples, publish])

  const scrubTo = useCallback((sample: Instant | null) => {
    if (!sample) {
      setScrubbing(false)
      return
    }
    setScrubbing(true)
    setPlaying(false)
    setInstant(sample)
    stateRef.current = stateFromInstant(sample)
  }, [])

  const endScrub = useCallback(() => {
    setScrubbing(false)
  }, [])

  return {
    params,
    updateParams,
    presetId,
    applyPreset,
    playing,
    setPlaying,
    animSpeed,
    setAnimSpeed,
    showMosfet,
    setShowMosfet,
    tab,
    setTab,
    history,
    metrics,
    instant,
    dt,
    reducedMotion,
    reset,
    stepPhase,
    scrubTo,
    endScrub,
    scrubbing,
  }
}
