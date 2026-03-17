import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import { useMemo } from 'react';
import { useSimStore } from '../store/useSimStore';

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function TimelineController() {
  const totalFrames = useSimStore((s) => s.totalFrames);
  const currentFrame = useSimStore((s) => s.currentFrame);
  const isPlaying = useSimStore((s) => s.isPlaying);
  const loop = useSimStore((s) => s.loopPlayback);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const convergenceSeries = useSimStore((s) => s.convergenceSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);

  const setFrame = useSimStore((s) => s.setFrame);
  const togglePlayback = useSimStore((s) => s.togglePlayback);
  const stepFrame = useSimStore((s) => s.stepFrame);
  const toggleLoop = useSimStore((s) => s.toggleLoop);

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
    const worst = convergenceSeries.reduce((a, b) => (b.residual > a.residual ? b : a));
    if (worst.time === null || worst.time === undefined) return null;

    // Map residual time to the closest frame time_value if available.
    const numericFrameTimes = frameMapping
      .map((f) => ({ frame: f.frame_index, t: typeof f.time_value === 'number' ? f.time_value : null }))
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
    if (typeof maxDragFrame === 'number') set.add(maxDragFrame);
    if (typeof instabilityFrame === 'number') set.add(instabilityFrame);
    return Array.from(set.values());
  }, [maxDragFrame, instabilityFrame]);

  if (totalFrames <= 0) return null;

  return (
    <div className="pointer-events-auto rounded border border-slate-700 bg-slate-950/60 backdrop-blur px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => stepFrame(-1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-700 bg-black/30 hover:bg-black/50"
          aria-label="Step back"
        >
          <SkipBack className="h-4 w-4 text-slate-100" />
        </button>

        <button
          onClick={togglePlayback}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-700 bg-black/30 hover:bg-black/50"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 text-slate-100" />
          ) : (
            <Play className="h-4 w-4 text-slate-100" />
          )}
        </button>

        <button
          onClick={() => stepFrame(1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-700 bg-black/30 hover:bg-black/50"
          aria-label="Step forward"
        >
          <SkipForward className="h-4 w-4 text-slate-100" />
        </button>

        <button
          onClick={toggleLoop}
          className={`h-8 w-8 inline-flex items-center justify-center rounded border transition-colors ${
            loop ? 'border-blue-600 bg-blue-900/20' : 'border-slate-700 bg-black/30 hover:bg-black/50'
          }`}
          aria-label="Loop"
          title={loop ? 'Loop: On' : 'Loop: Off'}
        >
          <Repeat className={`h-4 w-4 ${loop ? 'text-blue-200' : 'text-slate-100'}`} />
        </button>

        <div className="flex-1 relative">
          {/* Markers */}
          <div className="absolute left-0 right-0 -top-1.5 h-1 pointer-events-none">
            {markers.map((frame) => {
              const pct = totalFrames > 1 ? (frame / (totalFrames - 1)) * 100 : 0;
              return (
                <div
                  key={frame}
                  className="absolute top-0 h-1 w-1 rounded-full bg-orange-400"
                  style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={clamp(currentFrame, 0, Math.max(0, totalFrames - 1))}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="w-24 text-right text-xs text-slate-300">
          {currentFrame} / {totalFrames - 1}
        </div>
      </div>
    </div>
  );
}
