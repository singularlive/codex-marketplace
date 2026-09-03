#!/usr/bin/env node
'use strict';
const { load } = require('./runtime-dependencies');
async function main() {
  const report = { node: process.version, dependencies: {}, authoring: 'unavailable', browser: 'not-checked' };
  try {
    for (const name of ['tinycolor2', 'uuid', 'ws', 'playwright-core']) {
      load(name);
      report.dependencies[name] = 'available';
    }
    report.authoring = 'ready';
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  }
  if (report.authoring === 'ready' && process.argv.includes('--browser')) {
    let browser;
    try {
      browser = await load('playwright-core').chromium.launch({ channel: 'chrome', headless: true, timeout: 15000 });
      const page = await browser.newPage();
      await page.setContent('<html><body>Composer runtime check</body></html>');
      await page.screenshot();
      report.browser = 'ready';
      report.browserVersion = browser.version();
    } catch (error) {
      report.browser = 'unavailable';
      report.error = 'CHROME_UNAVAILABLE: Install or enable Google Chrome, then retry. No browser was installed or replaced.';
      process.exitCode = 1;
    } finally {
      if (browser) await browser.close();
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('RUNTIME_CHECK_FAILED'); process.exitCode = 1; });
