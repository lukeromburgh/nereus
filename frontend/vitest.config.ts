import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "../tests/**/*.{test,spec}.ts",
      "../tests/**/test_*.ts",
    ],
    environment: "node",
  },
});