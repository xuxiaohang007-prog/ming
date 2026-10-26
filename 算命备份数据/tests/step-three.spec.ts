import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { toTimeIndex } from "../../lib/birth-options";
import { normalizeBirthInput } from "../../lib/birth-normalizer";

const base = { name: "测试档案", gender: "女" as const, birthPlace: "", calendar: "solar" as const, birthDate: "2000-08-16", birthTime: "03:00", isLeapMonth: false };

async function fillBase(page: Page) {
  await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00");
}

test("all 1440 minutes follow the specified thirteen time intervals", () => {
  // Independent interval fixtures from the development plan, not TIME_PERIODS.
  const intervals = [[0, 59], [60, 179], [180, 299], [300, 419], [420, 539], [540, 659], [660, 779], [780, 899], [900, 1019], [1020, 1139], [1140, 1259], [1260, 1379], [1380, 1439]];
  intervals.forEach(([start, end], expectedIndex) => {
    for (let minute = start; minute <= end; minute++) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      expect(toTimeIndex(time), time).toBe(expectedIndex);
    }
  });
  for (const invalid of ["", "24:00", "12:60", "-1:00", "3:00", "03:00:00", "abc"]) expect(() => toTimeIndex(invalid)).toThrow();
});

test("normalization preserves the original date and time without pre-shifting late Zi", () => {
  const exact = normalizeBirthInput({ ...base, birthTime: "23:59" });
  expect(exact.birthInput).toMatchObject({ originalDate: "2000-08-16", originalTime: "23:59", solarDate: "2000-8-16", timeIndex: 12, timeMode: "exact", timezone: "UTC+08:00", dayDivide: "forward", fixLeap: true });
  const period = normalizeBirthInput({ ...base, birthTime: "", birthTimeMode: "period", birthTimePeriod: "0" });
  expect(period.birthInput).toMatchObject({ originalTime: null, originalTimePeriod: "0", timeIndex: 0, timeMode: "period", timeLabel: "早子时" });
  expect(period.form.birthTime).toBe("");
  const lunar = normalizeBirthInput({ ...base, calendar: "lunar", birthDate: "2023-02-01", isLeapMonth: true });
  expect(lunar.birthInput).toMatchObject({ originalDate: "2023-02-01", solarDate: "2023-3-22", isLeapMonth: true });
});

test("Gregorian leap rules and actual lunar month lengths return field errors", async ({ request }) => {
  const invalid = [
    { birthDate: "1899-12-31" }, { birthDate: "2101-1-1" },
    { birthDate: "1900-2-29" }, { birthDate: "2100-2-29" }, { birthDate: "2000-4-31" },
    { calendar: "lunar", birthDate: "2023-2-30", isLeapMonth: true },
    { calendar: "lunar", birthDate: "2023-1-31" }
  ];
  for (const overrides of invalid) {
    const result = await request.post("/api/chart/generate", { data: { ...base, ...overrides } });
    expect(result.status(), JSON.stringify(overrides)).toBe(400);
    expect((await result.json()).fieldErrors.birthDate).toBeTruthy();
  }
  for (const birthDate of ["1900-1-1", "2000-2-29", "2100-12-31"]) {
    const result = await request.post("/api/chart/generate", { data: { ...base, birthDate } });
    expect(result.status(), birthDate).toBe(200);
  }
  const leap = await request.post("/api/chart/generate", { data: { ...base, calendar: "lunar", birthDate: "2023-2-29", isLeapMonth: true } });
  expect(leap.status()).toBe(200);
  expect((await leap.json()).solarDate).toBe("2023-4-19");
});

test("invalid lunar leap selections are rejected before iztro can ignore them", async ({ request }) => {
  for (const birthDate of ["2024-1-1", "2023-3-1", "2000-7-17"]) {
    const result = await request.post("/api/chart/generate", { data: { ...base, calendar: "lunar", birthDate, isLeapMonth: true } });
    expect(result.status()).toBe(400);
    expect((await result.json()).fieldErrors.isLeapMonth).toBeTruthy();
  }
  const solar = await request.post("/api/chart/generate", { data: { ...base, isLeapMonth: true } });
  expect(solar.status()).toBe(400); expect((await solar.json()).fieldErrors.isLeapMonth).toBeTruthy();
});

