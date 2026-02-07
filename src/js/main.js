const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section');
const revealTargets = document.querySelectorAll('section, .project-card, .skill-card, .quote-card, .highlight, .about-card');
const year = document.getElementById('year');
const themeToggle = document.getElementById('themeToggle');

if (year) {
  year.textContent = new Date().getFullYear();
}

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
});
