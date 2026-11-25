export function emailDeliveryStatus(mail, paused=false, now=Date.now()) {
 if(mail.bounced_at)return 'Bounced — not delivered';
 if(mail.sent_at)return 'Accepted by Gmail — delivery unverified';
 if(paused)return 'On hold — sending paused';
 if(mail.first_attempt_at&&now-Date.parse(mail.first_attempt_at)>23*60*60*1000)return 'Needs organizer review';
 return mail.last_error?'Retry pending':'Queued';
}
