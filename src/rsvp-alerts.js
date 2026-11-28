import { client } from './onboarding.js';
import { emailDeliveryStatus } from './email-delivery-status.js';
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
   const [{data:entries,error},{data:allMembers,error:countError},{data:allInvited,error:invitedError}, cancelRes]=await Promise.all([
    client.from('event_registrations').select('id,event_id,team_name,participation,created_at,events(title)').order('created_at',{ascending:false}).limit(50),
    client.from('event_participants').select('registration_id,email,answers').limit(5000),
    client.from('event_invited_members').select('registration_id,email').limit(5000),
    client.from('event_cancellations').select('participant_name,participant_email,team_name,reference_code,cancelled_at,events(title)').order('cancelled_at',{ascending:false}).limit(20)
   ]);
   if(error||countError||invitedError)throw error||countError||invitedError;
   const {count:teamCount,error:teamError}=await client.from('event_registrations').select('id',{count:'exact',head:true}).eq('participation','team');if(teamError)throw teamError;
   let box=document.querySelector('#rsvp-alerts');if(!box){box=document.createElement('section');box.id='rsvp-alerts';box.className='rsvp-alerts';document.querySelector('#event-main')?.prepend(box);}
   const confirmedEmailsByReg=new Map();
   for(const m of allMembers||[]){
    const set=confirmedEmailsByReg.get(m.registration_id)||new Set();
    if(m.email)set.add(m.email.toLowerCase());
    if(m.answers?.contact_email)set.add(String(m.answers.contact_email).trim().toLowerCase());
    confirmedEmailsByReg.set(m.registration_id,set);
   }
   const extraInvited=(allInvited||[]).filter(inv=>!(confirmedEmailsByReg.get(inv.registration_id)?.has((inv.email||'').toLowerCase())));
   const totalParticipants=(allMembers?.length||0)+extraInvited.length;
   const latest=entries.filter(r=>r.participation==='team');
   const newTeams=latest.filter(r=>r.created_at>readAt);
   const teamSize=id=>(allMembers||[]).filter(m=>m.registration_id===id).length+extraInvited.filter(inv=>inv.registration_id===id).length;
   const cancellations=cancelRes.error?[]:(cancelRes.data||[]);
   box.innerHTML=`<h2>RSVP activity</h2><p class="rsvp-totals">${teamCount||0} teams · ${totalParticipants} participants across your events (${allMembers?.length||0} confirmed · ${extraInvited.length} listed teammates)</p><p role="status">${newTeams.length ? `${newTeams.length} unread team RSVPs in the latest activity` : 'You’re up to date.'}</p><ul>${latest.map(r=>`<li>${r.created_at>readAt?'<strong>NEW · </strong>':''}${esc(r.team_name)} — ${esc(r.events?.title||'Event')} · ${teamSize(r.id)} participants · ${esc(ist(r.created_at))}</li>`).join('')||'<li>No teams have RSVP’d yet.</li>'}</ul>${cancellations.length?`<h3>Recent cancellations</h3><ul>${cancellations.map(c=>`<li><strong>${esc(c.participant_name)}</strong> (${esc(c.participant_email)})${c.team_name?` · ${esc(c.team_name)}`:''} — ${esc(c.events?.title||'Event')} · ${esc(ist(c.cancelled_at))}</li>`).join('')}</ul>`:''}<small>Latest 50 entries. Refreshes every 30 seconds while this dashboard is open. Manage an event to see its full roster and answers.</small><br><button type="button">Mark activity as read</button>`;
   box.querySelector('button').onclick=()=>{readAt=new Date().toISOString();try{localStorage.setItem(key,readAt);}catch{}refresh();};
   const {data:emails,error:emailError}=await client.from('event_email_outbox').select('kind,recipient,payload,sent_at,bounced_at,bounce_reason,first_attempt_at,last_error,created_at').order('created_at',{ascending:false}).limit(20);
   const {data:settings,error:settingsError}=await client.from('email_delivery_settings').select('enabled,reason,send_from').eq('id',true).single();
   const paused=!settingsError&&settings?.enabled===false;
   const delivery=document.createElement('div');
   delivery.innerHTML=emailError?'<h3>Registration emails</h3><p>Email tracking is not configured yet.</p>':`<h3>Registration emails</h3>${paused?`<p role="status"><strong>Automatic emails paused.</strong> ${esc(settings.reason)} Registrations remain saved.</p>`:settingsError?'<p>Email sending status could not be checked.</p>':''}<p>Latest 20 messages. Acceptance by Gmail does not confirm inbox delivery. Bounces shown here are recorded by the organizer; automatic bounce detection is not connected.</p><ul>${(emails||[]).map(mail=>`<li>${esc(mail.payload?.name||'Student')} · ${esc(mail.kind)} · ${esc(mail.kind==='admin'?'Organizer inbox':mail.recipient)} — <strong>${esc(emailDeliveryStatus(mail,paused,settings?.send_from))}</strong>${mail.bounced_at?`<br><small>${esc(mail.bounce_reason||'Delivery failed')}</small>`:''}</li>`).join('')||'<li>No registration emails queued yet.</li>'}</ul>`;
   box.append(delivery);
  } catch {
   const box=document.querySelector('#rsvp-alerts');if(box)box.textContent='RSVP activity could not refresh. Please reload to retry.';
  }finally{busy=false;}
 }
 refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
