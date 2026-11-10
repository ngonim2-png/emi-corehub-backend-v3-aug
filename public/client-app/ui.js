/* =====================================================================
   Enhanced Mutual client app - UI system (EMI.ui)

   Rules that keep screens safe and consistent:
   - Components return SafeHtml. Plain strings passed as children are always
     escaped, so data from the server can never inject markup.
   - Use ui.raw() only for markup you wrote yourself.
   - No inline event handlers (the server's security policy forbids them):
     interaction goes through data-act="name" -> EMI.actions.name(el, event)
     and <form data-form="name"> -> EMI.actions.nameSubmit(form).
   Full API reference: docs/client-app-ui.md
   ===================================================================== */
(function () {
  'use strict';
  var EMI = window.EMI;
  var ui = (EMI.ui = {});

  // ------------------------------------------------------------------ builder
  function SafeHtml(html) { this.__html = html; }
  SafeHtml.prototype.toString = function () { return this.__html; };
  var VOID = { input: 1, img: 1, br: 1, hr: 1, meta: 1, link: 1 };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  /** Marks markup you wrote yourself as safe. Never pass server data to it. */
  ui.raw = function (html) { return new SafeHtml(html == null ? '' : String(html)); };
  ui.isSafe = function (x) { return x instanceof SafeHtml; };

  /** Renders any child: SafeHtml as-is, text escaped, arrays flattened, null/false/true skipped. */
  function render(node) {
    if (node == null || node === false || node === true) return '';
    if (node instanceof SafeHtml) return node.__html;
    if (Array.isArray(node)) { var s = ''; for (var i = 0; i < node.length; i++) s += render(node[i]); return s; }
    return esc(node);
  }
  ui.render = render;

  /** Class names from strings, arrays and {name: condition} objects. */
  ui.cx = function () {
    var out = [];
    (function walk(a) {
      for (var i = 0; i < a.length; i++) {
        var v = a[i];
        if (!v) continue;
        if (typeof v === 'string') out.push(v);
        else if (Array.isArray(v)) walk(v);
        else if (typeof v === 'object') for (var k in v) if (v[k]) out.push(k);
      }
    })(arguments);
    return out.join(' ');
  };

  function attrs(a) {
    var s = '';
    if (!a) return s;
    for (var k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') { var c = ui.cx(v); if (c) s += ' class="' + esc(c) + '"'; continue; }
      if ((k === 'data' || k === 'aria') && typeof v === 'object') {
        for (var d in v) if (v[d] != null && v[d] !== false) s += ' ' + k + '-' + d.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) + '="' + esc(v[d] === true ? 'true' : v[d]) + '"';
        continue;
      }
      s += v === true ? ' ' + k : ' ' + k + '="' + esc(v) + '"';
    }
    return s;
  }

  /** ui.h('div', {class: 'card', data: {id: 1}}, child, child...) -> SafeHtml */
  ui.h = function (tag, a) {
    var kids = Array.prototype.slice.call(arguments, 2);
    var html = '<' + tag + attrs(a) + '>';
    if (VOID[tag]) return new SafeHtml(html);
    return new SafeHtml(html + render(kids) + '</' + tag + '>');
  };
  var h = ui.h;
  var uid = 0;
  ui.id = function (prefix) { return (prefix || 'ui') + '-' + (++uid); };

  // -------------------------------------------------------------------- icons
  var ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    claim: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    loan: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.7c0 2.3-5 1.3-5 3.6 0 1.1 1.1 1.7 2.5 1.7s2.5-.6 2.5-1.6"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    bell: '<path d="M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 004 0"/>',
    plan: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.5" r=".6"/>',
    offline: '<path d="M2 8.5a16 16 0 0120 0M5 12a11 11 0 0114 0M8.5 15.5a6 6 0 017 0"/><circle cx="12" cy="19" r=".8"/><path d="M3 3l18 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3v-6z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    message: '<path d="M4 5h16v11H9l-5 4V5z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
  };
  /** Decorative by default (hidden from screen readers). Pass {label} when the icon carries meaning on its own. */
  ui.icon = function (name, o) {
    o = o || {};
    var size = o.size ? ' width="' + o.size + '" height="' + o.size + '"' : '';
    var a11y = o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true" focusable="false"';
    return ui.raw('<svg viewBox="0 0 24 24"' + size + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' + a11y + (o.className ? ' class="' + esc(o.className) + '"' : '') + '>' + (ICONS[name] || '') + '</svg>');
  };
  EMI.icon = function (name) { return String(ui.icon(name)); };

  // ------------------------------------------------------------------ layout
  ui.stack = function (children, o) { o = o || {}; return h('div', { class: ['stack', o.gap && 'stack--' + o.gap, o.className], id: o.id }, children); };
  ui.split = function (start, end, o) { o = o || {}; return h('div', { class: ['split', o.className] }, h('div', null, start), end); };
  ui.grid = function (children, o) { o = o || {}; return h('div', { class: ['grid-2', o.className] }, children); };
  ui.pageHead = function (o) {
    return h('div', { class: 'page-head' }, h(o.level || 'h2', { class: 'page-head__title' }, o.title), o.sub ? h('p', { class: 'page-head__sub' }, o.sub) : null);
  };
  /** A titled region; the heading labels the region for screen readers. */
  ui.section = function (o, children) {
    var id = o.id || ui.id('sec');
    return h('section', { class: ['section', o.className], aria: { labelledby: id } },
      h('div', { class: 'split' }, h(o.level || 'h2', { class: 'section__title', id: id }, o.title), o.action || null),
      children);
  };

  // ----------------------------------------------------------------- actions
  /**
   * ui.button({label, variant: 'primary'|'secondary'|'outline'|'danger', size: 'sm', inline,
   *            href | act | type: 'submit', data, icon, disabled, ariaLabel, id})
   * href renders a real link (navigation); act renders a button that calls EMI.actions[act].
   */
  ui.button = function (o) {
    var cls = ['btn', 'btn--' + (o.variant || 'primary'), o.size && 'btn--' + o.size, (o.inline || o.size === 'sm') && 'btn--inline', o.className];
    var inner = [o.icon ? ui.icon(o.icon) : null, h('span', null, o.label)];
    if (o.href) return h('a', { class: cls, href: o.href, id: o.id, aria: { label: o.ariaLabel } }, inner);
    var data = o.data ? Object.assign({}, o.data) : {};
    if (o.act) data.act = o.act;
    return h('button', { class: cls, type: o.type || 'button', id: o.id, disabled: !!o.disabled, data: data, aria: { label: o.ariaLabel } }, inner);
  };
  ui.buttonRow = function (buttons) { var list = buttons.filter(Boolean); return h('div', { class: ['btn-row', list.length === 2 && 'btn-row--2'] }, list); };
  /** Looks like a link. Use to: '#/route' for navigation, or act for an action. */
  ui.link = function (o) {
    if (o.href) return h('a', { class: 'link', href: o.href }, o.label);
    return h('button', { class: 'link', type: 'button', data: Object.assign({ act: o.act || 'go', to: o.to }, o.data || {}) }, o.label);
  };
  ui.links = function (list) { return h('div', { class: 'links' }, list.filter(Boolean)); };
  ui.iconButton = function (o) {
    var count = o.count > 0 ? (o.count > 9 ? '9+' : String(o.count)) : '';
    var label = o.label + (count ? ', ' + o.count + ' unread' : '');
    return h('button', { class: 'iconbtn', type: 'button', data: Object.assign({ act: o.act, to: o.to }, o.data || {}), aria: { label: label } },
      ui.icon(o.icon), count ? h('span', { class: 'iconbtn__count', aria: { hidden: 'true' } }, count) : null);
  };

  // -------------------------------------------------------------- surfaces
  /**
   * ui.card({tone: 'hero'|'note'|'warning'|'danger', href, center, id, label}, children)
   * With href the whole card is one link, so keep interactive elements out of it.
   */
  ui.card = function (o, children) {
    o = o || {};
    var cls = ['card', o.tone && 'card--' + o.tone, o.center && 'card--center', o.href && 'card--tap', o.className];
    if (o.href) return h('a', { class: cls, href: o.href, id: o.id, aria: { label: o.label } }, children);
    return h(o.tag || 'div', { class: cls, id: o.id, aria: { label: o.label } }, children);
  };
  /** Card header: title + meta on the left, a badge or chevron on the right. */
  ui.cardHeader = function (o) {
    return h('div', { class: 'split' },
      h('div', { class: 'stack stack--xs' }, h(o.level || 'h3', { class: ['card__title', o.large && 'card__title--lg'] }, o.title), o.meta ? h('p', { class: 'card__meta' }, o.meta) : null),
      o.end || (o.chevron ? ui.icon('chevron', { className: 'card__chev' }) : null));
  };
  ui.media = function (o) {
    return h('div', { class: 'media' },
      h('div', { class: 'media__icon' }, ui.icon(o.icon)),
      h('div', { class: 'media__body' }, h(o.level || 'h3', { class: 'card__title' }, o.title), o.text ? h('p', { class: 'card__meta' }, o.text) : null, o.extra || null),
      o.chevron ? ui.icon('chevron', { className: 'card__chev' }) : null);
  };
  ui.tile = function (o) { return h('a', { class: 'card card--tap tile', href: o.href }, ui.icon(o.icon), h('span', null, o.label)); };

  // -------------------------------------------------------------- data display
  /** tone: success | warning | danger | info | neutral */
  ui.badge = function (text, tone) { return h('span', { class: ['badge', 'badge--' + (tone || 'neutral')] }, text); };

  /** One place that decides how every business status looks and reads. */
  var STATUS = {
    policy: { 'Active': ['success'], 'One Month Outstanding': ['warning', '1 month due'], 'Warning': ['warning', 'Overdue'], 'Lapsed': ['danger'], 'Matured': ['info'], 'Not Yet Commenced': ['neutral', 'Not started'], 'Cancelled': ['neutral'], 'Surrendered': ['neutral'] },
    claim: { 'Registered': ['info', 'Received'], 'Under Review': ['info'], 'Approved': ['success'], 'Paid': ['success'], 'Rejected': ['danger', 'Not approved'] },
    loan: { 'Pending Life Manager Approval': ['warning', 'Waiting for approval'], 'Pending Finance Director Approval': ['warning', 'Final approval pending'], 'Approved': ['success'], 'Disbursed': ['success', 'Being repaid'], 'Completed': ['success', 'Repaid'], 'Rejected': ['danger', 'Not approved'], 'Deferred': ['warning', 'On hold'] },
    repayment: { 'Paid': ['success'], 'Partial': ['warning', 'Part paid'], 'Due': ['neutral'], 'Overdue': ['danger'] },
    request: { 'Open': ['warning', 'Waiting'], 'Handled': ['success', 'Answered'] },
    application: { 'Received': ['neutral'], 'Under review': ['info'], 'Approved - awaiting first premium': ['warning', 'Approved - pay first premium'], 'Active': ['success'], 'Not approved': ['danger'] }
  };
  ui.statusLabel = function (domain, value) { var m = (STATUS[domain] || {})[value]; return (m && m[1]) || value || ''; };
  ui.status = function (domain, value) { var m = (STATUS[domain] || {})[value]; return ui.badge(ui.statusLabel(domain, value), (m && m[0]) || 'neutral'); };

  /** ui.stat({value, label, tone: 'success'|'danger'}) */
  ui.stat = function (o) { return h('div', { class: ['stat', o.tone && 'stat--' + o.tone] }, h('div', { class: 'stat__value' }, o.value), h('div', { class: 'stat__label' }, o.label)); };
  ui.stats = function (list) { return ui.grid(list.filter(Boolean).map(ui.stat)); };

  /** ui.dl([[label, value], ...]). Rows that are falsy, or whose value is null/'' are skipped. */
  ui.dl = function (rows, o) {
    o = o || {};
    return h('dl', { class: ['dl', o.className] }, rows.filter(function (r) { return r && r[1] != null && r[1] !== ''; }).map(function (r) {
      return h('div', { class: 'dl__row' }, h('dt', null, r[0]), h('dd', null, r[1]));
    }));
  };

  /** ui.list([{title, text, meta, end, unread}], {label}) */
  ui.list = function (items, o) {
    o = o || {};
    return h('ul', { class: 'list', aria: { label: o.label } }, items.map(function (it) {
      return h('li', { class: 'list__item' },
        h('div', { class: 'list__main' },
          h('span', { class: 'list__title' }, it.unread ? [h('span', { class: 'list__dot', aria: { hidden: 'true' } }), h('span', { class: 'visually-hidden' }, 'New: ')] : null, it.title),
          it.text ? h('span', { class: 'list__text' }, it.text) : null,
          it.meta ? h('span', { class: 'list__meta' }, it.meta) : null),
        it.end != null ? h('div', { class: 'list__end' }, it.end) : null);
    }));
  };

  ui.disclosure = function (o, children) { return h('details', { class: 'disclosure', open: !!o.open }, h('summary', null, o.summary), children); };

  /** Progress bar exposed to assistive tech. ui.progress({value, max, label, start, end}) */
  ui.progress = function (o) {
    var max = o.max || 100, pct = max > 0 ? Math.max(0, Math.min(100, Math.round((o.value / max) * 100))) : 0;
    return h('div', { class: 'progress' },
      (o.start || o.end) ? h('div', { class: 'progress__label', aria: { hidden: 'true' } }, h('span', null, o.start || ''), h('span', null, o.end || '')) : null,
      h('div', { class: 'progress__track', role: 'progressbar', aria: { label: o.label, valuemin: 0, valuemax: max, valuenow: Math.min(o.value, max), valuetext: o.valueText } },
        h('div', { class: 'progress__bar', style: 'width:' + pct + '%' })));
  };

  /** Ordered steps with the current one marked. ui.stepper({steps, current, failed, failedLabel, label}) */
  ui.stepper = function (o) {
    return h('ol', { class: 'stepper', aria: { label: o.label || 'Progress' } }, o.steps.map(function (label, i) {
      var state = o.failed ? (i === 0 ? 'done' : i === 1 ? 'failed' : '') : (i < o.current || (o.complete && i === o.current) ? 'done' : i === o.current ? 'current' : '');
      var text = o.failed && i === 1 ? (o.failedLabel || 'Not approved') : label;
      var dot = state === 'done' ? ui.icon('check', { size: 14 }) : state === 'failed' ? '!' : String(i + 1);
      var sr = state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : state === 'failed' ? '' : ' (not yet)';
      return h('li', { class: ['stepper__step', state && 'stepper__step--' + state], aria: { current: state === 'current' ? 'step' : null } },
        h('span', { class: 'stepper__dot', aria: { hidden: 'true' } }, dot), h('span', null, text), h('span', { class: 'visually-hidden' }, sr));
    }));
  };
  ui.formSteps = function (o) {
    var bars = [];
    for (var i = 1; i <= o.total; i++) bars.push(h('span', { class: ['formsteps__bar', i <= o.current && 'formsteps__bar--on'] }));
    return h('div', { class: 'formsteps' }, h('div', { class: 'formsteps__bars', aria: { hidden: 'true' } }, bars), h('p', { class: 'formsteps__label' }, 'Step ' + o.current + ' of ' + o.total + (o.label ? ': ' + o.label : '')));
  };

  // ---------------------------------------------------------------- feedback
  /** ui.alert({tone: 'info'|'success'|'warning'|'danger', title, body, items, live: true}) */
  ui.alert = function (o) {
    var role = o.live ? (o.tone === 'danger' ? 'alert' : 'status') : null;
    return h('div', { class: ['alert', 'alert--' + (o.tone || 'info'), o.enter && 'alert--enter', o.className], role: role, id: o.id, tabindex: o.focusable ? '-1' : null },
      o.title ? h('p', { class: 'alert__title' }, o.title) : null,
      o.body ? h('p', null, o.body) : null,
      o.items && o.items.length ? h('ul', null, o.items) : null,
      o.action || null);
  };

  ui.emptyState = function (o) {
    return h('div', { class: 'state' },
      h('div', { class: 'state__icon' }, ui.icon(o.icon || 'inbox')),
      h('p', { class: 'state__title' }, o.title),
      o.body ? h('p', { class: 'state__body' }, o.body) : null,
      o.action ? h('div', { class: 'state__actions' }, o.action) : null);
  };

  /** Chooses words and a recovery action from the kind of failure. */
  ui.errorState = function (err, o) {
    o = o || {};
    var kind = (err && err.kind) || 'unknown';
    var copy = {
      offline: ['offline', 'You are offline', 'Check that mobile data or Wi-Fi is on, then try again.'],
      timeout: ['clock', 'This is taking too long', 'The connection is slow right now. Please try again.'],
      server: ['alert', 'Something went wrong on our side', 'Please try again in a few minutes. If it keeps happening, call the office.'],
      notFound: ['search', 'We could not find that', (err && err.message) || 'It may have been moved or removed.']
    }[kind] || ['alert', 'Something went wrong', (err && err.message) || 'Please try again.'];
    return h('div', { class: 'state state--error', role: 'alert' },
      h('div', { class: 'state__icon' }, ui.icon(copy[0])),
      h('p', { class: 'state__title' }, o.title || copy[1]),
      h('p', { class: 'state__body' }, copy[2]),
      h('div', { class: 'state__actions' }, o.action || ui.button({ label: 'Try again', variant: 'secondary', icon: 'refresh', act: 'refresh' }), o.secondary || null));
  };

  ui.successState = function (o) {
    return ui.card({ center: true }, h('div', { class: 'state state--success', role: 'status' },
      h('div', { class: 'state__icon' }, ui.icon('check')),
      h('p', { class: 'state__title' }, o.title),
      o.reference ? h('p', null, o.referenceLabel || 'Your reference is', ' ', h('strong', null, o.reference), '.') : null,
      o.body ? h('p', { class: 'state__body' }, o.body) : null,
      o.actions ? h('div', { class: 'state__actions' }, o.actions) : null));
  };

  /** Placeholder shaped like the content that is loading. kind: list | detail | form | home */
  ui.skeleton = function (kind) {
    function block(hgt) { return h('div', { class: 'skeleton', style: 'height:' + hgt + 'px' }); }
    var shapes = { home: [150, 70, 96, 170], detail: [96, 90, 200, 52], form: [44, 60, 60, 120, 52], list: [60, 150, 150] };
    return h('div', { class: 'stack stack--lg loading-delay', aria: { hidden: 'true' } }, (shapes[kind] || shapes.list).map(block));
  };

  // ------------------------------------------------------------------ forms
  function describedBy(id, hint) { return [hint ? id + '-hint' : '', id + '-err'].filter(Boolean).join(' '); }
  function label(o) { return h('label', { class: 'field__label', for: o.id }, o.label, o.optional ? h('span', { class: 'field__optional' }, ' (optional)') : null); }
  function hintAndError(o) { return [o.hint ? h('p', { class: 'field__hint', id: o.id + '-hint' }, o.hint) : null, h('p', { class: 'field__error', id: o.id + '-err' })]; }

  /**
   * ui.field({id, label, type, value, hint, optional, required, placeholder, inputmode, autocomplete,
   *           autocapitalize, maxlength, min, max, pattern, variant: 'pin'|'code', attrs})
   * Every field gets a label tied to the control, a hint and an error slot linked by aria-describedby.
   */
  ui.field = function (o) {
    var a = Object.assign({
      id: o.id, name: o.name || o.id, type: o.type || 'text', value: o.value == null ? null : o.value, class: ['control', o.variant && 'control--' + o.variant],
      placeholder: o.placeholder, inputmode: o.inputmode, autocomplete: o.autocomplete, autocapitalize: o.autocapitalize, autocorrect: o.autocapitalize ? 'off' : null,
      spellcheck: o.autocapitalize ? 'false' : null, maxlength: o.maxlength, min: o.min, max: o.max, pattern: o.pattern, disabled: !!o.disabled, required: !!o.required,
      aria: { describedby: describedBy(o.id, o.hint), required: o.required ? 'true' : null }
    }, o.attrs || {});
    return h('div', { class: ['field', o.className], id: o.wrapId, hidden: !!o.hidden }, label(o), h('input', a), hintAndError(o));
  };
  /** PIN entry: numeric keypad, masked, 4-6 digits. */
  ui.pinField = function (o) {
    return ui.field(Object.assign({ type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, variant: 'pin', placeholder: '••••', required: true }, o));
  };
  ui.textarea = function (o) {
    return h('div', { class: 'field' }, label(o),
      h('textarea', Object.assign({ id: o.id, name: o.id, class: 'control', placeholder: o.placeholder, rows: o.rows || 4, maxlength: o.maxlength, required: !!o.required, aria: { describedby: describedBy(o.id, o.hint) } }, o.attrs || {}), o.value || ''),
      hintAndError(o));
  };
  /** options: ['A', 'B'] or [{value, label}]. placeholder adds an empty first option. */
  ui.select = function (o) {
    var opts = (o.placeholder ? [{ value: '', label: o.placeholder }] : []).concat((o.options || []).map(function (x) { return typeof x === 'object' ? x : { value: x, label: x }; }));
    return h('div', { class: ['field', o.className], id: o.wrapId, hidden: !!o.hidden }, label(o),
      h('select', { id: o.id, name: o.id, class: 'control', required: !!o.required, aria: { describedby: describedBy(o.id, o.hint) } },
        opts.map(function (x) { return h('option', { value: x.value, selected: String(x.value) === String(o.value == null ? '' : o.value) }, x.label); })),
      hintAndError(o));
  };
  ui.checkbox = function (o) {
    return h('div', { class: 'field' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: o.id, name: o.id, checked: !!o.checked, aria: { describedby: o.id + '-err' } }), h('span', null, o.label)),
      h('p', { class: 'field__error', id: o.id + '-err' }));
  };
  ui.fileField = function (o) {
    return h('div', { class: 'field' }, label(o),
      h('input', { type: 'file', id: o.id, class: 'control control--file', accept: o.accept, multiple: !!o.multiple, capture: o.capture, data: o.data, aria: { describedby: describedBy(o.id, o.hint) } }),
      hintAndError(o), h('div', { class: 'thumbs', id: o.thumbsId || o.id + '-thumbs', aria: { live: 'polite' } }, o.thumbs || null));
  };
  ui.thumb = function (o) {
    return h('div', { class: 'thumb', style: o.src ? 'background-image:url(' + o.src + ')' : null }, o.src ? h('span', { class: 'visually-hidden' }, o.name) : [h('span', { aria: { hidden: 'true' } }, o.text || 'File'), h('span', { class: 'visually-hidden' }, o.name)],
      h('button', { class: 'thumb__remove', type: 'button', data: Object.assign({ act: o.act }, o.data || {}), aria: { label: 'Remove ' + o.name } }, h('span', { aria: { hidden: 'true' } }, '×')));
  };
  ui.fieldRow = function (children) { return h('div', { class: 'field-row' }, children); };
  ui.fieldset = function (o, children) { return h('fieldset', { class: 'fieldset', data: o.data }, h('legend', null, o.legend), o.action ? h('div', { class: 'fieldset__head' }, o.action) : null, children); };

  /**
   * ui.form({name, children, submit: {label, variant}, secondary: ui.button(...)})
   * Submitting calls EMI.actions[name + 'Submit'](form). The alert slot at the top shows form-level errors.
   */
  ui.form = function (o) {
    var submit = o.submit ? ui.button(Object.assign({ type: 'submit', variant: 'primary' }, o.submit)) : null;
    return h('form', { class: ['form', o.className], data: { form: o.name }, novalidate: true, aria: { label: o.label } },
      h('div', { data: { formAlert: '' }, tabindex: '-1' }),
      o.children,
      submit || o.secondary ? (o.secondary ? ui.buttonRow([o.secondary, submit]) : submit) : null);
  };

  // --------------------------------------------------------- form runtime
  var form = (EMI.form = {});
  /** Reads every named control into {id: value}; checkboxes give true/false. Text is trimmed. */
  form.values = function (f) {
    var out = {};
    Array.prototype.forEach.call(f.querySelectorAll('input[id], select[id], textarea[id]'), function (el) {
      if (el.type === 'file') return;
      out[el.id] = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
    });
    return out;
  };
  form.clearErrors = function (f) {
    Array.prototype.forEach.call(f.querySelectorAll('[aria-invalid="true"]'), function (el) { el.removeAttribute('aria-invalid'); });
    Array.prototype.forEach.call(f.querySelectorAll('.field__error'), function (el) { el.textContent = ''; });
    var slot = f.querySelector('[data-form-alert]'); if (slot) slot.innerHTML = '';
  };
  form.clearField = function (el) {
    if (!el || el.getAttribute('aria-invalid') !== 'true') return;
    el.removeAttribute('aria-invalid');
    var err = document.getElementById(el.id + '-err'); if (err) err.textContent = '';
  };
  /**
   * Shows errors: {fieldId: 'message', _form: 'message'}. One field error focuses that field;
   * several are listed in a summary that is focused and announced.
   */
  form.setErrors = function (f, errors) {
    form.clearErrors(f);
    var keys = Object.keys(errors || {}).filter(function (k) { return errors[k]; });
    if (!keys.length) return false;
    var fieldKeys = [], formMsg = errors._form;
    keys.forEach(function (k) {
      if (k === '_form') return;
      var el = f.querySelector('#' + cssEsc(k)), err = document.getElementById(k + '-err');
      if (el && err) { el.setAttribute('aria-invalid', 'true'); err.textContent = errors[k]; fieldKeys.push(k); }
      else formMsg = formMsg || errors[k];
    });
    var slot = f.querySelector('[data-form-alert]');
    if (formMsg || fieldKeys.length > 1) {
      var items = fieldKeys.length > 1 ? fieldKeys.map(function (k) { return h('li', null, h('button', { type: 'button', class: 'link', data: { act: 'focusField', field: k } }, errors[k])); }) : null;
      slot.innerHTML = render(ui.alert({ tone: 'danger', live: true, enter: true, title: formMsg || (fieldKeys.length + ' things need your attention'), items: items }));
      if (!fieldKeys.length || fieldKeys.length > 1) { slot.focus({ preventScroll: true }); slot.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; }
    }
    var first = f.querySelector('#' + cssEsc(fieldKeys[0]));
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return true;
  };
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'); }
  EMI.actions.focusField = function (el) { var t = document.getElementById(el.dataset.field); if (t) { t.focus(); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };

  /** Busy state on the submit button: spinner, label, aria-busy, and blocks double submits. */
  form.busy = function (f, on, text) {
    var btn = f.querySelector('button[type=submit]');
    f.dataset.busy = on ? '1' : '';
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.setAttribute('aria-busy', 'true'); btn.disabled = true; btn.innerHTML = render([h('span', { class: 'btn__spinner', aria: { hidden: 'true' } }), h('span', null, text || 'Please wait...')]); }
    else { btn.removeAttribute('aria-busy'); btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  };

  // ------------------------------------------------------------ validation
  /**
   * Declarative rules, first failing rule per field wins:
   *   EMI.validate(values, { pin: [v.required('Enter your PIN'), v.pin()], pin2: [v.same('pin', 'The PINs differ')] })
   */
  var v = (EMI.rules = {
    required: function (msg) { return function (x) { return x === true || (x != null && String(x).trim() !== '') ? '' : msg; }; },
    checked: function (msg) { return function (x) { return x === true ? '' : msg; }; },
    minLength: function (n, msg) { return function (x) { return !x || String(x).length >= n ? '' : msg; }; },
    phone: function (msg) { return function (x) { return !x || String(x).replace(/\D/g, '').length >= 8 ? '' : (msg || 'Enter a valid phone number, for example 076 123 456.'); }; },
    pin: function (msg) { return function (x) { return !x || /^\d{4,6}$/.test(x) ? '' : (msg || 'Your PIN must be 4 to 6 numbers.'); }; },
    digits: function (n, msg) { return function (x) { return !x || new RegExp('^\\d{' + n + '}$').test(x) ? '' : msg; }; },
    number: function (o, msg) { return function (x) { if (x === '' || x == null) return ''; var n = Number(x); if (isNaN(n)) return msg; if (o.min != null && n < o.min) return msg; if (o.max != null && n > o.max) return msg; if (o.integer && Math.floor(n) !== n) return msg; return ''; }; },
    same: function (other, msg) { return function (x, all) { return !x || x === all[other] ? '' : msg; }; },
    when: function (cond, rules) { return function (x, all) { if (!cond(all)) return ''; for (var i = 0; i < rules.length; i++) { var e = rules[i](x, all); if (e) return e; } return ''; }; },
    custom: function (fn) { return fn; }
  });
  EMI.validate = function (values, rules) {
    var errors = {}, any = false;
    Object.keys(rules).forEach(function (k) {
      var list = rules[k];
      for (var i = 0; i < list.length; i++) { var e = list[i](values[k], values); if (e) { errors[k] = e; any = true; break; } }
    });
    return any ? errors : null;
  };

  /**
   * The one way forms talk to the server:
   * EMI.submit(form, {rules | validate(values), busy: 'Sending...', request(values) -> Promise,
   *                   success(result, values), mapError(err) -> {field: msg} | string})
   * Handles validation, the busy state, double taps, offline/timeouts, an expired session,
   * and a user who has already moved to another screen when the answer arrives.
   */
  EMI.submit = function (f, o) {
    if (f.dataset.busy === '1') return;
    var values = form.values(f);
    var errors = o.rules ? EMI.validate(values, o.rules) : null;
    if (!errors && o.validate) errors = o.validate(values) || null;
    if (errors) { form.setErrors(f, errors); return; }
    form.clearErrors(f);
    var token = EMI.route.token;
    form.busy(f, true, o.busy);
    Promise.resolve().then(function () { return o.request(values); }).then(function (r) {
      form.busy(f, false);
      if (token !== EMI.route.token) { if (o.staleToast) EMI.toast(o.staleToast); return; }
      EMI.state.focusPending = true;
      o.success(r, values);
    }, function (err) {
      form.busy(f, false);
      if (err && err.status === 401 && !o.noAuth) return EMI.sessionExpired();
      if (token !== EMI.route.token) return;
      var mapped = o.mapError ? o.mapError(err) : null;
      if (mapped && typeof mapped === 'object') return form.setErrors(f, mapped);
      var msg = typeof mapped === 'string' ? mapped : err.message;
      if (err.kind === 'offline' && o.offlineHint) msg += ' ' + o.offlineHint;
      form.setErrors(f, { _form: msg });
    });
  };

  // ---------------------------------------------------------------- toast
  var region;
  function toastRegion() {
    if (region && document.body.contains(region)) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
    return region;
  }
  /** EMI.toast(message, isError) - short confirmation above the tab bar; tap to dismiss; pauses while the app is hidden. */
  EMI.toast = ui.toast = function (msg, isErr) {
    var reg = toastRegion();
    reg.setAttribute('aria-live', isErr ? 'assertive' : 'polite');
    Array.prototype.forEach.call(reg.children, function (o) { hideToast(o, true); });
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' toast--error' : '');
    el.textContent = msg;
    reg.appendChild(el);
    el.getBoundingClientRect();
    el.classList.add('is-in');
    el.addEventListener('click', function () { hideToast(el); });
    var left = isErr ? 6000 : 3500, started = Date.now(), timer;
    function run() { started = Date.now(); timer = setTimeout(function () { hideToast(el); }, left); }
    function vis() { if (document.hidden) { clearTimeout(timer); left -= Date.now() - started; } else run(); }
    el._stop = function () { clearTimeout(timer); document.removeEventListener('visibilitychange', vis); };
    document.addEventListener('visibilitychange', vis);
    run();
  };
  function hideToast(el, instant) {
    if (!el || el._gone) return;
    el._gone = true;
    if (el._stop) el._stop();
    if (instant) { el.remove(); return; }
    el.classList.remove('is-in'); el.classList.add('is-out');
    setTimeout(function () { el.remove(); }, 180);
  }

  // ---------------------------------------------------------------- sheet
  var sheetState = null;
  /**
   * EMI.sheet.open({title, body, actions}) - a bottom dialog. Traps focus, makes the page behind inert,
   * closes on Escape or a tap outside, and returns focus to whatever opened it.
   */
  var sheet = (EMI.sheet = {});
  sheet.open = function (o) {
    sheet.close(true);
    var titleId = ui.id('sheet-title');
    var bg = document.createElement('div');
    bg.className = 'sheet-backdrop';
    bg.innerHTML = render(h('div', { class: 'sheet', role: 'dialog', aria: { modal: 'true', labelledby: titleId }, tabindex: '-1' },
      h('div', { class: 'sheet__grip', aria: { hidden: 'true' } }),
      h('h2', { class: 'sheet__title', id: titleId }, o.title),
      o.body, o.actions || ui.button({ label: 'Close', variant: 'secondary', act: 'closeSheet' })));
    bg.addEventListener('click', function (e) { if (e.target === bg) sheet.close(); });
    var root = EMI.root();
    sheetState = { el: bg, returnTo: document.activeElement };
    root.setAttribute('aria-hidden', 'true'); root.inert = true;
    document.body.appendChild(bg);
    bg.getBoundingClientRect();
    bg.classList.add('is-open');
    var dlg = bg.querySelector('.sheet');
    var first = dlg.querySelector('button, [href], input, select, textarea');
    (first || dlg).focus({ preventScroll: true });
  };
  sheet.close = function (instant) {
    if (!sheetState) return;
    var st = sheetState; sheetState = null;
    var root = EMI.root();
    root.removeAttribute('aria-hidden'); root.inert = false;
    if (st.returnTo && document.body.contains(st.returnTo)) st.returnTo.focus({ preventScroll: true });
    if (instant) { st.el.remove(); return; }
    st.el.classList.remove('is-open'); st.el.classList.add('is-closing');
    setTimeout(function () { st.el.remove(); }, 220);
  };
  EMI.closeSheet = function () { sheet.close(); };
  EMI.actions.closeSheet = function () { sheet.close(); };
  document.addEventListener('keydown', function (e) {
    if (!sheetState) return;
    if (e.key === 'Escape') { e.preventDefault(); sheet.close(); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(sheetState.el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // --------------------------------------------------------------- app shell
  ui.appBar = function (o) {
    var s = EMI.session();
    return h('header', { class: ['appbar', o.back && 'appbar--back'] },
      o.back ? ui.iconButton({ icon: 'back', label: 'Back', act: 'back' }) : h('img', { class: 'appbar__mark', src: 'img/mark-square.png', alt: '' }),
      h('div', { class: 'appbar__titles' },
        h('h1', { class: 'appbar__title', id: 'page-title', tabindex: '-1' }, o.title || 'Enhanced Mutual'),
        h('span', { class: 'appbar__sub' }, o.subtitle || 'Insurance (SL) Ltd')),
      s ? ui.iconButton({ icon: 'bell', label: 'Notifications', act: 'go', to: '#/inbox', count: o.unread || 0 }) : null);
  };
  var NAV = {
    client: [['home', 'Home', 'home', '#/home'], ['policy', 'Policies', 'shield', '#/policies'], ['claims', 'Claims', 'claim', '#/claims'], ['loans', 'Loans', 'loan', '#/loans'], ['more', 'More', 'more', '#/more']],
    applicant: [['applicant', 'Applications', 'list', '#/applicant'], ['plans', 'Plans', 'plan', '#/plans'], ['account', 'Account', 'user', '#/account']]
  };
  ui.tabBar = function (active) {
    var s = EMI.session();
    var items = NAV[s && s.kind === 'applicant' ? 'applicant' : 'client'];
    return h('nav', { class: 'tabbar', aria: { label: 'Main' } }, items.map(function (i) {
      return h('a', { class: 'tabbar__item', href: i[3], aria: { current: active === i[0] ? 'page' : null } }, ui.icon(i[2]), h('span', null, i[1]));
    }));
  };

  /**
   * EMI.screen({title, subtitle, back, nav, unread, offline, loading, body})
   * Renders the whole screen. body may be SafeHtml, an array of components, or plain text.
   * Sets the document title and, after a navigation, moves focus to the page title.
   */
  EMI.screen = function (o) {
    var html = render([
      ui.appBar(o),
      o.offline ? h('p', { class: 'statusbar', role: 'status' }, 'You are offline - showing your last saved information') : null,
      h('main', { class: ['page', o.nav && 'page--nav'], id: 'view', aria: { labelledby: 'page-title', busy: o.loading ? 'true' : null } },
        o.loading ? h('p', { class: 'visually-hidden', role: 'status' }, 'Loading') : null, o.body),
      o.nav ? ui.tabBar(o.nav) : null
    ]);
    EMI.root().innerHTML = html;
    document.title = (o.title && o.title !== 'Enhanced Mutual' ? o.title + ' - ' : '') + 'Enhanced Mutual';
    if (EMI.state.scrollReset) { window.scrollTo(0, 0); if (!o.loading) EMI.state.scrollReset = false; }
    if (!o.loading && EMI.state.focusPending) {
      EMI.state.focusPending = false;
      var t = document.getElementById('page-title');
      if (t) t.focus({ preventScroll: true });
    }
  };

  /** EMI.sessionExpired() - clears the session and sends the person to the right login screen. */
  EMI.sessionExpired = function () {
    var s = EMI.session();
    EMI.clearSession();
    EMI.state.sessionExpired = true;
    EMI.route.go(s && s.kind === 'applicant' ? '#/applicant-login' : '#/login');
  };

  /**
   * EMI.page({title, subtitle, nav, back, skeleton, load, render, after})
   * The standard data screen: shows a skeleton while load() runs, then render(data) which returns
   * a body or {body, title, subtitle, unread, offline}. Failed loads show an error state with retry,
   * an expired session goes to login, and an answer that arrives after the person has moved on is dropped.
   */
  EMI.page = function (o) {
    var token = EMI.route.token;
    EMI.screen({ title: o.title, subtitle: o.subtitle, nav: o.nav, back: o.back, loading: true, body: ui.skeleton(o.skeleton) });
    Promise.resolve().then(o.load).then(function (data) {
      if (token !== EMI.route.token) return;
      var out = o.render(data);
      if (!out || ui.isSafe(out) || Array.isArray(out) || typeof out === 'string') out = { body: out };
      EMI.screen({ title: out.title || o.title, subtitle: out.subtitle || o.subtitle, nav: o.nav, back: o.back, unread: out.unread, offline: out.offline, body: out.body });
      if (o.after) o.after(data);
    }).catch(function (err) {
      if (token !== EMI.route.token) return;
      if (err && err.status === 401) return EMI.sessionExpired();
      if (window.console) console.error(err);
      EMI.screen({ title: o.title, subtitle: o.subtitle, nav: o.nav, back: o.back, body: ui.errorState(err) });
    });
  };
})();
