// Community events are public; only registration/submission requests invoke onboarding.
import './style.css';
if (/^\/events(?:\/|$)/.test(location.pathname)) {
  import('./community-events.js').then(m => m.startEvents());
} else {
  import('./main.js').then(async () => {
    const { setupNavigation } = await import('./navigation.js');
    setupNavigation();
  });
}
