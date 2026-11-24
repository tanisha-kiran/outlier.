import { createClient } from 'npm:@supabase/supabase-js@2';
import { participantEmail } from './email-content.js';
import nodemailer from 'npm:nodemailer@7';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error(`Missing ${name}`);return value;};
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('POST required',{status:405});
 const secret=Deno.env.get('RSVP_CRON_SECRET');
 if(!secret||request.headers.get('x-rsvp-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 try {
  const base=new URL(Deno.env.get('OUTLIER_SITE_URL')||'https://outlier.acs-community.workers.dev');if(base.protocol!=='https:')throw Error('Use the public HTTPS website URL');
  const gmailUser=env('GMAIL_USER');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
   auth:{user:gmailUser,pass:env('GMAIL_APP_PASSWORD').replace(/\s/g,'')},
   connectionTimeout:5000,greetingTimeout:5000,socketTimeout:8000});
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
  const {data:jobs,error}=await db.rpc('claim_event_emails');if(error)throw error;
  let sent=0,failed=0;
  for(const job of jobs||[]) {
   try {
    const email=participantEmail(job,base.origin);
    const receipt=await transport.sendMail({from:{name:'OUTLIER Community',address:gmailUser},to:email.recipient,
     replyTo:gmailUser,messageId:`<outlier-${job.id}@gmail.com>`,subject:email.subject,text:email.text,html:email.html});
    if(!receipt.accepted?.length)throw Error('Gmail did not accept the recipient');
    const {error:save}=await db.from('event_email_outbox').update({sent_at:new Date().toISOString(),provider_id:receipt.messageId,last_error:null}).eq('id',job.id);if(save)throw save;
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
