# God Store Problem

> [!warning] Severity: HIGH
> `useSimStore` bundles ~50 fields and ~30 actions across 5 unrelated domains into a single Zustand atom.

## What's Wrong

`frontend/src/store/useSimStore.ts` (370 lines) manages:

| Domain | Fields | Actions |
|--------|--------|---------|
| Simulation lifecycle | `activeSimId`, `status`, `logs`, result paths | `startNewSim`, `updateSim`, `clearSim` |
| Simulation config | `velocity`, `aoa`, `waterDensity`, `meshDensity`, ... | `setVelocity`, `setAoa`, ... |
| Visualization | `showFlowLines`, `showPressureMap`, `colormap`, `enableBloom` | `toggleLayer`, `setColormap` |
| Playback | `frameMapping`, `currentFrame`, `isPlaying`, `playbackSpeed` | `setFrame`, `togglePlayback` |
| Orientation | `pitch`, `roll`, `yaw`, `geometryDimensions` | `setPitch`, `setRoll`, `setYaw` |

### Problems

1. **Render coupling** — A change to `playbackSpeed` triggers re-render checks in components that only use `velocity`. Zustand selectors help, but conceptual coupling remains.
2. **Untyped setter** — `updateSim(data: any)` accepts unvalidated data from the API and spreads it into the store.
3. **No persistence** — Reloading the page loses all config state.
4. **Testing difficulty** — Can't test simulation config logic without bringing in visualization and playback state.

## Recommended Split

```typescript
useSimLifecycle()    // id, status, logs, results
useSimConfig()       // velocity, aoa, density, mesh, environment
useVisualization()   // layers, colormap, bloom, SSAO
usePlayback()        // frames, current, speed, loop
useOrientation()     // pitch, roll, yaw, detected axes
```

Each is a separate `create()` call. Cross-store reads use `getState()`.

## References

- [[03 - Frontend & UI Audit]] — State Management
- [[Data Flow Walkthrough]] — Step 2
