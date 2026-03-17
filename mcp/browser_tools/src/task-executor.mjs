export async function executeTaskWithPage(page, input) {
  const outputs = {};

  await page.goto(input.url, {
    waitUntil: mapWaitUntil(input.waitUntil),
    timeout: input.timeoutMs
  });

  for (const action of input.actions) {
    switch (action.type) {
      case "wait_for_selector":
        requireSelector(action);
        await page.waitForSelector(action.selector, { timeout: input.timeoutMs });
        break;
      case "click":
        requireSelector(action);
        await page.click(action.selector);
        break;
      case "type":
        requireSelector(action);
        await page.fill?.(action.selector, action.text ?? "");
        if (!page.fill) {
          await page.click(action.selector, { clickCount: 3 });
          await page.type(action.selector, action.text ?? "");
        }
        break;
      case "extract_text":
        requireSelector(action);
        outputs[action.as || action.selector] = await extractText(page, action.selector);
        break;
      case "wait_for_timeout":
        await waitTimeout(page, action.ms || 0);
        break;
      case "screenshot": {
        const screenshotPath = action.path || input.outputPath;
        if (!screenshotPath) {
          throw new Error("screenshot action requires action.path or output_path.");
        }
        await takeScreenshot(page, screenshotPath, action.fullPage);
        outputs[action.as || "screenshot_path"] = screenshotPath;
        break;
      }
      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  const title = await page.title();
  const finalUrl = page.url();

  return {
    ok: true,
    engineData: outputs,
    title,
    url: finalUrl,
    actionCount: input.actions.length,
    timestamp: new Date().toISOString()
  };
}

function mapWaitUntil(waitUntil) {
  if (waitUntil === "domcontentloaded") {
    return "domcontentloaded";
  }

  if (waitUntil === "networkidle") {
    return "networkidle";
  }

  return "load";
}

function requireSelector(action) {
  if (!action.selector) {
    throw new Error(`Action ${action.type} requires selector.`);
  }
}

async function extractText(page, selector) {
  const text = await page.textContent?.(selector);
  if (typeof text === "string") {
    return text.trim();
  }

  return await page.$eval(selector, (el) => (el.textContent || "").trim());
}

async function waitTimeout(page, ms) {
  if (page.waitForTimeout) {
    await page.waitForTimeout(ms);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot(page, screenshotPath, fullPage) {
  await page.screenshot({
    path: screenshotPath,
    fullPage: Boolean(fullPage)
  });
}
