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
    { id: 'MCH-009', name: 'Muhammad Aiman Hakim bin Rosli', alias: 'Aiman', store: 'SS18', email: '', ss18: 'SS18-0121', ioi: '' },
    { id: 'MCH-011', name: 'Chloe Wong Mei Yee', alias: '', store: 'SS18', email: 'chloe.w@example.com', ss18: 'SS18-0131', ioi: '' },
    { id: 'MCH-014', name: 'Tan Mei Ling', alias: '', store: 'IOI', email: 'meiling.t@example.com', ss18: '', ioi: 'IOI-0204' },
    { id: 'MCH-017', name: 'Hafiz Rahman bin Yusof', alias: '', store: 'IOI', email: 'hafiz.r@example.com', ss18: '', ioi: 'IOI-0217', rate: '' },
    { id: 'MCH-019', name: 'Farah Izzati binti Kamal', alias: '', store: 'SS18', email: 'farah.i@example.com', ss18: 'SS18-0119', ioi: '' },
    { id: 'MCH-021', name: 'Daniel Lim Wei Jie', alias: '', store: 'SS18', email: 'daniel.l@example.com', ss18: 'SS18-0125', ioi: 'IOI-0230' },
    { id: 'MCH-024', name: 'Arjun a/l Pillai', alias: '', store: 'IOI', email: 'arjun.p@example.com', ss18: '', ioi: 'IOI-0224' },
    { id: 'MCH-026', name: 'Kevin Ong Jun Hao', alias: '', store: 'IOI', email: 'kevin.o@example.com', ss18: '', ioi: 'IOI-0226' },
    { id: 'MCH-027', name: 'Nur Adila Faezza binti Zakaria', alias: 'Adila', store: 'IOI', email: 'adila.z@example.com', ss18: '', ioi: 'IOI-0241' },
    { id: 'MCH-028', name: 'Nur Adlina binti Hassan', alias: '', store: 'IOI', email: 'adlina.h@example.com', ss18: '', ioi: '' },
    { id: 'MCH-030', name: 'Rina Kaur', alias: '', store: 'IOI', email: 'rina.k@example.com', ss18: '', ioi: '' },
    { id: 'MCH-031', name: 'Nadia Nursyifaa binti Mohd Nizam', alias: 'Nadia', store: 'IOI', email: 'nadia.n@example.com', ss18: '', ioi: '' }
  ];
  // On the October tab under the name Jibble uses; nothing in the Staff Directory has exactly that name.
  const UNLINKED = [{ name: 'Nadia Syifa', stores: ['IOI'], hours: 56 }];

  // This month's payout rows (invented). Amounts are what the sheet would show.
  const PEOPLE = [
    { id: 'MCH-001', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 172.12, 9.5]], claims: [['Transport', 20]], incentives: [['Sales target', 100]], commission: 150, payment: 'Paid', paymentId: 'TRX-88120', paymentDate: '2026-10-25', verified: true, status: 'Ready', pdf: 'Up to date' },
    { id: 'MCH-003', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 168.5, 9.5]], claims: [['Parking', 45]], incentives: [['Sales target', 100]], commission: 120, payment: 'Paid', paymentId: 'TRX-88121', paymentDate: '2026-10-25', verified: false, status: 'Needs Attention', pdf: 'Up to date',
      issue: 'Payment Slip not found in Drive.', fix: 'Upload her slip on the Payment Slips page, then run Prepare again.' },
    { id: 'MCH-009', stores: ['SS18'], lines: [['SS18', '1–31 Oct', 150, 9.5]], claims: [], incentives: [], commission: 75, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Needs Attention', pdf: 'Up to date', open: [14, 22],
      issue: '2 days in Jibble have no clock-out (14 and 22 Oct).', fix: 'Add the clock-outs in Jibble, then run Machino Payout → 1. Get Hours from Jibble in the spreadsheet.' },
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
    { group: 'Who may send', label: 'Authorized Sender Email', value: 'sender@example.com', kind: 'emails', protected: true, note: 'Emails separated by commas: the accounts that may send LIVE. The website sends as the account that set it up.' },
    { group: 'Who may send', label: 'Authorized Operator Emails', value: 'operator@example.com', kind: 'emails', protected: true, note: 'Emails separated by commas: these may send TEST emails only.' },
    { group: 'Who may send', label: 'Payout Store Scope', value: 'ALL', note: 'Not used by the payout today.' }
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
  const staffView = (d) => ({ row: DIRECTORY.indexOf(d) + 2, id: d.id, internalId: d.id ? 'S' + d.id.slice(-3) : '', name: d.name, alias: d.alias, email: d.email,
    store: d.store, active: d.active !== false, rate: d.rate === undefined ? '9.50' : d.rate, ss18: d.ss18, ioi: d.ioi });
  /** Like Payout Automation: one more than the highest number-only Employee ID, padded to 3. */
  const nextId = () => String(DIRECTORY.reduce((m, d) => /^\d+$/.test(d.id) ? Math.max(m, Number(d.id)) : m, 0) + 1).padStart(3, '0');
  const handMade = (period) => period === 'September 2026';
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
    e.hoursEdit = e.lines.length === 1 ? { hours: String(e.lines[0][2]), rate: e.lines[0][3] == null ? '' : String(e.lines[0][3]), why: '' }
      : { hours: '', rate: '', why: 'Their hours or rate are written on more than one row in the sheet, so change them in the spreadsheet.' };
    const wages = e.lines.every((l) => l[3] != null) && !e.holdWages ? e.lines.reduce((s, l) => s + l[2] * l[3], 0) : null;
    e.wages = rm(wages);
    e.lines = e.lines.map((l) => l.slice(0, 4));
    e.lineView = e.lines.map((l) => [l[0], l[1], l[2].toFixed(2), rm(l[3]), l[3] == null ? null : rm(l[2] * l[3])]);
    e.hours = e.lines.reduce((s, l) => s + l[2], 0).toFixed(2);
    e.total = wages == null ? null : rm(wages + e.claims.reduce((s, c) => s + num(c.amount), 0) +
      e.incentives.reduce((s, c) => s + num(c.amount), 0) + num(e.commission));
  }

  function build(period) {
    const oct = period !== 'September 2026';   // any newer month looks like October
    const short = oct ? 'Oct' : 'Sep';
    const employees = PEOPLE.map((p) => {
      const d = dir(p.id);
      const e = {
        holdWages: p.id === 'MCH-009' && period === 'October 2026',   // a day with no clock-out leaves wages blank, as the Jibble fill does
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
      if (period !== 'October 2026' && period !== 'September 2026') {
        // A month just filled from Jibble: nobody paid, prepared or verified yet.
        Object.assign(e, { payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Needs Attention',
          issue: 'Not prepared yet.', fix: 'Run Prepare Payout.', pdf: 'Not made yet' });
      }
      e.canEdit = !['Sent', 'Review Required'].includes(e.status);
      return e;
    });
    if (period === 'October 2026') {
      UNLINKED.forEach((u) => {
        const e = { id: 'name:' + u.name.toLowerCase(), name: u.name, stores: u.stores.slice(), email: '', jibble: '', lines: [[u.stores[0], '1–31 Oct', u.hours, null]],
          claims: [], incentives: [], commission: null, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false, status: 'Needs Attention',
          issue: '“' + u.name + '” is not in the Staff Directory under this name.', fix: 'Link them in Needs fixing, then run Prepare Payout.', pdf: 'Not made yet', slip: 'Missing', canEdit: false };
        e.attendance = attendance({ lines: e.lines, open: [], stores: e.stores }, short, 3);
        settle(e);
        employees.push(e);
      });
    }
    const existing = DIRECTORY.filter((d) => PEOPLE.some((p) => p.id === d.id) && (!oct || !MISSING_SLIPS.includes(d.id)))
      .map((d) => slipTargetName_(d.store, d.name, period));
    // Two files not yet under the standard name, to show renaming.
    if (period === 'October 2026') {
      const arjun = existing.findIndex((n) => /^IOI Arjun/.test(n));
      existing[arjun] = 'Arjun - payslip Oct.pdf';
      existing.push('scan_0042.pdf');
    }
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
  const PERIODS = ['October 2026', 'September 2026'];
  const NO_FOLDERS = {};   // months set up without their Drive folders
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isoOf = (label) => label.split(' ')[1] + '-' + String(MONTHS.indexOf(label.split(' ')[0]) + 1).padStart(2, '0');
  const labelOf = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
  const configValue = (label) => CONFIG.find((r) => r.label === label).value;
  const driveFiles = (m) => m.existing.map((n, i) => ({ name: n, url: '#', fileId: 'F' + i }));
  const heldIds = (m) => m.employees.filter((e) => ['Sent', 'Review Required'].includes(e.status)).map((e) => e.id);

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

  const unlinked = (e) => String(e.id).startsWith('name:');
  const NAME_WORDS_SKIPPED = ['bin', 'binti', 'bt', 'bte', 'b', 'a/p', 'ap', 'a/l', 'al'];
  const nameWords = (n) => n.toLowerCase().split(/\s+/).filter((w) => w && !NAME_WORDS_SKIPPED.includes(w));
  function demoFixes(m) {
    const taken = new Set(m.employees.filter((e) => !unlinked(e)).map((e) => e.id));
    const out = [];
    m.employees.forEach((e) => {
      const problems = [];
      if (unlinked(e)) {
        const w = nameWords(e.name);
        const candidates = DIRECTORY.filter((d) => d.id && d.active !== false && !taken.has(d.id)).map((d) => {
          const dw = nameWords(d.name);
          const small = w.length <= dw.length ? w : dw;
          const big = small === w ? dw : w;
          const how = d.name.toLowerCase() === e.name.toLowerCase() ? 'exact' : small.length >= 2 && small.every((x) => big.includes(x)) ? 'words' : w[0] && w[0] === dw[0] ? 'first' : '';
          return how ? { id: d.id, name: d.name, store: d.store, how, hasJibble: !!(d.ss18 || d.ioi) } : null;
        }).filter(Boolean).sort((a, b) => ['exact', 'words', 'first'].indexOf(a.how) - ['exact', 'words', 'first'].indexOf(b.how));
        problems.push({ code: 'link', text: '“' + e.name + '” is not linked to a Staff Directory person, so no wages or Total Payout yet.', candidates, giveId: null, inJibble: true });
      } else {
        const d = dir(e.id);
        if (e.lines.some((l) => l[3] == null)) {
          problems.push({ code: 'rate', text: 'No Hourly Rate, so no wages or Total Payout yet.', directoryRate: d.rate === undefined ? '9.50' : d.rate, canFix: e.hoursEdit.why === '' });
        }
        const openDays = e.attendance.filter((x) => x.flag === 'No clock-out');
        if (openDays.length && e.total == null) {
          problems.push({ code: 'clockout', text: openDays.length + ' day' + (openDays.length === 1 ? '' : 's') + ' without a clock-out, so no wages yet.', days: openDays.map((x) => x.label),
            hours: String(e.lines[0][2]), rate: String(e.lines[0][3] == null ? '' : e.lines[0][3]), canPay: e.lines.length === 1 && e.lines[0][3] != null && e.lines[0][2] > 0 });
        }
        if (!d.email) problems.push({ code: 'email', text: 'No email address, so their payout email cannot be sent.' });
      }
      if (problems.length) out.push({ key: e.id, name: e.name, stores: e.stores, hours: e.hours, employeeId: unlinked(e) ? null : e.id, problems });
    });
    return out.sort((a, b) => (a.problems[0].code === 'link' ? 0 : 1) - (b.problems[0].code === 'link' ? 0 : 1));
  }

  function payrollPeople(m) {
    return m.employees.map((e) => ({ id: e.id, name: e.name, store: (dir(e.id) || { store: e.stores[0] }).store }));
  }

  return {
    getDashboardData(args) {
      const period = (args && args.period) || 'October 2026';
      const m = month(period);
      const steps = period === 'October 2026' ? 3 : 9;
      const employees = clone(m.employees);
      return {
        preview: true,
        period, periods: PERIODS.slice(), updatedAt: stamp(), testMode,
        folders: { name: period, slip: !NO_FOLDERS[period], calc: !NO_FOLDERS[period], problem: '' },
        months: (() => {
          const latest = PERIODS.map(isoOf).sort().pop();
          const y = Number(latest.slice(0, 4)), mo = Number(latest.slice(5, 7));
          const next = (mo === 12 ? y + 1 : y) + '-' + String(mo === 12 ? 1 : mo + 1).padStart(2, '0');
          return { current: isoOf(configValue('Current Payout Month') + ' ' + configValue('Current Payout Year')), latest, next, nextLabel: labelOf(next) };
        })(),
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
          { label: 'Send to Employees', note: 'LIVE. In the spreadsheet for now.', state: period === 'October 2026' ? 'todo' : 'done' },
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
        staffNextId: nextId(),
        fixes: demoFixes(m),
        monthTab: { fromJibble: !handMade(period) },
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
      } else if (req.section === 'hours') {
        if (e.payment === 'Paid') fail(e.name + ' is marked Paid, so the payout amounts are locked. If this really needs to change, set Payment Status back first.');
        if (e.hoursEdit.why) fail(e.name + ': ' + e.hoursEdit.why);
        e.lines = [[e.lines[0][0], e.lines[0][1], c.hours === '' ? 0 : Number(c.hours), c.rate === '' ? null : Number(c.rate)]];
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
        if (row.kind === 'emails' && String(changes[k]).split(',').some((e) => e.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))) fail(k + ' must be email addresses separated by commas, or blank.');
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

    addStaff(args) {
      const p = Object.assign({}, args.person || {});
      p.id = String(p.id || '').trim() || nextId();
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/.test(p.id)) fail('Type the Employee ID, e.g. 031 (letters, numbers, no spaces). Nothing was added.');
      if (!p.store || !p.rate) fail('Fill in the store and Hourly Rate. Nothing was added.');
      if (!String(p.name || '').trim()) fail('Type the name. Nothing was added.');
      if (dir(p.id.trim())) fail('Employee ID ' + p.id + ' is already in the Staff Directory. Nothing was added.');
      if (DIRECTORY.some((x) => x.name.toLowerCase() === p.name.trim().toLowerCase())) fail('Someone named "' + p.name + '" is already in the Staff Directory. Nothing was added.');
      DIRECTORY.push({ id: p.id.trim(), name: p.name.trim(), alias: p.alias || '', store: p.store || '', email: p.email || '',
        ss18: p.ss18 || '', ioi: p.ioi || '', active: p.active !== false, rate: p.rate || '' });
      return { staff: DIRECTORY.map(staffView), staffNextId: nextId(), message: p.name.trim() + ' was added with Employee ID ' + p.id + ' in this preview only. The Staff Directory was not changed.' };
    },

    setStaffId(args) {
      const d = DIRECTORY[Number(args.row) - 2];
      if (!d || d.name !== args.name) fail('That row of the Staff Directory changed since you opened it. Refresh, then try again. Nothing was changed.');
      if (d.id) fail(d.name + ' already has Employee ID ' + d.id + '. It is never changed. Nothing was changed.');
      const id = String(args.id || '').trim() || nextId();
      if (dir(id)) fail('Employee ID ' + id + ' is already in the Staff Directory. Nothing was changed.');
      d.id = id;
      return { staff: DIRECTORY.map(staffView), staffNextId: nextId(), message: d.name + ' now has Employee ID ' + id + ' in this preview only.' };
    },

    addToMonth(args) {
      const m = month(args.period);
      if (handMade(args.period)) fail('"' + args.period + '" was made by hand, so add the person in the spreadsheet. Nothing was changed.');
      const p = args.person || {};
      const d = dir(p.employeeId);
      if (!d) fail('That Employee ID is not in the Staff Directory exactly once. Nothing was changed.');
      if (m.employees.some((e) => e.id === d.id)) fail(d.name + ' is already on the "' + args.period + '" tab. Nothing was changed.');
      const hours = p.days.reduce((n, x) => n + Number(x.hours), 0);
      const rate = d.rate === undefined ? 9.5 : (d.rate === '' ? null : Number(d.rate));
      const e = { id: d.id, name: d.name, stores: [p.store], email: mask(d.email), jibble: [d.ss18, d.ioi].filter(Boolean).join(' · '),
        lines: [[p.store, p.days.map((x) => Number(x.date.slice(8))).sort((a, b) => a - b).join(', '), hours, rate]],
        claims: [], incentives: [], commission: null, payment: 'Not paid', paymentId: '', paymentDate: '', verified: false,
        status: 'Needs Attention', issue: 'Not prepared yet.', fix: 'Run Prepare Payout.', pdf: 'Not made yet', slip: 'Missing', canEdit: true,
        attendance: p.days.map((x) => ({ date: Number(x.date.slice(8)), label: x.date, store: p.store, hours: Number(x.hours).toFixed(2), flag: '' })) };
      settle(e);
      m.employees.push(e);
      return { period: args.period, message: d.name + ' was added to "' + args.period + '" in this preview only: ' + p.days.length + ' day(s), ' + hours.toFixed(2) + ' hours. Run Prepare Payout so they can be checked and sent.' };
    },

    removeFromMonth(args) {
      if (args.confirm !== 'REMOVE') fail('Type REMOVE to confirm.');
      const m = month(args.period);
      if (handMade(args.period)) fail('"' + args.period + '" was made by hand, so remove the person in the spreadsheet. Nothing was changed.');
      const e = m.employees.find((x) => x.id === args.employeeId);
      if (!e) fail('This person is no longer on the month tab. Refresh and try again.');
      if (changedSince(e, args.expected)) fail(e.name + ' changed since you opened them. Refresh, then try again. Nothing was changed.');
      if (['Sent', 'Review Required'].includes(e.status)) fail(e.name + ' was already sent, so nothing about this payout can be changed here.');
      if (e.payment === 'Paid') fail(e.name + ' is marked Paid, so they stay on the month as a record. Nothing was changed.');
      m.employees.splice(m.employees.indexOf(e), 1);
      return { period: args.period, message: e.name + ' was removed from "' + args.period + '" in this preview only.' };
    },

    linkInMonth(args) {
      const m = month(args.period);
      const e = m.employees.find((x) => x.name === args.name && unlinked(x));
      if (!args.confirm) fail('Confirm that this is the right person first.');
      if (!e) fail('"' + args.name + '" is no longer on the "' + args.period + '" tab. Refresh, then try again. Nothing was changed.');
      if (changedSince(e, args.expected)) fail(e.name + ' changed in the spreadsheet since you opened them. Refresh, then try again. Nothing was saved.');
      const d = dir(args.employeeId);
      if (!d) fail('That Employee ID is not in the Staff Directory exactly once. Nothing was changed.');
      if (d.active === false) fail(d.name + ' is not Active in the Staff Directory, so they cannot be paid. Nothing was changed.');
      if (m.employees.some((x) => x.id === d.id)) fail(d.name + ' is already on the "' + args.period + '" tab. Nothing was changed.');
      const was = e.name;
      const rate = d.rate === undefined ? 9.5 : (d.rate === '' ? null : Number(d.rate));
      const col = e.stores[0] === 'SS18' ? 'ss18' : 'ioi';
      Object.assign(e, { id: d.id, name: d.name, email: mask(d.email || 'x@example.com'), issue: 'Not prepared yet.', fix: 'Run Prepare Payout.', canEdit: true,
        lines: [[e.lines[0][0], e.lines[0][1], e.lines[0][2], rate]] });
      let jibble = '';
      if (!d[col]) { d[col] = 'IOI-0399'; jibble = ' Their Jibble ID was saved, so next month they match by themselves.'; }
      e.jibble = [d.ss18, d.ioi].filter(Boolean).join(' · ');
      settle(e);
      return { employee: clone(e), message: was + ' is now linked to ' + d.name + ' (Employee ID ' + d.id + ').' + (rate == null ? ' They still have no Hourly Rate: add one in Needs fixing.' : ' Wages worked out from the Staff Directory rate.') + jibble + ' Run Prepare payouts so they can be checked and sent. (Preview only: the sheet was not changed.)' };
    },

    payKnownHours(args) {
      if (!args.confirm) fail('Confirm which day is left out first.');
      const m = month(args.period);
      const e = m.employees.find((x) => x.id === args.employeeId);
      if (!e) fail('This person is no longer on the month tab. Refresh and try again.');
      if (changedSince(e, args.expected)) fail(e.name + ' changed in the spreadsheet since you opened them. Refresh, then try again. Nothing was saved.');
      if (e.payment === 'Paid') fail(e.name + ' is marked Paid, so the payout amounts are locked. Set Payment Status back first. Nothing was changed.');
      if (!e.attendance.some((x) => x.flag === 'No clock-out')) fail(e.name + ' has no day without a clock-out. Use Edit hours to change their pay. Nothing was changed.');
      if (e.lines[0][3] == null) fail(e.name + ' has no Hourly Rate yet. Add it first (Needs fixing). Nothing was changed.');
      const days = e.attendance.filter((x) => x.flag === 'No clock-out').map((x) => x.label);
      e.holdWages = false;
      settle(e);
      let message = e.name + ': pay worked out from ' + Number(e.hours).toFixed(2) + ' hours × RM' + Number(e.lines[0][3]).toFixed(2) + ' = ' + e.wages.replace('RM ', 'RM') + '. The ' + (days.length === 1 ? 'day' : days.length + ' days') + ' with no clock-out (' + days.join(', ') + ') ' + (days.length === 1 ? 'is' : 'are') + ' NOT included.';
      if (e.verified) { e.verified = false; message += ' Manager Verified was cleared because the payout changed.'; }
      return { employee: clone(e), message: message + ' Run Prepare payouts again. (Preview only.)' };
    },

    fixRate(args) {
      const m = month(args.period);
      const e = m.employees.find((x) => x.id === args.employeeId);
      if (!e) fail('This person is no longer on the month tab. Refresh and try again.');
      if (changedSince(e, args.expected)) fail(e.name + ' changed in the spreadsheet since you opened them. Refresh, then try again. Nothing was saved.');
      if (e.payment === 'Paid') fail(e.name + ' is marked Paid, so the payout amounts are locked. Set Payment Status back first. Nothing was changed.');
      const d = dir(e.id);
      let rate = d.rate === undefined ? 9.5 : (d.rate === '' ? null : Number(d.rate));
      let saved = false;
      if (rate == null) {
        if (!args.rate || !/^\d+(\.\d{1,2})?$/.test(args.rate) || Number(args.rate) <= 0) fail('Type the Hourly Rate, e.g. 10 or 10.50. Nothing was changed.');
        rate = Number(args.rate); d.rate = String(args.rate); saved = true;
      }
      e.lines = e.lines.map((l) => [l[0], l[1], l[2], l[3] == null ? rate : l[3]]);
      settle(e);
      let message = e.name + ': Hourly Rate RM' + rate.toFixed(2) + (saved ? ' saved to the Staff Directory and' : ' from the Staff Directory') + ' put in this month. Wages worked out.';
      if (e.verified) { e.verified = false; message += ' Manager Verified was cleared because the payout changed.'; }
      return { employee: clone(e), message: message + ' Run Prepare payouts again. (Preview only.)' };
    },

    planRefill(args) {
      const m = month(args.period);
      const paid = m.employees.filter((e) => e.payment === 'Paid').map((e) => e.name);
      return { period: args.period, upTo: '23/10/2026', removed: [],
        blockers: paid.length ? ['"' + args.period + '" already has people marked Paid (' + paid.slice(0, 3).join(', ') + '), so it was not filled in again. Change the hours in that tab by hand.'] : [],
        people: m.employees.map((e, i) => ({ name: e.name, employeeId: unlinked(e) ? '' : e.id, isNew: false, oldHours: e.hours, newHours: (Number(e.hours) + (i === 0 ? 8 : 0)).toFixed(2),
          typed: e.claims.length || e.incentives.length || e.commission ? { claims: e.claims.length, incentives: e.incentives.length, commission: !!e.commission, pay: false } : null })) };
    },

    refillMonth(args) {
      if (args.confirm !== true && args.confirm !== 'UPDATE') fail('Confirm the update first.');
      const m = month(args.period);
      if (m.employees.some((e) => e.payment === 'Paid')) fail('"' + args.period + '" already has people marked Paid, so it was not filled in again. Nothing was changed.');
      const first = m.employees[0];
      first.lines = first.lines.map((l, i) => i === 0 ? [l[0], l[1], l[2] + 8, l[3]] : l);
      settle(first);
      return { period: args.period, message: 'Updated from Jibble up to 23/10/2026 in this preview only. ' + m.employees.length + ' people. What was typed was kept. Run Prepare payouts again so everyone is checked against the new hours.' };
    },

    planWageFormulas(args) {
      const m = month(args.period);
      return { period: args.period, convert: m.employees.filter((e) => e.status !== 'Sent' && e.status !== 'Review Required' && !unlinked(e)).length, already: 0,
        left: m.employees.filter((e) => e.status === 'Sent' || e.status === 'Review Required').map((e) => ({ name: e.name, why: 'already ' + e.status + ', left as it is' }))
          .concat(m.employees.filter(unlinked).map((e) => ({ name: e.name, why: 'has hours and a rate but no wages: use Needs fixing / Fix people with no pay' }))) };
    },

    addWageFormulas(args) {
      const plan = this.planWageFormulas(args);
      return { period: args.period, converted: plan.convert, already: 0, left: plan.left,
        message: plan.convert + ' people now have Wages as a formula (Hours Worked × Hourly Rate): change an hour or a rate in the sheet and the Wages and Total Payout follow. ' + plan.left.length + ' left as they are. (Preview only: the sheet was not changed.)' };
    },

    getPayoutControl(args) {
      const m = month(args.period);
      return { period: args.period, rows: m.employees.filter((e) => e.pdf !== 'Not made yet').map((e) => ({
        employeeId: e.id, name: e.name, store: e.stores.join(' / '), period: args.period, total: e.total, payment: e.payment === 'Paid' ? 'Paid' : '',
        payoutDate: e.paymentDate, calculation: true, slip: e.slip === 'Found', verified: !!e.verified, status: e.status, issue: e.issue || '' })) };
    },

    planMonthSetup(args) {
      // Invented stand-in for the menu's matching: the Jibble name's first word is one of the Staff Directory name's words.
      const first = (n) => n.split(' ')[0].replace(/\W/g, '');
      const links = [];
      month('October 2026').unmatched.forEach((u) => {
        const col = u.store === 'SS18' ? 'ss18' : 'ioi';
        const d = DIRECTORY.find((x) => x.id && x.name.split(' ').includes(first(u.jibbleName)) && !x[col]);
        if (d) links.push({ store: u.store, jibbleName: u.jibbleName, jibbleId: u.jibbleId, name: d.name, employeeId: d.id, exact: false });
      });
      return { month: args.month, links, rates: [], from: '', keys: links.map((l) => 'link|' + l.store + '|' + l.employeeId + '|' + l.jibbleId) };
    },

    planJibbleIds(args) {
      // Invented stand-in for the real matching: a name that fits is chosen (first word in the Staff Directory name); others get hints.
      const first = (n) => n.split(' ')[0].replace(/\W/g, '');
      const col = (store) => (store === 'SS18' ? 'ss18' : 'ioi');
      const people = month('October 2026').unmatched.map((u) => {
        const fit = DIRECTORY.find((x) => x.id && x.active !== false && x.name.split(' ').includes(first(u.jibbleName)) && !x[col(u.store)]);
        return { store: u.store, jibbleId: u.jibbleId, jibbleName: u.jibbleName, employeeId: fit ? fit.id : '', exact: false, hints: [] };
      });
      const choices = {};
      ['SS18', 'IOI'].forEach((s) => { choices[s] = DIRECTORY.filter((x) => x.id && x.active !== false && !x[col(s)]).map((x) => ({ id: x.id, name: x.name })); });
      return { period: args.period, upTo: '23/10/2026', people, choices, linked: DIRECTORY.filter((x) => x.ss18 || x.ioi).length };
    },

    saveJibbleIds(args) {
      if (args.confirm !== true) fail('Confirm the list first.');
      const m = month('October 2026');
      const picks = args.picks || [];
      if (!picks.length) fail('Choose at least one person. Nothing was changed.');
      const done = picks.map((p) => {
        const u = m.unmatched.find((x) => x.jibbleId === p.jibbleId && x.store === p.store);
        const d = dir(p.employeeId);
        const c = p.store === 'SS18' ? 'ss18' : 'ioi';
        if (!u) fail('A Jibble person on your list is not waiting for a Jibble ID any more. Check again. Nothing was changed.');
        if (!d) fail('The Employee ID chosen for ' + u.jibbleName + ' is not in the Staff Directory exactly once. Nothing was changed.');
        if (d[c]) fail(d.name + ' already has a ' + p.store + ' Jibble ID. Nothing was changed.');
        return { u, d, c };
      });
      if (new Set(done.map((x) => x.c + x.d.id)).size !== done.length) fail('One person was chosen for two Jibble people. Choose one. Nothing was changed.');
      done.forEach(({ u, d, c }) => { d[c] = u.jibbleId; m.unmatched = m.unmatched.filter((x) => x !== u); });
      return { staff: DIRECTORY.map(staffView), message: done.length + ' Jibble ID' + (done.length === 1 ? '' : 's') + ' saved in this preview only: ' +
        done.map(({ u, d }) => u.jibbleName + ' → ' + d.name).join(', ') + '. The Staff Directory was not changed.' };
    },

    deleteStaff(args) {
      if (args.confirm !== 'DELETE') fail('Type DELETE to confirm.');
      const d = dir(args.employeeId);
      if (!d) fail('That Employee ID is not in the Staff Directory exactly once. Nothing was deleted.');
      if (PEOPLE.some((p) => p.id === d.id)) fail(d.name + ' is on the October 2026 payroll, so they cannot be deleted now. Untick Active instead, or delete them after this month is finished.');
      DIRECTORY.splice(DIRECTORY.indexOf(d), 1);
      return { staff: DIRECTORY.map(staffView), message: d.name + ' was deleted in this preview only. The Staff Directory was not changed.' };
    },

    createMonthFolders(args) {
      delete NO_FOLDERS[args.period];
      return { message: 'Preview: the "' + args.period + '" folders would be created in Drive. Nothing was created.' };
    },

    setUpMonth(args) {
      const label = labelOf(args.month);
      if (args.fill) {
        if (PERIODS.includes(label) && !args.replace) fail('"' + label + '" already exists. Tick "Replace it" to go ahead. Nothing was changed.');
        if (!PERIODS.includes(label)) PERIODS.unshift(label);
        delete months[label];
        if (!args.folders) NO_FOLDERS[label] = true;
      }
      (args.directory || []).forEach((k) => {
        const [, store, id, jibbleId] = k.split('|');
        const d = dir(id);
        if (d && !d[store === 'SS18' ? 'ss18' : 'ioi']) d[store === 'SS18' ? 'ss18' : 'ioi'] = jibbleId;
      });
      if (args.makeCurrent) {
        CONFIG.find((r) => r.label === 'Current Payout Month').value = label.split(' ')[0];
        CONFIG.find((r) => r.label === 'Current Payout Year').value = label.split(' ')[1];
      }
      return { period: label, message: 'Preview only: "' + label + '" was set up in this browser tab. Nothing in the spreadsheet, Drive or Jibble was touched.' };
    },

    listSlipFiles(args) {
      const m = month(args.period);
      return { folderOk: true, rows: slipPlanRenames_({ period: args.period, people: DIRECTORY, files: driveFiles(m), held: heldIds(m), picks: args.picks || {} }) };
    },

    renameSlips(args) {
      const m = month(args.period);
      const chosen = new Set(args.fileIds || []);
      const rows = slipPlanRenames_({ period: args.period, people: DIRECTORY, files: driveFiles(m), held: heldIds(m), picks: args.picks || {} });
      const renamed = [], skipped = [];
      rows.forEach((r) => {
        if (!chosen.has(r.fileId)) return;
        if (r.state !== 'rename') { skipped.push({ name: r.name, reason: r.reason }); return; }
        m.existing[Number(r.fileId.slice(1))] = r.target;
        renamed.push({ from: r.name, to: r.target });
      });
      return { renamed, skipped, message: 'Preview only: nothing in Drive was renamed.' };
    },

    /** The same rule as Payout Automation's dashboardRememberSlipName: the name must match nobody now, and the alias cell must be empty. */
    rememberSlipName(args) {
      const person = DIRECTORY.find((p) => p.id === args.employeeId);
      if (!person) return { ok: false, message: 'That person is not in the Staff Directory. Nothing was saved.' };
      const part = slipNamePart_(slipClean_(args.fileName).replace(/\.pdf$/i, ''), slipStores_(DIRECTORY));
      if (!part) return { ok: false, message: 'No name could be read from the file name. Nothing was saved.' };
      if (person.alias) return { ok: false, message: person.name + ' already has a Payment Slip Name Alias ("' + person.alias + '"). It was not changed.' };
      if (slipFindPeople_(part, DIRECTORY).people.length) return { ok: false, message: '"' + part + '" already matches someone in the Staff Directory, so it is not remembered.' };
      person.alias = part;
      return { ok: true, alias: part, message: 'Remembered "' + part + '" as ' + person.name + '\'s slip name. (Preview only: nothing was saved.)' };
    },

    getDocumentUrl() { return null; },
    getSheetUrl() { return null; },
    sendPreview(args) {
      const period = configValue('Current Payout Month') + ' ' + configValue('Current Payout Year');
      const m = month(period);
      const isTest = testMode || args.test === true;
      const ready = m.employees.filter((e) => e.status === 'Ready' && e.verified && !e.issue);
      return { ok: true, period, branch: 'both branches', isTest, canProceed: ready.length > 0, sender: 'sender@example.com', globalBlockers: [],
        willSend: ready.map((e) => ({ name: e.name, employeeId: e.id, to: isTest ? 'test-inbox@example.com' : dir(e.id).email, intended: dir(e.id).email })),
        cannotSend: m.employees.filter((e) => !ready.includes(e) && e.status !== 'Sent').map((e) => ({ name: e.name, reason: e.issue || 'Manager Verified not ticked.' })),
        alreadySent: m.employees.filter((e) => e.status === 'Sent').map((e) => ({ name: e.name })),
        text: ready.length ? 'WILL SEND (' + ready.length + ')' : 'Nobody is ready to send.' };
    },
    sendEmails(args) {
      const rep = this.sendPreview(args);
      if (rep.willSend.length !== args.count) fail('The list changed since you looked. Look at it again, then send. Nothing was sent.');
      if (!rep.isTest) {
        const m = month(rep.period);
        rep.willSend.forEach((w) => { const e = m.employees.find((x) => x.id === w.employeeId); e.status = 'Sent'; e.pdf = 'Sent'; e.canEdit = false; });
      }
      return { isTest: rep.isTest, sent: rep.willSend.length,
        text: 'Preview only: no email was sent. ' + rep.willSend.length + (rep.isTest ? ' test' : ' LIVE') + ' email(s) would have gone.' };
    },

    checkSystem() {
      return { period: configValue('Current Payout Month') + ' ' + configValue('Current Payout Year'), canPrepare: true,
        findings: [{ stage: 'quality', level: 'warn', title: 'Test Mode is ' + (testMode ? 'ON' : 'OFF'), detail: 'Preview: invented result.' }],
        note: 'Gmail permission and who may send are checked by Check System in the spreadsheet.' };
    },
    planIdFills() {
      return { period: 'October 2026', items: [{ row: 12, name: 'Rina Kaur', current: '', proposed: 'MCH-030' }],
        refusals: [{ label: 'Row 20 (Rina K.)', reason: 'Not in the Staff Directory under this name.' }] };
    },
    applyIdFills(args) { return { applied: args.rows.length, skipped: 0, message: 'Preview only: ' + args.rows.length + ' Employee ID filled in this browser tab. The sheet was not changed.' }; },
    deleteMonthTab(args) {
      if (args.typed !== args.period) fail('Type the tab\'s name exactly ("' + args.period + '") to delete it.');
      if (args.period === 'September 2026') fail('"September 2026" was made by hand, not by the Jibble menu, so it is not deleted from here. Nothing was deleted.');
      if (month(args.period).employees.some((e) => e.payment === 'Paid')) fail('"' + args.period + '" has people marked Paid, so it is not deleted. Nothing was deleted.');
      PERIODS.splice(PERIODS.indexOf(args.period), 1);
      delete months[args.period];
      return { message: 'Preview only: "' + args.period + '" was deleted in this browser tab. The spreadsheet was not changed.' };
    },

    runPreparePayout() { return { ok: false, preview: true, message: 'Preview: Prepare Payout did not run. When connected, this runs the existing Prepare Payout. It never sends an email.' }; }
  };
})();
