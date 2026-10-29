import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The smoke spec runs against the real API with a throwaway agents directory.
const agentsDir = mkdtempSync(join(tmpdir(), "agents-e2e-"));

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5180", viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: "uv run --directory ../backend uvicorn api.app:app --port 8100",
      url: "http://localhost:8100/api/agents",
      env: { AGENTS_DIR: agentsDir },
      reuseExistingServer: false,
    },
    {
      command: "npx vite --port 5180 --strictPort",
      env: { API_URL: "http://localhost:8100" },
      url: "http://localhost:5180",
      reuseExistingServer: false,
    },
  ],
});
