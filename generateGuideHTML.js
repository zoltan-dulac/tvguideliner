const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load and parse config
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

// Map site names to config
const siteConfigs = {};
config.sites.forEach(siteEntry => {
  const [siteName, siteConfig] = Object.entries(siteEntry)[0];
  siteConfigs[siteName] = siteConfig;
});

const htmlDir = path.join(__dirname, 'html');

// Generate time slots (48 slots, 30-min increments)
function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour12 = ((h % 12) || 12);
      const ampm = h < 12 ? 'AM' : 'PM';
      slots.push(`${hour12}:${m.toString().padStart(2, '0')} ${ampm}`);
    }
  }
  return slots;
}
const timeSlots = generateTimeSlots();

// Convert "HH:MM" to slot index (0–47)
function getSlotIndex(time24) {
  const [h, m] = time24.split(':').map(Number);
  return h * 2 + (m >= 30 ? 1 : 0);
}

// Extract start/end time from raw text (24-hour format)
function extractTimeRange(raw) {
  const matches = [...raw.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/g)];
  if (!matches.length) return null;

  const to24 = ([ , h, m = '00', meridian ]) => {
    let hour = parseInt(h, 10);
    let minute = parseInt(m, 10);
    meridian = meridian?.toUpperCase();
    if (meridian === 'PM' && hour !== 12) hour += 12;
    if (meridian === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const start = to24(matches[0]);
  const end = matches[1] ? to24(matches[1]) : null;
  return { start, end };
}

// Combine all matching elements’ text content
function getCombinedText(parent, selector) {
  return Array.from(parent.querySelectorAll(selector))
    .map(el => el.textContent.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

// Build channel → slotIndex → show data
const schedule = {};
const files = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));

files.forEach(filename => {
  const siteName = path.basename(filename, '.html');
  const siteConfig = siteConfigs[siteName];
  if (!siteConfig) return;

  const {
    parentSelector,
    timeSelector,
    nameSelector,
    detailsSelector,
    subtitleSelector
  } = siteConfig;

  const htmlContent = fs.readFileSync(path.join(htmlDir, filename), 'utf-8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const parentEls = document.querySelectorAll(parentSelector);
  schedule[siteName] = {};

  parentEls.forEach(parentEl => {
    const timeRaw = getCombinedText(parentEl, timeSelector);
    const range = extractTimeRange(timeRaw);
    if (!range?.start) return;

    const startIdx = getSlotIndex(range.start);
    const endIdx = range.end ? getSlotIndex(range.end) : startIdx + 1;
    const span = Math.max(1, endIdx - startIdx);

    const name = getCombinedText(parentEl, nameSelector);
    const subtitle = subtitleSelector ? getCombinedText(parentEl, subtitleSelector) : '';
    const details = getCombinedText(parentEl, detailsSelector);

    schedule[siteName][startIdx] = { name, subtitle, details, span };
  });
});

// Create HTML table
let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
    th.time { writing-mode: vertical-lr; transform: rotate(180deg); width: 30px; }
    td > div { font-weight: bold; }
    td span { display: block; font-size: 0.85em; color: #555; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        <th>Channel</th>
        ${timeSlots.map(t => `<th class="time">${t}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
`;

// Build table rows per channel
for (const channel of files.map(f => path.basename(f, '.html'))) {
  html += `<tr><th>${channel}</th>`;
  const slots = schedule[channel] || {};
  let col = 0;

  while (col < timeSlots.length) {
    const show = slots[col];
    if (show) {
      html += `<td colspan="${show.span}"><div>${show.name}</div>`;
      if (show.subtitle) html += `<span>${show.subtitle}</span>`;
      if (show.details) html += `<span>${show.details}</span>`;
      html += `</td>`;
      col += show.span; 
    } else {
      html += `<td></td>`;
      col++;
    }
  }

  html += `</tr>\n`;
}

html += `</tbody></table></body></html>`;

// Write to file
fs.writeFileSync('guide.html', html, 'utf-8');
console.log('✅ guide.html generated.');
