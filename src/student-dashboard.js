import { client } from './onboarding.js';
import { escapeHtml as esc, completed, ist } from './event-model.js';

// A registration records intent to participate; it does not prove attendance.
export async function startStudentDashboard() {
  const main = document.querySelector('#event-main');
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw authError || new Error('Sign in required');
  const [profileResult, participantResult] = await Promise.all([
    client.from('profiles').select('full_name,college,usn,department,year').eq('id', user.id).single(),
    client.from('event_participants').select('event_id,consent_at').eq('user_id', user.id).order('consent_at', { ascending: false })
  ]);
  if (profileResult.error || participantResult.error) throw profileResult.error || participantResult.error;
  const profile = profileResult.data;
  const memberships = participantResult.data || [];
  let events = [];
  if (memberships.length) {
    const result = await client.from('events').select('id,slug,title,starts_at,ends_at,location,mode').in('id', memberships.map(m => m.event_id)).eq('status', 'published').eq('is_community', true);
    if (result.error) throw result.error;
    events = result.data || [];
  }
  const upcoming = events.filter(e => !completed(e)).sort((a,b)=>(Date.parse(a.starts_at)||Infinity)-(Date.parse(b.starts_at)||Infinity));
  const past = events.filter(e => completed(e)).sort((a,b)=>Date.parse(b.ends_at||b.starts_at)-Date.parse(a.ends_at||a.starts_at));
  const cards = (items, empty) => items.length ? `<div class="hub-grid">${items.map(e=>`<article class="hub-card"><span class="event-tag">REGISTERED</span><h3>${esc(e.title)}</h3><p>${esc(ist(e.starts_at))}<br>${esc(e.mode==='online'?'Online':e.location||'Venue to be announced')}</p><div class="event-actions"><a class="event-button" href="/events/${encodeURIComponent(e.slug)}">Event details</a><a class="event-button secondary" href="/events/${encodeURIComponent(e.slug)}/register">My registration</a></div></article>`).join('')}</div>` : `<p class="event-empty">${esc(empty)} <a href="/events">Explore events</a>.</p>`;
  const hidden = memberships.length - events.length;
  main.innerHTML = `<div class="event-hero"><span class="event-tag">YOUR STUDENT SPACE</span><h1>Welcome, ${esc(profile.full_name)}.</h1><p>Keep track of the OUTLIER events you’ve registered for.</p><div class="event-actions"><a class="event-button" href="/events">Explore events</a><button class="secondary" id="student-signout" type="button">Sign out</button></div></div><section class="event-panel"><h2>Student profile</h2><p>${esc(profile.college)}<br>${esc(profile.usn)} · ${esc(profile.department)} · Year ${esc(profile.year)}<br>${esc(user.email)}</p></section><section class="hub-section"><h2>Upcoming registrations</h2>${cards(upcoming,'You have no upcoming registrations yet.')}</section><section class="hub-section"><h2>Past registrations</h2><p class="event-muted">This shows events you registered for, not a verified attendance record.</p>${cards(past,'Your past registrations will appear here.')}</section>${hidden>0?'<p class="event-muted">Some registrations are unavailable because their event is no longer public. Contact the organizer for help.</p>':''}<p class="event-muted">Events registered for on external websites are not automatically included.</p>`;
  main.querySelector('#student-signout').onclick = async () => { await client.auth.signOut(); location.href='/events'; };
  const panel = main.querySelector('.event-panel');
  panel.insertAdjacentHTML('beforeend', `<details><summary>Edit student details</summary><form class="event-form" id="edit-student-profile"><label>Full name<input name="full_name" required minlength="2" maxlength="100" value="${esc(profile.full_name)}"></label><label>College or university<input name="college" required minlength="2" maxlength="160" value="${esc(profile.college)}"></label><label>Student ID / USN<input name="usn" required minlength="3" maxlength="30" value="${esc(profile.usn)}"></label><label>Department<input name="department" required maxlength="80" value="${esc(profile.department)}"></label><label>Year<select name="year" required>${[1,2,3,4].map(y=>`<option value="${y}" ${y===profile.year?'selected':''}>${y}</option>`).join('')}</select></label><p role="status" id="profile-message"></p><button type="submit">Save details</button></form></details>`);
  const form = panel.querySelector('#edit-student-profile');
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form), button=form.querySelector('button'), message=form.querySelector('#profile-message');
    const values={full_name:data.get('full_name').trim(),college:data.get('college').trim(),usn:data.get('usn').trim().toUpperCase(),department:data.get('department').trim(),year:Number(data.get('year'))};
    if (values.full_name.length<2 || values.college.length<2 || values.usn.length<3 || !values.department) { message.textContent='Please fill in all student details.'; return; }
    button.disabled=true;
    try {
      const {error}=await client.from('profiles').update(values).eq('id',user.id);
      if (error) { message.textContent=error.code==='23505'?'This student ID is already registered for this college.':'Could not save your details. Please try again.'; return; }
      await startStudentDashboard();
    } catch { message.textContent='Could not save your details. Please try again.'; } finally { button.disabled=false; }
  };
}
