(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var nav = document.querySelector('.fixed-nav-bar');
  if (!header || !nav) return;

  function measure() {
    document.documentElement.style.setProperty('--site-header-bottom', Math.ceil(nav.getBoundingClientRect().bottom) + 'px');
  }

  measure();
  var observer = new ResizeObserver(measure);
  observer.observe(header);
  observer.observe(nav);
  window.addEventListener('resize', measure);
  document.fonts.ready.then(measure);
})();
