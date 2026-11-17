const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startLocalSite } = require('../helpers/local-site');

let site, cookie;
const session = `dfc-categories-${process.pid}`;
const execute = promisify(execFile);
async function browser(...args) {
  const { stdout } = await execute('agent-browser', ['--session', session, '--json', ...args], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  assert.equal(result.success, true, JSON.stringify(result.error));
  return result.data;
}
async function evaluate(source) { return (await browser('eval', source)).result; }
async function open(path) {
  await browser('open', site.url + path);
  // Remote font loading must not stall unrelated editor/API checks indefinitely.
  await evaluate('(async()=>{await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,10000))]);return true})()');
}
async function waitFor(expression) {
  return evaluate(`(async()=>{const deadline=Date.now()+10000;while(!(${expression})){if(Date.now()>deadline)throw new Error('Condition did not become true');await new Promise(r=>setTimeout(r,20))}return true})()`);
}

before(async () => {
  site = await startLocalSite();
  await site.sql`INSERT INTO content (key,value) VALUES
    ('current.column-1','<h3>Main Gallery</h3><p>Existing show</p>')`;
  const login = await fetch(site.url + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'local-integration-only', name: 'Integration test' }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
}, { timeout: 60000 });

after(async () => {
  await browser('close').catch(() => {});
  if (site) await site.close();
});

test('editors select a category when moving a show and change it later without losing content', async () => {
  await site.sql`INSERT INTO content (key,value) VALUES ('current.column-2','<h3>THE ANNEX</h3><p>Category move content</p>') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
  await open('/admin/#pages');
  await waitFor('document.querySelector("#li-go, #current-move button")');
  if (await evaluate('!!document.querySelector("#li-go")')) {
    await browser('fill', '#li-name', 'Category editor');
    await browser('fill', '#li-pass', 'local-integration-only');
    await browser('click', '#li-go');
  }
  await waitFor('document.querySelectorAll("#current-move button").length === 2');
  await browser('click', '#current-move button:last-child');
  assert.equal(await evaluate('document.querySelector("#move-category").value'), 'Exhibitions + Residencies');
  await browser('fill', '#move-title', 'Category selection show');
  await browser('select', '#move-category', 'Selected Talks + Workshops');
  await browser('click', '#move-save');
  await waitFor('location.hash === "#projects" && document.querySelector(\'[data-slug="Category-selection-show"]\')');
  let [project] = await site.sql`SELECT * FROM projects WHERE slug='Category-selection-show'`;
  assert.equal(project.category, 'Selected Talks + Workshops');
  assert.match(project.body_html, /Category move content/);
  const body = project.body_html;
  await browser('click', '[data-slug="Category-selection-show"] [data-details]');
  await waitFor('document.querySelector("#dt-category")');
  assert.equal(await evaluate('document.querySelector("#dt-category").value'), 'Selected Talks + Workshops');
  await browser('select', '#dt-category', 'Exhibitions + Residencies');
  await browser('click', '#dt-save');
  await waitFor('!document.querySelector("#dt-save")');
  [project] = await site.sql`SELECT * FROM projects WHERE slug='Category-selection-show'`;
  assert.equal(project.category, 'Exhibitions + Residencies');
  assert.equal(project.body_html, body);
  const [version] = await site.sql`SELECT snapshot FROM versions WHERE entity_key='Category-selection-show' ORDER BY id DESC LIMIT 1`;
  assert.equal(version.snapshot.category, 'Exhibitions + Residencies');
  await open('/Past.html');
  assert.equal(await evaluate(`document.querySelector('a[href="/projects/Category-selection-show.html"]').closest('.past-section').querySelector('h3').textContent`), 'Exhibitions + Residencies');
});

test('moves without a category default to exhibitions and explicit uncategorized remains supported', async () => {
  for (const category of [undefined, '']) {
    await site.sql`UPDATE content SET value='<h3>THE ANNEX</h3><p>Default category content</p>' WHERE key='current.column-2'`;
    const response = await fetch(site.url + '/api/projects/from-current', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 2, title: 'Default category test', category }),
    });
    assert.equal(response.status, 200);
    const { project } = await response.json();
    assert.equal(project.category, category === undefined ? 'Exhibitions + Residencies' : null);
    assert.match(project.body_html, /Default category content/);
  }
});
