import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import path from "node:path";

export default defineConfig({
  ...base,
  testMatch: ["step-eleven.spec.ts", "step-thirteen.spec.ts", "step-fourteen.spec.ts", "step-fifteen.spec.ts"],
  outputDir: path.join(__dirname, "新测试结果", "生产"),
  use: { ...base.use, baseURL: "http://127.0.0.1:3000" },
  webServer: undefined
});
