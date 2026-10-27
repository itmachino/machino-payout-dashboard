/*
 * config.js — the only setting the page has. It is public by nature
 * (anyone can see it in a browser), so it may live in GitHub.
 * Never put a password, token, email list or payroll data here.
 *
 *   apiUrl   the dashboard backend's web app URL (…/exec).
 *            Empty = DEMO with invented data, no sign-in.
 *            Set   = the password sign-in screen only, then real payroll.
 */
window.DASHBOARD_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbyAMo4NWn4g8GfVGXwxAlRGAYgPpjng3Rs8gH_Zn9IHk9pd-ed5ET0-KUYUsYh3v-3QNA/exec'
};
