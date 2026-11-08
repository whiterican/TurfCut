import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] });
const out = new URL("./", import.meta.url);
const captures = [];
const failures = [];
try {
  for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(t => localStorage.setItem("turfcut-theme", t), theme);
    await page.goto(process.env.PREVIEW_URL || "http://localhost:3018/zz-preview/readable-selects", { timeout: 180000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Object.keys(document.querySelector(".step")).some(k => k.startsWith("__reactProps")));
    for (const [name, step] of [["canvassApp", 3], ["campaignType", 4]]) {
      await page.locator(".step").nth(step).click();
      const select = page.locator(`select[name="${name}"]`);
      await select.waitFor({ state: "visible" });
      const longest = await select.evaluate(s => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = getComputedStyle(s).font;
        return [...s.options].map(o => ({ value: o.value, text: o.text, width: ctx.measureText(o.text).width })).sort((a, b) => b.width - a.width)[0];
      });
      await select.selectOption(longest.value);
      await page.waitForTimeout(100);
      const measurement = await select.evaluate(s => {
        const style = getComputedStyle(s);
        const helper = s.nextElementSibling;
        const rect = s.getBoundingClientRect();
        return {
          value: s.value, text: s.selectedOptions[0].text,
          controlWidth: rect.width, font: style.font,
          available: s.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24,
          helper: helper?.getAttribute("aria-hidden") === "true" ? helper.textContent : null,
          helperOverflow: helper?.getAttribute("aria-hidden") === "true" ? helper.scrollWidth - helper.clientWidth : 0,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          submittedValue: new FormData(s.form).get(s.name),
          required: s.required, invalid: s.getAttribute("aria-invalid"),
          interLoaded: [...document.fonts].some(f => /Inter/i.test(f.family) && f.status === "loaded"),
        };
      });
      assert.equal(measurement.pageOverflow, 0);
      assert.equal(measurement.helperOverflow, 0);
      assert.equal(measurement.submittedValue, longest.value);
      assert.equal(measurement.interLoaded, true);
      if (longest.width > measurement.available) assert.equal(measurement.helper, longest.text);
      await select.scrollIntoViewIfNeeded();
      const file = `${name}-${width}-${theme}.png`;
      await page.screenshot({ path: new URL(file, out).pathname });
      await page.screenshot({ path: new URL(`${name}-${width}-${theme}-full.png`, out).pathname, fullPage: true });
      // Native keyboard selection still changes the submitted value and removes stale helper text.
      await select.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      assert.notEqual(await select.inputValue(), longest.value);
      assert.equal(await select.evaluate(s => new FormData(s.form).get(s.name)), await select.inputValue());
      const shortValue = name === "campaignType" ? "candidate" : "PDI";
      await select.selectOption(shortValue);
      await page.waitForTimeout(50);
      assert.equal(await select.inputValue(), shortValue);
      assert.equal(await select.evaluate(s => new FormData(s.form).get(s.name)), shortValue);
      assert.notEqual(await select.evaluate(s => s.nextElementSibling?.textContent), longest.text);
      // Reset is a native DOM operation; the visual fallback must follow it too.
      await select.evaluate(s => s.form.reset());
      await page.waitForTimeout(50);
      assert.equal(await select.inputValue(), name === "campaignType" ? "nonpartisan_civic" : "");
      captures.push({ file, width, theme, name, longest, ...measurement, errors: [...errors] });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} catch (e) { failures.push(String(e)); throw e; }
finally {
  await writeFile(new URL("manifest.json", out), JSON.stringify({
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    fixture: "Local ignored zz-preview route renders the real JobForm, ReadingPage and Masthead. Synthetic job and jurisdiction IDs, valid local defaults documented in README.md, campaignType=nonpartisan_civic, canvassApp empty, autosave=false. No database or production access. Root shell is signed out, not the authenticated organization shell.",
    captures, failures,
  }, null, 2) + "\n");
  await browser.close();
}
