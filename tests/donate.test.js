const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('cheerio');

test('Donate page uses the local Dream Farm Commons Venmo QR JPEG', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'Donate.html'), 'utf8');
  const $ = load(template);
  const image = $('[data-cms="donate.column-2"] img.donate-img');

  assert.equal(image.length, 1);
  assert.equal(image.attr('src'), '/Images/venmo.jpg');
  assert.equal(image.attr('alt'), 'Dream Farm Commons Venmo QR code');

  const asset = fs.readFileSync(path.join(__dirname, '..', 'public', 'Images', 'venmo.jpg'));
  assert.deepEqual([...asset.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});
