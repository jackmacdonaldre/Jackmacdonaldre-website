/* Lead tracking for GA4 (G-XVG642M7W3).
   Events:
     generate_lead  - a form was actually submitted (fires on the thank-you page, or after a successful fetch)
     phone_click    - tap on a tel: link
     text_click     - tap on an sms: link
     email_click    - tap on a mailto: link
   An event counts website inquiries only. Whether a lead is qualified, booked or signed
   is tracked separately in Jack's lead log. */
(function () {
  function send(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }
  window.mgTrackLead = function (formName, location) {
    send('generate_lead', { form_name: formName, form_location: location || window.location.pathname });
  };

  // Phone, text and email taps
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = (a.getAttribute('href') || '').toLowerCase();
    var p = { link_url: href, page_path: window.location.pathname };
    if (href.indexOf('tel:') === 0) send('phone_click', p);
    else if (href.indexOf('sms:') === 0) send('text_click', p);
    else if (href.indexOf('mailto:') === 0) send('email_click', p);
  }, true);

  // Native Netlify forms: remember what was submitted, send people to a thank-you page
  function prepForms() {
    var forms = document.querySelectorAll('form[data-netlify="true"]:not([hidden])');
    Array.prototype.forEach.call(forms, function (f) {
      if (!f.getAttribute('action')) f.setAttribute('action', '/thanks/');
      f.addEventListener('submit', function () {
        try {
          sessionStorage.setItem('mgLeadForm', JSON.stringify({ form: f.getAttribute('name') || 'form', page: window.location.pathname, t: Date.now() }));
        } catch (e) {}
      });
    });
  }

  // On a thank-you page, fire generate_lead once for the form that brought them here
  function onThanks() {
    if (!/\/thanks\/?$/.test(window.location.pathname)) return;
    var raw = null;
    try { raw = sessionStorage.getItem('mgLeadForm'); sessionStorage.removeItem('mgLeadForm'); } catch (e) {}
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (Date.now() - (d.t || 0) > 30 * 60 * 1000) return;
      window.mgTrackLead(d.form, d.page);
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { prepForms(); onThanks(); });
  else { prepForms(); onThanks(); }
})();
