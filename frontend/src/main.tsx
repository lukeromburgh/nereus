import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppShell from "./components/AppShell";
import SimulationPage from "./App";
import AssetManagerPage from "./pages/AssetManagerPage";
import RunComparisonPage from "./pages/RunComparisonPage";
import { BrowserRouter, Routes, Route } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<SimulationPage />} />
          <Route path="/assets" element={<AssetManagerPage />} />
          <Route path="/comparison" element={<RunComparisonPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
