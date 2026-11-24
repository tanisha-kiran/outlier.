export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function httpsUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
export function eventCoverUrl(event) {
 return event.slug === 'play-for-a-purpose' ? '/play-for-a-purpose-cover.png' : eventImageUrl(event.cover_url);
}
export function eventImageUrl(value) {
 const safe=httpsUrl(value); if(!safe)return '';
 const u=new URL(safe);
 if(u.hostname==='drive.google.com') {
  const id=u.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || u.searchParams.get('id');
  if(id && /^[a-zA-Z0-9_-]+$/.test(id))return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
 }
 return safe;
}
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

export function googleFormUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password && !url.port && ((url.hostname==='forms.gle' && url.pathname.length>1) || (url.hostname==='docs.google.com' && url.pathname.startsWith('/forms/'))) ? url.href : ''; } catch { return ''; }
}
export function submissionFormState(e,now=Date.now()) {
  if(!googleFormUrl(e.submission_form_url)) return 'Submission form coming soon';
  if(e.submission_deadline && now>=Date.parse(e.submission_deadline)) return 'Submissions closed';
  if(e.submission_opens_at && now<Date.parse(e.submission_opens_at)) return 'Submissions open soon';
  return 'Submit project on Google Forms';
}
