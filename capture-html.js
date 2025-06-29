const puppeteer = require('puppeteer');

const url = process.argv[2];

if (!url) {
  console.error("Usage: node capture-html.js <URL>");
  process.exit(1);
}

const MAX_RETRIES = 5;
const TIMEOUT = 10; // seconds

(async () => {
  let attempts = 0;
  let success = false;

  while (attempts < MAX_RETRIES && !success) {
    attempts++;
    let browser, page;

    try {
      browser = await puppeteer.launch({ headless: 'new' });
      page = await browser.newPage();

      console.error(`Attempt ${attempts}: Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      console.error(`Waiting ${TIMEOUT} seconds for dynamic content...`);
      await new Promise(resolve => setTimeout(resolve, TIMEOUT * 1000));

      // Force stop loading remaining resources
      try {
        await page._client().send('Page.stopLoading');
        console.error("✅ Stopped further page loading.");
      } catch (e) {
        console.error("⚠️ Failed to stop loading:", e.message);
      }

      const html = await page.content();
      console.log(html);

      success = true;
      await browser.close();
      process.exit(0); // ✅ success
    } catch (err) {
      console.error(`Attempt ${attempts} failed:`, err.message);
      if (browser) await browser.close();
      if (attempts === MAX_RETRIES) {
        console.error("❌ Max retries reached. Exiting.");
        process.exit(1); // ❌ failure
      }
    }
  }
})();
