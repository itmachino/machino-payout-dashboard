/*
 * selftest.js — clicks through the dashboard in PREVIEW mode (invented
 * data) and checks what appears. Loaded only by index.html?selftest=1
 * when no apiUrl is set. Results go to document.title and #selftest-out:
 *   "SELFTEST PASS 52/52"  or  "SELFTEST FAIL …"
 * Run headless: node scripts/test-dashboard-ui.js
 */
(async function () {
  'use strict';
  const P = window.__payout;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const results = [];
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message || e.reason)));

  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail === undefined ? '' : detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms) {
    const end = Date.now() + (ms || 4000);
    while (Date.now() < end) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(40); }
    return false;
  }
  const input = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const change = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const person = (id) => P.data.employees.find((e) => e.id === id);
  async function go(hash, title) {
    location.hash = hash;
    return until(() => $('#view h1') && $('#view h1').textContent === title && !P.state.loading);
  }

  try {
    // 1. Overview
    check('overview loads', await until(() => P.data && $('#view h1') && $('#view h1').textContent === 'Overview'));
    check('TEST MODE badge from the backend', $('.mode-pill') && $('.mode-pill').textContent === 'TEST MODE');
    check('no LIVE strip in Test Mode', !$('.live-strip'));
    check('5 missing slips on the overview', P.data.summary.all.missingSlips === 5, P.data.summary.all.missingSlips);
    check('attention list shows people', $$('.att-row').length >= 4, $$('.att-row').length);

    // 2. Payroll Management
    check('payroll page opens', await go('#payroll', 'Payroll Management'));
    check('12 employees listed', $$('.emp-table tbody tr').length === 12, $$('.emp-table tbody tr').length);
    check('store totals shown', $$('.store-totals > div').length === 3);
    input($('#pm-q'), 'tan');
    check('search by name', await until(() => $$('.emp-table tbody tr').length === 1), $$('.emp-table tbody tr').length);
    input($('#pm-q'), 'mch-02');
    check('search by Employee ID', await until(() => $$('.emp-table tbody tr').length === 4), $$('.emp-table tbody tr').length);
    input($('#pm-q'), '');
    await until(() => $$('.emp-table tbody tr').length === 12);
    $('[data-status-tile="slip"]').click();
    check('missing-slip filter', $$('.emp-table tbody tr').length === 5, $$('.emp-table tbody tr').length);
    $('[data-status-tile="all"]').click();

    // 2b. Manager Verified: one person at a time, never "all"
    check('no "verify all" header box', !$('[data-verify-all]'));
    check('no "verify shown" button', !$('[data-action="verify-shown"]'));
    const box = () => $('[data-verify="MCH-024"]');
    change(box(), '');
    check('ticking one asks first, for that one person', await until(() => $('#verify-dialog').open && /Verify Arjun/.test($('#verify-title').textContent) && $$('#verify-list li').length === 1));
    $('#verify-dialog').close();
    check('cancel leaves it unticked', await until(() => box() && !box().checked && person('MCH-024').verified === false));
    box().checked = true; change(box(), '');
    await until(() => $('#verify-dialog').open);
    $('#verify-go').click();
    check('confirmed tick saved', await until(() => person('MCH-024').verified === true && box() && box().checked));
    check('Sent people have no tick box', !$('[data-verify="MCH-011"]'));
    check('blank Total Payout cannot be ticked', $('[data-verify="MCH-017"]').disabled);
    let refusedMany = false;
    try { window.DashboardPreview.setVerified({ period: 'October 2026', verified: true, people: [{ employeeId: 'MCH-019' }] }); } catch (e) { refusedMany = true; }
    check('backend refuses a list of people', refusedMany);

    // 2c. Review one by one without going back to the table
    $('[data-action="start-review"]').click();
    const firstToCheck = P.data.employees.filter((e) => e.status !== 'Sent' && e.total != null && !e.verified)
      .sort((x, y) => x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1)[0];
    check('"Review one by one" opens the first person still to check', await until(() => P.state.openId === firstToCheck.id), P.state.openId + ' vs ' + firstToCheck.id);
    check('panel shows where you are', /Person \d+ of 12/.test($('.review-bar').textContent));
    const at = P.state.openId;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    check('→ key moves to the next person', await until(() => P.state.openId && P.state.openId !== at));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    check('← key moves back', await until(() => P.state.openId === at));
    $('#verify-next').click();
    check('"Verify and next" verifies this person', await until(() => person(at).verified === true));
    check('… and opens the next person', await until(() => P.state.openId && P.state.openId !== at && $('#drawer-title')));
    $('[data-edit="payout"]').click();
    await until(() => $('#f-com'));
    check('verify is disabled while editing', !$('#verify-next') || $('#verify-next').disabled);
    const atEdit = P.state.openId;
    $('#f-com').blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(200);
    check('arrow keys do nothing while editing', P.state.openId === atEdit);
    $('[data-action="cancel-edit"]').click();
    $('#drawer-close').click();
    await until(() => !$('.drawer'));

    // 3. Edit payout: claims list, validation, save
    $('.name-btn[data-open="MCH-001"]').click();
    check('drawer opens', await until(() => $('#drawer-title') && $('#drawer-title').textContent.startsWith('Siti')));
    check('hours are read-only (no Correct hours button)', !$('[data-edit="hours"]'));
    const before = person('MCH-001').total;
    $('[data-edit="payout"]').click();
    check('payout editor opens', await until(() => $('#f-com')));
    check('existing claim kept', $('#claims-t-0') && $('#claims-t-0').value === 'Transport');
    $('[data-add-row="claims"]').click();
    await until(() => $('#claims-t-1'));
    input($('#claims-t-1'), 'Meal');
    input($('#claims-a-1'), 'abc');
    check('bad amount blocks saving', $('#save-btn').disabled && !$('#draft-problem').hidden);
    input($('#claims-a-1'), '10');
    check('good amount allows saving', !$('#save-btn').disabled);
    check('Paid warning shown while editing', /Already marked Paid/.test($('#d-payout').textContent));
    $('#save-btn').click();
    check('saved: total recalculated by the "sheet"', await until(() => person('MCH-001').total === 'RM 1,915.14'), person('MCH-001').total + ' (before ' + before + ')');
    check('prepared payout now needs Prepare again', person('MCH-001').status === 'Needs Attention');
    check('Manager Verified cleared by the change', person('MCH-001').verified === false);

    // 4. Payment Status, ID, Date
    await until(() => $('[data-edit="payment"]'));
    $('[data-edit="payment"]').click();
    check('payment editor opens', await until(() => $('#f-pid')));
    input($('#f-pid'), 'TRX-TEST-1');
    input($('#f-pdate'), '2026-10-26');
    $('#save-btn').click();
    check('Payment ID and Date saved', await until(() => person('MCH-001').paymentId === 'TRX-TEST-1' && person('MCH-001').paymentDate === '2026-10-26'));

    // 5. Email preview
    await until(() => $('#drawer [data-email="MCH-001"]'));
    $('#drawer [data-email="MCH-001"]').click();
    check('email preview opens', await until(() => $('#email-body .email-text')));
    check('subject is the TEST subject', /\[TEST\] Your payout for October 2026/.test($('#email-body').textContent));
    check('preview is labelled as a design preview', /Design preview/.test($('#email-body').textContent));
    check('both attachments listed', $$('#email-body .doc-row').length === 2);
    $('#email-dialog').close();
    $('#drawer-close').click();
    check('drawer closes', await until(() => !$('.drawer')));

    // 6. Bulk slip upload
    check('slips page opens', await go('#slips', 'Payment Slips'));
    $('[data-action="slips-sample"]').click();
    check('sample files planned', await until(() => P.state.slips.plan && P.state.slips.plan.rows.length === 8 && !P.state.slips.planning), JSON.stringify(P.state.slips.error || (P.state.slips.plan && P.state.slips.plan.rows.length)));
    const st = (name, n) => P.state.slips.plan.rows.filter((r) => r.name === name)[n || 0];
    check('"SS18 Nur Aina - …" matched', st('SS18 Nur Aina - Retail Wages October 2026.pdf').employeeId === 'MCH-003');
    check('same file twice → DUPLICATE', st('SS18 Nur Aina - Retail Wages October 2026.pdf', 1).status === 'DUPLICATE');
    check('alias "Aiman" matched', st('Aiman - payslip.pdf').employeeId === 'MCH-009');
    check('"Nuradila" (no spaces) matched', st('Nuradila - Oct.pdf').employeeId === 'MCH-027');
    check('"Nur" is ambiguous → pick', st('Nur - slip.pdf').status === 'NEEDS_PICK');
    check('September file refused', st('Hafiz Rahman September 2026.pdf').status === 'WRONG_MONTH');
    check('existing slip → CONFLICT', st('Siti - Retail Wages.pdf').status === 'CONFLICT');
    check('.docx refused', st('bank notes.docx').status === 'NOT_PDF');
    check('target name is the standard name', st('Aiman - payslip.pdf').target === 'SS18 Muhammad Aiman Hakim bin Rosli - Retail Wages and Commission for October 2026 Payment Slip.pdf');
    // Nadia Syifa (not linked to the Staff Directory yet) has no slip either, so two are still missing.
    check('missing list: 2 left (Hafiz and the unlinked Nadia)', P.state.slips.plan.missing.length === 2 && P.state.slips.plan.missing.some((x) => x.id === 'MCH-017'));
    const key = P.state.slips.files.find((f) => f.name === 'Nur - slip.pdf').key;
    change($('#pick-' + key), 'MCH-017');
    check('manual pick makes it ready', await until(() => !P.state.slips.planning && st('Nur - slip.pdf').status === 'READY' && st('Nur - slip.pdf').employeeId === 'MCH-017'));
    check('only the unlinked person is missing after the picks', P.state.slips.plan.missing.length === 1 && /nadia/i.test(P.state.slips.plan.missing[0].name));
    check('save button counts 4', /Save 4 slips/.test($('[data-action="slips-save"]').textContent));
    $('[data-action="slips-save"]').click();
    check('save confirmation lists 4', await until(() => $('#slip-save-dialog').open && $$('#slip-save-list li').length === 4));
    $('#slip-save-go').click();
    check('4 slips saved', await until(() => P.state.slips.result && P.state.slips.result.saved.length === 4, 6000));
    check('blocked files stay; the duplicate of a saved file goes', await until(() => P.state.slips.files.length === 3 && !P.state.slips.planning));
    check('dashboard now shows 1 missing slip (Nadia)', await until(() => P.data.summary.all.missingSlips === 1), P.data.summary.all.missingSlips);

    // 7. Test Mode switch
    check('settings opens', await go('#settings', 'Settings'));
    $('#test-switch').click();
    check('turning OFF asks first', await until(() => $('#test-dialog').open));
    input($('#test-confirm'), 'LIV');
    check('needs the exact word LIVE', $('#test-off-go').disabled);
    input($('#test-confirm'), 'LIVE');
    check('LIVE enables the button', !$('#test-off-go').disabled);
    $('#test-off-go').click();
    check('Test Mode OFF read back', await until(() => P.data.testMode === false && $('#tm-title').textContent === 'Test Mode is OFF'));
    check('LIVE is the normal setting: no warning strip, no LIVE badge (owner)', !$('.live-strip') && !$('.mode-pill'));
    var refused = false;
    try { window.DashboardPreview.setTestMode({ on: false }); } catch (e) { refused = true; }
    check('backend refuses OFF without LIVE', refused);
    $('#test-switch').click();
    check('turning ON needs no typing', await until(() => P.data.testMode === true && !$('.live-strip')));

    // 7b. Configuration editing
    $('[data-action="cfg-edit"]').click();
    check('settings become editable', await until(() => $$('[data-cfg]').length >= 10));
    check('the senders and store scope are editable; Test Mode stays on its switch', !!$('[data-cfg="Authorized Sender Email"]') &&
      !!$('[data-cfg="Authorized Operator Emails"]') && !!$('[data-cfg="Payout Store Scope"]') && !$('[data-cfg="Test Mode"]'));
    input($('[data-cfg="Authorized Sender Email"]'), 'a@example.com, not-an-email');
    check('a bad address in the Authorized Sender list blocks saving', await until(() => $('#cfg-save').disabled && /separated by commas/.test($('#cfg-problem').textContent)));
    input($('[data-cfg="Authorized Sender Email"]'), 'sender@example.com');
    input($('[data-cfg="Sender Position"]'), 'Area Manager');
    input($('[data-cfg="Test Email"]'), 'not an email');
    check('bad email blocks saving', $('#cfg-save').disabled && !$('#cfg-problem').hidden);
    input($('[data-cfg="Test Email"]'), 'new-test@example.com');
    change($('[data-cfg="Current Payout Month"]'), 'November');
    check('3 changes counted', await until(() => /3 unsaved/.test($('#cfg-count').textContent) && !$('#cfg-save').disabled));
    $('#cfg-save').click();
    check('save shows old → new and the month warning', await until(() => $('#cfg-dialog').open && $$('#cfg-list li').length === 3 && !$('#cfg-month-note').hidden));
    $('#cfg-go').click();
    check('settings saved and read back', await until(() => !P.state.cfg.editing && P.data.config.find((r) => r.label === 'Sender Position').value === 'Area Manager'));
    refused = false;
    try { window.DashboardPreview.saveConfiguration({ changes: { 'Authorized Sender Email': 'x@example.com, nope' } }); } catch (e) { refused = true; }
    check('backend refuses a bad Authorized Sender address', refused);

    // 8. Link an unmatched Jibble person
    check('Jibble page opens', await go('#checks', 'Jibble & Documents'));
    const sel = $('[data-link="IOI|IOI-0299"]');
    check('already-linked people cannot be picked', sel.querySelector('option[value="MCH-014"]').disabled);
    change(sel, 'MCH-030');
    $('[data-link-go="IOI|IOI-0299"]').click();
    check('link asks first', await until(() => $('#link-dialog').open && /IOI-0299/.test($('#link-body').textContent)));
    $('#link-go').click();
    check('linked: 1 unmatched left', await until(() => P.data.jibble.unmatched.length === 1));
    refused = false;
    try { window.DashboardPreview.linkJibblePerson({ store: 'IOI', jibbleId: 'IOI-0301', employeeId: 'MCH-014' }); } catch (e) { refused = true; }
    check('never overwrites an existing Jibble ID', refused);

    // 8b. Staff Directory: see and edit one person
    check('Staff Directory opens', await go('#staff', 'Staff Directory'));
    check('everyone active is listed', $$('.log tbody tr').length === P.data.staff.filter((s) => s.active).length);
    input($('#staff-q'), 'arjun');
    check('search narrows after typing pauses', await until(() => $$('.log tbody tr').length === 1));
    $('[data-staff-edit="MCH-024"]').click();
    check('edit opens with the current values', await until(() => $('#staff-dialog').open && $('#sf-name').value === 'Arjun a/l Pillai'));
    check('Employee ID is shown but not editable', !$('#sf-id') && /MCH-024/.test($('#staff-body').textContent));
    $('#sf-email').value = 'not an email';
    $('#staff-save').click();
    check('a bad email is refused, the window stays open', await until(() => !$('#staff-error').hidden && $('#staff-dialog').open));
    $('#sf-email').value = 'arjun.new@example.com';
    $('#sf-rate').value = '11.50';
    $('#staff-save').click();
    check('saved: new email and rate shown', await until(() => !$('#staff-dialog').open && /arjun\.new@example\.com/.test($('#view').textContent) && /RM 11\.50/.test($('#view').textContent)));
    refused = false;
    try { window.DashboardPreview.saveStaff({ employeeId: 'MCH-024', expected: {}, changes: { id: 'X' } }); } catch (e) { refused = true; }
    check('Employee ID can never be changed', refused);
    input($('#staff-q'), '');
    await sleep(250);

    // 8c. Add and delete people
    $('[data-action="staff-add"]').click();
    // Owner, 2026-11-03: the Employee ID is filled in with the next free number; store, email and rate are required.
    check('add opens a form with the next Employee ID filled in', await until(() => $('#staff-dialog').open && $('#sf-id') && $('#sf-id').value === P.data.staffNextId && P.data.staffNextId === '001'));
    $('#sf-name').value = 'Someone New';
    $('#staff-save').click();
    check('the store and Hourly Rate are required; the email is optional', await until(() => !$('#staff-error').hidden && /the store, the Hourly Rate/.test($('#staff-error').textContent) && !/email/.test($('#staff-error').textContent)));
    $('#sf-store').value = 'SS18'; $('#sf-email').value = 'someone.new@example.com'; $('#sf-rate').value = '9.50';
    $('#sf-id').value = 'MCH-024';
    $('#staff-save').click();
    check('an Employee ID already in use is refused', await until(() => !$('#staff-error').hidden && /already in the Staff Directory/.test($('#staff-error').textContent)));
    $('#sf-id').value = 'MCH-040';
    $('#staff-save').click();
    check('a new person is added and listed', await until(() => !$('#staff-dialog').open && P.data.staff.some((s) => s.id === 'MCH-040')));
    check('active people without a Jibble ID are flagged', /people have no Jibble ID/.test($('#view').textContent) && $$('.badge').some((b) => b.textContent === 'No Jibble ID'));
    $('[data-staff-edit="MCH-028"]').click();
    check('the Jibble ID box offers Jibble\'s unlinked names for that store', await until(() => $('#staff-dialog').open && $$('#sf-ioi-list option').length === 1 &&
      $$('#sf-ioi-list option').some((o) => o.value === 'IOI-0301' && /Adlina H/.test(o.textContent)) && $$('#sf-ss18-list option').length === 0));
    $('#staff-dialog').close();

    // 8c2. Hours, adding and removing someone in a month, Payout Control (owner, 2026-11-03)
    Object.assign(P.state.payroll, { q: '', store: 'all', status: 'all', pay: 'all' });
    check('payroll opens for the hours checks', await go('#payroll', 'Payroll Management'));
    $('[data-open="MCH-027"]').click();
    check('the hours can be edited for someone not Paid', await until(() => !!$('[data-edit="hours"]')));
    $('[data-edit="hours"]').click();
    await until(() => !!$('#f-hours'));
    input($('#f-hours'), '121'); input($('#f-rate'), '10.50');
    check('Wages is worked out as you type (121 × 10.50)', $('#f-wages').textContent === 'RM1,270.50', $('#f-wages').textContent);
    check('…with the Jibble warning', /filled from Jibble again/.test($('#drawer').textContent));
    $('[data-action="save-edit"]').click();
    check('saved: the new Wages and Total Payout are shown', await until(() => person('MCH-027').wages === 'RM 1,270.50' && !P.state.editing), person('MCH-027').wages);
    P.state.openId = null; P.renderDrawer();
    $('[data-open="MCH-024"]').click();
    check('someone marked Paid cannot have their hours changed', await until(() => /Arjun/.test($('#drawer').textContent)) && !$('[data-edit="hours"]') && !$('[data-action="remove-from-month"]'));
    P.state.openId = null; P.renderDrawer();
    $('[data-action="add-person"]').click();
    check('Add person asks: Staff Directory, or this month only', await until(() => $('#add-dialog').open && $$('[data-add-choice]').length === 2));
    $('[data-add-choice="month"]').click();
    check('this month only: only Staff Directory people not already on the month are offered', await until(() => !!$('#am-person')) &&
      $$('#am-person option').some((o) => o.value === 'MCH-030') && !$$('#am-person option').some((o) => o.value === 'MCH-001'));
    $('#add-save').click();
    check('the person, store and days are required', await until(() => /Choose the person/.test($('#add-body').textContent)));
    change($('#am-person'), 'MCH-030');
    check('the store comes from the Staff Directory', $('#am-store').value === 'IOI');
    change($('#am-date-0'), '2026-10-05'); input($('#am-hours-0'), '6');
    $('[data-add-day]').click();
    change($('#am-date-1'), '2026-10-06'); input($('#am-hours-1'), '7.5');
    check('the total hours add up as you type', /2 days · 13\.50 hours/.test($('#am-total').textContent), $('#am-total').textContent);
    $('#add-save').click();
    check('added to this month and listed', await until(() => !$('#add-dialog').open && !!person('MCH-030') && person('MCH-030').hours === '13.50'));
    $('[data-open="MCH-030"]').click();
    await until(() => !!$('[data-action="remove-from-month"]'));
    $('[data-action="remove-from-month"]').click();
    await until(() => $('#confirm-dialog').open);
    input($('#confirm-word'), 'REMOVE');
    $('#confirm-go').click();
    check('removing needs REMOVE typed, then they are gone from the month (still in the Staff Directory)', await until(() => !person('MCH-030')) &&
      P.data.staff.some((s) => s.id === 'MCH-030'));
    check('Payout Control opens', await go('#control', 'Payout Control'));
    check('it lists the prepared people with their status and Manager Verified', await until(() => $$('#view table.log tbody tr').length >= 8) &&
      /Ready to send\?/.test($('#view').textContent) && !!$('#view a[href="#send"]'));
    $('#pc-status').value = 'Sent'; $('#pc-status').dispatchEvent(new Event('change', { bubbles: true }));
    check('filtered by status', await until(() => $$('#view table.log tbody tr').length === 2), $$('#view table.log tbody tr').length);
    check('Overview offers the next step as one button', await go('#overview', 'Overview') && /Next step:/.test(($('#next-step-go') || {}).textContent || ''));
    // The month's steps are readable (a loading-bar style once squashed them to a thin line).
    check('the month\'s steps show their names and open their pages', $$('ol.progress li').length === 9 &&
      $('ol.progress').getBoundingClientRect().height > 20 && !!$('ol.progress a[href="#slips"]'), $('ol.progress') && $('ol.progress').getBoundingClientRect().height);
    // 8c3. Needs fixing (owner, 2026-11-03): who has no pay yet, why, and a fix for each
    check('Overview says how many people need fixing', await go('#overview', 'Overview') && /people need fixing/.test($('#view').textContent));
    $('[data-goto-fix]').click();
    check('it leads to the Needs fixing list on Payroll Management', await until(() => !!$('#needs-fixing') && $('#view h1').textContent === 'Payroll Management'));
    const fxNames = () => $$('.fx-row .fx-who strong').map((x) => x.textContent);
    check('the unlinked person is first, then the others, each with the reason', fxNames()[0] === 'Nadia Syifa' && fxNames().includes('Hafiz Rahman bin Yusof') &&
      fxNames().includes('Muhammad Aiman Hakim bin Rosli') && /No Hourly Rate/.test($('#needs-fixing').textContent) && /without a clock-out/.test($('#needs-fixing').textContent), fxNames().join());
    check('the likely person is offered as a question with a first-name warning; nothing is written yet', /Is this the same person\?/.test($$('.fx-row')[0].textContent) &&
      /Nadia Nursyifaa binti Mohd Nizam/.test($$('.fx-row')[0].textContent) && /Same first name only/.test($$('.fx-row')[0].textContent) && !!person('name:nadia syifa'));

    // The Staff Directory warns about the same gaps, and can show just those people.
    check('Staff Directory opens for the warnings', await go('#staff', 'Staff Directory'));
    check('it warns about no email and no hourly rate', /1 person has no email/.test($('#view').textContent) && /1 person has no hourly rate/.test($('#view').textContent), $('.notice') && $('.notice').textContent);
    $('[data-seg="staff-issue"][data-value="noemail"]').click();
    check('"Show them" lists just that person', await until(() => $$('table.log tbody tr').length === 1 && /Muhammad Aiman/.test($('table.log tbody').textContent)));
    $('[data-seg="staff-issue"][data-value="all"]').click();
    await until(() => $$('table.log tbody tr').length > 5);

    // The Send Center lets an email be added where a person is held for not having one.
    check('Send Center opens', await go('#send', 'Send Center'));
    check('someone with no email is held, with a box to add it right there', !!$('#fx-email-MCH-009') && /Send Center/.test($('#view h1').textContent));
    check('Payroll opens again', await go('#payroll', 'Payroll Management'));

    // "None of these": add them as new staff, with the name filled in.
    $('[data-fx-addnew="name:nadia syifa"]').click();
    check('"add as new staff" opens the form with their name and store filled in', await until(() => $('#staff-dialog').open && $('#sf-name').value === 'Nadia Syifa' && $('#sf-store').value === 'IOI'));
    $('#staff-dialog').close();

    // Linking: asked first, and only on yes.
    $('[data-fx-link^="name:nadia syifa|"]').click();
    check('"Is this the right person?" shows both names and asks first', await until(() => $('#confirm-dialog').open && /Is this the right person/.test($('#confirm-title').textContent) &&
      /Nadia Syifa/.test($('#confirm-body').textContent) && /Nadia Nursyifaa binti Mohd Nizam/.test($('#confirm-body').textContent) && /Only the first name is the same/.test($('#confirm-body').textContent)));
    $('#confirm-dialog').close();
    check('no: nothing changes', await until(() => !$('#confirm-dialog').open) && !!person('name:nadia syifa') && !person('MCH-031'));
    $('[data-fx-link^="name:nadia syifa|"]').click();
    await until(() => $('#confirm-dialog').open);
    $('#confirm-go').click();
    check('yes: linked to the Staff Directory person, wages worked out (56 h × RM9.50), their Jibble ID saved', await until(() => !!person('MCH-031') && !person('name:nadia syifa') &&
      person('MCH-031').total === 'RM 532.00' && P.data.staff.find((s) => s.id === 'MCH-031').ioi === 'IOI-0399'), person('MCH-031') && person('MCH-031').total);
    check('they are off the Needs fixing list', await until(() => !fxNames().includes('Nadia Syifa') && !fxNames().includes('Nadia Nursyifaa binti Mohd Nizam')));

    // A missing rate typed right in the list.
    input($('#fx-rate-MCH-017'), 'ten');
    $('[data-fx-rate="MCH-017"]').click();
    check('a bad rate is refused with a message', await until(() => !!$('.toast, [role="status"]') && /amount like 10 or 10\.50/.test(document.body.textContent)));
    input($('#fx-rate-MCH-017'), '11');
    $('[data-fx-rate="MCH-017"]').click();
    check('a typed rate saves to the Staff Directory and works out the wages (152 h × RM11)', await until(() => person('MCH-017').wages === 'RM 1,672.00' && !fxNames().includes('Hafiz Rahman bin Yusof') &&
      P.data.staff.find((s) => s.id === 'MCH-017').rate === '11'), person('MCH-017').wages);

    // An email typed for someone who has none.
    input($('#fx-email-MCH-009'), 'not an email');
    $('[data-fx-email="MCH-009"]').click();
    check('a bad email is refused', await until(() => /full email address/.test(document.body.textContent)) && P.data.staff.find((s) => s.id === 'MCH-009').email === '');
    input($('#fx-email-MCH-009'), 'aiman.new@example.com');
    $('[data-fx-email="MCH-009"]').click();
    check('an email is saved to the Staff Directory, and only the clock-out problem is left for them', await until(() => P.data.staff.find((s) => s.id === 'MCH-009').email === 'aiman.new@example.com' &&
      !!$('#needs-fixing') && !/No email address/.test($('#needs-fixing').textContent) && /without a clock-out/.test($('#needs-fixing').textContent)));
    // A day with no clock-out: pay worked out from the hours there are, after asking.
    check('someone with a missing clock-out and no wages is offered "Work out pay", with the days named', !!$('[data-fx-pay="MCH-009"]') && /two|2 days? without a clock-out/.test($('#needs-fixing').textContent));
    $('[data-fx-pay="MCH-009"]').click();
    check('it asks first: hours × rate = pay, and which days are NOT included', await until(() => $('#confirm-dialog').open && /Work out Muhammad/.test($('#confirm-title').textContent) &&
      /RM1,425\.00/.test($('#confirm-body').textContent) && /Not included/.test($('#confirm-body').textContent) && /14 Oct/.test($("#confirm-body").textContent)), $('#confirm-body') && $('#confirm-body').textContent);
    $('#confirm-dialog').close();
    check('no: nothing changes', await until(() => !$('#confirm-dialog').open) && person('MCH-009').wages === null);
    $('[data-fx-pay="MCH-009"]').click();
    await until(() => $('#confirm-dialog').open);
    $('#confirm-go').click();
    check('yes: the pay is worked out (150 h × RM9.50), the message names the days left out, and they leave the list', await until(() => person('MCH-009').wages === 'RM 1,425.00' && !fxNames().includes('Muhammad Aiman Hakim bin Rosli') &&
      !!P.state.toast && /NOT included/.test(P.state.toast.text)), person('MCH-009').wages);
    check('back to the Staff Directory', await go('#staff', 'Staff Directory'));
    $('[data-staff-edit="MCH-001"]').click();
    await until(() => $('#staff-dialog').open);
    $('#staff-delete').click();
    await until(() => $('#confirm-dialog').open);
    input($('#confirm-word'), 'DELETE');
    $('#confirm-go').click();
    check('someone on this month\'s payroll cannot be deleted', await until(() => /cannot be deleted now/.test($('#view').textContent)) && P.data.staff.some((s) => s.id === 'MCH-001'));
    $('[data-staff-edit="MCH-040"]').click();
    await until(() => $('#staff-dialog').open);
    $('#staff-delete').click();
    await until(() => $('#confirm-dialog').open);
    $('#confirm-go').click();
    check('delete needs the word DELETE', await until(() => /DELETE was not typed/.test($('#view').textContent)) && P.data.staff.some((s) => s.id === 'MCH-040'));
    $('[data-staff-edit="MCH-040"]').click();
    await until(() => $('#staff-dialog').open);
    $('#staff-delete').click();
    await until(() => $('#confirm-dialog').open);
    input($('#confirm-word'), 'DELETE');
    $('#confirm-go').click();
    check('a person not on the payroll is deleted', await until(() => !P.data.staff.some((s) => s.id === 'MCH-040')), (P.state.toast && P.state.toast.text) + ' | word=' + ($('#confirm-word') && $('#confirm-word').value));

    // 8d. Slips already in Drive: see them all, rename to the standard name
    check('Payment Slips opens', await go('#slips', 'Payment Slips'));
    $('[data-action="drive-load"]').click();
    check('every file in the folder is listed with an Open link', await until(() => P.state.slips.drive && P.state.slips.drive.rows &&
      $$('#view a.fname').length === P.state.slips.drive.rows.length && P.state.slips.drive.rows.length >= 8));
    check('a messy name is offered for renaming', /Arjun - payslip Oct\.pdf/.test($('#view').textContent) && $$('[data-drive-choose]').length === 1,
      P.state.slips.drive.rows.map((r) => r.name + '=' + r.state + (r.reason ? ' (' + r.reason + ')' : '')).join(' | '));
    check('a file nobody matches asks for the person', !!$('[data-drive-pick]'));
    change($('[data-drive-pick]'), 'MCH-028');
    check('picking the person offers it for renaming too', await until(() => $$('[data-drive-choose]').length === 2));
    $('[data-action="drive-rename"]').click();
    check('renaming asks first, showing old → new', await until(() => $('#confirm-dialog').open && /→/.test($('#confirm-body').textContent)));
    $('#confirm-go').click();
    check('renamed: the files now have the standard names', await until(() => $$('[data-drive-choose]').length === 0 && /IOI Arjun al Pillai - Retail Wages and Commission for October 2026 Payment Slip\.pdf/.test($('#view').textContent)));

    // 8e. Start a month
    check('Jibble page opens again', await go('#checks', 'Jibble & Documents'));
    check('the next month is offered', $('#ms-month').value === '2026-11' && /Set up November 2026/.test($('[data-action="month-setup"]').textContent));
    $('[data-action="month-setup"]').click();
    check('setting up a month asks first, with the Staff Directory question the menu asks', await until(() => $('#confirm-dialog').open && /November 2026/.test($('#confirm-body').textContent)) &&
      /Also fill in the Staff Directory/.test($('#confirm-body').textContent) && /Nur Adlina/.test($('#confirm-body').textContent) && $('#ms-dir').checked);
    $('#confirm-go').click();
    check('November 2026 is set up and opened', await until(() => P.data.period === 'November 2026' && P.data.periods.includes('November 2026') && !P.state.loading, 6000));
    check('the Jibble ID shown was filled into the Staff Directory', P.data.staff.find((s) => s.id === 'MCH-028').ioi === 'IOI-0301');
    await until(() => $('#confirm-dialog').open);
    $('#confirm-dialog').close();
    check('filling November again needs "replace"', await go('#checks', 'Jibble & Documents') && (change($('#ms-month'), '2026-11'), await until(() => !!$('#ms-replace'))));

    // 8e2. Update a month from Jibble, keeping what was typed (owner, 2026-11-03)
    check('the Jibble page offers to update November, keeping what was typed', /Update November 2026 from Jibble/.test($('#view').textContent) && /keeps what you typed/.test($('#view').textContent));
    $('[data-action="refill-plan"]').click();
    check('"Check what would change" lists everyone, hours before and after, and changes nothing', await until(() => !!P.state.refill.plan && P.state.refill.plan.people.length >= 11) &&
      P.state.refill.plan.blockers.length === 0 && !$('[data-action="refill-go"]').disabled && /Hours from Jibble/.test($('#view').textContent));
    $('[data-action="refill-go"]').click();
    check('updating asks for the word UPDATE', await until(() => $('#confirm-dialog').open && /Type UPDATE/.test($('#confirm-body').textContent)));
    input($('#confirm-word'), 'UPDATE');
    $('#confirm-go').click();
    check('updated: the month reloads, the preview resets and the message says what to do', await until(() => P.state.refill.plan === null && !P.state.loading && !!P.state.toast && /Updated from Jibble/.test(P.state.toast.text), 6000));
    await P.load('October 2026', { full: true });
    check('October has people marked Paid, so it cannot be updated, and the page says why', await go('#checks', 'Jibble & Documents') && ($('[data-action="refill-plan"]').click(), await until(() => !!P.state.refill.plan)) &&
      P.state.refill.plan.blockers.length === 1 && /marked Paid/.test($('#view').textContent) && $('[data-action="refill-go"]').disabled);
    await P.load('November 2026', { full: true });
    check('back on November', await go('#checks', 'Jibble & Documents'));

    // 8f. Tools: the spreadsheet's menus
    check('Tools opens', await go('#tools', 'Tools'));
    check('every menu item is listed', ['Check System', '1. Prepare Payout', '2. Review Payouts', '3. Test Payout Email', '4. Pre-Send Check',
      '5. Send Ready Employees', 'Setup & Repair', 'Delete a month tab'].every((x) => $('#view').textContent.includes(x)));
    $('[data-action="tool-check"]').click();
    check('Check System runs and shows its findings', await until(() => /Ready to prepare/.test($('#view').textContent)));
    $('[data-action="tool-ids"]').click();
    check('the Employee-ID fill is shown first, nothing written', await until(() => $('[data-id-fill="12"]') && /Rina Kaur/.test($('#view').textContent)));
    change($('#dm-month'), 'November 2026');
    $('[data-action="tool-delete-month"]').click();
    await until(() => $('#confirm-dialog').open);
    input($('#confirm-word'), 'November');
    $('#confirm-go').click();
    check('a month tab is not deleted without its exact name', await until(() => /Type the tab/.test($('#view').textContent)) && P.data.periods.includes('November 2026'));
    $('[data-action="tool-delete-month"]').click();
    await until(() => $('#confirm-dialog').open);
    input($('#confirm-word'), 'November 2026');
    $('#confirm-go').click();
    check('a Jibble-made month with nobody Paid is deleted', await until(() => !P.data.periods.includes('November 2026') && !P.state.loading, 6000));

    // 9. Send Center: 3. Test Payout Email and 5. Send Ready Employees (owner, 2026-10-27)
    window.DashboardPreview.saveConfiguration({ changes: { 'Current Payout Month': 'October', 'Current Payout Year': '2026' } });
    await P.load('October 2026', { full: true });
    check('send center opens', await go('#send', 'Send Center'));
    check('both send buttons are on the page', !!$('[data-action="send-test"]') && !!$('[data-action="send-live"]'));
    $('[data-action="send-test"]').click();
    check('test emails: the list and the test inbox are shown first', await until(() => $('#confirm-dialog').open && /test inbox/.test($('#confirm-body').textContent)));
    $('#confirm-go').click();
    check('test emails: the result is shown', await until(() => $('#confirm-dialog').open && /Test emails done/.test($('#confirm-title').textContent)));
    $('#confirm-dialog').close();
    window.DashboardPreview.setTestMode({ on: false, confirm: 'LIVE' });
    await P.load('October 2026', { full: true });
    await go('#send', 'Send Center');
    const readyBefore = P.data.employees.filter((e) => e.status === 'Ready' && e.verified && !e.issue).length;
    $('[data-action="send-live"]').click();
    check('LIVE: the red confirmation opens with the recipients', await until(() => $('#live-dialog').open && $$('#live-list li').length === readyBefore));
    input($('#live-confirm'), 'SEND');
    check('LIVE: the button stays off until SEND <number> is typed', $('#live-send').disabled);
    input($('#live-confirm'), 'SEND ' + readyBefore);
    check('LIVE: typing SEND <number> enables it', !$('#live-send').disabled);
    $('#live-send').click();
    check('LIVE: sent, and those people are now Sent', await until(() => $('#confirm-dialog').open && /Sending done/.test($('#confirm-title').textContent) &&
      P.data.employees.filter((e) => e.status === 'Ready' && e.verified && !e.issue).length === 0, 6000));
    $('#confirm-dialog').close();
    window.DashboardPreview.setTestMode({ on: true });
    const reload = P.load('October 2026', { full: true });
    // Owner, 2026-10-27: "the loading is not moving… add loading so the user understands".
    check('a full load shows a moving bar, what is happening and the seconds so far',
      !!$('.loading-card .load-bar') && /Connecting/.test($('#loading-hint').textContent) && /\d+ s/.test($('#loading-time').textContent) && $$('.skeleton').length === 3);
    check('the top bar shows while the server is asked', !$('#busy-bar').hidden);
    await reload;
    check('… and both go away when the data arrives', !$('.loading-card') && await until(() => $('#busy-bar').hidden));

    // 10. History and month switch
    check('history opens', await go('#history', 'History'));
    $('[data-seg="history-mode"][data-value="LIVE"]').click();
    check('LIVE filter', $$('.log tbody tr').length > 0 && $$('.log tbody tr').every((r) => /LIVE/.test(r.textContent)));
    check('payroll again', await go('#payroll', 'Payroll Management'));
    change($('#pm-month'), 'September 2026');
    check('September loads, everyone Sent', await until(() => P.data.period === 'September 2026' && !P.state.loading && P.data.employees.every((e) => e.status === 'Sent')));

    check('DEMO banner shown on every page', !$('#demo-banner').hidden && /not real payroll/.test($('#demo-banner').textContent) && /^DEMO/.test(document.title));
    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (err) {
    check('self-test crashed', false, err && err.stack || err);
  }

  const failed = results.filter((r) => !r.ok);
  const out = document.createElement('pre');
  out.id = 'selftest-out';
  out.textContent = results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : '')).join('\n');
  document.body.appendChild(out);
  document.title = (failed.length ? 'SELFTEST FAIL ' : 'SELFTEST PASS ') + (results.length - failed.length) + '/' + results.length;
})();
