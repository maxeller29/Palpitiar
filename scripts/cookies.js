/*!
 * Palpitiar · cookies.js
 * Gerencia consentimento de cookies (LGPD) e só carrega Google Analytics
 * e Google AdSense depois que o usuário aceita.
 *
 * Cada página HTML deve, ANTES de incluir este arquivo, definir:
 *   <script>
 *     window.GA_ID      = 'G-M8Y0LMDHM4';
 *     window.ADSENSE_ID = 'ca-pub-3709250859527113';
 *   </script>
 *   <script src="/cookies.js" defer></script>
 *
 * Se a página já tiver seu próprio banner de cookies (elementos com id
 * "cookieBanner", "cookieAccept", "cookieDecline"), este script reaproveita
 * esses elementos em vez de criar um segundo banner. Caso contrário, injeta
 * o banner automaticamente (CSS + HTML), então funciona em qualquer página
 * mesmo sem markup prévio.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'cookie_consent';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function injectBannerMarkup() {
    if (document.getElementById('cookieBanner')) return; // já existe na página

    var style = document.createElement('style');
    style.textContent =
      '.cookie-banner{display:none;position:fixed;bottom:0;left:0;right:0;z-index:9998;' +
      'background:rgba(10,26,20,.97);border-top:1px solid rgba(212,168,75,.3);' +
      'backdrop-filter:blur(8px);padding:16px 24px;font-family:monospace}' +
      '.cookie-banner.show{display:block}' +
      '.cookie-inner{max-width:960px;margin:0 auto;display:flex;align-items:center;' +
      'gap:20px;flex-wrap:wrap}' +
      '.cookie-text{flex:1;font-size:11px;color:rgba(244,235,208,.65);line-height:1.6;min-width:260px}' +
      '.cookie-text a{color:#d4a84b;text-decoration:none}' +
      '.cookie-text a:hover{text-decoration:underline}' +
      '.cookie-btns{display:flex;gap:10px;flex-shrink:0}' +
      '.cookie-btns button{font-family:monospace;font-size:10px;letter-spacing:.08em;' +
      'text-transform:uppercase;padding:9px 16px;border-radius:2px;cursor:pointer;border:1px solid transparent}' +
      '.cookie-accept{background:#d4a84b;color:#0a1a14;font-weight:700}' +
      '.cookie-decline{background:transparent;color:rgba(244,235,208,.65);border-color:rgba(244,235,208,.2)}';
    document.head.appendChild(style);

    var host = document.createElement('div');
    host.innerHTML =
      '<div class="cookie-banner" id="cookieBanner">' +
      '<div class="cookie-inner">' +
      '<div class="cookie-text">Usamos cookies para análise de uso e publicidade ' +
      'personalizada (Google AdSense). Ao aceitar, você concorda com nossa ' +
      '<a href="/privacidade.html">Política de Privacidade</a> e com o uso de cookies ' +
      'de terceiros conforme a <strong>LGPD</strong>.</div>' +
      '<div class="cookie-btns">' +
      '<button class="cookie-accept" id="cookieAccept">Aceitar cookies</button>' +
      '<button class="cookie-decline" id="cookieDecline">Só essenciais</button>' +
      '</div></div></div>';
    document.body.appendChild(host.firstElementChild);
  }

  function loadScript(src, attrs) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (attrs) {
      for (var k in attrs) s.setAttribute(k, attrs[k]);
    }
    document.head.appendChild(s);
    return s;
  }

  function loadAnalytics() {
    if (window.__palpitiarAnalyticsLoaded) return;
    window.__palpitiarAnalyticsLoaded = true;

    if (window.GA_ID) {
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + window.GA_ID);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', window.GA_ID);
    }

    if (window.ADSENSE_ID && window.ADSENSE_ID.indexOf('XXXXXXXX') === -1) {
      loadScript(
        'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + window.ADSENSE_ID,
        { crossorigin: 'anonymous' }
      );
    }
  }

  ready(function () {
    injectBannerMarkup();

    var banner  = document.getElementById('cookieBanner');
    var accept  = document.getElementById('cookieAccept');
    var decline = document.getElementById('cookieDecline');
    if (!banner || !accept || !decline) return;

    var consent = localStorage.getItem(CONSENT_KEY);

    if (consent === 'accepted') {
      loadAnalytics();
      return;
    }
    if (consent === 'declined') {
      return;
    }

    setTimeout(function () { banner.classList.add('show'); }, 800);

    accept.addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      banner.classList.remove('show');
      loadAnalytics();
    });

    decline.addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'declined');
      banner.classList.remove('show');
    });
  });
})();
