const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section');
const revealTargets = document.querySelectorAll('section, .project-card, .skill-card, .quote-card, .highlight, .about-card, .process-step, .stat-card, .faq-item, .hero-card');
const year = document.getElementById('year');
const themeToggle = document.getElementById('themeToggle');
const backToTop = document.getElementById('backToTop');

if (year) {
  year.textContent = new Date().getFullYear();
}

document.body.classList.add('page-enter');

const setTheme = (mode) => {
  document.body.setAttribute('data-theme', mode);
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', mode === 'light' ? 'true' : 'false');
  }
};

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    setTheme(next);
  });
}

let ambient = document.querySelector('.ambient');
if (!ambient) {
  ambient = document.createElement('div');
  ambient.className = 'ambient';
  document.body.prepend(ambient);
}

const updateAmbientPosition = (x, y) => {
  document.documentElement.style.setProperty('--ambient-x', `${x}%`);
  document.documentElement.style.setProperty('--ambient-y', `${y}%`);
};

const updateAmbientScroll = () => {
  const offset = window.scrollY * -0.08;
  document.documentElement.style.setProperty('--ambient-translate', `${offset}px`);
};

updateAmbientScroll();
window.addEventListener('scroll', updateAmbientScroll);

const hoverTargets = document.querySelectorAll('.project-card, .skill-card, .quote-card, .highlight, .process-step, .stat-card, .faq-item, .hero-card');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

hoverTargets.forEach((el, index) => {
  const hue = (190 + index * 28) % 360;
  el.dataset.ambientColor = `hsla(${hue}, 85%, 65%, 0.35)`;

  el.addEventListener('mouseenter', () => {
    document.body.classList.add('ambient-active');
    document.documentElement.style.setProperty('--ambient-color', el.dataset.ambientColor);
    el.classList.add('tilt', 'is-tilting');
  });

  el.addEventListener('mousemove', (event) => {
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    updateAmbientPosition(x.toFixed(2), y.toFixed(2));

    if (prefersReducedMotion) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width;
    const relY = (event.clientY - rect.top) / rect.height;
    const tiltX = (relY - 0.5) * 6;
    const tiltY = (relX - 0.5) * -6;
    el.style.transform = `perspective(700px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    el.style.setProperty('--glow-x', `${(relX * 100).toFixed(0)}%`);
    el.style.setProperty('--glow-y', `${(relY * 100).toFixed(0)}%`);
  });

  el.addEventListener('mouseleave', () => {
    document.body.classList.remove('ambient-active');
    el.classList.remove('is-tilting');
    el.style.transform = '';
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.2 }
);

revealTargets.forEach((item, index) => {
  item.classList.add('reveal', `stagger-${(index % 5) + 1}`);
  observer.observe(item);
});

window.addEventListener('scroll', () => {
  const scrollPos = window.scrollY + 120;
  sections.forEach((section) => {
    if (scrollPos >= section.offsetTop && scrollPos < section.offsetTop + section.offsetHeight) {
      navLinks.forEach((link) => link.classList.remove('active'));
      const active = document.querySelector(`.nav-link[href="#${section.id}"]`);
      if (active) {
        active.classList.add('active');
      }
    }
  });

  if (backToTop) {
    const canScroll = document.documentElement.scrollHeight > window.innerHeight + 120;
    if (canScroll && window.scrollY > 200) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
  }
});

if (backToTop) {
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

const trackPageview = async () => {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'dashboard.html') {
    return;
  }

  try {
    await fetch('/.netlify/functions/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Ignore tracking errors to avoid affecting UX.
  }
};

trackPageview();
