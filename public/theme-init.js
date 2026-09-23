// Applies every persisted appearance axis before paint to avoid a flash.
// Loaded as a classic external script so the CSP can keep script-src 'self'
// (no inline scripts allowed).
(function () {
  var root = document.documentElement;
  var get = function (key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  };
  try {
    var stored = localStorage.getItem('devarchitect-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : true; // default to dark
    if (stored === 'system') dark = prefersDark;
    root.classList.toggle('dark', dark);
  } catch (e) {
    root.classList.add('dark');
  }
  root.setAttribute('data-scheme', get('devarchitect-scheme', 'indigo'));
  root.setAttribute('data-tint', get('devarchitect-tint', 'neutral'));
  root.setAttribute('data-corners', get('devarchitect-corners', 'precise'));
  root.setAttribute('data-density', get('devarchitect-density', 'comfortable'));
  root.setAttribute('data-type', get('devarchitect-typeface', 'technical'));
})();
