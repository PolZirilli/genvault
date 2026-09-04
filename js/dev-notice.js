// ════════════════════════════════════════════
//  Modal "Plataforma en desarrollo" — Vault family
//  (NESvault / GENvault / SNESvault)
//  Archivo independiente: guardar como js/dev-notice.js
//  No requiere markup en index.html — arma el modal por JS.
//  Requiere que css/dev-notice.css esté linkeado en <head>.
// ════════════════════════════════════════════
(function () {
    var STORAGE_KEY = 'vault_devnotice_dismissed_v1';
    var RELEASE_DATE = { es: '22 de octubre de 2026', en: 'October 22, 2026' };

    var STRINGS = {
        es: {
            title: '🚧 Plataforma en desarrollo',
            bodyHtml:
                '<p>Este sitio todavía está en desarrollo y en fase de pruebas, así que podés encontrarte con algún detalle o error mientras seguimos ajustando cosas.</p>' +
                '<p>El próximo gran release va a sumar:</p>' +
                '<ul>' +
                '<li>Acceso por usuario (cuentas)</li>' +
                '<li>Guardado de partidas</li>' +
                '<li>Listas de juegos personalizadas</li>' +
                '<li>Personalizaciones más específicas</li>' +
                '</ul>',
            dateLabel: 'Fecha estimada: ' + RELEASE_DATE.es,
            close: 'Entendido, seguir probando',
        },
        en: {
            title: '🚧 Platform in development',
            bodyHtml:
                '<p>This site is still in development and testing, so you might run into the occasional rough edge or bug while we keep polishing things.</p>' +
                '<p>The next major release will add:</p>' +
                '<ul>' +
                '<li>User accounts / login</li>' +
                '<li>Save game states</li>' +
                '<li>Custom game lists</li>' +
                '<li>More specific customization options</li>' +
                '</ul>',
            dateLabel: 'Estimated date: ' + RELEASE_DATE.en,
            close: 'Got it, keep exploring',
        },
    };

    function isDismissed() {
        try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
    }

    // Si ya lo cerró antes, no tocamos el DOM para nada.
    if (isDismissed()) return;

    function currentLang() {
        try {
            if (typeof window.getLang === 'function') return window.getLang();
        } catch (e) { }
        var nav = (navigator.language || 'en').toLowerCase();
        return nav.indexOf('es') === 0 ? 'es' : 'en';
    }

    function build() {
        var overlay = document.createElement('div');
        overlay.className = 'dev-notice-overlay';
        overlay.id = 'devNoticeOverlay';
        overlay.innerHTML =
            '<div class="dev-notice-card" role="dialog" aria-modal="true" aria-labelledby="devNoticeTitle">' +
            '<button class="dev-notice-x" id="devNoticeX" aria-label="Cerrar">×</button>' +
            '<h2 class="dev-notice-title" id="devNoticeTitle"></h2>' +
            '<div class="dev-notice-body" id="devNoticeBody"></div>' +
            '<button class="dev-notice-close-btn" id="devNoticeCloseBtn"></button>' +
            '</div>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function render(overlay, lang) {
        var s = STRINGS[lang] || STRINGS.en;
        overlay.querySelector('#devNoticeTitle').textContent = s.title;
        overlay.querySelector('#devNoticeBody').innerHTML =
            s.bodyHtml + '<span class="dev-notice-date">' + s.dateLabel + '</span>';
        overlay.querySelector('#devNoticeCloseBtn').textContent = s.close;
    }

    function init() {
        var overlay = build();
        render(overlay, currentLang());

        function close() {
            overlay.remove();
            try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { }
            document.removeEventListener('keydown', onKeydown);
        }
        function onKeydown(e) {
            if (e.key === 'Escape') close();
        }

        overlay.querySelector('#devNoticeCloseBtn').addEventListener('click', close);
        overlay.querySelector('#devNoticeX').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', onKeydown);

        // Si el usuario cambia de idioma (ES/EN) mientras el modal está
        // abierto, lo re-renderiza en el nuevo idioma.
        window.addEventListener('vaultlangchange', function (e) {
            if (document.body.contains(overlay)) {
                render(overlay, (e.detail && e.detail.lang) || currentLang());
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();