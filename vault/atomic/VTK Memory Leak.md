# VTK Memory Leak

> [!warning] Severity: HIGH
> Geometry cache in `useVtkScene` grows unbounded. Switching between simulation runs accumulates GPU-resident buffers indefinitely.

## What's Wrong

`frontend/src/hooks/useVtkScene.ts` caches parsed geometry by URL:

```typescript
const geoCache = useRef<Map<string, CachedGeo>>(new Map());
```

This map is **never evicted**. Each VTP frame with pressure scalars can be 2–10 MB of vertex data. A typical session:

| Scenario | Cache Size |
|----------|-----------|
| 1 run, 10 frames | 20–100 MB |
| 5 runs, 10 frames each | 100–500 MB |
| Extended session, 20+ runs | 500 MB+ |

VTK.js allocates typed arrays and WebGL buffers that are not garbage-collected by the JS engine until explicitly released via `polyData.delete()`.

## Symptoms

- Browser tab memory climbs steadily during a session
- Eventually triggers WebGL context loss ("Rats! WebGL hit a snag")
- Performance degrades gradually — frame rate drops as GPU memory fills

## Fix

Add LRU eviction with a size or count cap:

```typescript
const MAX_CACHE_ENTRIES = 20;

function evictOldest(cache: Map<string, CachedGeo>) {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = cache.keys().next().value;
  const entry = cache.get(oldest);
  entry?.polyData.delete();
  cache.delete(oldest);
}
```

Or use a byte-budget approach (max 200 MB) by tracking `polyData.getNumberOfPoints() * bytesPerPoint`.

## References

- [[03 - Frontend & UI Audit]] — VTK.js Integration
- [[Data Flow Walkthrough]] — Step 7
