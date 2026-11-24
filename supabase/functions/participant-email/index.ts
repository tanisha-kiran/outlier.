import { createClient } from 'npm:@supabase/supabase-js@2';
import { participantEmail } from './email-content.js';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error(`Missing ${name}`);return value;};
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('POST required',{status:405});
 const secret=Deno.env.get('RSVP_CRON_SECRET');
 if(!secret||request.headers.get('x-rsvp-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 try {
  const base=new URL(env('OUTLIER_SITE_URL'));if(base.protocol!=='https:')throw Error('Use the public HTTPS website URL');
  const from=env('RSVP_FROM_EMAIL'),key=env('RESEND_API_KEY');
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
  const {data:jobs,error}=await db.rpc('claim_event_emails');if(error)throw error;
  let sent=0,failed=0;
  for(const job of jobs||[]) {
   try {
    const email=participantEmail(job,base.origin);
    const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`outlier-participant-${job.id}`},body:JSON.stringify({from,to:[email.recipient],reply_to:'outlier.community.acs@gmail.com',subject:email.subject,text:email.text,html:email.html})});
    if(!result.ok)throw Error(`Email provider returned ${result.status}`);
    const receipt=await result.json();
    const {error:save}=await db.from('event_email_outbox').update({sent_at:new Date().toISOString(),provider_id:receipt.id,last_error:null}).eq('id',job.id);if(save)throw save;
    sent++;
   } catch(error) {
    failed++;
    await db.from('event_email_outbox').update({last_error:error instanceof Error?error.message:'Delivery failed'}).eq('id',job.id);
   }
   await new Promise(resolve=>setTimeout(resolve,600));
  }
  return Response.json({sent,failed});
 } catch {return Response.json({error:'Email worker setup or queue unavailable'},{status:500});}
});
