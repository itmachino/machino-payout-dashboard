/*
 * preview.js — a stand-in for the dashboard backend, used ONLY when
 * config.js has no apiUrl (opening the page as a local file, or the
 * self-test). Every person, amount, email and Jibble ID is INVENTED.
 *
 * It answers the same actions as dashboard/backend/src/Actions.gs and
 * changes nothing but this browser tab's memory: no sheet, no Drive, no
 * email. Slip matching uses the real rules (slip-match.js, generated
 * from the backend's SlipMatch.gs).
 */
window.DashboardPreview = (function () {
  'use strict';

  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const rm = (n) => n == null ? null : 'RM ' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = (v) => v == null || v === '' ? 0 : Number(String(v).replace(/[^0-9.]/g, ''));
  const fail = (message) => { const e = new Error(message); throw e; };

  // The Staff Directory (invented). Store is where the slip filename starts.
  const DIRECTORY = [
    { id: 'MCH-001', name: 'Siti Nurhaliza binti Omar', alias: 'Siti', store: 'SS18', email: 'siti.o@example.com', ss18: 'SS18-0112', ioi: '' },
    { id: 'MCH-003', name: 'Nur Aina binti Zulkifli', alias: '', store: 'SS18', email: 'aina.z@example.com', ss18: 'SS18-0108', ioi: '' },
    { id: 'MCH-009', name: 'Muhammad Aiman Hakim bin Rosli', alias: 'Aiman', store: 'SS18', email: 'aiman.h@example.com', ss18: 'SS18-0121', ioi: '' },
    { id: 'MCH-011', name: 'Chloe Wong Mei Yee', alias: '', store: 'SS18', email: 'chloe.w@example.com', ss18: 'SS18-0131', ioi: '' },
    { id: 'MCH-014', name: 'Tan Mei Ling', alias: '', store: 'IOI', email: 'meiling.t@example.com', ss18: '', ioi: 'IOI-0204' },
    { id: 'MCH-017', name: 'Hafiz Rahman bin Yusof', alias: '', store: 'IOI', email: 'hafiz.r@example.com', ss18: '', ioi: 'IOI-0217' },
    { id: 'MCH-019', name: 'Farah Izzati binti Kamal', alias: '', store: 'SS18', email: 'farah.i@example.com', ss18: 'SS18-0119', ioi: '' },
    { id: 'MCH-021', name: 'Daniel Lim Wei Jie', alias: '', store: 'SS18', email: 'daniel.l@example.com', ss18: 'SS18-0125', ioi: 'IOI-0230' },
    { id: 'MCH-024', name: 'Arjun a/l Pillai', alias: '', store: 'IOI', email: 'arjun.p@example.com', ss18: '', ioi: 'IOI-0224' },
    { id: 'MCH-026', name: 'Kevin Ong Jun Hao', alias: '', store: 'IOI', email: 'kevin.o@example.com', ss18: '', ioi: 'IOI-0226' },
    { id: 'MCH-027', name: 'Nur Adila Faezza binti Zakaria', alias: 'Adila', store: 'IOI', email: 'adila.z@example.com', ss18: '', ioi: 'IOI-0241' },
    { id: 'MCH-028', name: 'Nur Adlina binti Hassan', alias: '', store: 'IOI', email: 'adlina.h@example.com', ss18: '', ioi: '' },
    { id: 'MCH-030', name: 'Rina Kaur', alias: '', store: 'IOI', email: 'rina.k@example.com', ss18: '', ioi: '' }
  ];

  // This month's payout rows (invented). Amounts are what the sheet would show.
  const PEOPLE = [
    { id: 'MCH-001', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 172.12, 9.5]], claims: [['Transport', 20]], incentives: [['Sales target', 100]], commission: 150, payment: 'Paid', paymentId: 'TRX-88120', paymentDate: '2026-10-25', verified: true, status: 'Ready', pdf: 'Up to date' },
    { id: 'MCH-003', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 168.5, 9.5]], claims: [['Parking', 45]], incentives: [['Sales target', 100]], commission: 120, payment: 'Paid', paymentId: 'TRX-88121', paymentDate: '2026-10-25', verified: false, status: 'Needs Attention', pdf: 'Up to date',
      issue: 'Payment Slip not found in Drive.', fix: 'Upload her slip on the Payment Slips page, then run Prepare again.' },
    { id: 'MCH-009', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 150, 9.5]], claims: [], incentives: [], commission: 75, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Needs Attention', pdf: 'Up to date', open: [14, 22],
      issue: '2 days in Jibble have no clock-out (14 and 22 Oct).', fix: 'Add the clock-outs in Jibble, then run Jibble → Fill in a month from Jibble in the spreadsheet.' },
    { id: 'MCH-011', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 88, 9]], claims: [['Transport', 15]], incentives: [], commission: null, payment: 'Paid', paymentId: 'TRX-88122', paymentDate: '2026-10-25', verified: true, status: 'Sent', pdf: 'Sent' },
    { id: 'MCH-014', stores: ['IOI'], lines: [['IOI', '1–31 Oct', 160.75, 10]], claims: [], incentives: [['Weekend shift', 50]], commission: 60, payment: 'Paid', paymentId: 'TRX-88123', paymentDate: '2026-10-25', verified: true, status: 'Review Required', pdf: 'Up to date',
      issue: 'We can’t tell if her payout email arrived.', fix: 'Open the sender’s Gmail Sent folder. If the email is there, mark her Sent in Payout Control. If not, talk to the system owner. Do not resend.' },
    { id: 'MCH-017', stores: ['IOI'], lines: [['IOI', '1–31 Oct', 152, null]], claims: [], incentives: [], commission: null, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Needs Attention', pdf: 'Not made yet',
      issue: 'Hourly rate for IOI is missing.', fix: 'Add his Hourly Rate in the Staff Directory. Wages and Total Payout stay blank until then.' },
    { id: 'MCH-019', stores: ['SS18'], lines: [['SS18', '1–15 Oct', 76, 9], ['SS18', '16–31 Oct', 82.25, 9.5]], claims: [], incentives: [['Sales target', 100]], commission: 110, payment: 'Paid', paymentId: 'TRX-88124', paymentDate: '2026-10-25', verified: true, status: 'Ready', pdf: 'Up to date' },
    { id: 'MCH-021', stores: ['SS18', 'IOI'], lines: [['SS18', '1–31 Oct', 96, 9.5], ['IOI', '1–31 Oct', 64.25, 10]], claims: [['Transport', 30]], incentives: [], commission: 85, payment: 'Paid', paymentId: 'TRX-88125', paymentDate: '2026-10-25', verified: false, status: 'Needs Attention', pdf: 'Out of date',
      issue: 'The payout changed after it was prepared.', fix: 'Run Prepare Payout again, then check the new Total Payout before you tick Manager Verified.' },
    { id: 'MCH-024', stores: ['IOI'], lines: [['IOI', '1–31 Oct', 140.5, 10]], claims: [], incentives: [], commission: 95, payment: 'Paid', paymentId: 'TRX-88126', paymentDate: '2026-10-25', verified: false, status: 'Ready', pdf: 'Up to date' },
    { id: 'MCH-026', stores: ['IOI'], lines: [['IOI', '1–31 Oct', 176, 10.5]], claims: [['Parking', 40]], incentives: [['Sales target', 100]], commission: 180, payment: 'Paid', paymentId: 'TRX-88127', paymentDate: '2026-10-25', verified: true, status: 'Sent', pdf: 'Sent' },
    { id: 'MCH-027', stores: ['IOI'], lines: [['IOI', '1–31 Oct', 120, 10]], claims: [['Meal', 12.5], ['Transport', 18]], incentives: [], commission: 40, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Ready', pdf: 'Up to date' }
  ];
  const MISSING_SLIPS = ['MCH-003', 'MCH-009', 'MCH-017', 'MCH-027'];
  const UNMATCHED = [
    { store: 'IOI', jibbleId: 'IOI-0299', jibbleName: 'Rina K.', hours: '96.50' },
    { store: 'IOI', jibbleId: 'IOI-0301', jibbleName: 'Adlina H', hours: '41.00' }
  ];
  const CLAIM_TYPES_IN_SHEET = ['Transport', 'Parking', 'Meal', 'Other'];

  let testMode = true;

  // The Configuration tab (invented values). Same labels as Payout Automation's CONFIG_KEYS_.
  const CONFIG = [
    { group: 'Payout month', label: 'Current Payout Month', value: 'October', kind: 'month', required: true },
    { group: 'Payout month', label: 'Current Payout Year', value: '2026', kind: 'year', required: true },
    { group: 'Testing', protected: true, label: 'Test Mode', value: 'TRUE', locked: true, note: 'Use the Test Mode switch above.' },
    { group: 'Testing', protected: true, label: 'Test Email', value: 'test-inbox@example.com', kind: 'email', note: 'Where test emails go while Test Mode is ON.' },
    { group: 'Email and documents', label: 'Company Name', value: 'Machino', required: true },
    { group: 'Email and documents', label: 'Sender Display Name', value: 'Retail Manager' },
    { group: 'Email and documents', label: 'Sender Position', value: 'Retail Operations' },
    { group: 'Email and documents', label: 'Website', value: 'www.example.com' },
    { group: 'Email and documents', label: 'Instagram', value: '@example' },
    { group: 'Drive', protected: true, label: 'Payment Slip Root Folder', value: '1AbCdEfGhIjKlMnOp', kind: 'folder', note: 'Drive folder ID.' },
    { group: 'Drive', protected: true, label: 'Payment Calculation Root Folder', value: '1QrStUvWxYz012345', kind: 'folder', note: 'Drive folder ID.' },
    { group: 'Drive', protected: true, label: 'Company Logo File ID', value: '1LoGoFiLeId000000', kind: 'file' },
    { group: 'Drive', protected: true, label: 'Payout Background File ID', value: '', kind: 'file' },
    { group: 'Who may send', label: 'Authorized Sender Email', value: 'sender@example.com', locked: true, note: 'Change it in the spreadsheet: it decides who can send LIVE emails.' },
    { group: 'Who may send', label: 'Authorized Operator Emails', value: 'operator@example.com', locked: true, note: 'Change it in the spreadsheet.' }
  ];
  const months = {};
  const sendLog = [
    { when: '25 Oct 2026, 4:13 pm', period: 'October 2026', name: 'Tan Mei Ling', mode: 'LIVE', to: 'm•••@example.com', result: 'Review Required', note: 'We can’t tell if it arrived. Check the Sent folder. Not retried.' },
    { when: '25 Oct 2026, 4:12 pm', period: 'October 2026', name: 'Kevin Ong Jun Hao', mode: 'LIVE', to: 'k•••@example.com', result: 'Sent' },
    { when: '25 Oct 2026, 4:12 pm', period: 'October 2026', name: 'Chloe Wong Mei Yee', mode: 'LIVE', to: 'c•••@example.com', result: 'Sent' },
    { when: '25 Oct 2026, 3:40 pm', period: 'October 2026', name: 'Siti Nurhaliza binti Omar', mode: 'TEST', to: 'Test inbox', result: 'Test sent' },
    { when: '26 Sep 2026, 2:05 pm', period: 'September 2026', name: 'Kevin Ong Jun Hao', mode: 'LIVE', to: 'k•••@example.com', result: 'Sent', note: 'Sent on the second try.' },
    { when: '26 Sep 2026, 1:58 pm', period: 'September 2026', name: 'Kevin Ong Jun Hao', mode: 'LIVE', to: 'k•••@example.com', result: 'Failed', note: 'Stopped before Gmail. Nothing was sent.' }
  ];

  const dir = (id) => DIRECTORY.find((d) => d.id === id);
  // What the page shows for one Staff Directory row (the same fields as the backend).
  const staffView = (d) => ({ id: d.id, internalId: 'S' + d.id.slice(-3), name: d.name, alias: d.alias, email: d.email,
    store: d.store, active: d.active !== false, rate: d.rate === undefined ? '9.50' : d.rate, ss18: d.ss18, ioi: d.ioi });
  /** Like the backend: refuse when what the admin saw no longer matches. */
  const changedSince = (e, expected) => !expected || Object.keys(expected).some((k) =>
    JSON.stringify(expected[k]) !== JSON.stringify(k === 'verified' ? !!e[k] : (e[k] === undefined ? '' : e[k])));
  const mask = (email) => email.replace(/^(.)[^@]*/, '$1•••');

  function attendance(p, monthShort, firstWeekday) {
    const out = [];
    p.lines.forEach((ln) => {
      const m = String(ln[1]).match(/(\d+)\D+(\d+)/);
      const a = Number(m[1]), b = Number(m[2]);
      const free = [];
      for (let d = a; d <= b; d++) if (!(p.open || []).includes(d)) free.push(d);
      const n = Math.max(1, Math.min(free.length, Math.round(ln[2] / 8.25)));
      let left = ln[2];
      for (let i = 0; i < n; i++) {
        const d = free[Math.floor((i * free.length) / n)];
        const h = i === n - 1 ? left : Math.round((ln[2] / n) * 100) / 100;
        left = Math.round((left - h) * 100) / 100;
        out.push({ date: d, store: ln[0], hours: h.toFixed(2), flag: '' });
      }
    });
    (p.open || []).forEach((d) => out.push({ date: d, store: p.stores[0], hours: '', flag: 'No clock-out' }));
    return out.sort((x, y) => x.date - y.date)
      .map((x) => Object.assign(x, { label: WD[(firstWeekday + x.date - 1) % 7] + ' ' + x.date + ' ' + monthShort }));
  }

  /** Recomputes one person's money like the sheet's formula would (preview only). */
  function settle(e) {
    const wages = e.lines.every((l) => l[3] != null) ? e.lines.reduce((s, l) => s + l[2] * l[3], 0) : null;
    e.wages = rm(wages);
    e.lines = e.lines.map((l) => l.slice(0, 4));
    e.lineView = e.lines.map((l) => [l[0], l[1], l[2].toFixed(2), rm(l[3]), l[3] == null ? null : rm(l[2] * l[3])]);
    e.hours = e.lines.reduce((s, l) => s + l[2], 0).toFixed(2);
    e.total = wages == null ? null : rm(wages + e.claims.reduce((s, c) => s + num(c.amount), 0) +
      e.incentives.reduce((s, c) => s + num(c.amount), 0) + num(e.commission));
  }

  function build(period) {
    const oct = period === 'October 2026';
    const short = oct ? 'Oct' : 'Sep';
    const employees = PEOPLE.map((p) => {
      const d = dir(p.id);
      const e = {
        id: p.id, name: d.name, stores: p.stores.slice(), email: mask(d.email), jibble: [d.ss18, d.ioi].filter(Boolean).join(' · '),
        lines: p.lines.map((l) => [l[0], oct ? l[1] : l[1].replace('31 Oct', '30 Sep').replace(' Oct', ' Sep'), l[2], l[3]]),
        claims: p.claims.map((c) => ({ type: c[0], amount: rm(c[1]) })),
        incentives: p.incentives.map((c) => ({ type: c[0], amount: rm(c[1]) })),
        commission: rm(p.commission),
        payment: p.payment, paymentId: p.paymentId, paymentDate: p.paymentDate, verified: p.verified,
        status: p.status, issue: p.issue || null, fix: p.fix || null, pdf: p.pdf,
        slip: MISSING_SLIPS.includes(p.id) ? 'Missing' : 'Found'
      };
      e.attendance = attendance(Object.assign({}, p, { lines: e.lines, open: oct ? p.open : [] }), short, oct ? 3 : 1);
      if (!oct) {
        Object.assign(e, { status: 'Sent', payment: 'Paid', paymentId: 'TRX-87' + p.id.slice(-3), paymentDate: '2026-09-26', verified: true, issue: null, fix: null, pdf: 'Sent', slip: 'Found' });
        e.lines = e.lines.map((l) => [l[0], l[1], l[2], l[3] == null ? 10 : l[3]]);
      }
      settle(e);
      e.canEdit = !['Sent', 'Review Required'].includes(e.status);
      return e;
    });
    const existing = DIRECTORY.filter((d) => PEOPLE.some((p) => p.id === d.id) && (!oct || !MISSING_SLIPS.includes(d.id)))
      .map((d) => slipTargetName_(d.store, d.name, period));
    return {
      period, employees, existing, unmatched: oct ? clone(UNMATCHED) : [],
      filledAt: oct ? '23 Oct, 10:05 am' : '24 Sep, 9:30 am',
      activity: oct
        ? [{ text: 'LIVE send from the spreadsheet: 2 sent, 1 needs review', when: '25 Oct, 4:12 pm · Send Log' },
           { text: 'TEST email sent to the test inbox', when: '25 Oct, 3:40 pm' },
           { text: 'Prepare Payout ran for 11 people', when: '24 Oct, 11:20 am' },
           { text: 'October filled from Jibble', when: '23 Oct, 10:05 am' }]
        : [{ text: 'September closed: 11 sent', when: '26 Sep, 2:05 pm · Send Log' }]
    };
  }
  const month = (period) => months[period] || (months[period] = build(period));

  function summarise(employees, store) {
    const pool = employees.filter((e) => store === 'all' || e.stores.includes(store === 'ss18' ? 'SS18' : 'IOI'));
    const totals = pool.map((e) => e.total);
    const blanks = totals.filter((t) => t == null).length;
    const by = (s) => pool.filter((e) => e.status === s).length;
    return {
      employees: pool.length,
      employeesNote: store === 'all' ? 'SS18 ' + employees.filter((e) => e.stores.includes('SS18')).length + ' · IOI ' + employees.filter((e) => e.stores.includes('IOI')).length + ' · 1 works at both' : 'Includes 1 who also works at the other store',
      total: rm(totals.reduce((s, t) => s + num(t), 0)),
      totalNote: blanks ? blanks + ' amount' + (blanks === 1 ? ' is' : 's are') + ' blank and not counted' : 'All amounts filled in',
      attention: pool.filter((e) => e.issue).length,
      waiting: pool.filter((e) => e.status === 'Ready' && !e.verified).length,
      paid: pool.filter((e) => e.payment === 'Paid').length,
      unpaid: pool.filter((e) => e.payment !== 'Paid').length,
      missingSlips: pool.filter((e) => e.slip !== 'Found').length,
      sent: by('Sent'), ready: by('Ready'), na: by('Needs Attention'), rr: by('Review Required'), failed: by('Failed')
    };
  }

  function preSend(employees) {
    const store = (e) => e.stores.join(' + ');
    return {
      will: employees.filter((e) => e.status === 'Ready' && e.verified && !e.issue).map((e) => ({ name: e.name, store: store(e), total: e.total })),
      cannot: employees.filter((e) => e.status !== 'Sent' && !(e.status === 'Ready' && e.verified && !e.issue))
        .map((e) => ({ name: e.name, store: store(e), why: e.status === 'Review Required' ? 'Review Required: check by hand whether the last email arrived.' : e.issue || 'Manager Verified not ticked.' })),
      sent: employees.filter((e) => e.status === 'Sent').map((e) => ({ name: e.name, store: store(e), when: '25 Oct' }))
    };
  }

  function stamp() {
    return new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  }

  function payrollPeople(m) {
    return m.employees.map((e) => ({ id: e.id, name: e.name, store: dir(e.id).store }));
  }

  return {
    getDashboardData(args) {
      const period = (args && args.period) || 'October 2026';
      const m = month(period);
      const steps = period === 'October 2026' ? 3 : 9;
      const employees = clone(m.employees);
      return {
        preview: true,
        period, periods: ['October 2026', 'September 2026'], updatedAt: stamp(), testMode,
        account: { name: 'Admin (preview)', email: 'admin@example.com' },
        summary: { all: summarise(employees, 'all'), ss18: summarise(employees, 'ss18'), ioi: summarise(employees, 'ioi') },
        monthSteps: ['Jibble hours', 'Rates', 'Slips', 'Prepare', 'Verify', 'Test email', 'Pre-Send Check', 'Send', 'Results'],
        currentStep: steps,
        employees,
        activity: m.activity,
        preSend: preSend(employees),
        sendSteps: [
          { label: 'Prepare Payout', note: 'Ran 24 Oct.', state: 'done' },
          { label: 'Review Payouts', note: 'Fix problems and tick Manager Verified in Payroll Management.', state: period === 'October 2026' ? 'current' : 'done' },
          { label: 'Test Payout Email', note: 'Goes to the test inbox only.', state: 'done' },
          { label: 'Pre-Send Check', note: 'The list below.', state: period === 'October 2026' ? 'todo' : 'done' },
          { label: 'Send Ready Employees', note: 'LIVE. In the spreadsheet for now.', state: period === 'October 2026' ? 'todo' : 'done' },
          { label: 'Results', note: 'See History.', state: period === 'October 2026' ? 'todo' : 'done' }
        ],
        jibble: {
          filledAt: m.filledAt,
          stores: [{ store: 'SS18', people: employees.filter((e) => e.stores.includes('SS18')).length },
                   { store: 'IOI', people: employees.filter((e) => e.stores.includes('IOI')).length }],
          paidProtected: employees.filter((e) => e.payment === 'Paid').length,
          unmatched: clone(m.unmatched),
          warnings: employees.filter((e) => e.attendance.some((d) => d.flag)).map((e) => ({ tag: 'No clock-out', store: e.stores[0], title: e.name + ' has ' + e.attendance.filter((d) => d.flag).length + ' days without a clock-out', next: 'add the clock-outs in Jibble, then fill the month again.', employeeId: e.id }))
            .concat(employees.filter((e) => e.lines.some((l) => l[3] == null)).map((e) => ({ tag: 'No rate', store: e.stores[0], title: e.name + ' has no Hourly Rate', next: 'add the rate in the Staff Directory, then fill the month again.', employeeId: e.id })))
        },
        staff: DIRECTORY.map(staffView),
        claimTypes: CLAIM_TYPES_IN_SHEET.slice(),
        documents: [
          { ok: true, title: 'Payroll tab “' + period + '”', note: 'Found and readable. ' + employees.length + ' people.' },
          { ok: true, title: period.split(' ')[0] + ' folders in Drive', note: 'Payment Slip folder and Payment Calculation folder both exist.' },
          { ok: !employees.some((e) => e.slip !== 'Found'), title: 'Payment Slips: ' + employees.filter((e) => e.slip === 'Found').length + ' of ' + employees.length + ' found', note: employees.some((e) => e.slip !== 'Found') ? 'Upload the missing ones on the Payment Slips page.' : 'Complete.' }
        ],
        config: CONFIG.map((r) => Object.assign({}, r, r.label === 'Test Mode' ? { value: testMode ? 'TRUE' : 'FALSE' } : {})),
        sendLog: clone(sendLog)
      };
    },

    saveEdit(req) {
      const m = month(req.period);
      const e = m.employees.find((x) => x.id === req.employeeId);
      if (!e) fail('This employee is no longer on the payroll tab. Refresh and try again.');
      if (changedSince(e, req.expected)) fail('This person changed since you opened them. Refresh to see the latest figures, then make your change again.');
      const c = req.changes;
      const wasPrepared = ['Up to date', 'Out of date', 'Sent'].includes(e.pdf);
      if (req.section === 'payout') {
        e.claims = c.claims.map((x) => ({ type: x.type, amount: x.amount === '' ? null : rm(x.amount) }));
        e.incentives = c.incentives.map((x) => ({ type: x.type, amount: x.amount === '' ? null : rm(x.amount) }));
        e.commission = c.commission === '' ? null : rm(c.commission);
        settle(e);
        if (wasPrepared && e.status !== 'Sent') {
          e.status = 'Needs Attention'; e.issue = 'The payout changed after it was prepared.';
          e.fix = 'Run Prepare Payout again, then check the new Total Payout.'; e.verified = false;
          if (e.pdf === 'Up to date') e.pdf = 'Out of date';
        }
      } else if (req.section === 'payment') {
        e.verified = !!c.verified;
        e.payment = c.payment; e.paymentId = c.paymentId || ''; e.paymentDate = c.paymentDate || '';
      } else fail('That part of the payout cannot be edited here.');
      return { employee: clone(e), message: 'Saved in this preview only. The real sheet was not changed.' };
    },

    setTestMode(args) {
      if (typeof args.on !== 'boolean') fail('Choose ON or OFF.');
      if (!args.on && args.confirm !== 'LIVE') fail('Type LIVE to turn Test Mode off.');
      testMode = args.on;
      return { testMode, message: 'Test Mode is now ' + (testMode ? 'ON' : 'OFF') + ' in this preview only. Configuration was not changed.' };
    },

    planSlipUpload(args) {
      const m = month(args.period);
      const rows = slipPlanUpload_({ period: args.period, people: DIRECTORY, existing: m.existing, files: args.files || [] });
      return { rows, missing: slipMissingPeople_(payrollPeople(m), DIRECTORY, m.existing, rows, args.period) };
    },

    saveSlips(args) {
      const m = month(args.period);
      const plan = slipPlanUpload_({ period: args.period, people: DIRECTORY, existing: m.existing, files: args.files });
      const saved = [], skipped = [];
      plan.forEach((row) => {
        if (row.status !== 'READY') { skipped.push({ name: row.name, reason: row.reason }); return; }
        m.existing.push(row.target);
        const e = m.employees.find((x) => x.id === row.employeeId);
        if (e) { e.slip = 'Found'; if (e.issue === 'Payment Slip not found in Drive.') { e.issue = null; e.fix = null; e.status = 'Ready'; } }
        saved.push({ name: row.name, target: row.target });
      });
      return { saved, skipped, message: 'Preview only: nothing was uploaded to Drive.' };
    },

    linkJibblePerson(args) {
      const m = month('October 2026');
      const u = m.unmatched.find((x) => x.jibbleId === args.jibbleId && x.store === args.store);
      if (!u) fail('That Jibble person is already linked. Refresh.');
      const d = dir(args.employeeId);
      if (!d) fail('Pick the Staff Directory person.');
      const col = args.store === 'SS18' ? 'ss18' : 'ioi';
      if (d[col]) fail(d.name + ' already has a ' + args.store + ' Jibble ID (' + d[col] + '). Nothing was changed.');
      if (DIRECTORY.some((x) => x[col] === args.jibbleId)) fail('That Jibble ID is already linked to someone else. Nothing was changed.');
      d[col] = args.jibbleId;
      m.unmatched = m.unmatched.filter((x) => x !== u);
      return { message: 'Linked in this preview only: ' + u.jibbleName + ' → ' + d.name + '. Run Jibble again to bring in their hours.' };
    },

    getEmailPreview(args) {
      const m = month(args.period);
      const e = m.employees.find((x) => x.id === args.employeeId);
      if (!e) fail('This employee is no longer on the payroll tab.');
      const first = e.name.split(' ')[0];
      const lines = ['Hi ' + first + ',', '', 'Your payout for ' + args.period + ' has been completed.', '', 'PAYOUT BREAKDOWN', ''];
      e.lineView.forEach((l) => lines.push(l[0] + ' ' + l[1] + ': ' + l[2] + ' hrs at ' + (l[3] || '-') + ' = ' + (l[4] || '-')));
      lines.push('Wages Amount: ' + (e.wages || '-'), '', 'Claims:');
      if (!e.claims.length) lines.push('  No claims this month: RM 0.00');
      e.claims.forEach((c) => lines.push('  ' + c.type + ': ' + (c.amount || '-')));
      lines.push('Incentives:');
      if (!e.incentives.length) lines.push('  No incentives this month: RM 0.00');
      e.incentives.forEach((c) => lines.push('  ' + c.type + ': ' + (c.amount || '-')));
      lines.push('Commission: ' + (e.commission || '-'), '', 'TOTAL PAYOUT: ' + (e.total || '-'), '',
        'Attached:', '  - Payment Calculation (full breakdown of your payout)', '  - Payment Slip (proof of the bank transfer)', '',
        'If anything looks incorrect, reply to this email.', '', 'Thank you,', '', 'Retail Manager', 'Machino');
      return {
        preview: true, testMode,
        to: testMode ? 'The Test Email in Configuration' : e.email,
        intended: e.email,
        subject: (testMode ? '[TEST] ' : '') + 'Your payout for ' + args.period,
        body: lines.join('\n'),
        attachments: [
          { kind: 'pdf', name: slipTargetName_(e.stores.join('-'), e.name, args.period).replace('Payment Slip', 'Payment Calculation'), ok: e.pdf !== 'Not made yet' },
          { kind: 'slip', name: slipTargetName_(dir(e.id).store, e.name, args.period), ok: e.slip === 'Found' }
        ]
      };
    },

    saveConfiguration(args) {
      const changes = args.changes || {};
      const keys = Object.keys(changes);
      if (!keys.length) fail('Nothing to save.');
      keys.forEach((k) => {
        const row = CONFIG.find((r) => r.label === k);
        if (!row) fail('"' + k + '" is not a Configuration setting.');
        if (row.locked) fail(k + ' cannot be changed from the dashboard.');
      });
      keys.forEach((k) => { CONFIG.find((r) => r.label === k).value = String(changes[k]); });
      return { message: keys.length + ' setting' + (keys.length === 1 ? '' : 's') + ' saved in this preview only. The Configuration tab was not changed.' };
    },

    setVerified(args) {
      if (args.people) fail('Verify one person at a time.');
      const m = month(args.period);
      const e = m.employees.find((x) => x.id === args.employeeId);
      if (!e) fail('This employee is no longer on the payroll tab. Refresh and try again.');
      if (changedSince(e, args.expected)) fail(e.name + ' changed since you opened the page. Refresh, check again, then verify.');
      if (e.status === 'Sent') fail(e.name + ' was already sent.');
      if (e.total == null) fail(e.name + '\'s Total Payout is blank, so there is nothing to verify yet.');
      e.verified = !!args.verified;
      return { employee: clone(e), message: e.name + (e.verified ? ' verified' : ' no longer verified') + ' in this preview only. The sheet was not changed.' };
    },

    saveStaff(args) {
      const d = dir(args.employeeId);
      if (!d) fail('That Employee ID is not in the Staff Directory exactly once. Nothing was changed.');
      const now = staffView(d);
      const c = args.changes || {};
      if ('id' in c || 'internalId' in c) fail('Employee ID cannot be changed here.');
      if (Object.keys(args.expected || {}).some((k) => JSON.stringify(args.expected[k]) !== JSON.stringify(now[k]))) {
        fail(now.name + ' changed in the Staff Directory since you opened it. Refresh, then make your change again. Nothing was saved.');
      }
      if ('name' in c && !String(c.name).trim()) fail('Name cannot be blank. Nothing was saved.');
      if ('name' in c && DIRECTORY.some((x) => x !== d && x.name.toLowerCase() === String(c.name).trim().toLowerCase())) {
        fail('Another Staff Directory row already has the name "' + c.name + '". Nothing was saved.');
      }
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fail('"' + c.email + '" is not an email address. Nothing was saved.');
      if (c.rate && !/^\d+(\.\d{1,2})?$/.test(c.rate)) fail('Hourly Rate must be an amount like 10 or 10.50. Nothing was saved.');
      Object.keys(c).forEach((k) => { d[k] = typeof c[k] === 'string' ? c[k].trim() : c[k]; });
      return { staff: DIRECTORY.map(staffView), message: d.name + ': saved in this preview only. The Staff Directory was not changed.' };
    },

    getDocumentUrl() { return null; },
    getSheetUrl() { return null; },
    runPreparePayout() { return { ok: false, preview: true, message: 'Preview: Prepare Payout did not run. When connected, this runs the existing Prepare Payout. It never sends an email.' }; }
  };
})();
