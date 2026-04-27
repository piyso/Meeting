// Scroll reveal
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Nav scroll
const nav = document.querySelector('.hero-nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
});

// Role tabs
document.querySelectorAll('.role-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.role;
    document.querySelector(`.role-card[data-role="${target}"]`).classList.add('active');
    // Update glass
    document.querySelectorAll('.role-tab').forEach(t => {
      t.classList.remove('liquid-glass-strong');
      t.classList.add('liquid-glass');
    });
    tab.classList.remove('liquid-glass');
    tab.classList.add('liquid-glass-strong');
  });
});

// Copy terminal command
document.querySelector('.copy-btn')?.addEventListener('click', function() {
  navigator.clipboard.writeText('sudo xattr -cr /Applications/BlueArkive.app');
  this.textContent = 'Copied!';
  setTimeout(() => this.textContent = 'Copy', 1500);
});

// Typing animation for engine demo
const engineText = document.querySelector('.engine-text');
if (engineText) {
  const fullText = engineText.dataset.text;
  let i = 0;
  engineText.textContent = '';
  function typeChar() {
    if (i < fullText.length) {
      engineText.textContent += fullText[i];
      i++;
      setTimeout(typeChar, 25 + Math.random() * 35);
    }
  }
  const engineObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { typeChar(); engineObserver.disconnect(); }
  }, { threshold: 0.5 });
  engineObserver.observe(engineText);
}

// Counter animation
document.querySelectorAll('[data-count]').forEach(el => {
  const target = parseInt(el.dataset.count);
  const countObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      let current = 0;
      const step = Math.ceil(target / 60);
      const interval = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(interval); }
        el.textContent = current.toLocaleString();
      }, 20);
      countObserver.disconnect();
    }
  }, { threshold: 0.5 });
  countObserver.observe(el);
});

// Mobile menu
document.querySelector('.menu-btn')?.addEventListener('click', () => {
  const links = document.querySelector('.nav-links');
  links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
  links.style.flexDirection = 'column';
  links.style.position = 'absolute';
  links.style.top = '100%';
  links.style.right = '2rem';
  links.style.background = 'rgba(0,0,0,0.8)';
  links.style.backdropFilter = 'blur(20px)';
  links.style.padding = '1rem';
  links.style.borderRadius = '1rem';
  links.style.gap = '0.75rem';
});
