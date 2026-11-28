export function participantEmail(job, organizerInbox) {
 const p=job.payload;
 const invitation=job.kind==='invitation',admin=job.kind==='admin';
 const leader=!invitation&&!admin&&!p.cancelled&&p.participation==='team'&&p.leader===true&&p.invite_code;
 const date=p.starts_at?new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(p.starts_at))+' IST':'To be announced';
 const details=[['Event',p.title],['Date and time',date],['Location',p.mode==='online'?'Online':p.location||'To be announced'],['Team',p.team||'Individual entry'],['Registration reference',p.reference||job.registration_id]];
 if(invitation||leader)details.push(['Team code',p.invite_code]);
 if(admin)details.push(['Participant',p.name],['Total event participants',p.total]);
 const heading=admin?(p.cancelled?'Participant registration cancelled':'New participant registration'):invitation?'Team invitation':(p.cancelled?'Registration cancelled':'Registration confirmation');
 const intro=admin?(p.cancelled?`${p.name} cancelled their registration for this event.`:`${p.name} registered for this event.`):invitation?'Your team leader asked OUTLIER to send you this one-time invitation. To RSVP, sign in on the OUTLIER website, choose Join a team, and enter the team code below.':(p.cancelled?'Your registration for this event has been cancelled as requested.':`Your registration has been saved.${p.participation==='team'?' Each teammate must complete their own registration.':''}`);
 return {recipient:admin?organizerInbox:job.recipient,
 subject:`${heading}: ${p.title}`.replace(/[\r\n]/g,' '),
 text:[`Hello ${admin?'OUTLIER team':p.name},`,intro,...details.map(([key,value])=>`${key}: ${value}`),'You can check the current registration status on the OUTLIER website.','If you did not expect this message, please reply and let us know.','OUTLIER Community'].join('\n\n')};
}
