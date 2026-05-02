import React, { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppShell from "./components/AppShell";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import { AuthProvider, RequireAuth } from "./lib/auth";

// Lazy-loaded route pages — each is a heavy subtree (VTK viewport, drag-and-drop
// tree, dual-viewport comparison). Loading them on demand instead of eagerly
// reduces the initial JS bundle by roughly the combined size of all three pages,
// and prevents blocking the browser during the first paint.
const SimulationPage = React.lazy(() => import("./App"));
const AssetManagerPage = React.lazy(() => import("./pages/AssetManagerPage"));
const RunComparisonPage = React.lazy(() => import("./pages/RunComparisonPage"));

// Minimal fallback — avoids layout shift while the async chunk loads.
// AppShell itself is kept synchronously because the shell layout (navbar,
// sidebar) must be present for first paint.
const PageFallback = () => (
  <div className="flex h-screen items-center justify-center bg-nereus-base">
    <div className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent" style={{ borderRadius: '2px' }} />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route
              path="/"
              element={
                <Suspense fallback={<PageFallback />}>
                  <SimulationPage />
                </Suspense>
              }
            />
            <Route
              path="/assets"
              element={
                <Suspense fallback={<PageFallback />}>
                  <AssetManagerPage />
                </Suspense>
              }
            />
            <Route
              path="/comparison"
              element={
                <Suspense fallback={<PageFallback />}>
                  <RunComparisonPage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
