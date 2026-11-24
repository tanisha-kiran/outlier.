const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 '"':'&quot;',
 "'":'&#39;'
}[character]));

export function participantEmail(job, siteOrigin) {
 const payload=job.payload;
 const invitation=job.kind==='invitation';
 const admin=job.kind==='admin';
 const isTeamLeader=!invitation&&!admin&&payload.participation==='team'&&payload.leader===true&&payload.invite_code;
 const url=new URL(admin?'/events/admin':`/events/${encodeURIComponent(payload.slug)}/register`,siteOrigin);
 if(invitation)url.searchParams.set('team',payload.invite_code);
 const date=payload.starts_at
  ? new Intl.DateTimeFormat('en-IN',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(payload.starts_at))+' IST'
  : 'To be announced';
 const location=payload.mode==='online'?'Online':payload.location||'To be announced';
 let heading,intro,details,buttonLabel;
 if(admin) {
  heading='New participant registration';
  intro=`${payload.name} has registered for ${payload.title}.`;
  details=[
   ['Event',payload.title],
   ['Participant',payload.name],
   ['Team',payload.team||'Individual registration'],
   ['Registration reference',payload.reference||job.registration_id],
   ['Total event participants',payload.total]
  ];
  buttonLabel='Open organizer dashboard';
 } else if(invitation) {
  heading='You are invited to join a team';
  intro='You have been invited to join this event team. Your place is not confirmed until you complete your registration.';
  details=[
   ['Event',payload.title],
   ['Date and time',date],
   ['Location',location],
   ['Team',payload.team||'Event team'],
   ['Team code',payload.invite_code]
  ];
  buttonLabel='Complete your registration';
 } else {
  heading='You are in. Your registration is confirmed.';
  intro='Your place is confirmed. We look forward to seeing you.';
  details=[
   ['Event',payload.title],
   ['Date and time',date],
   ['Location',location],
   ['Registration type',payload.participation==='team'?'Team':'Individual'],
   ...(payload.participation==='team'?[['Team',payload.team||'Team']]:[]),
   ['Registration reference',payload.reference||job.registration_id],
   ...(isTeamLeader?[['Team code',payload.invite_code]]:[])
  ];
  buttonLabel='View your registration';
 }
 const lines=[
  `Hello ${admin?'OUTLIER team':payload.name},`,
  heading,
  intro,
  'Event details',
  ...details.map(([label,value])=>`${label}: ${value}`),
  `${admin?'Open the organizer dashboard':'View your registration'}: ${url.href}`,
  'For questions, reply to outlier.community.acs@gmail.com.',
  'OUTLIER Community'
 ];
 const html=`<div style="background:#f4f2f7;padding:32px 16px;font-family:Arial,sans-serif;color:#211d2b"><div style="max-width:560px;margin:auto;background:#ffffff;padding:28px;border:1px solid #ded9e5;border-radius:8px"><p style="letter-spacing:2px;color:#62566f">OUTLIER COMMUNITY</p><p>Hello ${escapeHtml(admin?'OUTLIER team':payload.name)},</p><h1 style="font-size:26px">${escapeHtml(heading)}</h1><p style="line-height:1.6">${escapeHtml(intro)}</p><h2 style="font-size:18px">Event details</h2><table style="width:100%;border-collapse:collapse">${details.map(([label,value])=>`<tr><th style="padding:8px 8px 8px 0;text-align:left;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px 0;line-height:1.5">${escapeHtml(value)}</td></tr>`).join('')}</table><p><a href="${escapeHtml(url.href)}" style="display:inline-block;background:#352b48;color:#ffffff;padding:13px 18px;border-radius:4px;text-decoration:none">${escapeHtml(buttonLabel)}</a></p><p style="font-size:13px;color:#625b69">For questions, reply to outlier.community.acs@gmail.com.</p><p>OUTLIER Community</p></div></div>`;
 return {
  recipient:admin?'outlier.community.acs@gmail.com':job.recipient,
  subject:(admin?`New registration: ${payload.title} - ${payload.name}`:invitation?`Team invitation: ${payload.title}`:`Your registration is confirmed: ${payload.title}`).replace(/[\r\n]/g,' '),
  text:lines.join('\n\n'),
  html
 };
}
