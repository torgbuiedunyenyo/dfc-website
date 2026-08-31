/* DFC Admin — single-page admin app (no build step) */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var me = null;

  var PAGE_DEFS = [
    { name: 'Dfc', label: 'Home', desc: 'Landing page & hero image' },
    { name: 'About', label: 'About', desc: 'Intro and member bios' },
    { name: 'Current', label: 'Current Exhibitions', desc: 'Main Gallery and Annex sections' },
    { name: 'Future', label: 'Future Projects', desc: 'Calendar page (events managed in Calendar tab)' },
    { name: 'Past', label: 'Past Projects', desc: 'Grid is managed in the Projects tab' },
    { name: 'Visit', label: 'Visit', desc: 'Directions & accessibility info' },
    { name: 'Donate', label: 'Donate', desc: 'Print fundraiser, Patreon, Venmo' },
  ];

  /* ---------- utilities ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && !path.startsWith('/api/auth')) { renderLogin(); throw new Error('Please log in'); }
        if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'));
        return j;
      });
    });
  }

  function toast(msg, isErr) {
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function fmtDate(d) {
    try { return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return String(d); }
  }

  function modal(innerHtml) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal">' + innerHtml + '</div>';
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
    return back;
  }

  /* ---------- image compression + upload (shared with editor) ---------- */

  function fileToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (file.type === 'image/gif' && file.size < 2 * 1024 * 1024) {
        return fileToB64(file).then(function (b64) {
          resolve({ filename: file.name, mime: file.type, data_b64: b64 });
        }, reject);
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var MAX = 1800;
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          var s = Math.min(MAX / w, MAX / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var keepPng = file.type === 'image/png' && file.size < 800 * 1024;
        var mime = keepPng ? 'image/png' : 'image/jpeg';
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('Could not process image'));
          fileToB64(blob).then(function (b64) {
            var name = file.name.replace(/\.[a-z0-9]+$/i, '') + (mime === 'image/png' ? '.png' : '.jpg');
            resolve({ filename: name, mime: mime, data_b64: b64 });
          }, reject);
        }, mime, 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  function uploadImage(file) {
    return compressImage(file).then(function (payload) {
      return api('POST', '/api/media', payload);
    }).then(function (res) { return res.url; });
  }

  /* ---------- shell / router ---------- */

  function shell(active, contentHtml) {
    app.innerHTML =
      '<div class="topbar">' +
      '  <span class="brand">dfc admin</span>' +
      '  <nav>' +
      ['pages', 'projects', 'calendar', 'history'].map(function (v) {
        return '<a href="#' + v + '" class="' + (active === v ? 'active' : '') + '">' +
          v.charAt(0).toUpperCase() + v.slice(1) + '</a>';
      }).join('') +
      '  <a href="/" target="_blank">View site ↗</a>' +
      '  </nav>' +
      '  <span class="who">' + esc(me && me.author ? 'editing as ' + me.author : '') +
      '  &nbsp; <a id="logout">log out</a></span>' +
      '</div>' +
      '<div class="view">' + contentHtml + '</div>';
    var lo = document.getElementById('logout');
    if (lo) lo.addEventListener('click', function () {
      api('POST', '/api/auth/logout').then(function () { me = null; renderLogin(); });
    });
  }

  function route() {
    if (!me || !me.authed) return renderLogin();
    var hash = location.hash.replace(/^#/, '') || 'pages';
    var parts = hash.split('/');
    if (parts[0] === 'pages') return renderPages();
    if (parts[0] === 'projects') return renderProjects();
    if (parts[0] === 'project-new') return renderProjectNew();
    if (parts[0] === 'edit-page') return renderEditor('page', decodeURIComponent(parts[1] || ''));
    if (parts[0] === 'edit-project') return renderEditor('project', decodeURIComponent(parts[1] || ''));
    if (parts[0] === 'calendar') return renderCalendar();
    if (parts[0] === 'history') return renderHistory(decodeURIComponent(parts[1] || ''), decodeURIComponent(parts.slice(2).join('/') || ''));
    return renderPages();
  }

  window.addEventListener('hashchange', route);

  window.addEventListener('message', function (e) {
    if (e.data && e.data.cms === 'exit') {
      location.hash = '#pages';
    }
  });

  /* ---------- login ---------- */

  function renderLogin() {
    app.innerHTML =
      '<div class="login-box">' +
      '  <h1>dfc admin</h1>' +
      '  <label>Your name (for edit history)</label>' +
      '  <input type="text" id="li-name" placeholder="e.g. Ann" value="' + esc(localStorage.getItem('dfc-name') || '') + '">' +
      '  <label>Password</label>' +
      '  <input type="password" id="li-pass">' +
      '  <div class="err" id="li-err"></div>' +
      '  <br><button class="primary" id="li-go" style="width:100%">Log in</button>' +
      '</div>';
    var go = document.getElementById('li-go');
    var pass = document.getElementById('li-pass');
    function submit() {
      var name = document.getElementById('li-name').value.trim();
      localStorage.setItem('dfc-name', name);
      go.disabled = true;
      api('POST', '/api/auth/login', { password: pass.value, name: name })
        .then(function () { return api('GET', '/api/auth/me'); })
        .then(function (m) { me = m; route(); })
        .catch(function (err) {
          go.disabled = false;
          document.getElementById('li-err').textContent = err.message;
        });
    }
    go.addEventListener('click', submit);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  /* ---------- pages ---------- */

  function renderPages() {
    shell('pages',
      '<h2>Pages</h2>' +
      '<p class="hint">Click a page to edit its text and images directly. Changes are saved with full version history — anything can be undone from the History tab.</p>' +
      '<div class="cards">' +
      PAGE_DEFS.map(function (p) {
        return '<div class="card"><h3>' + esc(p.label) + '</h3><div class="sub">' + esc(p.desc) + '</div>' +
          '<div class="row">' +
          '<button class="primary" data-edit="' + p.name + '">Edit</button>' +
          '<a class="btn" href="/' + p.name + '.html" target="_blank">View</a>' +
          (p.name === 'Future' ? '<a class="btn" href="#calendar">Calendar events</a>' : '') +
          (p.name === 'Past' ? '<a class="btn" href="#projects">Manage projects</a>' : '') +
          '</div>' +
          (p.name === 'Current' ? '<div class="row" id="current-move" style="margin-top:10px;flex-direction:column;align-items:stretch;gap:6px"></div>' : '') +
          (p.name === 'Future' ? '<div class="row" id="future-move" style="margin-top:10px;flex-direction:column;align-items:stretch;gap:6px"></div>' : '') +
          '</div>';
      }).join('') +
      '</div>');
    app.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { location.hash = '#edit-page/' + b.getAttribute('data-edit'); });
    });
    loadMoveButtons();
  }

  var COLUMN_NAMES = { 1: 'Main Gallery', 2: 'The Annex' };

  function textOfHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent.replace(/\s+/g, ' ').trim();
  }

  // Move buttons on the Pages tab: Current column → Past project, and
  // Future section → Current column.
  function loadMoveButtons() {
    var curHolder = document.getElementById('current-move');
    var futHolder = document.getElementById('future-move');
    if (!curHolder && !futHolder) return;
    api('GET', '/api/content').then(function (res) {
      var map = {};
      res.content.forEach(function (c) { map[c.key] = c; });

      if (curHolder) [1, 2].forEach(function (col) {
        var c = map['current.column-' + col];
        if (!c) return;
        // Best-effort default for the title prompt only — the admin always
        // sees and can rewrite it before anything is created.
        var doc = new DOMParser().parseFromString('<div>' + c.value + '</div>', 'text/html');
        var h3s = doc.querySelectorAll('h3');
        var suggested = '';
        if (h3s.length) {
          suggested = textOfHtml(h3s[h3s.length - 1].innerHTML.split(/<br\s*\/?>/i)[0]);
        }
        var btn = document.createElement('button');
        btn.className = 'small';
        btn.textContent = '→ Move ' + COLUMN_NAMES[col] + ' show to Past Projects';
        btn.title = 'Moves this column’s images and text into a new past project and clears the column. Undoable from History.';
        btn.addEventListener('click', function () {
          var t = prompt('Title for the new past project:\n(the column is cleared — undoable from History)', suggested);
          if (t === null) return;
          btn.disabled = true;
          api('POST', '/api/projects/from-current', { column: col, title: t.trim() })
            .then(function (r) {
              toast('“' + r.project.title + '” moved to Past Projects');
              location.hash = '#projects';
            })
            .catch(function (err) { btn.disabled = false; toast(err.message, true); });
        });
        curHolder.appendChild(btn);
      });

      if (futHolder && map['future.source-content']) {
        [1, 2].forEach(function (col) {
          var btn = document.createElement('button');
          btn.className = 'small';
          btn.textContent = '→ Move Future content to Current: ' + COLUMN_NAMES[col];
          btn.title = 'Moves the Future Projects section into this Current Exhibitions column and clears the Future page. Undoable from History.';
          btn.addEventListener('click', function () {
            if (!confirm('Move the Future Projects content into Current Exhibitions (' + COLUMN_NAMES[col] + ')?\n\nThis replaces that column and clears the Future Projects section. Both can be undone from History.')) return;
            btn.disabled = true;
            api('POST', '/api/content/move-future', { column: col })
              .then(function () {
                toast('Future content moved to Current Exhibitions');
                renderPages();
              })
              .catch(function (err) { btn.disabled = false; toast(err.message, true); });
          });
          futHolder.appendChild(btn);
        });
      }
    }).catch(function () { /* buttons are a nice-to-have; cards still work without them */ });
  }

  /* ---------- visual editor (iframe) ---------- */

  function renderEditor(kind, name) {
    if (!name) { location.hash = '#pages'; return; }
    var src = kind === 'project'
      ? '/projects/' + encodeURIComponent(name) + '.html'
      : '/' + encodeURIComponent(name) + '.html';
    var histHash = kind === 'project' ? '#history/project/' + name : '#history/content';
    app.innerHTML =
      '<div class="editor-wrap">' +
      '  <div class="editor-toolbar">' +
      '    <button id="ed-back">← Back</button>' +
      '    <span class="name">' + esc(kind === 'project' ? 'Project: ' + name : 'Page: ' + name) + '</span>' +
      '    <a class="btn" href="' + histHash + '">History</a>' +
      '    <a class="btn" href="' + src + '" target="_blank">Open live ↗</a>' +
      '  </div>' +
      '  <iframe src="' + src + '?cmsedit=1&cb=' + Date.now() + '"></iframe>' +
      '</div>';
    document.getElementById('ed-back').addEventListener('click', function () {
      location.hash = kind === 'project' ? '#projects' : '#pages';
    });
  }

  /* ---------- projects ---------- */

  var projectsCache = [];

  function projectRow(p, idx, list) {
    var noPage = !p.has_body;
    return '<div class="list-row" data-slug="' + esc(p.slug) + '">' +
      '<img class="thumb" src="' + esc(p.thumbnail || '/Images/PPHoldingImage.jpg') + '" alt="">' +
      '<div class="grow"><div class="title">' + esc(p.title) + (noPage ? ' <span class="badge">no page yet</span>' : '') + '</div>' +
      '<div class="sub">/projects/' + esc(p.slug) + '.html</div></div>' +
      (p.status === 'past'
        ? '<button class="small" data-move="up" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button class="small" data-move="down" ' + (idx === list.length - 1 ? 'disabled' : '') + '>↓</button>'
        : '') +
      '<select data-status>' +
      ['past', 'archive', 'draft'].map(function (s) {
        var lbl = { past: 'In Past grid', archive: 'Hidden from grid', draft: 'Draft' }[s];
        return '<option value="' + s + '" ' + (p.status === s ? 'selected' : '') + '>' + lbl + '</option>';
      }).join('') +
      '</select>' +
      '<button class="small primary" data-edit>Edit page</button>' +
      '<button class="small" data-details>Details</button>' +
      '<a class="btn small" href="#history/project/' + esc(p.slug) + '">History</a>' +
      '<button class="small danger" data-del>Delete</button>' +
      '</div>';
  }

  function renderProjects() {
    shell('projects', '<h2>Projects</h2><div class="loading">loading…</div>');
    api('GET', '/api/projects').then(function (res) {
      projectsCache = res.projects;
      var past = projectsCache.filter(function (p) { return p.status === 'past'; });
      var archive = projectsCache.filter(function (p) { return p.status === 'archive'; });
      var draft = projectsCache.filter(function (p) { return p.status === 'draft'; });
      var html =
        '<h2>Projects</h2>' +
        '<p class="hint">“In Past grid” projects appear on the Past Projects page in this order. Use ↑↓ to reorder. Every change can be undone in History.</p>' +
        '<p><button class="primary" id="pj-new">+ New project</button></p><br>' +
        past.map(function (p, i) { return projectRow(p, i, past); }).join('');
      if (draft.length) {
        html += '<br><h2 style="font-size:22px">Drafts</h2>' +
          draft.map(function (p, i) { return projectRow(p, i, draft); }).join('');
      }
      if (archive.length) {
        html += '<br><h2 style="font-size:22px">Not in grid</h2>' +
          '<p class="hint">These pages are live at their address but not shown on the Past Projects page.</p>' +
          archive.map(function (p, i) { return projectRow(p, i, archive); }).join('');
      }
      shell('projects', html);
      document.getElementById('pj-new').addEventListener('click', function () { location.hash = '#project-new'; });
      bindProjectRows();
    }).catch(function (err) { toast(err.message, true); });
  }

  function bindProjectRows() {
    app.querySelectorAll('.list-row[data-slug]').forEach(function (row) {
      var slug = row.getAttribute('data-slug');
      var find = function (s) { return row.querySelector(s); };

      if (find('[data-move="up"]')) {
        find('[data-move="up"]').addEventListener('click', function () { moveProject(slug, -1); });
        find('[data-move="down"]').addEventListener('click', function () { moveProject(slug, 1); });
      }
      find('[data-status]').addEventListener('change', function (e) {
        api('PUT', '/api/projects/' + encodeURIComponent(slug), { status: e.target.value })
          .then(function () { toast('Saved'); renderProjects(); })
          .catch(function (err) { toast(err.message, true); });
      });
      find('[data-edit]').addEventListener('click', function () { location.hash = '#edit-project/' + slug; });
      find('[data-details]').addEventListener('click', function () { detailsModal(slug); });
      find('[data-del]').addEventListener('click', function () {
        if (!confirm('Delete “' + slug + '”? You can restore it later from History.')) return;
        api('DELETE', '/api/projects/' + encodeURIComponent(slug))
          .then(function () { toast('Deleted — restorable from History'); renderProjects(); })
          .catch(function (err) { toast(err.message, true); });
      });
    });
  }

  function moveProject(slug, dir) {
    var past = projectsCache.filter(function (p) { return p.status === 'past'; });
    var idx = past.findIndex(function (p) { return p.slug === slug; });
    var j = idx + dir;
    if (idx < 0 || j < 0 || j >= past.length) return;
    var tmp = past[idx]; past[idx] = past[j]; past[j] = tmp;
    var slugs = past.map(function (p) { return p.slug; })
      .concat(projectsCache.filter(function (p) { return p.status !== 'past'; }).map(function (p) { return p.slug; }));
    api('POST', '/api/projects/reorder', { slugs: slugs })
      .then(function () { renderProjects(); })
      .catch(function (err) { toast(err.message, true); });
  }

  function detailsModal(slug) {
    api('GET', '/api/projects/' + encodeURIComponent(slug)).then(function (res) {
      var p = res.project;
      var m = modal(
        '<h3>Project details</h3>' +
        '<label>Title (shown in the Past grid)</label>' +
        '<input type="text" id="dt-title" value="' + esc(p.title) + '">' +
        '<label>Thumbnail (square crop in the grid)</label>' +
        '<div class="img-item"><img id="dt-thumb-img" src="' + esc(p.thumbnail || '/Images/PPHoldingImage.jpg') + '">' +
        '<div class="grow"><button id="dt-upload">Upload new thumbnail</button></div></div>' +
        '<div class="actions"><button id="dt-cancel">Cancel</button><button class="primary" id="dt-save">Save</button></div>');
      var thumb = p.thumbnail;
      m.querySelector('#dt-upload').addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = function () {
          if (!input.files[0]) return;
          toast('Uploading…');
          uploadImage(input.files[0]).then(function (url) {
            thumb = url;
            m.querySelector('#dt-thumb-img').src = url;
            toast('Uploaded');
          }).catch(function (err) { toast(err.message, true); });
        };
        input.click();
      });
      m.querySelector('#dt-cancel').addEventListener('click', function () { m.remove(); });
      m.querySelector('#dt-save').addEventListener('click', function () {
        api('PUT', '/api/projects/' + encodeURIComponent(slug), {
          title: m.querySelector('#dt-title').value,
          thumbnail: thumb,
        }).then(function () { m.remove(); toast('Saved'); renderProjects(); })
          .catch(function (err) { toast(err.message, true); });
      });
    }).catch(function (err) { toast(err.message, true); });
  }

  /* ---------- new project ---------- */

  function renderProjectNew() {
    var images = []; // {src, alt}
    shell('projects',
      '<h2>New project</h2>' +
      '<p class="hint">Creates a project page in the standard two-column layout (photos on the left, text on the right). After creating it you can fine-tune everything in the visual editor.</p>' +
      '<label>Title *</label><input type="text" id="np-title" placeholder="e.g. Mast Year">' +
      '<label>Dates / subtitle line</label><input type="text" id="np-meta" placeholder="e.g. Residency show opening October 15th, 6-9PM">' +
      '<label>Description — leave a blank line between paragraphs</label>' +
      '<textarea id="np-desc" placeholder="First paragraph…\n\nSecond paragraph…"></textarea>' +
      '<label>Links</label><div id="np-links"></div>' +
      '<button class="small" id="np-addlink">+ Add link</button>' +
      '<label>Photos (the first one is used as the grid thumbnail)</label>' +
      '<div id="np-imgs"></div>' +
      '<button id="np-addimg">+ Add photos</button>' +
      '<label>Layout</label><select id="np-layout">' +
      '<option value="detail">Two-column (photos left, text right)</option>' +
      '<option value="single">Single column</option></select>' +
      '<label>Visibility</label><select id="np-status">' +
      '<option value="past">Show in Past Projects grid</option>' +
      '<option value="draft">Draft (hidden)</option></select>' +
      '<br><br><div class="row" style="display:flex;gap:10px">' +
      '<button class="primary" id="np-create">Create project</button>' +
      '<button id="np-cancel">Cancel</button></div><div class="err" id="np-err"></div>');

    var linksDiv = document.getElementById('np-links');
    function addLinkRow(label, url) {
      var row = document.createElement('div');
      row.className = 'links-row';
      row.innerHTML = '<input type="text" placeholder="Label" class="lk-label" value="' + esc(label || '') + '">' +
        '<input type="url" placeholder="https://…" class="lk-url" value="' + esc(url || '') + '">' +
        '<button class="small danger">✕</button>';
      row.querySelector('button').addEventListener('click', function () { row.remove(); });
      linksDiv.appendChild(row);
    }
    document.getElementById('np-addlink').addEventListener('click', function () { addLinkRow(); });

    var imgsDiv = document.getElementById('np-imgs');
    function redrawImages() {
      imgsDiv.innerHTML = images.map(function (im, i) {
        return '<div class="img-item"><img src="' + esc(im.src) + '">' +
          '<div class="grow"><input type="text" placeholder="Alt text / caption" value="' + esc(im.alt || '') + '" data-alt="' + i + '"></div>' +
          '<button class="small" data-up="' + i + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button class="small" data-down="' + i + '" ' + (i === images.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button class="small danger" data-rm="' + i + '">✕</button></div>';
      }).join('');
      imgsDiv.querySelectorAll('[data-alt]').forEach(function (inp) {
        inp.addEventListener('input', function () { images[+inp.getAttribute('data-alt')].alt = inp.value; });
      });
      imgsDiv.querySelectorAll('[data-up]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-up');
          var t = images[i - 1]; images[i - 1] = images[i]; images[i] = t;
          redrawImages();
        });
      });
      imgsDiv.querySelectorAll('[data-down]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-down');
          var t = images[i + 1]; images[i + 1] = images[i]; images[i] = t;
          redrawImages();
        });
      });
      imgsDiv.querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () {
          images.splice(+b.getAttribute('data-rm'), 1);
          redrawImages();
        });
      });
    }

    document.getElementById('np-addimg').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        toast('Uploading ' + files.length + ' image(s)…');
        files.reduce(function (chain, f) {
          return chain.then(function () {
            return uploadImage(f).then(function (url) {
              images.push({ src: url, alt: f.name.replace(/\.[a-z0-9]+$/i, '') });
              redrawImages();
            });
          });
        }, Promise.resolve()).then(function () { toast('Photos added'); })
          .catch(function (err) { toast(err.message, true); });
      };
      input.click();
    });

    document.getElementById('np-cancel').addEventListener('click', function () { location.hash = '#projects'; });
    document.getElementById('np-create').addEventListener('click', function () {
      var title = document.getElementById('np-title').value.trim();
      if (!title) { document.getElementById('np-err').textContent = 'Please enter a title.'; return; }
      var links = Array.prototype.slice.call(linksDiv.querySelectorAll('.links-row')).map(function (row) {
        return { label: row.querySelector('.lk-label').value.trim(), url: row.querySelector('.lk-url').value.trim() };
      }).filter(function (l) { return l.url; });
      api('POST', '/api/projects', {
        title: title,
        meta: document.getElementById('np-meta').value.trim(),
        description: document.getElementById('np-desc').value,
        links: links,
        images: images,
        layout: document.getElementById('np-layout').value,
        status: document.getElementById('np-status').value,
      }).then(function (res) {
        toast('Project created');
        location.hash = '#edit-project/' + res.project.slug;
      }).catch(function (err) { document.getElementById('np-err').textContent = err.message; });
    });
  }

  /* ---------- calendar ---------- */

  function renderCalendar() {
    shell('calendar', '<h2>Calendar</h2><div class="loading">loading…</div>');
    // Cache-bust: /api/events is CDN-cached for the public site (up to 5 min
    // stale-while-revalidate), which made just-saved events invisible here.
    api('GET', '/api/events?ts=' + Date.now()).then(function (res) {
      var events = res.events;
      var html =
        '<h2>Calendar</h2>' +
        '<p class="hint">These events appear on the <a href="/Future.html" target="_blank">Future Projects</a> page. Single-day events: leave the end date empty.</p>' +
        '<div class="card" style="margin-bottom:22px">' +
        '  <h3>Add event</h3>' +
        '  <label>Title *</label><input type="text" id="ev-title">' +
        '  <div style="display:flex;gap:14px;flex-wrap:wrap">' +
        '    <div style="flex:1;min-width:150px"><label>Start date *</label><input type="date" id="ev-start"></div>' +
        '    <div style="flex:1;min-width:150px"><label>End date</label><input type="date" id="ev-end"></div>' +
        '  </div>' +
        '  <label>Link (optional)</label><input type="url" id="ev-link" placeholder="https://…">' +
        '  <br><button class="primary" id="ev-add">Add event</button> <span class="err" id="ev-err"></span>' +
        '</div>' +
        events.map(function (e) {
          var dates = e.start_date + (e.end_date && e.end_date !== e.start_date ? ' → ' + e.end_date : '');
          return '<div class="list-row" data-ev="' + e.id + '">' +
            '<div class="grow"><div class="title">' + esc(e.title) + (e.published ? '' : ' <span class="badge draft">hidden</span>') + '</div>' +
            '<div class="sub">' + esc(dates) + (e.link ? ' • <a href="' + esc(e.link) + '" target="_blank">link</a>' : '') + '</div></div>' +
            '<button class="small" data-toggle>' + (e.published ? 'Hide' : 'Show') + '</button>' +
            '<button class="small" data-editev>Edit</button>' +
            '<button class="small danger" data-delev>Delete</button>' +
            '</div>';
        }).join('');
      shell('calendar', html);

      document.getElementById('ev-add').addEventListener('click', function () {
        var title = document.getElementById('ev-title').value.trim();
        var start = document.getElementById('ev-start').value;
        if (!title || !start) { document.getElementById('ev-err').textContent = 'Title and start date are required.'; return; }
        api('POST', '/api/events', {
          title: title, start_date: start,
          end_date: document.getElementById('ev-end').value || null,
          link: document.getElementById('ev-link').value.trim() || null,
        }).then(function () { toast('Event added'); renderCalendar(); })
          .catch(function (err) { document.getElementById('ev-err').textContent = err.message; });
      });

      app.querySelectorAll('.list-row[data-ev]').forEach(function (row) {
        var id = row.getAttribute('data-ev');
        var ev = events.find(function (e) { return String(e.id) === id; });
        row.querySelector('[data-toggle]').addEventListener('click', function () {
          api('PUT', '/api/events/' + id, { published: !ev.published })
            .then(function () { renderCalendar(); }).catch(function (err) { toast(err.message, true); });
        });
        row.querySelector('[data-delev]').addEventListener('click', function () {
          if (!confirm('Delete “' + ev.title + '”? You can restore it from History.')) return;
          api('DELETE', '/api/events/' + id)
            .then(function () { toast('Deleted — restorable from History'); renderCalendar(); })
            .catch(function (err) { toast(err.message, true); });
        });
        row.querySelector('[data-editev]').addEventListener('click', function () {
          var m = modal(
            '<h3>Edit event</h3>' +
            '<label>Title</label><input type="text" id="ee-title" value="' + esc(ev.title) + '">' +
            '<div style="display:flex;gap:14px"><div style="flex:1"><label>Start</label><input type="date" id="ee-start" value="' + esc(ev.start_date) + '"></div>' +
            '<div style="flex:1"><label>End</label><input type="date" id="ee-end" value="' + esc(ev.end_date || '') + '"></div></div>' +
            '<label>Link</label><input type="url" id="ee-link" value="' + esc(ev.link || '') + '">' +
            '<div class="actions"><button id="ee-cancel">Cancel</button><button class="primary" id="ee-save">Save</button></div>');
          m.querySelector('#ee-cancel').addEventListener('click', function () { m.remove(); });
          m.querySelector('#ee-save').addEventListener('click', function () {
            api('PUT', '/api/events/' + id, {
              title: m.querySelector('#ee-title').value.trim(),
              start_date: m.querySelector('#ee-start').value,
              end_date: m.querySelector('#ee-end').value || null,
              link: m.querySelector('#ee-link').value.trim() || null,
            }).then(function () { m.remove(); toast('Saved'); renderCalendar(); })
              .catch(function (err) { toast(err.message, true); });
          });
        });
      });
    }).catch(function (err) { toast(err.message, true); });
  }

  /* ---------- history / undo ---------- */

  function entityLabel(v) {
    if (v.entity_type === 'content') return 'Content: ' + v.entity_key;
    if (v.entity_type === 'project') return 'Project: ' + (v.snapshot && v.snapshot.title ? v.snapshot.title : v.entity_key);
    if (v.entity_type === 'event') return 'Event: ' + (v.snapshot && v.snapshot.title ? v.snapshot.title : '#' + v.entity_key);
    if (v.entity_type === 'projects-order') return 'Past grid order';
    return v.entity_type + ': ' + v.entity_key;
  }

  function actionLabel(a) {
    return { create: 'created', update: 'edited', delete: 'deleted', restore: 'restored' }[a] || a;
  }

  function renderHistory(typeFilter, keyFilter) {
    shell('history', '<h2>History</h2><div class="loading">loading…</div>');
    var q = [];
    if (typeFilter) q.push('type=' + encodeURIComponent(typeFilter));
    if (keyFilter) q.push('key=' + encodeURIComponent(keyFilter));
    api('GET', '/api/versions?limit=150' + (q.length ? '&' + q.join('&') : '')).then(function (res) {
      var html =
        '<h2>History</h2>' +
        '<p class="hint">Every save is recorded here. “Restore” brings back that version of the item (the restore itself is also recorded, so nothing is ever lost).</p>' +
        '<p style="margin-bottom:16px">' +
        '<select id="hi-filter" style="width:auto">' +
        '<option value="">Everything</option>' +
        '<option value="content"' + (typeFilter === 'content' ? ' selected' : '') + '>Page content</option>' +
        '<option value="project"' + (typeFilter === 'project' ? ' selected' : '') + '>Projects</option>' +
        '<option value="event"' + (typeFilter === 'event' ? ' selected' : '') + '>Calendar events</option>' +
        '</select>' +
        (keyFilter ? ' <span class="badge past">' + esc(keyFilter) + '</span> <a href="#history' + (typeFilter ? '/' + typeFilter : '') + '">clear</a>' : '') +
        '</p>' +
        (res.versions.length ? '' : '<p class="hint">Nothing here yet — edits will appear as soon as someone saves a change.</p>') +
        res.versions.map(function (v) {
          return '<div class="hist-row">' +
            '<span class="when">' + fmtDate(v.created_at) + '</span>' +
            '<span class="what">' + esc(entityLabel(v)) + ' <span class="badge">' + esc(actionLabel(v.action)) + '</span></span>' +
            '<span class="who">' + esc(v.author || '') + '</span>' +
            '<button class="small" data-prev="' + v.id + '">Preview</button>' +
            '<button class="small primary" data-restore="' + v.id + '">Restore</button>' +
            '</div>';
        }).join('');
      shell('history', html);

      document.getElementById('hi-filter').addEventListener('change', function (e) {
        location.hash = '#history' + (e.target.value ? '/' + e.target.value : '');
        if (location.hash === '#history' + (typeFilter ? '/' + typeFilter : '')) route();
      });

      app.querySelectorAll('[data-prev]').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = res.versions.find(function (x) { return String(x.id) === b.getAttribute('data-prev'); });
          previewModal(v);
        });
      });
      app.querySelectorAll('[data-restore]').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = res.versions.find(function (x) { return String(x.id) === b.getAttribute('data-restore'); });
          if (!confirm('Restore this version of “' + entityLabel(v) + '” from ' + fmtDate(v.created_at) + '?')) return;
          api('POST', '/api/versions/' + v.id + '/restore')
            .then(function () { toast('Restored ✓'); route(); })
            .catch(function (err) { toast(err.message, true); });
        });
      });
    }).catch(function (err) { toast(err.message, true); });
  }

  function previewModal(v) {
    var s = v.snapshot || {};
    var inner = '';
    if (v.entity_type === 'content') {
      inner = s.kind === 'image'
        ? '<div class="preview-box"><img src="' + esc(s.value) + '"></div>'
        : '<div class="preview-box">' + s.value + '</div>';
    } else if (v.entity_type === 'project') {
      inner = '<p class="hint">' + esc(s.title) + ' — /projects/' + esc(s.slug) + '.html — ' + esc(s.status) + '</p>' +
        '<div class="preview-box">' + (s.body_html || '<i>(no page content)</i>') + '</div>';
    } else if (v.entity_type === 'event') {
      inner = '<div class="preview-box"><p><b>' + esc(s.title) + '</b></p>' +
        '<p>' + esc(s.start_date) + (s.end_date ? ' → ' + esc(s.end_date) : '') + '</p>' +
        (s.link ? '<p><a href="' + esc(s.link) + '" target="_blank">' + esc(s.link) + '</a></p>' : '') +
        '<p>' + (s.published ? 'visible' : 'hidden') + '</p></div>';
    } else {
      inner = '<div class="preview-box"><pre>' + esc(JSON.stringify(s, null, 2)) + '</pre></div>';
    }
    var m = modal('<h3>' + esc(entityLabel(v)) + ' — ' + esc(fmtDate(v.created_at)) + '</h3>' + inner +
      '<div class="actions"><button id="pv-close">Close</button></div>');
    m.querySelector('#pv-close').addEventListener('click', function () { m.remove(); });
  }

  /* ---------- boot ---------- */

  api('GET', '/api/auth/me').then(function (m) {
    me = m;
    route();
  }).catch(function () {
    renderLogin();
  });
})();
