/* Pure HTML transforms for the admin "move" actions:
   Current column → Past project, and Future section → Current column. */
const cheerio = require('cheerio');

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Text of the first <h3> in a column — the venue header
// ("DREAM FARM COMMONS" / "THE ANNEX"), kept when content moves on.
function venueHeader(colHtml) {
  const $ = cheerio.load(`<div id="col">${colHtml || ''}</div>`);
  const h3 = $('#col h3').first();
  return h3.length ? h3.text().replace(/\s+/g, ' ').trim() : '';
}

// What a Current column shows after its exhibition moves to Past.
function clearedColumn(colHtml) {
  const venue = venueHeader(colHtml);
  return (venue ? `<h3>${escapeHtml(venue)}</h3>\n` : '') + '<p>New exhibition coming soon.</p>';
}

const CLEARED_FUTURE = '<div class="source-content-grid">\n' +
  '  <article class="source-content-copy">\n' +
  '    <p>New programming will be announced soon.</p>\n' +
  '  </article>\n</div>';

// Reshape the Future page's source-content block into a Current column:
// venue header, then images, then the copy.
function futureToColumn(futureHtml, venue) {
  const $ = cheerio.load(`<div id="src">${futureHtml || ''}</div>`);
  const images = $('#src img').toArray()
    .map((el) => ({ src: $(el).attr('src') || '', alt: $(el).attr('alt') || '' }))
    .filter((im) => im.src);
  $('#src img').remove();
  let copy = $('#src .source-content-copy').html();
  if (copy == null) copy = $('#src').html() || '';
  const imgHtml = images
    .map((im) => `<img src="${escapeHtml(im.src)}" alt="${escapeHtml(im.alt)}">`)
    .join('\n');
  return [
    venue ? `<h3>${escapeHtml(venue)}</h3>` : '',
    imgHtml,
    copy.trim(),
  ].filter(Boolean).join('\n\n');
}

module.exports = { venueHeader, clearedColumn, futureToColumn, CLEARED_FUTURE };
