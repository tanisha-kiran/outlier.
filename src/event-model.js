export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function httpsUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
export function completed(e, now = Date.now()) { return Boolean((e.ends_at || e.starts_at) && Date.parse(e.ends_at || e.starts_at) <= now); }
export function registrationState(e, now = Date.now()) {
  if (completed(e, now)) return 'Event Completed';
  if (e.registration_mode === 'closed' || (e.deadline && now >= Date.parse(e.deadline))) return 'Registration Closed';
  if (e.registration_mode === 'announced' || (e.registration_opens_at && now < Date.parse(e.registration_opens_at))) return 'Registration opens soon';
  return e.deadline && e.starts_at && ['native','external'].includes(e.registration_mode) ? 'Register' : 'Registration opens soon';
}
export function submissionOpen(e, now = Date.now()) { return Boolean(e.submission_opens_at && e.submission_deadline && now >= Date.parse(e.submission_opens_at) && now < Date.parse(e.submission_deadline)); }
export function splitEvents(events, now = Date.now()) {
  const published = events.filter(e => e.status === 'published' && e.is_community);
  return { upcoming: published.filter(e => !completed(e, now)).sort((a,b) => (Date.parse(a.starts_at)||Infinity)-(Date.parse(b.starts_at)||Infinity)), past: published.filter(e => completed(e, now)).sort((a,b) => Date.parse(b.ends_at||b.starts_at)-Date.parse(a.ends_at||a.starts_at)) };
}
export function ist(value) { return value ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST' : 'To be announced'; }
export function toIstInput(value) { return value ? new Date(Date.parse(value)+330*60000).toISOString().slice(0,16) : ''; }
export function fromIstInput(value) { return value ? new Date(value+':00+05:30').toISOString() : null; }
