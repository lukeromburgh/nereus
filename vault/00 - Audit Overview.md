# Nereus Grand Audit — April 2026

This audit is a comprehensive review of the Nereus hydrofoil CFD platform, covering every layer of the stack. The goal: identify exactly where the app is now, what's working, what's fragile, and what specific steps are needed to reach a state where a real hydrofoil designer could derive value from it.

## Sections

1. [[01 - Backend Audit]] — Solver, physics, OpenFOAM pipeline, dependencies, data flow
2. [[02 - User Journey & UX Audit]] — End-to-end workflows, friction points, missing guardrails
3. [[03 - Frontend & UI Audit]] — Component architecture, 3D visualisation, state management, styling
4. [[04 - Infrastructure, Security, Testing & Database Audit]] — Docker, deployment, OWASP assessment, test coverage, schema health

## How to Read

Each section contains:
- **Current State** — What exists today, with honest assessment
- **Issues & Risks** — Categorised by severity (Critical / High / Medium / Low)
- **Next Steps** — Concrete, ordered actions to reach MVP handoff readiness

Cross-references use `[[wikilinks]]` for Obsidian navigation.

## Roadmap

- [[next_steps]] — Phased plan from prototype to production: auth → physics → reliability → workflows → deployment

## Walkthroughs

- [[Data Flow Walkthrough]] — Trace a single request: Run click → POST → Celery → OpenFOAM → PATCH → poll → VTK render

## Atomic Notes

Standalone deep-dives on key findings, cross-linked from the audit sections:

- [[BlockMesh Bug]] — CRITICAL: blockMesh never executes
- [[Walls Boundary Condition Bug]] — CRITICAL: far-field walls use noSlip
- [[No Authentication]] — CRITICAL: zero auth on all endpoints
- [[God Table Problem]] — HIGH: SimulationRun 47-field model
- [[God Store Problem]] — HIGH: useSimStore 50-field Zustand atom
- [[Hardcoded API URLs]] — HIGH: localhost:8000 in 7+ files
- [[VTK Memory Leak]] — HIGH: no geometry cache eviction
- [[Worker Django Version Mismatch]] — MEDIUM: Django 4.x vs 5.x across containers
