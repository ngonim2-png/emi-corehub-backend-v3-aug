/* Applicant screens: my applications, the application form, account. */
(function () {
  'use strict';
  var EMI = window.EMI, ui = EMI.ui, h = ui.h, v = EMI.rules;
  var DISTRICTS = ['Bo', 'Bombali', 'Bonthe', 'Falaba', 'Kailahun', 'Kambia', 'Karene', 'Kenema', 'Koinadugu', 'Kono', 'Moyamba', 'Port Loko', 'Pujehun', 'Tonkolili', 'Western Area Rural', 'Western Area Urban'];
  var TOTAL_STEPS = 4;
  var today = function () { return new Date().toISOString().slice(0, 10); };

  // ------------------------------------------------------ applicant home
  EMI.views.applicant = function () {
    EMI.page({
      title: 'My applications', subtitle: 'Enhanced Mutual', nav: 'applicant',
      load: function () { return Promise.all([EMI.api('GET', '/applicant/applications'), EMI.api('GET', '/notifications').catch(function () { return []; })]); },
      render: function (r) {
        var apps = r[0], unread = (r[1] || []).filter(function (n) { return !n.readAt; }).length;
        var s = EMI.session(), first = (s.name || '').split(' ')[0];
        var active = apps.filter(function (a) { return a.stage === 'Active'; })[0];
        return {
          unread: unread,
          body: [
            ui.pageHead({ title: 'Hello, ' + first, sub: 'Follow your applications here.' }),
            active ? ui.card({ tone: 'note' }, [h('h2', { class: 'card__title' }, 'Your policy is active'), h('p', null, 'Your policy number is ', h('strong', null, active.policyNo), '. Log in as a client to see your policy, claims and loans.'), ui.button({ label: 'Go to client login', variant: 'secondary', act: 'switchToClient', data: { policy: active.policyNo } })]) : null,
            EMI.pushCard(),
            apps.length ? h('div', { class: 'stack' }, apps.map(function (a) {
              return ui.card({ tag: 'article', label: a.productName + ' application ' + a.applicationNo }, [
                ui.cardHeader({ title: a.productName, meta: a.applicationNo + ' · ' + EMI.fmtDate(a.submittedAt), end: ui.status('application', a.stage) }),
                h('p', null, a.message),
                ui.dl([['Monthly premium', EMI.money(a.premiumAmount)], ['Policy number', a.policyNo]])
              ]);
            })) : ui.card({}, ui.emptyState({ icon: 'plan', title: 'You have not applied yet', body: 'Choose a plan and apply in about 5 minutes. An officer will contact you about your first premium.', action: ui.button({ label: 'See our plans', href: '#/plans' }) })),
            apps.length ? ui.button({ label: 'Apply for another plan', variant: 'outline', href: '#/plans' }) : null,
            EMI.contactCard()
          ]
        };
      },
      after: EMI.fillPushCard
    });
  };
  EMI.actions.switchToClient = function (el) {
    EMI.store.set('emi_last_policy', el.dataset.policy);
    EMI.clearSession();
    EMI.route.go('#/login');
  };

  // ------------------------------------------------------ account
  EMI.views.account = function () {
    var s = EMI.session();
    EMI.screen({
      title: 'Account', subtitle: 'Enhanced Mutual', nav: 'account',
      body: [
        ui.card({ tag: 'section', label: 'My details' }, [h('h2', { class: 'card__title card__title--lg' }, s.name), ui.dl([['Phone', s.phone || '-']])]),
        ui.card({ href: '#/inbox' }, ui.media({ icon: 'bell', title: 'Notifications', text: 'Messages from the office', chevron: true })),
        EMI.pushCard(), EMI.installCard(), EMI.contactCard(),
        ui.button({ label: 'Log out', variant: 'outline', act: 'logout' })
      ]
    });
    EMI.fillPushCard();
  };

  // ------------------------------------------------------ application form
  // The draft is kept on the phone so an interrupted application (weak signal, low battery) is never lost.
  function draftKey(id) { return 'emi_draft_' + id; }
  function loadDraft(id, name, phone) {
    var d = null;
    try { d = JSON.parse(EMI.store.get(draftKey(id)) || 'null'); } catch (e) { d = null; }
    if (d && d.form) return d;
    var d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() + 1);
    var first = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-01';
    return { step: 1, premiumAmount: '', durationYears: '', commencementDate: first, isCivilServant: false, payrollPin: '', form: { fullName: name || '', phone: phone || '', nationality: 'Sierra Leonean', smsConsent: true, beneficiaries: [{ name: '', relationship: '', dob: '', address: '', phone: '', sharePct: 100 }], lifeAssured: { name: '', dob: '', sex: '', relationship: '', school: '' } } };
  }
  function saveDraft() { var a = EMI.state.apply; if (a) EMI.store.set(draftKey(a.product.id), JSON.stringify(a.d)); }

  EMI.views.apply = function (params) {
    var s = EMI.session();
    EMI.page({
      title: 'Apply', subtitle: 'Enhanced Mutual', nav: 'plans', back: true, skeleton: 'form',
      load: EMI.loadProducts,
      render: function (rows) {
        var product = rows.filter(function (p) { return p.id === decodeURIComponent(params.id); })[0];
        if (!product) return ui.card({}, ui.emptyState({ icon: 'search', title: 'This plan is no longer available', body: 'It may have been closed for online applications.', action: ui.button({ label: 'See all plans', variant: 'secondary', href: '#/plans' }) }));
        var cur = EMI.state.apply;
        if (!cur || cur.product.id !== product.id) EMI.state.apply = { product: product, d: loadDraft(product.id, s.name, s.phone), files: { passport: null, idDoc: null } };
        return applyScreen();
      }
    });
  };
  function renderApply() { var o = applyScreen(); EMI.screen({ back: true, title: o.title, subtitle: o.subtitle, nav: 'plans', body: o.body }); }

  var STEP_TITLES = function (edu) { return ['Your plan', edu ? 'Policyholder details' : 'Your personal details', edu ? 'The child' : 'Beneficiaries', 'Photos & confirm']; };

  function applyScreen() {
    var a = EMI.state.apply, d = a.d, f = d.form, p = a.product, edu = p.formType === 'education';
    var titles = STEP_TITLES(edu), step = d.step, fields;
    if (step === 1) {
      fields = [
        ui.card({}, ui.media({ icon: edu ? 'plan' : 'shield', title: p.name, text: p.description || p.category })),
        ui.field({ id: 'premiumAmount', label: 'How much do you want to pay each month? (NLe)', type: 'number', inputmode: 'decimal', min: 0, value: d.premiumAmount, required: true, hint: p.minPremium > 0 ? 'Suggested: ' + EMI.money(p.minPremium) + (p.maxPremium > p.minPremium ? ' to ' + EMI.money(p.maxPremium) : '') : null }),
        ui.field({ id: 'durationYears', label: 'Length of the plan (years)', type: 'number', inputmode: 'numeric', min: 1, max: 60, value: d.durationYears, required: true, hint: 'For example 5, 10 or 20' }),
        ui.field({ id: 'commencementDate', label: 'Start date', type: 'date', value: d.commencementDate, required: true }),
        ui.card({}, [
          ui.checkbox({ id: 'isCivilServant', label: 'I am a civil servant and want my premium taken from my salary (payroll deduction)', checked: d.isCivilServant }),
          h('div', { id: 'csBox', class: 'stack', hidden: !d.isCivilServant },
            ui.field({ id: 'payrollPin', label: 'Payroll PIN', value: d.payrollPin, placeholder: 'Your Accountant General payroll PIN', required: true }),
            ui.field({ id: 'institution', label: 'Ministry or institution', value: f.institution, placeholder: 'e.g. Ministry of Education', required: true }))
        ])
      ];
    } else if (step === 2) {
      fields = [
        edu ? ui.alert({ tone: 'info', body: 'This is the parent or guardian who will pay the premium.' }) : null,
        ui.field({ id: 'fullName', label: 'Full name', value: f.fullName, autocomplete: 'name', required: true }),
        ui.fieldRow([ui.select({ id: 'gender', label: 'Sex', placeholder: 'Select...', options: ['Male', 'Female'], value: f.gender, required: true }), ui.select({ id: 'maritalStatus', label: 'Marital status', placeholder: 'Select...', options: ['Single', 'Married', 'Divorced', 'Widowed'], value: f.maritalStatus, optional: true })]),
        ui.field({ id: 'dob', label: 'Date of birth', type: 'date', value: f.dob, max: today(), required: true, autocomplete: 'bday' }),
        ui.field({ id: 'placeOfBirth', label: 'Place of birth', value: f.placeOfBirth, optional: true }),
        ui.field({ id: 'nationality', label: 'Nationality', value: f.nationality, required: true }),
        ui.field({ id: 'nin', label: 'National ID number (NIN)', value: f.nin, optional: true }),
        ui.field({ id: 'address', label: 'Home address', value: f.address, autocomplete: 'street-address', required: true }),
        ui.select({ id: 'district', label: 'District', placeholder: 'Select...', options: DISTRICTS, value: f.district, optional: true }),
        ui.field({ id: 'phone', label: 'Mobile number', type: 'tel', inputmode: 'tel', value: f.phone, autocomplete: 'tel', required: true }),
        ui.field({ id: 'altPhone', label: 'Another phone number', type: 'tel', inputmode: 'tel', value: f.altPhone, optional: true }),
        ui.field({ id: 'email', label: 'Email address', type: 'email', value: f.email, autocomplete: 'email', optional: true }),
        ui.field({ id: 'occupation', label: 'Occupation', value: f.occupation, optional: true }),
        d.isCivilServant ? null : ui.field({ id: 'institution', label: 'Workplace or school', value: f.institution, optional: true })
      ];
    } else if (step === 3 && edu) {
      var la = f.lifeAssured;
      fields = [
        h('p', { class: 'small muted' }, 'The child this policy is for. Make one application per child.'),
        ui.field({ id: 'la_name', label: 'Child\'s full name', value: la.name, required: true }),
        ui.field({ id: 'la_dob', label: 'Child\'s date of birth', type: 'date', value: la.dob, max: today(), required: true }),
        ui.fieldRow([ui.select({ id: 'la_sex', label: 'Sex', placeholder: 'Select...', options: ['Male', 'Female'], value: la.sex, required: true }), ui.select({ id: 'la_rel', label: 'Relationship to you', placeholder: 'Select...', options: ['Son', 'Daughter', 'Grandchild', 'Niece / Nephew', 'Ward', 'Other'], value: la.relationship, required: true })]),
        ui.field({ id: 'la_school', label: 'School', value: la.school, required: true })
      ];
    } else if (step === 3) {
      var many = f.beneficiaries.length > 1;
      fields = [h('p', { class: 'small muted' }, 'Who should receive the benefit? You can add up to six people.' + (many ? ' Their shares must add up to 100%.' : ''))].concat(f.beneficiaries.map(function (b, i) {
        var id = function (k) { return 'b' + i + '_' + k; };
        return ui.fieldset({ legend: 'Beneficiary ' + (i + 1), data: { bene: i }, action: i > 0 ? ui.link({ label: 'Remove beneficiary ' + (i + 1), act: 'removeBene', data: { i: i } }) : null }, [
          ui.field({ id: id('name'), label: 'Full name', value: b.name, required: true }),
          ui.fieldRow([ui.field({ id: id('relationship'), label: 'Relationship', value: b.relationship, placeholder: 'e.g. Wife', required: true }), ui.field({ id: id('dob'), label: 'Date of birth', type: 'date', value: b.dob, max: today(), optional: true })]),
          ui.field({ id: id('address'), label: 'Address', value: b.address, optional: true }),
          ui.fieldRow([ui.field({ id: id('phone'), label: 'Phone', type: 'tel', inputmode: 'tel', value: b.phone, optional: true }), ui.field({ id: id('sharePct'), label: 'Share (%)', type: 'number', inputmode: 'numeric', min: 1, max: 100, value: many ? b.sharePct : 100, disabled: !many })])
        ]);
      }));
      if (f.beneficiaries.length < 6) fields.push(ui.button({ label: 'Add another beneficiary', variant: 'outline', size: 'sm', icon: 'plus', act: 'addBene' }));
    } else {
      fields = [
        h('p', { class: 'small muted' }, 'Photos help us process your application faster. You can take them with your camera.'),
        photoField('passport', 'Passport-size photo of you', a.files.passport),
        photoField('idDoc', 'Photo of your National ID or other ID', a.files.idDoc),
        ui.card({}, [ui.checkbox({ id: 'smsConsent', label: 'You may send me SMS messages about my policy.', checked: f.smsConsent !== false }), ui.checkbox({ id: 'declare', label: 'I confirm the information I have given is true and complete.' })]),
        ui.alert({ tone: 'info', body: 'After you submit, an officer will contact you about how to pay your first premium. Your cover starts once your application is approved and the first premium is received.' })
      ];
    }
    return {
      title: 'Apply: ' + p.name, subtitle: 'Step ' + step + ' of ' + TOTAL_STEPS,
      body: [
        ui.formSteps({ current: step, total: TOTAL_STEPS, label: titles[step - 1] }),
        ui.pageHead({ title: titles[step - 1] }),
        ui.form({
          name: 'applyStep', children: fields,
          submit: { label: step === TOTAL_STEPS ? 'Submit application' : 'Continue' },
          secondary: step > 1 ? ui.button({ label: 'Back', variant: 'outline', act: 'applyBack' }) : null
        }),
        h('p', { class: 'center xsmall muted' }, 'Your answers are saved on this phone as you go.')
      ]
    };
  }
  function photoField(kind, label, file) {
    return ui.fileField({ id: 'file_' + kind, label: label, optional: true, accept: 'image/*', capture: 'environment', data: { photo: kind }, thumbsId: 'th_' + kind,
      thumbs: file ? ui.thumb({ name: file.name, src: URL.createObjectURL(file), act: 'clearPhoto', data: { kind: kind } }) : null });
  }

  // Reads the current step back into the draft.
  function readStep() {
    var a = EMI.state.apply, d = a.d, f = d.form;
    var g = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    if (d.step === 1) {
      d.premiumAmount = g('premiumAmount'); d.durationYears = g('durationYears'); d.commencementDate = g('commencementDate');
      d.isCivilServant = !!(document.getElementById('isCivilServant') || {}).checked; d.payrollPin = g('payrollPin');
      if (d.isCivilServant) f.institution = g('institution');
    } else if (d.step === 2) {
      ['fullName', 'gender', 'maritalStatus', 'dob', 'placeOfBirth', 'nationality', 'nin', 'address', 'district', 'phone', 'altPhone', 'email', 'occupation'].forEach(function (k) { f[k] = g(k); });
      if (!d.isCivilServant) f.institution = g('institution');
    } else if (d.step === 3) {
      if (a.product.formType === 'education') f.lifeAssured = { name: g('la_name'), dob: g('la_dob'), sex: g('la_sex'), relationship: g('la_rel'), school: g('la_school') };
      else {
        f.beneficiaries = f.beneficiaries.map(function (b, i) {
          var o = {}; ['name', 'relationship', 'dob', 'address', 'phone', 'sharePct'].forEach(function (k) { o[k] = g('b' + i + '_' + k); });
          return o;
        });
        if (f.beneficiaries.length === 1) f.beneficiaries[0].sharePct = 100;
      }
    } else if (d.step === 4) {
      f.smsConsent = !!(document.getElementById('smsConsent') || {}).checked;
    }
  }

  function stepRules() {
    var a = EMI.state.apply, d = a.d, f = d.form;
    if (d.step === 1) return {
      premiumAmount: [v.required('Enter how much you want to pay each month.'), v.number({ min: 1 }, 'Enter an amount greater than zero.')],
      durationYears: [v.required('Enter how many years the plan should run.'), v.number({ min: 1, max: 60, integer: true }, 'Enter whole years from 1 to 60.')],
      commencementDate: [v.required('Choose a start date.')],
      payrollPin: [v.when(function (x) { return x.isCivilServant; }, [v.required('Enter your payroll PIN.')])],
      institution: [v.when(function (x) { return x.isCivilServant; }, [v.required('Enter your ministry or institution.')])]
    };
    if (d.step === 2) return {
      fullName: [v.required('Enter your full name.')], gender: [v.required('Select your sex.')], dob: [v.required('Enter your date of birth.')],
      nationality: [v.required('Enter your nationality.')], address: [v.required('Enter your home address.')],
      phone: [v.required('Enter your mobile number.'), v.phone()],
      email: [v.custom(function (x) { return !x || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? '' : 'Enter a valid email address, or leave it blank.'; })]
    };
    if (d.step === 3 && a.product.formType === 'education') return {
      la_name: [v.required('Enter the child\'s name.')], la_dob: [v.required('Enter the child\'s date of birth.')], la_sex: [v.required('Select the child\'s sex.')],
      la_rel: [v.required('Select your relationship to the child.')], la_school: [v.required('Enter the child\'s school.')]
    };
    if (d.step === 3) {
      var r = {};
      f.beneficiaries.forEach(function (b, i) {
        r['b' + i + '_name'] = [v.required('Enter beneficiary ' + (i + 1) + '\'s name.')];
        r['b' + i + '_relationship'] = [v.required('Enter beneficiary ' + (i + 1) + '\'s relationship to you.')];
        if (f.beneficiaries.length > 1) r['b' + i + '_sharePct'] = [v.required('Enter beneficiary ' + (i + 1) + '\'s share.'), v.number({ min: 1, max: 100 }, 'Enter a share from 1 to 100.')];
      });
      return r;
    }
    return { declare: [v.checked('Tick the box to confirm your information is true.')] };
  }
  function crossCheck() {
    var a = EMI.state.apply, f = a.d.form;
    if (a.d.step === 3 && a.product.formType !== 'education' && f.beneficiaries.length > 1) {
      var t = f.beneficiaries.reduce(function (s, b) { return s + Number(b.sharePct || 0); }, 0);
      if (Math.abs(t - 100) > 0.5) return { _form: 'The beneficiary shares must add up to 100%. They add up to ' + t + '% now.' };
    }
    return null;
  }

  EMI.actions.applyStepSubmit = function (form) {
    var a = EMI.state.apply;
    readStep(); saveDraft();
    var errors = EMI.validate(EMI.form.values(form), stepRules()) || crossCheck();
    if (errors) return EMI.form.setErrors(form, errors);
    if (a.d.step < TOTAL_STEPS) { a.d.step++; saveDraft(); EMI.state.focusPending = true; EMI.state.scrollReset = true; renderApply(); return; }
    submitApplication(form);
  };
  EMI.actions.applyBack = function () { readStep(); EMI.state.apply.d.step--; saveDraft(); EMI.state.focusPending = true; EMI.state.scrollReset = true; renderApply(); };
  EMI.actions.addBene = function () {
    readStep(); var list = EMI.state.apply.d.form.beneficiaries;
    list.push({ name: '', relationship: '', dob: '', address: '', phone: '', sharePct: '' }); saveDraft(); renderApply();
    var el = document.getElementById('b' + (list.length - 1) + '_name'); if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };
  EMI.actions.removeBene = function (el) { readStep(); EMI.state.apply.d.form.beneficiaries.splice(Number(el.dataset.i), 1); saveDraft(); renderApply(); EMI.toast('Beneficiary removed'); };
  EMI.actions.clearPhoto = function (el) {
    var kind = el.dataset.kind;
    EMI.state.apply.files[kind] = null;
    var t = document.getElementById('th_' + kind); if (t) t.innerHTML = '';
    var inp = document.getElementById('file_' + kind); if (inp) { inp.value = ''; inp.focus(); }
  };
  EMI.onPhotoPicked = function (input) {
    var kind = input.dataset.photo, file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { EMI.toast('Please choose a photo (JPG or PNG).', true); input.value = ''; return; }
    EMI.compressImage(file).then(function (small) {
      EMI.state.apply.files[kind] = small;
      var t = document.getElementById('th_' + kind);
      if (t) t.innerHTML = ui.render(ui.thumb({ name: small.name, src: URL.createObjectURL(small), act: 'clearPhoto', data: { kind: kind } }));
    });
  };

  function submitApplication(form) {
    var a = EMI.state.apply, d = a.d, f = d.form;
    EMI.submit(form, {
      busy: 'Sending...', staleToast: 'Your application was sent.',
      offlineHint: 'Your answers are saved on this phone - try again when you have signal.',
      request: function () {
        var payloadForm = JSON.parse(JSON.stringify(f));
        payloadForm.beneficiaries = (payloadForm.beneficiaries || []).filter(function (b) { return b.name; }).map(function (b) { b.sharePct = Number(b.sharePct || 0); return b; });
        var payload = { productId: a.product.id, premiumAmount: Number(d.premiumAmount), durationYears: Number(d.durationYears), commencementDate: d.commencementDate, isCivilServant: d.isCivilServant, payrollPin: d.isCivilServant ? d.payrollPin : undefined, form: payloadForm };
        var fd = new FormData();
        fd.append('payload', JSON.stringify(payload));
        if (a.files.passport) fd.append('passport', a.files.passport, a.files.passport.name);
        if (a.files.idDoc) fd.append('idDoc', a.files.idDoc, a.files.idDoc.name);
        return EMI.api('POST', '/applicant/applications', fd);
      },
      success: function (r) {
        EMI.store.del(draftKey(a.product.id));
        EMI.state.apply = null;
        EMI.state.focusPending = true;
        EMI.screen({ title: 'Application sent', subtitle: 'Thank you', nav: 'applicant', body: ui.successState({
          title: 'Application received', reference: r.applicationNo,
          body: 'An officer will contact you about how to pay your first premium. You can follow the progress here any time.',
          actions: ui.button({ label: 'View my applications', variant: 'secondary', href: '#/applicant' })
        }) });
      }
    });
  }
})();
