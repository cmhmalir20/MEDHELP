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


  var GROUP_ICON = {
    endocrine: '<path d="M12 3c3 4 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 3-7 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    cardio: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5 12h3l1.5-2.5 2 5 1.5-2.5H19"/>',
    resp: '<path d="M12 4v8"/><path d="M12 10c-1.5 0-2.5-1-4-1-2 0-3 3-3 7 0 2.5 1 4 3 4 2.5 0 4-2 4-5z"/><path d="M12 10c1.5 0 2.5-1 4-1 2 0 3 3 3 7 0 2.5-1 4-3 4-2.5 0-4-2-4-5z"/>',
    renal: '<path d="M8 4c-2.8 0-4 3-4 7s1.5 9 4.5 9S12 17 12 15s-2-3-2-5 2-2.5 2-4-1.5-2-4-2z"/><path d="M16 4c2.8 0 4 3 4 7s-1.5 9-4.5 9"/>',
    gi: '<path d="M10 3v4c0 2-3 2.5-3 6a6 6 0 0 0 6 6h1a4 4 0 0 0 0-8h-1c-1.5 0-2-1-2-2V3"/>',
    blood: '<path d="M12 3c3 4 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 3-7 6-11z"/><path d="M12 11v6M9 14h6"/>',
    msk: '<path d="M7 4.5a2 2 0 1 1-2.5 2.5L17 19.5a2 2 0 1 1 2.5-2.5z"/>',
    neuro: '<path d="M12 5a3 3 0 0 0-5.5 1.5A3 3 0 0 0 4 11a3 3 0 0 0 1.5 4.5A3 3 0 0 0 9 19.5a3 3 0 0 0 3-1.5"/><path d="M12 5a3 3 0 0 1 5.5 1.5A3 3 0 0 1 20 11a3 3 0 0 1-1.5 4.5 3 3 0 0 1-3.5 4 3 3 0 0 1-3-1.5V5z"/>',
    mental: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>'
  };
  function gIcon(id) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (GROUP_ICON[id] || GROUP_ICON.mental) + '</svg>'; }
  var TOOL_ICON = {
    flags: '<path d="M12 3l9.5 16.5h-19z"/><path d="M12 10v4M12 17h.01"/>',
    drugs: '<rect x="3.5" y="9" width="17" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.2 8.6l5.6 8"/>',
    chapters: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 1 4 17V5.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 0 20 17V5.5z"/>',
    saved: '<path d="M6 4h12v16l-6-4-6 4z"/>'
  };
  function tIcon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + TOOL_ICON[k] + '</svg>'; }

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
    collectTools(meta, sections);

    sections.forEach(function (s) {
      s.subs.forEach(function (c) {
        var text = c.text.replace(/\s+/g, ' ').trim();
        if (!text && !c.id) return;
        index.push({ ch: meta.id, sec: s.n, secTitle: s.title, id: c.id, title: c.title, text: text, low: (c.title + ' ' + text).toLowerCase(), lowTitle: c.title.toLowerCase() });
      });
    });
  }


  /* ---------- Cross-chapter tools: drug dose index and red flags ---------- */
  var drugs = [];   // { name, low, ch }
  var flags = [];   // { ch, finding, action }
  var FLAG_RE = /emergency|immediately|transfer|same[- ]day|urgent|refer now|admit|sepsis|anaphylaxis|call 1122|\bED\b/i;
  function cellText(td) { return td ? td.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function collectTools(meta, sections) {
    drugs = drugs.filter(function (d) { return d.ch !== meta.id; });
    flags = flags.filter(function (f) { return f.ch !== meta.id; });
    sections.forEach(function (s) {
      var box = document.createElement('div'); box.innerHTML = s.html;
      if (s.n === '4') {
        box.querySelectorAll('table tbody tr').forEach(function (tr) {
          var td = tr.querySelector('td'); if (!td) return;
          var st = td.querySelector('strong'), raw = st ? st.textContent : cellText(td);
          var name = raw.split(/\s\(|\s+\d|:|,|;/)[0].replace(/\*/g, '').trim();
          if (name.length < 3 || name.length > 40 || /^(none|other|any|all|step|patient|if|when)\b/i.test(name)) return;
          drugs.push({ name: name, low: name.toLowerCase(), ch: meta.id });
        });
      }
      if (s.n === '1') {
        box.querySelectorAll('table tbody tr').forEach(function (tr) {
          var tds = tr.querySelectorAll('td'); if (tds.length < 2) return;
          var act = cellText(tds[tds.length - 1]); if (!FLAG_RE.test(act)) return;
          var st = tds[tds.length - 1].querySelector('strong');
          var fd = cellText(tds[0]); if (/^any .*(above|listed)/i.test(fd)) fd = 'Any emergency feature in this chapter’s triage list';
          flags.push({ ch: meta.id, finding: fd, action: (st ? st.textContent : act).replace(/[.:]\s*$/, '') });
        });
      }
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
      book = res.book; chapters = {}; index = []; drugs = []; flags = [];
      document.getElementById('aboutText').textContent = (window.OPDAuth ? '' : 'Prototype build. ') + book.chapters.length + ' chapters. Drafts are under review and are not yet approved for clinical use.';
      book.chapters.forEach(function (c) { if (res.md[c.id] != null) buildChapter(c, res.md[c.id]); });
      book.chapters = book.chapters.filter(function (c) { return chapters[c.id]; });
    });
  }

  /* ---------- Views ---------- */
  function setBar(title, sub, showBack) {
    barTitle.innerHTML = (title === 'MEDHELP' ? '<span class="brand"><b>MED</b><i>HELP</i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg></span>' : esc(title)) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '');
    backBtn.hidden = !showBack;
  }
  function setTab(t) { document.querySelectorAll('.tab').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === t); }); }

  function statusPill(m) {
    return m.status === 'approved' ? '<span class="pill approved">Approved ' + esc(m.version) + '</span>' : '<span class="pill draft">Draft ' + esc(m.version) + '</span>';
  }

  function chapterRow(c) {
    return '<a class="ch-row" href="#' + c.id + '"><span class="ch-code">' + esc(c.short) + '</span><span class="ch-meta"><span class="ch-title">' + esc(c.title) +
      '</span><span class="ch-sub">' + statusPill(c) + ' Checked ' + fmtDate(c.checked) + '</span></span>' + ICON_CHEV + '</a>';
  }
  function searchField(id, ph) {
    return '<div class="searchbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
      '<input id="' + id + '" type="search" placeholder="' + ph + '" autocomplete="off" enterkeyhint="search"></div>';
  }

  function renderHome() {
    setBar('MEDHELP', 'OPD guide for medical officers', false); setTab('home');
    document.body.classList.add('is-home');
    var saved = store.get('saved', []).length, last = store.get('last', null), recent = store.get('recent', []).filter(function (id) { return chapters[id]; });
    var drugN = {}; drugs.forEach(function (d) { drugN[d.low] = 1; });
    var h = '<section class="hero"><h2>What do you need?</h2>' + searchField('homeSearch', 'Search a drug, dose, symptom…') + '</section>';
    h += '<div class="tools">' +
      '<a class="tool t-flag" href="#redflags">' + tIcon('flags') + '<b>Red flags</b><span>' + flags.length + ' danger signs</span></a>' +
      '<a class="tool" href="#drugs">' + tIcon('drugs') + '<b>Drug doses</b><span>A–Z · ' + Object.keys(drugN).length + ' medicines</span></a>' +
      '<a class="tool" href="#chapters">' + tIcon('chapters') + '<b>All chapters</b><span>' + book.chapters.length + ' conditions</span></a>' +
      '<a class="tool" href="#saved">' + tIcon('saved') + '<b>Saved</b><span>' + (saved ? saved + ' section' + (saved > 1 ? 's' : '') : 'Bookmark sections') + '</span></a></div>';
    if (last && chapters[last.id]) {
      var lc = chapters[last.id], ls = lc.sections.filter(function (x) { return x.n === last.sec; })[0];
      h += '<a class="resume" href="#' + last.id + (last.sec ? '-s' + last.sec : '') + '"><span class="resume-k">Continue reading</span><span class="resume-t">' + esc(lc.meta.title) + '</span>' +
        (ls ? '<span class="resume-s">' + esc(ls.title) + '</span>' : '') + ICON_CHEV + '</a>';
    }
    if (recent.length > 1) {
      h += '<div class="eyebrow">Recently opened</div><div class="recent">' + recent.slice(0, 6).map(function (id) {
        return '<a class="chip" href="#' + id + '">' + esc(chapters[id].meta.title) + '</a>'; }).join('') + '</div>';
    }
    h += '<div class="eyebrow">Body systems</div><div class="systems">';
    book.groups.forEach(function (g) {
      var n = book.chapters.filter(function (c) { return c.group === g.id; }).length; if (!n) return;
      h += '<a class="sys sys-' + esc(g.id) + '" href="#chapters:' + esc(g.id) + '">' + gIcon(g.id) + '<b>' + esc(g.title) + '</b><span>' + n + ' chapter' + (n > 1 ? 's' : '') + '</span></a>';
    });
    h += '</div><p class="coming">All chapters are drafts under review and not yet approved for clinical use. New chapters appear here as they are written.</p>';
    view.innerHTML = h;
    var inp = document.getElementById('homeSearch');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && inp.value.trim()) { lastQuery = inp.value.trim(); location.hash = 'search'; } });
    inp.addEventListener('focus', function () { lastQuery = inp.value; location.hash = 'search'; });
    window.scrollTo(0, 0);
  }

  function renderChapters(groupId) {
    setBar('Chapters', book.chapters.length + ' conditions', false); setTab('chapters');
    var g0 = groupId && book.groups.some(function (g) { return g.id === groupId; }) ? groupId : 'all';
    var h = '<nav class="chips filt" id="filt"><button class="chip' + (g0 === 'all' ? ' on' : '') + '" data-g="all">All</button>' +
      book.groups.filter(function (g) { return book.chapters.some(function (c) { return c.group === g.id; }); }).map(function (g) {
        return '<button class="chip' + (g0 === g.id ? ' on' : '') + '" data-g="' + esc(g.id) + '">' + esc(g.title) + '</button>'; }).join('') + '</nav><div id="chList"></div>';
    view.innerHTML = h;
    function draw(gid) {
      var out = '';
      book.groups.forEach(function (g) {
        if (gid !== 'all' && g.id !== gid) return;
        var list = book.chapters.filter(function (c) { return c.group === g.id; }).sort(function (a, b) { return a.title.localeCompare(b.title); });
        if (!list.length) return;
        out += '<div class="eyebrow eb-icon">' + gIcon(g.id) + esc(g.title) + '</div><div class="ch-list">' + list.map(chapterRow).join('') + '</div>';
      });
      document.getElementById('chList').innerHTML = out;
    }
    draw(g0);
    document.getElementById('filt').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      document.querySelectorAll('#filt .chip').forEach(function (c) { c.classList.toggle('on', c === b); });
      history.replaceState(null, '', '#chapters' + (b.dataset.g === 'all' ? '' : ':' + b.dataset.g)); draw(b.dataset.g);
    });
    window.scrollTo(0, 0);
  }

  function renderDrugs() {
    setBar('Drug doses A–Z', 'From each chapter’s dose table', true); setTab('home');
    var by = {};
    drugs.forEach(function (d) { (by[d.low] = by[d.low] || { name: d.name, chs: [] }); if (by[d.low].chs.indexOf(d.ch) < 0) by[d.low].chs.push(d.ch); });
    var keys = Object.keys(by).sort();
    view.innerHTML = searchField('dq', 'Filter medicines…') + '<p class="tool-note">Tap a medicine to open the dose table in that chapter.</p><div id="dl"></div>';
    function draw(q) {
      q = (q || '').toLowerCase().trim(); var cur = '', out = '';
      keys.filter(function (k) { return !q || k.indexOf(q) >= 0; }).forEach(function (k) {
        var L = k.charAt(0).toUpperCase(); if (!/[A-Z]/.test(L)) L = '#';
        if (L !== cur) { if (cur) out += '</div>'; out += '<div class="az">' + L + '</div><div class="ch-list">'; cur = L; }
        out += '<div class="drug"><span class="drug-n">' + esc(by[k].name) + '</span><span class="drug-c">' + by[k].chs.map(function (id) {
          return '<a class="chip" href="#' + id + '-s4">' + esc(chapters[id].meta.short) + '</a>'; }).join('') + '</span></div>';
      });
      document.getElementById('dl').innerHTML = cur ? out + '</div>' : '<p class="empty">No medicine matches “' + esc(q) + '”.</p>';
    }
    var inp = document.getElementById('dq'); inp.addEventListener('input', function () { draw(inp.value); }); draw('');
    window.scrollTo(0, 0);
  }

  function renderFlags() {
    setBar('Red flags', 'Danger signs from every chapter', true); setTab('home');
    var h = '<p class="tool-note flag-note">Findings that need emergency care, same-day referral or transfer. Tap a condition for its full triage section.</p>';
    book.chapters.forEach(function (c) {
      var list = flags.filter(function (f) { return f.ch === c.id; }); if (!list.length) return;
      h += '<section class="rf"><a class="rf-h" href="#' + c.id + '-s1"><span class="ch-code">' + esc(c.short) + '</span><b>' + esc(c.title) + '</b>' + ICON_CHEV + '</a><ul>' +
        list.map(function (f) { return '<li><span class="rf-f">' + esc(f.finding) + '</span><span class="rf-a">' + esc(f.action) + '</span></li>'; }).join('') + '</ul></section>';
    });
    view.innerHTML = h; window.scrollTo(0, 0);
  }

  function renderChapter(id, secN, anchor, terms) {
    var ch = chapters[id]; if (!ch) return renderHome();
    var rec = store.get('recent', []).filter(function (x) { return x !== id; }); rec.unshift(id); store.set('recent', rec.slice(0, 8));
    store.set('last', { id: id, sec: secN || null });
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
    var order = book.chapters, at = order.map(function (c) { return c.id; }).indexOf(id), prev = order[at - 1], next = order[at + 1];
    h += '<nav class="pn">' + (prev ? '<a href="#' + prev.id + '"><span>Previous</span>' + esc(prev.title) + '</a>' : '<span></span>') +
      (next ? '<a class="nx" href="#' + next.id + '"><span>Next</span>' + esc(next.title) + '</a>' : '<span></span>') + '</nav>';
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
          var n = en.target.id.split('-s').pop(); store.set('last', { id: id, sec: n });
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
    document.body.classList.remove('is-home');
    if (!h) return renderHome();
    if (h === 'chapters' || h.indexOf('chapters:') === 0) return renderChapters(h.split(':')[1]);
    if (h === 'drugs') return renderDrugs();
    if (h === 'redflags') return renderFlags();
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
