export function emailDeliveryStatus(mail, paused=false, sendFrom=null) {
 if(mail.bounced_at)return 'Bounced — not delivered';
 if(mail.sent_at)return 'Accepted by Gmail — delivery unverified';
 if(sendFrom&&Date.parse(mail.created_at)<Date.parse(sendFrom))return 'Held from earlier queue';
 if(mail.last_error)return 'Needs organizer review';
 if(paused)return 'On hold — sending paused';
 if(mail.first_attempt_at)return 'Attempted — delivery unverified';
 return 'Queued';
}
