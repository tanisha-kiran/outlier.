import './rsvp-experience.css';
export const rsvpQuestions = [
 {id:'github',label:'GitHub profile link',type:'text',required:true},
 {id:'linkedin',label:'LinkedIn profile link',type:'text',required:true},
 {id:'motivation',label:'Why do you want to join this hackathon?',type:'textarea',required:true}
];
export function questionsFor(event) {
 const questions=event.registration_questions||[];
 return event.slug==='play-for-a-purpose' ? [...questions,...rsvpQuestions.filter(q=>!questions.some(existing=>existing.id===q.id))] : questions;
}
export function starshipBackdrop(event) {
 if(event?.slug==='play-for-a-purpose')document.body.classList.add('game-event');
 if(document.querySelector('.rsvp-space'))return;
 const sky=document.createElement('div'); sky.className='rsvp-space';sky.setAttribute('aria-hidden','true');
 sky.innerHTML=Array.from({length:6},(_,i)=>`<div class="pixel-flight" style="--i:${i}"><svg viewBox="0 0 120 64"><path fill="currentColor" d="M8 24h24V12h16V4h16v16h24v8h24v8H88v8H64v16H48v-8H32V40H8z"/><path fill="#cbeaff" d="M56 24h16v16H56z"/><path fill="#ad86cf" d="M0 28h20v8H0z"/></svg><span></span></div>`).join('');
 document.body.prepend(sky);document.body.classList.add('rsvp-page');
 if(event?.slug==='play-for-a-purpose') {
  const toggle=document.createElement('button');toggle.type='button';toggle.className='space-motion-toggle';
  toggle.textContent='Pause space motion';toggle.setAttribute('aria-pressed','false');
  toggle.onclick=()=>{const paused=document.body.classList.toggle('space-paused');toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'Resume space motion':'Pause space motion';};
  document.body.append(toggle);
 }
}
export function validateRsvpAnswers(answers) {
 for(const [key,host] of [['github','github.com'],['linkedin','linkedin.com']]) {
  let url;try{url=new URL(answers[key]);}catch{throw Error(`Enter a valid ${key==='github'?'GitHub':'LinkedIn'} profile URL.`);}
  if(url.protocol!=='https:'|| ![host,'www.'+host].includes(url.hostname)||(key==='github'&&!/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))||(key==='linkedin'&&!/^\/in\/[^/]+\/?$/.test(url.pathname)))throw Error(`Use your https://${host}/${key==='linkedin'?'in/':''} profile link.`);
 }
 if((answers.motivation||'').trim().length<10)throw Error('Tell us why you want to join in at least 10 characters.');
}
