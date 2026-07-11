/* In-page visual editor. Injected by the page renderer when ?cmsedit=1 and logged in. */
(function () {
  'use strict';

  var body = document.body;
  var scope = body.getAttribute('data-cms-scope'); // 'page' | 'project'
  var pageName = body.getAttribute('data-cms-page');
  var projectSlug = body.getAttribute('data-cms-slug');
  var dirty = {}; // key -> true
  var lastBlock = null;

  /* ---------- bottom bar ---------- */

  var bar = document.createElement('div');
  bar.className = 'cms-bar';
  bar.innerHTML =
    '<span class="cms-status"></span>' +
    '<button type="button" class="cms-dup">Duplicate block</button>' +
    '<button type="button" class="cms-delblock">Delete block</button>' +
    '<button type="button" class="cms-discard">Discard</button>' +
    '<button type="button" class="cms-primary cms-save">Save changes</button>' +
    '<button type="button" class="cms-exit">Done</button>';
  document.body.appendChild(bar);

  var statusEl = bar.querySelector('.cms-status');
  var saveBtn = bar.querySelector('.cms-save');
  var discardBtn = bar.querySelector('.cms-discard');
  var exitBtn = bar.querySelector('.cms-exit');
  var dupBtn = bar.querySelector('.cms-dup');
  var delBlockBtn = bar.querySelector('.cms-delblock');

  function refreshBar() {
    var n = Object.keys(dirty).length;
    var label = scope === 'project' ? 'project: ' + projectSlug : 'page: ' + (pageName || '');
    statusEl.textContent = 'EDITING ' + label + (n ? ' — ' + n + ' unsaved region' + (n > 1 ? 's' : '') : ' — click any text or image');
    saveBtn.disabled = !n;
    discardBtn.disabled = !n;
    var blockOk = !!lastBlock;
    dupBtn.disabled = !blockOk;
    delBlockBtn.disabled = !blockOk;
  }

  function toast(msg, isErr) {
    var t = document.createElement('div');
    t.className = 'cms-toast' + (isErr ? ' cms-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- editable regions ---------- */

  var regions = Array.prototype.slice.call(document.querySelectorAll('[data-cms]'));

  regions.forEach(function (region) {
    if (region.getAttribute('data-cms-type') === 'image') return; // handled via image toolbar
    region.setAttribute('contenteditable', 'true');
    region.setAttribute('spellcheck', 'false');
    region.addEventListener('input', function () {
      dirty[region.getAttribute('data-cms')] = true;
      refreshBar();
    });
    region.addEventListener('focus', function () { region.classList.add('cms-editing'); });
    region.addEventListener('blur', function () { region.classList.remove('cms-editing'); });
  });

  // Track "current block" (direct child of a region) for duplicate/delete
  document.addEventListener('click', function (e) {
    var region = e.target.closest ? e.target.closest('[data-cms]') : null;
    if (region && region.getAttribute('data-cms-type') !== 'image') {
      var node = e.target;
      while (node && node.parentElement !== region) node = node.parentElement;
      lastBlock = node && node.nodeType === 1 ? node : null;
    } else {
      lastBlock = null;
    }
    refreshBar();
  }, true);

  // Block link navigation while editing
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a && a.closest('[data-cms]')) e.preventDefault();
  });

  dupBtn.addEventListener('click', function () {
    if (!lastBlock) return;
    var clone = lastBlock.cloneNode(true);
    lastBlock.parentElement.insertBefore(clone, lastBlock.nextSibling);
    markRegionDirty(lastBlock);
  });
  delBlockBtn.addEventListener('click', function () {
    if (!lastBlock) return;
    var region = lastBlock.closest('[data-cms]');
    lastBlock.remove();
    lastBlock = null;
    if (region) { dirty[region.getAttribute('data-cms')] = true; }
    refreshBar();
  });

  function markRegionDirty(node) {
    var region = node.closest('[data-cms]');
    if (region) dirty[region.getAttribute('data-cms')] = true;
    refreshBar();
  }

  /* ---------- image toolbar ---------- */

  var imgbar = document.createElement('div');
  imgbar.className = 'cms-imgbar';
  imgbar.style.display = 'none';
  document.body.appendChild(imgbar);
  var currentImg = null;

  function isEditableImg(img) {
    return img.closest('[data-cms]') != null && !img.closest('.cms-bar');
  }

  function showImgbar(img) {
    currentImg = img;
    var inGallery = !!img.closest('.project-gallery');
    var standalone = img.hasAttribute('data-cms');
    imgbar.innerHTML = '<button type="button" data-act="replace">Replace image</button>' +
      (!standalone ? '<button type="button" data-act="add">+ Add image after</button>' : '') +
      (!standalone || inGallery ? '<button type="button" data-act="remove">Remove</button>' : '');
    var r = img.getBoundingClientRect();
    imgbar.style.display = 'flex';
    imgbar.style.left = Math.max(8, r.left + window.scrollX + 8) + 'px';
    imgbar.style.top = (r.top + window.scrollY + 8) + 'px';
  }

  document.addEventListener('mouseover', function (e) {
    if (e.target.tagName === 'IMG' && isEditableImg(e.target)) showImgbar(e.target);
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.tagName === 'IMG' && e.relatedTarget && !imgbar.contains(e.relatedTarget)) {
      // keep bar until pointer leaves both image and bar
    }
  });
  document.addEventListener('click', function (e) {
    if (!imgbar.contains(e.target) && e.target.tagName !== 'IMG') imgbar.style.display = 'none';
  });

  imgbar.addEventListener('click', function (e) {
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (!act || !currentImg) return;
    if (act === 'replace') pickImage(function (url) { setImgSrc(currentImg, url); });
    if (act === 'add') pickImage(function (url) {
      var neu = document.createElement('img');
      neu.src = url;
      neu.alt = '';
      currentImg.parentElement.insertBefore(neu, currentImg.nextSibling);
      markRegionDirty(neu);
    });
    if (act === 'remove') {
      var img = currentImg;
      imgbar.style.display = 'none';
      markRegionDirty(img);
      img.remove();
    }
  });

  function setImgSrc(img, url) {
    img.src = url;
    if (img.hasAttribute('data-cms')) {
      dirty[img.getAttribute('data-cms')] = true;
      refreshBar();
    } else {
      markRegionDirty(img);
    }
  }

  // Empty galleries have no image to hover — give them an explicit add button.
  Array.prototype.slice.call(document.querySelectorAll('[data-cms] .project-gallery')).forEach(function (gal) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cms-addimg';
    btn.textContent = '+ Add image';
    btn.setAttribute('contenteditable', 'false');
    btn.style.cssText = 'grid-column:1/-1;padding:14px;border:1px dashed #42f5bc;border-radius:8px;background:none;color:#42f5bc;cursor:pointer;font-family:inherit;';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      pickImage(function (url) {
        var neu = document.createElement('img');
        neu.src = url;
        neu.alt = '';
        gal.insertBefore(neu, btn);
        markRegionDirty(gal);
      });
    });
    gal.appendChild(btn);
  });

  /* ---------- image upload (client-side downscale, then POST) ---------- */

  function pickImage(cb) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      toast('Uploading image…');
      compressImage(file).then(function (payload) {
        return fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (r) { return r.json(); });
      }).then(function (res) {
        if (res && res.url) { cb(res.url); toast('Image uploaded'); }
        else throw new Error((res && res.error) || 'Upload failed');
      }).catch(function (err) {
        toast(err.message || 'Upload failed', true);
      });
    };
    input.click();
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

  function fileToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /* ---------- save ---------- */

  function cleanRegionHtml(region) {
    var clone = region.cloneNode(true);
    clone.removeAttribute('contenteditable');
    clone.removeAttribute('spellcheck');
    clone.classList.remove('cms-editing');
    Array.prototype.slice.call(clone.querySelectorAll('[contenteditable]')).forEach(function (n) {
      n.removeAttribute('contenteditable');
    });
    Array.prototype.slice.call(clone.querySelectorAll('.cms-bar, .cms-imgbar, .cms-toast, .cms-addimg')).forEach(function (n) {
      n.remove();
    });
    return clone.innerHTML;
  }

  saveBtn.addEventListener('click', function () {
    var keys = Object.keys(dirty);
    if (!keys.length) return;
    saveBtn.disabled = true;
    statusEl.textContent = 'Saving…';

    var done = function () {
      dirty = {};
      toast('Saved ✓');
      setTimeout(function () { location.reload(); }, 500);
    };
    var fail = function (err) {
      toast((err && err.message) || 'Save failed', true);
      refreshBar();
    };

    if (scope === 'project') {
      var main = document.querySelector('[data-cms="project.body"]');
      var globalChanges = collectContentChanges(keys.filter(function (k) { return k !== 'project.body'; }));
      var reqs = [];
      if (dirty['project.body'] && main) {
        reqs.push(fetch('/api/projects/' + encodeURIComponent(projectSlug), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body_html: cleanRegionHtml(main) }),
        }));
      }
      if (globalChanges.length) {
        reqs.push(fetch('/api/content/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: globalChanges }),
        }));
      }
      Promise.all(reqs).then(function (rs) {
        if (rs.some(function (r) { return !r.ok; })) throw new Error('Save failed');
        done();
      }).catch(fail);
    } else {
      var changes = collectContentChanges(keys);
      fetch('/api/content/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: changes }),
      }).then(function (r) {
        if (!r.ok) throw new Error('Save failed');
        done();
      }).catch(fail);
    }
  });

  function collectContentChanges(keys) {
    return keys.map(function (key) {
      var el = document.querySelector('[data-cms="' + key + '"]');
      if (!el) return null;
      if (el.getAttribute('data-cms-type') === 'image') {
        return { key: key, kind: 'image', value: el.getAttribute('src') };
      }
      return { key: key, kind: 'html', value: cleanRegionHtml(el) };
    }).filter(Boolean);
  }

  discardBtn.addEventListener('click', function () { location.reload(); });
  exitBtn.addEventListener('click', function () {
    if (Object.keys(dirty).length && !confirm('You have unsaved changes. Leave anyway?')) return;
    if (window.parent !== window) {
      window.parent.postMessage({ cms: 'exit' }, '*');
    } else {
      location.href = '/admin/';
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; }
  });

  refreshBar();
})();
