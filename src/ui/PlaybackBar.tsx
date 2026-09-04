import { formatFixed } from './format.ts'

interface PlaybackBarProps {
  playing: boolean
  animSpeed: number
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onStepOn: () => void
  onStepOff: () => void
  onSpeed: (value: number) => void
}

export function PlaybackBar({
  playing,
  animSpeed,
  onPlay,
  onPause,
  onReset,
  onStepOn,
  onStepOff,
  onSpeed,
}: PlaybackBarProps) {
  return (
    <div className="playback" role="toolbar" aria-label="Simulation playback">
      <div className="playback-buttons">
        <button type="button" onClick={playing ? onPause : onPlay} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={onReset}>Reset</button>
        <button type="button" onClick={onStepOn}>Step ON</button>
        <button type="button" onClick={onStepOff}>Step OFF</button>
      </div>
      <label className="anim-speed">
        <span>Animation speed</span>
        <input
          type="range"
          min={0.25}
          max={6}
          step={0.25}
          value={animSpeed}
          aria-valuetext={`${formatFixed(animSpeed, 2)} times viewing speed`}
          onChange={(event) => onSpeed(Number(event.target.value))}
        />
        <span className="mono">{formatFixed(animSpeed, 2)}×</span>
        <small>Viewing only. Does not change fS or D.</small>
      </label>
    </div>
  )
}
