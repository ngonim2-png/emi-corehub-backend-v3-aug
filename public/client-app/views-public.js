/* Screens available before login: welcome, client login and PIN setup, plans, applicant sign-up.
   Also shared cards used across the app (help, install, notifications). */
(function () {
  'use strict';
  var EMI = window.EMI, ui = EMI.ui, h = ui.h, v = EMI.rules;

  var POLICY_INPUT = { autocapitalize: 'characters', placeholder: 'e.g. SSP037' };
  function policyField(value, extra) { return ui.field(Object.assign({ id: 'policyNo', label: 'Policy number', value: value, required: true, autocomplete: 'username' }, POLICY_INPUT, extra || {})); }
  function phoneField(o) { return ui.field(Object.assign({ id: 'phone', label: 'Your phone number', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: 'e.g. 076 123 456', required: true }, o || {})); }
  var PIN_HINT = 'Pick something you will remember but others cannot guess - not 1234 or your birth year.';
  function stripCode(msg) { return String(msg || '').replace(/^[A-Z_]+:\s*/, ''); }
  var lastPolicy = function () { return EMI.store.get('emi_last_policy') || ''; };

  // ------------------------------------------------------------ shared cards
  /** "Need help?" card with the office phone / WhatsApp, if configured. */
  EMI.contactCard = function () {
    var c = EMI.state.config || {};
    if (!c.officePhone && !c.officeWhatsapp) return null;
    return ui.card({ tag: 'section', label: 'Contact the office' }, [
      h('h2', { class: 'card__title' }, 'Need help?'),
      h('p', { class: 'small muted' }, 'Our team is happy to help you.' + (c.officePhone ? ' Call ' + c.officePhone + '.' : '')),
      ui.buttonRow([
        c.officePhone ? ui.button({ label: 'Call the office', variant: 'outline', size: 'sm', icon: 'phone', href: 'tel:' + c.officePhone.replace(/\s/g, '') }) : null,
        c.officeWhatsapp ? ui.button({ label: 'WhatsApp', variant: 'outline', size: 'sm', icon: 'message', href: 'https://wa.me/' + c.officeWhatsapp.replace(/[^\d]/g, '') }) : null
      ])
    ]);
  };
  /** Android gets a real install button; iPhone gets the Share > Add to Home Screen steps. */
  EMI.installCard = function () {
    if (EMI.isStandalone()) return null;
    if (EMI.state.installEvt) return ui.card({ tone: 'note' }, [h('h2', { class: 'card__title' }, 'Install this app'), h('p', { class: 'small' }, 'Add it to your home screen so it opens like any other app.'), ui.button({ label: 'Install app', variant: 'secondary', size: 'sm', act: 'install' })]);
    if (EMI.isIos()) return ui.card({ tone: 'note' }, [h('h2', { class: 'card__title' }, 'Add to your Home Screen'), h('p', { class: 'small' }, 'In Safari tap the Share button, then Add to Home Screen. It will then open like a normal app and can send you notifications.')]);
    return null;
  };
  /** Placeholder that fillPushCard() turns into a "turn on notifications" prompt when that makes sense. */
  EMI.pushCard = function () { return (EMI.pushSupported() || EMI.isIos()) ? h('div', { id: 'pushCard', hidden: true }) : null; };
  EMI.fillPushCard = function () {
    var el = document.getElementById('pushCard');
    if (!el) return;
    EMI.pushState().then(function (st) {
      if (!document.body.contains(el) || st === 'on' || (st === 'unsupported' && !EMI.isIos())) return;
      el.outerHTML = String(st === 'blocked'
        ? ui.alert({ tone: 'info', body: 'Notifications are blocked. You can allow them in your phone settings to get updates instantly.' })
        : ui.card({ tone: 'note', id: 'pushCard' }, [h('h2', { class: 'card__title' }, 'Never miss an update'), h('p', { class: 'small' }, 'Turn on notifications for payment receipts and updates on your claims, loans and applications.'), ui.button({ label: 'Turn on notifications', variant: 'secondary', size: 'sm', act: 'enablePush', icon: 'bell' })]));
    });
  };
  EMI.actions.enablePush = function (el) {
    el.disabled = true; el.setAttribute('aria-busy', 'true');
    EMI.enablePush().then(function () { EMI.toast('Notifications are on'); EMI.route.refresh(); })
      .catch(function (e) { el.disabled = false; el.removeAttribute('aria-busy'); EMI.toast(e.message, true); });
  };

  // ------------------------------------------------------------------ welcome
  EMI.views.landing = function () {
    EMI.screen({
      title: 'Enhanced Mutual', subtitle: 'Insurance (SL) Ltd',
      body: [
        h('div', { class: 'welcome' },
          h('img', { class: 'welcome__logo', src: 'img/logo-full.png', alt: 'Enhanced Mutual Insurance' }),
          h('h2', { class: 'welcome__title' }, 'Welcome'),
          h('p', { class: 'muted' }, 'Your policy, payments, claims and loans - all in one place.')),
        ui.stack([
          ui.button({ label: 'I am a client - log in', variant: 'secondary', href: '#/login' }),
          ui.button({ label: 'New here? See our plans & apply', variant: 'primary', href: '#/plans' })
        ]),
        EMI.installCard(), EMI.contactCard()
      ]
    });
  };

  // ------------------------------------------------------------- client login
  EMI.views.login = function () {
    var expired = EMI.state.sessionExpired; EMI.state.sessionExpired = false;
    EMI.screen({
      back: true, title: 'Client login', subtitle: 'Enhanced Mutual',
      body: [
        expired ? ui.alert({ tone: 'warning', live: true, title: 'You have been logged out', body: 'For your safety, please log in again.' }) : null,
        ui.card({}, [
          ui.pageHead({ title: 'Log in', sub: 'Enter your policy number and your PIN.' }),
          ui.form({ name: 'login', submit: { label: 'Log in' }, children: [policyField(lastPolicy()), ui.pinField({ id: 'pin', label: 'PIN', autocomplete: 'current-password' })] }),
          ui.links([ui.link({ label: 'First time here? Set up your PIN', to: '#/activate' }), ui.link({ label: 'Forgot your PIN?', to: '#/recover' })])
        ]),
        h('p', { class: 'center small muted' }, 'Not a client yet? ', ui.link({ label: 'See our plans', to: '#/plans' }))
      ]
    });
  };
  EMI.actions.loginSubmit = function (form) {
    EMI.submit(form, {
      noAuth: true, busy: 'Checking...',
      rules: { policyNo: [v.required('Enter your policy number.')], pin: [v.required('Enter your PIN.'), v.pin()] },
      request: function (x) { return EMI.api('POST', '/auth/login', { policyNo: x.policyNo, pin: x.pin }, { noAuth: true }); },
      mapError: function (e) { return stripCode(e.message); },
      success: function (r, x) {
        EMI.store.set('emi_last_policy', x.policyNo.toUpperCase());
        EMI.setSession({ kind: 'client', token: r.token, name: r.clientName });
        EMI.route.go('#/home');
      }
    });
  };

  // ----------------------------------------------------- first-time PIN setup
  // Policy number + the phone number the company holds + a PIN typed twice. No SMS needed.
  EMI.views.activate = function () {
    EMI.screen({
      back: true, title: 'Set up your PIN', subtitle: 'First time here',
      body: [
        ui.card({}, [
          ui.pageHead({ title: 'Create your PIN', sub: 'Enter your policy number and the phone number the company has for you, then choose a PIN. You will log in with your policy number and this PIN from now on.' }),
          ui.form({ name: 'activateDirect', submit: { label: 'Save PIN & log in' }, children: [
            policyField(lastPolicy(), { autocomplete: 'off' }), phoneField(),
            ui.pinField({ id: 'pin', label: 'Choose a PIN (4 to 6 numbers)', autocomplete: 'new-password', hint: PIN_HINT }),
            ui.pinField({ id: 'pin2', label: 'Type the PIN again', autocomplete: 'new-password' })
          ] }),
          ui.links([ui.link({ label: 'My phone number has changed - I have a code from the office', act: 'haveOfficeCode' })])
        ]),
        EMI.contactCard()
      ]
    });
  };
  var PIN_RULES = { pin: [v.required('Choose a PIN.'), v.pin()], pin2: [v.required('Type your PIN again.'), v.same('pin', 'The two PINs are not the same. Please type them again.')] };
  EMI.actions.haveOfficeCode = function () { EMI.state.act = { step: 2, policyNo: '' }; EMI.route.go('#/recover'); };
  EMI.actions.activateDirectSubmit = function (form) {
    EMI.submit(form, {
      noAuth: true, busy: 'Saving...',
      rules: Object.assign({ policyNo: [v.required('Enter your policy number.')], phone: [v.required('Enter your phone number.'), v.phone()] }, PIN_RULES),
      request: function (x) { return EMI.api('POST', '/auth/activate/direct', { policyNo: x.policyNo, phone: x.phone, pin: x.pin, pinConfirm: x.pin2 }, { noAuth: true }); },
      mapError: function (e) { return stripCode(e.message); },
      success: function (r, x) {
        EMI.store.set('emi_last_policy', x.policyNo.toUpperCase());
        EMI.setSession({ kind: 'client', token: r.token, name: r.clientName });
        EMI.toast('PIN saved. Welcome!');
        EMI.route.go('#/home');
      }
    });
  };

  // ----------------------------------------- forgot PIN (SMS code) / code from the office
  EMI.views.recover = function () {
    var st = (EMI.state.act = EMI.state.act || { step: 1 });
    if (st.step === 1) {
      EMI.screen({
        back: true, title: 'Reset your PIN', subtitle: 'Step 1 of 2',
        body: [
          ui.card({}, [
            ui.pageHead({ title: 'Forgot your PIN?', sub: 'Enter your policy number and the phone number the company has for you. We will text you a 6-digit code to set a new PIN.' }),
            ui.form({ name: 'activateStart', submit: { label: 'Send me a code' }, children: [policyField(st.policyNo || lastPolicy(), { autocomplete: 'off' }), phoneField({ value: st.phone })] }),
            ui.links([ui.link({ label: 'I already have a code (from the office or by SMS)', act: 'activateHaveCode' })])
          ]),
          ui.alert({ tone: 'info', body: 'Phone number changed or not receiving the code? Visit or call the office and ask for a setup code for your policy.' }),
          EMI.contactCard()
        ]
      });
      return;
    }
    EMI.screen({
      back: true, title: 'Reset your PIN', subtitle: 'Step 2 of 2',
      body: ui.card({}, [
        ui.pageHead({ title: 'Enter your code and choose a new PIN' }),
        st.sent ? ui.alert({ tone: 'success', live: true, body: 'If your details matched, we have sent a 6-digit code by SMS to the phone we hold for you. It is valid for 15 minutes.' }) : null,
        ui.form({ name: 'activateComplete', submit: { label: 'Save PIN & log in' }, children: [
          st.policyNo ? null : policyField('', { autocomplete: 'off' }),
          ui.field({ id: 'code', label: '6-digit code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete: 'one-time-code', placeholder: '123456', variant: 'code', required: true }),
          ui.pinField({ id: 'pin', label: 'Choose a new PIN (4 to 6 numbers)', autocomplete: 'new-password', hint: PIN_HINT }),
          ui.pinField({ id: 'pin2', label: 'Type the PIN again', autocomplete: 'new-password' })
        ] }),
        ui.links([ui.link({ label: 'Send a new code', act: 'activateBack' })])
      ])
    });
  };
  EMI.actions.activateHaveCode = function () { EMI.state.act = { step: 2, policyNo: '' }; EMI.route.refresh(); };
  EMI.actions.activateBack = function () { var st = EMI.state.act || {}; EMI.state.act = { step: 1, policyNo: st.policyNo, phone: st.phone }; EMI.route.refresh(); };
  EMI.actions.activateStartSubmit = function (form) {
    EMI.submit(form, {
      noAuth: true, busy: 'Sending...',
      rules: { policyNo: [v.required('Enter your policy number.')], phone: [v.required('Enter your phone number.'), v.phone()] },
      request: function (x) { return EMI.api('POST', '/auth/activate/start', { policyNo: x.policyNo, phone: x.phone }, { noAuth: true }); },
      success: function (r, x) { EMI.state.act = { step: 2, policyNo: x.policyNo, phone: x.phone, sent: true }; EMI.route.refresh(); }
    });
  };
  EMI.actions.activateCompleteSubmit = function (form) {
    var st = EMI.state.act || {};
    EMI.submit(form, {
      noAuth: true, busy: 'Saving...',
      rules: Object.assign({ policyNo: st.policyNo ? [] : [v.required('Enter your policy number.')], code: [v.required('Enter the 6-digit code.'), v.digits(6, 'The code has 6 numbers.')] }, PIN_RULES),
      request: function (x) { return EMI.api('POST', '/auth/activate/complete', { policyNo: st.policyNo || x.policyNo, code: x.code, pin: x.pin }, { noAuth: true }); },
      success: function (r, x) {
        EMI.store.set('emi_last_policy', (st.policyNo || x.policyNo).toUpperCase());
        EMI.state.act = null;
        EMI.setSession({ kind: 'client', token: r.token, name: r.clientName });
        EMI.toast('PIN saved. Welcome!');
        EMI.route.go('#/home');
      }
    });
  };

  // ------------------------------------------------------------------- plans
  function loadProducts() {
    if (EMI.state.products) return Promise.resolve(EMI.state.products);
    return EMI.api('GET', '/products', null, { noAuth: true }).then(function (r) { EMI.state.products = r; return r; });
  }
  EMI.loadProducts = loadProducts;
  function planIcon(p) { return p.formType === 'education' ? 'plan' : 'shield'; }

  EMI.views.plans = function () {
    var s = EMI.session(), isApplicant = s && s.kind === 'applicant';
    EMI.page({
      title: 'Our plans', subtitle: 'Enhanced Mutual', nav: isApplicant ? 'plans' : null, back: !isApplicant, skeleton: 'list',
      load: function () { EMI.state.products = null; return loadProducts(); },
      render: function (rows) {
        return [
          ui.pageHead({ title: 'Choose a plan', sub: 'Tap a plan to see the details and apply.' }),
          rows.length
            ? h('div', { class: 'stack' }, rows.map(function (p) { return ui.card({ href: '#/plan/' + encodeURIComponent(p.id) }, ui.media({ icon: planIcon(p), title: p.name, text: p.description || p.category, chevron: true })); }))
            : ui.card({}, ui.emptyState({ icon: 'plan', title: 'No plans open right now', body: 'No plans are open for online application at the moment. Please contact the office to apply.' })),
          s ? null : h('p', { class: 'center small muted' }, 'Already a client? ', ui.link({ label: 'Log in', to: '#/login' })),
          EMI.contactCard()
        ];
      }
    });
  };

  EMI.views.plan = function (params) {
    EMI.page({
      title: 'Plan details', subtitle: 'Enhanced Mutual', back: true, skeleton: 'detail',
      load: loadProducts,
      render: function (rows) {
        var p = rows.filter(function (x) { return x.id === params.id; })[0];
        if (!p) return ui.card({}, ui.emptyState({ icon: 'search', title: 'This plan is no longer available', body: 'It may have been closed for online applications.', action: ui.button({ label: 'See all plans', variant: 'secondary', href: '#/plans' }) }));
        return {
          title: p.name, subtitle: 'Plan details',
          body: [
            ui.card({}, [
              ui.media({ icon: planIcon(p), title: p.name, level: 'h2', extra: h('div', null, ui.badge(p.category, 'neutral')) }),
              p.description ? h('p', null, p.description) : null,
              p.minPremium > 0 ? ui.dl([['Suggested monthly premium', EMI.money(p.minPremium) + (p.maxPremium > p.minPremium ? ' to ' + EMI.money(p.maxPremium) : '')]]) : null
            ]),
            ui.card({ tone: 'note', tag: 'section', label: 'How applying works' }, [
              h('h2', { class: 'card__title' }, 'How applying works'),
              h('ol', { class: 'steps-list' },
                h('li', null, 'Create a free account with your phone number.'),
                h('li', null, 'Fill in the application (about 5 minutes).'),
                h('li', null, 'An officer reviews it and contacts you about your first premium.'),
                h('li', null, 'Once approved and your first premium is received, you log in with your policy number.'))
            ]),
            ui.button({ label: 'Apply for this plan', act: 'applyTo', data: { id: p.id } })
          ]
        };
      }
    });
  };
  EMI.actions.applyTo = function (el) {
    var id = el.dataset.id, s = EMI.session();
    if (s && s.kind === 'applicant') return EMI.route.go('#/apply/' + encodeURIComponent(id));
    if (s && s.kind === 'client') {
      return EMI.sheet.open({
        title: 'You are logged in as a client',
        body: h('p', { class: 'muted' }, 'To take out another plan, please contact the office or your marketer. They can add it to your existing account.'),
        actions: ui.stack([EMI.contactCard(), ui.button({ label: 'OK', variant: 'secondary', act: 'closeSheet' })])
      });
    }
    EMI.state.afterLogin = '#/apply/' + encodeURIComponent(id);
    EMI.route.go('#/register');
  };

  // -------------------------------------------------------- applicant sign up / login
  EMI.views.register = function () {
    EMI.screen({
      back: true, title: 'Create your account', subtitle: 'New applicants',
      body: ui.card({}, [
        ui.pageHead({ title: 'Create a free account', sub: 'This lets you apply and follow your application. You will log in with your phone number and a PIN.' }),
        ui.form({ name: 'register', submit: { label: 'Create account' }, children: [
          ui.field({ id: 'fullName', label: 'Full name', autocomplete: 'name', placeholder: 'As on your ID', required: true }),
          phoneField({ label: 'Mobile number' }),
          ui.pinField({ id: 'pin', label: 'Choose a PIN (4 to 6 numbers)', autocomplete: 'new-password', hint: PIN_HINT }),
          ui.pinField({ id: 'pin2', label: 'Type the PIN again', autocomplete: 'new-password' })
        ] }),
        ui.links([ui.link({ label: 'I already have an account', to: '#/applicant-login' })])
      ])
    });
  };
  EMI.actions.registerSubmit = function (form) {
    EMI.submit(form, {
      noAuth: true, busy: 'Creating...',
      rules: Object.assign({ fullName: [v.required('Enter your full name.'), v.minLength(3, 'Enter your full name as on your ID.')], phone: [v.required('Enter your mobile number.'), v.phone()] }, PIN_RULES),
      request: function (x) { return EMI.api('POST', '/auth/applicant/register', { fullName: x.fullName, phone: x.phone, pin: x.pin }, { noAuth: true }); },
      mapError: function (e) { return /phone number already has an account/i.test(e.message) ? { phone: e.message } : e.message; },
      success: function (r, x) {
        EMI.setSession({ kind: 'applicant', token: r.token, name: r.fullName, phone: x.phone });
        var next = EMI.state.afterLogin; EMI.state.afterLogin = null;
        EMI.route.go(next || '#/applicant');
      }
    });
  };

  EMI.views.applicantLogin = function () {
    var expired = EMI.state.sessionExpired; EMI.state.sessionExpired = false;
    EMI.screen({
      back: true, title: 'Applicant login', subtitle: 'New applicants',
      body: [
        expired ? ui.alert({ tone: 'warning', live: true, title: 'You have been logged out', body: 'Please log in again.' }) : null,
        ui.card({}, [
          ui.pageHead({ title: 'Log in', sub: 'Use the phone number and PIN you registered with. Existing clients log in with their policy number instead.' }),
          ui.form({ name: 'applicantLogin', submit: { label: 'Log in' }, children: [phoneField({ label: 'Mobile number' }), ui.pinField({ id: 'pin', label: 'PIN', autocomplete: 'current-password' })] }),
          ui.links([ui.link({ label: 'Create an account', to: '#/register' }), ui.link({ label: 'I am a client', to: '#/login' })]),
          h('p', { class: 'field__hint center' }, 'Forgot your PIN? Please contact the office.')
        ]),
        EMI.contactCard()
      ]
    });
  };
  EMI.actions.applicantLoginSubmit = function (form) {
    EMI.submit(form, {
      noAuth: true, busy: 'Checking...',
      rules: { phone: [v.required('Enter your mobile number.')], pin: [v.required('Enter your PIN.')] },
      request: function (x) { return EMI.api('POST', '/auth/applicant/login', { phone: x.phone, pin: x.pin }, { noAuth: true }); },
      success: function (r, x) {
        EMI.setSession({ kind: 'applicant', token: r.token, name: r.fullName, phone: x.phone });
        var next = EMI.state.afterLogin; EMI.state.afterLogin = null;
        EMI.route.go(next || '#/applicant');
      }
    });
  };
})();
