import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
