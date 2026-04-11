# Rotation Audit & Fix Plan

## Problem Statement

When the user adjusts orientation (pitch/roll/yaw) via the OrientationPanel sliders or the transform gizmo, **everything rotates as one** — the foil, axis lines, flow arrow, nose/tail markers, and any simulation result meshes all move together. The intended behavior is:

- **Foil surface** → rotates with orientation
- **Reference actors** (axis lines, flow arrow, nose/tail markers) → stay world-fixed
- **Simulation result actors** (vorticity, streamlines, flowLines, pressureLines) → stay world-fixed (already pre-rotated by the solver)

---

## Root Cause Analysis

### The `WORLD_FIXED` set is correct — so why does everything rotate?

The code in **Effect 4** (lines ~1040-1070 of `useVtkScene.ts`) has the right logic:

```ts
const WORLD_FIXED = new Set(["axisX", "axisY", "axisZ", "flowArrow", "noseMarker", "tailMarker"]);
for (const [key, actor] of Object.entries(actorsRef.current)) {
  if (actor && !WORLD_FIXED.has(key)) {
    actor.setOrigin(cx, cy, cz);
    actor.setOrientation(0, 0, 0);
    actor.rotateY(effectiveY);
    actor.rotateX(effectiveP);
    actor.rotateZ(effectiveR);
  }
}
```

This correctly skips world-fixed actors. But the user reports everything rotates together. This means the root cause is **NOT** in actor rotation — it's in **VTK camera orbit**.

### The real problem: `vtkInteractorStyleTrackballCamera`

The VTK interactor (`useVtkRenderer.ts` line 103) uses `vtkInteractorStyleTrackballCamera`. This rotates the **camera** around the world origin (or focal point). In VTK, when you orbit the camera:

- The camera moves around a focal point
- **All actors appear to rotate together** because the camera's viewpoint changes

This is 3D rendering 101 — "camera orbit" is not "actor rotation." Both look identical to the user. When the user says "everything rotates as one," they may be describing:

1. **Camera orbit** (left-click drag in viewport) — this is expected: moving viewpoint moves everything visually
2. **Orientation slider changes** — if these also move everything, that's the bug

### Hypothesis 1: The `isAssetPreview` guard zeros out rotation

```ts
const isAssetPreview = foilUrl === assetPreviewUrl && !activeFrameUrl && !fallbackUrl;
const effectiveP = isAssetPreview ? pitch : 0;
const effectiveY = isAssetPreview ? yaw : 0;
const effectiveR = isAssetPreview ? roll : 0;
```

When viewing simulation results (`activeFrameUrl` or `fallbackUrl` is set), `isAssetPreview` is `false`, so **all rotation values are zeroed out**. Effect 4 then sets `setOrientation(0,0,0)` on every non-world-fixed actor with no rotations — effectively doing nothing.

In this mode, **changing pitch/roll/yaw via sliders has no visible effect** (it only applies during asset preview). This might be what the user is experiencing: sliders don't rotate the foil, and the only rotation they see is camera orbit (which moves everything).

### Hypothesis 2: Effect 4 does work, but reference actors built at foil-relative positions

The `buildFlowArrowActor` and `buildMarkerActors` position themselves relative to the foil's unrotated bounds:

```ts
// Flow arrow positioned at bounds[0] - chord * 1.5
actor.setPosition(bounds[0] - chord * 1.5, (bounds[2]+bounds[3])/2, (bounds[4]+bounds[5])/2);

// Nose marker at bounds[0], tail at bounds[1]
noseActor.setPosition(bounds[0], cy, cz);
tailActor.setPosition(bounds[1], cy, cz);
```

When the foil rotates, these markers stay at the **pre-rotation position**, which is correct. But they don't move to track the rotated foil's nose/tail — the cone markers still point where the nose/tail *were* before rotation, not where they *are*.

### Hypothesis 3: Effect 1 and Effect 4 race or conflict

Effect 1 (foil load) also applies orientation, using the same `WORLD_FIXED` set. Then Effect 4 re-applies orientation whenever pitch/roll/yaw changes. These should be idempotent (both use `setOrientation(0,0,0)` reset then re-apply), so this shouldn't be a problem.

---

## Confirmed Issues

### Issue 1: Orientation only works in asset preview mode

The `isAssetPreview` gate means rotation via sliders is completely disabled when viewing simulation results. This is intentional (results are pre-rotated by the solver), but is confusing — the sliders still appear and respond, but have no visible effect.

