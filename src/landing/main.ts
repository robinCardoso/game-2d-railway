import './landing.css';
import { getSession } from '../shared/authGuard';
import { track } from '../shared/analytics';

track('landing_view');

void (async () => {
    const session = await getSession();
    if (session) {
        location.href = 'characters.html';
        return;
    }
})();

document.getElementById('ctaPlay')?.addEventListener('click', () => {
    track('cta_play_click');
});
