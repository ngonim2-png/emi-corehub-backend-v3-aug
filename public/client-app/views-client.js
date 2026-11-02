/* Client screens: home, policies, claims, loans, messages, notifications, settings. */
(function () {
  'use strict';
  var EMI = window.EMI, ui = EMI.ui, h = ui.h, v = EMI.rules;
  var MAX_CLAIM_FILES = 8;

  // ---- data: always ask the server, fall back to the last saved copy when offline
  function loadMe(force) {
    if (EMI.state.me && !force) return Promise.resolve({ me: EMI.state.me, offline: false });
    return EMI.api('GET', '/me').then(function (me) {
      EMI.state.me = me;
      EMI.store.set('emi_cache_me', JSON.stringify(me));
      return { me: me, offline: false };
    }).catch(function (e) {
      if (e.kind === 'offline' || e.kind === 'timeout') {
        var cached = null;
        try { cached = JSON.parse(EMI.store.get('emi_cache_me') || 'null'); } catch (x) { cached = null; }
        if (cached) { EMI.state.me = cached; return { me: cached, offline: true }; }
      }
      throw e;
    });
  }
  /** Standard client screen: loads /me, then renders. */
  function clientPage(o) {
    EMI.page({
      title: o.title, subtitle: o.subtitle || 'Enhanced Mutual', nav: o.nav, back: o.back, skeleton: o.skeleton,
      load: function () { return o.load ? o.load() : loadMe(o.force); },
      render: function (r) {
        var me = r.me || (r[0] && r[0].me);
        var body = o.render(r);
        return { body: body, offline: r.offline || (r[0] && r[0].offline), unread: me ? me.unreadNotifications : 0 };
      },
      after: o.after
    });
  }

  // ---- policy domain
  function statusHelp(p) {
    switch (p.status) {
      case 'Active': return p.totalOutstanding > 0 ? 'Your policy is active.' : 'Your policy is active and fully paid up to date.';
      case 'One Month Outstanding': return 'One month of premium is outstanding. Please pay soon to stay covered.';
      case 'Warning': return 'Your premium is overdue. Please pay now to avoid your policy lapsing.';
      case 'Lapsed': return 'Your policy has lapsed. Please contact the office to reinstate it.';
      case 'Matured': return 'Your policy has reached its maturity date.';
      case 'Not Yet Commenced': return 'Your policy starts on ' + EMI.fmtDate(p.commencementDate) + '.';
      default: return '';
    }
  }
  function outstandingStat(p, label) { return { value: EMI.money(p.totalOutstanding), label: label || 'Outstanding', tone: p.totalOutstanding > 0 ? 'danger' : 'success' }; }
  function policyCard(p, level) {
    return ui.card({ href: '#/policy/' + encodeURIComponent(p.policyNo), label: p.productName + ', policy ' + p.policyNo + ', ' + ui.statusLabel('policy', p.status) }, [
      ui.cardHeader({ title: p.productName, meta: p.policyNo, level: level, end: ui.status('policy', p.status) }),
      ui.stats([{ value: EMI.money(p.monthlyPremium), label: 'Monthly premium' }, outstandingStat(p)]),
      p.totalExpected > 0 ? ui.progress({ value: p.totalPaid, max: p.totalExpected, label: 'Premium paid to date', start: 'Paid ' + EMI.money(p.totalPaid), end: Math.min(100, Math.round(p.totalPaid / p.totalExpected * 100)) + '%', valueText: EMI.money(p.totalPaid) + ' of ' + EMI.money(p.totalExpected) }) : null,
      h('p', { class: 'small muted' }, statusHelp(p))
    ]);
  }
  function noPolicies() { return ui.card({}, ui.emptyState({ icon: 'shield', title: 'No policies yet', body: 'We could not find any policies on your account. If you think this is wrong, please contact the office.' })); }

  // ------------------------------------------------------------------ home
  EMI.views.home = function () {
    clientPage({
      title: 'Home', nav: 'home', skeleton: 'home', force: true,
      render: function (r) {
        var me = r.me, c = me.client;
        var due = me.policies.reduce(function (s, p) { return s + p.totalOutstanding; }, 0);
        var openClaims = me.claims.filter(function (x) { return x.status !== 'Paid' && x.status !== 'Rejected'; });
        return [
          ui.card({ tone: 'hero', tag: 'section', label: 'Account summary' }, [
            h('div', { class: 'stack stack--xs' }, h('p', { class: 'small muted' }, 'Welcome back'), h('p', { class: 'page-head__title', id: 'client-name' }, c.fullName)),
            ui.stats([{ value: me.policies.length, label: me.policies.length === 1 ? 'Policy' : 'Policies' }, { value: EMI.money(due), label: 'Total outstanding' }]),
            h('p', { class: 'small muted' }, 'Client no. ' + c.clientNo)
          ]),
          due > 0 ? ui.alert({ tone: 'warning', title: 'You have an outstanding balance of ' + EMI.money(due), body: 'Please pay your premium to keep your cover in good standing. Contact your marketer or the office to pay.' }) : null,
          EMI.pushCard(),
          ui.section({ title: 'Quick actions' }, ui.grid([ui.tile({ icon: 'claim', label: 'File a claim', href: '#/claims/new' }), ui.tile({ icon: 'loan', label: 'Request a loan', href: '#/loans/new' })])),
          ui.section({ title: 'My policies', action: me.policies.length > 1 ? ui.link({ label: 'See all', href: '#/policies' }) : null }, me.policies.length ? h('div', { class: 'stack' }, me.policies.map(function (p) { return policyCard(p); })) : noPolicies()),
          openClaims.length ? ui.card({ href: '#/claims' }, ui.media({ icon: 'claim', title: EMI.plural(openClaims.length, 'open claim'), text: 'Tap to follow its progress', chevron: true })) : null,
          EMI.installCard(), EMI.contactCard()
        ];
      },
      after: EMI.fillPushCard
    });
  };

  // ------------------------------------------------------------- policies
  EMI.views.policies = function () {
    clientPage({
      title: 'My policies', nav: 'policy',
      render: function (r) {
        var me = r.me;
        return [
          me.policies.length ? h('div', { class: 'stack' }, me.policies.map(function (p) { return policyCard(p, 'h2'); })) : noPolicies(),
          me.beneficiaries.length ? ui.card({ tag: 'section', label: 'My beneficiaries' }, [
            h('h2', { class: 'card__title' }, 'My beneficiaries'),
            ui.dl(me.beneficiaries.map(function (b) { return [b.name + (b.relationship ? ' (' + b.relationship + ')' : ''), b.sharePct + '%']; })),
            h('p', { class: 'field__hint' }, 'To change a beneficiary, send a message to the office from the More tab.')
          ]) : null
        ];
      }
    });
  };

  EMI.views.policy = function (params) {
    var no = decodeURIComponent(params.no);
    EMI.page({
      title: 'Policy', subtitle: no, nav: 'policy', back: true, skeleton: 'detail',
      load: function () {
        return EMI.api('GET', '/policies/' + encodeURIComponent(no)).then(function (p) { return { p: p }; }, function (e) {
          // Offline: show what we saved last time rather than an error.
          var me = EMI.state.me || (function () { try { return JSON.parse(EMI.store.get('emi_cache_me') || 'null'); } catch (x) { return null; } })();
          var p = me && me.policies.filter(function (x) { return x.policyNo === no; })[0];
          if ((e.kind === 'offline' || e.kind === 'timeout') && p) return { p: p, offline: true };
          throw e;
        });
      },
      render: function (r) {
        var p = r.p;
        return {
          title: p.productName, subtitle: p.policyNo, offline: r.offline,
          body: [
            ui.card({}, [ui.cardHeader({ title: p.productName, meta: 'Policy ' + p.policyNo, level: 'h2', large: true, end: ui.status('policy', p.status) }), h('p', { class: 'small muted' }, statusHelp(p))]),
            ui.stats([{ value: EMI.money(p.totalPaid), label: 'Total paid' }, outstandingStat(p)]),
            ui.card({ tag: 'section', label: 'Policy details' }, [
              h('h2', { class: 'card__title' }, 'Policy details'),
              ui.dl([
                ['Monthly premium', EMI.money(p.monthlyPremium)], ['Sum assured', EMI.money(p.sumAssured)], ['Life assured', p.insuredName],
                ['Started', EMI.fmtDate(p.commencementDate)], ['Matures', p.maturityDate ? EMI.fmtDate(p.maturityDate) : null],
                ['How you pay', p.paymentMethod], ['Payroll PIN', p.payrollPin], ['Months paid', String(p.monthsPaid)],
                ['Last month paid', p.lastPaidMonth ? EMI.monthLabel(p.lastPaidMonth) : null]
              ])
            ]),
            r.offline ? null : ui.button({ label: 'Download statement (PDF)', variant: 'secondary', icon: 'doc', act: 'statement', data: { no: p.policyNo } }),
            ui.card({ tag: 'section', label: 'Payments received' }, [
              h('h2', { class: 'card__title' }, 'Payments received'),
              r.offline ? h('p', { class: 'small muted' }, 'Connect to the internet to see the full payment history.')
                : p.payments.length ? ui.list(p.payments.map(function (x) {
                  return { title: EMI.monthLabel(x.paymentMonth), meta: EMI.fmtDate(x.date) + ' · ' + x.method + ' · ' + x.receiptNo, end: EMI.money(x.amount) };
                }), { label: 'Payments' })
                  : ui.emptyState({ icon: 'clock', title: 'No payments yet', body: 'Payments appear here as soon as the office records them.' })
            ])
          ]
        };
      }
    });
  };

  EMI.actions.statement = function (el) {
    if (el.getAttribute('aria-busy') === 'true') return;
    var label = el.innerHTML;
    el.setAttribute('aria-busy', 'true'); el.disabled = true;
    el.innerHTML = String(ui.render([h('span', { class: 'btn__spinner', aria: { hidden: 'true' } }), h('span', null, 'Preparing PDF...')]));
    var done = function () { el.removeAttribute('aria-busy'); el.disabled = false; el.innerHTML = label; };
    EMI.api('GET', '/policies/' + encodeURIComponent(el.dataset.no) + '/statement', null, { raw: true, timeout: 45000 }).then(function (res) { return res.blob(); }).then(function (blob) {
      done();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'statement-' + el.dataset.no + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      EMI.toast('Statement downloaded');
    }).catch(function (e) { done(); if (e.status === 401) return EMI.sessionExpired(); EMI.toast(e.message, true); });
  };

  // ---------------------------------------------------------------- claims
  var CLAIM_FLOW = ['Registered', 'Under Review', 'Approved', 'Paid'];
  function claimProgress(status) {
    var idx = CLAIM_FLOW.indexOf(status);
    return ui.stepper({ label: 'Claim progress', steps: ['Received', 'Under review', 'Approved', 'Paid'], current: idx < 0 ? 0 : idx, complete: status === 'Paid', failed: status === 'Rejected', failedLabel: 'Not approved' });
  }
  function claimCard(c) {
    return ui.card({ tag: 'article', label: c.claimType + ' claim ' + c.claimNo }, [
      ui.cardHeader({ level: 'h2', title: c.claimType + ' claim', meta: c.claimNo + ' · Policy ' + c.policyNo, end: ui.status('claim', c.status) }),
      claimProgress(c.status),
      c.status === 'Rejected' ? ui.alert({ tone: 'danger', body: 'This claim could not be approved. Please contact the office to discuss it.' }) : null,
      c.description ? h('p', { class: 'prose muted' }, c.description) : null,
      ui.dl([
        ['Reported', EMI.fmtDate(c.dateReported)], ['Amount claimed', c.amountClaimed > 0 ? EMI.money(c.amountClaimed) : null],
        ['Amount approved', c.amountApproved ? EMI.money(c.amountApproved) : null], ['Paid on', c.datePaid ? EMI.fmtDate(c.datePaid) : null],
        ['Documents sent', c.documents ? String(c.documents) : null]
      ])
    ]);
  }
  EMI.views.claims = function () {
    clientPage({
      title: 'Claims', nav: 'claims', force: true,
      render: function (r) {
        var cl = r.me.claims;
        return [
          ui.button({ label: 'File a new claim', icon: 'plus', href: '#/claims/new' }),
          cl.length ? h('div', { class: 'stack' }, cl.map(claimCard))
            : ui.card({}, ui.emptyState({ icon: 'claim', title: 'No claims', body: 'When you file a claim you can follow every step here, and we will notify you of each update.' }))
        ];
      }
    });
  };

  EMI.views.claimNew = function () {
    clientPage({
      title: 'File a claim', nav: 'claims', back: true, skeleton: 'form',
      render: function (r) {
        var me = r.me;
        EMI.state.claimFiles = [];
        if (!me.policies.length) return noPolicies();
        var types = (EMI.state.config && EMI.state.config.claimTypes) || ['Death', 'Maturity', 'Surrender', 'Medical', 'Accident', 'Disability'];
        return [
          ui.pageHead({ title: 'Tell us what happened', sub: 'An officer will review your claim and contact you.' }),
          ui.form({ name: 'claimNew', submit: { label: 'Submit claim' }, children: [
            ui.select({ id: 'policyNo', label: 'Which policy?', options: me.policies.map(function (p) { return { value: p.policyNo, label: p.productName + ' - ' + p.policyNo }; }), value: me.policies[0].policyNo }),
            ui.select({ id: 'claimType', label: 'Type of claim', placeholder: 'Select...', options: types, required: true }),
            ui.field({ id: 'incidentDate', label: 'Date it happened', type: 'date', optional: true, max: new Date().toISOString().slice(0, 10) }),
            ui.textarea({ id: 'description', label: 'What happened?', placeholder: 'Please describe in your own words', required: true, maxlength: 2000 }),
            ui.field({ id: 'amountClaimed', label: 'Amount you are claiming (NLe)', type: 'number', inputmode: 'decimal', min: 0, optional: true, hint: 'If you are not sure, leave it blank - the office will assess it.' }),
            ui.fileField({ id: 'claimFiles', label: 'Supporting photos or documents', optional: true, accept: 'image/*,application/pdf', multiple: true, thumbsId: 'claimThumbs', hint: 'For example a death certificate, medical report or ID card. Up to ' + MAX_CLAIM_FILES + ' files. Photos are made smaller automatically.' })
          ] })
        ];
      }
    });
  };
  EMI.onClaimFilesPicked = function (input) {
    var files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    var room = MAX_CLAIM_FILES - EMI.state.claimFiles.length;
    if (files.length > room) EMI.toast('You can attach up to ' + MAX_CLAIM_FILES + ' files. Extra files were left out.', true);
    Promise.all(files.slice(0, Math.max(0, room)).map(function (f) { return EMI.compressImage(f); })).then(function (list) {
      list.forEach(function (f) { EMI.state.claimFiles.push(f); });
      renderClaimThumbs();
    });
  };
  function renderClaimThumbs() {
    var box = document.getElementById('claimThumbs');
    if (!box) return;
    box.innerHTML = ui.render(EMI.state.claimFiles.map(function (f, i) {
      var isImg = /^image\//.test(f.type);
      return ui.thumb({ name: f.name || 'file ' + (i + 1), src: isImg ? URL.createObjectURL(f) : null, text: isImg ? '' : 'PDF', act: 'removeClaimFile', data: { i: i } });
    }));
  }
  EMI.actions.removeClaimFile = function (el) { EMI.state.claimFiles.splice(Number(el.dataset.i), 1); renderClaimThumbs(); var inp = document.getElementById('claimFiles'); if (inp) inp.focus(); };
  EMI.actions.claimNewSubmit = function (form) {
    EMI.submit(form, {
      busy: 'Sending...', staleToast: 'Your claim was sent.',
      rules: {
        claimType: [v.required('Choose the type of claim.')],
        description: [v.required('Describe what happened.'), v.minLength(10, 'Please write at least a sentence about what happened.')],
        amountClaimed: [v.number({ min: 0 }, 'Enter the amount as a number, or leave it blank.')]
      },
      request: function (x) {
        var fd = new FormData();
        fd.append('policyNo', x.policyNo); fd.append('claimType', x.claimType); fd.append('description', x.description);
        if (x.incidentDate) fd.append('incidentDate', x.incidentDate);
        if (x.amountClaimed) fd.append('amountClaimed', x.amountClaimed);
        EMI.state.claimFiles.forEach(function (f) { fd.append('files', f, f.name); });
        return EMI.api('POST', '/claims', fd);
      },
      offlineHint: 'Your answers are still on this screen - try again when you have signal.',
      success: function (r) {
        EMI.state.me = null;
        EMI.screen({ title: 'Claim received', subtitle: 'Thank you', nav: 'claims', body: ui.successState({
          title: 'Claim received', reference: r.claimNo, referenceLabel: 'Your claim number is',
          body: 'An officer will review it and contact you. You can follow its progress here, and we will send you a notification with every update.',
          actions: ui.button({ label: 'View my claims', variant: 'secondary', href: '#/claims' })
        }) });
      }
    });
  };

  // ----------------------------------------------------------------- loans
  var LOAN_RATE = 25;
  function loanFigures(principal, months) {
    var interest = principal * LOAN_RATE / 100, total = principal + interest;
    return { interest: interest, total: total, monthly: total / months };
  }
  function loanCard(l) {
    return ui.card({ tag: 'article', label: l.loanType + ' loan of ' + EMI.money(l.principal) }, [
      ui.cardHeader({ title: l.loanType + ' loan', meta: 'Requested ' + EMI.fmtDate(l.requestedAt), end: ui.status('loan', l.status) }),
      ui.dl([['Amount', EMI.money(l.principal)], ['Period', EMI.plural(l.tenureMonths, 'month')], ['Monthly payment', EMI.money(l.monthlyPayment)], ['Total to repay', EMI.money(l.totalRepayable)], ['Item', l.applianceDescription]]),
      l.repayments.length ? ui.disclosure({ summary: 'Repayment schedule' }, ui.list(l.repayments.map(function (x) {
        return { title: EMI.monthLabel(x.dueMonth), meta: ui.status('repayment', x.status), end: EMI.money(x.amountDue) };
      }), { label: 'Repayment schedule' })) : null
    ]);
  }
  EMI.views.loans = function () {
    clientPage({
      title: 'Loans', nav: 'loans', force: true,
      render: function (r) {
        var me = r.me, el = me.loanEligibility;
        return [
          el.eligible
            ? ui.card({ tone: 'note' }, [h('h2', { class: 'card__title' }, 'You can request a loan'), h('p', { class: 'small' }, 'You have paid ' + EMI.plural(el.monthsPaid, 'month') + ' of premium. Loans are repaid over up to 12 months with a flat 25% interest.'), ui.button({ label: 'Request a loan', href: '#/loans/new' })])
            : ui.card({ tone: 'warning' }, [h('h2', { class: 'card__title' }, 'Not yet eligible'), h('p', { class: 'small' }, 'You need at least ' + el.monthsRequired + ' months of premium paid to request a loan. You have paid ' + el.monthsPaid + '.'),
              ui.progress({ value: el.monthsPaid, max: el.monthsRequired, label: 'Months of premium paid towards loan eligibility', start: el.monthsPaid + ' of ' + el.monthsRequired + ' months', valueText: el.monthsPaid + ' of ' + el.monthsRequired + ' months' })]),
          me.loans.length ? h('div', { class: 'stack' }, me.loans.map(loanCard))
            : ui.card({}, ui.emptyState({ icon: 'loan', title: 'No loans', body: 'Loans you request appear here with their approval progress and repayment schedule.' }))
        ];
      }
    });
  };

  EMI.views.loanNew = function () {
    clientPage({
      title: 'Request a loan', nav: 'loans', back: true, skeleton: 'form', force: true,
      render: function (r) {
        var el = r.me.loanEligibility;
        if (!el.eligible) return ui.card({}, ui.emptyState({ icon: 'clock', title: 'Not yet eligible', body: 'You need at least ' + el.monthsRequired + ' months of premium paid to request a loan. You have paid ' + el.monthsPaid + '.', action: ui.button({ label: 'Back to loans', variant: 'secondary', href: '#/loans' }) }));
        return [
          ui.pageHead({ title: 'How much do you need?', sub: 'Flat 25% interest, repaid monthly over up to 12 months. A Life Manager and the Finance Director both approve every loan.' }),
          ui.form({ name: 'loanNew', submit: { label: 'Send loan request' }, children: [
            ui.select({ id: 'loanType', label: 'Type of loan', options: [{ value: 'Cash', label: 'Cash loan' }, { value: 'Appliance', label: 'Appliance loan' }] }),
            ui.field({ id: 'appliance', wrapId: 'applBox', hidden: true, label: 'Which item?', placeholder: 'e.g. Refrigerator, television', required: true }),
            ui.field({ id: 'principal', label: 'Amount (NLe)', type: 'number', inputmode: 'decimal', min: 1, required: true }),
            h('div', { class: 'field' },
              h('label', { class: 'field__label', for: 'tenure' }, 'Repay over ', h('strong', { id: 'tenureLbl' }, '6'), ' months'),
              h('input', { id: 'tenure', type: 'range', min: 1, max: 12, value: 6, class: 'control control--range', aria: { valuetext: '6 months' } })),
            ui.card({ tone: 'note', id: 'loanPreview' }, h('p', { class: 'small' }, 'Enter an amount to see your monthly payment.'))
          ] })
        ];
      }
    });
  };
  EMI.updateLoanPreview = function () {
    var pr = document.getElementById('principal'), tn = document.getElementById('tenure'), box = document.getElementById('loanPreview');
    if (!pr || !tn || !box) return;
    document.getElementById('tenureLbl').textContent = tn.value;
    tn.setAttribute('aria-valuetext', EMI.plural(Number(tn.value), 'month'));
    document.getElementById('applBox').hidden = document.getElementById('loanType').value !== 'Appliance';
    var p = Number(pr.value), m = Number(tn.value);
    if (!(p > 0)) { box.innerHTML = ui.render(h('p', { class: 'small' }, 'Enter an amount to see your monthly payment.')); return; }
    var f = loanFigures(p, m);
    box.innerHTML = ui.render(ui.dl([['Monthly payment', EMI.money(f.monthly)], ['Interest (25% flat)', EMI.money(f.interest)], ['Total to repay', EMI.money(f.total)]]));
  };
  EMI.actions.loanNewSubmit = function (form) {
    EMI.submit(form, {
      busy: 'Sending...', staleToast: 'Your loan request was sent.',
      rules: {
        principal: [v.required('Enter the amount you want to borrow.'), v.number({ min: 1 }, 'Enter an amount greater than zero.')],
        appliance: [v.when(function (x) { return x.loanType === 'Appliance'; }, [v.required('Tell us which item the loan is for.')])]
      },
      request: function (x) { return EMI.api('POST', '/loans', { loanType: x.loanType, applianceDescription: x.loanType === 'Appliance' ? x.appliance : undefined, principal: Number(x.principal), tenureMonths: Number(x.tenure) }); },
      success: function () {
        EMI.state.me = null;
        EMI.screen({ title: 'Loan requested', subtitle: 'Thank you', nav: 'loans', body: ui.successState({
          title: 'Request sent', body: 'Your loan request is waiting for approval. We will notify you at every step.',
          actions: ui.button({ label: 'View my loans', variant: 'secondary', href: '#/loans' })
        }) });
      }
    });
  };

  // ------------------------------------------------------------------ more
  EMI.views.more = function () {
    clientPage({
      title: 'More', nav: 'more',
      render: function (r) {
        var c = r.me.client, unread = r.me.unreadNotifications;
        return [
          ui.card({ tag: 'section', label: 'My details' }, [h('h2', { class: 'card__title card__title--lg' }, c.fullName), ui.dl([['Client no.', c.clientNo], ['Phone', c.phone || '-'], ['Address', c.address], ['Referral code', c.referralCode]])]),
          h('nav', { class: 'stack', aria: { label: 'Account' } },
            ui.card({ href: '#/inbox' }, ui.media({ icon: 'bell', title: 'Notifications', text: 'Receipts and updates from the office', extra: unread ? h('div', null, ui.badge(unread + ' new', 'warning')) : null, chevron: true })),
            ui.card({ href: '#/messages' }, ui.media({ icon: 'message', title: 'Message the office', text: 'Change your details or beneficiaries, or ask a question', chevron: true })),
            ui.card({ href: '#/pin' }, ui.media({ icon: 'lock', title: 'Change my PIN', text: 'Keep your account safe', chevron: true }))),
          EMI.pushCard(), EMI.installCard(), EMI.contactCard(),
          ui.button({ label: 'Log out', variant: 'outline', act: 'logout' }),
          h('p', { class: 'center xsmall muted' }, 'Enhanced Mutual Insurance (SL) Ltd')
        ];
      },
      after: EMI.fillPushCard
    });
  };

  EMI.views.inbox = function () {
    var s = EMI.session(), nav = s && s.kind === 'applicant' ? 'applicant' : 'more';
    EMI.page({
      title: 'Notifications', subtitle: 'Enhanced Mutual', nav: nav, back: true,
      load: function () { return EMI.api('GET', '/notifications'); },
      render: function (rows) {
        return rows.length
          ? ui.card({}, ui.list(rows.map(function (n) { return { title: n.title, text: n.body, meta: EMI.fmtRelative(n.createdAt), unread: !n.readAt }; }), { label: 'Notifications, newest first' }))
          : ui.card({}, ui.emptyState({ icon: 'bell', title: 'No notifications yet', body: 'Payment receipts and updates on your claims, loans and applications will appear here.' }));
      },
      after: function (rows) {
        if (rows.some(function (n) { return !n.readAt; })) EMI.api('POST', '/notifications/read').then(function () { if (EMI.state.me) EMI.state.me.unreadNotifications = 0; }).catch(function () {});
      }
    });
  };

  EMI.views.messages = function () {
    clientPage({
      title: 'Messages', nav: 'more', back: true, skeleton: 'form',
      load: function () { return Promise.all([loadMe(), EMI.api('GET', '/requests')]).then(function (rr) { return { me: rr[0].me, offline: rr[0].offline, list: rr[1] }; }); },
      render: function (r) {
        var types = (EMI.state.config && EMI.state.config.requestTypes) || ['General question'];
        return [
          ui.card({ tag: 'section', label: 'New message' }, [
            h('h2', { class: 'card__title' }, 'Message the office'),
            ui.form({ name: 'message', submit: { label: 'Send message' }, children: [
              ui.select({ id: 'type', label: 'What is this about?', options: types }),
              ui.select({ id: 'policyNo', label: 'Policy', optional: true, options: [{ value: '', label: 'Not about one policy' }].concat(r.me.policies.map(function (p) { return { value: p.policyNo, label: p.policyNo + ' - ' + p.productName }; })) }),
              ui.textarea({ id: 'message', label: 'Your message', required: true, maxlength: 1000 })
            ] })
          ]),
          ui.section({ title: 'My messages' }, r.list.length ? h('div', { class: 'stack' }, r.list.map(function (m) {
            return ui.card({ tag: 'article', label: m.type }, [
              ui.cardHeader({ title: m.type, meta: EMI.fmtRelative(m.createdAt) + (m.policyNo ? ' · ' + m.policyNo : ''), end: ui.status('request', m.status) }),
              h('p', { class: 'prose' }, m.message),
              m.reply ? ui.alert({ tone: 'success', title: 'Office reply', body: m.reply }) : null
            ]);
          })) : ui.card({}, ui.emptyState({ icon: 'message', title: 'No messages yet', body: 'Messages you send to the office and their replies will appear here.' })))
        ];
      }
    });
  };
  EMI.actions.messageSubmit = function (form) {
    EMI.submit(form, {
      busy: 'Sending...',
      rules: { message: [v.required('Write your message.'), v.minLength(5, 'Please write a little more so the office can help.')] },
      request: function (x) { return EMI.api('POST', '/requests', { type: x.type, message: x.message, policyNo: x.policyNo || undefined }); },
      success: function () { EMI.toast('Message sent to the office'); EMI.route.refresh(); }
    });
  };

  EMI.views.pin = function () {
    EMI.screen({
      back: true, title: 'Change PIN', subtitle: 'Enhanced Mutual', nav: 'more',
      body: ui.card({}, [
        ui.pageHead({ title: 'Change my PIN', sub: 'You will stay logged in on this phone. Other phones will be logged out.' }),
        ui.form({ name: 'changePin', submit: { label: 'Save new PIN' }, children: [
          ui.pinField({ id: 'oldPin', label: 'Current PIN', autocomplete: 'current-password' }),
          ui.pinField({ id: 'newPin', label: 'New PIN (4 to 6 numbers)', autocomplete: 'new-password' }),
          ui.pinField({ id: 'newPin2', label: 'New PIN again', autocomplete: 'new-password' })
        ] })
      ])
    });
  };
  EMI.actions.changePinSubmit = function (form) {
    EMI.submit(form, {
      busy: 'Saving...', noAuth: true,
      rules: { oldPin: [v.required('Enter your current PIN.')], newPin: [v.required('Choose a new PIN.'), v.pin()], newPin2: [v.required('Type the new PIN again.'), v.same('newPin', 'The two new PINs are not the same.')] },
      request: function (x) { return EMI.api('POST', '/auth/change-pin', { oldPin: x.oldPin, newPin: x.newPin }); },
      mapError: function (e) { return /current PIN/i.test(e.message) ? { oldPin: e.message } : e.message; },
      success: function (r) { var s = EMI.session(); s.token = r.token; EMI.setSession(s); EMI.toast('PIN changed'); EMI.route.go('#/more'); }
    });
  };
})();
