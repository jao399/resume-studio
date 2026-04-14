const { test, expect } = require("@playwright/test");

test.use({
  channel: "msedge",
  viewport: { width: 1440, height: 1100 }
});

const BASE_URL = process.env.RESUME_VERIFY_URL || "http://127.0.0.1:4176/index.html";

const QUALITY_SECTION_TITLES = [
  "Overall Scores",
  "Top Problems",
  "Strongest Points",
  "Weak Bullets",
  "Generic Wording Issues",
  "Duplicate / Redundant Skills",
  "Missing Metrics",
  "ATS Match Review",
  "Recruiter Impression",
  "Rewritten Suggestions"
];

async function collectPanelText(locator) {
  const text = await locator.innerText();
  return text.replace(/\s+/g, " ").trim();
}

test("quality and ATS analysis render correctly in the restored live editor", async ({ page }) => {
  const runtime = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: []
  };

  page.on("pageerror", (error) => {
    runtime.pageErrors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtime.consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    runtime.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || "failed"}`);
  });

  await page.goto(`${BASE_URL}#quality`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const editorSidebar = page.locator("#editorSidebar");
  const previewRoot = page.locator("#resume");

  await expect(editorSidebar).toBeVisible();
  await expect(previewRoot).toHaveCount(1);
  await expect(editorSidebar.getByRole("heading", { name: "Quality Checks" })).toBeVisible();

  const qualityPanel = editorSidebar.locator(".editor-quality");
  await expect(qualityPanel).toBeVisible();

  for (const title of QUALITY_SECTION_TITLES) {
    await expect(qualityPanel.getByRole("heading", { name: title })).toBeVisible();
  }

  const qualityText = await collectPanelText(qualityPanel);
  expect(qualityText).not.toContain("undefined");
  expect(qualityText).not.toContain("null");

  const rewrittenSection = qualityPanel.locator(".editor-ats__section", {
    has: page.getByRole("heading", { name: "Rewritten Suggestions" })
  });
  await expect(rewrittenSection).toBeVisible();

  const rewrittenButtons = rewrittenSection.getByRole("button");
  const rewrittenButtonLabels = await rewrittenButtons.allTextContents();
  expect(rewrittenButtonLabels.length).toBeGreaterThan(0);
  expect(rewrittenButtonLabels.every((label) => /open/i.test(label))).toBeTruthy();
  expect(rewrittenButtonLabels.some((label) => /apply|regenerate|rewrite/i.test(label))).toBeFalsy();

  await expect(previewRoot.getByText("Overall Scores")).toHaveCount(0);

  await qualityPanel.getByRole("button", { name: "Open exact item" }).first().click();
  await page.waitForTimeout(300);
  await expect(previewRoot.locator(".is-quality-highlight")).toHaveCount(1);
  await expect(previewRoot.locator(".is-quality-highlight-text")).not.toHaveCount(0);

  await editorSidebar.getByRole("button", { name: "ATS Helper" }).click();
  await page.waitForTimeout(300);

  const atsPanel = editorSidebar.locator(".editor-ats");
  await expect(editorSidebar.locator(".editor-section__title", { hasText: "ATS Helper" })).toBeVisible();
  await expect(atsPanel).toBeVisible();

  const atsBaselineText = await collectPanelText(atsPanel);
  expect(atsBaselineText).toContain("Baseline ATS Readiness");
  expect(atsBaselineText).toContain("Paste a job description");
  await expect(atsPanel.getByRole("heading", { name: "Baseline ATS Review" })).toBeVisible();
  await expect(atsPanel.getByRole("heading", { name: "Detected hard skills" })).toBeVisible();

  const jdInput = editorSidebar.locator('[data-editor-section="ats"] textarea').first();
  await jdInput.fill(`Junior Cybersecurity Analyst

Required:
- Splunk or SIEM monitoring
- Incident response
- Log analysis
- Network security
- Python

Preferred:
- Azure fundamentals
- Wireshark
- Technical documentation

Soft skills:
- Communication
- Teamwork
`);

  await page.waitForTimeout(600);

  await expect(atsPanel.getByRole("heading", { name: "Job description signals" })).toBeVisible();
  await expect(atsPanel.getByRole("heading", { name: "Required hard skills" })).toBeVisible();
  await expect(atsPanel.getByRole("heading", { name: "Preferred skills" })).toBeVisible();
  await expect(atsPanel.getByRole("heading", { name: "Soft skills" })).toBeVisible();
  await expect(atsPanel.getByRole("heading", { name: "Evidence strength" })).toBeVisible();

  const atsText = await collectPanelText(atsPanel);
  expect(atsText).not.toContain("undefined");
  expect(atsText).not.toContain("null");
  expect(atsText).toContain("Splunk");
  expect(atsText).toContain("Azure");
  expect(atsText).toContain("Communication");

  const atsScoreSection = atsPanel.locator(".editor-ats__section", {
    has: page.getByRole("heading", { name: "Match score" })
  });
  await expect(atsScoreSection).toBeVisible();
  await expect(atsScoreSection.getByText("ATS Match Score")).toBeVisible();
  await expect(atsScoreSection.getByText("Recruiter Impact Score")).toBeVisible();
  await expect(atsScoreSection.getByText("Writing Strength Score")).toBeVisible();
  await expect(atsScoreSection.getByText("Evidence / Metrics Score")).toBeVisible();
  await expect(atsScoreSection.getByText("Role Relevance Score")).toBeVisible();

  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.requestFailures).toEqual([]);
});
