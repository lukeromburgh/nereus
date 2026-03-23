/**
 * useVtkPlayback — requestAnimationFrame-based playback loop for VTK.js.
 *
 * Replaces the R3F useFrame-based PlaybackSyncLoop.  Advances the current frame
 * in the Zustand store at the configured playbackSpeed and triggers a VTK render.
 */
import { useEffect, useCallback } from "react";
import { useSimStore } from "../store/useSimStore";

export function useVtkPlayback(renderFn: () => void) {
  const isPlaying = useSimStore((s) => s.isPlaying);
  const playbackSpeed = useSimStore((s) => s.playbackSpeed);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const loopPlayback = useSimStore((s) => s.loopPlayback);

  const tick = useCallback(
    (lastTime: number) => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000; // seconds

      const state = useSimStore.getState();
      if (!state.isPlaying || state.totalFrames <= 0) return;

      const nextFrame = state.currentFrame + delta * state.playbackSpeed;
      const floored = Math.floor(nextFrame);

      if (state.loopPlayback) {
        const wrapped =
          ((floored % state.totalFrames) + state.totalFrames) %
          state.totalFrames;
        state.setFrame(wrapped);
      } else if (floored >= state.totalFrames - 1) {
        state.setFrame(state.totalFrames - 1);
        state.togglePlayback();
        return; // stop the loop
      } else {
        state.setFrame(floored);
      }

      renderFn();
    },
    [renderFn],
  );

  useEffect(() => {
    if (!isPlaying || totalFrames <= 0) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = () => {
      const now = performance.now();
      tick(lastTime);
      lastTime = now;
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed, totalFrames, loopPlayback, tick]);
}
