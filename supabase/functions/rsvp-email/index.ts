import { createClient } from 'npm:@supabase/supabase-js@2';
const env=(key:string)=>{const value=Deno.env.get(key);if(!value)throw new Error(`Missing ${key}`);return value;};
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('POST required',{status:405});
 const secret=Deno.env.get('RSVP_CRON_SECRET');
 // Keep the scheduler credential separate from the platform authorization header.
 // This avoids the gateway rewriting or consuming the cron worker's credential.
 if(!secret||request.headers.get('x-rsvp-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 try {
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
  const {data:jobs,error}=await db.from('rsvp_email_queue').select('id,registration_id').is('sent_at',null).order('created_at').limit(25);if(error)throw error;
  let sent=0;
  for(const job of jobs||[]) {
   const {data:r,error:re}=await db.from('event_registrations').select('event_id,team_name,events(title)').eq('id',job.registration_id).single();if(re)throw re;
   const [{count:members,error:me},{count:total,error:te}]=await Promise.all([
    db.from('event_participants').select('user_id',{count:'exact',head:true}).eq('registration_id',job.registration_id),
    db.from('event_participants').select('user_id',{count:'exact',head:true}).eq('event_id',r.event_id)
   ]);if(me||te)throw me||te;
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json','Idempotency-Key':`team-rsvp-${job.id}`},body:JSON.stringify({from:env('RSVP_FROM_EMAIL'),to:['outlier.community.acs@gmail.com'],subject:`New team RSVP: ${r.team_name}`,text:`${r.team_name} has RSVP’d for ${(r.events as unknown as {title:string})?.title||'your event'}.\n\nTeam participants so far: ${members}\nTotal event participants: ${total}\n\nEach teammate must RSVP separately. Open your OUTLIER organizer dashboard for student emails, profile links and answers.`})});
   if(!response.ok)throw new Error(`Email provider returned ${response.status}`);
   const {error:saveError}=await db.from('rsvp_email_queue').update({sent_at:new Date().toISOString()}).eq('id',job.id);if(saveError)throw saveError;sent++;
  }
  return Response.json({sent});
 }catch(error){console.error(error);return Response.json({error:'Email delivery failed; queued jobs will be retried on the next run.'},{status:500});}
});
