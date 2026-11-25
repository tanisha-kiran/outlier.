// SMTP acceptance is not inbox delivery; asynchronous Gmail bounces need review.
export function deliveryFailure(error, accepted=false) {
 const code=Number(error?.responseCode||0);
 if(accepted)return {bounce:false,reason:'Gmail accepted a message but its database receipt could not be saved. Review before retrying.'};
 if(code>=500&&code<600)return {bounce:error?.command==='RCPT TO'||error?.command==='DATA',reason:`Gmail rejected sending (SMTP ${code}). Organizer review required.`};
 return {bounce:false,reason:code?`Gmail deferred sending (SMTP ${code}). Organizer review required.`:'Email transport failed. Delivery may be uncertain; review before retrying.'};
}
