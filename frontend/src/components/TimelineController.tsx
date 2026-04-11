import {
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Gauge,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSimStore } from "../store/useSimStore";

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function ControlButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-6 w-6 inline-flex items-center justify-center transition-all duration-200 ${
        active
          ? "bg-[rgba(0,212,255,0.12)] border border-[rgba(0,212,255,0.3)] text-nereus-accent"
          : "bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)]"
      }`}
      style={{ borderRadius: '2px' }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function TimelineController() {
  const totalFrames = useSimStore((s) => s.totalFrames);
  const currentFrame = useSimStore((s) => s.currentFrame);
  const isPlaying = useSimStore((s) => s.isPlaying);
  const loop = useSimStore((s) => s.loopPlayback);
  const playbackSpeed = useSimStore((s) => s.playbackSpeed);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const convergenceSeries = useSimStore((s) => s.convergenceSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);

  const setFrame = useSimStore((s) => s.setFrame);
  const togglePlayback = useSimStore((s) => s.togglePlayback);
  const stepFrame = useSimStore((s) => s.stepFrame);
  const toggleLoop = useSimStore((s) => s.toggleLoop);
  const setPlaybackSpeed = useSimStore((s) => s.setPlaybackSpeed);

  const [showSpeedPicker, setShowSpeedPicker] = useState(false);

  const maxDragFrame = useMemo(() => {
    let best: { frame: number; fx: number } | null = null;
    for (const p of metricsSeries) {
      if (p.Fx === null || p.Fx === undefined) continue;
      const fx = Math.abs(p.Fx);
      if (!best || fx > best.fx) best = { frame: p.frame_index, fx };
    }
    return best?.frame ?? null;
  }, [metricsSeries]);

  const instabilityFrame = useMemo(() => {
    if (convergenceSeries.length === 0) return null;
    const worst = convergenceSeries.reduce((a, b) =>
      b.residual > a.residual ? b : a,
    );
    if (worst.time === null || worst.time === undefined) return null;

    const numericFrameTimes = frameMapping
      .map((f) => ({
        frame: f.frame_index,
        t: typeof f.time_value === "number" ? f.time_value : null,
      }))
      .filter((x) => x.t !== null) as { frame: number; t: number }[];

    if (numericFrameTimes.length === 0) return null;

    let best = numericFrameTimes[0];
    let bestDist = Math.abs(best.t - worst.time);
    for (const x of numericFrameTimes) {
      const d = Math.abs(x.t - worst.time);
      if (d < bestDist) {
        best = x;
        bestDist = d;
      }
    }
    return best.frame;
  }, [convergenceSeries, frameMapping]);

  const markers = useMemo(() => {
    const set = new Set<number>();
    if (typeof maxDragFrame === "number") set.add(maxDragFrame);
    if (typeof instabilityFrame === "number") set.add(instabilityFrame);
    return Array.from(set.values());
  }, [maxDragFrame, instabilityFrame]);

  const progress =
    totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;
  const speedPresets = [0.5, 1, 2, 4, 8, 16, 30];

  if (totalFrames <= 0) return null;

  return (
    <div className="pointer-events-auto bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5" style={{ borderRadius: '2px' }}>
      <div className="flex items-center gap-1.5">
        {/* Transport controls */}
        <div className="flex items-center gap-0.5">
          <ControlButton onClick={() => stepFrame(-1)} label="Step back">
            <SkipBack className="h-[14px] w-[14px]" />
          </ControlButton>

          <ControlButton
            onClick={togglePlayback}
            label={isPlaying ? "Pause" : "Play"}
            active={isPlaying}
          >
            {isPlaying ? (
              <Pause className="h-[14px] w-[14px]" />
            ) : (
              <Play className="h-[14px] w-[14px] ml-0.5" />
            )}
          </ControlButton>

          <ControlButton onClick={() => stepFrame(1)} label="Step forward">
            <SkipForward className="h-[14px] w-[14px]" />
          </ControlButton>

          <ControlButton
            onClick={toggleLoop}
            label={loop ? "Loop: On" : "Loop: Off"}
            active={loop}
          >
            <Repeat className="h-[14px] w-[14px]" />
          </ControlButton>
        </div>

        <div className="h-4 w-px bg-[rgba(255,255,255,0.08)]" />

        {/* Speed picker */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedPicker((v) => !v)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-all"
            style={{ borderRadius: '2px' }}
          >
            <Gauge className="h-[14px] w-[14px]" />
            {playbackSpeed}×
          </button>

          {showSpeedPicker && (
            <div className="absolute bottom-full left-0 mb-1.5 bg-nereus-panel border border-[rgba(255,255,255,0.1)] p-1 flex flex-col gap-0.5 min-w-[60px]" style={{ borderRadius: '2px' }}>
              {speedPresets.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setPlaybackSpeed(s);
                    setShowSpeedPicker(false);
                  }}
                  className={`px-1.5 py-0.5 text-[10px] font-mono text-left transition-colors ${
                    s === playbackSpeed
                      ? "bg-[rgba(0,212,255,0.1)] text-nereus-accent"
                      : "text-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.8)]"
                  }`}
                  style={{ borderRadius: '2px' }}
                >
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-700/40" />

        {/* Progress bar + scrubber */}
        <div className="flex-1 relative group">
          {/* Marker dots */}
          <div className="absolute left-0 right-0 -top-2 h-1 pointer-events-none">
            {markers.map((frame) => {
              const pct =
                totalFrames > 1 ? (frame / (totalFrames - 1)) * 100 : 0;
              return (
                <div
                  key={frame}
                  className="absolute top-0 h-1.5 w-1.5 bg-[#fbbf24]"
                  style={{ left: `${pct}%`, transform: "translateX(-50%)", borderRadius: '1px' }}
                  title={`Frame ${frame}`}
                />
              );
            })}
          </div>

          {/* Track background */}
          <div className="relative h-1 bg-[rgba(255,255,255,0.06)] overflow-hidden" style={{ borderRadius: '1px' }}>
            <div
              className="absolute inset-y-0 left-0 bg-nereus-accent transition-[width] duration-75"
              style={{ width: `${progress}%`, borderRadius: '1px' }}
            />
          </div>

          {/* Invisible range input */}
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={clamp(currentFrame, 0, Math.max(0, totalFrames - 1))}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Frame counter */}
        <div className="ml-1 flex items-baseline gap-0.5 text-[10px] font-mono tabular-nums">
          <span className="text-[rgba(255,255,255,0.7)]">{currentFrame}</span>
          <span className="text-[rgba(255,255,255,0.2)]">/</span>
          <span className="text-[rgba(255,255,255,0.35)]">{totalFrames - 1}</span>
        </div>
      </div>
    </div>
  );
}
