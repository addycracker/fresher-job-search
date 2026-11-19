// Opt-in, read-only smoke test against locally running API and web servers.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.BROWSER_TEST_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
const transportErrors = [];
let encryptedCalls = 0;
page.on("request", (request) => {
  const url = new URL(request.url());
  if (
    url.pathname !== "/api/v1/jobs" &&
    !url.pathname.startsWith("/api/v1/jobs/")
  )
    return;
  const headers = request.headers();
  encryptedCalls++;
  if (
    url.search ||
    !headers["x-api-key"] ||
    !headers["x-encrypted-key"] ||
    !headers["x-encrypted-payload"]
  )
    transportErrors.push("Missing encryption headers or exposed query");
});
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("artifacts", { recursive: true });
async function checkAccessibility(label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
    [],
    `${label} accessibility violations`,
  );
}
try {
  await page.goto(base);
  await page.getByRole("heading", { name: /Your career/ }).waitFor();
  await checkAccessibility("Homepage");
  await page.screenshot({ path: "artifacts/home-desktop.png", fullPage: true });
  await page.goto(base + "/jobs");
  await page.locator(".results-grid .job-card").first().waitFor();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.waitForURL(/page=2/);
  await page.locator('.results-section[aria-busy="false"]').waitFor();
  await page
    .locator(".desktop-filters")
    .getByRole("radio", { name: "Internship", exact: true })
    .click();
  await page.waitForURL(/employmentType=internship/);
  await page.locator(".results-grid .job-card").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.has("page"), false);
  await page
    .getByLabel("Search by title, skill or keyword")
    .fill("zzzz-no-matching-opportunity-zzzz");
  await page.waitForURL(/q=zzzz/);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.locator(".results-grid .job-card").first().waitFor();
  await page.screenshot({ path: "artifacts/jobs-desktop.png", fullPage: true });
  await checkAccessibility("Job listing");
  await page.locator(".results-grid .job-card").first().click();
  await page.locator(".detail-heading h1").waitFor();
  const apply = page.locator('.apply-card a[target="_blank"]').first();
  if (await apply.count()) {
    assert.match(await apply.getAttribute("href"), /^https?:\/\//);
    assert.match(await apply.getAttribute("rel"), /noopener/);
  }
  await page.screenshot({ path: "artifacts/job-detail.png", fullPage: true });
  await checkAccessibility("Job details");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("heading", { name: /Your career/ }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Homepage overflows mobile viewport",
  );
  await page.screenshot({ path: "artifacts/home-mobile.png", fullPage: true });
  await page.goto(base + "/jobs");
  await page.locator(".results-grid .job-card").first().waitFor();
  await page.locator(".mobile-filter-button").click();
  await page.getByRole("dialog").waitFor();
  await checkAccessibility("Mobile filter drawer");
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Remote / virtual" })
    .click();
  await page.waitForURL(/workMode=remote/);
  await page.getByRole("button", { name: "Show opportunities" }).click();
  await page.locator(".results-grid .job-card").first().waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Jobs page overflows mobile viewport",
  );
  await page.screenshot({ path: "artifacts/jobs-mobile.png", fullPage: true });
  await checkAccessibility("Mobile listing");
  await page.route("**/api/v1/jobs", (route) => route.abort());
  await page.goto(base + "/jobs");
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again" })
    .waitFor();
  await page.unroute("**/api/v1/jobs");
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again" })
    .click();
  await page.locator(".results-grid .job-card").first().waitFor();
  assert.deepEqual(errors, [], "Unexpected browser/hydration errors");
  assert.ok(encryptedCalls > 0);
  assert.deepEqual(transportErrors, []);
  console.log(
    "Browser smoke passed: navigation, pagination, debounced search, empty/reset, details, mobile drawer, overflow and hydration.",
  );
} finally {
  await browser.close();
}
