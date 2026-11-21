import { client, startGate } from './onboarding.js';
import { setupNavigation } from './navigation.js';
import { escapeHtml as esc, httpsUrl, completed, registrationState, submissionOpen, splitEvents, ist } from './event-model.js';

export const link = (url, label) => httpsUrl(url) ? `<a class="event-button secondary" href="${esc(httpsUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
export function shell() {
  document.body.classList.add('events-page');
  document.querySelector('.intro')?.remove();
  document.querySelector('#app').innerHTML = `<header class="nav"><div class="nav-identity"><a class="nav-college" href="/#about"><img src="/college-logo.png" alt="Dr. ACS College of Engineering"></a><a href="/" class="brand">✳ OUTLIER<span class="brand-dot">.</span></a></div><nav aria-label="Main navigation"></nav></header><main id="event-main"><p role="status">Loading events…</p></main><footer>OUTLIER · Dr. ACS College of Engineering · <a href="/events/admin">Organizer sign in</a></footer>`;
  setupNavigation();
}
export function notice(message) { document.querySelector('#event-main').innerHTML = `<h1>Events</h1><p class="event-empty">${esc(message)}</p><a class="event-button" href="/events">Try again</a>`; }
export async function startEvents() {
  shell();
  if (!client) { notice('Events are not connected yet. The organizer needs to configure the existing Supabase public environment values.'); return; }
  const parts = location.pathname.split('/').filter(Boolean);
  try {
    if (parts[1] === 'admin') { const { startAdmin } = await import('./events-admin.js'); await startAdmin(); return; }
    if (parts.length === 1) { await hub(); return; }
    const { data: e, error } = await client.from('events').select('*').eq('is_community', true).eq('status','published').eq('slug',parts[1]).maybeSingle();
    if (error) throw error;
    if (!e || parts.length > 3 || (parts[2] && !['register','submit'].includes(parts[2]))) { notice('This event is unavailable or has not been published.'); return; }
    document.title = `${e.title} · OUTLIER Events`;
    if (parts[2]) {
      startGate({ onLock(){}, onUnlock(){ participantPage(e, parts[2]).catch(err => notice(err.message)); } });
    } else await detail(e);
  } catch { notice('We couldn’t load events. Please retry. If this continues, contact the organizer.'); }
}
function card(e, past = false) {
  return `<article class="hub-card">${httpsUrl(e.cover_url)?`<img src="${esc(e.cover_url)}" alt="${esc(e.title)} event cover" loading="lazy">`:''}<span class="event-tag">${esc(e.category)} · OUTLIER</span><h3>${esc(e.title)}</h3><div class="event-meta-line">${esc(ist(e.starts_at))}<br>${esc(e.mode==='online'?'Online':e.location||'Venue to be announced')}</div><p>${esc(e.description.slice(0,180))}${e.description.length>180?'…':''}</p><div class="event-actions"><a class="event-button" href="/events/${esc(e.slug)}">${past?'Read recap':'View Details'}</a>${past?link(e.results_url,'Results')+link(e.demos_url,'Project demos'):''}</div></article>`;
}
async function getPhotos(eventId) {
  let query=client.from('event_photos').select('*').eq('status','published').order('sort_order').order('created_at');
  if(eventId) query=query.eq('event_id',eventId);
  const { data,error }=await query;
  if(error) throw error;
  return data;
}
function albums(events, photos) {
  return events.map(e => {
    const album=photos.filter(p=>p.event_id===e.id);
    if(!album.length) return '';
    return `<article class="event-panel"><h3>${esc(e.title)}</h3><div class="gallery-grid">${album.map(p=>`<button type="button" class="photo-button" data-photo="${esc(p.id)}" aria-label="Open photo: ${esc(p.alt)}"><img src="${esc(httpsUrl(p.image_url))}" alt="${esc(p.alt)}" loading="lazy"></button>`).join('')}</div></article>`;
  }).join('');
}
function bindGallery(photos) {
  document.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{
    const clicked=photos.find(p=>p.id===button.dataset.photo), album=photos.filter(p=>p.event_id===clicked.event_id);
    let index=album.indexOf(clicked);
    const dialog=document.createElement('dialog'); dialog.className='photo-dialog';dialog.setAttribute('aria-label','Event photo preview');
    dialog.innerHTML='<button type="button" data-close>Close</button><img><p data-caption></p><div><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button></div><p aria-live="polite" data-count></p>';
    const show=()=>{const p=album[index];dialog.querySelector('img').src=httpsUrl(p.image_url);dialog.querySelector('img').alt=p.alt;dialog.querySelector('[data-caption]').textContent=p.caption;dialog.querySelector('[data-count]').textContent=`Photo ${index+1} of ${album.length}`;};
    const move=n=>{index=(index+n+album.length)%album.length;show();};
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-prev]').onclick=()=>move(-1);dialog.querySelector('[data-next]').onclick=()=>move(1);
    dialog.addEventListener('keydown',ev=>{if(ev.key==='ArrowLeft'){ev.preventDefault();move(-1);}if(ev.key==='ArrowRight'){ev.preventDefault();move(1);}});
    dialog.addEventListener('close',()=>{dialog.remove();button.focus();});document.body.append(dialog);show();dialog.showModal();
  });
}
async function hub() {
  const [{data:events,error}, photos, adminResult] = await Promise.all([client.from('events').select('*').eq('is_community',true).eq('status','published'),getPhotos(),client.rpc('is_admin')]);
  if(error) throw error;
  const {upcoming,past}=splitEvents(events), featured=upcoming.find(e=>e.featured);
  document.querySelector('#event-main').innerHTML=`<div class="event-hero"><div class="eyebrow">✳ OUR COMMUNITY, IN ACTION</div><h1>MAKE SOMETHING<br><em>HAPPEN.</em></h1><p>Hackathons, workshops and moments we build together. Events organized by OUTLIER or with our official participation.</p><div class="event-actions"><a class="event-button" href="#upcoming">Upcoming Events</a><a class="event-button secondary" href="#past">Past Events &amp; Results</a>${adminResult.data?'<a class="event-button secondary" href="/events/admin">Manage events</a>':''}</div></div>${featured?`<section class="hub-section"><h2>Featured event</h2>${card(featured)}</section>`:''}<section id="upcoming" class="hub-section"><h2>Upcoming Events</h2>${upcoming.length?`<div class="hub-grid">${upcoming.filter(e=>e!==featured).map(e=>card(e)).join('')||'<p>Our next event is featured above.</p>'}</div>`:'<p class="event-empty">Nothing scheduled just yet. Your next big idea can start with <a href="/#opportunities">Discover opportunities</a>.</p>'}</section><section id="past" class="hub-section"><h2>Past Events &amp; Results</h2>${past.length?`<div class="hub-grid">${past.map(e=>card(e,true)).join('')}</div>`:'<p class="event-empty">Our stories, projects and results will appear here after each event.</p>'}</section><section id="gallery" class="hub-section"><h2>Gallery</h2>${albums(events,photos)||'<p class="event-empty">Photos will appear here once an event album is published.</p>'}</section>`;
  bindGallery(photos);
  if(location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  // Every visit reads the shared database. Refresh an idle hub so open tabs see publishing too.
  window.setTimeout(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')) hub().catch(()=>{});},60000);
}
function registrationAction(e) {
  const state=registrationState(e);
  if(state!=='Register') return `<p class="event-status">${state}</p>`;
  return e.registration_mode==='external'?link(e.apply_url,'Register on event platform'):`<a class="event-button" href="/events/${esc(e.slug)}/register">Register / My registration</a>`;
}
async function detail(e) {
  const photos=await getPhotos(e.id);
  const section=(title,body)=>body?`<section class="event-panel"><h2>${title}</h2><div class="event-copy">${esc(body)}</div></section>`:'';
  document.querySelector('#event-main').innerHTML=`<a href="/events">All Events</a><div class="event-hero"><span class="event-tag">${esc(e.category)} · ${esc(e.organizer)}</span><h1>${esc(e.title)}</h1>${httpsUrl(e.cover_url)?`<img class="event-cover" src="${esc(e.cover_url)}" alt="${esc(e.title)} event cover">`:''}</div><div class="detail-grid"><div>${section('About the event',e.description)}${section('Rules',e.rules)}${section('Schedule',e.schedule)}${section('Prizes',e.prize)}${section('FAQ',e.faq)}${section('Recap',e.recap)}${e.results_url||e.demos_url?`<section class="event-panel"><h2>Results & projects</h2>${link(e.results_url,'View results')}${link(e.demos_url,'Project demos')}</section>`:''}</div><aside><div class="event-panel"><h2>Event details</h2><p><strong>Starts</strong><br>${esc(ist(e.starts_at))}${e.ends_at?`<br><strong>Ends</strong><br>${esc(ist(e.ends_at))}`:''}</p><p><strong>${e.mode==='online'?'Online event':esc(e.mode==='hybrid'?'Hybrid event':'Venue')}</strong><br>${esc(e.location||'Details to be announced')}</p>${e.eligibility?`<p><strong>Eligibility</strong><br>${esc(e.eligibility)}</p>`:''}<p>${e.participation==='both'?'Solo or team':e.participation==='solo'?'Solo participation':'Team participation'}${e.participation!=='solo'?` · ${Math.max(2,e.min_team)}–${e.max_team} members per team`:''}</p>${e.capacity?`<p>Capacity: ${e.capacity} participants</p>`:''}${e.deadline?`<p>Register by ${esc(ist(e.deadline))}</p>`:''}${e.registration_opens_at?`<p>Registration opens ${esc(ist(e.registration_opens_at))}</p>`:''}<div id="registration-action">${registrationAction(e)}</div>${e.registration_mode!=='external'?`<p><a href="/events/${esc(e.slug)}/register">View my registration</a></p>`:''}${e.submission_deadline?`<p>Project deadline: ${esc(ist(e.submission_deadline))}</p><a class="event-button secondary" href="/events/${esc(e.slug)}/submit">My project submission</a>`:''}</div></aside></div>${photos.length?`<section id="gallery"><h2>Event gallery</h2>${albums([e],photos)}</section>`:''}`;
  bindGallery(photos);
  setInterval(()=>{document.querySelector('#registration-action').innerHTML=registrationAction(e);},1000);
}
export function input(name,label,value='',type='text',extra='') { return `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
export function textarea(name,label,value='',extra='') { return `<label>${esc(label)}<textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`; }
export async function participantPage(e, action) {
  const {data:{user}}=await client.auth.getUser();
  if(!user) throw Error('Please sign in again.');
  const {data: membership,error}=await client.from('event_participants').select('registration_id').eq('event_id',e.id).eq('user_id',user.id).maybeSingle();
  if(error) throw error;
  const main=document.querySelector('#event-main');
  main.innerHTML=`<a href="/events/${esc(e.slug)}">Back to event</a><h1>${action==='submit'?'Your project':'Your registration'}</h1><h2>${esc(e.title)}</h2><div id="participant-content"></div>`;
  const area=document.querySelector('#participant-content');
  if(membership){
    const [{data:r,error:re},{data:roster,error:rr}]=await Promise.all([client.from('event_registrations').select('*').eq('id',membership.registration_id).single(),client.rpc('registration_roster',{rid:membership.registration_id})]);
    if(re||rr) throw re||rr;
    if(action==='submit'){await submissionForm(e,r,user,area);return;}
    area.innerHTML=`<section class="event-panel"><h2>Registration confirmed</h2><p>Reference: <code>${esc(r.id)}</code></p><p>${r.participation==='team'?`Team: ${esc(r.team_name)} · ${roster.length}/${e.max_team} places`:'Solo participant'}</p><ul>${roster.map(p=>`<li>${esc(p.full_name)}${p.is_leader?' · Leader':''}</li>`).join('')}</ul>${r.participation==='team'?`<p>Share this invite code privately with teammates. Each member must sign in and register themselves before the registration deadline.</p><code>${esc(r.invite_code)}</code>${roster.length<Math.max(2,e.min_team)?`<p class="event-status">Team incomplete: at least ${Math.max(2,e.min_team)} confirmed members are required to submit a project.</p>`:''}`:''}<div class="event-actions"><a class="event-button" href="/events/${esc(e.slug)}/submit">My project submission</a></div></section>`;return;
  }
  if(action==='submit'){area.innerHTML=`<p class="event-empty">Register before submitting a project. <a href="/events/${esc(e.slug)}/register">Go to registration</a>.</p>`;return;}
  if(registrationState(e)!=='Register'||e.registration_mode!=='native'){area.innerHTML=registrationAction(e);return;}
  const {data:p,error:pe}=await client.from('profiles').select('*').eq('id',user.id).single();if(pe)throw pe;
  const questions=e.registration_questions||[];
  area.innerHTML=`<form id="event-registration" class="event-form"><div class="event-panel"><h2>Your student details</h2><p>${esc(p.full_name)} · ${esc(user.email)}<br>${esc(p.usn)} · ${esc(p.department)} · Year ${p.year}<br>Dr. ACS College of Engineering</p><p class="form-note">These details come from your student account. Contact an organizer if they need correction.</p></div><fieldset><legend>Participation</legend><label>Register as<select name="kind">${e.participation!=='team'?'<option value="solo">Solo participant</option>':''}${e.participation!=='solo'?'<option value="team">Create a team</option><option value="join">Join a team</option>':''}</select></label><div data-team hidden>${input('team_name','Team name','','text','minlength="3" maxlength="80"')}</div><div data-join hidden>${input('join_code','Team invite code','','text','maxlength="36"')}<p class="form-note">Get this code from your team leader.</p></div>${input('phone','Contact phone','','tel','required maxlength="20" pattern="[+0-9 ()\\-]{7,20}" autocomplete="tel"')}</fieldset>${questions.length?`<fieldset><legend>Event questions</legend>${questions.map(q=>q.type==='checkbox'?`<label class="check"><input type="checkbox" name="q_${esc(q.id)}" ${q.required?'required':''}>${esc(q.label)}</label>`:q.type==='textarea'?textarea('q_'+q.id,q.label,'',`maxlength="2000" ${q.required?'required':''}`):input('q_'+q.id,q.label,'','text',`maxlength="2000" ${q.required?'required':''}`)).join('')}</fieldset>`:''}<fieldset><legend>Confirmation</legend>${e.rules?`<div class="event-copy">${esc(e.rules)}</div>`:''}<label class="check"><input type="checkbox" name="consent" required>I meet the event eligibility requirements, accept its rules and code of conduct, and agree that organizers may use my student and contact details to manage my registration.</label><label class="check"><input type="checkbox" name="photos">Optional: I consent to event photos featuring me being used in Outlier’s public gallery.</label></fieldset><p id="registration-message" class="event-status" role="status"></p><button type="submit">Confirm registration</button></form>`;
  const form=area.querySelector('form');const sync=()=>{const kind=form.elements.kind.value;for(const [key,active] of [['team',kind==='team'],['join',kind==='join']]){const block=form.querySelector(`[data-${key}]`);block.hidden=!active;block.querySelector('input').required=active;}};form.elements.kind.onchange=sync;sync();
  form.onsubmit=async ev=>{ev.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;const d=new FormData(form),answers=Object.fromEntries(questions.map(q=>[q.id,q.type==='checkbox'?d.has('q_'+q.id):d.get('q_'+q.id)||'']));try{const {error}=await client.rpc('register_for_event',{eid:e.id,kind:d.get('kind')==='join'?'team':d.get('kind'),team_name_input:d.get('team_name')||'',join_code:d.get('kind')==='join'?d.get('join_code'):'',phone_input:d.get('phone'),answers_input:answers,accept_rules:d.has('consent'),allow_photos:d.has('photos')});if(error)throw error;await participantPage(e,'register');}catch(err){form.querySelector('#registration-message').textContent=err.message;button.disabled=false;}};
}
async function submissionForm(e,r,user,area) {
  const {data:s,error}=await client.from('event_submissions').select('*').eq('registration_id',r.id).maybeSingle();if(error)throw error;
  const editable=submissionOpen(e)&&r.owner_id===user.id;
  area.innerHTML=`<p>One project per ${r.participation==='team'?'team, submitted by its leader':'solo participant'}. ${e.submission_deadline?`Deadline: ${esc(ist(e.submission_deadline))}.`:'The organizer has not opened submissions.'}</p><p class="event-status">${s?.status==='submitted'?`Submitted ${esc(ist(s.submitted_at))}`:s?'Draft saved — not submitted':'No project submitted yet'}${!editable?' · '+(r.owner_id!==user.id?'Only your team leader can edit.':'Submissions are closed.'):''}</p><form class="event-form" id="project-form"><fieldset ${editable?'':'disabled'}><legend>Project details</legend>${input('title','Project title',s?.title,'text','required minlength="3" maxlength="160"')}${textarea('overview','Problem and solution overview',s?.overview,'required minlength="20" maxlength="12000"')}${textarea('purpose','What purpose does your game or solution serve?',s?.purpose,'maxlength="4000"')}${input('technologies','Technologies used',s?.technologies,'text','maxlength="1000"')}${input('repository_url','Source code URL (HTTPS)',s?.repository_url,'url','required maxlength="2000" pattern="https://.*"')}${input('commit_ref','Final commit hash or release tag',s?.commit_ref,'text','maxlength="100"')}${input('demo_url','Playable demo or build URL (HTTPS)',s?.demo_url,'url','maxlength="2000" pattern="https://.*"')}${input('video_url','Demo video URL (HTTPS)',s?.video_url,'url','maxlength="2000" pattern="https://.*"')}${input('slides_url','Slides URL (optional)',s?.slides_url,'url','maxlength="2000" pattern="https://.*"')}${textarea('instructions','Setup and judge access instructions',s?.instructions,'maxlength="6000"')}<p class="form-note">Make links accessible to judges. Include a playable demo or video for final submission. Do not include passwords or secrets. Use a commit hash or fixed release to identify the deadline version.</p></fieldset><p class="event-status" id="submission-message" role="status"></p>${editable?'<div class="event-actions"><button type="submit" value="draft">Save draft</button><button type="submit" value="submitted">Submit final project</button></div><p class="form-note">You may revise and resubmit before the deadline. Saving a draft changes a submitted project back to draft; submit it again to enter judging.</p>':''}</form>`;
  area.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,payload=Object.fromEntries(new FormData(form)),finalize=ev.submitter.value==='submitted';form.querySelectorAll('button').forEach(b=>b.disabled=true);try{const {error}=await client.rpc('save_event_submission',{rid:r.id,payload,finalize});if(error)throw error;await submissionForm(e,r,user,area);}catch(err){form.querySelector('#submission-message').textContent=err.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
}
