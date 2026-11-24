import { client } from './onboarding.js';
import { escapeHtml as esc, eventCoverUrl, eventImageUrl, ist, completed } from './event-model.js';
import './event-announcements.css';

export async function showEventAnnouncement() {
  if (!client || document.querySelector('.outlier-announcement')) return;
  try {
    const preview=import.meta.env.DEV && new URLSearchParams(location.search).get('previewAnnouncement')==='1';
    let query=client.from('events').select('id,slug,title,starts_at,ends_at,cover_url,mode,location').eq('is_community',true).eq('status','published');
    if(!preview)query=query.gte('starts_at',new Date().toISOString());
    const {data,error}=await query.order('starts_at').limit(20);
    if(error) return;
    const seen=key=>{try{return localStorage.getItem(key)==='seen';}catch{return false;}};
    const key=e=>`outlier-announcement:${e.id}:${e.starts_at}`;
    const event=preview?data?.[0]:(data||[]).find(e=>!completed(e)&&!seen(key(e)));
    if(!event)return;
    const dialog=document.createElement('dialog');dialog.className='outlier-announcement';dialog.setAttribute('aria-labelledby','announcement-title');
    dialog.innerHTML=`<button type="button" class="announcement-close" aria-label="Dismiss event announcement">×</button>${eventCoverUrl(event)?`<img src="${esc(eventCoverUrl(event))}" referrerpolicy="no-referrer" alt="${esc(event.title)} event poster">`:'<div class="announcement-symbol" aria-hidden="true">✳</div>'}<div class="announcement-body"><p class="announcement-kicker">NEW AT OUTLIER</p><h2 id="announcement-title">${esc(event.title)}</h2><p>${esc(ist(event.starts_at))}</p><p>${esc(event.mode==='online'?'Online':event.location||'Venue to be announced')}</p><div class="announcement-actions"><a href="/events/${encodeURIComponent(event.slug)}">View event</a><button type="button" class="announcement-later">Not now</button></div><p class="announcement-note">Discover more in the Events menu.</p></div>`;
    dialog.querySelector('img')?.addEventListener('error',e=>{e.currentTarget.hidden=true;});
    if(preview)dialog.querySelector('.announcement-kicker').textContent='DESIGN PREVIEW · EXISTING EVENT';
    const remember=()=>{if(preview)return;try{localStorage.setItem(key(event),'seen');}catch{}};
    dialog.querySelector('.announcement-close').onclick=()=>dialog.close();
    dialog.querySelector('.announcement-later').onclick=()=>dialog.close();
    dialog.querySelector('a').onclick=remember;
    dialog.addEventListener('close',()=>{remember();dialog.remove();});
    document.body.append(dialog);dialog.showModal();
  } catch { /* An announcement must never prevent using the website. */ }
}
