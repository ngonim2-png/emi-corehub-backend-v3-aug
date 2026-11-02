/* Router + global event handling. */
(function () {
  'use strict';
  var EMI = window.EMI;

  var routes = [
    { re: /^#\/?$/, view: 'landing' },
    { re: /^#\/login$/, view: 'login' },
    { re: /^#\/activate$/, view: 'activate' },
    { re: /^#\/recover$/, view: 'recover' },
    { re: /^#\/plans$/, view: 'plans' },
    { re: /^#\/plan\/([^/]+)$/, view: 'plan', keys: ['id'] },
    { re: /^#\/register$/, view: 'register' },
    { re: /^#\/applicant-login$/, view: 'applicantLogin' },
    { re: /^#\/applicant$/, view: 'applicant', need: 'applicant' },
    { re: /^#\/account$/, view: 'account', need: 'applicant' },
    { re: /^#\/apply\/([^/]+)$/, view: 'apply', keys: ['id'], need: 'applicant' },
    { re: /^#\/home$/, view: 'home', need: 'client' },
    { re: /^#\/policies$/, view: 'policies', need: 'client' },
    { re: /^#\/policy\/([^/]+)$/, view: 'policy', keys: ['no'], need: 'client' },
    { re: /^#\/claims$/, view: 'claims', need: 'client' },
    { re: /^#\/claims\/new$/, view: 'claimNew', need: 'client' },
    { re: /^#\/loans$/, view: 'loans', need: 'client' },
    { re: /^#\/loans\/new$/, view: 'loanNew', need: 'client' },
    { re: /^#\/more$/, view: 'more', need: 'client' },
    { re: /^#\/messages$/, view: 'messages', need: 'client' },
    { re: /^#\/pin$/, view: 'pin', need: 'client' },
    { re: /^#\/inbox$/, view: 'inbox', need: 'any' }
  ];

  function homeFor(s) { return !s ? '#/' : s.kind === 'applicant' ? '#/applicant' : '#/home'; }
  var booted = false;

  /** Every render gets a new token; screens and forms drop answers that arrive for an older token. */
  function render(isNavigation) {
    EMI.route.token++;
    if (isNavigation) { EMI.state.scrollReset = true; if (booted) EMI.state.focusPending = true; }
    booted = true;
    var hash = window.location.hash || '#/';
    var s = EMI.session();
    if ((hash === '#/' || hash === '#') && s) return EMI.route.go(homeFor(s));
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(hash);
      if (!m) continue;
      var r = routes[i];
      if (r.need && (!s || (r.need !== 'any' && s.kind !== r.need))) {
        if (r.need === 'applicant') { EMI.state.afterLogin = hash; return EMI.route.go(s ? homeFor(s) : '#/applicant-login'); }
        return EMI.route.go(s ? homeFor(s) : '#/login');
      }
      var params = {};
      (r.keys || []).forEach(function (k, j) { params[k] = m[j + 1]; });
      EMI.sheet.close(true);
      EMI.views[r.view](params);
      return;
    }
    EMI.route.go(homeFor(s));
  }

  EMI.route.go = function (hash) {
    if (window.location.hash === hash) render(true);
    else window.location.hash = hash;
  };
  /** Re-renders the current screen in place (keeps the scroll position). */
  EMI.route.refresh = function () { render(false); };
  window.addEventListener('hashchange', function () { render(true); });

  // ---------- actions (no inline handlers allowed by the security policy)
  EMI.actions.go = function (el) { EMI.route.go(el.dataset.to); };
  EMI.actions.back = function () { if (window.history.length > 1) window.history.back(); else EMI.route.go(homeFor(EMI.session())); };
  EMI.actions.refresh = function () { EMI.route.refresh(); };
  EMI.actions.logout = function () {
    var done = function () { EMI.clearSession(); EMI.state.apply = null; EMI.toast('You are logged out'); EMI.route.go('#/'); };
    // Stop sending this person's notifications to this phone once they log out.
    if (EMI.pushSupported()) EMI.disablePush().then(done, done); else done();
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = EMI.actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    var fn = EMI.actions[form.dataset.form + 'Submit'];
    if (fn) fn(form, e);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches && t.matches('[data-photo]')) EMI.onPhotoPicked(t);
    else if (t.id === 'claimFiles') EMI.onClaimFilesPicked(t);
    else if (t.id === 'isCivilServant') { var box = document.getElementById('csBox'); if (box) box.hidden = !t.checked; }
    else if (t.id === 'loanType' || t.id === 'tenure') EMI.updateLoanPreview();
    if (t.id) EMI.form.clearField(t);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.classList && (t.classList.contains('control--pin') || t.classList.contains('control--code'))) t.value = t.value.replace(/\D/g, '').slice(0, 6);
    else if (t.id === 'principal' || t.id === 'tenure') EMI.updateLoanPreview();
    // An error disappears as soon as the person starts fixing it.
    EMI.form.clearField(t);
  });

  // ---------- connectivity
  window.addEventListener('offline', function () { EMI.toast('You are offline. Saved information is still available.', true); });
  window.addEventListener('online', function () {
    EMI.toast('Back online');
    // If the screen is showing an error or saved (offline) data, load it fresh.
    if (document.querySelector('.state--error, .statusbar')) EMI.route.refresh();
  });

  // ---------- start
  function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { /* the app works without it */ });
    EMI.api('GET', '/config', null, { noAuth: true, timeout: 8000 }).then(function (c) { EMI.state.config = c; }).catch(function () {}).then(function () { render(true); });
  }
  start();
})();
