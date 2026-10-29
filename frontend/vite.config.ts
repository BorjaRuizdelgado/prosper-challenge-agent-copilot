/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxy = {
  "/api": "http://localhost:8000",
  "/voice": {
    target: "http://localhost:7860",
    rewrite: (path: string) => path.replace(/^\/voice/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
