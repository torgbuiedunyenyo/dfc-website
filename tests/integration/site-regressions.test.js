const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startLocalSite } = require('../helpers/local-site');

let site, cookie;
const session = `dfc-regressions-${process.pid}`;
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
  await evaluate('(async()=>{await document.fonts.ready;return true})()');
}
async function waitFor(expression) {
  return evaluate(`(async()=>{const deadline=Date.now()+10000;while(!(${expression})){if(Date.now()>deadline)throw new Error('Condition did not become true');await new Promise(r=>setTimeout(r,20))}return true})()`);
}

before(async () => {
  site = await startLocalSite();
  const sql = site.sql;
  await sql`INSERT INTO projects (slug,title,status,source_path,body_html) VALUES
    ('draft-audit','Draft audit','draft','/draft-audit','<p>Unpublished project text</p>'),
    ('published-audit','Published audit','past','/published-audit','<p>Published project text</p><img src="/Images/PPHoldingImage.jpg" alt="Artwork">'),
    ('archived-audit','Archived audit','archive','/archived-audit','<p>Archived project text</p>')`;
  await sql`INSERT INTO events (title,start_date,published) VALUES ('Hidden event','2026-09-19',false),('Published event','2026-09-20',true)`;
  await sql`INSERT INTO content (key,value) VALUES ('about.intro','<p>Initial introduction</p>')`;
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

test('draft project routes return 404 publicly but allow authenticated edit previews', async () => {
  for (const path of ['/projects/draft-audit.html', '/draft-audit']) {
    const response = await fetch(site.url + path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /Unpublished project text/);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const preview = await fetch(site.url + '/projects/draft-audit.html?cmsedit=1', { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Unpublished project text/);
  for (const slug of ['published-audit', 'archived-audit']) {
    assert.equal((await fetch(site.url + '/projects/' + slug + '.html')).status, 200);
  }
});

test('anonymous event requests exclude hidden events while admin requests retain them without shared caching', async () => {
  const publicResponse = await fetch(site.url + '/api/events');
  assert.deepEqual((await publicResponse.json()).events.map(e => e.title), ['Published event']);
  const adminResponse = await fetch(site.url + '/api/events', { headers: { Cookie: cookie } });
  assert.deepEqual((await adminResponse.json()).events.map(e => e.title), ['Published event', 'Hidden event']);
  assert.equal(adminResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(publicResponse.headers.get('cache-control'), 'private, no-store');
});

test('malformed unrelated cookies neither crash authentication nor invalidate a valid session', async () => {
  const anonymous = await fetch(site.url + '/api/auth/me', { headers: { Cookie: 'unrelated=%; dfc_session=%E0%A4%A' } });
  assert.equal(anonymous.status, 200);
  assert.equal((await anonymous.json()).authed, false);
  const authenticated = await fetch(site.url + '/api/auth/me', { headers: { Cookie: 'unrelated=%; ' + cookie } });
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).authed, true);
});

test('Current gallery links remain visible below the fixed header at narrow and wide mobile widths', async () => {
  await open('/Current.html');
  for (const width of [320, 390, 768]) {
    await browser('set', 'viewport', String(width), '844');
    await waitFor(`document.querySelector('.current-section-links').getBoundingClientRect().top >= document.querySelector('.fixed-nav-bar').getBoundingClientRect().bottom`);
    const result = await evaluate(`(()=>{const links=[...document.querySelectorAll('.current-section-links a')];return {overflow:document.documentElement.scrollWidth>innerWidth,reachable:links.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})}})()`);
    assert.equal(result.overflow, false, `overflow at ${width}`);
    assert.equal(result.reachable, true, `links obscured at ${width}`);
  }
  await browser('set', 'viewport', '320', '844');
  await browser('click', '.current-section-links a[href="#annex"]');
  const target = await evaluate(`(()=>{const heading=document.querySelector('#annex h3').getBoundingClientRect();return {top:heading.top,navBottom:document.querySelector('.current-section-links').getBoundingClientRect().bottom}})()`);
  assert.ok(target.top >= target.navBottom, JSON.stringify(target));
});

test('calendar arrows stay onscreen and usable at 320px and 390px', async () => {
  await open('/Future.html');
  for (const width of [320, 390]) {
    await browser('set', 'viewport', String(width), '844');
    const result = await evaluate(`(()=>{const arrows=[...document.querySelectorAll('.cal-arrow')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});return {arrows,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
    assert.equal(result.overflow, false);
    assert.ok(result.arrows.every(r => r.left >= 0 && r.right <= width && r.width >= 44), JSON.stringify(result));
    const before = await evaluate('document.getElementById("cal-month-title").textContent');
    await browser('click', '#cal-next');
    assert.notEqual(await evaluate('document.getElementById("cal-month-title").textContent'), before);
    await browser('click', '#cal-prev');
  }
});

test('an exhibition spanning three months appears and highlights every day of its intermediate month', async () => {
  const now = new Date();
  const date = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const start = date(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const end = date(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  await site.sql`INSERT INTO events (title,start_date,end_date,published) VALUES ('Three-month exhibition',${start},${end},true)`;
  await open('/Future.html');
  const result = await evaluate(`({events:document.getElementById('cal-events').textContent,highlighted:document.querySelectorAll('.cal-cell.has-event').length})`);
  assert.match(result.events, /Three-month exhibition/);
  assert.equal(result.highlighted, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  await browser('click', '#cal-next');
  await browser('click', '#cal-next');
  assert.doesNotMatch(await evaluate('document.getElementById("cal-events").textContent'), /Three-month exhibition/);
});

test('Subscribe and image-viewer close controls retain visible keyboard focus', async () => {
  await open('/projects/published-audit.html');
  for (const selector of ['.newsletter-signup__form button', '.image-lightbox__close']) {
    if (selector.includes('lightbox')) await evaluate('document.querySelector(".image-lightbox-trigger").click()');
    const focused = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.focus();const s=getComputedStyle(b);return {focusVisible:b.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth}})()`);
    assert.equal(focused.focusVisible, true);
    assert.equal(focused.outline, 'solid');
    assert.equal(focused.width, '2px');
  }
});

test('typing during a real pending save preserves newer edits and saves them on the next request', async () => {
  await browser('cookies', 'set', 'dfc_session', cookie.split('=')[1], '--url', site.url);
  await open('/About.html?cmsedit=1');
  await waitFor('document.querySelector(".cms-save")');
  const edit = (key, value) => evaluate(`(()=>{const e=document.querySelector('[data-cms="${key}"]');e.innerHTML=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await edit('about.intro', '<p>First saved version</p>');
  const held = site.pauseNextWrite();
  try {
    await evaluate('window.auditNoReload=true;document.querySelector(".cms-save").click()');
    await held.pending;
    await edit('about.intro', '<p>Newer typing</p>');
    await edit('global.footer', 'New footer while saving');
    assert.equal(await evaluate('document.querySelector(".cms-save").disabled'), true);
  } finally { held.release(); }
  await waitFor('!document.querySelector(".cms-save").disabled');
  assert.equal((await site.sql`SELECT value FROM content WHERE key='about.intro'`)[0].value, '<p>First saved version</p>');
  assert.equal(await evaluate(`document.querySelector('[data-cms="about.intro"]').textContent`), 'Newer typing');
  assert.equal(await evaluate('window.auditNoReload'), true);
  await evaluate('document.querySelector(".cms-save").click()');
  await waitFor('!document.querySelector(".cms-status").textContent.includes("Saving") && !document.querySelector(".cms-status").textContent.includes("unsaved")');
  assert.equal((await site.sql`SELECT value FROM content WHERE key='about.intro'`)[0].value, '<p>Newer typing</p>');
  assert.equal((await site.sql`SELECT value FROM content WHERE key='global.footer'`)[0].value, 'New footer while saving');
  assert.equal(await evaluate('window.auditNoReload'), true);
});

test('project saves preserve newer body edits while successfully persisting the submitted global footer', async () => {
  await open('/projects/published-audit.html?cmsedit=1');
  await waitFor('document.querySelector(".cms-save")');
  const edit = (key, value) => evaluate(`(()=>{const e=document.querySelector('[data-cms="${key}"]');e.innerHTML=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await edit('project.body', '<p>Submitted project body</p>');
  await edit('global.footer', 'Submitted project footer');
  const held = site.pauseNextWrite();
  try {
    await evaluate('document.querySelector(".cms-save").click()');
    await held.pending;
    await edit('project.body', '<p>Newer project body</p>');
  } finally { held.release(); }
  await waitFor('!document.querySelector(".cms-save").disabled');
  assert.equal((await site.sql`SELECT body_html FROM projects WHERE slug='published-audit'`)[0].body_html, '<p>Submitted project body</p>');
  assert.equal((await site.sql`SELECT value FROM content WHERE key='global.footer'`)[0].value, 'Submitted project footer');
  assert.match(await evaluate('document.querySelector(".cms-status").textContent'), /1 unsaved region/);
  await evaluate('document.querySelector(".cms-save").click()');
  await waitFor('!document.querySelector(".cms-status").textContent.includes("Saving") && !document.querySelector(".cms-status").textContent.includes("unsaved")');
  assert.equal((await site.sql`SELECT body_html FROM projects WHERE slug='published-audit'`)[0].body_html, '<p>Newer project body</p>');
});

test('an expired session fails saving without clearing unsaved edits or leaving Save disabled', async () => {
  await open('/About.html?cmsedit=1');
  await waitFor('document.querySelector(".cms-save")');
  await browser('cookies', 'clear');
  await evaluate(`(()=>{const e=document.querySelector('[data-cms="about.intro"]');e.innerHTML='<p>Unsaved after expiration</p>';e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cms-save').click()})()`);
  await waitFor('document.querySelector(".cms-toast.cms-error")');
  assert.equal(await evaluate('document.querySelector(".cms-save").disabled'), false);
  assert.match(await evaluate('document.querySelector(".cms-status").textContent'), /1 unsaved region/);
  assert.equal((await site.sql`SELECT value FROM content WHERE key='about.intro'`)[0].value, '<p>Newer typing</p>');
  // Clear only the browser's local dirty state so test teardown can close it.
  await evaluate('document.querySelector(".cms-discard").click()');
});
