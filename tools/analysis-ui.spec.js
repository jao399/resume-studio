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

test("profile photo upload, crop, persistence, and removal work", async ({ page }) => {
  await page.goto(`${BASE_URL}#profile`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const uploadInput = page.getByTestId("photo-upload-input");
  const chooseButton = page.getByTestId("photo-choose-button");
  await expect(chooseButton).toBeVisible();
  await expect(page.getByText("Image URL or path (optional)")).toBeVisible();

  await uploadInput.setInputFiles({
    name: "oversized.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1)
  });
  await expect(page.getByRole("alert")).toContainText("10 MB or smaller");

  await uploadInput.setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image")
  });
  await expect(page.getByRole("alert")).toContainText("JPEG, PNG, or WebP");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAe2EDksAAAAASUVORK5CYII=",
    "base64"
  );
  await uploadInput.setInputFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: png
  });

  const cropDialog = page.getByTestId("photo-crop-dialog");
  await expect(cropDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crop profile photo" })).toBeVisible();
  await page.getByTestId("photo-zoom-input").fill("1.5");
  const cropStage = page.getByTestId("photo-crop-stage");
  const cropBox = await cropStage.boundingBox();
  expect(cropBox).not.toBeNull();
  await page.mouse.move(cropBox.x + cropBox.width / 2, cropBox.y + cropBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cropBox.x + cropBox.width / 2 + 30, cropBox.y + cropBox.height / 2 + 20);
  await page.mouse.up();
  await page.getByTestId("photo-rotate-right").click();
  await page.getByTestId("photo-reset").click();
  await page.getByTestId("photo-save").click();
  await expect(cropDialog).toHaveCount(0);

  const previewPhoto = page.locator("#resume .hero__photo");
  await expect(previewPhoto).toHaveCount(1);
  const uploadedSource = await previewPhoto.getAttribute("src");
  expect(uploadedSource).toMatch(/^data:image\/jpeg;base64,/);
  const uploadedDimensions = await previewPhoto.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight
  }));
  expect(uploadedDimensions).toEqual({ width: 512, height: 512 });

  const editButton = page.getByTestId("photo-edit-button");
  await editButton.click();
  await expect(cropDialog).toBeVisible();
  await page.getByTestId("photo-zoom-input").fill("2");
  await page.getByTestId("photo-cancel").click();
  await expect(cropDialog).toHaveCount(0);
  await expect(editButton).toBeFocused();
  await expect(previewPhoto).toHaveAttribute("src", uploadedSource);

  await editButton.click();
  await expect(cropDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cropDialog).toHaveCount(0);
  await expect(previewPhoto).toHaveAttribute("src", uploadedSource);

  await page.waitForTimeout(400);
  const storedPhoto = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("resume-editor-draft:en") || "null");
    return draft?.data?.profile?.photo || "";
  });
  expect(storedPhoto).toBe(uploadedSource);

  await page.getByTestId("photo-remove-button").click();
  await expect(previewPhoto).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(previewPhoto).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(previewPhoto).toHaveCount(0);

  await page.goto(BASE_URL.replace("index.html", "arabic.html") + "#profile", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("photo-choose-button")).toHaveText("اختر صورة");
  await expect(page.getByText("رابط أو مسار الصورة (اختياري)")).toBeVisible();
  await page.getByTestId("photo-upload-input").setInputFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: png
  });
  await expect(page.getByTestId("photo-fit")).toHaveText("ملاءمة الصورة كاملة");
  await page.getByTestId("photo-cancel").click();
});

test("photo cropper can fit the complete source image and uses an accurate circular guide", async ({ page }) => {
  await page.goto(`${BASE_URL}#profile`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const wideRedPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAZAAAADICAIAAABJdyC1AAACrklEQVR4nO3UQQ3AIADAQJgG5OBfBWJmgR9pcqegr86z9gAo+F4HANwyLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CADMMCMgwLyDAsIMOwgAzDAjIMC8gwLCDDsIAMwwIyDAvIMCwgw7CAUfEDqMQCvJmTGrAAAAAASUVORK5CYII=",
    "base64"
  );
  await page.getByTestId("photo-upload-input").setInputFiles({
    name: "wide-profile.png",
    mimeType: "image/png",
    buffer: wideRedPng
  });

  const cropDialog = page.getByTestId("photo-crop-dialog");
  const cropStage = page.getByTestId("photo-crop-stage");
  const cropMask = cropDialog.locator(".photo-crop-dialog__mask");
  await expect(cropDialog).toBeVisible();
  await expect(cropDialog).toContainText("Fit whole image");

  const [stageBox, maskBox] = await Promise.all([cropStage.boundingBox(), cropMask.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(maskBox).not.toBeNull();
  expect(Math.abs(maskBox.x - stageBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(maskBox.y - stageBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(maskBox.width - stageBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(maskBox.height - stageBox.height)).toBeLessThanOrEqual(1);

  const zoomInput = page.getByTestId("photo-zoom-input");
  expect(Number(await zoomInput.getAttribute("min"))).toBeCloseTo(0.5, 5);
  await page.getByTestId("photo-fit").click();
  expect(Number(await zoomInput.inputValue())).toBeCloseTo(0.5, 5);
  await page.getByTestId("photo-save").click();

  const previewPhoto = page.locator("#resume .hero__photo");
  await expect(previewPhoto).toBeVisible();
  const samples = await previewPhoto.evaluate((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return {
      topCenter: Array.from(context.getImageData(256, 16, 1, 1).data.slice(0, 3)),
      leftCenter: Array.from(context.getImageData(16, 256, 1, 1).data.slice(0, 3))
    };
  });
  expect(samples.topCenter.every((channel) => channel > 240)).toBeTruthy();
  expect(samples.leftCenter[0]).toBeGreaterThan(180);
  expect(samples.leftCenter[1]).toBeLessThan(80);
  expect(samples.leftCenter[2]).toBeLessThan(100);
});