**Fix**: Either hide the orientation sliders when viewing simulation results, or clearly indicate "locked" state.

### Issue 2: Camera orbit rotates everything together (expected but confusing)

VTK trackball camera orbit moves the camera, not the actors. All actors (foil, arrows, markers, axis lines) rotate together visually during orbit because the camera is what moves.

This is not a bug — it's how 3D viewports work. Unity has the same behavior. The difference is that Unity's grid is a **post-process effect** (screen-space), not a 3D actor, so it stays fixed while the scene orbits.

**Fix**: The CSS grid background already addresses this — it provides a fixed visual reference that doesn't orbit. No code change needed; this is working correctly.

### Issue 3: Reference actors (axis lines, flow arrow, markers) also orbit with camera

This is inherent to 3D rendering. To make them "fixed" relative to the screen (like a HUD), they'd need to be either:
- Rendered in a separate non-interactive overlay renderer
- Drawn as CSS/SVG overlays (2D)
- Re-positioned every frame to counteract camera movement (expensive hack)

The current approach — they're world-space actors that move with camera orbit — is standard. The `WORLD_FIXED` set correctly prevents them from being affected by the **orientation sliders**, which is the actual requirement.

---

## Fix Plan

### Fix A: Clarify orientation slider behavior for simulation results (UX Fix)

**Problem**: Orientation sliders are visible but ineffective during simulation results viewing.

**Change**: In `OrientationPanel.tsx`, show a disabled/locked state when viewing simulation results. Add a tooltip: "Orientation is baked into simulation results."

**Files**: `frontend/src/components/OrientationPanel.tsx`

### Fix B: Ensure Effect 4 works correctly for asset preview (Verify)

**Current code is correct** — just needs verification that:
1. `foilUrl === assetPreviewUrl` is true when previewing an uploaded asset
2. `activeFrameUrl` and `fallbackUrl` are both null/undefined in that state
3. The rotation actually applies visually

**Test**: Upload a geometry file, don't run a simulation, adjust pitch/yaw/roll sliders — foil should rotate while markers/arrows stay fixed.

### Fix C: No changes needed for camera orbit behavior

Camera orbit moving everything together is correct 3D behavior. The CSS grid background already provides the fixed-reference illusion.

---

## Architecture Summary

```
User drags slider (OrientationPanel)
  → Zustand store: setPitch/setRoll/setYaw
    → Effect 4 fires (useVtkScene.ts)
      → Checks isAssetPreview
        → TRUE: applies rotation to foilSurface only (WORLD_FIXED actors skipped)
        → FALSE: zeros out rotation (results already oriented by solver)
      → render()

User drags in viewport (mouse orbit / trackball camera)
  → vtkInteractorStyleTrackballCamera
    → Moves camera around focal point
    → ALL actors appear to rotate (camera moved, not actors)
    → CSS grid stays fixed (not a 3D actor)

User drags gizmo ring (useTransformGizmo)
  → Computes angle delta
  → Calls setPitch/setRoll/setYaw on Zustand store
    → Same flow as slider (Effect 4)
```

## Actor Classification

| Actor | Rotates with orientation? | Why |
|-------|--------------------------|-----|
| `foilSurface` | YES (asset preview) / NO (sim results) | Foil is the subject of rotation |
| `pressureLines` | YES (asset preview) / NO (sim results) | CFD overlay on foil |
| `flowLines` | YES (asset preview) / NO (sim results) | CFD overlay on foil |
| `vorticity` | YES (asset preview) / NO (sim results) | CFD overlay on foil |
| `streamlines` | YES (asset preview) / NO (sim results) | CFD overlay on foil |
| `axisX/Y/Z` | NEVER | World reference |
| `flowArrow` | NEVER | World reference |
| `noseMarker` | NEVER | World reference (positioned at unrotated bounds) |
| `tailMarker` | NEVER | World reference (positioned at unrotated bounds) |

---

## Recommendation

The rotation code is architecturally correct. The most likely user complaint is one of:

1. **"Sliders don't do anything"** → Because `isAssetPreview` is false when viewing sim results → Fix A (UX: disable/explain)
2. **"Camera orbit makes everything move"** → This is correct 3D behavior → No fix needed
3. **"I want markers to track the rotated nose/tail"** → Markers would need to be repositioned after rotation → Minor enhancement, rebuild markers from rotated bounds

**Priority**: Fix A (clearly communicate slider state) is the most impactful with least risk.
