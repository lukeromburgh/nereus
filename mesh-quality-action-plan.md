# Mesh Quality Action Plan

## Objective

Improve hydrofoil simulation quality so that:

1. the foil surface in the viewer is visually smooth rather than stair-stepped,
2. sharp edges are captured consistently,
3. boundary-layer treatment is numerically consistent with the turbulence model,
4. solver residuals settle without large artificial pressure sawtoothing,
5. improvements stay within the current compute envelope unless a later phase proves otherwise.

This plan is ordered from highest-leverage, lowest-cost changes to more expensive follow-up work.

---

## Current Diagnosis

### Confirmed issues

1. The source foil geometry is not the bottleneck.
   - The STL is already dense.
   - The jagged surface appears after meshing and post-processing, not in the input asset.

2. The foil boundary mesh is too coarse.
   - Recent runs exported a foil surface with only a few thousand cells.
   - That is too low for a smooth hydrofoil surface and sharp trailing-edge representation.

3. Edge snapping has been unreliable.
   - Earlier runs had an empty `features()` section because the OpenFOAM 11 feature extraction path was wrong.
   - Without an `.eMesh`, `snappyHexMesh` rounds or facetes critical edges.

4. Boundary-layer setup and turbulence wall treatment were mismatched.
   - The wall functions in use expect a wall-function regime, not a near-zero first-layer height.
   - This mismatch contributed to bad y+ behavior and unstable pressure correction patterns.

5. The residual chart overstated the oscillation.
   - The completed-run convergence series was using the first pressure correction each timestep instead of the final pressure solve.
   - That made the sawtooth look worse than the actual converged state.

### What is already fixed

1. OpenFOAM 11 feature extraction path was corrected from the deprecated utility to the OF11-compatible path.
2. First-layer target was moved toward a wall-function-consistent regime.
3. Pressure damping and convergence parsing were improved.
4. Foil surface refinement and explicit feature snapping were increased in the template for future runs.

These fixes are necessary but not yet sufficient to declare the meshing problem solved.

---

## Strategy

Use a staged approach:

1. Stabilize the existing `snappyHexMesh` pipeline.
2. Increase local foil fidelity without globally exploding the cell count.
3. Validate whether quality and smoothness improve enough.
4. Only if needed, move to a more expensive local refinement strategy.
5. Only after that, consider a different meshing workflow.

This avoids prematurely jumping to a full meshing-method rewrite.

---

## Phase 1: Validate the Recent Template Fixes

### Goal

Prove that the latest meshing settings actually make it into a new run and improve the foil boundary patch.

### Actions

1. Run a fresh simulation with the current worker code.
2. Verify the generated `snappyHexMeshDict` includes:
   - a non-empty `features()` block,
   - `explicitFeatureSnap true`,
   - stronger snap iterations,
   - foil surface refinement at least `(4 5)`.
3. Verify `constant/triSurface/foil.eMesh` exists before `snappyHexMesh` runs.
4. Check `log.surfaceFeatureExtract` or the OF11-equivalent output for successful edge extraction.
5. Compare the new exported foil surface cell count against run 110.

### Success criteria

1. `foil.eMesh` exists.
2. `features()` is populated in the case dictionary.
3. Foil patch cell count rises materially above the previous ~3k-cell level.
4. Viewer surface appears visibly smoother at the leading and trailing edges.

### Failure signal

If the new run still shows a coarse foil patch with clear stair-stepping, the current surface refinement is still insufficient and Phase 2 becomes mandatory.

---

## Phase 2: Add Targeted Near-Foil Refinement Shells

### Goal

Increase resolution around the foil without refining the whole fluid domain.

### Why this matters

Right now most of the compute is spent on a broad external-flow box. That is acceptable for the far field, but it is wasteful near the actual geometry where curvature and pressure gradients matter.

### Actions

1. Add one or two local refinement regions around the foil.
   - Inner shell: highest refinement close to the foil.
   - Outer shell: intermediate refinement to reduce abrupt cell-size transitions.
2. Keep the background domain size unchanged.
3. Keep global cell limits bounded and grow them only if the local refinement proves efficient.
4. Tune shell size based on chord length rather than fixed absolute values.

### Suggested implementation shape

1. Inner refinement zone around foil bounding box expanded by a small multiple of chord.
2. Outer refinement zone expanded by a larger multiple of chord.
3. Apply higher `refinementRegions` levels there instead of globally increasing base mesh density.

### Success criteria

1. Foil patch becomes smooth enough that facet edges are no longer visually dominant.
2. Cell count increase remains mostly local.
3. Mesh quality metrics do not deteriorate sharply.

### Failure signal

If local refinement creates too many skewed or concave cells, the refinement transitions are too abrupt and need smoother grading.

---

## Phase 3: Improve Edge Capture and Trailing-Edge Treatment

### Goal

