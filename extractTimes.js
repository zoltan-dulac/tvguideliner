const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load and parse config
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

const siteConfigs = {};
config.sites.forEach(siteEntry => {
  const [siteName, siteConfig] = Object.entries(siteEntry)[0];
  siteConfigs[siteName] = siteConfig;
});

const htmlDir = path.join(__dirname, 'html');

function parseTime(rawText) {
  const match = rawText.trim().match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b/);
  if (!match) return null;

  let [ , hourStr, minuteStr = '00', meridian ] = match;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const paddedMinute = minute.toString().padStart(2, '0');

  if (!meridian) {
    meridian = hour >= 12 ? 'PM' : 'AM';
  } else {
    meridian = meridian.toUpperCase();
  }

  let hour24 = hour;
  if (meridian === 'PM' && hour !== 12) hour24 += 12;
  if (meridian === 'AM' && hour === 12) hour24 = 0;

  const sortable = `${hour24.toString().padStart(2, '0')}:${paddedMinute}`;
  const display = `${(hour % 12 || 12)}:${paddedMinute} ${meridian}`;

  return { sortable, display };
}

function getCombinedText(parent, selector) {
  return Array.from(parent.querySelectorAll(selector))
    .map(el => el.textContent.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

const allEntries = [];

fs.readdirSync(htmlDir)
  .filter(filename => filename.endsWith('.html'))
  .forEach(filename => {
    const siteName = path.basename(filename, '.html');
    const siteConfig = siteConfigs[siteName];

    if (!siteConfig) {
      console.warn(`⚠️  No config found for site: ${siteName}, skipping.`);
      return;
    }

    const {
      parentSelector,
      timeSelector,
      nameSelector,
      detailsSelector,
      subtitleSelector
    } = siteConfig;

    const filePath = path.join(htmlDir, filename);
    const htmlContent = fs.readFileSync(filePath, 'utf-8');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    const parentEls = document.querySelectorAll(parentSelector);

    let lastWasPM = false;

    for (const parentEl of parentEls) {
      const timeRaw = getCombinedText(parentEl, timeSelector);
      const timeData = parseTime(timeRaw);

      if (!timeData) continue;

      const meridian = timeData.display.includes('PM') ? 'PM' : 'AM';
      if (lastWasPM && meridian === 'AM') break;
      lastWasPM = meridian === 'PM';

      const subtitle = subtitleSelector ? getCombinedText(parentEl, subtitleSelector) : '';
      const name = getCombinedText(parentEl, nameSelector) || '[No title]';
      const details = getCombinedText(parentEl, detailsSelector) || '[No details]';

      allEntries.push({
        source: filename.replace(/\.html$/, ''),
        timeSort: timeData.sortable,
        timeDisplay: timeData.display,
        name,
        subtitle,
        details
      });
    }
  });

// Group entries by timeSort and source
const groupedByTimeAndSource = new Map();

for (const entry of allEntries) {
  const sortTime = parseTime(entry.timeDisplay)?.sortable;
  if (!sortTime) continue;

  if (!groupedByTimeAndSource.has(sortTime)) {
    groupedByTimeAndSource.set(sortTime, new Map());
  }

  const sourceMap = groupedByTimeAndSource.get(sortTime);

  // Only store the first entry per source per time
  if (!sourceMap.has(entry.source)) {
    sourceMap.set(entry.source, entry);
  }
}

// Sort times chronologically
function toMinutes(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const [ , h, m ] = match;
  const hour = parseInt(h, 10);
  const minute = parseInt(m, 10);
  return hour * 60 + minute;
}

const sortedTimes = Array.from(groupedByTimeAndSource.keys()).sort((a, b) => toMinutes(a) - toMinutes(b));

// Output
console.log('\n🕓 Grouped Listings by Time (One per Source):\n');

for (const timeKey of sortedTimes) {
  const sourceMap = groupedByTimeAndSource.get(timeKey);
  const displayTime = sourceMap.values().next().value.timeDisplay; // use the first one
  console.log(`🕒 ${displayTime}`);
  for (const [source, entry] of sourceMap.entries()) {
    console.log(`${source} | 🎬 ${entry.name}${entry.subtitle ? ` — ${entry.subtitle}` : ''} | 📋 ${entry.details}`);
  }
  console.log();
}
