import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import fixture from "./fixtures/ziwei-standard.json";

test.use({ storageState: { cookies: [], origins: [] } });
const localRequire = createRequire(path.resolve("package.json"));

test("security migration is reproducibly locked and keeps the calculation engine unchanged", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  for (const [name, version] of Object.entries({ next: "16.4.0", tailwindcss: "4.3.3", "@tailwindcss/postcss": "4.3.3", iztro: "2.6.1", "lunar-typescript": "1.8.6" })) {
    expect(lock.packages[`node_modules/${name}`].version).toBe(version);
    expect(JSON.parse(readFileSync(path.join("node_modules", name, "package.json"), "utf8")).version).toBe(version);
  }
  for (const name of ["braces", "chokidar", "micromatch", "fast-glob", "postcss-selector-parser", "postcss-nested", "autoprefixer"]) {
    expect(Object.keys(lock.packages).some((key) => key.endsWith(`node_modules/${name}`))).toBe(false);
  }
  const nextRequire = createRequire(localRequire.resolve("next/package.json"));
  const postcss = nextRequire("postcss/package.json").version.split(".").map(Number);
  expect(postcss[0]).toBe(8); expect(postcss[1] > 5 || (postcss[1] === 5 && postcss[2] >= 23)).toBe(true);
  expect(manifest.scripts["audit:security"]).toBe("npm audit --audit-level=moderate");
  expect(manifest.scripts.dev).toContain("--webpack"); expect(manifest.scripts.build).toContain("--webpack");
});

for (const [version, allowed] of [["18.20.8", false], ["20.8.1", false], ["20.9.0", true], ["24.14.0", true]] as const) {
  test(`startup Node guard handles ${version} without starting or installing anything`, () => {
    test.skip(process.platform !== "win32", "Windows startup script");
    const command = `function node { $global:LASTEXITCODE = 0; '${version}' }; & './启动系统.ps1' -CheckOnly`;
    // Execution policy is scoped to this disposable test process, never the machine.
    const result = spawnSync(path.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], { encoding: "utf8", timeout: 15_000 });
    expect(result.error).toBeUndefined();
    if (allowed) { expect(result.status).toBe(0); expect(result.stdout).toContain(`Node.js: ${version}`); }
    else { expect(result.status).not.toBe(0); expect(result.stderr).toContain("Node.js 20.9.0 or newer is required"); }
  });
}

test("CSS migration preserves hidden labels, report spacing and centered mobile dialog", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/"); await expect(page.locator("legend.sr-only").first()).toHaveCSS("width", "1px");
  await expect(page.locator("legend.sr-only").first()).toHaveCSS("height", "1px");
  await page.getByLabel("排盘性别").selectOption("女"); await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00"); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await page.getByRole("button", { name: "放大查看命盘", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "放大命盘", exact: true }); const box = await dialog.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 187.5)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - 500)).toBeLessThan(2);
  await page.evaluate(() => document.fonts.ready); await dialog.screenshot({ path: test.info().outputPath("migration-dialog-mobile.png"), animations: "disabled" });
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
  await expect(page.locator(".report-cover h2")).toBeVisible();
  await expect(page.locator(".report-archive .mt-5")).toHaveCSS("margin-top", "20px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".report-cover").screenshot({ path: test.info().outputPath("migration-report-mobile.png"), animations: "disabled" });
});

test("page, real chart and failed interpretation have security headers without private caching", async ({ request }) => {
  const responses = [await request.get("/"), await request.post("/api/chart/generate", { data: fixture.input }), await request.post("/api/chart/interpret", { data: {} })];
  expect(responses.map((response) => response.status())).toEqual([200, 200, 400]);
  for (const response of responses) {
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  }
  responses.slice(1).forEach((response) => expect(response.headers()["cache-control"]).toBe("no-store"));
});
