/* OPD MO Guide — app shell. Content lives in content/; this file never holds clinical text. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('opd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('opd.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  var book = null;          // chapters.json
  var chapters = {};        // id -> { meta, sections: [{n, title, html, plain, subs:[{id,title,plain}]}] }
  var index = [];           // search entries
  var view = document.getElementById('view');
  var barTitle = document.getElementById('barTitle');
  var backBtn = document.getElementById('backBtn');
  var lastQuery = '';

  var ICON_CHEV = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var ICON_TW = '<svg class="tw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 4h12v16l-6-4-6 4z"/></svg>';
  var ICON_STAR_ON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 4h12v16l-6-4-6 4z"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ---------- Settings ---------- */
  function applySettings() {
    var fs = store.get('fs', 16), th = store.get('theme', 'system');
    document.documentElement.style.setProperty('--fs', fs + 'px');
    if (th === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    document.querySelectorAll('#fsSeg button').forEach(function (b) { b.classList.toggle('on', +b.dataset.fs === fs); });
    document.querySelectorAll('#thSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.th === th); });
  }
  document.getElementById('fsSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { store.set('fs', +b.dataset.fs); applySettings(); } });
  document.getElementById('thSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { store.set('theme', b.dataset.th); applySettings(); } });
  var sheet = document.getElementById('sheetWrap');
  document.getElementById('setBtn').addEventListener('click', function () { sheet.hidden = false; });
  document.getElementById('sheetBg').addEventListener('click', function () { sheet.hidden = true; });
  backBtn.addEventListener('click', function () { if (history.length > 1) history.back(); else location.hash = ''; });
  applySettings();

  /* ---------- Content loading ---------- */
  // Evidence tags like [ADA R9.6] or [Label] become small chips. Markdown links [text](url) are left alone.
  function tagEvidence(md) {
    return md.replace(/\[([A-Z][^\]\n]{0,60})\](?!\()/g, function (m, inner) { return '<span class="ev">' + esc(inner) + '</span>'; });
  }

  function buildChapter(meta, md) {
    var html = marked.parse(tagEvidence(md), { gfm: true, breaks: false });
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var sections = [];
    var cur = { n: '0', title: 'About this chapter', nodes: [] };
    Array.prototype.slice.call(tmp.childNodes).forEach(function (node) {
      if (node.nodeName === 'H2') {
        var t = node.textContent.trim();
        var m = t.match(/^(\d+)\.\s*(.*)$/);
        if (!m && cur.n === '0') { cur.nodes.push(node); return; }
        if (cur.nodes.length) sections.push(cur);
        cur = m ? { n: m[1], title: m[2], nodes: [] } : { n: 'x' + sections.length, title: t, nodes: [] };
      } else cur.nodes.push(node);
    });
    if (cur.nodes.length) sections.push(cur);

    sections.forEach(function (s) {
      var box = document.createElement('div');
      s.nodes.forEach(function (n) {
        if (n.nodeName === 'TABLE') { var w = document.createElement('div'); w.className = 'tbl'; w.appendChild(n); box.appendChild(w); }
        else if (n.nodeName === 'H2') { var h = document.createElement('h3'); h.textContent = n.textContent; box.appendChild(h); }
        else box.appendChild(n);
      });
      s.subs = [];
      box.querySelectorAll('h3').forEach(function (h, i) {
        h.id = meta.id + '-s' + s.n + '-' + (i + 1);
        if (/emergency|red flag|transfer now/i.test(h.textContent)) h.classList.add('flag');
      });
      // Keep verification flags visible: "not re-verified", "local availability not verified" and similar.
      var unv = /(not re-verified|local (?:availability|strength) not verified|not verified)/gi, tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), tn = [];
      while (tw.nextNode()) tn.push(tw.currentNode);
      tn.forEach(function (n) {
        if (!unv.test(n.nodeValue)) return; unv.lastIndex = 0;
        var sp = document.createElement('span'); sp.innerHTML = esc(n.nodeValue).replace(unv, '<span class="unv">$1</span>');
        n.parentNode.replaceChild(sp, n);
      });
      // Contraindication matrix legend words get a colour band.
      box.querySelectorAll('td').forEach(function (td) {
        var m = td.textContent.trim().match(/^(Preferred|Acceptable|Caution|Hold|Avoid)\b/);
        if (m) td.classList.add('rx', 'rx-' + m[1].toLowerCase());
      });
      // A paragraph that opens with a bold emergency label is shown in red.
      box.querySelectorAll('p').forEach(function (p) {
        var b = p.firstChild;
        if (b && b.nodeName === 'STRONG' && /emergency|same[- ]day hospital|transfer now/i.test(b.textContent)) p.classList.add('flag-p');
      });
      s.html = box.innerHTML;
      // Search chunks: the section intro, then each h3 with the content under it.
      var chunk = { id: null, title: s.title, text: '' };
      Array.prototype.slice.call(box.childNodes).forEach(function (n) {
        if (n.nodeName === 'H3') { s.subs.push(chunk); chunk = { id: n.id, title: n.textContent, text: '' }; }
        else chunk.text += ' ' + (n.textContent || '');
      });
      s.subs.push(chunk);
      delete s.nodes;
    });
    chapters[meta.id] = { meta: meta, sections: sections };

    sections.forEach(function (s) {
      s.subs.forEach(function (c) {
        var text = c.text.replace(/\s+/g, ' ').trim();
        if (!text && !c.id) return;
        index.push({ ch: meta.id, sec: s.n, secTitle: s.title, id: c.id, title: c.title, text: text, low: (c.title + ' ' + text).toLowerCase(), lowTitle: c.title.toLowerCase() });
      });
    });
  }

  function load() {
    // Secure build: secure/auth.js signs the user in and hands over chapters only after approval.
    var src = window.OPDAuth ? window.OPDAuth.load() :
      fetch('content/chapters.json').then(function (r) { return r.json(); }).then(function (b) {
        var md = {};
        return Promise.all(b.chapters.map(function (c) {
          return fetch('content/' + c.file).then(function (r) { return r.text(); }).then(function (t) { md[c.id] = t; });
        })).then(function () { return { book: b, md: md }; });
      });
    return src.then(function (res) {
      book = res.book; chapters = {}; index = [];
      document.getElementById('aboutText').textContent = (window.OPDAuth ? '' : 'Prototype build. ') + book.chapters.length + ' chapters. Drafts are under review and are not yet approved for clinical use.';
      book.chapters.forEach(function (c) { if (res.md[c.id] != null) buildChapter(c, res.md[c.id]); });
      book.chapters = book.chapters.filter(function (c) { return chapters[c.id]; });
    });
  }

  /* ---------- Views ---------- */
  function setBar(title, sub, showBack) {
    barTitle.innerHTML = esc(title) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '');
    backBtn.hidden = !showBack;
  }
  function setTab(t) { document.querySelectorAll('.tab').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === t); }); }

  function statusPill(m) {
    return m.status === 'approved' ? '<span class="pill approved">Approved ' + esc(m.version) + '</span>' : '<span class="pill draft">Draft ' + esc(m.version) + '</span>';
  }

  function renderHome() {
    setBar(book.bookTitle, book.bookSubtitle, false); setTab('home');
    var h = '<div class="searchbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
      '<input id="homeSearch" type="search" placeholder="Search drugs, doses, red flags…" autocomplete="off"></div>';
    book.groups.forEach(function (g) {
      var list = book.chapters.filter(function (c) { return c.group === g.id; });
      if (!list.length) return;
      h += '<div class="eyebrow">' + esc(g.title) + '</div><div class="ch-list">';
      list.forEach(function (c) {
        h += '<a class="ch-row" href="#' + c.id + '"><span class="ch-code">' + esc(c.short) + '</span><span class="ch-meta"><span class="ch-title">' + esc(c.title) +
          '</span><br><span class="ch-sub">' + statusPill(c) + ' &nbsp;Evidence checked ' + fmtDate(c.checked) + '</span></span>' + ICON_CHEV + '</a>';
      });
      h += '</div>';
    });
    h += '<p class="coming">More chapters are added as each one is written and reviewed.</p>';
    view.innerHTML = h;
    var inp = document.getElementById('homeSearch');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && inp.value.trim()) { lastQuery = inp.value.trim(); location.hash = 'search'; } });
    inp.addEventListener('focus', function () { if (window.matchMedia('(max-width: 700px)').matches) { lastQuery = inp.value; location.hash = 'search'; } });
  }

  function renderChapter(id, secN, anchor, terms) {
    var ch = chapters[id]; if (!ch) return renderHome();
    var m = ch.meta, labels = book.sectionLabels || {};
    setBar(m.title, statusPill(m).replace(/<[^>]+>/g, '') + ' · checked ' + fmtDate(m.checked), true); setTab('home');
    var saved = store.get('saved', []);
    var h = '<div class="ch-head"><h2>' + esc(m.title) + '</h2>';
    if (m.status !== 'approved') h += '<div class="draft-note"><span><b>Draft for review.</b> Not yet approved for clinical use. Doses and brands are being verified.</span></div>';
    h += '</div><nav class="chips" id="chips">';
    ch.sections.forEach(function (s) {
      if (!/^\d+$/.test(s.n) || s.n === '0') return;
      h += '<button class="chip" data-sec="' + s.n + '"><span class="n">' + s.n + '</span>' + esc(labels[s.n] || s.title) + '</button>';
    });
    h += '</nav>';
    ch.sections.forEach(function (s) {
      var key = id + ':' + s.n, on = saved.indexOf(key) >= 0;
      var open = (secN ? s.n === secN : s.n === '1');
      h += '<details class="sec" id="' + id + '-s' + s.n + '"' + (open ? ' open' : '') + '><summary><span class="sec-n">' + (/^\d+$/.test(s.n) && s.n !== '0' ? s.n : 'i') + '</span>' +
        '<span class="sec-t">' + esc(s.title) + '</span><button class="star' + (on ? ' on' : '') + '" data-key="' + key + '" aria-label="' + (on ? 'Remove from saved' : 'Save section') + '">' + (on ? ICON_STAR_ON : ICON_STAR) + '</button>' + ICON_TW + '</summary>' +
        '<div class="sec-body prose">' + s.html + '</div></details>';
    });
    if (m.sourceDoc) h += '<p class="src-link">Master copy of this chapter: <a href="' + esc(m.sourceDoc) + '" target="_blank" rel="noopener">chapter document</a></p>';
    view.innerHTML = h;

    view.querySelector('#chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      var d = document.getElementById(id + '-s' + b.dataset.sec); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    view.querySelectorAll('.star').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var list = store.get('saved', []), k = b.dataset.key, i = list.indexOf(k);
        if (i >= 0) list.splice(i, 1); else list.push(k);
        store.set('saved', list);
        var on = i < 0; b.classList.toggle('on', on); b.innerHTML = on ? ICON_STAR_ON : ICON_STAR; b.setAttribute('aria-label', on ? 'Remove from saved' : 'Save section');
      });
    });
    // Highlight the chip of the section on screen.
    var chips = view.querySelectorAll('.chip');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          var n = en.target.id.split('-s').pop();
          chips.forEach(function (c) { var on = c.dataset.sec === n; c.classList.toggle('on', on); if (on) c.scrollIntoView({ block: 'nearest', inline: 'center' }); });
        });
      }, { rootMargin: '-130px 0px -60% 0px' });
      view.querySelectorAll('.sec').forEach(function (s) { io.observe(s); });
    }

    if (terms && terms.length) highlight(document.getElementById(id + '-s' + secN), terms);
    var target = anchor ? document.getElementById(anchor) : (secN ? document.getElementById(id + '-s' + secN) : null);
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 30);
    else window.scrollTo(0, 0);
  }

  function highlight(root, terms) {
    if (!root) return;
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    var walker = document.createTreeWalker(root.querySelector('.sec-body') || root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!re.test(n.nodeValue)) return; re.lastIndex = 0;
      var span = document.createElement('span'); span.innerHTML = esc(n.nodeValue).replace(re, '<mark>$1</mark>');
      n.parentNode.replaceChild(span, n);
    });
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 1; });
    if (!terms.length) return { terms: [], hits: [] };
    var hits = [];
    index.forEach(function (e) {
      if (!terms.every(function (t) { return e.low.indexOf(t) >= 0; })) return;
      var score = 0;
      terms.forEach(function (t) { if (e.lowTitle.indexOf(t) >= 0) score += 5; score += Math.min(5, e.low.split(t).length - 1); });
      var meta = chapters[e.ch].meta;
      if ((meta.keywords || []).some(function (k) { return terms.indexOf(k.toLowerCase()) >= 0; })) score += 2;
      hits.push({ e: e, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return { terms: terms, hits: hits.slice(0, 40) };
  }

  function snippet(text, terms) {
    var low = text.toLowerCase(), at = -1;
    terms.forEach(function (t) { var i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
    var start = Math.max(0, at - 60), s = (start ? '…' : '') + text.slice(start, start + 180) + (start + 180 < text.length ? '…' : '');
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    return esc(s).replace(re, '<mark>$1</mark>');
  }

  function renderSearch() {
    setBar('Search', 'All chapters', false); setTab('search');
    view.innerHTML = '<div class="searchbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
      '<input id="q" type="search" placeholder="Search drugs, doses, red flags…" autocomplete="off"></div><div class="results" id="res"></div>';
    var inp = document.getElementById('q'), res = document.getElementById('res');
    function run() {
      lastQuery = inp.value;
      var r = search(inp.value);
      if (!inp.value.trim()) {
        res.innerHTML = '<div class="hint-row">' + ['metformin', 'eGFR', 'emergency', 'Ramadan', 'potassium', 'amlodipine', 'pregnancy'].map(function (w) { return '<button class="chip" data-w="' + w + '">' + w + '</button>'; }).join('') + '</div>';
        return;
      }
      if (!r.hits.length) { res.innerHTML = '<p class="empty">Nothing found for “' + esc(inp.value) + '”. Try a generic drug name or a shorter word.</p>'; return; }
      res.innerHTML = r.hits.map(function (h) {
        var e = h.e, m = chapters[e.ch].meta, labels = book.sectionLabels || {};
        var path = m.title + (/^\d+$/.test(e.sec) && e.sec !== '0' ? ' · ' + e.sec + ' ' + (labels[e.sec] || e.secTitle) : ' · About');
        return '<a class="res" href="#' + e.ch + '-s' + e.sec + '" data-anchor="' + (e.id || '') + '"><div class="res-path">' + esc(path) + '</div>' +
          '<div class="res-h">' + esc(e.title) + '</div><div class="res-snip">' + snippet(e.text, r.terms) + '</div></a>';
      }).join('');
    }
    inp.value = lastQuery; inp.addEventListener('input', run); run();
    res.addEventListener('click', function (e) {
      var w = e.target.closest('[data-w]'); if (w) { inp.value = w.dataset.w; run(); return; }
      var a = e.target.closest('.res'); if (!a) return;
      e.preventDefault();
      pending = { anchor: a.dataset.anchor || null, terms: search(inp.value).terms };
      location.hash = a.getAttribute('href').slice(1);
    });
    setTimeout(function () { inp.focus(); }, 50);
  }

  function renderSaved() {
    setBar('Saved', 'Sections you bookmarked', false); setTab('saved');
    var list = store.get('saved', []).filter(function (k) { var p = k.split(':'); return chapters[p[0]]; });
    if (!list.length) { view.innerHTML = '<p class="empty">No saved sections yet. Tap the bookmark on any section heading to keep it here.</p>'; return; }
    var labels = book.sectionLabels || {};
    view.innerHTML = '<div class="results">' + list.map(function (k) {
      var p = k.split(':'), ch = chapters[p[0]], s = ch.sections.filter(function (x) { return x.n === p[1]; })[0];
      if (!s) return '';
      return '<a class="res" href="#' + p[0] + '-s' + p[1] + '"><div class="res-path">' + esc(ch.meta.title) + (labels[p[1]] ? ' · ' + esc(labels[p[1]]) : '') + '</div><div class="res-h">' + esc(s.title) + '</div></a>';
    }).join('') + '</div>';
  }

  /* ---------- Router: #, #search, #saved, #<chapter>, #<chapter>-s<N> ---------- */
  var pending = null;
  function route() {
    var h = location.hash.replace(/^#/, '');
    sheet.hidden = true;
    if (!book || document.body.classList.contains('gated')) return;
    if (!h) return renderHome();
    if (h === 'search') return renderSearch();
    if (h === 'saved') return renderSaved();
    if (h === 'admin' && window.OPDAuth && window.OPDAuth.isAdmin()) { setBar('Admin', 'Approve doctors and update chapters', true); setTab('admin'); return window.OPDAuth.renderAdmin(view); }
    var m = h.match(/^([a-z0-9]+?)(?:-s(\d+))?$/);
    if (m && chapters[m[1]]) {
      var p = pending; pending = null;
      return renderChapter(m[1], m[2] || null, p && p.anchor, p && p.terms);
    }
    renderHome();
  }
  window.addEventListener('hashchange', route);

  window.OPDApp = { reload: function () { return load().then(route); } };
  load().then(route).catch(function (err) {
    view.innerHTML = '<p class="empty">The chapters could not be loaded. Check your connection and reopen the app.<br><small>' + esc(err.message) + '</small></p>';
  });

  // Offline support when installed as a web app (ignored where service workers are unavailable).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* not allowed here */ }
  }
})();
