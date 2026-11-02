/* Enhanced Mutual client app - core: state, storage, formatting, API client, push, install.
   Rendering lives in ui.js; screens live in views-*.js. No inline handlers (the server's security policy forbids them). */
(function () {
  'use strict';
  var EMI = (window.EMI = { views: {}, actions: {}, route: { token: 0 }, state: { config: null } });
  var API = '/api/v1/app';

  // ---------- safe storage (private windows / blocked storage must not break the app)
  EMI.store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  EMI.session = function () {
    try { return JSON.parse(EMI.store.get('emi_session') || 'null'); } catch (e) { return null; }
  };
  EMI.setSession = function (s) { EMI.store.set('emi_session', JSON.stringify(s)); };
  EMI.clearSession = function () { EMI.store.del('emi_session'); EMI.store.del('emi_cache_me'); EMI.state.me = null; };
  EMI.root = function () { return document.getElementById('root'); };

  // ---------- formatting
  EMI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  EMI.money = function (n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return 'NLe ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  EMI.fmtDate = function (d) {
    if (!d) return '-';
    var dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  /** "Today", "Yesterday" or a date - for inbox and message lists. */
  EMI.fmtRelative = function (d) {
    var dt = new Date(d);
    if (isNaN(dt)) return EMI.fmtDate(d);
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var diff = (start - new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) / 86400000;
    var time = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return 'Today, ' + time;
    if (diff === 1) return 'Yesterday, ' + time;
    return EMI.fmtDate(dt);
  };
  EMI.monthLabel = function (key) {
    if (!key) return '-';
    var p = String(key).split('-');
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (names[Number(p[1]) - 1] || p[1]) + ' ' + p[0];
  };
  EMI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };

  // ---------- API client
  /**
   * EMI.api(method, path, body, {noAuth, raw, timeout}) -> Promise
   * Errors carry .status and .kind: offline | timeout | auth | forbidden | notFound | conflict |
   * validation | rateLimit | server. Server (5xx) details are never shown to people.
   */
  function apiError(status, data) {
    var m = data && data.message;
    if (m && typeof m === 'object') m = m.message || (Array.isArray(m) ? m.join(' ') : JSON.stringify(m));
    if (Array.isArray(m)) m = m.join(' ');
    if (!m && data && data.error) m = data.error;
    var kind = status === 401 ? 'auth' : status === 403 ? 'forbidden' : status === 404 ? 'notFound' : status === 409 ? 'conflict' : status === 429 ? 'rateLimit' : status >= 500 ? 'server' : 'validation';
    if (kind === 'server') m = 'Something went wrong on our side. Please try again in a few minutes.';
    if (kind === 'rateLimit') m = 'Too many attempts. Please wait a few minutes and try again.';
    var e = new Error(m || 'Something went wrong. Please try again.');
    e.status = status; e.kind = kind;
    return e;
  }
  function networkError(kind) {
    var e = new Error(kind === 'timeout' ? 'The connection is slow and the request took too long. Please try again.' : 'You appear to be offline. Please check your connection and try again.');
    e.kind = kind; e.offline = kind === 'offline';
    return e;
  }
  EMI.api = function (method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    var s = EMI.session();
    if (s && !opts.noAuth) headers.Authorization = 'Bearer ' + s.token;
    var init = { method: method, headers: headers };
    var isUpload = typeof FormData !== 'undefined' && body instanceof FormData;
    if (isUpload) init.body = body;
    else if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, opts.timeout || (isUpload ? 90000 : 20000));
    if (ctrl) init.signal = ctrl.signal;
    return fetch(API + path, init).then(function (res) {
      clearTimeout(timer);
      if (opts.raw) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { throw apiError(res.status, j); });
        return res;
      }
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) throw apiError(res.status, data);
        return data;
      });
    }, function () {
      clearTimeout(timer);
      throw networkError(timedOut ? 'timeout' : 'offline');
    });
  };
  EMI.apiError = apiError;

  // ---------- photos: shrink before upload (phone photos are 3-8 MB; on weak data that fails)
  EMI.compressImage = function (file, maxSide, quality) {
    maxSide = maxSide || 1600; quality = quality || 0.72;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height, k = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) return resolve(file);
          var name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  // ---------- push notifications
  EMI.pushSupported = function () { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; };
  EMI.isIos = function () { return /iphone|ipad|ipod/i.test(navigator.userAgent); };
  EMI.isStandalone = function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; };
  function urlB64ToUint8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  EMI.pushState = function () {
    if (!EMI.pushSupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('blocked');
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { return sub ? 'on' : 'off'; }).catch(function () { return 'off'; });
  };
  EMI.enablePush = function () {
    var key = EMI.state.config && EMI.state.config.vapidPublicKey;
    if (!EMI.pushSupported()) return Promise.reject(new Error(EMI.isIos() && !EMI.isStandalone() ? 'On iPhone, first add this app to your Home Screen (tap Share, then Add to Home Screen), then open it from there to turn on notifications.' : 'This phone or browser does not support notifications.'));
    if (!key) return Promise.reject(new Error('Notifications are not switched on for this service yet.'));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Notifications were not allowed. You can change this in your phone settings.');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }); });
    }).then(function (sub) {
      var j = sub.toJSON();
      return EMI.api('POST', '/push/subscribe', { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
    });
  };
  EMI.disablePush = function () {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return null;
      var ep = sub.endpoint;
      return sub.unsubscribe().then(function () { return EMI.api('POST', '/push/unsubscribe', { endpoint: ep }).catch(function () { return null; }); });
    });
  };

  // ---------- install (Android shows a real prompt; iPhone needs Share > Add to Home Screen)
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); EMI.state.installEvt = e; });
  window.addEventListener('appinstalled', function () { EMI.state.installEvt = null; if (EMI.toast) EMI.toast('App installed'); });
  EMI.actions.install = function () {
    var e = EMI.state.installEvt;
    if (!e) return;
    e.prompt();
    e.userChoice.then(function () { EMI.state.installEvt = null; EMI.route.refresh(); });
  };
})();
