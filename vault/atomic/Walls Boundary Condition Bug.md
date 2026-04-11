# Walls Boundary Condition Bug

> [!bug] Severity: CRITICAL
> Far-field domain walls use `noSlip` instead of `slip`, creating artificial boundary layers that pollute drag results.

## What's Wrong

In `simulation_worker/template_manager.py`, the velocity boundary condition for the `walls` patch is:

```
walls {
    type            noSlip;
}
```

For an external aerodynamic/hydrodynamic simulation, the outer domain boundaries are **not physical walls**. They represent open space. `noSlip` forces zero velocity at these boundaries, creating thin boundary layers on every face of the computational domain.

## Impact

- **Artificial drag** from domain-wall boundary layers
- **Over-prediction of forces**, especially at coarse mesh densities where domain walls are close to the foil
- The effect worsens as domain size decreases (and the domain is already undersized — only 2× upstream vs. recommended 5×)
- Turbulence quantities (k, omega, nut) also have wall-function treatment on these artificial walls, compounding the error

## Fix

Change `walls` in the U template to `slip`:

```
walls {
    type            slip;
}
```

Remove or update wall-function entries for k, omega, and nut on the `walls` patch. These should become `zeroGradient` or `inletOutlet` depending on flow direction.

## References

- [[01 - Backend Audit]] — Critical Issues
- [[Data Flow Walkthrough]] — Step 4e
