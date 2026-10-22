(function () {
  var lightbox = document.getElementById('lightbox');
  var image = document.getElementById('lightbox-img');
  var caption = document.getElementById('lightbox-caption');
  var closeBtn = lightbox ? lightbox.querySelector('.lightbox-close') : null;
  var lastFocused = null;
  var nav = document.getElementById('site-nav');
  var navToggle = document.querySelector('.nav-toggle');

  function setNav(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  if (nav && navToggle) {
    navToggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setNav(false);
    });
    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || navToggle.contains(event.target)) return;
      setNav(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 880) setNav(false);
    });
  }

  function open(source, text) {
    if (!lightbox) return;
    lastFocused = document.activeElement;
    image.src = source;
    image.alt = text || '';
    caption.textContent = text || '';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    if (!lightbox) return;
    lightbox.hidden = true;
    image.src = '';
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    gallery.addEventListener('click', function (event) {
      var shot = event.target.closest('.shot');
      if (!shot) return;
      open(shot.getAttribute('data-full'), shot.getAttribute('data-caption') || '');
    });
  });

  if (lightbox) {
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox || event.target.closest('.lightbox-close')) close();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (lightbox && !lightbox.hidden) close();
    setNav(false);
  });
})();
