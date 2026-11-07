/* About menu: hover dropdown on the nav "About" link, plus a tab strip on the About pages.
   One list below drives both. Add a page here and it shows up everywhere. */
(function () {
  var ITEMS = [
    ['About Jack', '/about/'],
    ['The Why Behind Jack', '/about/why/'],
    ['Meet the Team', '/team/'],
    ['Giving Back', '/about/community/']
  ];
  function norm(p) { return (p || '').replace(/index\.html$/, '').replace(/\/?$/, '/'); }
  var here = norm(location.pathname);
  var css = '.mg-dd{position:fixed;z-index:150;transform:translateX(-50%);background:#fff;border:1px solid #e4e4e3;padding:14px 4px;min-width:230px;text-align:center;opacity:0;visibility:hidden;transition:opacity .2s}'
    + '.mg-dd.on{opacity:1;visibility:visible}'
    + '.mg-dd a{display:block;padding:9px 22px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#161616;text-decoration:none;white-space:nowrap}'
    + '.mg-dd a:hover{opacity:1;background:#f4f4f3}'
    + '.mg-tabs{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 36px;padding:22px var(--space-6,24px);border-bottom:1px solid #e4e4e3;background:#fff}'
    + '.mg-tabs a{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#6a6a69;text-decoration:none;padding:6px 0;border-bottom:1px solid transparent}'
    + '.mg-tabs a:hover{opacity:1;color:#161616}.mg-tabs a.cur{color:#161616;border-bottom-color:#161616}';
  function init() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    // dropdown on the nav "About" link (floating panel, so it never touches the page's own markup)
    var links = [].filter.call(document.querySelectorAll('a'), function (a) {
      return a.textContent.trim() === 'About' && /\/about\/?$/.test(a.getAttribute('href') || '')
        && !a.classList.contains('menu-link') && !a.closest('footer');
    });
    if (links.length) {
      var panel = document.createElement('div'); panel.className = 'mg-dd';
      panel.innerHTML = ITEMS.map(function (i) { return '<a href="' + i[1] + '">' + i[0] + '</a>'; }).join('');
      document.body.appendChild(panel);
      var t;
      var show = function (a) { clearTimeout(t); var r = a.getBoundingClientRect(); if (!r.width) return; panel.style.top = (r.bottom + 6) + 'px'; panel.style.left = '0px'; var half = (panel.offsetWidth || 240) / 2; panel.style.left = Math.min(Math.max(r.left + r.width / 2, half + 12), window.innerWidth - half - 12) + 'px'; panel.classList.add('on'); };
      var hide = function () { t = setTimeout(function () { panel.classList.remove('on'); }, 200); };
      links.forEach(function (a) { a.addEventListener('mouseenter', function () { show(a); }); a.addEventListener('mouseleave', hide); a.addEventListener('focus', function () { show(a); }); });
      panel.addEventListener('mouseenter', function () { clearTimeout(t); });
      panel.addEventListener('mouseleave', hide);
      window.addEventListener('scroll', function () { panel.classList.remove('on'); }, { passive: true });
    }
    // tab strip under the hero on the About pages
    if (ITEMS.some(function (i) { return i[1] === here; })) {
      var hero = document.querySelector('section');
      if (hero) {
        var bar = document.createElement('nav'); bar.className = 'mg-tabs'; bar.setAttribute('aria-label', 'About');
        bar.innerHTML = ITEMS.map(function (i) { return '<a href="' + i[1] + '"' + (i[1] === here ? ' class="cur"' : '') + '>' + i[0] + '</a>'; }).join('');
        hero.parentNode.insertBefore(bar, hero.nextSibling);
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
