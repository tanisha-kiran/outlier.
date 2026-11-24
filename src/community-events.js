import { enhanceTeamForm } from './team-form.js';
import { questionsFor, starshipBackdrop, validateRsvpAnswers } from './rsvp-experience.js';
import { client, startGate } from './onboarding.js';
import { setupNavigation } from './navigation.js';
import { escapeHtml as esc, httpsUrl, completed, registrationState, submissionFormState, googleFormUrl, splitEvents, ist, eventCoverUrl, eventImageUrl } from './event-model.js';

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
    if (parts[1] === 'me' && parts.length === 2) { startGate({ onLock(){}, onUnlock(){ import('./student-dashboard.js').then(m=>m.startStudentDashboard()).catch(()=>notice('We couldn’t load your student dashboard. Please try again.')); } }); return; }
    if (parts.length === 1) { await hub(); return; }
    const { data: e, error } = await client.from('events').select('*').eq('is_community', true).eq('status','published').eq('slug',parts[1]).maybeSingle();
    if (error) throw error;
    if (!e || parts.length > 3 || (parts[2] && !['register','submit'].includes(parts[2]))) { notice('This event is unavailable or has not been published.'); return; }
    document.title = `${e.title} · OUTLIER Events`;
    if(e.slug==='play-for-a-purpose')starshipBackdrop(e);
    if (parts[2]) {
      startGate({ onLock(){}, onUnlock(){ participantPage(e, parts[2]).catch(err => notice(err.message)); } });
    } else await detail(e);
  } catch { notice('We couldn’t load events. Please retry. If this continues, contact the organizer.'); }
}
function card(e, past = false) {
  return `<article class="hub-card">${eventCoverUrl(e)?`<img src="${esc(eventCoverUrl(e))}" referrerpolicy="no-referrer" alt="${esc(e.title)} event cover" loading="lazy">`:''}<span class="event-tag">${esc(e.category)} · OUTLIER</span><h3>${esc(e.title)}</h3><div class="event-meta-line">${esc(ist(e.starts_at))}<br>${esc(e.mode==='online'?'Online':e.location||'Venue to be announced')}</div><p>${esc(e.description.slice(0,180))}${e.description.length>180?'…':''}</p><div class="event-actions"><a class="event-button" href="/events/${esc(e.slug)}">${past?'Read recap':'View Details'}</a>${past?link(e.results_url,'Results')+link(e.demos_url,'Project demos'):''}</div></article>`;
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
    return `<article class="event-panel"><h3>${esc(e.title)}</h3><div class="gallery-grid">${album.map(p=>`<button type="button" class="photo-button" data-photo="${esc(p.id)}" aria-label="Open photo: ${esc(p.alt)}"><img src="${esc(eventImageUrl(p.image_url))}" referrerpolicy="no-referrer" alt="${esc(p.alt)}" loading="lazy"></button>`).join('')}</div></article>`;
  }).join('');
}
function bindGallery(photos) {
  document.querySelectorAll('.hub-card img,.event-cover,.photo-button img').forEach(img=>{
    const fail=()=>{const fallback=document.createElement('div');fallback.className='event-image-fallback';fallback.innerHTML='<span aria-hidden="true">✳</span><p>OUTLIER COMMUNITY</p>';img.replaceWith(fallback);};
    img.addEventListener('error',fail,{once:true});if(img.complete&&!img.naturalWidth)fail();
  });
  document.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{
    const clicked=photos.find(p=>p.id===button.dataset.photo), album=photos.filter(p=>p.event_id===clicked.event_id);
    let index=album.indexOf(clicked);
    const dialog=document.createElement('dialog'); dialog.className='photo-dialog';dialog.setAttribute('aria-label','Event photo preview');
    dialog.innerHTML='<button type="button" data-close>Close</button><img><p data-caption></p><div><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button></div><p aria-live="polite" data-count></p>';
    const show=()=>{const p=album[index];dialog.querySelector('img').src=eventImageUrl(p.image_url);dialog.querySelector('img').alt=p.alt;dialog.querySelector('[data-caption]').textContent=p.caption;dialog.querySelector('[data-count]').textContent=`Photo ${index+1} of ${album.length}`;};
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
  return e.registration_mode==='external'?link(e.apply_url,'RSVP on event platform'):`<a class="event-button" href="/events/${esc(e.slug)}/register">RSVP / My RSVP</a>`;
}
async function detail(e) {
  const photos=await getPhotos(e.id);
  const {data:winners,error:winnerError}=await client.from('event_winners').select('*').eq('event_id',e.id).eq('status','published').order('place');
  const section=(title,body)=>body?`<section class="event-panel"><h2>${title}</h2><div class="event-copy">${esc(body)}</div></section>`:'';
  document.querySelector('#event-main').innerHTML=`<a href="/events">All Events</a><div class="event-hero"><span class="event-tag">${esc(e.category)} · ${esc(e.organizer)}</span><h1>${esc(e.title)}</h1>${eventCoverUrl(e)?`<img class="event-cover" src="${esc(eventCoverUrl(e))}" referrerpolicy="no-referrer" alt="${esc(e.title)} event cover">`:''}</div><div class="detail-grid"><div>${section('About the event',e.description)}${section('Rules',e.rules)}${section('Schedule',e.schedule)}${section('Prizes',e.prize)}${section('FAQ',e.faq)}${section('Recap',e.recap)}${e.results_url||e.demos_url?`<section class="event-panel"><h2>Results & projects</h2>${link(e.results_url,'View results')}${link(e.demos_url,'Project demos')}</section>`:''}</div><aside><div class="event-panel"><h2>Event details</h2><p><strong>Starts</strong><br>${esc(ist(e.starts_at))}${e.ends_at?`<br><strong>Ends</strong><br>${esc(ist(e.ends_at))}`:''}</p><p><strong>${e.mode==='online'?'Online event':esc(e.mode==='hybrid'?'Hybrid event':'Venue')}</strong><br>${esc(e.location||'Details to be announced')}</p>${e.eligibility?`<p><strong>Eligibility</strong><br>${esc(e.eligibility)}</p>`:''}<p>${e.participation==='both'?'Solo or team':e.participation==='solo'?'Solo participation':'Team participation'}${e.participation!=='solo'?` · ${Math.max(2,e.min_team)}–${e.max_team} members per team`:''}</p>${e.capacity?`<p>Capacity: ${e.capacity} participants</p>`:''}${e.deadline?`<p>Register by ${esc(ist(e.deadline))}</p>`:''}${e.registration_opens_at?`<p>Registration opens ${esc(ist(e.registration_opens_at))}</p>`:''}<div id="registration-action">${registrationAction(e)}</div>${e.registration_mode!=='external'?`<p><a href="/events/${esc(e.slug)}/register">View my registration</a></p>`:''}${e.submission_form_url||e.submission_deadline?`<section><h3>Project submission</h3>${e.submission_deadline?`<p>Deadline: ${esc(ist(e.submission_deadline))}</p>`:''}<div id="project-action">${projectAction(e)}</div></section>`:''}</div></aside></div>${photos.length?`<section id="gallery"><h2>Event gallery</h2>${albums([e],photos)}</section>`:''}`;
  if(winners?.length) document.querySelector('#event-main').insertAdjacentHTML('beforeend',`<section id="winners" class="hub-section"><h2>Winners & projects</h2><div class="hub-grid">${winners.map(w=>`<article class="hub-card"><span class="event-tag">${w.place===1?'1st place':w.place===2?'2nd place':'3rd place'}</span><h3>${esc(w.entry_name)}</h3><strong>${esc(w.project_title)}</strong>${w.description?`<p>${esc(w.description)}</p>`:''}${link(w.project_url,'View project')}</article>`).join('')}</div></section>`);
  if(winnerError) document.querySelector('#event-main').insertAdjacentHTML('beforeend','<p role="status">Results are temporarily unavailable. Please try again later.</p>');
  bindGallery(photos);
  setInterval(()=>{document.querySelector('#registration-action').innerHTML=registrationAction(e);const action=document.querySelector('#project-action');if(action)action.innerHTML=projectAction(e);},1000);
}
export function input(name,label,value='',type='text',extra='') { return `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
export function textarea(name,label,value='',extra='') { return `<label>${esc(label)}<textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`; }
export async function participantPage(e, action) {
  if(action==='register')starshipBackdrop(e);
  const {data:{user}}=await client.auth.getUser();
  if(!user) throw Error('Please sign in again.');
  const {data: membership,error}=await client.from('event_participants').select('registration_id').eq('event_id',e.id).eq('user_id',user.id).maybeSingle();
  if(error) throw error;
  const main=document.querySelector('#event-main');
  main.innerHTML=`<a href="/events/${esc(e.slug)}">Back to event</a><h1>${action==='submit'?'Your project':'Your RSVP'}</h1><h2>${esc(e.title)}</h2><div id="participant-content"></div>`;
  const area=document.querySelector('#participant-content');
  if(membership){
    const [{data:r,error:re},{data:roster,error:rr}]=await Promise.all([client.from('event_registrations').select('*').eq('id',membership.registration_id).single(),client.rpc('registration_roster',{rid:membership.registration_id})]);
    if(re||rr) throw re||rr;
    if(action==='submit'){submissionForm(e,r,user,area,roster);return;}
    area.innerHTML=`<section class="event-panel"><h2>${r.participation==='team'?'Your team card':'Registration confirmed'}</h2><p>Reference: <code>${esc(r.reference_code||r.id)}</code></p><p>${r.participation==='team'?`Team: ${esc(r.team_name)} · ${roster.length}/${e.max_team} places`:'Solo participant'}</p><ul>${roster.map(p=>`<li>${esc(p.full_name)}${p.is_leader?' · Leader':''}</li>`).join('')}</ul>${r.participation==='team'?`<p>Share this invite code privately with teammates. Each member must sign in and register themselves before the registration deadline.</p><label>Unique team code<input class="team-code" readonly value="${esc(r.invite_code)}" aria-label="Unique team code"></label><button type="button" id="copy-team-code">Copy team code</button><p id="copy-message" role="status"></p>${roster.length<Math.max(2,e.min_team)?`<p class="event-status">Team incomplete: at least ${Math.max(2,e.min_team)} confirmed members are required for a complete team.</p>`:''}`:''}<div class="event-actions"><a class="event-button" href="/events/${esc(e.slug)}/submit">Project submission</a></div></section>`;bindCopy(r.invite_code);return;
  }
  if(action==='submit'){area.innerHTML=`<p class="event-empty">Register before submitting a project. <a href="/events/${esc(e.slug)}/register">Go to RSVP</a>.</p>`;return;}
  if(registrationState(e)!=='Register'||e.registration_mode!=='native'){area.innerHTML=registrationAction(e);return;}
  const {data:p,error:pe}=await client.from('profiles').select('*').eq('id',user.id).single();if(pe)throw pe;
  const questions=[...questionsFor(e), {id:'contact_email',label:'Contact email',type:'text',required:true}];
  area.innerHTML=`<form id="event-registration" class="event-form"><div class="event-panel"><h2>Your student details</h2><p>${esc(p.full_name)} · ${esc(user.email)}<br>${esc(p.usn)} · ${esc(p.department)} · Year ${p.year}<br>${esc(p.college||'Dr. ACS College of Engineering')}</p><p class="form-note">These details come from your student account. Contact an organizer if they need correction.</p></div><fieldset><legend>Participation</legend><label>Register as<select name="kind">${e.participation!=='team'?'<option value="solo">Solo participant</option>':''}${e.participation!=='solo'?'<option value="team">Create a team</option><option value="join">Join a team</option>':''}</select></label><div data-team hidden>${input('team_name','Team name','','text','minlength="3" maxlength="80"')}<p>Optional: add teammate names and emails. They must still register themselves with your team code.</p>${Array.from({length:Math.max(0,e.max_team-1)},(_,i)=>`<div class="form-grid">${input('member_name_'+i,'Teammate '+(i+1)+' name','','text','maxlength="100"')}${input('member_email_'+i,'Teammate '+(i+1)+' email','','email','maxlength="254"')}</div>`).join('')}</div><div data-join hidden>${input('join_code','Team invite code','','text','maxlength="36"')}<p class="form-note">Get this code from your team leader.</p></div>${input('phone','Contact phone','','tel','required maxlength="20" pattern="[+0-9 ()\\-]{7,20}" autocomplete="tel"')}</fieldset>${questions.length?`<fieldset><legend>Event questions</legend>${questions.map(q=>q.type==='checkbox'?`<label class="check"><input type="checkbox" name="q_${esc(q.id)}" ${q.required?'required':''}>${esc(q.label)}</label>`:q.type==='textarea'?textarea('q_'+q.id,q.label,'',`maxlength="2000" ${q.required?'required':''}`):input('q_'+q.id,q.label,'','text',`maxlength="2000" ${q.required?'required':''}`)).join('')}</fieldset>`:''}<fieldset><legend>Confirmation</legend>${e.rules?`<div class="event-copy">${esc(e.rules)}</div>`:''}<label class="check"><input type="checkbox" name="consent" required>I meet the event eligibility requirements, accept its rules and code of conduct, and agree that organizers may use my student and contact details to manage my registration.</label><label class="check"><input type="checkbox" name="photos">Optional: I consent to event photos featuring me being used in Outlier’s public gallery.</label></fieldset><p id="registration-message" class="event-status" role="status"></p><button type="submit">Confirm registration</button></form>`;
  const form=area.querySelector('form');const sync=()=>{const kind=form.elements.kind.value;for(const [key,active] of [['team',kind==='team'],['join',kind==='join']]){const block=form.querySelector(`[data-${key}]`);block.hidden=!active;block.querySelector('input').required=active;}};form.elements.kind.onchange=sync;const invite=new URLSearchParams(location.search).get('team');if(invite&&e.participation!=='solo'){form.elements.kind.value='join';form.elements.join_code.value=invite;}sync();
  form.onsubmit=async ev=>{ev.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;const d=new FormData(form),answers=Object.fromEntries(questions.map(q=>[q.id,q.type==='checkbox'?d.has('q_'+q.id):d.get('q_'+q.id)||'']));const invited=[];if(d.get('kind')==='team'){for(let i=0;i<e.max_team-1;i++){const name=(d.get('member_name_'+i)||'').trim(),email=(d.get('member_email_'+i)||'').trim();if(Boolean(name)!==Boolean(email)){form.querySelector('#registration-message').textContent='Enter both name and email for each teammate, or leave both blank.';button.disabled=false;return;}if(name)invited.push({name,email});}}try{if(e.slug==='play-for-a-purpose')validateRsvpAnswers(answers);const {error}=await client.rpc('register_for_event',{eid:e.id,kind:d.get('kind')==='join'?'team':d.get('kind'),team_name_input:d.get('team_name')||'',join_code:d.get('kind')==='join'?d.get('join_code'):'',phone_input:d.get('phone'),answers_input:answers,accept_rules:d.has('consent'),allow_photos:d.has('photos'),invited_members:invited});if(error)throw error;await participantPage(e,'register');}catch(err){form.querySelector('#registration-message').textContent=err.message;button.disabled=false;}};
  enhanceTeamForm({form, profile:p, user, event:e, client});
}

function projectAction(e) {
 const state=submissionFormState(e);
 if(state!=='Submit project on Google Forms') return '<p class="event-status">'+state+'</p>';
 return e.registration_mode==='external'?link(googleFormUrl(e.submission_form_url),'Submit project on Google Forms'):'<a class="event-button" href="/events/'+esc(e.slug)+'/submit">Submit project — Google Form</a>';
}
function bindCopy(code) {
 const button=document.querySelector('#copy-team-code');
 if(button)button.onclick=async()=>{try{await navigator.clipboard.writeText(code);document.querySelector('#copy-message').textContent='Code copied.';}catch{document.querySelector('.team-code')?.select();document.querySelector('#copy-message').textContent='Select and copy the code above.';}};
}
function submissionForm(e,r,user,area,roster) {
 const code=r.reference_code||r.id;
 const incomplete=r.participation==='team'&&roster.length<Math.max(2,e.min_team);
 const render=()=>{
 const state=submissionFormState(e);
 area.innerHTML='<section class="event-panel"><h2>Project submission</h2><p>'+esc(r.team_name||'Solo entry')+'</p><label>'+'Entry reference'+'<input class="team-code" readonly value="'+esc(code)+'"></label><button type="button" id="copy-team-code">Copy code</button><p id="copy-message" role="status"></p><p>Include this reference in the Google Form so the organizer can match your project to your registration. Submit one response per team.</p>'+(e.submission_deadline?'<p>Deadline: '+esc(ist(e.submission_deadline))+'</p>':'')+(incomplete?'<p class="event-status">Your team needs at least '+Math.max(2,e.min_team)+' confirmed members. Share your team code so they can join.</p>':r.owner_id!==user.id?'<p class="event-status">Your team leader submits the project for everyone.</p>':state==='Submit project on Google Forms'?link(googleFormUrl(e.submission_form_url),state):'<p class="event-status">'+state+'</p>')+'<p class="form-note">Google Forms collects the response and shows your confirmation. Outlier does not track whether a Google Form was submitted.</p><a href="/events/'+esc(e.slug)+'/register">Back to my registration</a></section>';bindCopy(code);
 };
 render();let state=submissionFormState(e);setInterval(()=>{const next=submissionFormState(e);if(next!==state){state=next;render();}},1000);
}