Make the leading edge, tip transitions, and trailing edge snap cleanly instead of forming pyramidal or broken faces.

### Actions

1. Increase feature refinement level when mesh density is moderate or high.
2. Tune `resolveFeatureAngle` and feature snapping iteration counts using actual output quality, not defaults.
3. Review whether the trailing edge in the input geometry is effectively too sharp for the current cell scale.
4. If needed, add a geometry-preprocessing rule for ultra-thin trailing edges so the mesh can resolve them robustly.

### Important note

This is not primarily a compute issue. It is a feature-capture issue first.

### Success criteria

1. Trailing-edge facets stop breaking into jagged sawtooth cells.
2. Surface pressure contours stop showing obviously blocky geometry artifacts.

---

## Phase 4: Reconcile Boundary Layers with y+ Targets

### Goal

Get the wall-normal mesh into a regime that matches the turbulence model and wall functions.

### Actions

1. Measure y+ again on a fresh run after the current layer-thickness fix.
2. Confirm that the foil patch, not just the background walls, is in the intended range.
3. If y+ is still too high, increase near-wall resolution locally rather than globally.
4. If layers still collapse or distort near edges, tune layer controls before increasing layer count.

### Success criteria

1. Foil y+ falls into a consistent wall-function regime.
2. Layer extrusion succeeds on most foil faces.
3. Pressure and skin-friction fields become less noisy.

### Failure signal

If good y+ requires runaway cell counts, the current wall-model strategy may need to change rather than the mesh alone.

---

## Phase 5: Tighten Mesh-Quality Gates Around Real Failure Modes

### Goal

Reject meshes that are technically runnable but visually or numerically poor.

### Why this matters

The current pipeline can produce a run that completes yet still gives a visibly faceted foil and nontrivial pressure jitter. That is a product failure even if OpenFOAM does not abort.

### Actions

1. Add acceptance thresholds for:
   - number of concave cells,
   - severe non-orthogonal faces,
   - foil patch cell count,
   - foil surface smoothness proxy if practical.
2. Distinguish between:
   - hard CFD-invalid meshes,
   - meshes that solve but are too low quality for presentation.
3. Fail or warn on low foil patch resolution even if `checkMesh` technically passes.

### Success criteria

1. Low-detail jagged meshes stop reaching the “completed” state silently.
2. The system provides a clear reason for retrying or escalating resolution.

---

## Phase 6: Decide Whether Compute Is Actually the Limiter

### Goal

Quantify whether better quality is still affordable within the current hardware budget.

### Expected outcome

For the next step up in quality, compute should still be manageable if refinement remains local.

### Likely cost profile

1. Increasing only foil surface refinement and local shells: moderate increase.
2. Increasing global blockMesh density: expensive and usually inefficient.
3. Switching to a fully different mesher: high implementation cost and uncertain payoff.

### Decision rule

If Phase 2 and Phase 3 produce a smooth-enough foil with stable residuals at a tolerable runtime, stay with `snappyHexMesh`.

If not, then the limitation is no longer just tuning, and a bigger meshing change becomes justified.

---

## Phase 7: Only If Needed, Escalate to a Larger Meshing Change

### When to consider this

Only after the tuned `snappyHexMesh` path fails to deliver acceptable foil quality.

### Options

1. More advanced local region refinement strategy with tighter geometry control.
2. Geometry preprocessing pipeline to improve meshing robustness at thin edges.
3. Alternative meshing route for the foil surface before volume meshing.

### Recommendation

Do not start here. The current evidence does not justify a full meshing-method replacement yet.

---

## Immediate Next Actions

### Highest priority

1. Run a fresh simulation using the current template changes.
2. Inspect whether `foil.eMesh` is present and used.
3. Measure foil patch cell count and compare it to run 110.
4. Visually compare the new `foil_surface.vtp` against run 110.

### If the surface is still jagged

1. Implement local refinement shells around the foil.
2. Re-run and compare:
   - foil patch cell count,
   - concave cells,
   - severe non-orth faces,
   - viewer smoothness,
   - runtime.

### If that still fails

1. Revisit trailing-edge handling and feature-angle tuning.
2. Only then consider a larger meshing workflow change.

---

## Definition of Done

We can call this fixed when all of the following are true on a fresh run:

1. The foil looks smooth in the viewer at normal zoom levels.
2. Leading and trailing edges are not visibly stair-stepped.
3. `features()` is populated and edge extraction succeeds.
4. Foil patch resolution is materially higher than the old ~3k-cell result.
5. Mesh quality is acceptable without large populations of problematic cells.
6. Solver residuals settle without misleading or genuinely problematic pressure oscillation.
7. Runtime remains acceptable for the product workflow.

---

## Recommendation

Proceed with one fresh validation run first.

If that run is still visibly faceted, implement local refinement shells next. That is the most likely best-value improvement path and should still be inside the current compute budget.