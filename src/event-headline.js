import { client } from './onboarding.js';
import { escapeHtml, registrationState, httpsUrl, isSoldOut } from './event-model.js';
import './event-headline.css';

export function startEventHeadline() {
  const bar = document.createElement('aside');
  bar.className = 'event-headline';
  bar.setAttribute('aria-label', 'Upcoming OUTLIER events');
  bar.innerHTML = '<span class="headline-label">✳ UP NEXT</span><div class="headline-window"><div class="headline-track"></div></div><button type="button" aria-label="Pause event headlines">Ⅱ</button>';
  document.querySelector('#app').prepend(bar);
  document.querySelector('#app').classList.add('has-event-headline');
  const track = bar.querySelector('.headline-track');
  const button = bar.querySelector('button');
  let signature;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const applyPause = () => {
    bar.classList.toggle('is-paused', paused);
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} event headlines`);
  };
  button.onclick = () => { paused = !paused; applyPause(); };
  applyPause();
  function render(items) {
    items = items.map(item => typeof item === 'string' ? {text:item} : item);
    const content = items.map(item => `<span class="headline-item">${escapeHtml(item.text)} ${item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)} ↗</a>` : ''} <span aria-hidden="true">✳</span></span>`).join('');
    if (signature === content) return;
    signature = content;
    track.innerHTML = `<div class="headline-group">${content}</div><div class="headline-group" aria-hidden="true">${content.replaceAll('<a href=', '<a tabindex="-1" href=')}</div>`;
    track.style.animationDuration = `${Math.max(28, items.map(item=>item.text).join('').length / 5)}s`;
  }
  render(['Discover what’s next at OUTLIER — upcoming announcements appear here']);
  async function refresh() {
    if (!client || document.hidden) return;
    try {
      const { data, error } = await client.from('events')
        .select('title,slug,starts_at,ends_at,deadline,registration_opens_at,registration_mode,participation,apply_url').eq('is_community', true).eq('status', 'published')
        .gte('starts_at', new Date().toISOString()).order('starts_at').limit(10);
      if (error) throw error;
      const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      render(data?.length ? data.map(event => {
        const soldOut = isSoldOut(event);
        const open = !soldOut && registrationState(event) === 'Register';
        const team = event.participation !== 'solo';
        const native = event.registration_mode === 'native';
        return {text: `${event.title} · ${date.format(new Date(event.starts_at))}${soldOut ? ' · SOLD OUT' : ''}`,
          href: open ? (native ? `/events/${encodeURIComponent(event.slug)}/register${team ? '?participation=team' : ''}` : httpsUrl(event.apply_url) || `/events/${encodeURIComponent(event.slug)}`) : `/events/${encodeURIComponent(event.slug)}`,
          label: open ? (native && team ? 'RSVP your team' : 'RSVP now') : registrationState(event)};
      })
        : ['No upcoming events published yet — check back soon.']);
    } catch {
      render(['Stay connected with OUTLIER — event updates are temporarily unavailable']);
    }
  }
  refresh();
  const timer = setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
