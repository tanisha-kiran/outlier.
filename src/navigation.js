import './events.css';
export function setupNavigation() {
  const nav = document.querySelector('.nav nav');
  if (!nav) return;
  nav.id = 'main-navigation';
  nav.innerHTML = `<a href="/#opportunities">Discover</a><details class="events-menu"><summary>Events</summary><div><a href="/events">All Events</a><a href="/events#upcoming">Upcoming Events</a><a href="/events#past">Past Events &amp; Results</a><a href="/events#gallery">Gallery</a></div></details><a href="/events/me">My events</a><a href="/#community">Our Community</a><a href="/#about">About</a>`;
  const toggle = document.createElement('button');
  toggle.className = 'mobile-menu'; toggle.textContent = 'Menu';
  toggle.setAttribute('aria-controls', nav.id); toggle.setAttribute('aria-expanded', 'false');
  nav.before(toggle);
  const close = () => { nav.classList.remove('mobile-open'); toggle.setAttribute('aria-expanded', 'false'); nav.querySelector('details').open = false; };
  toggle.onclick = () => { const open = nav.classList.toggle('mobile-open'); toggle.setAttribute('aria-expanded', String(open)); };
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const summary = nav.querySelector('summary'); const wasOpen = nav.querySelector('details').open; const mobile = nav.classList.contains('mobile-open'); close(); if (mobile) toggle.focus(); else if (wasOpen) summary.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.nav')) close(); });
}
