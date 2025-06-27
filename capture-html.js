const puppeteer = require('puppeteer');

const url = process.argv[2];

if (!url) {
  console.error("Usage: node capture-html.js <URL>");
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' }); // use 'new' for Chrome >= 112
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.error("Waiting 10 seconds for dynamic content...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // fallback timeout

    const html = await page.content();
    console.log(html);
  } catch (err) {
    console.error("Error capturing HTML:", err);
  } finally {
    await browser.close();
  }
})();