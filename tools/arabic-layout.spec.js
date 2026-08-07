const { test, expect } = require("@playwright/test");

test.use({
  channel: "msedge",
  viewport: { width: 1440, height: 1100 }
});

const BASE_URL = process.env.RESUME_VERIFY_URL || "http://127.0.0.1:4176/index.html";
const ARABIC_URL = BASE_URL.replace("index.html", "arabic.html");

test("Arabic default preset uses Arial", async ({ page }) => {
  await page.goto(ARABIC_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).toHaveAttribute("data-style-preset", "default");
  await expect(page.locator("body")).toHaveCSS("font-family", "Arial, Helvetica, sans-serif");
});

test("English print pagination preserves a physical 8 mm bottom boundary", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.__resumePrepareForPrint());

  const layout = await page.evaluate(() => {
    const ruler = document.createElement("div");
    ruler.style.cssText = "position:fixed;visibility:hidden;width:8mm;height:1px";
    document.body.appendChild(ruler);
    const eightMillimeters = ruler.getBoundingClientRect().width;
    ruler.remove();

    const reserves = Array.from(document.querySelectorAll(".sheet")).map((sheet) => {
      const body = sheet.querySelector(".sheet__body");
      return sheet.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
    });
    return { eightMillimeters, reserves };
  });

  for (const reserve of layout.reserves) {
    expect(reserve).toBeGreaterThanOrEqual(layout.eightMillimeters - 1);
  }
});

test("Arabic print pagination preserves a physical 8 mm bottom boundary", async ({ page }) => {
  await page.goto(ARABIC_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const stressData = await page.evaluate(() => {
    const data = JSON.parse(JSON.stringify(window.resumeData));
    const sourceItem = data.professionalExperience[0];
    data.professionalExperience = Array.from({ length: 14 }, (_, index) => ({
      ...sourceItem,
      date: `202${index} - 202${index + 1}`,
      organization: `جهة اختبار الطباعة ${index + 1}`,
      bullets: [
        ...sourceItem.bullets,
        `سطر تحقق إضافي لاختبار انتقال السجل الكامل إلى الصفحة التالية ${index + 1}.`
      ]
    }));
    return data;
  });

  await page.locator("#importDataInput").setInputFiles({
    name: "arabic-pagination-stress.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(stressData))
  });
  await expect(page.locator('[data-preview-section="professionalExperience"][data-preview-kind="timeline-item"]')).toHaveCount(14);

  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.__resumePrepareForPrint());

  const layout = await page.evaluate(() => {
    const ruler = document.createElement("div");
    ruler.style.cssText = "position:fixed;visibility:hidden;width:8mm;height:1px";
    document.body.appendChild(ruler);
    const eightMillimeters = ruler.getBoundingClientRect().width;
    ruler.remove();

    const pages = Array.from(document.querySelectorAll(".sheet")).map((sheet) => {
      const body = sheet.querySelector(".sheet__body");
      const sheetRect = sheet.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const childBottoms = Array.from(body.children).map((child) => child.getBoundingClientRect().bottom);
      return {
        reserve: sheetRect.bottom - bodyRect.bottom,
        overflow: body.scrollHeight - body.clientHeight,
        maxChildOverflow: childBottoms.length ? Math.max(...childBottoms) - bodyRect.bottom : 0,
        orphanedHeading: body.lastElementChild?.dataset.keepWithNext === "true"
      };
    });

    return { eightMillimeters, pages };
  });

  expect(layout.pages.length).toBeGreaterThan(2);
  for (const printedPage of layout.pages) {
    expect(printedPage.reserve).toBeGreaterThanOrEqual(layout.eightMillimeters - 1);
    expect(printedPage.overflow).toBeLessThanOrEqual(1);
    expect(printedPage.maxChildOverflow).toBeLessThanOrEqual(1);
    expect(printedPage.orphanedHeading).toBeFalsy();
  }

  await expect(page.getByText("جهة اختبار الطباعة 14", { exact: true })).toHaveCount(1);
});

async function getTimelineStyles(item) {
  return item.evaluate((node) => {
    const style = getComputedStyle(node);
    const meta = node.querySelector(".timeline-item__meta");
    const content = node.querySelector(".timeline-item__content");
    const metaStyle = getComputedStyle(meta);
    const contentStyle = getComputedStyle(content);
    const itemWidth = node.getBoundingClientRect().width;
    const metaWidth = meta.getBoundingClientRect().width;

    return {
      display: style.display,
      backgroundColor: style.backgroundColor,
      borderTopStyle: style.borderTopStyle,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      metaRatio: metaWidth / itemWidth,
      metaBackground: metaStyle.backgroundColor,
      metaBorder: metaStyle.borderTopStyle,
      metaPadding: [metaStyle.paddingTop, metaStyle.paddingRight, metaStyle.paddingBottom, metaStyle.paddingLeft],
      contentBackground: contentStyle.backgroundColor,
      contentBorder: contentStyle.borderTopStyle,
      contentPadding: [contentStyle.paddingTop, contentStyle.paddingRight, contentStyle.paddingBottom, contentStyle.paddingLeft]
    };
  });
}

test("Arabic timeline uses an invisible RTL alignment grid", async ({ page }) => {
  await page.goto(ARABIC_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const item = page.locator("#resume .timeline-item").first();
  await expect(item).toBeVisible();

  const styles = await getTimelineStyles(item);
  expect(styles.display).toBe("grid");
  expect(styles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(styles.borderTopStyle).toBe("none");
  expect(styles.borderRadius).toBe("0px");
  expect(styles.boxShadow).toBe("none");
  expect(styles.padding).toEqual(["0px", "0px", "0px", "0px"]);
  expect(styles.metaRatio).toBeGreaterThanOrEqual(0.22);
  expect(styles.metaRatio).toBeLessThanOrEqual(0.26);
  expect(styles.metaBackground).toBe("rgba(0, 0, 0, 0)");
  expect(styles.metaBorder).toBe("none");
  expect(styles.metaPadding).toEqual(["0px", "0px", "0px", "0px"]);
  expect(styles.contentBackground).toBe("rgba(0, 0, 0, 0)");
  expect(styles.contentBorder).toBe("none");
  expect(styles.contentPadding).toEqual(["0px", "0px", "0px", "0px"]);

  await item.hover();
  const hoverStyles = await getTimelineStyles(item);
  expect(hoverStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(hoverStyles.boxShadow).toBe("none");

  const certificate = page.locator("#resume .certificate-card").first();
  await expect(certificate).toBeVisible();
  await expect(certificate).not.toHaveCSS("border-top-style", "none");
});