test("all thirteen selected periods produce the same palaces as their exact start time", async ({ request }) => {
  const starts = ["00:00", "01:00", "03:00", "05:00", "07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00", "23:00"];
  for (let index = 0; index < starts.length; index++) {
    const exact = await request.post("/api/chart/generate", { data: { ...base, birthTime: starts[index] } });
    const period = await request.post("/api/chart/generate", { data: { ...base, birthTime: "", birthTimeMode: "period", birthTimePeriod: String(index) } });
    expect(exact.status()).toBe(200); expect(period.status()).toBe(200);
    const exactChart = await exact.json(); const periodChart = await period.json();
    expect(periodChart.palaces).toEqual(exactChart.palaces);
    expect(periodChart.birthInput).toMatchObject({ timeIndex: index, originalTime: null, timeMode: "period" });
  }
});

test("unknown, conflicting or malformed time submissions cannot bypass the API", async ({ request }) => {
  for (const overrides of [
    { birthTimeMode: "unknown" }, { birthTime: "24:00" }, { birthTime: "12:60" },
    { birthTime: "", birthTimeMode: "period", birthTimePeriod: "" },
    { birthTime: "", birthTimeMode: "period", birthTimePeriod: "13" },
    { birthTimeMode: "period", birthTimePeriod: "2" },
    { birthTimeMode: "exact", birthTimePeriod: "2" }
  ]) {
    const result = await request.post("/api/chart/generate", { data: { ...base, ...overrides } });
    expect(result.status(), JSON.stringify(overrides)).toBe(400);
  }
  const report = await request.post("/api/chart/interpret", { data: { form: { ...base, birthTimeMode: "unknown" } } });
  expect(report.status()).toBe(400);
  const optional = await request.post("/api/chart/generate", { data: { gender: "男", calendar: "solar", birthDate: "2000-8-16", birthTime: "03:00" } });
  expect(optional.status()).toBe(200);
  expect((await optional.json()).form).toMatchObject({ name: "", birthPlace: "", isLeapMonth: false });
});

test("lunar validation happens in the browser before a generation request", async ({ page }) => {
  let generated = 0;
  page.on("request", (request) => { if (request.url().includes("/api/chart/generate")) generated++; });
  await page.goto("/"); await fillBase(page);
  await page.getByRole("radio", { name: "农历", exact: true }).check();
  await page.getByLabel("农历出生日期").fill("2023-2-30");
  await page.getByLabel("出生于农历闰月", { exact: true }).check();
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "29 天" })).toBeVisible();
  expect(generated).toBe(0);
  await page.screenshot({ path: test.info().outputPath("lunar-validation-desktop.png"), fullPage: true });
  await page.getByLabel("农历出生日期").fill("2023-2-29");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "命主的紫微命盘" })).toBeVisible();
  expect(generated).toBe(1);
});

test("time modes preserve other fields and do not invent a minute for period input", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/"); await fillBase(page);
  await page.getByRole("radio", { name: "时间未知", exact: true }).check();
  await expect(page.getByRole("button", { name: "补充出生时间后生成" })).toBeDisabled();
  await expect(page.getByLabel("公历出生日期")).toHaveValue("2000-08-16");
  await page.screenshot({ path: test.info().outputPath("unknown-time-mobile.png"), fullPage: true });
  await page.getByRole("radio", { name: "只知时辰", exact: true }).check();
  await page.getByLabel("出生时辰", { exact: true }).selectOption("12");
  await expect(page.getByRole("status").filter({ hasText: "晚子" })).toContainText("不会手动加一天");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("period-input-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "命主的紫微命盘" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "时辰范围，未推定分钟" })).toBeVisible();
  await page.getByRole("button", { name: "修改出生信息" }).click();
  await expect(page.getByRole("radio", { name: "只知时辰" })).toBeChecked();
  await expect(page.getByLabel("出生时辰", { exact: true })).toHaveValue("12");
  await page.getByRole("radio", { name: "准确时间", exact: true }).check();
  await expect(page.getByLabel("出生时间", { exact: true })).toHaveValue("");
});

test("server field validation is displayed beside the corresponding input", async ({ page }) => {
  await page.goto("/"); await fillBase(page);
  await page.route("**/api/chart/generate", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "请核对出生日期", fieldErrors: { birthDate: "服务端日期校验提示" } }) }), { times: 1 });
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByLabel("公历出生日期")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("公历出生日期")).toBeFocused();
  await expect(page.locator("#birthDate-error")).toHaveText("服务端日期校验提示");
});
