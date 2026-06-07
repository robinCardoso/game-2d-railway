import './landing.css';
import { getSession } from '../shared/authGuard';
import { track } from '../shared/analytics';
import { initDesktopClientShell } from '../ui/initDesktopClient';

initDesktopClientShell();
track('landing_view');

void (async () => {
    const session = await getSession();
    if (session) {
        location.href = 'characters.html';
    }
})();

document.querySelectorAll<HTMLAnchorElement>('[data-cta-play]').forEach((el) => {
    el.addEventListener('click', () => {
        track('cta_play_click', { label: el.textContent?.trim() ?? 'play' });
    });
});

const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-nav]');
const sections = ['inicio', 'noticias', 'ranking', 'comunidade', 'suporte'];

function setActiveNav(id: string): void {
    navLinks.forEach((link) => {
        const href = link.getAttribute('href')?.replace('#', '') ?? '';
        link.classList.toggle('active', href === id);
    });
}

if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
        (entries) => {
            const visible = entries
                .filter((e) => e.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (visible?.target.id) {
                setActiveNav(visible.target.id);
            }
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5] }
    );
    sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });
}

const navToggle = document.getElementById('landingNavToggle');
const nav = document.querySelector('.landing-nav');
navToggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') ?? false;
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
navLinks.forEach((link) => {
    link.addEventListener('click', () => {
        nav?.classList.remove('is-open');
        navToggle?.setAttribute('aria-expanded', 'false');
    });
});

const trailerSection = document.getElementById('trailer');
const trailerBtn = document.getElementById('trailerBtn');
const trailerClose = document.getElementById('trailerClose');
const trailerBackdrop = document.getElementById('trailerBackdrop');

function openTrailer(): void {
    if (!trailerSection) return;
    trailerSection.hidden = false;
    track('trailer_open');
}

function closeTrailer(): void {
    if (!trailerSection) return;
    trailerSection.hidden = true;
}

trailerBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openTrailer();
});

trailerClose?.addEventListener('click', closeTrailer);
trailerBackdrop?.addEventListener('click', closeTrailer);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trailerSection && !trailerSection.hidden) {
        closeTrailer();
    }
});
