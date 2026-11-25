import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { splitEvents, registrationState, submissionOpen, googleFormUrl, submissionFormState, fromIstInput, toIstInput, httpsUrl, escapeHtml } from '../src/event-model.js';
import { participantEmail } from '../supabase/functions/participant-email/email-content.js';
import { emailDeliveryStatus } from '../src/email-delivery-status.js';

test('participant confirmation sends the team code only to the team leader',()=>{
 const job={kind:'confirmation',registration_id:'registration-1',recipient:'student@example.test',payload:{
  name:'Student',title:'Build Together',slug:'build-together',starts_at:'2026-12-01T10:00:00Z',location:'Bengaluru',mode:'offline',
  participation:'team',team:'Orbit team',reference:'PFP-AI001',invite_code:'team-code-123',leader:true
 }};
 const leaderEmail=participantEmail(job,'https://outlier.example.test');
 assert.match(leaderEmail.text,/Your registration has been saved/);
 assert.match(leaderEmail.text,/Team code: team-code-123/);
 assert.match(leaderEmail.subject,/Registration confirmation: Build Together/);
 assert.doesNotMatch(leaderEmail.text,/✳|↗/);
 const memberEmail=participantEmail({...job,payload:{...job.payload,leader:false}},'https://outlier.example.test');
 assert.doesNotMatch(memberEmail.text,/team-code-123/);
 assert.equal(memberEmail.html,undefined);
 assert.doesNotMatch(memberEmail.text,/https?:\/\//);
 assert.doesNotMatch(memberEmail.text,/✳|↗/);
});

test('delivery status distinguishes Gmail acceptance, bounces and the sending pause',()=>{
 assert.equal(emailDeliveryStatus({sent_at:'2026-11-25',bounced_at:'2026-11-25'}),'Bounced — not delivered');
 assert.equal(emailDeliveryStatus({sent_at:'2026-11-25'},true),'Accepted by Gmail — delivery unverified');
 assert.equal(emailDeliveryStatus({},true),'On hold — sending paused');
});

test('multi-college registration preserves school identity and isolates student records', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of ['001_outlier.sql','002_registration_details.sql','003_community_events.sql']) await db.exec(await readFile(new URL('../supabase/'+file, import.meta.url),'utf8'));
  const old='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'old@example.test',$2)`,[old,JSON.stringify({full_name:'First Student',usn:'12345',department:'Civil',year:2})]);
  await db.exec(await readFile(new URL('../supabase/004_multicollege.sql', import.meta.url),'utf8'));
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'other@example.test',$2)`,[other,JSON.stringify({full_name:'Other Student',college:'Another College',usn:'12345',department:'Civil',year:2})]);
  assert.deepEqual((await db.query('select college from public.profiles order by id')).rows.map(x=>x.college),['Dr. ACS College of Engineering','Another College']);
  await db.exec(`insert into public.events(slug,title,organizer,description,mode,is_community,status) values('play-for-a-purpose','Play for a Purpose','OUTLIER','A test event for student registration.','offline',true,'draft'); update public.profiles set whatsapp_acknowledged_at=now(); update public.events set status='published',registration_mode='native',starts_at=now()+interval '1 day',ends_at=now()+interval '2 days',deadline=now()+interval '1 hour',capacity=10 where slug='play-for-a-purpose';`);
  const eid=(await db.query(`select id from public.events where slug='play-for-a-purpose'`)).rows[0].id;
  for (const id of [old,other]) {
   await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]); await db.exec('set role authenticated');
   await db.query(`select public.register_for_event($1,'solo','','','9876543210','{}',true,false)`,[eid]);
   assert.equal((await db.query('select * from public.event_participants')).rows.length,1);
   await db.exec('reset role');
  }
  assert.deepEqual((await db.query('select college from public.event_participants order by user_id')).rows.map(x=>x.college),['Dr. ACS College of Engineering','Another College']);
 } finally { await db.close(); }
});

test('event sorting, privacy filtering, deadlines and IST conversions',()=>{
 const now=Date.parse('2026-11-21T10:00:00Z');
 assert.equal(googleFormUrl('https://forms.gle/example'),'https://forms.gle/example');
 assert.equal(googleFormUrl('https://docs.google.com/forms/d/e/test/viewform'),'https://docs.google.com/forms/d/e/test/viewform');
 assert.equal(googleFormUrl('https://forms.gle.evil.test/example'),'');
 assert.equal(googleFormUrl('javascript:alert(1)'),'');
 assert.equal(submissionFormState({submission_form_url:'https://forms.gle/example'},now),'Submit project on Google Forms');
 assert.equal(submissionFormState({submission_form_url:'https://forms.gle/example',submission_deadline:'2026-11-21T10:00:00Z'},now),'Submissions closed');
 assert.equal(submissionFormState({submission_form_url:'https://forms.gle/example',submission_opens_at:'2026-11-22T10:00:00Z'},now),'Submissions open soon');
 const base={is_community:true,status:'published',starts_at:'2026-11-22T10:00:00Z',registration_mode:'native',deadline:'2026-11-21T10:00:00Z'};
 assert.equal(registrationState(base,now),'Registration Closed');
 assert.equal(registrationState({...base,deadline:'2026-11-21T10:00:01Z'},now),'Register');
 assert.equal(registrationState({...base,registration_mode:'announced',deadline:null},now),'Registration opens soon');
 assert.equal(registrationState({...base,starts_at:'2026-11-20T10:00:00Z'},now),'Event Completed');
 assert.equal(submissionOpen({submission_opens_at:'2026-11-20T10:00:00Z',submission_deadline:'2026-11-21T10:00:00Z'},now),false);
 const events=[{...base,id:'later',starts_at:'2026-11-23T10:00:00Z'},{...base,id:'near'},{...base,id:'draft',status:'draft'},{...base,id:'external',is_community:false},{...base,id:'old',starts_at:'2026-11-19T10:00:00Z'},{...base,id:'recent',starts_at:'2026-11-20T10:00:00Z'}];
 const result=splitEvents(events,now);assert.deepEqual(result.upcoming.map(e=>e.id),['near','later']);assert.deepEqual(result.past.map(e=>e.id),['recent','old']);assert.deepEqual(splitEvents([],now),{upcoming:[],past:[]});
 assert.equal(fromIstInput('2026-11-21T15:30'),'2026-11-21T10:00:00.000Z');assert.equal(toIstInput('2026-11-21T10:00:00Z'),'2026-11-21T15:30');assert.equal(httpsUrl('javascript:alert(1)'),'');assert.equal(escapeHtml('<img>'),'&lt;img&gt;');
});

test('real PostgreSQL migration, RLS and registration/submission lifecycle',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of ['001_outlier.sql','002_registration_details.sql','003_community_events.sql','004_multicollege.sql']) await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
 for(let i=0;i<ids.length;i++) await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`,[ids[i],i===0?'tanishakiran0909@gmail.com':`student${i}@example.test`,JSON.stringify({full_name:i===0?'Tanisha Kiran':`Student ${i}`,usn:`USN${i}`,department:'Computer Science',year:2})]);
 await db.exec(await readFile(new URL('../supabase/admin_access.sql',import.meta.url),'utf8'));
 await db.exec(`update public.profiles set whatsapp_acknowledged_at=now();`);
 const as=async(role,id='')=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.exec(`set role ${role}`);};
 await as('anon');assert.equal((await db.query('select * from public.events')).rows.length,0);
 await assert.rejects(db.exec(`insert into public.events(slug,title,organizer,description,mode) values('bad','Bad event','OUTLIER','This should not be accepted','online')`),/permission denied/);
 await as('authenticated',ids[1]);assert.equal((await db.query('select public.is_admin() as admin')).rows[0].admin,false);
 await assert.rejects(db.exec(`insert into public.events(slug,title,organizer,description,mode) values('bad','Bad event','OUTLIER','This should not be accepted','online')`),/row-level security/);
 await as('authenticated',ids[0]);assert.equal((await db.query('select public.is_admin() as admin')).rows[0].admin,true);
 await db.exec(`insert into public.events(slug,title,organizer,description,mode,is_community,status) values('play-for-a-purpose','Play for a Purpose','OUTLIER','A test event for registration lifecycle.','offline',true,'draft')`);
 const eid=(await db.query(`update public.events set status='published',registration_mode='native',starts_at=now()+interval '1 day',ends_at=now()+interval '2 days',deadline=now()+interval '1 hour',capacity=2,min_team=2,max_team=2,submission_opens_at=now()-interval '1 hour',submission_deadline=now()+interval '2 hours',registration_questions='[{"id":"purpose","label":"Your motivation?","type":"text","required":true}]' where slug='play-for-a-purpose' returning id`)).rows[0].id;
 await db.query(`insert into public.event_photos(event_id,image_url,alt,status) values($1,'https://example.test/photo.jpg','Students building a game','published'),($1,'https://example.test/draft.jpg','A private photo','draft')`,[eid]);
 await as('anon');assert.equal((await db.query('select * from public.events')).rows.length,1);assert.equal((await db.query('select * from public.event_photos')).rows.length,1);assert.equal((await db.query('select * from public.opportunity_catalog')).rows.length,0);
 await assert.rejects(db.exec('select * from public.event_participants'),/permission denied/);
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/005_rsvp_notifications.sql',import.meta.url),'utf8'));
 const register=async(kind='solo',code='',answers={purpose:'Learn and build',github:'https://github.com/student',linkedin:'https://www.linkedin.com/in/student',motivation:'I want to learn and build games.'})=>(await db.query(`select public.register_for_event($1,$2,'Orbit team',$3,'9876543210',$4,true,false) as id`,[eid,kind,code,JSON.stringify(answers)])).rows[0].id;
 await as('authenticated',ids[1]);await assert.rejects(register('solo','',{}),/Please answer/);
 await assert.rejects(db.query(`select public.register_for_event($1,'solo','','','9876543210','{}',false,false)`,[eid]),/Accept the event rules/);
 await assert.rejects(register('team','',{purpose:'Build',github:'https://evil.test/me',linkedin:'https://linkedin.com/in/student',motivation:'I want to build games.'}),/GitHub/);
 await db.exec('reset role');assert.equal((await db.query('select * from public.rsvp_email_queue')).rows.length,0);
 await as('authenticated',ids[1]);
 const rid=await register('team');await assert.rejects(register(),/already registered/);
 const code=(await db.query('select invite_code from public.event_registrations')).rows[0].invite_code;
 const payload={title:'Purpose game',overview:'A playable game that helps students learn recycling.',repository_url:'https://example.test/repo',demo_url:'https://example.test/demo'};
 const submit=async(finalize=true)=>db.query('select public.save_event_submission($1,$2,$3)',[rid,JSON.stringify(payload),finalize]);
 await submit(false);await assert.rejects(submit(),/team-size/);
 await as('authenticated',ids[2]);assert.equal((await db.query('select * from public.event_registrations')).rows.length,0);await assert.rejects(register('team','invalid'),/Invalid team/);assert.equal(await register('team',code),rid);
 assert.equal((await db.query('select * from public.event_participants')).rows.length,1);assert.equal((await db.query('select * from public.registration_roster($1)',[rid])).rows.length,2);
 await assert.rejects(submit(),/Only the registered/);
 await as('authenticated',ids[3]);await assert.rejects(register(),/full/);
 await as('authenticated',ids[1]);await submit();assert.equal((await db.query('select status from public.event_submissions')).rows[0].status,'submitted');
 await assert.rejects(db.exec(`update public.event_submissions set status='draft'`),/permission denied/);
 await as('authenticated',ids[0]);await assert.rejects(db.query('update public.events set capacity=1 where id=$1',[eid]),/below current attendance/);
 await db.query(`update public.events set capacity=3,deadline=now()-interval '1 second',submission_deadline=now()-interval '1 second' where id=$1`,[eid]);
 await as('authenticated',ids[3]);await assert.rejects(register(),/not open/);
 await as('authenticated',ids[1]);await assert.rejects(submit(),/submissions are closed/);
 await as('authenticated',ids[0]);assert.equal((await db.query('select * from public.event_participants')).rows.length,2);
 await assert.rejects(db.query('select * from public.rsvp_email_queue'),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query('select * from public.rsvp_email_queue')).rows.length,1);await as('authenticated',ids[0]);
 await db.query(`update public.events set status='draft' where id=$1`,[eid]);
 await as('anon');assert.equal((await db.query('select * from public.events')).rows.length,0);assert.equal((await db.query('select * from public.event_photos')).rows.length,0);
 await as('authenticated',ids[0]);
 const soloEvent=(await db.query(`insert into public.events(slug,title,organizer,description,mode,is_community,status,participation,registration_mode,starts_at,ends_at,deadline,submission_opens_at,submission_deadline) values('solo-test','Solo test event','OUTLIER','An event for testing solo participation.','online',true,'published','solo','native',now()+interval '1 day',now()+interval '2 days',now()+interval '1 hour',now()-interval '1 hour',now()+interval '1 hour') returning id`)).rows[0].id;
 await as('authenticated',ids[3]);
 await assert.rejects(db.query(`select public.register_for_event($1,'team','Team name','','9876543210','{}',true,false)`,[soloEvent]),/Invalid participation/);
 const soloRegistration=(await db.query(`select public.register_for_event($1,'solo','','','9876543210','{}',true,false) as id`,[soloEvent])).rows[0].id;
 await db.query('select public.save_event_submission($1,$2,true)',[soloRegistration,JSON.stringify(payload)]);
 assert.equal((await db.query('select status from public.event_submissions where registration_id=$1',[soloRegistration])).rows[0].status,'submitted');
 await as('authenticated',ids[0]);
 await db.exec(`insert into public.events(slug,title,organizer,description,mode,status,deadline,apply_url,source_url) values('external-test','External opportunity','Other organizer','An unchanged external opportunity listing.','online','published',now()+interval '1 day','https://example.test/apply','https://example.test/source')`);
 await as('anon');assert.equal((await db.query('select title from public.opportunity_catalog')).rows[0].title,'External opportunity');

 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/005_simple_event_submissions.sql',import.meta.url),'utf8'));
 await as('authenticated',ids[1]);
 await assert.rejects(db.query('select public.save_event_submission($1,$2,true)',[rid,JSON.stringify(payload)]),/permission denied/);
 await assert.rejects(db.query("insert into public.event_winners(event_id,place,entry_name,project_title) values($1,1,'Our team','Our project')",[eid]),/row-level security/);
 await as('authenticated',ids[0]);
 await assert.rejects(db.query("update public.events set submission_form_url='https://forms.gle.evil.test/form' where id=$1",[eid]),/check constraint/);
 await db.query("update public.events set submission_form_url='https://forms.gle/test-form' where id=$1",[eid]);
 const wid=(await db.query("insert into public.event_winners(event_id,place,entry_name,project_title,project_url) values($1,1,'Orbit team','Purpose game','https://drive.google.com/file/d/example/view') returning id",[eid])).rows[0].id;
 assert.equal((await db.query('select count(*)::int as n from public.event_participants')).rows[0].n,3);
 assert.equal((await db.query('select count(distinct invite_code)::int as n from public.event_registrations')).rows[0].n,2);
 await as('anon');assert.equal((await db.query('select * from public.event_winners')).rows.length,0);
 await as('authenticated',ids[0]);await db.query("update public.event_winners set status='published' where id=$1",[wid]);
 await as('anon');assert.equal((await db.query('select * from public.event_winners')).rows.length,0);
 await as('authenticated',ids[0]);await db.query("update public.events set status='published' where id=$1",[eid]);
 await as('anon');assert.equal((await db.query('select project_title from public.event_winners')).rows[0].project_title,'Purpose game');
 await as('authenticated',ids[0]);await db.query("update public.event_winners set project_title='Updated project' where id=$1",[wid]);
 await as('anon');assert.equal((await db.query('select project_title from public.event_winners')).rows[0].project_title,'Updated project');
 await as('authenticated',ids[0]);await db.query("update public.event_winners set status='draft' where id=$1",[wid]);
 await as('anon');assert.equal((await db.query('select * from public.event_winners')).rows.length,0);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/006_registration_references.sql',import.meta.url),'utf8'));
 const references=(await db.query('select reference_code from public.event_registrations order by reference_code')).rows;assert.equal(references.length,2);assert.match(references[0].reference_code,/^PFP-AI[0-9]{3,}$/);
 await db.exec(await readFile(new URL('../supabase/007_reference_format.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/008_participant_emails.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select 'PFP-AI'||lpad(n::text,greatest(3,length(n::text)),'0') as code from (values (1),(999),(1000)) v(n)")).rows.map(r=>r.code).join(','),'PFP-AI001,PFP-AI999,PFP-AI1000');
 await as('authenticated',ids[0]);await db.query("update public.events set deadline=now()+interval '1 hour' where id=$1",[eid]);
 await as('authenticated',ids[3]);const newReg=(await db.query("select public.register_for_event($1,'team','Another team','','9876543210',$2,true,false,$3) as id",[eid,JSON.stringify({purpose:'Build',github:'https://github.com/student',linkedin:'https://linkedin.com/in/student',motivation:'I want to build games.'}),JSON.stringify([{name:'Friend Name',email:'friend@example.test'}])])).rows[0].id;
 assert.equal((await db.query('select reference_code from public.event_registrations where id=$1',[newReg])).rows[0].reference_code,'PFP-AI003');
 assert.equal((await db.query('select * from public.event_invited_members')).rows.length,1);
 await as('authenticated',ids[1]);assert.equal((await db.query('select * from public.event_invited_members')).rows.length,0);
 assert.equal((await db.query('select * from public.event_email_outbox')).rows.length,0);
 await db.exec('reset role');
 const queued=(await db.query('select kind,recipient,payload from public.event_email_outbox order by kind')).rows;
 assert.deepEqual(queued.map(row=>row.kind),['admin','confirmation','invitation']);
 assert.equal(queued[2].recipient,'friend@example.test');
 assert.equal(queued[1].payload.confirmed,1);
 assert.equal(queued[1].payload.reference,'PFP-AI003');
 assert.equal((await db.query('select * from public.claim_event_emails()')).rows.length,3);
 assert.equal((await db.query('select * from public.claim_event_emails()')).rows.length,0);
 await db.exec(await readFile(new URL('../supabase/012_email_delivery_pause.sql',import.meta.url),'utf8'));
 await db.exec("update public.event_email_outbox set available_at=now()-interval '1 minute',first_attempt_at=null");
 assert.equal((await db.query('select * from public.claim_event_emails()')).rows.length,0);
 await db.exec("update public.event_email_outbox set bounced_at=now() where kind='confirmation'; update public.email_delivery_settings set enabled=true");
 const resumed=(await db.query('select * from public.claim_event_emails()')).rows;
 assert.equal(resumed.length,2);
 assert.ok(resumed.every(row=>row.kind!=='confirmation'));
 await db.exec("update public.event_email_outbox set available_at=now()-interval '1 minute',first_attempt_at=now()-interval '24 hours'");
 assert.equal((await db.query('select * from public.claim_event_emails()')).rows.length,0);
 } finally {await db.close();}
});
