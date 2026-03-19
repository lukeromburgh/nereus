#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Nereus coordinate-system test runner
# Exits with code 1 if ANY test suite fails.
# Suitable as a pre-commit hook or CI step.
# ──────────────────────────────────────────────────────────────────────────

set -e  # exit on first failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══════════════════════════════════════════════════════════════"
echo "  Nereus Coordinate System Test Suite"
echo "═══════════════════════════════════════════════════════════════"

# ── Python tests (pytest) ────────────────────────────────────────────────

echo ""
echo "── 1/5  STL Normalisation ──────────────────────────────────────"
python -m pytest "$SCRIPT_DIR/test_stl_normalisation.py" -v || exit 1

echo ""
echo "── 2/5  OpenFOAM Coordinates ───────────────────────────────────"
python -m pytest "$SCRIPT_DIR/test_openfoam_coordinates.py" -v || exit 1

echo ""
echo "── 3/5  Post-Processing Coordinates ────────────────────────────"
python -m pytest "$SCRIPT_DIR/test_postprocess_coordinates.py" -v || exit 1

# ── TypeScript tests (Vitest) ────────────────────────────────────────────

echo ""
echo "── 4/5  Three.js Scene Transforms ──────────────────────────────"
cd "$ROOT_DIR/frontend"
npx vitest run "$SCRIPT_DIR/test_scene_transforms.ts" || exit 1
cd "$ROOT_DIR"

# ── End-to-end (skip OpenFOAM-dependent tests) ──────────────────────────

echo ""
echo "── 5/5  End-to-End Coordinates (no OpenFOAM) ───────────────────"
python -m pytest "$SCRIPT_DIR/test_end_to_end_coordinates.py" -v -m "not openfoam" || exit 1

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALL COORDINATE TESTS PASSED"
echo "═══════════════════════════════════════════════════════════════"
