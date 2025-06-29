const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { DateTime } = require('luxon');   // for timezone feature.

// Get config file from command line, default to 'config.json'
const configFile = process.argv[2] || 'config.json';

// Load and parse config
const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

// Check to ensure there are no duplicates.

const nameCounts = {};
const duplicates = [];

for (const siteEntry of config.sites) {
  const [siteName] = Object.keys(siteEntry);
  if (nameCounts[siteName]) {
    nameCounts[siteName]++;
    duplicates.push(siteName);
  } else {
    nameCounts[siteName] = 1;
  }
}

if (duplicates.length > 0) {
  console.error(`❌ Duplicate channel names found:\n  - ${[...new Set(duplicates)].join('\n  - ')}`);
  process.exit(1);
} else {
  console.log('✅ No duplicate channel names found.');
}


const siteConfigs = {};
config.sites.forEach(siteEntry => {
  const [siteName, siteConfig] = Object.entries(siteEntry)[0];
  siteConfigs[siteName] = siteConfig;
});

const htmlDir = path.join(__dirname, 'html');

// This function will surpess CSS console.errors that are being 
// printed out by JSDOM that I really don't care about.
function createDomSuppressingJsdomWarnings(html) {
  const originalConsoleError = console.error;
  console.error = function (...args) {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      args[0].includes('Could not parse CSS stylesheet')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  const dom = new JSDOM(html);
  console.error = originalConsoleError;
  return dom;
}

function parseTime(rawText, sourceZone = 'local') {
  const match = rawText.trim().match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b/);
  if (!match) return null;

  let [ , hourStr, minuteStr = '00', meridian ] = match;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (!meridian) {
    meridian = hour >= 12 ? 'PM' : 'AM';
  } else {
    meridian = meridian.toUpperCase();
  }

  const formattedTime = `${(hour % 12 || 12)}:${minute.toString().padStart(2, '0')} ${meridian}`;

  const now = DateTime.local();
  const sourceDateTime = DateTime.fromFormat(formattedTime, 'h:mm a', { zone: sourceZone || 'local' })
    .set({ year: now.year, month: now.month, day: now.day });

  const localDateTime = sourceDateTime.toLocal();

  return {
    sortable: localDateTime.toFormat('HH:mm'),
    display: localDateTime.toFormat('h:mm a'),
    localISO: localDateTime.toISO()
  };
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
      subtitleSelector,
      timezone
    } = siteConfig;

    const filePath = path.join(htmlDir, filename);
    const htmlContent = fs.readFileSync(filePath, 'utf-8');
    const dom = createDomSuppressingJsdomWarnings(htmlContent);
    const document = dom.window.document;

    const parentEls = document.querySelectorAll(parentSelector);

    let lastWasPM = false;

    for (const parentEl of parentEls) {
      const timeRaw = getCombinedText(parentEl, timeSelector);
      const timeData = parseTime(timeRaw, timezone);

      if (!timeData) {
        console.error(`Time data for ${siteName} is corrupted`);
        continue;
      }

      const meridian = timeData.display.includes('PM') ? 'PM' : 'AM';
      if (lastWasPM && meridian === 'AM') break;
      lastWasPM = meridian === 'PM';

      const subtitle = subtitleSelector ? getCombinedText(parentEl, subtitleSelector) : '';
      const name = getCombinedText(parentEl, nameSelector) || '[No title]';
      const details = getCombinedText(parentEl, detailsSelector) || '';

      if (!timeRaw && timeSelector) {
        console.error(`⚠️  [${siteName}] Missing time using selector "${timeSelector}"`);
      }
      if (!name && nameSelector) {
        console.error(`⚠️  [${siteName}] Missing name using selector "${nameSelector}"`);
      }

      const objToPush = {
        source: siteName,
        timeSort: timeData.sortable,
        timeDisplay: timeData.display,
        name,
        subtitle,
        details
      }

      /* if (siteName === 'RTE1' || siteName === 'RTE2' || siteName === 'TVO') {
        console.warn('Is RTE.');
        console.warn(objToPush);
      }  */
      

      allEntries.push(objToPush);
    }
      console.warn(`${parentEls.length} listings extracted for ${siteName}.`)
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
console.log(`
  <!doctype html>
  <html>
    <head>
      <title>Listings for ${new Date()}</title>
      <link rel="stylesheet" type="text/css" href="css/style.css">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes" />
    </head>
    <body>
      <h1>Listings for ${new Date()}</h1>`);

for (const timeKey of sortedTimes) {
  const sourceMap = groupedByTimeAndSource.get(timeKey);
  const displayTime = sourceMap.values().next().value.timeDisplay; // use the first one
  console.log(`<h2 class="time">${displayTime}</h2>`);
  for (const [source, entry] of sourceMap.entries()) {
    console.log(`
      <div class="entry">
        
          <span class="channel">${source}</span>
          <span class="name">${entry.name}</span>
          ${entry.subtitle ? `<span class="subtitle">${entry.subtitle}</span>` : ''}
       
        
          <span class="description">${entry.details}
        
      </div>`);
  }
  console.log(`</body></html>`);
}
