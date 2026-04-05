/**
 * useVtkRenderer — Low-level hook managing the VTK.js render window lifecycle.
 *
 * Assembles the VTK pipeline manually:
 *  - Direct vtkOpenGLRenderWindow instantiation (no factory) because Vite
 *    pre-bundles Core/RenderWindow and OpenGL/RenderWindow into separate
 *    chunks with isolated VIEW_CONSTRUCTORS maps.
 *  - Geometry profile import to register OpenGL view node constructors
 *    (Renderer, Actor, Camera, Mapper, etc.) in the ViewNodeFactory.
 *  - No interactor.initialize() — it triggers render() before the WebGL
 *    context is ready.  We use setView + setEnabled + bindEvents instead.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// Side-effect import: registers all OpenGL view-node constructors
// (vtkRenderer → OpenGLRenderer, vtkActor → OpenGLActor, etc.)
// in the shared ViewNodeFactory CLASS_MAPPING.  Without this, the
// scene graph cannot create child nodes and traverseAllPasses crashes.
import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkRenderWindow from "@kitware/vtk.js/Rendering/Core/RenderWindow";
import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import vtkAxesActor from "@kitware/vtk.js/Rendering/Core/AxesActor";
import vtkOrientationMarkerWidget from "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget";
import vtkLight from "@kitware/vtk.js/Rendering/Core/Light";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface VtkContext {
  renderer: any;
  renderWindow: any;
  openGLRenderWindow: any;
  interactor: any;
  orientationWidget: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useVtkRenderer(
  containerRef: RefObject<HTMLDivElement | null>,
): {
  contextRef: RefObject<VtkContext | null>;
  contextReady: boolean;
} {
  const contextRef = useRef<VtkContext | null>(null);
  const [contextReady, setContextReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Guard: clear stale DOM children from StrictMode double-invoke.
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // ── 1. Core RenderWindow + Renderer ──────────────────────────
    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({
      background: [0.05, 0.05, 0.07],
    });
    renderer.setTwoSidedLighting(true);
    renderWindow.addRenderer(renderer);

    // ── 1b. Lights — explicit headlight + fill so the foil reads as 3D ─
    const headLight = vtkLight.newInstance({
      lightType: "HeadLight",
      color: [1, 1, 1],
      intensity: 0.85,
    });
    renderer.addLight(headLight);

    const fillLight = vtkLight.newInstance({
      lightType: "SceneLight",
      color: [0.65, 0.75, 0.9],
      intensity: 0.35,
      position: [-1, 2, 1],
    });
    renderer.addLight(fillLight);

    // ── 2. OpenGL view (direct instantiation — no factory) ───────
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    openGLRenderWindow.setContainer(container);
    renderWindow.addView(openGLRenderWindow);

    const { clientWidth, clientHeight } = container;
    openGLRenderWindow.setSize(
      clientWidth > 0 ? clientWidth : 300,
      clientHeight > 0 ? clientHeight : 150,
    );

    // ── 3. Interactor ────────────────────────────────────────────
    //  We skip interactor.initialize() because it calls render()
    //  before the WebGL context is ready.  Instead we manually:
    //    • setView  → connects interactor to the OpenGL view AND
    //                 calls openGLRW.getRenderable().setInteractor()
    //    • setEnabled(true) → marks it as active
    //    • bindEvents  → hooks up mouse/touch/keyboard
    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setInteractorStyle(
      vtkInteractorStyleTrackballCamera.newInstance(),
    );
    interactor.setView(openGLRenderWindow);
    interactor.setEnabled(true);
    interactor.bindEvents(container);

    // ── 4. Orientation marker ────────────────────────────────────
    const axes = vtkAxesActor.newInstance();
    const orientationWidget = vtkOrientationMarkerWidget.newInstance({
      actor: axes,
      interactor,
    });
    orientationWidget.setEnabled(true);
    orientationWidget.setViewportCorner(
      vtkOrientationMarkerWidget.Corners.BOTTOM_RIGHT,
    );
    orientationWidget.setViewportSize(0.15);
    orientationWidget.setMinPixelSize(80);

    // ── 5. Store context ─────────────────────────────────────────
    contextRef.current = {
      renderer,
      renderWindow,
      openGLRenderWindow,
      interactor,
      orientationWidget,
    };

    // Safe first render — pipeline is fully wired now.
    renderWindow.render();
    requestAnimationFrame(() => setContextReady(true));

    // ── 6. Responsive resize ─────────────────────────────────────
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          openGLRenderWindow.setSize(
            Math.floor(width * dpr),
            Math.floor(height * dpr),
          );
          renderWindow.render();
        }
      }
    });
    resizeObserver.observe(container);

    // ── 7. Cleanup ───────────────────────────────────────────────
    return () => {
      resizeObserver.disconnect();
      orientationWidget.setEnabled(false);
      interactor.unbindEvents();
      openGLRenderWindow.delete();
      renderWindow.delete();
      contextRef.current = null;
      setContextReady(false);
    };
  }, [containerRef]); // containerRef is stable and the only dependency

  return { contextRef, contextReady };
}
