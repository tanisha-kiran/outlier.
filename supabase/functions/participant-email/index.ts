import { createClient } from 'npm:@supabase/supabase-js@2';
import { participantEmail } from './email-content.js';
import { deliveryFailure } from './delivery-failure.js';
import nodemailer from 'npm:nodemailer@7';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error(`Missing ${name}`);return value;};
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('POST required',{status:405});
 const secret=Deno.env.get('RSVP_CRON_SECRET');
 try {
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
  const token=request.headers.get('x-rsvp-cron-secret');
  const supplied=request.headers.get('apikey');
  const serverKeys=Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'));
  if(request.headers.get('x-configure-cron')==='true'&&supplied&&serverKeys.includes(supplied)){
   const {error}=await db.rpc('configure_rsvp_cron',{token:env('RSVP_CRON_SECRET')});
   return Response.json({configured:!error},{status:error?409:200});
  }
  if(!token)return new Response('Unauthorized',{status:401});
  if(!secret||token!==secret){
   const {data:allowed,error}=await db.rpc('rsvp_cron_authorized',{token});
   if(error||allowed!==true)return new Response('Unauthorized',{status:401});
  }
  const gmailUser=env('GMAIL_USER');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
   auth:{user:gmailUser,pass:env('GMAIL_APP_PASSWORD').replace(/\s/g,'')},
   connectionTimeout:5000,greetingTimeout:5000,socketTimeout:8000});
  const {data:jobs,error}=await db.rpc('claim_event_emails');if(error)throw error;
  let sent=0,failed=0;
  for(const job of jobs||[]) {
   let accepted=false;
   try {
    const email=participantEmail(job,gmailUser);
    const receipt=await transport.sendMail({from:{name:'OUTLIER Community',address:gmailUser},to:email.recipient,
     replyTo:gmailUser,subject:email.subject,text:email.text});
    if(!receipt.accepted?.length)throw Error('Gmail did not accept the recipient');
    accepted=true;
    const {error:save}=await db.from('event_email_outbox').update({sent_at:new Date().toISOString(),provider_id:receipt.messageId,last_error:null}).eq('id',job.id);if(save)throw save;
    sent++;
   } catch(error) {
    failed++;
    const failure=deliveryFailure(error,accepted);
    // Stop the batch on transport rejection instead of repeating it to students.
    await db.from('email_delivery_settings').update({enabled:false,reason:failure.reason}).eq('id',true);
    await db.from('event_email_outbox').update({last_error:failure.reason,
     ...(failure.bounce?{bounced_at:new Date().toISOString(),bounce_reason:failure.reason}:{})}).eq('id',job.id);
    break;
   }
   await new Promise(resolve=>setTimeout(resolve,600));
  }
  return Response.json({sent,failed});
 } catch {return Response.json({error:'Email worker setup or queue unavailable'},{status:500});}
});
