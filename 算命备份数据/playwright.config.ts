import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./tests",
  tsconfig: path.join(__dirname, "tsconfig.json"),
  outputDir: path.join(__dirname, "新测试结果", "回归"),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:3100", localStorage: [{ name: "fortune:reading-mode", value: "demo" }] }] },
    ...devices["Desktop Edge"], channel: "msedge", baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure"
  },
  webServer: {
    cwd: projectRoot,
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: { OPENAI_API_KEY: "" },
    url: "http://127.0.0.1:3100", reuseExistingServer: !process.env.CI, timeout: 120_000
  }
});
