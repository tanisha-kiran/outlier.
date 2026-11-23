// QA-only adapter. Never imported by a standard production build.
import { registrationState } from '../src/event-model.js';
const organizer=location.pathname.startsWith('/events/admin');
const studentNumber=new URLSearchParams(location.search).get('student')||sessionStorage.getItem('outlier-test-student')||'1';
sessionStorage.setItem('outlier-test-student',studentNumber==='2'?'2':'1');
const studentId=studentNumber==='2'?'qa-student-2':'qa-student';
const user={id:organizer?'qa-organizer':studentId,email:organizer?'organizer@example.test':studentNumber==='2'?'teammate@example.test':'student@example.test'};
const key='outlier-qa-events';
const profiles=[{id:'qa-student-2',full_name:'Test Teammate',usn:'TEST002',department:'Computer Science',year:2},{id:'qa-organizer',full_name:'QA Organizer'},{id:'qa-student',full_name:'Test Student',usn:'TEST001',department:'Computer Science',year:2}];
function load(){const saved=JSON.parse(localStorage.getItem(key)||'null')||{};return {events:[],event_photos:[],event_participants:[],event_registrations:[],event_submissions:[],event_winners:[],...saved,profiles};}
const persist=db=>localStorage.setItem(key,JSON.stringify(db));
const fail=message=>({data:null,error:{message}});
class Query{
 constructor(table){this.table=table;this.filters=[];this.operation='read';}
 select(){return this;} eq(k,v){this.filters.push(r=>r[k]===v);return this;} in(k,v){this.filters.push(r=>v.includes(r[k]));return this;} order(){return this;}
 insert(value){this.operation='insert';this.value=value;return this;} update(value){this.operation='update';this.value=value;return this;}
 maybeSingle(){this.singleResult=true;return this;} single(){this.singleResult=true;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{const db=load();let rows=(db[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));if(this.operation!=='read'&&!organizer)return fail('Organizer access required');if(this.operation==='insert'){const r={id:crypto.randomUUID(),created_at:new Date().toISOString(),...this.value};db[this.table].push(r);rows=[r];persist(db);}if(this.operation==='update'){rows.forEach(r=>Object.assign(r,this.value));persist(db);}return {data:this.singleResult?rows[0]||null:rows,error:null};}).then(resolve,reject);}
}
async function rpc(name,args={}){
 const db=load();
 if(name==='is_admin')return {data:organizer,error:null};
 if(name==='registration_roster')return {data:db.event_participants.filter(p=>p.registration_id===args.rid).map(p=>({full_name:p.full_name,is_leader:db.event_registrations.find(r=>r.id===args.rid)?.owner_id===p.user_id})),error:null};

 if(name==='register_for_event'){
  const e=db.events.find(e=>e.id===args.eid);
  if(!e||e.status!=='published'||e.registration_mode!=='native'||registrationState(e)!=='Register')return fail('Registration is not open');
  if(db.event_participants.some(p=>p.event_id===e.id&&p.user_id===user.id))return fail('You are already registered');
  if(e.capacity&&db.event_participants.filter(p=>p.event_id===e.id).length>=e.capacity)return fail('This event is full');
  if(!args.accept_rules)return fail('Accept the event rules');
  for(const q of e.registration_questions||[])if(q.required&&!args.answers_input[q.id])return fail('Please answer: '+q.label);
  let r;
  if(args.join_code){r=db.event_registrations.find(r=>r.event_id===e.id&&r.invite_code===args.join_code&&r.participation==='team');if(!r)return fail('Invalid team invite code');if(db.event_participants.filter(p=>p.registration_id===r.id).length>=e.max_team)return fail('Team is full');}
  else{r={id:crypto.randomUUID(),event_id:e.id,owner_id:user.id,participation:args.kind,team_name:args.team_name_input,reference_code:'PFP-AI'+String(db.event_registrations.length+1).padStart(3,'0'),invite_code:crypto.randomUUID(),created_at:new Date().toISOString()};db.event_registrations.push(r);}
  db.event_participants.push({...profiles.find(p=>p.id===user.id),user_id:user.id,event_id:e.id,registration_id:r.id,email:user.email,college:'Dr. ACS College of Engineering',phone:args.phone_input,answers:args.answers_input,question_snapshot:e.registration_questions||[],consent_at:new Date().toISOString(),photo_consent:args.allow_photos});persist(db);return {data:r.id,error:null};
 }
 return fail('This action is not available in the local demo');
}
export const client={from:table=>new Query(table),rpc,auth:{getUser:async()=>({data:{user}}),signOut:async()=>({error:null})}};
export function startGate({onUnlock}){onUnlock();}
const banner=document.createElement('aside');banner.setAttribute('aria-label','Local test controls');banner.style.cssText='padding:14px 20px;background:#f5b8af;color:#321329;font:16px sans-serif;position:relative;z-index:100';banner.innerHTML='<strong>LOCAL DEMO — '+(organizer?'Organizer':studentNumber==='2'?'Teammate':'Student')+'</strong> · No password needed. Fake data stays in this browser. <a href="/events/admin" style="text-decoration:underline;margin:0 12px">Organizer test</a><a href="/events" style="text-decoration:underline">Student test</a>';document.body.prepend(banner);

if(!organizer){banner.insertAdjacentHTML('beforeend',' · <a href="'+location.pathname+'?student=1">Test student</a> · <a href="'+location.pathname+'?student=2">Test teammate</a>');}
