/* Shared hamburger menu.
   Add it to any page with one line (in <head> or before </body>):
       <script src="menu.js?v=16" defer></script>
   Bump the ?v= number whenever menu.js or menu.css changes.
   To add or rename a link, edit the `items` list below. */
(function () {
  var src = document.currentScript.src;
  var base = src.replace(/menu\.js.*$/, '');
  var query = (src.match(/\?.*$/) || [''])[0];

  var items = [
    { label: 'Home',             href: 'index.html' },
    { label: 'DZ Wind Forecast', href: 'para.html' },
    { label: 'Football Tracker', href: 'sports.html' },
   { label: 'Hearts Scorecard', href: 'cards.html' },
    { label: 'Webmail',          href: 'https://webmail.hibbs.org.uk/' }
  ];

  var here = location.pathname.split('/').pop() || 'index.html';

  var links = items.map(function (it) {
    var external = /^https?:/.test(it.href);
    var current = !external && it.href === here;
    return '<li><a href="' + it.href + '"' +
           (current ? ' aria-current="page"' : '') + '>' + it.label + '</a></li>';
  }).join('');

  var nav = document.createElement('nav');
  nav.className = 'menu';
  nav.style.visibility = 'hidden';   // stays hidden until menu.css has loaded
  nav.innerHTML =
    '<button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="menuList">' +
    '<span></span><span></span><span></span></button>' +
    '<ul class="menu-list" id="menuList">' + links + '</ul>';

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'menu.css' + query;
  css.onload = css.onerror = function () { nav.style.visibility = ''; };
  document.head.appendChild(css);

  // Modern font (falls back to the phone's system font if it can't load)
  [['preconnect', 'https://fonts.googleapis.com'],
   ['preconnect', 'https://fonts.gstatic.com', true],
   ['stylesheet', 'https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap']
  ].forEach(function (f) {
    var l = document.createElement('link');
    l.rel = f[0];
    l.href = f[1];
    if (f[2]) l.crossOrigin = '';
    document.head.appendChild(l);
  });

  document.body.appendChild(nav);

  var toggle = nav.querySelector('.menu-toggle');
  var list = nav.querySelector('.menu-list');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', function (e) {
    if (!list.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });
  // Coming back with the Back button can restore the page with the menu open
  window.addEventListener('pageshow', function () { setMenu(false); });
})();
