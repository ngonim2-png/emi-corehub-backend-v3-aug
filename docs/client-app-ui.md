# Client app UI system

The client app (`public/client-app/`) is plain JavaScript with no build step, so it runs on older Android phones and is served straight from the backend at `/app/`. This document covers the UI system that every screen is built from.

| File | Contents |
|---|---|
| `styles.css` | Design tokens and all component styles |
| `core.js` | State, storage, formatting, API client, push notifications, install prompt |
| `ui.js` | Components (`EMI.ui`), form runtime (`EMI.form`, `EMI.validate`, `EMI.submit`), toast, sheet, app shell, `EMI.page` |
| `views-*.js` | Screens: public, applicant, client |
| `main.js` | Router, global event delegation, connectivity handling |

Load order: `core.js`, `ui.js`, then the views, then `main.js`. When any of these files change, bump `?v=` in `index.html` and `VERSION` in `sw.js` so installed apps pick up the change.

## Three rules

1. **Strings are text; `ui.raw()` is markup.** Components return `SafeHtml`. Any plain string passed as a child is escaped, so server data can never inject HTML. Use `ui.raw()` only for markup you wrote yourself, and never for server data.
2. **No inline event handlers.** The server's Content Security Policy blocks them. Use `data-act="name"` on a button, which calls `EMI.actions.name(el, event)`. A `<form data-form="name">` calls `EMI.actions.nameSubmit(form)` when it is submitted.
3. **Style only through tokens.** Components use the semantic tokens (`--surface`, `--text-muted`, `--danger` and so on), never raw hex values. To restyle the app, including a future dark theme, redefine the tokens.

## A screen, end to end

```js
EMI.views.claims = function () {
  EMI.page({
    title: 'Claims', nav: 'claims', skeleton: 'list',
    load: function () { return EMI.api('GET', '/claims'); },
    render: function (claims) {
      return [
        ui.button({ label: 'File a new claim', icon: 'plus', href: '#/claims/new' }),
        claims.length
          ? h('div', { class: 'stack' }, claims.map(claimCard))
          : ui.card({}, ui.emptyState({ icon: 'claim', title: 'No claims', body: 'When you file a claim you can follow every step here.' }))
      ];
    }
  });
};
```

`EMI.page` handles the states every data screen needs:

| State | What the person sees |
|---|---|
| Loading | Appbar and tab bar straight away. A skeleton shaped like the content fades in only if loading takes longer than 150ms, so fast loads never flicker. `aria-busy` is set and "Loading" is announced. |
| Loaded | `render(data)` output. Return a body, or `{body, title, subtitle, unread, offline}`. |
| Empty | Your `render` decides; use `ui.emptyState`. |
| Failed | `ui.errorState(err)` with a "Try again" button. The wording depends on `err.kind`: offline, slow connection, server problem, not found. |
| Session expired (401) | The session is cleared and the person is sent to the right login, which shows "You have been logged out". |
| Stale answer | If the person has already moved to another screen, a late response is dropped instead of drawing over the new screen. |

## Components (`EMI.ui`, usually aliased `ui`, with `h = ui.h`)

### Builder
| Call | Notes |
|---|---|
| `h(tag, attrs, ...children)` | `attrs.class` accepts a string, array or `{name: bool}`. `data: {}` and `aria: {}` expand to `data-*` and `aria-*`. `null` and `false` attributes and children are skipped. |
| `ui.raw(html)` | Trusted markup only. |
| `ui.render(node)` | Returns a string, for `innerHTML` updates. |
| `ui.cx(...)` | Class-name joiner. |
| `ui.icon(name, {size, label})` | Hidden from screen readers unless you pass `label`. Names: home, shield, claim, loan, more, bell, plan, list, user, back, chevron, check, alert, offline, clock, inbox, message, lock, doc, refresh, phone, plus, search. |

### Layout
`ui.stack(children, {gap: 'sm'|'lg'|'xs'})`, `ui.grid(children)` (two columns that stack when narrow), `ui.split(start, end)`, `ui.pageHead({title, sub})`, `ui.section({title, action}, children)`. A section is labelled by its heading.

### Actions
| Call | Notes |
|---|---|
| `ui.button({label, variant, size, inline, href, act, data, type, icon, disabled, ariaLabel})` | Variants: `primary` (gold, one per screen), `secondary` (navy), `outline`, `danger`. `href` renders a link (navigation); `act` renders a button (action). |
| `ui.buttonRow([a, b])` | Two buttons side by side; they stack below 340px. |
| `ui.link({label, to, act, href})` | Looks like a link and is at least 44px tall. |
| `ui.iconButton({icon, label, act, to, count})` | The label is required. `count` shows a badge and is read out ("3 unread"). |

### Display
| Call | Notes |
|---|---|
| `ui.card({tone, href, center, tag, label}, children)` | Tones: `hero`, `note`, `warning`, `danger`. With `href` the whole card is one link. |
| `ui.cardHeader({title, meta, end, level, large, chevron})` | Title on the left; badge or chevron on the right. Set `level` so heading order stays correct. |
| `ui.media({icon, title, text, extra, chevron})` | Icon tile with text. |
| `ui.tile({icon, label, href})` | Quick-action tile. |
| `ui.badge(text, tone)` | Tones: success, warning, danger, info, neutral. |
| `ui.status(domain, value)` | **The single source of truth for status wording and colour.** Domains: policy, claim, loan, repayment, request, application. `ui.statusLabel()` returns the text only. |
| `ui.stat({value, label, tone})`, `ui.stats([...])` | Figures. |
| `ui.dl([[label, value], ...])` | Semantic `<dl>`. Rows with an empty value are dropped automatically. |
| `ui.list([{title, text, meta, end, unread}], {label})` | Payments, notifications and similar lists. |
| `ui.disclosure({summary, open}, children)` | Native `<details>`. |
| `ui.progress({value, max, label, start, end, valueText})` | `role=progressbar` with values. |
| `ui.stepper({steps, current, complete, failed, failedLabel, label})` | Ordered list with `aria-current="step"`. Each step says "(done)", "(current step)" or "(not yet)" to screen readers. |
| `ui.formSteps({current, total, label})` | "Step 2 of 4" bar for multi-step forms. |

