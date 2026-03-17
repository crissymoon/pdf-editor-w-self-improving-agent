import { chromium } from "playwright";
import { executeTaskWithPage } from "../task-executor.mjs";

export async function runPlaywrightTask(input) {
  const browser = await chromium.launch({ headless: input.headless });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await executeTaskWithPage(page, input);
    await context.close();
    return {
      engine: "playwright",
      ...result
    };
  } finally {
    await browser.close();
  }
}
