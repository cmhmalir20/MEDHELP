/* OPD MO Guide — sign-in layer for the secure build.
   Chapters live in Firestore and are readable only by approved doctors (see firestore.rules).
   Needs window.OPD_FIREBASE (secure/config.js) and the Firebase compat SDK loaded first. */
(function () {
  'use strict';
  var cfg = window.OPD_FIREBASE;
  if (!cfg || !window.firebase) return;

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();
  if (window.OPD_EMULATOR) { auth.useEmulator('http://127.0.0.1:9099'); db.useEmulator('127.0.0.1', 8080); } // local testing only
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) { /* offline cache unavailable */ }

  var view = document.getElementById('view');
  var tabs = document.querySelector('.tabs');
  var user = null, admin = false, profile = null, signupName = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bar(title, sub) {
    document.getElementById('barTitle').innerHTML = esc(title) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '');
    document.getElementById('backBtn').hidden = true;
  }
  function gate(on) { document.body.classList.toggle('gated', on); if (tabs) tabs.hidden = on; }
  function friendly(err) {
    var c = (err && err.code) || '';
    var map = {
      'auth/invalid-credential': 'Email or password is wrong.',
      'auth/wrong-password': 'Email or password is wrong.',
      'auth/user-not-found': 'No account with that email. Tap "Create account".',
      'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
      'auth/weak-password': 'Use a password of at least 8 characters.',
      'auth/invalid-email': 'That email address does not look right.',
      'auth/network-request-failed': 'No internet connection. Connect and try again.',
      'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
      'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.'
    };
    return map[c] || (err && err.message) || 'Something went wrong.';
  }

  /* ---------- Screens ---------- */
  function signInScreen(done) {
    gate(true); bar('OPD MO Guide', 'Sign in to continue');
    var mode = 'in';
    function draw(msg, isErr) {
      view.innerHTML =
        '<div class="auth-card">' +
        '<h2>' + (mode === 'in' ? 'Sign in' : 'Create account') + '</h2>' +
        '<p class="auth-lead">This guide is for medical officers approved by the editor. After you sign up, your access is checked before chapters open.</p>' +
        '<button class="btn btn-google" id="gBtn" type="button"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>Continue with Google</button>' +
        '<div class="auth-or"><span>or with email</span></div>' +
        '<form id="eForm" novalidate>' +
        (mode === 'up' ? '<label>Full name<input id="fName" autocomplete="name" required></label>' : '') +
        '<label>Email<input id="fEmail" type="email" autocomplete="email" required></label>' +
        '<label>Password<input id="fPass" type="password" autocomplete="' + (mode === 'in' ? 'current-password' : 'new-password') + '" minlength="8" required></label>' +
        '<button class="btn btn-main" type="submit">' + (mode === 'in' ? 'Sign in' : 'Create account') + '</button>' +
        '</form>' +
        (msg ? '<p class="auth-msg' + (isErr ? ' err' : '') + '" role="status">' + esc(msg) + '</p>' : '') +
        '<div class="auth-links">' +
        (mode === 'in' ? '<button type="button" class="link" id="swap">Create account</button><button type="button" class="link" id="reset">Forgot password?</button>'
                       : '<button type="button" class="link" id="swap">I already have an account</button>') +
        '</div></div>';
      document.getElementById('gBtn').onclick = function () {
        var p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        auth.signInWithPopup(p).catch(function (e) {
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
          draw(friendly(e), true);
        });
      };
      document.getElementById('swap').onclick = function () { mode = mode === 'in' ? 'up' : 'in'; draw(); };
      var r = document.getElementById('reset');
      if (r) r.onclick = function () {
        var em = document.getElementById('fEmail').value.trim();
        if (!em) return draw('Type your email above, then tap "Forgot password?" again.', true);
        auth.sendPasswordResetEmail(em).then(function () { draw('A password reset link was sent to ' + em + '.'); }, function (e) { draw(friendly(e), true); });
      };
      document.getElementById('eForm').onsubmit = function (ev) {
        ev.preventDefault();
        var em = document.getElementById('fEmail').value.trim(), pw = document.getElementById('fPass').value;
        if (mode === 'in') return auth.signInWithEmailAndPassword(em, pw).catch(function (e) { draw(friendly(e), true); });
        var nm = document.getElementById('fName').value.trim();
        if (!nm) return draw('Please type your full name so the editor can recognise you.', true);
        if (pw.length < 8) return draw('Use a password of at least 8 characters.', true);
        signupName = nm;
        auth.createUserWithEmailAndPassword(em, pw).then(function (c) { return c.user.updateProfile({ displayName: nm }); })
          .then(function () { done && done(); }).catch(function (e) { draw(friendly(e), true); });
      };
    }
    draw();
  }

  function pendingScreen(status) {
    gate(true); bar('OPD MO Guide', 'Waiting for approval');
    var blocked = status === 'blocked';
    view.innerHTML = '<div class="auth-card"><h2>' + (blocked ? 'Access not approved' : 'Thanks for signing up') + '</h2>' +
      '<p class="auth-lead">' + (blocked ? 'Your account does not have access to this guide. Contact the editor if you think this is a mistake.'
        : 'Your account is waiting for the editor to approve it. This page opens the guide by itself as soon as you are approved.') + '</p>' +
      '<p class="auth-who">Signed in as <b>' + esc(user.email) + '</b></p>' +
      '<button class="btn" id="outBtn" type="button">Sign out</button></div>';
    document.getElementById('outBtn').onclick = function () { auth.signOut(); };
  }

  /* ---------- Data ---------- */
  function ensureProfile() {
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function (snap) {
      if (snap.exists) return snap.data();
      var p = { email: user.email || '', name: user.displayName || signupName || '', status: 'pending', requestedAt: firebase.firestore.FieldValue.serverTimestamp() };
      return ref.set(p).then(function () { return p; });
    });
  }
  function checkAdmin() {
    return db.collection('admins').doc(user.uid).get().then(function (s) { return s.exists; }, function () { return false; })
      .then(function (yes) {
        if (yes) return true;
        // First sign-in by the editor's email creates the admin record (allowed only for that email by the rules).
        return db.collection('admins').doc(user.uid).set({ email: user.email }).then(function () { return true; }, function () { return false; });
      });
  }
  function fetchContent() {
    return Promise.all([db.collection('book').doc('meta').get(), db.collection('chapters').get()]).then(function (r) {
      if (!r[0].exists) return { book: { bookTitle: 'OPD MO Guide', bookSubtitle: 'Adult medical OPD, Pakistan', sectionLabels: {}, groups: [], chapters: [] }, md: {} };
      var book = JSON.parse(r[0].data().json), md = {};
      r[1].forEach(function (d) { md[d.id] = d.data().md; });
      return { book: book, md: md };
    });
  }

  function watermark(text) {
    var old = document.getElementById('wm'); if (old) old.remove();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="10" y="110" transform="rotate(-24 160 90)" font-family="sans-serif" font-size="14" fill="#808080" fill-opacity="0.13">' +
      esc(text) + '</text></svg>';
    var d = document.createElement('div'); d.id = 'wm';
    d.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    document.body.appendChild(d);
  }

  function addChrome() {
    var about = document.getElementById('aboutText');
    if (about && !document.getElementById('acctRow')) {
      var row = document.createElement('div'); row.className = 'set-row'; row.id = 'acctRow';
      row.innerHTML = '<span class="acct">' + esc(user.email) + '</span><button class="btn btn-small" id="soBtn" type="button">Sign out</button>';
      about.parentNode.insertBefore(row, about);
      document.getElementById('soBtn').onclick = function () { auth.signOut(); };
    }
    var tin = document.querySelector('.tabs-in');
    if (admin && tin && !tin.querySelector('[data-tab="admin"]')) {
      var a = document.createElement('a'); a.className = 'tab'; a.href = '#admin'; a.dataset.tab = 'admin';
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>Admin';
      tin.appendChild(a);
    }
  }

  /* ---------- Public API used by app.js ---------- */
  var started = false;
  function load() {
    return new Promise(function (resolve, reject) {
      var unsubProfile = null;
      auth.getRedirectResult().catch(function () {});
      auth.onAuthStateChanged(function (u) {
        if (unsubProfile) { unsubProfile(); unsubProfile = null; }
        if (!u) {
          user = null; admin = false;
          var wm = document.getElementById('wm'); if (wm) wm.remove();
          var acct = document.getElementById('acctRow'); if (acct) acct.remove();
          var at = document.querySelector('.tab[data-tab="admin"]'); if (at) at.remove();
          if (started) { location.replace(location.pathname); return; }
          return signInScreen();
        }
        user = u;
        view.innerHTML = '<p class="loading">Checking your access…</p>';
        checkAdmin().then(function (isA) {
          admin = isA;
          return ensureProfile();
        }).then(function () {
          // Live updates: the waiting screen opens by itself once the editor approves.
          unsubProfile = db.collection('users').doc(user.uid).onSnapshot(function (s) {
            profile = s.data() || profile;
            var ok = admin || (profile && profile.status === 'approved');
            if (!ok) { gate(true); return pendingScreen(profile && profile.status); }
            if (document.body.classList.contains('gated') || !started) {
              gate(false); watermark(user.email); addChrome();
              view.innerHTML = '<p class="loading">Loading chapters…</p>';
              fetchContent().then(function (res) {
                if (!started) { started = true; resolve(res); }
                else { pendingContent = res; window.OPDApp && window.OPDApp.reload(); }
              }).catch(function (e) {
                view.innerHTML = '<p class="empty">Chapters could not be loaded. ' + esc(friendly(e)) + '</p>';
              });
            }
          }, function (e) { view.innerHTML = '<p class="empty">' + esc(friendly(e)) + '</p>'; });
        }).catch(function (e) {
          view.innerHTML = '<div class="auth-card"><p class="auth-msg err">' + esc(friendly(e)) + '</p><button class="btn" id="outBtn" type="button">Sign out</button></div>';
          document.getElementById('outBtn').onclick = function () { auth.signOut(); };
        });
      });
    });
  }
  var pendingContent = null;
  var loadOnce = load;
  window.OPDAuth = {
    load: function () {
      if (pendingContent) { var r = pendingContent; pendingContent = null; return Promise.resolve(r); }
      if (started) return fetchContent();
      return loadOnce();
    },
    isAdmin: function () { return admin; },
    renderAdmin: renderAdmin
  };

  /* ---------- Admin screen ---------- */
  function renderAdmin(el) {
    el.innerHTML = '<div class="admin"><p class="loading">Loading doctors…</p></div>';
    db.collection('users').get().then(function (qs) {
      var rows = []; qs.forEach(function (d) { var x = d.data(); x.uid = d.id; if (d.id !== user.uid) rows.push(x); });
      var order = { pending: 0, approved: 1, blocked: 2 };
      rows.sort(function (a, b) { return (order[a.status] - order[b.status]) || String(a.email).localeCompare(b.email); });
      var n = { pending: 0, approved: 0, blocked: 0 }; rows.forEach(function (r) { n[r.status] = (n[r.status] || 0) + 1; });
      var h = '<div class="admin">' +
        '<div class="eyebrow">Doctors · ' + n.pending + ' waiting, ' + n.approved + ' approved, ' + n.blocked + ' blocked</div><div class="ch-list">';
      if (!rows.length) h += '<p class="empty">Nobody has signed up yet.</p>';
      rows.forEach(function (r) {
        h += '<div class="u-row"><div class="u-meta"><b>' + esc(r.name || '(no name)') + '</b><br><span class="ch-sub">' + esc(r.email) + '</span><br>' +
          '<span class="pill ' + (r.status === 'approved' ? 'approved' : 'draft') + '">' + esc(r.status) + '</span></div><div class="u-act">' +
          (r.status !== 'approved' ? '<button class="btn btn-small btn-main" data-uid="' + esc(r.uid) + '" data-set="approved">Approve</button>' : '') +
          (r.status !== 'blocked' ? '<button class="btn btn-small" data-uid="' + esc(r.uid) + '" data-set="blocked">' + (r.status === 'approved' ? 'Remove access' : 'Decline') + '</button>' : '') +
          '</div></div>';
      });
      h += '</div><div class="eyebrow">Chapters</div><div class="admin-box"><p>To add or update chapters, choose the content file you were sent (<b>content-bundle.json</b>). It replaces the chapters every doctor sees.</p>' +
        '<label class="btn btn-main file-btn">Choose content file<input type="file" id="bundle" accept=".json,application/json" hidden></label><p class="auth-msg" id="upMsg" role="status"></p></div></div>';
      el.innerHTML = h;
      el.querySelectorAll('[data-uid]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          db.collection('users').doc(b.dataset.uid).update({ status: b.dataset.set, reviewedAt: firebase.firestore.FieldValue.serverTimestamp() })
            .then(function () { renderAdmin(el); }, function (e) { b.disabled = false; alert(friendly(e)); });
        };
      });
      document.getElementById('bundle').onchange = function (ev) { upload(ev.target.files[0]); };
    }, function (e) { el.innerHTML = '<p class="empty">' + esc(friendly(e)) + '</p>'; });
  }

  function upload(file) {
    var msg = document.getElementById('upMsg');
    if (!file) return;
    msg.className = 'auth-msg'; msg.textContent = 'Reading ' + file.name + '…';
    file.text().then(function (t) {
      var b = JSON.parse(t);
      if (!b.book || !b.chapters || !Array.isArray(b.book.chapters)) throw new Error('This is not an OPD guide content file.');
      var ids = b.book.chapters.map(function (c) { return c.id; });
      var missing = ids.filter(function (id) { return typeof b.chapters[id] !== 'string'; });
      if (missing.length) throw new Error('The file is missing chapters: ' + missing.join(', '));
      msg.textContent = 'Uploading ' + ids.length + ' chapters…';
      return db.collection('chapters').get().then(function (old) {
        var batch = db.batch();
        batch.set(db.collection('book').doc('meta'), { json: JSON.stringify(b.book), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        ids.forEach(function (id) { batch.set(db.collection('chapters').doc(id), { md: b.chapters[id], updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); });
        old.forEach(function (d) { if (ids.indexOf(d.id) < 0) batch.delete(d.ref); });
        return batch.commit();
      }).then(function () {
        msg.textContent = 'Done. ' + ids.length + ' chapters are live for approved doctors.';
        return window.OPDApp && window.OPDApp.reload().then(function () { location.hash = 'admin'; });
      });
    }).catch(function (e) { msg.className = 'auth-msg err'; msg.textContent = friendly(e); });
  }
})();
