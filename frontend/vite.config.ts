import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  build: {
    // Split VTK.js into its own async chunk so it is only fetched when the
    // simulation page (or any page using the VTK viewport) is reached, rather
    // than blocking the initial bundle load.
    rollupOptions: {
      output: {
        manualChunks: {
          vtk: ["@kitware/vtk.js"],
          vendor: ["react", "react-dom", "react-router-dom", "zustand"],
        },
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle vtk.js sub-paths so CJS deps (globalthis, etc.) get
    // converted to ESM.  The Geometry profile registers all OpenGL view-node
    // constructors in the shared ViewNodeFactory.
    include: [
      "@kitware/vtk.js/Rendering/Profiles/Geometry",
      "@kitware/vtk.js/Rendering/Core/Renderer",
      "@kitware/vtk.js/Rendering/Core/RenderWindow",
      "@kitware/vtk.js/Rendering/OpenGL/RenderWindow",
      "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor",
      "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera",
      "@kitware/vtk.js/Rendering/Core/AxesActor",
      "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget",
      "@kitware/vtk.js/IO/XML/XMLPolyDataReader",
      "@kitware/vtk.js/IO/Geometry/STLReader",
      "@kitware/vtk.js/Rendering/Core/Mapper",
      "@kitware/vtk.js/Rendering/Core/Actor",
      "@kitware/vtk.js/Rendering/Core/ColorTransferFunction",
      "@kitware/vtk.js/Filters/Sources/PlaneSource",
      "@kitware/vtk.js/Filters/Sources/ArrowSource",
      "@kitware/vtk.js/Filters/Sources/ConeSource",
      "@kitware/vtk.js/Filters/General/TubeFilter",
      "@kitware/vtk.js/Rendering/Core/Light",
      "@kitware/vtk.js/Common/Core/DataArray",
    ],
  },
  test: {
    // Allow tests to live outside src/ (e.g. ../tests/)
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "../tests/**/*.{test,spec}.ts",
      "../tests/**/test_*.ts",
    ],
    environment: "node",
  },
});
