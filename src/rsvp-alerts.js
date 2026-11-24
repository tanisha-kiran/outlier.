import { client } from './onboarding.js';
import { escapeHtml as esc, ist } from './event-model.js';
export function startRsvpAlerts(userId) {
 const key=`outlier-rsvp-read:${userId}`;
 let readAt='1970-01-01T00:00:00.000Z';try{readAt=localStorage.getItem(key)||readAt;}catch{}
 let busy=false;
 async function refresh() {
  if(busy||document.hidden||!location.pathname.endsWith('/admin'))return;
  busy=true;
  try {
   const {data:allowed}=await client.rpc('is_admin');if(!allowed)return;
   const [{data:entries,error},{count,error:countError}]=await Promise.all([
    client.from('event_registrations').select('id,event_id,team_name,participation,created_at,events(title)').order('created_at',{ascending:false}).limit(50),
    client.from('event_participants').select('user_id',{count:'exact',head:true})
   ]);
   if(error||countError)throw error||countError;
   const {count:teamCount,error:teamError}=await client.from('event_registrations').select('id',{count:'exact',head:true}).eq('participation','team');if(teamError)throw teamError;
   let box=document.querySelector('#rsvp-alerts');if(!box){box=document.createElement('section');box.id='rsvp-alerts';box.className='rsvp-alerts';document.querySelector('#event-main')?.prepend(box);}
   const latest=entries.filter(r=>r.participation==='team');
   const newTeams=latest.filter(r=>r.created_at>readAt);
   const ids=latest.map(r=>r.id);
   const {data:members,error:memberError}=ids.length?await client.from('event_participants').select('registration_id').in('registration_id',ids).limit(1000):{data:[]};if(memberError)throw memberError;
   box.innerHTML=`<h2>RSVP activity</h2><p class="rsvp-totals">${teamCount||0} teams · ${count||0} participants across your events</p><p role="status">${newTeams.length ? `${newTeams.length} unread team RSVPs in the latest activity` : 'You’re up to date.'}</p><ul>${latest.map(r=>`<li>${r.created_at>readAt?'<strong>NEW · </strong>':''}${esc(r.team_name)} — ${esc(r.events?.title||'Event')} · ${members.filter(m=>m.registration_id===r.id).length} participants · ${esc(ist(r.created_at))}</li>`).join('')||'<li>No teams have RSVP’d yet.</li>'}</ul><small>Latest 50 entries. Refreshes every 30 seconds while this dashboard is open. Manage an event to see its full roster and answers.</small><br><button type="button">Mark activity as read</button>`;
   box.querySelector('button').onclick=()=>{readAt=new Date().toISOString();try{localStorage.setItem(key,readAt);}catch{}refresh();};
   const {data:emails,error:emailError}=await client.from('event_email_outbox').select('kind,recipient,payload,sent_at,first_attempt_at,last_error,created_at').order('created_at',{ascending:false}).limit(20);
   const delivery=document.createElement('div');
   delivery.innerHTML=emailError?'<h3>Registration emails</h3><p>Email tracking is not configured yet.</p>':`<h3>Registration emails</h3><p>Latest 20 messages. “Sent” means the email provider accepted the message; inbox delivery is not yet verified.</p><ul>${(emails||[]).map(mail=>{const stale=mail.first_attempt_at&&Date.now()-Date.parse(mail.first_attempt_at)>23*60*60*1000;return `<li>${esc(mail.payload?.name||'Student')} · ${esc(mail.kind)} · ${esc(mail.kind==='admin'?'outlier.community.acs@gmail.com':mail.recipient)} — <strong>${mail.sent_at?'Sent':stale?'Needs organizer review':mail.last_error?'Retry pending':'Queued'}</strong></li>`;}).join('')||'<li>No registration emails queued yet.</li>'}</ul>`;
   box.append(delivery);
  } catch {
   const box=document.querySelector('#rsvp-alerts');if(box)box.textContent='RSVP activity could not refresh. Please reload to retry.';
  }finally{busy=false;}
 }
 refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
