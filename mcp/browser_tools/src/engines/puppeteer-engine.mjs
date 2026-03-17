import puppeteer from "puppeteer";
import { executeTaskWithPage } from "../task-executor.mjs";

export async function runPuppeteerTask(input) {
  const browser = await puppeteer.launch({ headless: input.headless });
  try {
    const page = await browser.newPage();
    const result = await executeTaskWithPage(page, input);
    return {
      engine: "puppeteer",
      ...result
    };
  } finally {
    await browser.close();
  }
}