### Feedback
| Call | Notes |
|---|---|
| `ui.alert({tone, title, body, items, live})` | `live: true` announces it (`role=alert` for danger, `status` otherwise). |
| `ui.emptyState({icon, title, body, action})` | Say what will appear and how to make it appear. |
| `ui.errorState(err, {action, secondary})` | Wording is chosen from `err.kind`. |
| `ui.successState({title, reference, referenceLabel, body, actions})` | Confirmation screens. |
| `ui.skeleton(kind)` | Kinds: `home`, `detail`, `form`, `list`. |
| `EMI.toast(msg, isError)` | Shown in a single live region above the tab bar. Tap to dismiss. The timer pauses while the app is in the background. |
| `EMI.sheet.open({title, body, actions})`, `EMI.sheet.close()` | Bottom dialog. Traps focus, makes the page behind inert, closes on Escape or a tap outside, and returns focus to whatever opened it. |

### Forms
| Call | Notes |
|---|---|
| `ui.form({name, children, submit: {label}, secondary})` | Includes a slot for the error summary. Submitting calls `EMI.actions[name + 'Submit']`. |
| `ui.field({id, label, type, value, hint, optional, required, placeholder, inputmode, autocomplete, autocapitalize, maxlength, min, max, variant, wrapId, hidden, disabled})` | The label is tied to the input; hint and error are linked by `aria-describedby`. Mark fields `optional`; required is the default expectation. |
| `ui.pinField({id, label, autocomplete, hint})` | Numeric keypad, masked, 4 to 6 digits (non-digits are stripped as they are typed). |
| `ui.select({id, label, options, value, placeholder})` | Options can be `['A']` or `[{value, label}]`. |
| `ui.textarea`, `ui.checkbox`, `ui.fileField`, `ui.thumb`, `ui.fieldRow`, `ui.fieldset` | Same conventions. |

### Form runtime
```js
EMI.actions.loginSubmit = function (form) {
  EMI.submit(form, {
    busy: 'Checking...', noAuth: true,
    rules: { policyNo: [v.required('Enter your policy number.')], pin: [v.required('Enter your PIN.'), v.pin()] },
    request: function (x) { return EMI.api('POST', '/auth/login', { policyNo: x.policyNo, pin: x.pin }, { noAuth: true }); },
    mapError: function (e) { return e.message; },   // or {fieldId: message} to point at a field
    success: function (r, x) { /* ... */ }
  });
};
```

`EMI.submit` handles the whole submission:
- **Validation.** It validates, then shows each error under its field and marks the field `aria-invalid`. With one error it focuses that field. With several, it focuses and announces a summary whose items jump to each field.
- **Busy state and double taps.** It shows a spinner and "Checking...", and ignores repeat taps while a request is in flight.
- **Failures.** Offline, timeout and server errors appear in plain words at the top of the form. `offlineHint` adds advice, for example "Your answers are saved on this phone".
- **Session and navigation.** A 401 goes to login unless `noAuth` is set, which you need for wrong-PIN screens. If the person has left the screen, `staleToast` is shown instead of a success screen.
- **Recovery.** Errors clear as soon as the person edits the field.

Rules (`EMI.rules`, usually aliased `v`) are `required`, `checked`, `minLength`, `phone`, `pin`, `digits`, `number({min, max, integer})`, `same(otherField)`, `when(cond, rules)` and `custom(fn)`. The first failing rule for each field wins.

`EMI.form.values(form)`, `EMI.form.setErrors(form, {field: msg, _form: msg})`, `EMI.form.clearErrors(form)` and `EMI.form.busy(form, on, label)` are available for custom flows, such as the multi-step application.

## API client

`EMI.api(method, path, body, {noAuth, raw, timeout})` times out after 20 seconds, or 90 seconds for uploads. Every error has a `kind`: `offline`, `timeout`, `auth`, `forbidden`, `notFound`, `conflict`, `validation`, `rateLimit` or `server`. Server (5xx) details are replaced with a plain message, so technical errors are never shown to clients.

## Accessibility built in

- One `h1` per screen (the app bar title). After each navigation, focus moves to it and the tab title updates, so screen readers announce the new page.
- Bottom navigation uses `aria-current="page"`. The notification bell reads "Notifications, 3 unread".
- Every control has a label. Hints and errors are linked with `aria-describedby`, invalid fields get `aria-invalid`, and required fields get `aria-required`.
- Text colours meet WCAG AA contrast (checked with axe-core on every screen and state).
- Touch targets are at least 44px. Motion respects "reduce motion" (fades stay, movement goes). Text sizes are in `rem`, so the phone's text-size setting applies.
- Tested with axe-core (WCAG 2.1 A/AA plus best practice) on 13 client screens, the applicant flow, forms with errors, and the error and empty states: 0 violations.

## Responsive behaviour

- The layout is mobile-first and capped at 560px. On tablets and desktop it is centred with a soft shadow.
- Two-column grids stack automatically when narrower than two 132px columns. Button and field rows stack below 340–360px.
- Long names, receipt numbers and amounts wrap inside their cards instead of pushing the page wider. This was checked down to a 256px-wide screen with no sideways scrolling.
