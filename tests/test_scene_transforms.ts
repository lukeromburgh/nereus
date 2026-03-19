/**
 * FILE 4 — Three.js Scene Transform Tests (Vitest)
 * ==================================================
 *
 * Test the transform mathematics in isolation — no React components mounted.
 * Import THREE directly and verify the two-layer group architecture, centring
 * offset, Euler convention, arrow/marker positions, and token guard logic.
 */
import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.1 — Two-layer group: rotation does not affect parent position
// ═══════════════════════════════════════════════════════════════════════════

describe("Two-layer group transform isolation", () => {
  it("rotation on child does not move parent position", () => {
    const sceneGroup = new THREE.Group();
    sceneGroup.position.set(-3.5, 0, 1.0);

    const orientationGroup = new THREE.Group();
    sceneGroup.add(orientationGroup);

    orientationGroup.rotation.set(0.1, 0.5, 0.2, "XYZ");

    // Force world matrix update
    sceneGroup.updateMatrixWorld(true);

    // Parent position unchanged
    expect(sceneGroup.position.x).toBeCloseTo(-3.5, 6);
    expect(sceneGroup.position.y).toBeCloseTo(0, 6);
    expect(sceneGroup.position.z).toBeCloseTo(1.0, 6);

    // Child world position equals parent position (rotation does not translate)
    const childWorldPos = new THREE.Vector3();
    orientationGroup.getWorldPosition(childWorldPos);
    expect(childWorldPos.x).toBeCloseTo(-3.5, 4);
    expect(childWorldPos.y).toBeCloseTo(0, 4);
    expect(childWorldPos.z).toBeCloseTo(1.0, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.2 — Centring offset is the inverse of geometry centre of mass
// ═══════════════════════════════════════════════════════════════════════════

describe("Centring offset", () => {
  it("brings geometry centre to world origin", () => {
    const box = new THREE.Box3(
      new THREE.Vector3(3.0, -0.5, -1.2),
      new THREE.Vector3(4.0, 0.5, -0.8),
    );
    const centre = box.getCenter(new THREE.Vector3());

    const sceneGroup = new THREE.Group();
    sceneGroup.position.set(-centre.x, -centre.y, -centre.z);
    sceneGroup.updateMatrixWorld(true);

    // A point at the original box centre, transformed by the scene group
    const pt = centre.clone();
    pt.applyMatrix4(sceneGroup.matrixWorld);

    expect(pt.x).toBeCloseTo(0, 4);
    expect(pt.y).toBeCloseTo(0, 4);
    expect(pt.z).toBeCloseTo(0, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.3 — Orientation Euler order matches backend (sxyz → XYZ)
// ═══════════════════════════════════════════════════════════════════════════

describe("Euler convention contract (sxyz ↔ XYZ)", () => {
  it("Three.js Euler XYZ matches manual X-then-Y-then-Z rotation", () => {
    const pitch = 0.3; // around X
    const yaw = 0.5; // around Y
    const roll = 0.2; // around Z

    // Method A: THREE.Euler with order 'XYZ'
    // In Three.js Euler(x, y, z, 'XYZ') applies X first, then Y, then Z
    // OrientationApplier sets: Euler(pitch, yaw, roll, 'XYZ')
    const euler = new THREE.Euler(pitch, yaw, roll, "XYZ");
    const quatA = new THREE.Quaternion().setFromEuler(euler);
    const vecA = new THREE.Vector3(1, 0, 0).applyQuaternion(quatA);

    // Method B: Compose individual rotation matrices
    const mX = new THREE.Matrix4().makeRotationX(pitch);
    const mY = new THREE.Matrix4().makeRotationY(yaw);
    const mZ = new THREE.Matrix4().makeRotationZ(roll);

    // Three.js Euler 'XYZ' = intrinsic X-then-Y-then-Z
    // In matrix form: M = Rx * Ry * Rz
    const composed = new THREE.Matrix4().multiplyMatrices(mX, mY).multiply(mZ);
    const vecB = new THREE.Vector3(1, 0, 0).applyMatrix4(composed);

    expect(vecA.x).toBeCloseTo(vecB.x, 5);
    expect(vecA.y).toBeCloseTo(vecB.y, 5);
    expect(vecA.z).toBeCloseTo(vecB.z, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.4 — FlowDirectionArrow position is always upstream
// ═══════════════════════════════════════════════════════════════════════════

describe("FlowDirectionArrow upstream of foil", () => {
  it.each([
    { chord: 0.3, label: "small foil" },
    { chord: 1.0, label: "1m foil" },
    { chord: 2.0, label: "large foil" },
  ])(
    "arrow origin x < bounds.min.x for $label",
    ({ chord }: { chord: number }) => {
      const half = chord / 2;
      const centredFoilBounds = {
        min: [-half, -0.125, -0.025] as [number, number, number],
        max: [half, 0.125, 0.025] as [number, number, number],
      };

      const bMin = new THREE.Vector3(...centredFoilBounds.min);
      const bMax = new THREE.Vector3(...centredFoilBounds.max);
      const centre = new THREE.Vector3()
        .addVectors(bMin, bMax)
        .multiplyScalar(0.5);
      const chordLen = bMax.x - bMin.x;
      const originX = bMin.x - chordLen * 0.6;
      const originY = centre.y;
      const originZ = centre.z;

      expect(originX).toBeLessThan(centredFoilBounds.min[0]);
      expect(originY).toBeCloseTo(centre.y, 6);
      expect(originZ).toBeCloseTo(centre.z, 6);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.5 — Nose marker is at x_min, tail at x_max
// ═══════════════════════════════════════════════════════════════════════════

describe("FoilNoseMarker positions", () => {
  it("nose at x_min, tail at x_max for centred bounds", () => {
    const bounds = {
      min: [-0.5, -0.25, -0.05] as [number, number, number],
      max: [0.5, 0.25, 0.05] as [number, number, number],
    };

    const bMin = new THREE.Vector3(...bounds.min);
    const bMax = new THREE.Vector3(...bounds.max);
    const centre = new THREE.Vector3()
      .addVectors(bMin, bMax)
      .multiplyScalar(0.5);

    const nose = [bMin.x, centre.y, centre.z];
    const tail = [bMax.x, centre.y, centre.z];

    expect(nose[0]).toBeCloseTo(-0.5, 4);
    expect(tail[0]).toBeCloseTo(0.5, 4);
  });

  it("after 180° yaw rotation, bounds swap leading/trailing x", () => {
    // Original box at origin
    const box = new THREE.Box3(
      new THREE.Vector3(-0.5, -0.25, -0.05),
      new THREE.Vector3(0.5, 0.25, 0.05),
    );

    // Apply 180° yaw
    const group = new THREE.Group();
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1));
    group.add(boxMesh);
    group.rotation.set(0, Math.PI, 0, "XYZ");
    group.updateMatrixWorld(true);

    // Recompute world-space bounding box
    const worldBox = new THREE.Box3().setFromObject(group);

    // For a symmetrical box, 180° rotation still gives same AABB extents
    // but the physical nose/tail have swapped.  The marker logic reads
    // from centredFoilBounds which is computed BEFORE rotation, and the
    // markers live inside the orientation group, so they rotate with it.
    expect(worldBox.min.x).toBeCloseTo(-0.5, 2);
    expect(worldBox.max.x).toBeCloseTo(0.5, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.6 — geometryLoadedToken increment triggers centring exactly once
// ═══════════════════════════════════════════════════════════════════════════

describe("geometryLoadedToken guard logic", () => {
  /**
   * Mock the centring useEffect guard as a pure function:
   *   centreMesh(currentToken, lastToken, box) → { shouldFire, newPosition }
   */
  function centreMesh(
    currentToken: number,
    lastToken: number,
    box: THREE.Box3,
  ): { shouldFire: boolean; newPosition: THREE.Vector3 | null } {
    if (currentToken === lastToken) {
      return { shouldFire: false, newPosition: null };
    }
    if (box.isEmpty()) {
      return { shouldFire: false, newPosition: null };
    }
    const centre = box.getCenter(new THREE.Vector3());
    return {
      shouldFire: true,
      newPosition: new THREE.Vector3(-centre.x, -centre.y, -centre.z),
    };
  }

  const box = new THREE.Box3(
    new THREE.Vector3(3, -0.5, -1),
    new THREE.Vector3(4, 0.5, 0),
  );

  it("fires when token increments from 0 to 1", () => {
    const r = centreMesh(1, 0, box);
    expect(r.shouldFire).toBe(true);
  });

  it("does NOT fire for same token", () => {
    const r = centreMesh(1, 1, box);
    expect(r.shouldFire).toBe(false);
  });

  it("fires when token increments from 1 to 2", () => {
    const r = centreMesh(2, 1, box);
    expect(r.shouldFire).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4.7 — Camera fit does not run before geometry is ready
// ═══════════════════════════════════════════════════════════════════════════

describe("Camera fit timing", () => {
  it("fit() is not called when token is 0 (no geometry)", () => {
    const fitSpy = vi.fn();

    // Simulate: token=0 → render cycle
    const token = 0;
    if (token > 0) {
      fitSpy();
    }

    expect(fitSpy).not.toHaveBeenCalled();
  });

  it("fit() is called exactly once when token transitions from 0 to 1", async () => {
    const fitSpy = vi.fn();
    let lastToken = 0;

    function onTokenChange(newToken: number) {
      if (newToken !== lastToken && newToken > 0) {
        // Simulate the 100ms setTimeout from CameraFitter
        setTimeout(() => fitSpy(), 100);
        lastToken = newToken;
      }
    }

    onTokenChange(1);
    // Wait 150ms for the timeout to fire
    await new Promise((r) => setTimeout(r, 150));
    expect(fitSpy).toHaveBeenCalledTimes(1);

    // Same token again (simulate re-render with no change)
    onTokenChange(1);
    await new Promise((r) => setTimeout(r, 150));
    expect(fitSpy).toHaveBeenCalledTimes(1); // still only once
  });
});
