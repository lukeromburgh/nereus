# God Table Problem

> [!warning] Severity: HIGH
> `SimulationRun` has 47+ fields mixing inputs, outputs, diagnostics, and metadata on a single Django model.

## What's Wrong

`backend/api/models.py` → `SimulationRun` is a flat table holding:

| Domain | Example Fields |
|--------|---------------|
| Vehicle config | `mass`, `payload`, `center_of_gravity` (JSON) |
| Operating conditions | `velocity`, `angle_of_attack`, `submersion_depth` |
| Environment | `water_density`, `wave_height`, `enable_gravity` |
| Mesh config | `mesh_density`, `num_layers`, `feature_level` |
| Orientation | `pitch`, `roll`, `yaw`, `detected_chord_axis`, `geometry_axes_detected` (JSON) |
| Status & logs | `status`, `current_logs` |
| Results | `result_mesh_path`, `frame_mapping` (JSON), `metrics_series` (JSON), `convergence_series` (JSON), `file_manifest` (JSON) |
| Post-processing | `slice_axis`, `orientation_preview_stl_path`, `orientation_preview_glb_path` |

### Problems

1. **Serializer weight** — The serializer must handle all 47 fields. The `update()` method bypasses `read_only_fields` via `self.initial_data`, letting any HTTP client overwrite status and results.
2. **7 unvalidated JSONFields** — `frame_mapping`, `metrics_series`, `convergence_series`, `file_manifest`, `center_of_gravity`, `geometry_dimensions`, `geometry_axes_detected` have no schema enforcement.
3. **Mixed ownership** — Some fields are user input (velocity, AoA), some are worker output (results, logs), some are auto-detected (geometry axes). No separation of concerns.
4. **Query difficulty** — JSONField queries are inefficient and non-portable across SQLite/Postgres.

## Recommended Approach

For MVP, leave as-is — it works. For next-phase:

```
SimulationConfig  → user inputs (velocity, AoA, mesh, environment)
SimulationRun     → lifecycle (status, logs, timestamps)
SimulationResults → worker outputs (metrics, frames, paths)
```

## References

- [[01 - Backend Audit]] — Model Assessment
- [[04 - Infrastructure, Security, Testing & Database Audit]] — Database Health
- [[Data Flow Walkthrough]] — Step 5
