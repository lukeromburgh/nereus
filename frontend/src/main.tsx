import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import RunComparisonPage from "./pages/RunComparisonPage";
import { BrowserRouter, Routes, Route } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/comparison" element={<RunComparisonPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
