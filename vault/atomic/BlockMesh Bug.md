# BlockMesh Bug

> [!bug] Severity: CRITICAL
> `blockMesh` never executes. `snappyHexMesh` runs against a stale or nonexistent base mesh.

## What's Wrong

In `simulation_worker/tasks.py`, the command list that should run `blockMesh` → `snappyHexMesh` contains a malformed entry:

```python
["chd", "->", "snappyHexMesh", "-overwrite"]
```

`chd` is not a valid command. `->` is not valid shell syntax. The intended two-step sequence — `blockMesh` then `snappyHexMesh -overwrite` — is collapsed into a single broken invocation.

## Impact

Without `blockMesh`, there is no base hexahedral mesh for `snappyHexMesh` to refine. The simulation either:
- **Fails silently** if no prior mesh exists in the case directory
- **Reuses a stale mesh** from a previous run that happened to be in the same directory
- **Produces garbage results** from an uninitialized mesh

## Fix

Replace with two explicit steps:

```python
_run_command(["blockMesh"], case_dir, sim_id, "blockMesh")
_run_command(["snappyHexMesh", "-overwrite"], case_dir, sim_id, "snappyHexMesh")
```

Optionally add `surfaceFeatureExtract` before snappy if edge refinement is desired.

## References

- [[01 - Backend Audit]] — Critical Issues
- [[Data Flow Walkthrough]] — Step 4c
