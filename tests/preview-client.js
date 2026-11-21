// Fake data is confined to the explicitly selected browser-QA config.
const user={id:'qa-organizer',email:'organizer@example.test'};
let db=JSON.parse(localStorage.getItem('outlier-qa-events')||'null')||{events:[],event_photos:[],event_participants:[],event_registrations:[],event_submissions:[],profiles:[{id:user.id,full_name:'QA Organizer'}]};
const persist=()=>localStorage.setItem('outlier-qa-events',JSON.stringify(db));
class Query{
 constructor(table){this.table=table;this.filters=[];this.operation='read';}
 select(){return this;} eq(k,v){this.filters.push(r=>r[k]===v);return this;} in(k,v){this.filters.push(r=>v.includes(r[k]));return this;} order(){return this;}
 insert(value){this.operation='insert';this.value=value;return this;} update(value){this.operation='update';this.value=value;return this;}
 maybeSingle(){this.singleResult=true;return this;} single(){this.singleResult=true;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{let rows=(db[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));if(this.operation==='insert'){const r={id:crypto.randomUUID(),created_at:new Date().toISOString(),...this.value};db[this.table].push(r);rows=[r];persist();}if(this.operation==='update'){rows.forEach(r=>Object.assign(r,this.value));persist();}return {data:this.singleResult?rows[0]||null:rows,error:null};}).then(resolve,reject);}
}
export const client={from:table=>new Query(table),rpc:async name=>({data:name==='is_admin',error:null}),auth:{getUser:async()=>({data:{user}}),signOut:async()=>({error:null})}};
export function startGate({onUnlock}){onUnlock();}
