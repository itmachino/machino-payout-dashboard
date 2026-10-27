(function () {
  'use strict';

  /* =====================================================================
   * Machino Retail Payout dashboard — the page.
   *
   * The page never calculates a payout. Every figure comes from the
   * backend (dashboard/backend, which asks Payout Automation); after a
   * save the backend returns the person as the sheet now shows them.
   *
   * Two ways to run:
   *   config.js apiUrl set   → sign in with the dashboard password,
   *                            then talk to the backend. No
   *                            invented data is even loaded; if the backend
   *                            cannot be reached, an error is shown.
   *   config.js apiUrl empty → DEMO: invented data from preview.js,
   *                            nothing leaves this browser tab.
   * Nothing is stored in the browser: the session key lives in this tab's
   * memory only, so closing or reloading the tab means signing in again.
   * ===================================================================== */
  const CFG = window.DASHBOARD_CONFIG || {};
  const CONNECTED = !!CFG.apiUrl;
  // The backend session key. Kept in this browser (owner, 2026-10-27: a refresh
  // must not sign you out). It is only a random key: no payroll data is stored,
  // and the server still ends it after 30 minutes unused, 8 hours, or Sign out.
  const SESSION_KEY = 'machino-dashboard-session';
  const remember = (s) => { try { if (s) localStorage.setItem(SESSION_KEY, s); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked: sign in each time */ } };
  const recalled = () => { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } };
  let session = CONNECTED ? recalled() : null;

  function call(action, args) {
    if (!CONNECTED) {
      return new Promise((resolve, reject) => setTimeout(() => {
        try { resolve(window.DashboardPreview[action](args || {})); } catch (e) { reject(e); }
      }, 200));
    }
    return fetch(CFG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ session, action, args: args || {} })
    }).then((r) => {
      if (!r.ok) throw new Error('The dashboard server did not answer (' + r.status + ').');
      return r.json();
    }).then((body) => {
      if (!body.ok) {
        // signIn: the sign-in is no longer valid. reauth: a protected setting needs a fresh sign-in.
        if (body.signIn || body.reauth) { session = null; remember(null); DATA = null; showSignIn(body.message); }
        throw new Error(body.message || 'Something went wrong.');
      }
      return body.result;
    });
  }

  /* ---------- Sign-in (connected mode only): the dashboard password ---------- */
  const signInEl = document.getElementById('signin');
  const passForm = document.getElementById('signin-pass');
  const passInput = document.getElementById('signin-password');
  function post(body) {
    return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then((r) => { if (!r.ok) throw new Error('The dashboard server did not answer (' + r.status + ').'); return r.json(); });
  }
  function showSignIn(message) {
    signInEl.hidden = false;
    document.querySelector('.app').hidden = true;
    document.getElementById('view').innerHTML = '';   // nothing from an ended session stays on the page
    document.getElementById('drawer').innerHTML = '';
    passInput.value = '';
    document.getElementById('signin-msg').textContent = message || '';
    passInput.focus();
  }
  passForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const go = document.getElementById('signin-go');
    const password = passInput.value;
    passInput.value = '';
    go.disabled = true;
    go.innerHTML = '<span class="spinner sm" aria-hidden="true"></span>Signing in…';
    document.getElementById('signin-msg').textContent = '';
    try {
      // The first screen's data comes back with the sign-in, in the same trip.
      const body = await post({ action: 'login', password, load: { period: state.period || null } });
      if (!body.ok) {
        document.getElementById('signin-msg').textContent = body.message;
        passInput.focus();
        return;
      }
      session = body.result.session;
      remember(session);
      signInEl.hidden = true;
      document.querySelector('.app').hidden = false;
      load(state.period, { full: true, data: body.result.data, loadError: body.result.loadError });
    } catch (err) {
      document.getElementById('signin-msg').textContent = 'Could not reach the dashboard server: ' + errText(err);
    } finally {
      go.disabled = false;
      go.textContent = 'Sign in';
    }
  });
  function signOut() {
    const ending = session;
    session = null;
    remember(null);
    DATA = null;
    if (ending) post({ action: 'logout', session: ending }).catch(() => {});
    showSignIn('You are signed out.');
  }

  /* ---------- State (memory only) ---------- */
  let DATA = null;
  let fileSeq = 0;
  const state = {
    loading: true, loadError: null, period: null,
    store: 'all',
    payroll: { q: '', store: 'all', status: 'all', pay: 'all', sort: 'name', dir: 1 },
    openId: null, editing: null, draft: null, saving: false, saveError: null,
    branch: 'both',
    history: { q: '', period: 'all', mode: 'all' },
    staff: { q: '', show: 'active', editId: null },
    tools: { check: null, checking: false, ids: null, idsLoading: false, idChosen: {}, delMonth: null },
    slips: { files: [], plan: null, planning: false, saving: false, result: null, error: null },
    links: {},
    cfg: { editing: false, draft: null, saving: false },
    verify: null,
    menu: false,
    toast: null
  };

  /* ---------- Helpers ---------- */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS_CLASS = { 'Ready': 'b-ready', 'Sent': 'b-sent', 'Needs Attention': 'b-attention', 'Failed': 'b-failed', 'Review Required': 'b-review', 'Test sent': 'b-ready' };
  const STATUS_ORDER = { 'Review Required': 0, 'Needs Attention': 1, 'Failed': 1, 'Ready': 2, 'Sent': 3 };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || 'b-attention'}">${esc(s)}</span>`;
  const storeBadges = (stores) => stores.map((s) => `<span class="badge ${s === 'SS18' ? 'b-ss18' : 'b-ioi'}">${esc(s)}</span>`).join('');
  // LIVE is the normal setting (owner, 2026-10-27): only Test Mode gets a badge.
  const modeBadge = () => DATA.testMode
    ? '<a class="badge b-test mode-pill" href="#settings" title="Change in Settings">TEST MODE</a>'
    : '';
  const money = (v) => v == null ? '<span class="blank">Blank</span>' : esc(v);
  // Someone with no Employee ID in the sheet is keyed "name:…" inside; show that plainly.
  const idText = (id) => /^name:/.test(String(id)) ? '<span class="blank">No Employee ID</span>' : esc(id);
  const dash = (v) => v == null || v === '' ? '—' : esc(v);
  const plain = (v) => v == null ? '' : String(v).replace(/[^0-9.]/g, '');
  const amt = (v) => v == null ? -1 : Number(String(v).replace(/[^0-9.]/g, ''));
  const initials = (n) => n.split(' ').filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const inStore = (stores, f) => f === 'all' || f === 'both' || stores.includes(f === 'ss18' ? 'SS18' : 'IOI');
  const seg = (group, options, current, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, l]) =>
    `<button type="button" data-seg="${esc(group)}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join('')}</div>`;
  const docCls = (v) => v === 'Found' || v === 'Up to date' || v === 'Sent' ? 'ok' : v === 'Out of date' ? 'warn' : 'bad';
  const isPrepared = (e) => ['Up to date', 'Out of date', 'Sent'].includes(e.pdf);
  const announce = (t) => { document.getElementById('announce').textContent = t; };
  const badAmount = (v) => v !== '' && v != null && !/^\d+(\.\d{1,2})?$/.test(String(v).trim());
  const dateText = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? esc(iso) : d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const emp = (id) => DATA && DATA.employees.find((x) => x.id === id);
  const icon = {
    check: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    info: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
    lock: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    refresh: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/></svg>',
    arrow: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chev: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    plus: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    send: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    close: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ext: '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    upload: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    mail: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    trash: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };
  const periodSelect = (id) => `<label class="sr-only" for="${id}">Payroll month</label>
      <select class="select" id="${id}" data-period>${DATA.periods.map((p) => `<option${p === DATA.period ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>`;
  const refreshBtn = () => `<button type="button" class="icon-btn" data-action="refresh" aria-label="Refresh data" title="Refresh · last updated ${esc(DATA.updatedAt)}">${icon.refresh}</button>`;
  const sampleTag = () => DATA.preview ? '<span class="sample-tag">Preview · invented data</span>' : '';
  const toastHTML = () => state.toast ? `<div class="toast ${esc(state.toast.kind || '')}" role="status">${state.toast.kind === 'error' ? icon.alert : icon.info}<span class="grow">${esc(state.toast.text)}</span><button type="button" class="link-btn" data-action="dismiss">Dismiss</button></div>` : '';
  // The LIVE warning strip was removed (owner, 2026-10-27: LIVE is the normal setting).
  const liveStrip = () => '';
  function toast(text, kind) { state.toast = { text, kind }; render(); }
  const errText = (err) => (err && err.message) || String(err);

  /* ---------- Data loading ---------- */
  async function load(period, opts) {
    opts = opts || {};
    state.loading = !DATA || opts.full;
    state.loadError = null;
    if (state.loading) render(); else setRefreshing(true);
    try {
      // opts.data: already fetched together with the sign-in (one trip instead of two).
      if (opts.loadError) throw new Error(opts.loadError);
      const d = opts.data || await call('getDashboardData', { period: period || null });
      DATA = d;
      showMode();
      state.period = d.period;
      if (state.openId && !emp(state.openId)) closeDrawer(true, true);
      if (opts.message) state.toast = { text: opts.message, kind: 'ok' };
    } catch (err) {
      state.loadError = errText(err);
      if (DATA) state.toast = { text: 'Could not refresh: ' + state.loadError + ' The figures shown are from ' + DATA.updatedAt + '.', kind: 'error' };
    }
    state.loading = false;
    setRefreshing(false);
    renderProfile();
    render();
    renderDrawer();
  }
  /** The top strip: DEMO with invented data, or REAL PAYROLL (read-only until changes are switched on). */
  /** The top strip shows only in the DEMO (owner, 2026-10-27: no banner on the real dashboard). */
  function showMode() {
    document.getElementById('demo-banner').hidden = CONNECTED;
  }
  function setRefreshing(on) {
    document.querySelectorAll('[data-action="refresh"]').forEach((b) => {
      b.disabled = on;
      b.innerHTML = on ? '<span class="spinner sm" aria-hidden="true"></span>' : icon.refresh;
    });
  }
  const attentionList = () => DATA.employees.filter((e) => e.issue || e.status === 'Review Required')
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  /* ---------- Overview ---------- */
  function overview() {
    const s = DATA.summary[state.store];
    const att = attentionList().filter((p) => inStore(p.stores, state.store));
    const steps = DATA.monthSteps.map((label, i) => {
      const cls = i < DATA.currentStep ? 'done' : i === DATA.currentStep ? 'current' : '';
      return `<li class="${cls}"${i === DATA.currentStep ? ' aria-current="step"' : ''}><span class="bar"></span><span class="step-l">${i < DATA.currentStep ? icon.check + '<span class="sr-only">done:</span>' : ''}${esc(label)}${i === DATA.currentStep ? ' · now' : ''}</span></li>`;
    }).join('');
    const segTotal = s.sent + s.ready + s.na + s.rr + s.failed;
    const segs = [['Sent', s.sent, '#3E6B4F'], ['Ready', s.ready, '#2F5E73'], ['Needs Attention', s.na, '#C98A12'], ['Review Required', s.rr, '#8A3B12'], ['Failed', s.failed, '#9B2C2C']];
    const allDone = s.attention === 0 && s.waiting === 0;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Overview</h1><div class="tags small muted"><span>${esc(DATA.period)} · Last updated ${esc(DATA.updatedAt)}</span>${sampleTag()}</div></div>
        <div class="tools">
          ${periodSelect('ov-month')}
          ${seg('store', [['all', 'Both stores'], ['ss18', 'SS18'], ['ioi', 'IOI']], state.store, 'Store')}
          ${modeBadge()}
          ${refreshBtn()}
        </div>
      </header>
      ${liveStrip()}${toastHTML()}

      <section class="card raised hero" aria-labelledby="next-step">
        <div class="hero-top">
          <div class="hero-copy">
            <span class="eyebrow">Your next step</span>
            ${allDone
              ? `<h2 id="next-step">Nothing to fix for ${esc(DATA.period)}</h2><p>Every payout is verified or sent. Check History for the results.</p>`
              : `<h2 id="next-step">Fix ${s.attention} problem${s.attention === 1 ? '' : 's'}, then verify ${s.waiting} ${s.waiting === 1 ? 'person' : 'people'}</h2>
                 <p>Open each person in Payroll Management to fix the problem. Then tick Manager Verified for everyone you have checked.</p>`}
          </div>
          <div class="hero-actions">
            ${allDone ? `<a class="btn btn-secondary" href="#history">Open History</a>` : `
            <button type="button" class="btn btn-primary" data-goto-status="look">Fix the problems ${icon.arrow}</button>
            <button type="button" class="btn btn-secondary" data-goto-status="waiting">Verify payouts</button>`}
          </div>
        </div>
        <ol class="progress" aria-label="Monthly progress">${steps}</ol>
      </section>

      <section class="kpis" aria-label="Summary">
        <div class="card kpi primary"><span class="kpi-top">Total payout</span><span class="kpi-value">${esc(s.total)}</span><span class="kpi-note">${esc(s.totalNote)}</span></div>
        <button type="button" class="card kpi" data-goto-status="look"><span class="kpi-top">Need your attention ${s.attention ? '<span class="badge b-attention">Fix first</span>' : ''}</span>
          <span class="kpi-value" style="color:var(--attention-ink)">${s.attention}</span><span class="kpi-note">Open in Payroll Management →</span></button>
        <button type="button" class="card kpi" data-goto-status="waiting"><span class="kpi-top">Waiting for Manager Verified</span><span class="kpi-value">${s.waiting}</span><span class="kpi-note">Ready, but not ticked yet</span></button>
        <a class="card kpi" href="#slips"><span class="kpi-top">Missing Payment Slips ${s.missingSlips ? '<span class="badge b-attention">Upload</span>' : ''}</span><span class="kpi-value">${s.missingSlips}</span><span class="kpi-note">${s.employees} employees this month · upload slips →</span></a>
      </section>

      <div class="split">
        <section class="card raised main-col" aria-labelledby="att-title">
          <div class="card-head"><h2 id="att-title">Needs your attention</h2><span class="small muted">${att.length} ${att.length === 1 ? 'person' : 'people'}</span></div>
          ${att.length ? att.map((p) => `
            <div class="att-row">
              <div class="who2"><strong>${esc(p.name)}</strong><span class="tags">${storeBadges(p.stores)}<span class="small muted">${esc(p.id)}</span></span></div>
              <div class="what"><span>${esc(p.issue || 'Needs a check by hand.')}</span>${p.fix ? `<span class="small muted">Next: ${esc(p.fix)}</span>` : ''}</div>
              <div class="act">${statusBadge(p.status)}<button type="button" class="btn btn-secondary btn-sm" data-open="${esc(p.id)}">Open</button></div>
            </div>`).join('') : `<div class="empty"><h3>Nothing needs you</h3><span class="muted small">Everyone at this store is ready or sent.</span></div>`}
          <div class="card-body"><a class="link-btn" href="#payroll">See everyone in Payroll Management →</a></div>
        </section>

        <div class="side-col">
          <section class="card card-body" aria-labelledby="st-title" style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h2 id="st-title" style="font-size:20px">Payout status</h2><span class="small muted">${s.employees} people</span></div>
            <div class="stack-bar" aria-hidden="true">${segs.map(([, n, c]) => `<span style="width:${segTotal ? n / segTotal * 100 : 0}%;background:${c}"></span>`).join('')}</div>
            <dl class="legend">${segs.map(([l, n, c]) => `<div><dt><span class="dot" style="background:${c}"></span>${esc(l)}</dt><dd>${n}</dd></div>`).join('')}</dl>
            <div style="height:1px;background:var(--line-soft)"></div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <span class="small muted">Payment Status</span>
              <strong class="num" style="font-size:14px">${s.paid} paid · ${s.unpaid} not paid yet</strong>
              <div class="stack-bar" aria-hidden="true"><span style="width:${s.paid / ((s.paid + s.unpaid) || 1) * 100}%;background:#3E6B4F"></span></div>
            </div>
          </section>
          <section class="card card-body" aria-labelledby="jb-title" style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h2 id="jb-title" style="font-size:20px">Jibble hours</h2><span class="small muted">${esc(DATA.jibble.filledAt)}</span></div>
            <div class="tags">${DATA.jibble.stores.map((x) => `<span class="badge ${x.store === 'SS18' ? 'b-ss18' : 'b-ioi'}">${esc(x.store)} · ${x.people} people</span>`).join('')}</div>
            ${DATA.jibble.unmatched.length ? `<a class="link-btn" href="#checks">${DATA.jibble.unmatched.length} Jibble ${DATA.jibble.unmatched.length === 1 ? 'person is' : 'people are'} not linked →</a>` : ''}
            <a class="link-btn" href="#checks">${DATA.jibble.warnings.length} attendance warning${DATA.jibble.warnings.length === 1 ? '' : 's'} →</a>
          </section>
          <section class="card card-body" aria-labelledby="ac-title" style="display:flex;flex-direction:column;gap:14px">
            <h2 id="ac-title" style="font-size:20px">Recent activity</h2>
            <ul class="activity">${DATA.activity.map((a) => `<li><span>${esc(a.text)}</span><span class="small muted">${esc(a.when)}</span></li>`).join('')}</ul>
            <a class="link-btn" href="#history">Open History →</a>
          </section>
        </div>
      </div>`;
  }

  /* ---------- Payroll Management ---------- */
  const STATUS_FILTERS = {
    all: ['Everyone', '#A8815F', () => true],
    look: ['Needs a look', '#C98A12', (e) => !!e.issue || e.status === 'Review Required'],
    waiting: ['Waiting for verification', '#A8815F', (e) => e.status === 'Ready' && !e.verified],
    slip: ['Missing slip', '#9B2C2C', (e) => e.slip !== 'Found'],
    ready: ['Ready', '#2F5E73', (e) => e.status === 'Ready'],
    sent: ['Sent', '#3E6B4F', (e) => e.status === 'Sent']
  };

  function payrollRows() {
    const p = state.payroll;
    const q = p.q.trim().toLowerCase();
    const filter = (STATUS_FILTERS[p.status] || STATUS_FILTERS.all)[2];
    const rows = DATA.employees.filter((e) => {
      if (q && !(e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))) return false;
      if (!inStore(e.stores, p.store)) return false;
      if (p.pay !== 'all' && e.payment !== p.pay) return false;
      return filter(e);
    });
    const key = { name: (e) => e.name.toLowerCase(), hours: (e) => Number(e.hours), total: (e) => amt(e.total), status: (e) => STATUS_ORDER[e.status] }[p.sort];
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * p.dir);
  }

  /* ---------- Manager Verified: one person at a time, on purpose ---------- */
  // A Sent payout never changes; a blank Total Payout has nothing to check yet.
  const canVerify = (list) => list.filter((e) => e.status !== 'Sent' && e.total != null);

  /** From the table's tick box: asks first, because a box in a table is easy to hit by mistake. */
  function openVerify(e, verified) {
    state.verify = { id: e.id, verified };
    document.getElementById('verify-title').textContent = verified ? `Verify ${e.name}?` : `Remove Manager Verified from ${e.name}?`;
    document.getElementById('verify-text').textContent = verified
      ? `By confirming, you say you checked ${e.name.split(' ')[0]}'s hours, claims and Total Payout for ${DATA.period}.`
      : 'They will not be sent until they are verified again.';
    document.getElementById('verify-list').innerHTML = `<li class="cs-row"><span style="display:flex;flex-direction:column;gap:2px"><span>${esc(e.name)}</span>${verified && e.issue ? `<span class="small" style="color:var(--review-ink)">Still held until fixed: ${esc(e.issue)}</span>` : ''}</span><span class="num muted">${money(e.total)}</span></li>`;
    const go = document.getElementById('verify-go');
    go.textContent = verified ? 'Yes, verify' : 'Remove';
    go.disabled = false;
    document.getElementById('verify-dialog').showModal();
  }
  async function doVerify() {
    const v = state.verify;
    if (!v) return;
    document.getElementById('verify-go').disabled = true;
    await saveVerified(v.id, v.verified);
    document.getElementById('verify-dialog').close();
    state.verify = null;
  }
  /** One person's Manager Verified. `nextId` opens the next person afterwards (review flow). */
  async function saveVerified(id, verified, nextId) {
    const e = emp(id);
    try {
      const res = await call('setVerified', { period: DATA.period, employeeId: id, expected: saw(e), verified });
      DATA.employees[DATA.employees.findIndex((x) => x.id === id)] = res.employee;
      const msg = res.message || (e.name + (verified ? ' verified.' : ' no longer verified.'));
      announce(msg);
      if (nextId) { state.toast = { text: msg, kind: 'ok' }; openDrawer(nextId); }
      await load(DATA.period, { message: msg });
    } catch (err) {
      toast('Nothing was changed: ' + errText(err), 'error');
      renderDrawer();
    }
  }

  function payroll() {
    const p = state.payroll;
    const rows = payrollRows();
    const pool = DATA.employees.filter((e) => inStore(e.stores, p.store));
    const sortTh = (col, label, right) => {
      const on = p.sort === col;
      return `<th scope="col"${right ? ' class="right"' : ''} aria-sort="${on ? (p.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort-btn${on ? ' on' : ''}" data-sort="${col}">${label}${on ? (p.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>`;
    };
    const hasFilters = p.q || p.store !== 'all' || p.status !== 'all' || p.pay !== 'all';
    const ps = DATA.preSend;
    const sm = DATA.summary;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Payroll Management</h1><div class="tags small muted"><span>${esc(DATA.period)} · hours, pay, claims, payment and documents for every employee</span>${sampleTag()}</div></div>
        <div class="tools">
          ${periodSelect('pm-month')}
          ${modeBadge()}
          ${refreshBtn()}
          <a class="btn btn-secondary" href="#slips">${icon.upload}Upload slips</a>
          <button type="button" class="btn btn-primary" data-action="prepare">${icon.refresh}Prepare payouts</button>
        </div>
      </header>
      ${liveStrip()}${toastHTML()}

      <section class="store-totals" aria-label="Totals by store">
        <div><span class="small muted">SS18</span><strong class="num">${esc(sm.ss18.total)}</strong><span class="small muted">${sm.ss18.employees} people</span></div>
        <div><span class="small muted">IOI</span><strong class="num">${esc(sm.ioi.total)}</strong><span class="small muted">${sm.ioi.employees} people</span></div>
        <div class="all"><span class="small muted">Both stores</span><strong class="num">${esc(sm.all.total)}</strong><span class="small muted">${esc(sm.all.totalNote)}</span></div>
      </section>

      <section class="statbar" aria-label="Filter by status">
        ${Object.keys(STATUS_FILTERS).map((v) => { const [label, color, fn] = STATUS_FILTERS[v]; return `<button type="button" class="stat" data-status-tile="${v}" aria-pressed="${p.status === v}"><span class="stat-top"><span class="dot" style="background:${color}"></span>${esc(label)}</span><span class="stat-n">${pool.filter(fn).length}</span></button>`; }).join('')}
      </section>

      <div class="sendlink">
        <div class="facts2">
          <strong style="display:inline-flex;align-items:center;gap:8px;color:var(--brown)">${icon.send}<span style="color:var(--ink)">Pre-Send Check</span></strong>
          <span class="badge b-ready">${ps.will.length} will send</span>
          <span class="badge b-attention">${ps.cannot.length} cannot send yet</span>
          <span class="badge b-sent">${ps.sent.length} already sent</span>
        </div>
        <div class="tags">
          ${canVerify(rows).filter((e) => !e.verified).length ? `<button type="button" class="btn btn-primary btn-sm" data-action="start-review">${icon.arrow}Review one by one (${canVerify(rows).filter((e) => !e.verified).length} to check)</button>` : ''}
          <a class="btn btn-secondary btn-sm" href="#send">Open Send Center →</a>
        </div>
      </div>

      <section class="card raised emp-list" aria-labelledby="emp-title">
        <h2 id="emp-title" class="sr-only">Employees</h2>
        <div class="toolbar">
          <div class="field grow"><label for="pm-q">Search</label><div class="search">${icon.search}<input class="input" id="pm-q" type="search" placeholder="Name or Employee ID" value="${esc(p.q)}" autocomplete="off"></div></div>
          <div class="field"><span>Store</span>${seg('pm-store', [['all', 'Both'], ['ss18', 'SS18'], ['ioi', 'IOI']], p.store, 'Store')}</div>
          <div class="field"><label for="pm-status">Show</label>
            <select class="select" id="pm-status">${Object.keys(STATUS_FILTERS).map((v) => `<option value="${v}"${p.status === v ? ' selected' : ''}>${v === 'all' ? 'Everyone' : STATUS_FILTERS[v][0]}</option>`).join('')}</select></div>
          <div class="field"><label for="pm-pay">Payment</label>
            <select class="select" id="pm-pay">${[['all', 'Paid and not paid'], ['Paid', 'Paid'], ['Not paid', 'Not paid']].map(([v, l]) => `<option value="${v}"${p.pay === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          ${hasFilters ? '<button type="button" class="btn btn-quiet" data-action="clear-filters">Clear filters</button>' : ''}
        </div>
        ${rows.length ? `
        <div class="table-wrap">
          <table class="emp-table">
            <thead><tr>
              ${sortTh('name', 'Employee')}<th scope="col">Store</th>${sortTh('hours', 'Hours', true)}<th scope="col" class="right">Wages</th>${sortTh('total', 'Total Payout', true)}
              <th scope="col">Payment</th><th scope="col" class="vcell">Verified</th><th scope="col">Documents</th>${sortTh('status', 'Status')}<th scope="col"><span class="sr-only">Open</span></th>
            </tr></thead>
            <tbody>${rows.map((e) => `
              <tr data-open="${esc(e.id)}" class="${e.id === state.openId ? 'selected' : ''}">
                <th scope="row"><div class="name-cell"><span class="avatar sm soft" aria-hidden="true">${esc(initials(e.name))}</span><div><button type="button" class="name-btn" data-open="${esc(e.id)}">${esc(e.name)}</button><div class="small muted">${idText(e.id)}</div></div></div></th>
                <td><span class="tags">${storeBadges(e.stores)}</span></td>
                <td class="right num">${esc(e.hours)}</td>
                <td class="right num">${money(e.wages)}</td>
                <td class="right num amount">${money(e.total)}</td>
                <td>${esc(e.payment)}</td>
                <td class="vcell">${e.status === 'Sent'
                  ? `<span style="color:var(--sent-ink);font-weight:bold;display:inline-flex;gap:4px;align-items:center" title="Sent: no longer changes">${icon.check}Yes</span>`
                  : `<label class="vbox"><input type="checkbox" data-verify="${esc(e.id)}"${e.verified ? ' checked' : ''}${e.total == null ? ' disabled title="Total Payout is blank"' : ''} aria-label="Manager Verified: ${esc(e.name)}"><span class="${e.verified ? 'vyes' : 'muted'}">${e.verified ? 'Yes' : 'Not yet'}</span></label>`}</td>
                <td><span class="docs"><span class="doc ${docCls(e.slip)}" title="Payment Slip: ${esc(e.slip)}"><i></i>Slip</span><span class="doc ${docCls(e.pdf)}" title="Payment Calculation PDF: ${esc(e.pdf)}"><i></i>PDF</span></span></td>
                <td>${statusBadge(e.status)}</td>
                <td class="right"><span class="muted" aria-hidden="true">${icon.chev}</span></td>
              </tr>`).join('')}</tbody>
          </table>
          <div class="emp-cards">${rows.map((e) => `
            <button type="button" class="emp-card" data-open="${esc(e.id)}">
              <span class="top"><strong>${esc(e.name)}</strong>${statusBadge(e.status)}</span>
              <span class="tags">${storeBadges(e.stores)}<span class="small muted">${esc(e.hours)} hours</span></span>
              <span class="top"><span class="small muted">${esc(e.payment)} · Verified: ${e.verified ? 'Yes' : 'Not yet'}</span><span class="amount num">${money(e.total)}</span></span>
            </button>`).join('')}</div>
        </div>
        <div class="table-foot"><span>Showing ${rows.length} of ${DATA.employees.length} employees · click a row to open</span><span>Figures come from the ${esc(DATA.period)} tab and Payout Control</span></div>`
        : `<div class="empty"><h3>No one matches</h3><span class="muted small">Check the spelling, or clear the filters.</span><button type="button" class="btn btn-secondary btn-sm" data-action="clear-filters">Clear filters</button></div>`}
      </section>`;
  }

  /* ---------- Payment Slips (bulk upload) ---------- */
  const SLIP_VIEW = {
    READY: ['b-ready', 'Ready to save'],
    NEEDS_PICK: ['b-attention', 'Pick the person'],
    CONFLICT: ['b-failed', 'Conflict'],
    DUPLICATE: ['b-review', 'Duplicate'],
    WRONG_MONTH: ['b-failed', 'Wrong month'],
    NOT_PDF: ['b-failed', 'Not a PDF']
  };
  const CAN_PICK = ['READY', 'NEEDS_PICK', 'CONFLICT'];
  const SAMPLE_SLIPS = [
    ['SS18 Nur Aina - Retail Wages October 2026.pdf', 48211],
    ['Aiman - payslip.pdf', 51022],
    ['Nuradila - Oct.pdf', 47730],
    ['Nur - slip.pdf', 39001],
    ['Hafiz Rahman September 2026.pdf', 45120],
    ['Siti - Retail Wages.pdf', 44012],
    ['SS18 Nur Aina - Retail Wages October 2026.pdf', 48211],
    ['bank notes.docx', 12200]
  ];
  const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  function slipRow(f) {
    const plan = state.slips.plan;
    return plan && plan.rows.find((r) => r.key === f.key);
  }
  function staffOptions(selectedId) {
    return `<option value="">Choose a person…</option>` + DATA.staff.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>${esc(s.name)} · ${esc(s.store || 'no store')}</option>`).join('');
  }

  function slips() {
    const sl = state.slips;
    const rows = sl.files.map((f) => ({ f, r: slipRow(f) }));
    const count = (st) => rows.filter((x) => x.r && x.r.status === st).length;
    const ready = count('READY');
    const pick = count('NEEDS_PICK');
    const blocked = rows.filter((x) => x.r && !['READY', 'NEEDS_PICK'].includes(x.r.status)).length;
    const missing = sl.plan ? sl.plan.missing.map((m) => emp(m.id) || { id: m.id, name: m.name, stores: [m.store] })
      : DATA.employees.filter((e) => e.slip !== 'Found');
    const result = sl.result;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Payment Slips</h1><div class="tags small muted"><span>${esc(DATA.period)} · upload many slips at once; each is named and filed for you</span>${sampleTag()}</div></div>
        <div class="tools">${periodSelect('sl-month')}${modeBadge()}${refreshBtn()}</div>
      </header>
      ${liveStrip()}${toastHTML()}
      ${result ? `<div class="notice ${result.saved.length ? 'ok' : 'info'}" role="status">${icon.info}<div class="grow">
          <strong>${result.saved.length} slip${result.saved.length === 1 ? '' : 's'} saved${result.preview ? ' in this preview (nothing was uploaded)' : ' to the ' + esc(DATA.period) + ' Payment Slip folder'}.</strong>
          ${result.skipped.length ? `<span>${result.skipped.length} not saved: ${result.skipped.map((s) => esc(s.name) + ' (' + esc(s.reason) + ')').join('; ')}</span>` : ''}
        </div><button type="button" class="link-btn" data-action="slips-dismiss">Dismiss</button></div>` : ''}

      ${folderNotice()}
      <div class="${sl.files.length ? 'stack' : 'split'}">
        <section class="card raised main-col" aria-labelledby="up-title">
          <div class="card-head"><div><h2 id="up-title">Upload slips</h2><span class="small muted">The person is found from the filename. Nothing is saved until you press Save.</span></div>
            ${sl.files.length ? '<button type="button" class="btn btn-quiet btn-sm" data-action="slips-clear">Clear list</button>' : ''}</div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
            <label class="dropzone" id="dropzone" for="slip-input">
              ${icon.upload}
              <strong>Drop PDF slips here, or click to choose</strong>
              <span class="small muted">Any filename is fine, e.g. “Aiman - payslip.pdf”. It is renamed to the standard name.</span>
              <input type="file" id="slip-input" accept=".pdf,application/pdf" multiple class="sr-only">
            </label>
            ${DATA.preview && !sl.files.length ? '<button type="button" class="btn btn-secondary btn-sm" data-action="slips-sample" style="align-self:flex-start">Try with sample files</button>' : ''}
            ${sl.files.length ? `
            <div class="tags"><span class="badge b-ready">${ready} ready to save</span>${pick ? `<span class="badge b-attention">${pick} need a person</span>` : ''}${blocked ? `<span class="badge b-failed">${blocked} cannot be saved</span>` : ''}${sl.planning ? '<span class="small muted" style="display:inline-flex;gap:6px;align-items:center"><span class="spinner sm"></span>Checking…</span>' : ''}</div>
            <div class="table-wrap"><table class="slip-table">
              <thead><tr><th scope="col">File</th><th scope="col">Employee</th><th scope="col">Saved as</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
              <tbody>${rows.map(({ f, r }) => {
                const view = r ? SLIP_VIEW[r.status] : ['b-neutral', 'Checking'];
                const picker = r && CAN_PICK.includes(r.status) && (r.status !== 'READY' || f.changing || f.pickedId);
                return `<tr class="${r && r.status === 'READY' ? '' : 'warn'}">
                  <td><strong class="fname">${esc(f.name)}</strong><div class="small muted">${kb(f.size)}${f.sample ? ' · sample' : ''}</div></td>
                  <td>${picker ? `<label class="sr-only" for="pick-${f.key}">Employee for ${esc(f.name)}</label><select class="select pick" id="pick-${f.key}" data-pick="${f.key}">${staffOptions(f.pickedId || r.employeeId)}</select>`
                    : r && r.employeeName ? `<span>${esc(r.employeeName)}</span>${r.status === 'READY' ? `<div><button type="button" class="link-btn" data-change="${f.key}" style="font-size:12px;min-height:24px">Change</button></div>` : ''}` : '<span class="muted">—</span>'}</td>
                  <td class="small">${r && r.target ? esc(r.target) : '<span class="muted">—</span>'}</td>
                  <td><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">${`<span class="badge ${view[0]}">${view[1]}</span>`}${r && r.reason ? `<span class="small muted">${esc(r.reason)}</span>` : ''}</div></td>
                  <td class="right"><button type="button" class="icon-btn" data-remove-file="${f.key}" aria-label="Remove ${esc(f.name)}">${icon.trash}</button></td>
                </tr>`;
              }).join('')}</tbody></table></div>
            <div class="df-row">
              <span class="small muted">${ready ? 'Only “Ready to save” files are saved. Nothing in Drive is replaced.' : 'Pick a person for each file, or remove it.'}</span>
              <button type="button" class="btn btn-primary" data-action="slips-save"${!ready || sl.planning || sl.saving ? ' disabled' : ''}>${sl.saving ? '<span class="spinner sm"></span>Saving…' : `Save ${ready} slip${ready === 1 ? '' : 's'}`}</button>
            </div>` : ''}
          </div>
        </section>

        <section class="card side-col" aria-labelledby="miss-title" style="gap:0">
          <div class="card-head"><div><h2 id="miss-title">Still missing a slip</h2><span class="small muted">${sl.plan ? 'After this upload' : 'In Drive right now'}</span></div><span class="badge ${missing.length ? 'b-attention' : 'b-sent'}">${missing.length}</span></div>
          ${missing.length ? `<ul class="plain-list" style="padding:0 24px">${missing.map((m) => `
            <li class="cs-row" style="align-items:center"><span style="display:flex;flex-direction:column;gap:4px"><span>${esc(m.name)}</span><span class="tags">${storeBadges(m.stores || [])}<span class="small muted">${idText(m.id)}</span></span></span>${emp(m.id) ? `<button type="button" class="link-btn" data-open="${esc(m.id)}" style="font-size:13px">Open</button>` : ''}</li>`).join('')}</ul>`
          : '<div class="empty"><h3>Everyone has a slip</h3><span class="small muted">Nothing is missing for this month.</span></div>'}
        </section>
      </div>
      ${driveSlipsCard()}`;
  }

  /* ---------- This month's Drive folders (owner, 2026-10-27: create them from the website) ---------- */
  function folderNotice() {
    const f = DATA.folders;
    if (!f || (f.slip && f.calc)) return '';
    const missing = [!f.slip && 'Payment Slips', !f.calc && 'Payment Calculations'].filter(Boolean).join(' and ');
    return `<div class="notice" role="note">${icon.alert}<div class="grow">
        <strong>There is no “${esc(f.name)}” folder in ${esc(missing)} yet.</strong>
        <span>${f.problem ? esc(f.problem) : 'Slips cannot be saved until it exists. Create it here; nothing else changes.'}</span>
      </div>${f.problem ? '' : '<button type="button" class="btn btn-primary btn-sm" data-action="create-folders">Create the folders</button>'}</div>`;
  }
  async function createFolders(btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>Creating…';
    try {
      const res = await call('createMonthFolders', { period: DATA.period });
      await load(DATA.period, { message: res.message });
    } catch (err) { toast('Folders not created: ' + errText(err), 'error'); }
  }

  /* ---------- Slips already in Drive: view, and rename to the standard name ---------- */
  const DRIVE_VIEW = { standard: ['b-sent', 'Standard name'], rename: ['b-ready', 'Will be renamed'], unknown: ['b-attention', 'Pick the person'], blocked: ['b-failed', 'Left as it is'] };
  function driveSlipsCard() {
    const d = state.slips.drive;
    const head = `<div class="card-head"><div><h2 id="drive-title">Slips in Drive</h2><span class="small muted">Every file in the ${esc(DATA.period)} Payment Slip folder</span></div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="drive-load">${d && d.rows ? icon.refresh + 'Check again' : 'Show slips in Drive'}</button></div>`;
    if (!d) return `<section class="card" aria-labelledby="drive-title">${head}</section>`;
    if (d.loading) return `<section class="card" aria-labelledby="drive-title">${head}<div class="loading"><span class="spinner"></span>Reading the folder…</div></section>`;
    if (d.error) return `<section class="card" aria-labelledby="drive-title">${head}<div class="card-body"><div class="notice error">${icon.alert}<span class="grow">${esc(d.error)}</span></div></div></section>`;
    const toRename = d.rows.filter((r) => r.state === 'rename' && d.chosen[r.fileId] !== false);
    return `<section class="card raised" aria-labelledby="drive-title">${head}
      ${!d.folderOk ? '<div class="card-body"><p class="muted" style="margin:0">The folder does not exist yet.</p></div>' : !d.rows.length ? '<div class="empty"><h3>The folder is empty</h3></div>' : `
      <div class="table-wrap"><table class="slip-table">
        <thead><tr><th scope="col"><span class="sr-only">Rename</span></th><th scope="col">File in Drive</th><th scope="col">Employee</th><th scope="col">Standard name</th><th scope="col">Status</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr class="${r.state === 'standard' ? '' : 'warn'}">
          <td>${r.state === 'rename' ? `<input type="checkbox" data-drive-choose="${esc(r.fileId)}" aria-label="Rename ${esc(r.name)}"${d.chosen[r.fileId] !== false ? ' checked' : ''}>` : ''}</td>
          <td><a class="fname" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></td>
          <td>${r.state === 'unknown' || d.picks[r.fileId] ? `<label class="sr-only" for="dpick-${esc(r.fileId)}">Employee for ${esc(r.name)}</label><select class="select pick" id="dpick-${esc(r.fileId)}" data-drive-pick="${esc(r.fileId)}">${staffOptions(d.picks[r.fileId] || '')}</select>` : r.employeeName ? esc(r.employeeName) : '<span class="muted">—</span>'}</td>
          <td class="small">${r.target ? esc(r.target) : '<span class="muted">—</span>'}</td>
          <td><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start"><span class="badge ${DRIVE_VIEW[r.state][0]}">${DRIVE_VIEW[r.state][1]}</span><span class="small muted">${esc(r.reason)}</span></div></td>
        </tr>`).join('')}</tbody></table></div>
      <div class="df-row" style="padding:0 24px 20px">
        <span class="small muted">Renaming only changes the file's name. A name already in the folder is never reused, and slips of people already sent are left alone.</span>
        <button type="button" class="btn btn-primary" data-action="drive-rename"${toRename.length ? '' : ' disabled'}>Rename ${toRename.length} to the standard name</button>
      </div>`}
    </section>`;
  }
  async function loadDriveSlips() {
    const old = state.slips.drive;
    const picks = (old && old.picks) || {};
    state.slips.drive = { loading: true, picks, chosen: (old && old.chosen) || {} };
    render();
    try {
      const res = await call('listSlipFiles', { period: DATA.period, picks });
      Object.assign(state.slips.drive, { loading: false, rows: res.rows, folderOk: res.folderOk });
    } catch (err) { Object.assign(state.slips.drive, { loading: false, error: 'Could not read the folder: ' + errText(err) }); }
    render();
  }
  async function renameDriveSlips() {
    const d = state.slips.drive;
    const rows = d.rows.filter((r) => r.state === 'rename' && d.chosen[r.fileId] !== false);
    const ok = await confirmBox('Rename ' + rows.length + ' slip' + (rows.length === 1 ? '' : 's') + '?',
      `<ul class="plain-list">${rows.map((r) => `<li style="padding:8px 0;display:flex;flex-direction:column;gap:2px"><span class="small muted">${esc(r.name)}</span><strong class="small">→ ${esc(r.target)}</strong></li>`).join('')}</ul>`,
      'Rename');
    if (!ok) return;
    try {
      const res = await call('renameSlips', { period: DATA.period, fileIds: rows.map((r) => r.fileId), picks: d.picks });
      toast(res.renamed.length + ' renamed.' + (res.skipped.length ? ' ' + res.skipped.length + ' not renamed: ' + res.skipped.map((s) => s.name + ' (' + s.reason + ')').join('; ') : ''), res.skipped.length ? 'error' : 'ok');
      await loadDriveSlips();
      load(DATA.period);
    } catch (err) { toast('Not renamed: ' + errText(err), 'error'); }
  }

  /** A yes/no window. Resolves true only when the admin presses the OK button. */
  function confirmBox(title, html, okLabel, danger) {
    return new Promise((resolve) => {
      const dlg = document.getElementById('confirm-dialog');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-body').innerHTML = html;
      const go = document.getElementById('confirm-go');
      go.textContent = okLabel || 'OK';
      go.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      let settled = false;
      const done = (answer) => {
        if (settled) return;
        settled = true;
        go.onclick = null; dlg.onclose = null;
        if (dlg.open) dlg.close();
        resolve(answer);
      };
      go.onclick = () => done(true);
      // A "close" left over from the previous window arrives while this one is open: ignore it.
      dlg.onclose = () => { if (!dlg.open) done(false); };
      dlg.showModal();
    });
  }

  async function addSlipFiles(list, sample) {
    const added = [...list].map((x) => ({ key: 'f' + (++fileSeq), name: x.name, size: x.size, file: sample ? null : x, sample: !!sample, pickedId: '' }));
    if (!added.length) return;
    state.slips.files = state.slips.files.concat(added);
    state.slips.result = null;
    await planSlips();
  }
  async function planSlips() {
    const sl = state.slips;
    if (!sl.files.length) { sl.plan = null; render(); return; }
    sl.planning = true; sl.error = null; render();
    try {
      sl.plan = await call('planSlipUpload', { period: DATA.period, files: sl.files.map((f) => ({ key: f.key, name: f.name, size: f.size, pickedId: f.pickedId })) });
    } catch (err) { toast('Could not check the files: ' + errText(err), 'error'); }
    sl.planning = false;
    render();
  }
  const readBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read ' + file.name));
    r.readAsDataURL(file);
  });
  function openSlipSave() {
    const ready = state.slips.files.filter((f) => { const r = slipRow(f); return r && r.status === 'READY'; });
    document.getElementById('slip-save-list').innerHTML = ready.map((f) => { const r = slipRow(f); return `<li><strong>${esc(r.employeeName)}</strong><br><span class="small muted">${esc(r.target)}</span></li>`; }).join('');
    document.getElementById('slip-save-title').textContent = `Save ${ready.length} slip${ready.length === 1 ? '' : 's'} to Drive?`;
    document.getElementById('slip-save-dialog').showModal();
  }
  async function saveSlips() {
    document.getElementById('slip-save-dialog').close();
    const sl = state.slips;
    sl.saving = true; render();
    try {
      const files = [];
      for (const f of sl.files) {
        const r = slipRow(f);
        files.push({ key: f.key, name: f.name, size: f.size, pickedId: f.pickedId,
          dataBase64: r && r.status === 'READY' && f.file ? await readBase64(f.file) : '' });
      }
      const res = await call('saveSlips', { period: DATA.period, files });
      const savedNames = res.saved.map((s) => s.name);
      sl.files = sl.files.filter((f) => !savedNames.includes(f.name));
      sl.result = { saved: res.saved, skipped: res.skipped.filter((s) => sl.files.some((f) => f.name === s.name)), preview: !!DATA.preview };
      sl.saving = false;
      await load(DATA.period);
      await planSlips();
      announce(res.saved.length + ' slips saved');
    } catch (err) {
      sl.saving = false;
      toast('Slips not saved: ' + errText(err) + '. Nothing was changed; try again.', 'error');
    }
  }

  /* ---------- Jibble & Documents ---------- */
  function checks() {
    const j = DATA.jibble;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Jibble &amp; Documents</h1><span class="small muted">${esc(DATA.period)} · everything the payout needs before you prepare it</span></div>
        <div class="tools">${periodSelect('ck-month')}${modeBadge()}${refreshBtn()}</div>
      </header>
      ${liveStrip()}${toastHTML()}
      ${monthSetupCard()}
      <section class="card raised" aria-labelledby="jt">
        <div class="card-head"><div><h2 id="jt">Jibble hours</h2><span class="small muted">The ${esc(DATA.period)} tab was filled from Jibble on ${esc(j.filledAt)}</span></div></div>
        <div class="card-body tiles">
          ${j.stores.map((s) => `<div class="tile">${storeBadges([s.store])}<span class="big">${s.people} people</span><span class="small muted">Hours read from Jibble</span></div>`).join('')}
          <div class="tile"><span class="badge b-sent">Protected</span><span class="big">${j.paidProtected} marked Paid</span><span class="small muted">Filling the month from Jibble again never changes anyone marked Paid.</span></div>
        </div>
        <div class="card-body" style="padding-top:0;display:flex;flex-direction:column;gap:18px">
          <div>
            <h3 class="label">Not linked to the Staff Directory</h3>
            ${j.unmatched.length ? `<ul class="plain-list">${j.unmatched.map((u) => {
              const k = u.store + '|' + u.jibbleId;
              const col = u.store === 'SS18' ? 'ss18' : 'ioi';
              return `<li class="link-row">
                <div style="flex:1 1 200px;display:flex;flex-direction:column;gap:4px"><strong>${esc(u.jibbleName)}</strong><span class="tags">${storeBadges([u.store])}<span class="small muted">Jibble ID ${esc(u.jibbleId)} · ${esc(u.hours)} hours</span></span></div>
                <label class="sr-only" for="link-${esc(k)}">Staff Directory person for ${esc(u.jibbleName)}</label>
                <select class="select" id="link-${esc(k)}" data-link="${esc(k)}" style="flex:1 1 240px">
                  <option value="">Who is this in the Staff Directory?</option>
                  ${DATA.staff.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => `<option value="${esc(s.id)}"${s[col] ? ' disabled' : ''}${state.links[k] === s.id ? ' selected' : ''}>${esc(s.name)}${s[col] ? ' (already linked)' : ''}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" data-link-go="${esc(k)}"${state.links[k] ? '' : ' disabled'}>Link</button>
              </li>`; }).join('')}</ul>
            <p class="small muted" style="margin:8px 0 0">Nothing is guessed. Linking fills only that person's empty Jibble ID; then run Jibble again to bring in the hours.</p>`
            : '<p class="muted small" style="margin:6px 0 0">Everyone in Jibble is linked.</p>'}
          </div>
          <div>
            <h3 class="label">Warnings</h3>
            ${j.warnings.length ? `<ul class="plain-list">${j.warnings.map((w) => `
              <li style="display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;padding:14px 0">
                <span class="badge b-attention">${esc(w.tag)}</span>
                <div style="flex:1 1 280px;display:flex;flex-direction:column;gap:2px"><strong style="font-size:15px">${esc(w.title)}</strong><span class="small muted">Next: ${esc(w.next)}</span></div>
                ${storeBadges([w.store])}
                ${w.employeeId ? `<button type="button" class="btn btn-secondary btn-sm" data-open="${esc(w.employeeId)}">Open</button>` : ''}
              </li>`).join('')}</ul>` : '<p class="muted small" style="margin:6px 0 0">No warnings.</p>'}
          </div>
          <p class="small muted" style="margin:0;line-height:1.5">Hours are corrected in Jibble. Then use <strong style="color:var(--ink)">Jibble → Fill in a month from Jibble</strong> in the spreadsheet.</p>
        </div>
      </section>
      <section class="card" aria-labelledby="dt">
        <div class="card-head"><div><h2 id="dt">Documents</h2><span class="small muted">One person’s slip or PDF opens from their panel in Payroll Management</span></div><a class="btn btn-secondary btn-sm" href="#slips">${icon.upload}Upload slips</a></div>
        <ul class="plain-list" style="padding:0 24px">${DATA.documents.map((d) => `
          <li style="display:flex;gap:14px;align-items:flex-start;padding:14px 0">
            <span class="badge ${d.ok ? 'b-sent' : 'b-attention'}" style="min-width:64px;justify-content:center">${d.ok ? 'OK' : 'Check'}</span>
            <div><strong style="font-size:15px">${esc(d.title)}</strong><br><span class="small muted">${esc(d.note)}</span></div>
          </li>`).join('')}</ul>
      </section>`;
  }
  /* ---------- Start a month (owner, 2026-10-27: the system is used every month, forever) ---------- */
  const monthLabel = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  function monthSetupCard() {
    const m = DATA.months;
    if (!m) return '';
    const chosen = state.monthSetup || m.next;
    const exists = DATA.periods.includes(monthLabel(chosen));
    return `<section class="card raised" aria-labelledby="ms-title">
      <div class="card-head"><div><h2 id="ms-title">Start a month</h2><span class="small muted">Makes the month tab from Jibble (a copy of last month’s layout) and its Drive folders. The same as the spreadsheet’s Jibble menu.</span></div></div>
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px 28px;align-items:flex-end">
        <label class="field">Month<input class="input" type="month" id="ms-month" value="${esc(chosen)}"></label>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ms-fill" checked> Fill the month tab from Jibble</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ms-folders" checked> Create its Payment Slip and Payment Calculation folders</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ms-current"${chosen !== m.current ? ' checked' : ''}> Make it the current payout month in Configuration</label>
          ${exists ? `<label style="display:flex;gap:8px;align-items:center;color:var(--failed-ink)"><input type="checkbox" id="ms-replace"> The “${esc(monthLabel(chosen))}” tab already exists: replace it (anything typed into it is lost)</label>` : ''}
        </div>
        <button type="button" class="btn btn-primary" data-action="month-setup">Set up ${esc(monthLabel(chosen))}</button>
      </div>
      <p class="small muted" style="margin:0;padding:0 24px 20px;line-height:1.5">Jibble only gives hours for days that have finished, so a new month can be filled from its 2nd day. Run it again later to bring in more days. A tab with anyone marked Paid, or one made by hand, is never replaced.</p>
    </section>`;
  }
  async function setUpMonth(btn) {
    const month = document.getElementById('ms-month').value;
    if (!/^\d{4}-\d{2}$/.test(month)) { toast('Choose a month.', 'error'); return; }
    const args = { month, fill: document.getElementById('ms-fill').checked, folders: document.getElementById('ms-folders').checked,
      makeCurrent: document.getElementById('ms-current').checked, replace: !!(document.getElementById('ms-replace') || {}).checked };
    const label = monthLabel(month);
    if (args.fill && DATA.periods.includes(label) && !args.replace) { toast('“' + label + '” already exists. Tick “replace it” to fill it again.', 'error'); return; }
    const ok = await confirmBox('Set up ' + label + '?', `<ul style="margin:0;padding-left:20px;line-height:1.7">
        ${args.fill ? `<li>${args.replace ? '<strong>Replace</strong> the' : 'Make the'} “${esc(label)}” tab from Jibble</li>` : ''}
        ${args.folders ? `<li>Create the “${esc(label)}” folders in Drive (only if missing)</li>` : ''}
        ${args.makeCurrent ? `<li>Set Configuration’s payout month to ${esc(label)}</li>` : ''}</ul>`, 'Set up', args.replace);
    if (!ok) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>Working… (this can take a minute)';
    try {
      const res = await call('setUpMonth', args);
      state.monthSetup = null;
      await load(args.makeCurrent || args.fill ? label : DATA.period, { full: true, message: res.message.split('\n')[0] });
      await confirmBox(label + ' is set up', `<pre class="email-text" style="white-space:pre-wrap">${esc(res.message)}</pre>`, 'OK');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Set up ' + label;
      toast('Not set up: ' + errText(err), 'error');
    }
  }

  function openLink(k) {
    const u = DATA.jibble.unmatched.find((x) => x.store + '|' + x.jibbleId === k);
    const s = DATA.staff.find((x) => x.id === state.links[k]);
    if (!u || !s) return;
    document.getElementById('link-body').innerHTML = `
      <dl class="facts"><div><span>Jibble (${esc(u.store)})</span><strong>${esc(u.jibbleName)}</strong><span>${esc(u.jibbleId)}</span></div>
      <div><span>Staff Directory</span><strong>${esc(s.name)}</strong><span>${esc(s.id)}</span></div></dl>
      <p class="small muted" style="margin:0;line-height:1.5">This writes ${esc(u.jibbleId)} into ${esc(s.name)}’s empty ${esc(u.store)} Jibble ID cell. Nothing else changes, and no one is merged. Run Jibble again afterwards to bring in the hours.</p>`;
    document.getElementById('link-go').dataset.key = k;
    document.getElementById('link-dialog').showModal();
  }
  async function doLink(k) {
    const [store, jibbleId] = k.split('|');
    const btn = document.getElementById('link-go');
    btn.disabled = true;
    try {
      const res = await call('linkJibblePerson', { store, jibbleId, employeeId: state.links[k] });
      document.getElementById('link-dialog').close();
      delete state.links[k];
      await load(DATA.period, { message: res.message || 'Linked.' });
    } catch (err) {
      document.getElementById('link-dialog').close();
      toast('Not linked: ' + errText(err), 'error');
    }
    btn.disabled = false;
  }

  /* ---------- Settings (Test Mode) ---------- */
  function settings() {
    const on = DATA.testMode;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Settings</h1><span class="small muted">From the Configuration tab of Retail Payout 2026</span></div>
        <div class="tools">${modeBadge()}${refreshBtn()}</div>
      </header>
      ${liveStrip()}${toastHTML()}
      <section class="card raised mode-card ${on ? 'is-test' : 'is-live'}" aria-labelledby="tm-title">
        <div class="mode-row">
          <div style="display:flex;flex-direction:column;gap:6px;flex:1 1 300px">
            <h2 id="tm-title" style="font-size:22px">Test Mode is ${on ? 'ON' : 'OFF'}</h2>
            <p style="margin:0;line-height:1.5">${on
              ? 'Safe. Test emails go only to the Test Email in Configuration. No employee receives anything.'
              : '<strong>LIVE.</strong> A send from the spreadsheet emails real employees.'}</p>
          </div>
          <button type="button" class="switch" role="switch" aria-checked="${on}" aria-label="Test Mode" data-action="toggle-test" id="test-switch">
            <span class="switch-track"><span class="switch-knob"></span></span><span class="switch-text">${on ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <div class="card-body" style="padding-top:0">
          <ul class="ol-steps" style="list-style:disc">
            <li>This switch changes <strong>Test Mode</strong> in Configuration. The badge shows what Configuration holds, read back after every change.</li>
            <li>Turning it off sends nothing. LIVE emails still need the Authorized Sender, the Pre-Send Check and <em>5. Send Ready Employees</em> in the spreadsheet.</li>
            <li>If Configuration is blank or unclear, Test Mode counts as ON.</li>
          </ul>
        </div>
      </section>
      ${configCard()}`;
  }

  /* ---------- Configuration (the same settings as the Configuration tab) ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function cfgProblem(row, v) {
    const s = String(v == null ? '' : v).trim();
    if (row.kind === 'email' && s && !EMAIL_RE.test(s)) return row.label + ' must be an email address, or blank.';
    if (row.kind === 'emails' && s && s.split(',').some((e) => !EMAIL_RE.test(e.trim()))) return row.label + ' must be email addresses separated by commas, or blank.';
    if (row.kind === 'year' && !/^20\d{2}$/.test(s)) return row.label + ' must be a year like 2026.';
    if (row.kind === 'month' && !MONTHS.includes(s)) return 'Choose the ' + row.label + '.';
    if ((row.kind === 'folder' || row.kind === 'file') && s && !/^[A-Za-z0-9_-]{10,}$/.test(s)) return row.label + ' must be a Google Drive ID (the long code in the link), or blank.';
    if (row.required && !s) return row.label + ' cannot be blank.';
    return '';
  }
  function cfgChanges() {
    const d = state.cfg.draft;
    if (!d) return [];
    return DATA.config.filter((r) => !r.locked && String(d[r.label]).trim() !== String(r.value == null ? '' : r.value));
  }
  function configCard() {
    const c = state.cfg;
    const groups = [...new Set(DATA.config.map((r) => r.group))];
    const changes = cfgChanges();
    const problems = c.editing ? DATA.config.filter((r) => !r.locked).map((r) => cfgProblem(r, c.draft[r.label])).filter(Boolean) : [];
    const field = (r) => {
      const id = 'cfg-' + r.label.replace(/\W+/g, '-');
      const v = c.draft[r.label];
      if (r.kind === 'month') return `<select class="select" id="${id}" data-cfg="${esc(r.label)}">${MONTHS.map((m) => `<option${m === v ? ' selected' : ''}>${m}</option>`).join('')}</select>`;
      return `<input class="input" id="${id}" data-cfg="${esc(r.label)}" value="${esc(v)}" autocomplete="off"${r.kind === 'year' ? ' inputmode="numeric"' : ''}${r.kind === 'email' ? ' type="email"' : ''}${cfgProblem(r, v) ? ' aria-invalid="true"' : ''}>`;
    };
    return `
      <section class="card raised${c.editing ? ' cfg-editing' : ''}" aria-labelledby="sgt">
        <div class="card-head">
          <div><h2 id="sgt">Configuration</h2><span class="small muted">The same settings as the Configuration tab. Changes are written there.</span></div>
          <div class="tags">
            <button type="button" class="link-btn" data-sheet="Configuration">Open the tab ${icon.ext}</button>
            ${c.editing ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-action="cfg-edit">Edit settings</button>'}
          </div>
        </div>
        ${groups.map((g) => `
          <div class="cfg-group">
            <h3 class="label">${esc(g)}</h3>
            <div class="cfg-rows">${DATA.config.filter((r) => r.group === g).map((r) => {
              const id = 'cfg-' + r.label.replace(/\W+/g, '-');
              return `
              <div class="cfg-row${c.editing && !r.locked && String(c.draft[r.label]).trim() !== String(r.value == null ? '' : r.value) ? ' changed' : ''}">
                <div class="cfg-label"><label for="${id}">${esc(r.label)}${r.protected ? ' <span class="badge b-neutral" title="Asks for the password again before saving">Protected</span>' : ''}</label>${r.note ? `<span class="hint">${esc(r.note)}</span>` : ''}</div>
                <div class="cfg-value">${r.locked
                  ? `<span class="cfg-locked">${icon.lock.replace('width="18" height="18"', 'width="14" height="14"')}<span>${r.value === '' || r.value == null ? '<span class="muted">Blank</span>' : esc(r.value)}</span></span>`
                  : c.editing ? field(r)
                  : r.value === '' || r.value == null ? '<span class="muted">Blank</span>' : `<strong>${esc(r.value)}</strong>`}</div>
              </div>`; }).join('')}</div>
          </div>`).join('')}
        ${c.editing ? `
        <div class="df" style="box-shadow:none;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
          <div class="notice error" id="cfg-problem"${problems.length ? '' : ' hidden'}>${icon.alert}<span class="grow">${esc(problems[0] || '')}</span></div>
          <div class="df-row">
            <span class="small muted" id="cfg-count">${changes.length === 0 ? 'No changes yet' : changes.length === 1 ? '1 unsaved change' : changes.length + ' unsaved changes'}</span>
            <div class="tags">
              <button type="button" class="btn btn-secondary" data-action="cfg-cancel"${c.saving ? ' disabled' : ''}>Cancel</button>
              <button type="button" class="btn btn-primary" data-action="cfg-save" id="cfg-save"${!changes.length || problems.length || c.saving ? ' disabled' : ''}>${c.saving ? '<span class="spinner sm"></span>Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>` : ''}
      </section>`;
  }
  function refreshCfgFooter() {
    const changes = cfgChanges();
    const problems = DATA.config.filter((r) => !r.locked).map((r) => cfgProblem(r, state.cfg.draft[r.label])).filter(Boolean);
    document.getElementById('cfg-count').textContent = changes.length === 0 ? 'No changes yet' : changes.length === 1 ? '1 unsaved change' : changes.length + ' unsaved changes';
    document.getElementById('cfg-save').disabled = !changes.length || !!problems.length || state.cfg.saving;
    const box = document.getElementById('cfg-problem');
    box.hidden = !problems.length;
    box.querySelector('.grow').textContent = problems[0] || '';
  }
  function openCfgSave() {
    const changes = cfgChanges();
    document.getElementById('cfg-list').innerHTML = changes.map((r) => `<li><strong>${esc(r.label)}</strong><br><span class="small muted">${r.value === '' || r.value == null ? 'Blank' : esc(r.value)} → </span><span class="small"><strong>${String(state.cfg.draft[r.label]).trim() === '' ? 'Blank' : esc(String(state.cfg.draft[r.label]).trim())}</strong></span></li>`).join('');
    const monthChange = changes.some((r) => r.kind === 'month' || r.kind === 'year');
    document.getElementById('cfg-month-note').hidden = !monthChange;
    document.getElementById('cfg-dialog').showModal();
  }
  async function saveCfg() {
    document.getElementById('cfg-dialog').close();
    const changes = {};
    cfgChanges().forEach((r) => { changes[r.label] = String(state.cfg.draft[r.label]).trim(); });
    state.cfg.saving = true; render();
    try {
      const res = await call('saveConfiguration', { changes });
      state.cfg = { editing: false, draft: null, saving: false };
      await load(DATA.period, { message: res.message || 'Configuration saved.' });
    } catch (err) {
      state.cfg.saving = false;
      toast('Configuration not saved: ' + errText(err) + ' Your changes are still here.', 'error');
    }
  }
  async function setTestMode(on, confirm) {
    try {
      const res = await call('setTestMode', { on, confirm });
      document.getElementById('test-dialog').close();
      await load(DATA.period, { message: res.message || ('Test Mode is now ' + (res.testMode ? 'ON' : 'OFF') + '.') });
      announce('Test Mode ' + (DATA.testMode ? 'on' : 'off'));
    } catch (err) {
      document.getElementById('test-dialog').close();
      toast('Test Mode was not changed: ' + errText(err), 'error');
    }
  }

  /* ---------- Send Center ---------- */
  function send() {
    const b = state.branch;
    const match = (x) => b === 'both' || x.store.includes(b === 'ss18' ? 'SS18' : 'IOI');
    const will = DATA.preSend.will.filter(match), cannot = DATA.preSend.cannot.filter(match), sent = DATA.preSend.sent.filter(match);
    const byName = (n) => DATA.employees.find((e) => e.name === n);
    const stepIcon = (st, n) => st === 'done' ? `<span class="step-num step-done" aria-hidden="true">${icon.check}</span>`
      : `<span class="step-num ${st === 'current' ? 'step-current' : 'step-todo'}" aria-hidden="true">${n}</span>`;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Send Center</h1><span class="small muted">${esc(DATA.period)} · Prepare and Send are separate steps</span></div>
        <div class="tools">${modeBadge()}${refreshBtn()}<a class="btn btn-secondary btn-sm" href="#payroll">← Payroll Management</a></div>
      </header>
      ${toastHTML()}
      ${DATA.testMode
        ? `<div class="banner-test" role="status"><span class="tag">TEST MODE</span><span style="flex:1 1 320px"><strong>Test Mode is on.</strong> Test emails go only to the Test Email in Configuration. No employee receives anything.</span></div>`
        : `<div class="banner-test" role="status" style="background:var(--live-bg);border-color:var(--live-bg);color:#fff"><span class="tag" style="background:#fff;color:var(--live-bg)">LIVE MODE</span><span><strong>Test Mode is off.</strong> Sends go to real employees.</span></div>`}
      <section class="card card-body" aria-labelledby="stt" style="display:flex;flex-direction:column;gap:16px">
        <h2 id="stt" style="font-size:20px">Sending steps</h2>
        <ol class="steps">${DATA.sendSteps.map((s, i) => `
          <li${s.state === 'current' ? ' aria-current="step"' : ''}><span style="display:flex;align-items:center;gap:8px">${stepIcon(s.state, i + 1)}<strong style="font-size:14px">${esc(s.label)}</strong></span><span class="small muted">${esc(s.note)}</span></li>`).join('')}</ol>
      </section>
      <section class="card raised" aria-labelledby="pct">
        <div class="card-head">
          <div><h2 id="pct">Pre-Send Check</h2><span class="small muted">Who would get an email if you sent now. Checked again at the moment of sending.</span></div>
          ${seg('branch', [['both', 'Both stores'], ['ss18', 'SS18'], ['ioi', 'IOI']], b, 'Store')}
        </div>
        <div class="cols3">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center"><span class="badge b-ready">WILL SEND</span><span class="kpi-value" style="font-size:24px">${will.length}</span></div>
            <span class="small muted">Ready and Manager Verified.</span>
            <ul class="plain-list">${will.map((w) => { const em = byName(w.name); return `<li class="cs-row"><span>${esc(w.name)}</span>${em ? `<button type="button" class="link-btn" data-email="${esc(em.id)}" style="font-size:13px;flex:none">${icon.mail}Preview</button>` : ''}</li>`; }).join('') || '<li class="muted">No one yet.</li>'}</ul>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center"><span class="badge b-attention">CANNOT SEND</span><span class="kpi-value" style="font-size:24px">${cannot.length}</span></div>
            <span class="small muted">Each one says why. Open the person to fix it.</span>
            <ul class="plain-list">${cannot.map((c) => { const em = byName(c.name); return `<li class="cs-row"><span style="display:flex;flex-direction:column;gap:2px"><span>${esc(c.name)} <span class="small muted">· ${esc(c.store)}</span></span><span class="small" style="color:var(--review-ink)">${esc(c.why)}</span></span>${em ? `<button type="button" class="link-btn" data-open="${esc(em.id)}" style="font-size:13px;flex:none">Fix →</button>` : ''}</li>`; }).join('') || '<li class="muted">No one.</li>'}</ul>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center"><span class="badge b-sent">ALREADY SENT</span><span class="kpi-value" style="font-size:24px">${sent.length}</span></div>
            <span class="small muted">Never sent twice.</span>
            <ul class="plain-list">${sent.map((s) => `<li class="cs-row"><span>${esc(s.name)}</span><span class="small muted">${esc(s.store)} · ${esc(s.when)}</span></li>`).join('') || '<li class="muted">No one yet.</li>'}</ul>
          </div>
        </div>
      </section>
      <div class="split" style="align-items:stretch">
        <section class="card card-body main-col" aria-labelledby="tt" style="display:flex;flex-direction:column;gap:12px">
          <h2 id="tt" style="font-size:20px">3. Test Payout Email</h2>
          <p class="muted" style="margin:0;line-height:1.5">Sends each email to the Test Email in Configuration only, with both attachments. No employee receives anything, and nothing is marked Sent.</p>
          <button type="button" class="btn btn-secondary" data-action="send-test" style="align-self:flex-start">${icon.mail}Send test emails</button>
        </section>
        <section class="card card-body side-col" aria-labelledby="lt" style="display:flex;flex-direction:column;gap:12px">
          <h2 id="lt" style="font-size:20px">5. Send Ready Employees</h2>
          <p class="muted" style="margin:0;line-height:1.5">${DATA.testMode ? 'Test Mode is ON, so these also go to the test inbox only.' : '<strong>LIVE:</strong> real emails to real employees, from the Authorized Sender. You type a confirmation first.'}</p>
          <button type="button" class="btn ${DATA.testMode ? 'btn-secondary' : 'btn-live'}" data-action="send-live" style="align-self:flex-start">${icon.send || icon.mail}Send to employees</button>
        </section>
      </div>
      <p class="small muted" style="margin:0;line-height:1.5">Both run the spreadsheet’s own sending: everyone is checked again right before their email, the Send Log is written as it happens, and anyone already sent is never sent again. Only the month set in Configuration can be sent.</p>`;
  }

  /* ---------- History ---------- */
  function history() {
    const h = state.history;
    const q = h.q.trim().toLowerCase();
    const rows = DATA.sendLog.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (h.period === 'all' || r.period === h.period) && (h.mode === 'all' || r.mode === h.mode));
    return `
      <header class="page-head">
        <div class="title-block"><h1>History</h1><span class="small muted">Every send step from the Send Log. Nothing here can be changed or deleted.</span></div>
        <div class="tools">${refreshBtn()}</div>
      </header>
      ${toastHTML()}
      <div class="card card-body" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px">
        <label class="field" style="flex:1 1 240px">Search employee<input class="input" type="search" id="history-q" value="${esc(h.q)}" placeholder="Name"></label>
        <label class="field">Payroll month
          <select class="select" id="history-period">
            <option value="all"${h.period === 'all' ? ' selected' : ''}>All months</option>
            ${DATA.periods.map((p) => `<option value="${esc(p)}"${h.period === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}
          </select></label>
        <div class="field"><span>Mode</span>${seg('history-mode', [['all', 'All'], ['LIVE', 'LIVE'], ['TEST', 'TEST']], h.mode, 'Mode')}</div>
      </div>
      <section class="card raised" aria-labelledby="lgt">
        <div class="card-head"><h2 id="lgt">Send Log</h2><span class="small muted">${rows.length} entries · newest first</span></div>
        ${rows.length ? `<div class="table-wrap"><table class="log">
          <thead><tr><th scope="col">When</th><th scope="col">Payroll month</th><th scope="col">Employee</th><th scope="col">Mode</th><th scope="col">Sent to</th><th scope="col">Result</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td class="num" style="white-space:nowrap">${esc(r.when)}</td>
            <td>${esc(r.period)}</td>
            <th scope="row"><strong>${esc(r.name)}</strong></th>
            <td><span class="badge ${r.mode === 'LIVE' ? 'b-live' : 'b-test'}">${esc(r.mode)}</span></td>
            <td class="muted">${esc(r.to)}</td>
            <td><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">${statusBadge(r.result)}${r.note ? `<span class="small muted">${esc(r.note)}</span>` : ''}</div></td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><h3>Nothing found</h3><span class="muted small">Try another name, month or mode.</span></div>`}
      </section>`;
  }

  /* ---------- Employee drawer ---------- */
  /**
   * What the admin is looking at for this person. Sent with every change;
   * the backend refuses if the spreadsheet no longer shows the same values
   * (someone changed it meanwhile). No version numbers are kept anywhere.
   */
  const saw = (e) => ({ total: e.total, payment: e.payment, paymentId: e.paymentId || '', paymentDate: e.paymentDate || '',
    verified: !!e.verified, claims: e.claims, incentives: e.incentives, commission: e.commission, status: e.status });
  const listCopy = (items) => (items || []).map((x) => ({ type: x.type || '', amount: plain(x.amount) }));
  function makeDraft(e, section) {
    if (section === 'payout') return { claims: listCopy(e.claims), incentives: listCopy(e.incentives), commission: plain(e.commission) };
    if (section === 'payment') return { verified: !!e.verified, payment: e.payment, paymentId: e.paymentId || '', paymentDate: e.paymentDate || '' };
    return null;
  }
  const trimList = (items) => items.map((x) => ({ type: x.type.trim(), amount: String(x.amount).trim() })).filter((x) => x.type || x.amount);
  function cleanDraft(d) {
    if (state.editing === 'payout') return { claims: trimList(d.claims), incentives: trimList(d.incentives), commission: String(d.commission).trim() };
    return { verified: d.verified, payment: d.payment, paymentId: d.paymentId.trim(), paymentDate: d.paymentDate };
  }
  function draftChanges(e) {
    if (!state.editing || !state.draft || !e) return [];
    const a = cleanDraft(makeDraft(e, state.editing)), b = cleanDraft(state.draft);
    return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  }
  function draftProblem() {
    const d = state.draft;
    if (!d) return '';
    if (state.editing === 'payout') {
      const bad = (list) => trimList(list).some((x) => !x.type || x.amount === '' || badAmount(x.amount));
      if (bad(d.claims)) return 'Each claim needs a type and an amount, e.g. Transport and 45.50.';
      if (bad(d.incentives)) return 'Each incentive needs a type and an amount, e.g. Sales target and 100.';
      if (badAmount(d.commission)) return 'Commission must be a number like 120 or 120.50, or blank for none.';
    }
    return '';
  }

  function listEditor(list, label, d) {
    return `<div class="field full"><span>${label}</span>
      <div class="list-edit">${d[list].map((x, i) => `
        <div class="list-row">
          <label class="sr-only" for="${list}-t-${i}">${label} type</label>
          <input class="input" id="${list}-t-${i}" data-list="${list}" data-i="${i}" data-f="type" list="${list === 'claims' ? 'claim-types' : ''}" placeholder="Type" value="${esc(x.type)}" autocomplete="off">
          <div class="money-in"><span>RM</span><label class="sr-only" for="${list}-a-${i}">${label} amount</label><input class="input" id="${list}-a-${i}" data-list="${list}" data-i="${i}" data-f="amount" inputmode="decimal" placeholder="0.00" value="${esc(x.amount)}"${badAmount(x.amount) ? ' aria-invalid="true"' : ''}></div>
          <button type="button" class="icon-btn" data-remove-row="${list}" data-i="${i}" aria-label="Remove this ${label.toLowerCase().replace(/s$/, '')}">${icon.trash}</button>
        </div>`).join('') || `<span class="small muted">No ${label.toLowerCase()} this month.</span>`}
        <button type="button" class="link-btn" data-add-row="${list}" style="align-self:flex-start">${icon.plus}Add ${label.toLowerCase().replace(/s$/, '')}</button>
      </div></div>`;
  }

  function drawerHTML(e) {
    const rows = payrollRows();
    const idx = rows.findIndex((r) => r.id === e.id);
    const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;
    const ed = state.editing;
    const isPaid = e.payment === 'Paid';
    const lockedSent = e.status === 'Sent';
    // canEdit comes from the backend: false for Sent / Review Required, or someone not matched to the Staff Directory.
    const canEdit = !ed && e.canEdit !== false;
    const paidWarn = `<div class="notice">${icon.alert}<span class="grow"><strong>Already marked Paid.</strong><span>Saving can change Total Payout, so it may no longer match the amount already transferred. Payment Status stays as it is, and no payment is made or reversed.</span></span></div>`;
    const preparedWarn = `<div class="notice info">${icon.info}<span class="grow">This payout is already prepared. Saving marks it as changed, so Prepare Payout must run again before it can be sent.</span></div>`;
    const sentWarn = `<div class="notice">${icon.alert}<span class="grow"><strong>The payslip email was already sent.</strong><span>A change here is not emailed again. Tell the employee if their payout changes.</span></span></div>`;
    const log = DATA.sendLog.find((r) => r.name === e.name && r.period === DATA.period);
    const sendText = e.status === 'Sent' ? 'Sent. Never sent twice.' : e.issue ? 'Held until the problem is fixed' : e.status === 'Ready' && e.verified ? 'Will send in the next send' : e.status === 'Ready' ? 'Held until Manager Verified' : 'Held';
    const rates = [...new Set(e.lineView.map((l) => l[0] + ' ' + (l[3] || 'missing')))].join(' · ');
    const flagCount = e.attendance.filter((d) => d.flag).length;
    const d = state.draft || {};
    const changes = draftChanges(e);
    const problem = draftProblem();
    const sum = (list) => list.length ? list.map((x) => `<div><dt>${esc(x.type)}</dt><dd>${money(x.amount)}</dd></div>`).join('') : '';

    return `
    <div class="drawer-root${drawerEnter ? ' enter' : ''}">
      <button type="button" class="scrim" data-action="close-drawer" aria-label="Close employee panel" tabindex="-1"></button>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div class="dh">
          <div class="dh-top">
            <div class="dh-id">
              <span class="avatar lg soft" aria-hidden="true">${esc(initials(e.name))}</span>
              <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><h2 id="drawer-title">${esc(e.name)}</h2><span class="tags"><span class="small muted">${idText(e.id)}</span>${storeBadges(e.stores)}</span></div>
            </div>
            <div class="dh-actions">
              <button type="button" class="icon-btn" data-nav-emp="${idx > 0 ? esc(rows[idx - 1].id) : ''}" aria-label="Previous employee"${idx > 0 ? '' : ' disabled'}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
              <button type="button" class="icon-btn" data-nav-emp="${idx >= 0 && idx < rows.length - 1 ? esc(rows[idx + 1].id) : ''}" aria-label="Next employee"${idx >= 0 && idx < rows.length - 1 ? '' : ' disabled'}>${icon.chev}</button>
              <button type="button" class="icon-btn" data-action="close-drawer" aria-label="Close panel" id="drawer-close">${icon.close}</button>
            </div>
          </div>
          <div class="dh-meta">
            ${statusBadge(e.status)}
            <span><span class="muted">Total</span> <span class="total">${money(e.total)}</span></span>
            <span><span class="muted">Payment</span> <strong>${esc(e.payment)}</strong></span>
            <span><span class="muted">Verified</span> <strong>${e.verified ? 'Yes' : 'Not yet'}</strong></span>
          </div>
          <div class="review-bar">
            <span class="small muted">${idx >= 0 ? `Person ${idx + 1} of ${rows.length}` : 'Not in the current list'} · <kbd>←</kbd> <kbd>→</kbd> to move</span>
            <div class="tags">${e.status === 'Sent' ? '<span class="small muted">Sent: no longer changes</span>'
              : e.total == null ? '<span class="small" style="color:var(--attention-ink)">Total Payout is blank: nothing to verify yet</span>'
              : e.verified ? `<span class="vyes" style="display:inline-flex;gap:4px;align-items:center">${icon.check}Verified</span><button type="button" class="link-btn" data-action="unverify-one"${ed ? ' disabled' : ''} style="font-size:13px">Remove</button>`
              : `<button type="button" class="btn btn-primary btn-sm" data-action="verify-next" id="verify-next"${ed ? ' disabled title="Save or cancel your changes first"' : ''}>${icon.check}I checked it · Verify${next ? ' and next' : ''}</button>`}
              ${next ? `<button type="button" class="btn btn-secondary btn-sm" data-nav-emp="${esc(next.id)}">Next ${icon.chev}</button>` : ''}
            </div>
          </div>
          <nav class="dtabs" aria-label="Panel sections"><a href="#d-info">Employee</a><a href="#d-hours">Hours</a><a href="#d-payout">Payout</a><a href="#d-docs">Payment &amp; documents</a></nav>
        </div>

        <div class="db" id="drawer-body">
          ${DATA.preview ? '<div class="notice info">' + icon.info + '<span class="grow">Preview with invented data. Saving changes this browser tab only, never the Retail Payout sheet.</span></div>' : ''}
          ${toastHTML()}
          ${e.issue ? `<div class="notice" role="note">${icon.alert}<div class="grow"><strong>${esc(e.issue)}</strong><span>${esc(e.fix || '')}</span></div></div>` : ''}

          <section class="dsec" id="d-info" aria-labelledby="d-info-h">
            <div class="dsec-head"><h3 id="d-info-h">Employee information</h3><button type="button" class="link-btn" data-sheet="Staff Directory" style="font-size:13px">Edit in Staff Directory ${icon.ext}</button></div>
            <div class="dsec-body">
              <dl class="kv">
                <div><dt>Employee ID</dt><dd>${idText(e.id)}</dd></div>
                <div><dt>Store</dt><dd>${esc(e.stores.join(' and '))}</dd></div>
                <div><dt>Email</dt><dd>${esc(e.email)}</dd></div>
                <div><dt>Jibble ID</dt><dd>${dash(e.jibble)}</dd></div>
                <div><dt>Hourly rate</dt><dd>${esc(rates)}</dd></div>
                <div><dt>Payroll month</dt><dd>${esc(DATA.period)}</dd></div>
              </dl>
            </div>
          </section>

          <section class="dsec" id="d-hours" aria-labelledby="d-hours-h">
            <div class="dsec-head"><h3 id="d-hours-h">Attendance and working hours</h3></div>
            <div class="dsec-body">
              <div class="sync">
                <span style="display:inline-flex;gap:6px;align-items:center">${icon.refresh}Filled from Jibble · ${esc(DATA.jibble.filledAt)}</span>
                ${flagCount ? `<span style="color:var(--attention-ink)">${flagCount} day${flagCount === 1 ? '' : 's'} without a clock-out</span>` : ''}
              </div>
              ${e.lineView.map(([store, dates, hours, rate, wages]) => `
                <div class="rate-line"><div><strong>${esc(store)} · ${esc(dates)}</strong><br><span class="small muted num">${esc(hours)} hours × ${rate == null ? 'no rate' : esc(rate)}</span></div><span class="num" style="font-weight:bold">${money(wages)}</span></div>`).join('')}
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><span class="label">Daily attendance</span><span class="small muted num">${e.attendance.length} days · ${esc(e.hours)} hours</span></div>
              <div class="days"><table>
                <thead><tr><th scope="col">Date</th><th scope="col">Store</th><th scope="col" style="text-align:right">Hours</th><th scope="col">Note</th></tr></thead>
                <tbody>${e.attendance.map((x) => `<tr class="${x.flag ? 'flag' : ''}"><td>${esc(x.label)}</td><td>${esc(x.store)}</td><td class="right num">${x.hours === '' ? '—' : esc(x.hours)}</td><td>${x.flag ? `<span class="badge b-attention">${esc(x.flag)}</span>` : ''}</td></tr>`).join('')}</tbody>
              </table></div>
              <span class="hint">Hours are corrected in Jibble, then <strong>Jibble → Fill in a month from Jibble</strong> runs again in the spreadsheet. Anyone marked Paid is never changed by it.</span>
            </div>
          </section>

          <section class="dsec${ed === 'payout' ? ' editing' : ''}" id="d-payout" aria-labelledby="d-payout-h">
            <div class="dsec-head"><h3 id="d-payout-h">Payout details</h3>${canEdit ? '<button type="button" class="btn btn-secondary btn-sm" data-edit="payout">Edit</button>' : ''}</div>
            <div class="dsec-body">
              ${ed === 'payout' ? (isPaid ? paidWarn : '') + (lockedSent ? sentWarn : isPrepared(e) ? preparedWarn : '') : ''}
              ${ed !== 'payout' ? `
              <dl class="lines">
                <div><dt>Wages <span class="calc">Hours × rate</span></dt><dd>${money(e.wages)}</dd></div>
                ${sum(e.claims) || '<div><dt>Claims</dt><dd>—</dd></div>'}
                ${sum(e.incentives) || '<div><dt>Incentives</dt><dd>—</dd></div>'}
                <div><dt>Commission</dt><dd>${dash(e.commission)}</dd></div>
                <div class="tot"><dt>Total Payout</dt><dd>${money(e.total)}</dd></div>
              </dl>` : `
              <div class="form">
                <div class="field full"><span>Wages</span><div class="locked"><span>${money(e.wages)}</span><span class="calc">${icon.lock.replace('width="18" height="18"', 'width="11" height="11"')}Hours × rate, from Jibble</span></div></div>
                ${listEditor('claims', 'Claims', d)}
                ${listEditor('incentives', 'Incentives', d)}
                <div class="field"><label for="f-com">Commission</label><div class="money-in"><span>RM</span><input class="input" id="f-com" data-draft="commission" inputmode="decimal" placeholder="0.00" value="${esc(d.commission)}"${badAmount(d.commission) ? ' aria-invalid="true"' : ''}></div></div>
                <div class="field full"><span>Total Payout</span><div class="locked"><span>${money(e.total)}</span><span class="calc">Recalculated by the sheet after saving</span></div></div>
              </div>`}
            </div>
          </section>

          <section class="dsec${ed === 'payment' ? ' editing' : ''}" id="d-docs" aria-labelledby="d-docs-h">
            <div class="dsec-head"><h3 id="d-docs-h">Payment and documents</h3>${canEdit ? '<button type="button" class="btn btn-secondary btn-sm" data-edit="payment">Edit</button>' : ''}</div>
            <div class="dsec-body">
              ${ed !== 'payment' ? `
              <dl class="kv">
                <div><dt>Payment Status</dt><dd>${esc(e.payment)}</dd></div>
                <div><dt>Payment ID</dt><dd>${dash(e.paymentId)}</dd></div>
                <div><dt>Payment Date</dt><dd>${dateText(e.paymentDate)}</dd></div>
                <div><dt>Payout Control</dt><dd>${statusBadge(e.status)}</dd></div>
                <div><dt>Last payslip email</dt><dd>${log ? esc(log.mode + ' · ' + log.result + ' · ' + log.when.replace(' 2026', '')) : 'None yet'}</dd></div>
                <div><dt>Sending</dt><dd>${esc(sendText)}</dd></div>
              </dl>
              <div class="check">${e.verified ? `<span style="color:var(--sent-ink)">${icon.check.replace(/14/g, '20')}</span>` : '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8815F" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>'}
                <span style="display:flex;flex-direction:column;gap:2px"><strong>Manager Verified: ${e.verified ? 'Yes' : 'Not yet'}</strong><span class="hint">${e.verified ? 'Ticked in Payout Control.' : 'Tick this after you check the hours and amounts.'}</span></span></div>` : `
              <label class="check"><input type="checkbox" id="f-verified" data-draft="verified"${d.verified ? ' checked' : ''}><span style="display:flex;flex-direction:column;gap:2px"><strong>Manager Verified</strong><span class="hint">I checked the hours, claims and Total Payout for ${esc(DATA.period)}.</span></span></label>
              ${e.issue && d.verified ? '<div class="notice"><span class="grow">You can tick this, but the Pre-Send Check still holds the payout until the problem above is fixed.</span></div>' : ''}
              <div class="form">
                <div class="field"><label for="f-pay">Payment Status</label>
                  <select class="select" id="f-pay" data-draft="payment">${['Not paid', 'Paid'].map((v) => `<option${d.payment === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
                <div class="field"><label for="f-pdate">Payment Date</label><input class="input" type="date" id="f-pdate" data-draft="paymentDate" value="${esc(d.paymentDate)}"></div>
                <div class="field full"><label for="f-pid">Payment ID</label><input class="input" id="f-pid" data-draft="paymentId" placeholder="Bank reference, e.g. TRX-88120" value="${esc(d.paymentId)}" autocomplete="off"></div>
              </div>
              ${isPaid && d.payment !== 'Paid' ? '<div class="notice">' + icon.alert + '<span class="grow">This only records the status. It does not reverse a bank transfer.</span></div>' : ''}
              <span class="hint">Prepare Payout checks Payment Status and Payment Date with the existing rules before anyone can be sent.</span>`}

              <span class="label" style="margin-top:4px">Documents</span>
              <div class="doc-row">
                <div class="l"><span class="doc-ic"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg></span>
                  <span style="display:flex;flex-direction:column;gap:2px"><strong style="font-size:14px">Payment Slip</strong><span class="doc ${docCls(e.slip)}" style="align-self:flex-start"><i></i>${esc(e.slip)}</span></span></div>
                ${e.slip === 'Found' ? '<button type="button" class="btn btn-secondary btn-sm" data-doc="slip">Open slip ' + icon.ext + '</button>' : '<a class="btn btn-secondary btn-sm" href="#slips" data-action="close-drawer-nav">' + icon.upload + 'Upload slip</a>'}
              </div>
              <div class="doc-row">
                <div class="l"><span class="doc-ic"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg></span>
                  <span style="display:flex;flex-direction:column;gap:2px"><strong style="font-size:14px">Payment Calculation PDF</strong><span class="doc ${docCls(e.pdf)}" style="align-self:flex-start"><i></i>${esc(e.pdf)}</span></span></div>
                ${e.pdf !== 'Not made yet' ? '<button type="button" class="btn btn-secondary btn-sm" data-doc="pdf">Open PDF ' + icon.ext + '</button>' : '<span class="small muted">Made by Prepare Payout</span>'}
              </div>
              <div class="doc-row">
                <div class="l"><span class="doc-ic">${icon.mail}</span><span style="display:flex;flex-direction:column;gap:2px"><strong style="font-size:14px">Payout email</strong><span class="small muted">Exactly what ${esc(e.name.split(' ')[0])} will receive</span></span></div>
                <button type="button" class="btn btn-secondary btn-sm" data-email="${esc(e.id)}">Preview email</button>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:8px 16px"><a class="link-btn" href="#send" data-action="close-drawer-nav">Check sending in Send Center →</a><a class="link-btn" href="#history" data-action="close-drawer-nav">See email history →</a></div>
            </div>
          </section>
        </div>

        ${ed ? `
        <div class="df" id="drawer-foot">
          ${state.saveError ? `<div class="notice error">${icon.alert}<span class="grow">${esc(state.saveError)}</span></div>` : ''}
          <div class="notice error" id="draft-problem"${problem ? '' : ' hidden'}>${icon.alert}<span class="grow">${esc(problem)}</span></div>
          <div class="df-row">
            <span class="small muted" id="change-count">${changes.length === 0 ? 'No changes yet' : changes.length === 1 ? '1 unsaved change' : changes.length + ' unsaved changes'}</span>
            <div class="tags">
              <button type="button" class="btn btn-secondary" data-action="cancel-edit"${state.saving ? ' disabled' : ''}>Cancel</button>
              <button type="button" class="btn btn-primary" data-action="save-edit" id="save-btn"${changes.length === 0 || problem || state.saving ? ' disabled' : ''}>${state.saving ? '<span class="spinner sm" aria-hidden="true"></span>Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>` : ''}
      </aside>
    </div>`;
  }

  const drawerEl = document.getElementById('drawer');
  let lastFocus = null;
  let drawerEnter = false;
  function renderDrawer(opts) {
    const e = !(CONNECTED && !session) && state.openId && emp(state.openId);
    if (!e) { drawerEl.innerHTML = ''; document.body.classList.remove('no-scroll'); return; }
    const body = document.getElementById('drawer-body');
    const scroll = body ? body.scrollTop : 0;
    const active = document.activeElement && drawerEl.contains(document.activeElement) ? document.activeElement.id : null;
    drawerEnter = !drawerEl.firstElementChild;
    drawerEl.innerHTML = drawerHTML(e);
    document.body.classList.add('no-scroll');
    const nb = document.getElementById('drawer-body');
    if (opts && opts.scrollTo) { const t = document.getElementById(opts.scrollTo); if (t) { nb.style.scrollBehavior = 'auto'; t.scrollIntoView({ block: 'start' }); nb.style.scrollBehavior = ''; } }
    else nb.scrollTop = scroll;
    const focusId = (opts && opts.focus) || active;
    if (focusId) { const f = document.getElementById(focusId); if (f) f.focus({ preventScroll: true }); }
  }
  function openDrawer(id) {
    if (!drawerEl.innerHTML) lastFocus = document.activeElement;
    state.openId = id; state.editing = null; state.draft = null; state.saveError = null; state.menu = false;
    renderProfile();
    if (currentRoute() !== 'payroll') location.hash = '#payroll'; else render();
    renderDrawer({ focus: 'drawer-close' });
  }
  function closeDrawer(skipFocus, force) {
    if (!force && state.editing && draftChanges(emp(state.openId)).length && !window.confirm('Discard your unsaved changes?')) return false;
    state.openId = null; state.editing = null; state.draft = null; state.saveError = null;
    renderDrawer();
    if (currentRoute() === 'payroll') render();
    if (!skipFocus && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    return true;
  }
  // While typing, update only the footer so the input keeps focus and caret.
  function refreshFooter() {
    const e = emp(state.openId);
    const foot = document.getElementById('drawer-foot');
    if (!e || !foot) return;
    const changes = draftChanges(e), problem = draftProblem();
    document.getElementById('change-count').textContent = changes.length === 0 ? 'No changes yet' : changes.length === 1 ? '1 unsaved change' : changes.length + ' unsaved changes';
    document.getElementById('save-btn').disabled = changes.length === 0 || !!problem || state.saving;
    const box = document.getElementById('draft-problem');
    box.hidden = !problem;
    box.querySelector('.grow').textContent = problem;
  }
  async function saveEdit() {
    const e = emp(state.openId);
    if (!e || draftProblem()) return;
    const section = state.editing;
    state.saving = true; state.saveError = null; renderDrawer();
    try {
      const res = await call('saveEdit', { period: DATA.period, employeeId: e.id, expected: saw(e), section, changes: cleanDraft(state.draft) });
      state.saving = false;
      const i = DATA.employees.findIndex((x) => x.id === e.id);
      DATA.employees[i] = res.employee;
      state.editing = null; state.draft = null;
      state.toast = { text: res.message || 'Saved.', kind: 'ok' };
      render(); renderDrawer();
      announce('Saved');
      load(DATA.period, { message: res.message || 'Saved.' });
    } catch (err) {
      state.saving = false;
      state.saveError = 'Not saved: ' + errText(err) + ' Your changes are still here.';
      renderDrawer();
    }
  }

  /* ---------- Email preview ---------- */
  async function openEmail(id) {
    const dlg = document.getElementById('email-dialog');
    const body = document.getElementById('email-body');
    body.innerHTML = '<div class="loading"><span class="spinner"></span>Building the email…</div>';
    dlg.showModal();
    try {
      const m = await call('getEmailPreview', { period: DATA.period, employeeId: id });
      body.innerHTML = `
        ${m.preview ? '<span class="sample-tag" style="align-self:flex-start">Design preview · when connected this comes from Payout Automation’s own email template</span>' : ''}
        ${m.testMode ? `<div class="notice">${icon.info}<span class="grow">Test Mode is ON, so this email would go to the test inbox, not to ${esc(m.intended)}.</span></div>` : ''}
        <dl class="facts"><div><span>To</span><strong>${esc(m.to)}</strong></div><div><span>Subject</span><strong>${esc(m.subject)}</strong></div></dl>
        ${m.html ? `<iframe class="email-frame" sandbox title="The email as the employee sees it" srcdoc="${esc(m.html)}"></iframe>` : `<pre class="email-text">${esc(m.body)}</pre>`}
        <div style="display:flex;flex-direction:column;gap:8px"><span class="label">Attachments</span>${m.attachments.map((a) => `
          <div class="doc-row"><div class="l"><span class="doc-ic">${icon.ext}</span><span class="small" style="overflow-wrap:anywhere">${esc(a.name)}</span></div><span class="doc ${a.ok ? 'ok' : 'bad'}"><i></i>${a.ok ? 'Ready' : 'Missing'}</span></div>`).join('')}</div>`;
    } catch (err) {
      body.innerHTML = `<div class="notice error">${icon.alert}<span class="grow">Could not build the email: ${esc(errText(err))}</span></div>`;
    }
  }

  /* ---------- Profile menu ---------- */
  const profileEl = document.getElementById('profile');
  function renderProfile() {
    if (!DATA || (CONNECTED && !session)) { profileEl.innerHTML = ''; return; }
    const a = DATA.account;
    profileEl.innerHTML = `
      ${state.menu ? `<div class="menu" id="profile-menu">
        <div class="menu-head">
          <div class="menu-id"><span class="avatar">${esc(initials(a.name))}</span><div class="who"><strong>${esc(a.name)}</strong><span>${esc(a.email)}</span></div></div>
          <ul class="menu-perm">
            <li>${icon.check}Admin: can edit payouts, payments and slips</li>
            <li>${icon.lock.replace('width="18" height="18"', 'width="14" height="14"')}LIVE sending stays in the spreadsheet</li>
          </ul>
        </div>
        <a class="menu-item" href="#settings" data-action="menu-close">Settings</a>
        ${CONNECTED ? '<div class="menu-sep"></div><button type="button" class="menu-item" data-action="sign-out">Sign out</button>' : ''}
      </div>` : ''}
      <button type="button" class="profile-btn" id="profile-btn" aria-haspopup="true" aria-expanded="${state.menu}" aria-controls="profile-menu">
        <span class="avatar">${esc(initials(a.name))}</span>
        <span class="who"><strong>${esc(a.name)}</strong><span>Admin</span></span>
        <svg class="chev-ud" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
      </button>`;
  }
  function setMenu(open, focusBtn) {
    state.menu = open;
    renderProfile();
    if (focusBtn) document.getElementById('profile-btn').focus();
  }

  /* ---------- Router ---------- */
  /* ---------- Staff Directory (owner, 2026-10-27): see and edit, one person at a time ---------- */
  const STAFF_FIELDS = [
    ['name', 'Name'], ['alias', 'Payment Slip Name Alias'], ['email', 'Employee Email'], ['store', 'Store'],
    ['active', 'Active'], ['rate', 'Hourly Rate'], ['ss18', 'Jibble ID (SS18)'], ['ioi', 'Jibble ID (IOI)']
  ];
  const staffRow = (id) => DATA.staff.find((s) => s.id === id);
  function staffPage() {
    const st = state.staff;
    const q = st.q.trim().toLowerCase();
    const rows = DATA.staff
      .filter((s) => st.show === 'all' || (st.show === 'active' ? s.active : !s.active))
      .filter((s) => !q || [s.name, s.alias, s.id, s.email].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `
      <header class="page-head">
        <div class="title-block"><h1>Staff Directory</h1><span class="small muted">The Staff Directory tab of Retail Payout 2026. Changes are written there.</span></div>
        <div class="tools">${refreshBtn()}<button type="button" class="btn btn-primary" data-action="staff-add">${icon.plus || '+'} Add person</button></div>
      </header>
      ${toastHTML()}
      <div class="card card-body" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px">
        <label class="field" style="flex:1 1 240px">Search<input class="input" type="search" id="staff-q" value="${esc(st.q)}" placeholder="Name, Employee ID or email"></label>
        <div class="field"><span>Show</span>${seg('staff-show', [['active', 'Active'], ['inactive', 'Not active'], ['all', 'Everyone']], st.show, 'Show')}</div>
      </div>
      <section class="card raised" aria-labelledby="sdt">
        <div class="card-head"><h2 id="sdt">People</h2><span class="small muted">${rows.length} of ${DATA.staff.length}</span></div>
        ${rows.length ? `<div class="table-wrap"><table class="log">
          <thead><tr><th scope="col">Name</th><th scope="col">Employee ID</th><th scope="col">Store</th><th scope="col">Email</th><th scope="col" class="right">Hourly Rate</th><th scope="col">Jibble IDs</th><th scope="col"><span class="sr-only">Edit</span></th></tr></thead>
          <tbody>${rows.map((s) => `<tr>
            <th scope="row"><div style="display:flex;flex-direction:column;gap:2px"><strong>${esc(s.name)}</strong>${s.alias ? `<span class="small muted">Slip name: ${esc(s.alias)}</span>` : ''}${s.active ? '' : '<span class="badge b-neutral" style="align-self:flex-start">Not active</span>'}</div></th>
            <td class="num">${esc(s.id)}</td>
            <td>${s.store ? storeBadges([s.store]) : '<span class="muted">—</span>'}</td>
            <td style="overflow-wrap:anywhere">${s.email ? esc(s.email) : '<span class="blank">Missing</span>'}</td>
            <td class="right num" style="white-space:nowrap">${s.rate ? 'RM ' + esc(s.rate) : '<span class="blank">Blank</span>'}</td>
            <td class="small">${[s.ss18 && 'SS18 ' + s.ss18, s.ioi && 'IOI ' + s.ioi].filter(Boolean).map(esc).join('<br>') || '<span class="muted">—</span>'}</td>
            <td><button type="button" class="btn btn-secondary btn-sm" data-staff-edit="${esc(s.id)}">Edit</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><h3>Nobody found</h3><span class="muted small">Try another name, or show everyone.</span></div>`}
        <p class="small muted" style="margin:0;padding:0 24px 20px;line-height:1.5">An Employee ID cannot be changed once it is saved: it is how the payout finds each person. Someone who has left can be marked not active, or deleted when they are no longer on the current month's payroll.</p>
      </section>`;
  }
  /** The edit window; id null = add a new person. */
  function openStaff(id) {
    const adding = id === null;
    const s = adding ? { id: '', internalId: '', name: '', alias: '', email: '', store: '', active: true, rate: '', ss18: '', ioi: '' } : staffRow(id);
    if (!s) return;
    state.staff.editId = adding ? null : id;
    document.getElementById('staff-title').textContent = adding ? 'Add a person' : 'Edit ' + s.name;
    const known = [...new Set(DATA.staff.map((x) => x.store).filter(Boolean).concat(['SS18', 'IOI']))].sort();
    document.getElementById('staff-body').innerHTML = `
      <div class="form">
        ${adding
          ? `<div class="field"><label for="sf-id">Employee ID</label><input class="input" id="sf-id" placeholder="e.g. 031" autocomplete="off"></div>
             <div class="field"><label for="sf-internalId">Internal Staff ID <span class="muted">(optional)</span></label><input class="input" id="sf-internalId" autocomplete="off"></div>`
          : `<div class="field"><span>Employee ID</span><div class="locked"><span>${esc(s.id)}</span><span class="calc">${icon.lock.replace('width="18" height="18"', 'width="11" height="11"')}Not changeable</span></div></div>`}
        <div class="field"><label for="sf-name">Name</label><input class="input" id="sf-name" value="${esc(s.name)}"></div>
        <div class="field"><label for="sf-alias">Payment Slip Name Alias</label><input class="input" id="sf-alias" value="${esc(s.alias)}"></div>
        <div class="field"><label for="sf-email">Employee Email</label><input class="input" type="email" id="sf-email" value="${esc(s.email)}"></div>
        <div class="field"><label for="sf-store">Store</label><input class="input" id="sf-store" list="sf-stores" value="${esc(s.store)}"><datalist id="sf-stores">${known.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="field"><label for="sf-rate">Hourly Rate</label><div class="money-in"><span>RM</span><input class="input" id="sf-rate" inputmode="decimal" value="${esc(s.rate)}"></div></div>
        <div class="field"><label for="sf-ss18">Jibble ID (SS18)</label><input class="input" id="sf-ss18" value="${esc(s.ss18)}"></div>
        <div class="field"><label for="sf-ioi">Jibble ID (IOI)</label><input class="input" id="sf-ioi" value="${esc(s.ioi)}"></div>
        <label class="field" style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="sf-active"${s.active ? ' checked' : ''}> Active</label>
      </div>
      ${adding ? '' : '<p class="small muted" style="margin:0;line-height:1.5">Changing the email changes where this person\'s payout email goes, so it asks for the password again if you signed in more than 5 minutes ago.</p>'}
      <div class="notice error" id="staff-error" hidden>${icon.alert}<span class="grow"></span></div>
      <div class="dialog-actions">
        ${adding ? '' : '<button type="button" class="btn btn-quiet" id="staff-delete" style="margin-right:auto;color:var(--failed-ink)">Delete…</button>'}
        <button type="button" class="btn btn-secondary" data-close="staff-dialog">Cancel</button>
        <button type="button" class="btn btn-primary" id="staff-save">${adding ? 'Add person' : 'Save'}</button>
      </div>`;
    document.getElementById('staff-dialog').showModal();
    document.getElementById(adding ? 'sf-id' : 'sf-name').focus();
  }
  function staffError(text) {
    const box = document.getElementById('staff-error');
    box.hidden = false;
    box.querySelector('.grow').textContent = text;
  }
  async function saveStaff() {
    const adding = state.staff.editId === null;
    const s = adding ? null : staffRow(state.staff.editId);
    if (!adding && !s) return;
    const val = (k) => k === 'active' ? document.getElementById('sf-active').checked : document.getElementById('sf-' + k).value.trim();
    const btn = document.getElementById('staff-save');
    const label = btn.textContent;
    let request;
    if (adding) {
      const person = { id: val('id'), internalId: val('internalId') };
      STAFF_FIELDS.forEach(([k]) => { person[k] = val(k); });
      if (!person.id || !person.name) { staffError('Type the Employee ID and the name.'); return; }
      request = ['addStaff', { person }];
    } else {
      const changes = {};
      STAFF_FIELDS.forEach(([k]) => { if (val(k) !== (k === 'active' ? s.active : String(s[k] || ''))) changes[k] = val(k); });
      if (!Object.keys(changes).length) { document.getElementById('staff-dialog').close(); return; }
      const expected = {};
      STAFF_FIELDS.forEach(([k]) => { expected[k] = s[k]; });
      request = ['saveStaff', { employeeId: s.id, expected, changes }];
    }
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm" aria-hidden="true"></span>Saving…';
    try {
      const res = await call(request[0], request[1]);
      DATA.staff = res.staff;
      document.getElementById('staff-dialog').close();
      toast(res.message || 'Saved.', 'ok');
    } catch (err) {
      staffError('Not saved: ' + errText(err));
      btn.disabled = false; btn.textContent = label;
    }
  }
  async function deleteStaff() {
    const s = staffRow(state.staff.editId);
    if (!s) return;
    document.getElementById('staff-dialog').close();
    const ok = await confirmBox('Delete ' + s.name + '?',
      `<p style="margin:0;line-height:1.5">This deletes <strong>${esc(s.name)}</strong> (Employee ID ${esc(s.id)}) from the Staff Directory tab. It cannot be undone from the dashboard.</p>
       <p class="small muted" style="margin:0;line-height:1.5">If they have only left, untick <strong>Active</strong> instead: their history stays linked. Someone on the current month's payroll cannot be deleted.</p>
       <label class="field">Type DELETE to confirm<input class="input" id="confirm-word" autocomplete="off"></label>`, 'Delete', true);
    if (!ok) return;
    const word = (document.getElementById('confirm-word') || {}).value || '';
    if (word.trim() !== 'DELETE') { toast('Not deleted: DELETE was not typed.', 'error'); return; }
    const expected = {};
    STAFF_FIELDS.forEach(([k]) => { expected[k] = s[k]; });
    try {
      const res = await call('deleteStaff', { employeeId: s.id, expected, confirm: 'DELETE' });
      DATA.staff = res.staff;
      toast(res.message, 'ok');
    } catch (err) { toast('Not deleted: ' + errText(err), 'error'); }
  }

  /* ---------- Tools: the spreadsheet's menus on the website (owner, 2026-10-27) ---------- */
  const LEVEL_VIEW = { block: ['b-failed', 'Stops'], warn: ['b-attention', 'Check'], ok: ['b-sent', 'OK'] };
  function toolsPage() {
    const tl = state.tools;
    const row = (title, note, action) => `<li class="tool-row"><div style="flex:1 1 260px;display:flex;flex-direction:column;gap:2px"><strong>${title}</strong><span class="small muted">${note}</span></div>${action}</li>`;
    const f = DATA.folders || {};
    const ids = tl.ids;
    return `
      <header class="page-head">
        <div class="title-block"><h1>Tools</h1><span class="small muted">The spreadsheet’s Machino Payout and Jibble menus, here. Each one runs the spreadsheet’s own code.</span></div>
        <div class="tools">${refreshBtn()}</div>
      </header>
      ${toastHTML()}
      <section class="card raised" aria-labelledby="mp-title">
        <div class="card-head"><div><h2 id="mp-title">Machino Payout</h2><span class="small muted">For ${esc(DATA.period)}</span></div></div>
        <ul class="plain-list" style="padding:0 24px">
          ${row('Check System', 'A read-only check of everything the payout needs. Changes nothing.', `<button type="button" class="btn btn-secondary btn-sm" data-action="tool-check"${tl.checking ? ' disabled' : ''}>${tl.checking ? '<span class="spinner sm"></span>Checking…' : 'Run Check System'}</button>`)}
          ${tl.check ? `<li style="padding:0 0 16px"><div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
              <strong>${tl.check.canPrepare ? 'Ready to prepare ' : 'Not ready to prepare '}${esc(tl.check.period)}</strong>
              ${tl.check.findings.length ? `<ul class="plain-list">${tl.check.findings.map((x) => `<li style="display:flex;gap:10px;align-items:flex-start;padding:8px 0"><span class="badge ${(LEVEL_VIEW[x.level] || LEVEL_VIEW.warn)[0]}">${(LEVEL_VIEW[x.level] || LEVEL_VIEW.warn)[1]}</span><div><strong class="small">${esc(x.title)}</strong>${x.detail ? `<div class="small muted">${esc(x.detail)}</div>` : ''}</div></li>`).join('')}</ul>` : '<span class="small muted">No problems found.</span>'}
              <span class="small muted">${esc(tl.check.note)}</span></div></li>` : ''}
          ${row('1. Prepare Payout', 'Makes the Payment Calculations and updates Payout Control. Never sends an email.', '<button type="button" class="btn btn-secondary btn-sm" data-action="prepare">Prepare payouts</button>')}
          ${row('2. Review Payouts', 'Check each person and tick Manager Verified.', '<a class="btn btn-secondary btn-sm" href="#payroll">Open Payroll Management</a>')}
          ${row('3. Test Payout Email', 'Sends to the test inbox only.', '<button type="button" class="btn btn-secondary btn-sm" data-action="send-test">Send test emails</button>')}
          ${row('4. Pre-Send Check', 'Who will be sent, who cannot be sent yet, and why.', '<a class="btn btn-secondary btn-sm" href="#send">Open Send Center</a>')}
          ${row('5. Send Ready Employees', DATA.testMode ? 'Test Mode is ON: these go to the test inbox too.' : 'LIVE: emails real employees. You type a confirmation first.', '<button type="button" class="btn btn-secondary btn-sm" data-action="send-live">Send to employees</button>')}
          ${row('Setup &amp; Repair: month folders', f.slip && f.calc ? 'This month’s Payment Slip and Payment Calculation folders exist.' : 'A folder for ' + esc(f.name || DATA.period) + ' is missing.',
            f.slip && f.calc ? '<span class="badge b-sent">Done</span>' : '<button type="button" class="btn btn-secondary btn-sm" data-action="create-folders">Create the folders</button>')}
          ${row('Setup &amp; Repair: fill blank Employee IDs', 'Only where the Staff Directory has exactly one person with that name. Shown first; nothing changes until you approve.',
            `<button type="button" class="btn btn-secondary btn-sm" data-action="tool-ids"${tl.idsLoading ? ' disabled' : ''}>${tl.idsLoading ? '<span class="spinner sm"></span>Checking…' : 'Show what can be filled'}</button>`)}
          ${ids ? `<li style="padding:0 0 16px"><div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
              ${ids.items.length ? `<ul class="plain-list">${ids.items.map((i) => `<li style="display:flex;gap:10px;align-items:center;padding:6px 0"><input type="checkbox" data-id-fill="${i.row}"${tl.idChosen[i.row] !== false ? ' checked' : ''} aria-label="Fill row ${i.row}"><span class="small">Row ${i.row} · <strong>${esc(i.name)}</strong> · ${i.current ? '“' + esc(i.current) + '”' : 'blank'} → <strong>${esc(i.proposed)}</strong></span></li>`).join('')}</ul>
                <button type="button" class="btn btn-primary btn-sm" data-action="tool-ids-apply" style="align-self:flex-start">Fill in the ticked IDs</button>` : '<span class="small muted">Nothing can be filled in automatically.</span>'}
              ${ids.refusals.length ? `<details><summary class="small">Not filled (${ids.refusals.length})</summary><ul class="plain-list">${ids.refusals.map((r) => `<li class="small" style="padding:6px 0"><strong>${esc(r.label)}</strong> · <span class="muted">${esc(r.reason)}</span></li>`).join('')}</ul></details>` : ''}
            </div></li>` : ''}
        </ul>
      </section>
      <section class="card" aria-labelledby="jm-title">
        <div class="card-head"><div><h2 id="jm-title">Jibble</h2><span class="small muted">Fill in a month from Jibble</span></div><a class="btn btn-secondary btn-sm" href="#checks">Start a month</a></div>
      </section>
      <section class="card" aria-labelledby="dm-title">
        <div class="card-head"><div><h2 id="dm-title">Delete a month tab</h2><span class="small muted">For testing: delete a month the Jibble menu made, then make it again with Start a month.</span></div></div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">
          <label class="field">Month<select class="select" id="dm-month">${DATA.periods.map((p) => `<option${p === (tl.delMonth || DATA.period) ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
          <button type="button" class="btn btn-danger" data-action="tool-delete-month">Delete…</button>
        </div>
        <p class="small muted" style="margin:0;padding:0 24px 20px;line-height:1.5">Refused for a tab made by hand, a tab with anyone marked Paid, or a month with any payout Sent or Review Required. Payout Control rows are kept. Undo: File → Version history in the spreadsheet.</p>
      </section>`;
  }
  async function runCheckSystem() {
    state.tools.checking = true; render();
    try { state.tools.check = await call('checkSystem', {}); } catch (err) { toast('Check System did not run: ' + errText(err), 'error'); }
    state.tools.checking = false; render();
  }
  async function loadIdFills() {
    state.tools.idsLoading = true; render();
    try { state.tools.ids = await call('planIdFills', {}); state.tools.idChosen = {}; } catch (err) { toast('Could not check: ' + errText(err), 'error'); }
    state.tools.idsLoading = false; render();
  }
  async function applyIdFills() {
    const rows = state.tools.ids.items.filter((i) => state.tools.idChosen[i.row] !== false).map((i) => i.row);
    if (!rows.length) return;
    const ok = await confirmBox('Fill in ' + rows.length + ' Employee ID' + (rows.length === 1 ? '' : 's') + '?',
      '<p style="margin:0;line-height:1.5">Each one is written into the payroll tab’s Employee ID cell, as text, after checking the cell has not changed.</p>', 'Fill in');
    if (!ok) return;
    try {
      const res = await call('applyIdFills', { rows });
      state.tools.ids = null;
      await load(DATA.period, { message: res.message });
    } catch (err) { toast('Not filled: ' + errText(err), 'error'); }
  }
  async function deleteMonthTab() {
    const period = document.getElementById('dm-month').value;
    const ok = await confirmBox('Delete the “' + period + '” tab?',
      `<p style="margin:0;line-height:1.5">This deletes the <strong>${esc(period)}</strong> tab from Retail Payout 2026. Payout Control rows and Drive files are kept.</p>
       <label class="field">Type ${esc(period)} to confirm<input class="input" id="confirm-word" autocomplete="off"></label>`, 'Delete the tab', true);
    if (!ok) return;
    const typed = ((document.getElementById('confirm-word') || {}).value || '').trim();
    try {
      const res = await call('deleteMonthTab', { period, typed });
      const next = DATA.periods.find((p) => p !== period) || null;
      await load(next, { full: true, message: res.message });
    } catch (err) { toast('Not deleted: ' + errText(err), 'error'); }
  }

  const ROUTES = { overview, payroll, slips, checks, settings, send, history, staff: staffPage, tools: toolsPage };
  const TITLES = { overview: 'Overview', payroll: 'Payroll Management', slips: 'Payment Slips', checks: 'Jibble & Documents', settings: 'Settings', send: 'Send Center', history: 'History', staff: 'Staff Directory', tools: 'Tools' };
  const view = document.getElementById('view');
  function currentRoute() {
    const r = (location.hash || '#overview').slice(1);
    return ROUTES[r] ? r : 'overview';
  }
  /** Typing in a search box redraws once the typing pauses, not on every key. */
  let renderTimer = null;
  function renderSoon() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), 180);
  }
  function render(opts) {
    clearTimeout(renderTimer);
    if (CONNECTED && !session) { view.innerHTML = ''; return; }   // signed out: draw nothing
    if (state.loading) { view.innerHTML = '<div class="loading"><span class="spinner" aria-hidden="true"></span>Loading payroll information…</div>'; return; }
    if (!DATA) {
      view.innerHTML = `<div class="card card-body empty"><h3>Could not load the payroll information</h3><span class="muted small">${esc(state.loadError || '')}</span><button type="button" class="btn btn-primary" data-action="retry">Try again</button></div>`;
      return;
    }
    const route = currentRoute();
    const active = document.activeElement && view.contains(document.activeElement) && document.activeElement.id;
    const caret = active && document.activeElement.selectionStart;
    view.innerHTML = ROUTES[route]();
    document.title = (CONNECTED ? '' : 'DEMO · ') + TITLES[route] + ' — Machino Retail Payout';
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const count = document.getElementById('nav-count');
    count.hidden = !DATA.summary.all.attention;
    count.textContent = DATA.summary.all.attention;
    const slipCount = document.getElementById('nav-slips');
    slipCount.hidden = !DATA.summary.all.missingSlips;
    slipCount.textContent = DATA.summary.all.missingSlips;
    if (active) {
      const el = document.getElementById(active);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text input */ } }
    }
    if (opts && opts.newPage) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }

  /* ---------- Opening Drive and the sheet ---------- */
  async function openUrl(action, args, what) {
    const win = CONNECTED ? window.open('', '_blank') : null;
    try {
      const url = await call(action, args);
      if (url && win) { win.opener = null; win.location = url; return; }
      if (win) win.close();
      toast(DATA.preview ? 'Preview: ' + what + ' opens from Google Drive once the dashboard is connected.' : what + ' was not found in Drive.', DATA.preview ? '' : 'error');
    } catch (err) { if (win) win.close(); toast('Could not open ' + what + ': ' + errText(err), 'error'); }
    if (state.openId) renderDrawer();
  }
  function openPrepare() {
    const s = DATA.summary.all;
    document.getElementById('prepare-body').innerHTML = `
      <p style="margin:0;line-height:1.5">This runs the existing <strong>Prepare Payout</strong> for <strong>${esc(DATA.period)}</strong>, the same as <em>Machino Payout → 1. Prepare Payout</em> in the spreadsheet.</p>
      <ul class="ol-steps" style="list-style:disc">
        <li>Re-checks each person and updates Payout Control.</li>
        <li>Makes or refreshes the Payment Calculation PDFs.</li>
        <li>Does <strong>not</strong> send any email and does not change Payment Status.</li>
      </ul>
      ${s.attention ? `<div class="notice">${icon.alert}<span class="grow">${s.attention} ${s.attention === 1 ? 'person still has' : 'people still have'} a problem. They stay “Needs Attention” until fixed.</span></div>` : ''}
      <div class="notice info" id="prepare-result" hidden></div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close="prepare-dialog">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="run-prepare">Run Prepare Payout</button>
      </div>`;
    document.getElementById('prepare-dialog').showModal();
  }
  async function runPrepare(btn) {
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm" aria-hidden="true"></span>Preparing…';
    const out = document.getElementById('prepare-result');
    try {
      const res = await call('runPreparePayout', { period: DATA.period });
      out.hidden = false;
      out.className = 'notice ' + (res.ok ? 'ok' : 'info');
      out.textContent = res.message || (res.ok ? 'Prepare Payout finished.' : 'Prepare Payout did not run.');
      btn.innerHTML = 'Run Prepare Payout';
      if (res.ok) { btn.hidden = true; load(DATA.period, { message: res.message || 'Prepare Payout finished.' }); } else btn.disabled = false;
    } catch (err) {
      out.hidden = false; out.className = 'notice error'; out.textContent = 'Prepare Payout failed: ' + errText(err);
      btn.disabled = false; btn.innerHTML = 'Run Prepare Payout';
    }
  }

  /* ---------- Events ---------- */
  window.addEventListener('hashchange', () => {
    if (state.openId && currentRoute() !== 'payroll') { state.openId = null; state.editing = null; state.draft = null; renderDrawer(); }
    state.toast = null;
    render({ newPage: !state.openId });
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#profile-btn')) { setMenu(!state.menu); return; }
    if (state.menu && !t.closest('#profile')) setMenu(false);
    if (t.closest('[data-action="menu-close"]')) { state.menu = false; renderProfile(); return; }
    if (t.closest('[data-action="sign-out"]')) { state.menu = false; signOut(); return; }

    const closeD = t.closest('[data-close]');
    if (closeD) { document.getElementById(closeD.dataset.close).close(); return; }
    if (t.closest('#staff-save')) { saveStaff(); return; }
    if (t.closest('#staff-delete')) { deleteStaff(); return; }

    // Drawer
    if (t.closest('[data-action="close-drawer"]')) { closeDrawer(); return; }
    if (t.closest('#drawer [data-action="dismiss"]')) { state.toast = null; render(); renderDrawer(); return; }
    if (t.closest('[data-action="close-drawer-nav"]')) { if (!closeDrawer(true)) e.preventDefault(); return; }
    const nav = t.closest('[data-nav-emp]');
    if (nav && nav.dataset.navEmp) { if (state.editing && !closeDrawer(true)) return; openDrawer(nav.dataset.navEmp); return; }
    const edit = t.closest('[data-edit]');
    if (edit) {
      state.editing = edit.dataset.edit; state.draft = makeDraft(emp(state.openId), state.editing); state.saveError = null;
      const target = { payout: 'd-payout', payment: 'd-docs' }[state.editing];
      renderDrawer({ scrollTo: target, focus: { payout: 'f-com', payment: 'f-verified' }[state.editing] });
      return;
    }
    const addRow = t.closest('[data-add-row]');
    if (addRow) { const l = addRow.dataset.addRow; state.draft[l].push({ type: '', amount: '' }); renderDrawer({ focus: l + '-t-' + (state.draft[l].length - 1) }); return; }
    const rmRow = t.closest('[data-remove-row]');
    if (rmRow) { state.draft[rmRow.dataset.removeRow].splice(Number(rmRow.dataset.i), 1); renderDrawer(); return; }
    if (t.closest('[data-action="cancel-edit"]')) { state.editing = null; state.draft = null; state.saveError = null; renderDrawer(); return; }
    if (t.closest('[data-action="save-edit"]')) { saveEdit(); return; }
    const doc = t.closest('[data-doc]');
    if (doc) { openUrl('getDocumentUrl', { period: DATA.period, employeeId: state.openId, kind: doc.dataset.doc }, doc.dataset.doc === 'slip' ? 'The Payment Slip' : 'The Payment Calculation PDF'); return; }
    const sheet = t.closest('[data-sheet]');
    if (sheet) { openUrl('getSheetUrl', { sheet: sheet.dataset.sheet }, 'The ' + sheet.dataset.sheet + ' tab'); return; }
    const mail = t.closest('[data-email]');
    if (mail) { openEmail(mail.dataset.email); return; }
    if (t.closest('[data-action="run-prepare"]')) { runPrepare(t.closest('button')); return; }
    if (t.closest('#slip-save-go')) { saveSlips(); return; }
    if (t.closest('#verify-go')) { doVerify(); return; }
    if (t.closest('[data-action="verify-next"]')) {
      const rows = payrollRows();
      const i = rows.findIndex((r) => r.id === state.openId);
      const btn = t.closest('button'); btn.disabled = true;
      saveVerified(state.openId, true, i >= 0 && rows[i + 1] ? rows[i + 1].id : null);
      return;
    }
    if (t.closest('[data-action="unverify-one"]')) { saveVerified(state.openId, false); return; }
    if (t.closest('#cfg-go')) { saveCfg(); return; }
    if (t.closest('#link-go')) { doLink(document.getElementById('link-go').dataset.key); return; }
    if (t.closest('#test-off-go')) { setTestMode(false, document.getElementById('test-confirm').value.trim()); return; }
    const dtab = t.closest('.dtabs a');
    if (dtab) { e.preventDefault(); const s = document.getElementById(dtab.getAttribute('href').slice(1)); if (s) s.scrollIntoView({ block: 'start' }); return; }
  });

  view.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.vcell')) return; // the Verified tick box, not "open this person"
    const staffEdit = t.closest('[data-staff-edit]');
    if (staffEdit) { openStaff(staffEdit.dataset.staffEdit); return; }
    const segBtn = t.closest('[data-seg]');
    if (segBtn) {
      const g = segBtn.dataset.seg, v = segBtn.dataset.value;
      if (g === 'store') state.store = v;
      if (g === 'pm-store') state.payroll.store = v;
      if (g === 'branch') state.branch = v;
      if (g === 'history-mode') state.history.mode = v;
      if (g === 'staff-show') state.staff.show = v;
      render();
      const again = view.querySelector(`[data-seg="${g}"][data-value="${v}"]`);
      if (again) again.focus();
      return;
    }
    const tile = t.closest('[data-status-tile]');
    if (tile) { state.payroll.status = tile.dataset.statusTile; render(); const a = view.querySelector(`[data-status-tile="${tile.dataset.statusTile}"]`); if (a) a.focus(); return; }
    const go = t.closest('[data-goto-status]');
    if (go) { state.payroll.status = go.dataset.gotoStatus; if (currentRoute() === 'payroll') render(); else location.hash = '#payroll'; return; }
    const sort = t.closest('[data-sort]');
    if (sort) { const c = sort.dataset.sort; state.payroll.dir = state.payroll.sort === c ? -state.payroll.dir : 1; state.payroll.sort = c; render(); const b = view.querySelector(`[data-sort="${c}"]`); if (b) b.focus(); return; }
    const open = t.closest('[data-open]');
    if (open) { openDrawer(open.dataset.open); return; }
    const change = t.closest('[data-change]');
    if (change) { const f = state.slips.files.find((x) => x.key === change.dataset.change); f.changing = true; render(); const s = document.getElementById('pick-' + f.key); if (s) s.focus(); return; }
    const rmFile = t.closest('[data-remove-file]');
    if (rmFile) { state.slips.files = state.slips.files.filter((x) => x.key !== rmFile.dataset.removeFile); planSlips(); return; }
    const linkGo = t.closest('[data-link-go]');
    if (linkGo) { openLink(linkGo.dataset.linkGo); return; }
    const act = t.closest('[data-action]');
    if (!act) return;
    const a = act.dataset.action;
    if (a === 'refresh') load(DATA.period);
    if (a === 'retry') load(state.period, { full: true });
    if (a === 'dismiss') { state.toast = null; render(); }
    if (a === 'clear-filters') { Object.assign(state.payroll, { q: '', store: 'all', status: 'all', pay: 'all' }); render(); }
    if (a === 'prepare') openPrepare();
    if (a === 'send-test') sendFlow(true);
    if (a === 'send-live') sendFlow(false);
    if (a === 'slips-sample') addSlipFiles(SAMPLE_SLIPS.map(([name, size]) => ({ name, size })), true);
    if (a === 'slips-clear') { state.slips.files = []; state.slips.plan = null; render(); }
    if (a === 'slips-save') openSlipSave();
    if (a === 'slips-dismiss') { state.slips.result = null; render(); }
    if (a === 'create-folders') createFolders(t.closest('[data-action]'));
    if (a === 'drive-load') loadDriveSlips();
    if (a === 'drive-rename') renameDriveSlips();
    if (a === 'staff-add') openStaff(null);
    if (a === 'month-setup') setUpMonth(t.closest('[data-action]'));
    if (a === 'tool-check') runCheckSystem();
    if (a === 'tool-ids') loadIdFills();
    if (a === 'tool-ids-apply') applyIdFills();
    if (a === 'tool-delete-month') deleteMonthTab();
    if (a === 'start-review') {
      const first = canVerify(payrollRows()).find((x) => !x.verified);
      if (first) openDrawer(first.id);
    }
    if (a === 'cfg-edit') {
      state.cfg = { editing: true, saving: false, draft: {} };
      DATA.config.forEach((r) => { state.cfg.draft[r.label] = r.value == null ? '' : String(r.value); });
      render();
      const first = view.querySelector('[data-cfg]');
      if (first) first.focus();
    }
    if (a === 'cfg-cancel') { state.cfg = { editing: false, draft: null, saving: false }; render(); }
    if (a === 'cfg-save') openCfgSave();
    if (a === 'toggle-test') {
      if (DATA.testMode) {
        document.getElementById('test-confirm').value = '';
        document.getElementById('test-off-go').disabled = true;
        document.getElementById('test-dialog').showModal();
        document.getElementById('test-cancel').focus();
      } else setTestMode(true);
    }
  });

  view.addEventListener('input', (e) => {
    if (e.target.id === 'pm-q') { state.payroll.q = e.target.value; renderSoon(); }
    if (e.target.id === 'history-q') { state.history.q = e.target.value; renderSoon(); }
    if (e.target.id === 'staff-q') { state.staff.q = e.target.value; renderSoon(); }
    if (e.target.dataset.cfg && state.cfg.draft) {
      const t = e.target, row = DATA.config.find((r) => r.label === t.dataset.cfg);
      state.cfg.draft[row.label] = t.value;
      t.setAttribute('aria-invalid', String(!!cfgProblem(row, t.value)));
      t.closest('.cfg-row').classList.toggle('changed', t.value.trim() !== String(row.value == null ? '' : row.value));
      refreshCfgFooter();
    }
  });
  document.getElementById('verify-dialog').addEventListener('close', () => { state.verify = null; render(); });
  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-period]')) {
      const ok = !state.editing || closeDrawer(true);
      if (ok) { state.slips = { files: [], plan: null, planning: false, saving: false, result: null, error: null }; load(t.value, { full: true }); } else t.value = DATA.period;
      return;
    }
    if (t.id === 'pm-status') { state.payroll.status = t.value; render(); }
    if (t.id === 'pm-pay') { state.payroll.pay = t.value; render(); }
    if (t.id === 'history-period') { state.history.period = t.value; render(); }
    if (t.id === 'slip-input') { addSlipFiles(t.files); t.value = ''; }
    if (t.dataset.verify) { const p = emp(t.dataset.verify); openVerify(p, !p.verified); }
    if (t.dataset.cfg && t.tagName === 'SELECT') { state.cfg.draft[t.dataset.cfg] = t.value; render(); }
    if (t.dataset.pick) { const f = state.slips.files.find((x) => x.key === t.dataset.pick); f.pickedId = t.value; f.changing = false; planSlips(); }
    if (t.id === 'ms-month' && t.value) { state.monthSetup = t.value; render(); }
    if (t.id === 'dm-month') state.tools.delMonth = t.value;
    if (t.dataset.idFill) state.tools.idChosen[t.dataset.idFill] = t.checked;
    if (t.dataset.drivePick) { const d = state.slips.drive; if (t.value) d.picks[t.dataset.drivePick] = t.value; else delete d.picks[t.dataset.drivePick]; loadDriveSlips(); }
    if (t.dataset.driveChoose) { state.slips.drive.chosen[t.dataset.driveChoose] = t.checked; render(); }
    if (t.dataset.link) { state.links[t.dataset.link] = t.value; render(); }
  });
  ['dragenter', 'dragover'].forEach((type) => view.addEventListener(type, (e) => {
    const z = e.target.closest && e.target.closest('#dropzone');
    if (!z) return;
    e.preventDefault(); z.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((type) => view.addEventListener(type, (e) => {
    const z = e.target.closest && e.target.closest('#dropzone');
    if (!z) return;
    e.preventDefault(); z.classList.remove('drag');
    if (type === 'drop' && e.dataTransfer) addSlipFiles(e.dataTransfer.files);
  }));

  drawerEl.addEventListener('input', (e) => {
    const t = e.target;
    if (!state.draft) return;
    if (t.dataset.list) {
      state.draft[t.dataset.list][Number(t.dataset.i)][t.dataset.f] = t.value;
      if (t.dataset.f === 'amount') t.setAttribute('aria-invalid', String(badAmount(t.value)));
      refreshFooter();
    } else if (t.dataset.draft && t.type !== 'checkbox') {
      state.draft[t.dataset.draft] = t.value;
      if (t.dataset.draft === 'commission') t.setAttribute('aria-invalid', String(badAmount(t.value)));
      refreshFooter();
    }
  });
  drawerEl.addEventListener('change', (e) => {
    const t = e.target;
    if (!state.draft) return;
    if (t.type === 'checkbox' && t.dataset.draft) { state.draft[t.dataset.draft] = t.checked; renderDrawer(); }
    else if (t.tagName === 'SELECT' && t.dataset.draft) { state.draft[t.dataset.draft] = t.value; renderDrawer(); }
  });

  document.getElementById('test-confirm').addEventListener('input', (e) => {
    document.getElementById('test-off-go').disabled = e.target.value.trim() !== 'LIVE';
  });
  document.getElementById('test-cancel').addEventListener('click', () => document.getElementById('test-dialog').close());

  document.addEventListener('keydown', (e) => {
    // ← / → move between people while reviewing (not while typing or editing).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.openId && !state.editing &&
        !document.querySelector('dialog[open]') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      const rows = payrollRows();
      const i = rows.findIndex((r) => r.id === state.openId);
      const to = rows[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (i >= 0 && to) { e.preventDefault(); openDrawer(to.id); }
      return;
    }
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return; // native dialogs close themselves
    if (state.menu) { setMenu(false, true); return; }
    if (state.openId) { e.preventDefault(); closeDrawer(); }
  });
  // Keep Tab inside the drawer while it is open
  drawerEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...drawerEl.querySelectorAll('.drawer button:not([disabled]), .drawer a[href], .drawer input:not([disabled]), .drawer select:not([disabled]), .drawer textarea')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.addEventListener('beforeunload', (e) => {
    const pending = (state.editing && draftChanges(emp(state.openId)).length) || state.slips.files.length;
    if (pending) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- LIVE confirmation preview (never sends anything) ---------- */
  const dlg = document.getElementById('live-dialog');
  /* ---------- Sending: 3. Test Payout Email and 5. Send Ready Employees (owner, 2026-10-27) ---------- */
  const confirmInput = document.getElementById('live-confirm');
  const sendBtn = document.getElementById('live-send');
  const branchArg = () => ({ both: '', ss18: 'SS18', ioi: 'IOI' })[state.branch] || '';
  let pendingSend = null;
  /** test: true = 3. Test Payout Email; false = 5. Send Ready Employees. */
  async function sendFlow(test) {
    let rep;
    try { rep = await call('sendPreview', { test, branch: branchArg() }); } catch (err) { toast('Could not check: ' + errText(err), 'error'); return; }
    if (!rep.ok) { toast(rep.error, 'error'); return; }
    if (!rep.canProceed) {
      await confirmBox('Nothing can be sent yet', `<pre class="email-text" style="white-space:pre-wrap">${esc(rep.text)}</pre>`, 'OK');
      return;
    }
    const n = rep.willSend.length;
    if (rep.isTest) {
      const ok = await confirmBox('Send ' + n + ' TEST email' + (n === 1 ? '' : 's') + '?',
        `<p style="margin:0;line-height:1.5">Each goes to the test inbox only. No employee receives anything.</p>
         <ul class="plain-list">${rep.willSend.map((w) => `<li class="cs-row"><span>${esc(w.name)}</span><span class="small muted">to ${esc(w.to)}</span></li>`).join('')}</ul>`, 'Send test emails');
      if (ok) await doSend({ test, count: n, confirm: 'TEST' });
      return;
    }
    const phrase = 'SEND ' + n;
    document.getElementById('live-title').textContent = `Send ${n} payout email${n === 1 ? '' : 's'} now?`;
    document.getElementById('live-confirm-label').textContent = `Type ${phrase} to confirm`;
    document.getElementById('live-facts').innerHTML =
      `<div><span>Payroll month</span><strong>${esc(rep.period)}</strong></div>
       <div><span>Branch</span><strong>${esc(rep.branch)}</strong></div>
       <div><span>Sending from</span><strong>${esc(rep.sender)}</strong></div>
       <div><span>Skipped</span><strong>${rep.cannotSend.length} cannot send · ${rep.alreadySent.length} already sent</strong></div>`;
    document.getElementById('live-list').innerHTML = rep.willSend.map((w) => `<li class="cs-row"><span>${esc(w.name)}</span><span class="small muted">${esc(w.to)}</span></li>`).join('');
    confirmInput.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = `Send ${n} LIVE email${n === 1 ? '' : 's'}`;
    sendBtn.dataset.phrase = phrase;
    pendingSend = { test, count: n, confirm: phrase };
    dlg.showModal();
    document.getElementById('live-cancel').focus();
  }
  async function doSend(args) {
    toast((args.test ? 'Sending test emails' : 'Sending') + '… keep this page open.', '');
    try {
      const res = await call('sendEmails', Object.assign({ branch: branchArg() }, args));
      await load(DATA.period, { message: (res.isTest ? 'Test emails: ' : 'Sent: ') + res.sent });
      await confirmBox(res.isTest ? 'Test emails done' : 'Sending done', `<pre class="email-text" style="white-space:pre-wrap">${esc(res.text)}</pre>`, 'OK');
    } catch (err) {
      await load(DATA.period);
      await confirmBox('Sending stopped', `<pre class="email-text" style="white-space:pre-wrap">${esc(errText(err))}</pre>`, 'OK');
    }
  }
  confirmInput.addEventListener('input', () => { sendBtn.disabled = confirmInput.value.trim() !== sendBtn.dataset.phrase; });
  sendBtn.addEventListener('click', () => {
    if (!pendingSend || confirmInput.value.trim() !== pendingSend.confirm) return;
    const args = pendingSend;
    pendingSend = null;
    dlg.close();
    doSend(args);
  });
  document.getElementById('live-cancel').addEventListener('click', () => { pendingSend = null; dlg.close(); });

  // Hook for the self-test (selftest.js). Harmless: it exposes only this tab's memory.
  window.__payout = { state, get data() { return DATA; }, render, renderDrawer, load };

  const addScript = (src, onload) => { const s = document.createElement('script'); s.src = src; if (onload) s.onload = onload; document.body.appendChild(s); };
  if (CONNECTED) {
    // Real payroll. A session remembered from before a refresh is tried first (the server
    // still checks it); otherwise the sign-in screen only, and nothing is fetched.
    if (session) {
      signInEl.hidden = true;
      document.querySelector('.app').hidden = false;
      load(null, { full: true });
    } else showSignIn('');
  } else {
    // DEMO: the invented data is loaded only here.
    document.getElementById('demo-banner').hidden = false;
    document.querySelector('.app').hidden = false;
    addScript('preview.js', () => {
      if (/[?&]selftest=1/.test(location.search)) addScript('selftest.js');
      load(null, { full: true });
    });
  }
})();
