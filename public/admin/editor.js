/* In-page visual editor. Injected by the page renderer when ?cmsedit=1 and logged in. */
(function () {
  'use strict';

  var body = document.body;
  var scope = body.getAttribute('data-cms-scope'); // 'page' | 'project'
  var pageName = body.getAttribute('data-cms-page');
  var projectSlug = body.getAttribute('data-cms-slug');
  var dirty = {}; // key -> true
  var lastRegion = null;
  var lastBlock = null;
  var lastTextBlock = null;
  var savedRange = null;

  /* ---------- bottom bar ---------- */

  var bar = document.createElement('div');
  bar.className = 'cms-bar';
  bar.innerHTML =
    '<span class="cms-status"></span>' +
    '<select class="cms-blockstyle" aria-label="Text style" title="Text style">' +
      '<option value="">Text style</option><option value="p">Paragraph</option>' +
      '<option value="h1">Heading 1</option><option value="h2">Heading 2</option>' +
      '<option value="h3">Heading 3</option><option value="blockquote">Quote</option>' +
    '</select>' +
    '<button type="button" class="cms-bold" aria-label="Bold" title="Bold"><strong>B</strong></button>' +
    '<button type="button" class="cms-italic" aria-label="Italic" title="Italic"><em>I</em></button>' +
    '<button type="button" class="cms-underline" aria-label="Underline" title="Underline"><u>U</u></button>' +
    '<select class="cms-align" aria-label="Text alignment" title="Text alignment">' +
      '<option value="">Align</option><option value="left">Left</option>' +
      '<option value="center">Center</option><option value="right">Right</option>' +
    '</select>' +
    '<button type="button" class="cms-addimage">+ Image</button>' +
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
  var addImageBtn = bar.querySelector('.cms-addimage');
  var blockStyleSelect = bar.querySelector('.cms-blockstyle');
  var alignSelect = bar.querySelector('.cms-align');
  var boldBtn = bar.querySelector('.cms-bold');
  var italicBtn = bar.querySelector('.cms-italic');
  var underlineBtn = bar.querySelector('.cms-underline');

  var textControls = [blockStyleSelect, alignSelect, boldBtn, italicBtn, underlineBtn];

  function refreshBar() {
    var n = Object.keys(dirty).length;
    var label = scope === 'project' ? 'project: ' + projectSlug : 'page: ' + (pageName || '');
    statusEl.textContent = 'EDITING ' + label + (n ? ' — ' + n + ' unsaved region' + (n > 1 ? 's' : '') : ' — click any text or image');
    saveBtn.disabled = !n;
    discardBtn.disabled = !n;
    var blockOk = !!lastBlock;
    dupBtn.disabled = !blockOk;
    delBlockBtn.disabled = !blockOk;
    addImageBtn.disabled = !lastRegion || lastRegion.getAttribute('data-cms-type') === 'image';
    textControls.forEach(function (control) { control.disabled = !lastTextBlock; });
    if (lastTextBlock) {
      var tag = lastTextBlock.tagName.toLowerCase();
      blockStyleSelect.value = ['p', 'h1', 'h2', 'h3', 'blockquote'].indexOf(tag) >= 0 ? tag : '';
      alignSelect.value = lastTextBlock.style.textAlign || '';
    } else {
      blockStyleSelect.value = '';
      alignSelect.value = '';
    }
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
    region.addEventListener('focus', function () { region.classList.add('cms-editing'); });
    region.addEventListener('blur', function () { region.classList.remove('cms-editing'); });
  });

  // Delegation keeps change tracking working when a paragraph is converted to
  // a heading or quote and the original element is replaced.
  document.addEventListener('input', function (e) {
    var region = e.target.closest ? e.target.closest('[data-cms]') : null;
    if (!region || region.getAttribute('data-cms-type') === 'image') return;
    dirty[region.getAttribute('data-cms')] = true;
    refreshBar();
  });

  function elementForNode(node) {
    return node && (node.nodeType === 1 ? node : node.parentElement);
  }

  function findTextBlock(node, region) {
    var el = elementForNode(node);
    var block = el && el.closest ? el.closest('p,h1,h2,h3,h4,h5,h6,blockquote') : null;
    return block && (block === region || region.contains(block)) ? block : null;
  }

  function findEditableBlock(node, region) {
    var el = elementForNode(node);
    var semantic = el && el.closest ? el.closest('figure,img,p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,table,section') : null;
    if (semantic && semantic !== region && region.contains(semantic)) return semantic;
    while (el && el.parentElement !== region) el = el.parentElement;
    return el && el !== region && el.nodeType === 1 ? el : null;
  }

  document.addEventListener('selectionchange', function () {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    var range = selection.getRangeAt(0);
    var el = elementForNode(range.commonAncestorContainer);
    var region = el && el.closest ? el.closest('[data-cms]') : null;
    if (!region || region.getAttribute('data-cms-type') === 'image') return;
    savedRange = range.cloneRange();
    lastRegion = region;
    lastTextBlock = findTextBlock(range.startContainer, region) || lastTextBlock;
    refreshBar();
  });

  // Track "current block" (direct child of a region) for duplicate/delete
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.cms-bar,.cms-imgbar,.cms-toast,.cms-addimg')) return;
    var region = e.target.closest ? e.target.closest('[data-cms]') : null;
    if (region && region.getAttribute('data-cms-type') !== 'image') {
      lastRegion = region;
      lastBlock = findEditableBlock(e.target, region);
      lastTextBlock = findTextBlock(e.target, region);
    } else {
      lastRegion = null;
      lastBlock = null;
      lastTextBlock = null;
      savedRange = null;
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

  /* ---------- text formatting ---------- */

  function activeRange() {
    if (!savedRange || savedRange.collapsed || !lastTextBlock) return null;
    var start = elementForNode(savedRange.startContainer);
    var end = elementForNode(savedRange.endContainer);
    return start && end && lastTextBlock.contains(start) && lastTextBlock.contains(end) ? savedRange.cloneRange() : null;
  }

  function restoreSelection(range) {
    if (!range) return;
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
  }

  function wrapSelection(tagName, styleName, styleValue) {
    if (!lastTextBlock) return;
    var range = activeRange();
    if (range) {
      var wrapper = document.createElement(tagName);
      if (styleName) wrapper.style[styleName] = styleValue;
      try {
        range.surroundContents(wrapper);
      } catch (_) {
        var fragment = range.extractContents();
        wrapper.appendChild(fragment);
        range.insertNode(wrapper);
      }
      var selected = document.createRange();
      selected.selectNodeContents(wrapper);
      restoreSelection(selected);
    } else if (styleName) {
      if (styleValue) lastTextBlock.style[styleName] = styleValue;
      else lastTextBlock.style.removeProperty(styleName.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
    }
    markRegionDirty(lastTextBlock);
  }

  function replaceTextBlock(tagName) {
    if (!lastTextBlock || !tagName || lastTextBlock.tagName.toLowerCase() === tagName) return;
    var old = lastTextBlock;
    var region = old.closest('[data-cms]');
    var replacement = document.createElement(tagName);
    Array.prototype.slice.call(old.attributes).forEach(function (attr) {
      replacement.setAttribute(attr.name, attr.value);
    });
    while (old.firstChild) replacement.appendChild(old.firstChild);
    old.parentElement.replaceChild(replacement, old);
    lastTextBlock = replacement;
    if (lastBlock === old) lastBlock = replacement;
    if (region === old) lastRegion = replacement;
    markRegionDirty(replacement);
  }

  function toggleInline(tagName, styleName, onValue) {
    if (!lastTextBlock) return;
    if (activeRange()) return wrapSelection(tagName);
    var current = lastTextBlock.style[styleName];
    lastTextBlock.style[styleName] = current ? '' : onValue;
    markRegionDirty(lastTextBlock);
  }

  [boldBtn, italicBtn, underlineBtn].forEach(function (button) {
    button.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  blockStyleSelect.addEventListener('change', function () {
    replaceTextBlock(blockStyleSelect.value);
    refreshBar();
  });
  alignSelect.addEventListener('change', function () {
    if (!lastTextBlock || !alignSelect.value) return;
    lastTextBlock.style.textAlign = alignSelect.value;
    markRegionDirty(lastTextBlock);
  });
  boldBtn.addEventListener('click', function () { toggleInline('strong', 'fontWeight', '700'); });
  italicBtn.addEventListener('click', function () { toggleInline('em', 'fontStyle', 'italic'); });
  underlineBtn.addEventListener('click', function () { toggleInline('u', 'textDecoration', 'underline'); });

  addImageBtn.addEventListener('click', function () {
    if (!lastRegion || lastRegion.getAttribute('data-cms-type') === 'image') return;
    var region = lastRegion;
    var anchor = lastTextBlock && lastTextBlock !== region ? lastTextBlock : lastBlock;
    pickImage(function (url, filename) {
      var image = document.createElement('img');
      image.className = 'cms-image-block';
      image.src = url;
      image.alt = String(filename || '').replace(/\.[a-z0-9]+$/i, '');
      if (anchor && region.contains(anchor) && anchor.parentElement) {
        anchor.parentElement.insertBefore(image, anchor.nextSibling);
      } else {
        region.appendChild(image);
      }
      lastBlock = image;
      lastTextBlock = null;
      markRegionDirty(image);
      showImgbar(image);
    });
  });

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
    if (currentImg && currentImg !== img) currentImg.classList.remove('cms-img-selected');
    img.classList.add('cms-img-selected');
    currentImg = img;
    var inGallery = !!img.closest('.project-gallery');
    var standalone = img.hasAttribute('data-cms');
    // Standalone image slots (home hero, about portrait, …) have a fixed
    // place in the layout: replace only. Images inside free-form regions get
    // the full move/size/placement controls.
    var html = '<button type="button" data-act="replace">Replace image</button>';
    if (!standalone) {
      html +=
        '<button type="button" data-act="add">+ Add image after</button>' +
        '<button type="button" data-act="moveup" title="Move image earlier on the page">↑ Move</button>' +
        '<button type="button" data-act="movedown" title="Move image later on the page">↓ Move</button>' +
        '<select class="cms-imgsize" title="Image size">' +
          '<option value="">Size…</option><option value="default">Default</option>' +
          '<option value="25%">Small (¼ width)</option><option value="50%">Medium (½ width)</option>' +
          '<option value="75%">Large (¾ width)</option><option value="full">Full width</option>' +
        '</select>' +
        (!inGallery
          ? '<select class="cms-imgplace" title="How the image sits in the text">' +
            '<option value="">Placement…</option><option value="inline">In line with text</option>' +
            '<option value="left">Left — text wraps</option><option value="right">Right — text wraps</option>' +
            '<option value="center">Centered</option>' +
            '</select>'
          : '') +
        '<button type="button" data-act="remove">Remove</button>';
    } else if (inGallery) {
      html += '<button type="button" data-act="remove">Remove</button>';
    }
    imgbar.innerHTML = html;
    var sizeSel = imgbar.querySelector('.cms-imgsize');
    if (sizeSel) {
      var w = img.style.width;
      sizeSel.value = w === '100%' ? 'full'
        : ['25%', '50%', '75%'].indexOf(w) >= 0 ? w
        : w ? '' : 'default';
    }
    var placeSel = imgbar.querySelector('.cms-imgplace');
    if (placeSel) {
      placeSel.value = img.style.float === 'left' ? 'left'
        : img.style.float === 'right' ? 'right'
        : img.style.display === 'block' ? 'center' : 'inline';
    }
    var r = img.getBoundingClientRect();
    imgbar.style.display = 'flex';
    imgbar.style.left = Math.max(8, r.left + window.scrollX + 8) + 'px';
    imgbar.style.top = (r.top + window.scrollY + 8) + 'px';
  }

  // Move an image earlier/later in the page: past its previous/next sibling,
  // or out of its wrapping element when already at that edge.
  function moveImg(img, dir) {
    var region = img.closest('[data-cms]');
    if (!region) return;
    var sib = dir < 0 ? img.previousElementSibling : img.nextElementSibling;
    while (sib && /(^|\s)cms-/.test(sib.className || '')) {
      sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
    }
    if (sib) {
      sib.parentElement.insertBefore(img, dir < 0 ? sib : sib.nextElementSibling);
    } else {
      var parent = img.parentElement;
      if (!parent || parent === region || !region.contains(parent)) return;
      parent.parentElement.insertBefore(img, dir < 0 ? parent : parent.nextElementSibling);
    }
    markRegionDirty(img);
    showImgbar(img);
  }

  function tidyImgStyle(img) {
    if (!img.getAttribute('style')) img.removeAttribute('style');
    markRegionDirty(img);
    showImgbar(img);
  }

  function setImgSize(img, val) {
    if (!val) {
      img.style.removeProperty('width');
      img.style.removeProperty('grid-column');
    } else if (val === 'full') {
      img.style.width = '100%';
      // In the two-column project gallery "full" means the whole row.
      if (img.closest('.project-gallery')) img.style.gridColumn = '1 / -1';
    } else {
      img.style.width = val;
      img.style.removeProperty('grid-column');
    }
    tidyImgStyle(img);
  }

  function setImgPlace(img, val) {
    ['float', 'display', 'margin', 'margin-left', 'margin-right', 'margin-bottom'].forEach(function (prop) {
      img.style.removeProperty(prop);
    });
    if (val === 'left' || val === 'right') {
      img.style.float = val;
      img.style[val === 'left' ? 'marginRight' : 'marginLeft'] = '16px';
      img.style.marginBottom = '8px';
      if (!img.style.width) img.style.width = '50%';
    } else if (val === 'center') {
      img.style.display = 'block';
      img.style.margin = '16px auto';
    }
    tidyImgStyle(img);
  }

  // Click an image to select it. (Hover selection proved unsafe: moving an
  // image shifts the layout, a different image slides under the stationary
  // pointer, and the toolbar silently retargets it.)
  function hideImgbar() {
    imgbar.style.display = 'none';
    if (currentImg) currentImg.classList.remove('cms-img-selected');
    currentImg = null;
  }
  document.addEventListener('click', function (e) {
    // Toolbar buttons are rebuilt mid-click by showImgbar; their detached
    // targets would otherwise read as "outside" and deselect the image.
    if (!e.target.isConnected) return;
    if (e.target.tagName === 'IMG' && isEditableImg(e.target)) return showImgbar(e.target);
    if (!imgbar.contains(e.target)) hideImgbar();
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
    if (act === 'moveup') moveImg(currentImg, -1);
    if (act === 'movedown') moveImg(currentImg, 1);
    if (act === 'remove') {
      var img = currentImg;
      hideImgbar();
      markRegionDirty(img);
      img.remove();
    }
  });

  imgbar.addEventListener('change', function (e) {
    if (!currentImg) return;
    if (e.target.className === 'cms-imgsize' && e.target.value) {
      setImgSize(currentImg, e.target.value === 'default' ? '' : e.target.value);
    }
    if (e.target.className === 'cms-imgplace' && e.target.value) {
      setImgPlace(currentImg, e.target.value);
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
        if (res && res.url) { cb(res.url, file.name); toast('Image uploaded'); }
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
    Array.prototype.slice.call(clone.querySelectorAll('.cms-img-selected')).forEach(function (n) {
      n.classList.remove('cms-img-selected');
      if (!n.getAttribute('class')) n.removeAttribute('class');
    });
    // The site's fonts are fixed (Melodrama headers, Aktiv Grotesk/Roboto
    // body) — strip any custom font that snuck in via paste or old edits.
    Array.prototype.slice.call(clone.querySelectorAll('[style]')).forEach(function (n) {
      n.style.removeProperty('font-family');
      if (!n.getAttribute('style')) n.removeAttribute('style');
    });
    Array.prototype.slice.call(clone.querySelectorAll('font')).forEach(function (n) {
      var parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
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

  discardBtn.addEventListener('click', function () {
    dirty = {};
    location.reload();
  });
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
