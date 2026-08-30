// ════════════════════════════════════════════
//  GENvault — Selector de idioma ES / EN
//  Sin dependencias externas. Detecta el idioma del navegador por
//  defecto, permite alternar con el toggle del header, y guarda la
//  preferencia en localStorage. Como GENvault/NESvault/SNESvault son
//  3 dominios distintos (netlify.app separados), localStorage NO se
//  comparte entre ellos — la preferencia "viaja" agregando ?lang=xx
//  a los links del navbar cruzado hacia los sitios hermanos.
// ════════════════════════════════════════════
(function () {
    const STORAGE_KEY = 'vault_lang';

    // Hosts de los 4 sitios hermanos — si un <a> del navbar apunta a
    // alguno, se le agrega ?lang= para que el idioma "viaje" al navegar.
    const SIBLING_HOSTS = [
        'nesvault.netlify.app',
        'snesvault.netlify.app',
        'genvaultapp.netlify.app',
        'dosvault.netlify.app',
    ];

    const STRINGS = {
        es: {
            aria_home: 'GENvault — inicio',
            aria_nav_nes: 'Ir a NESvault',
            aria_nav_snes: 'Ir a SNESvault',
            aria_nav_dos: 'Ir a DOSVault',
            lang_toggle_aria: 'Idioma',

            fullscreen_title: 'Pantalla completa',
            exit_fullscreen_title: 'Salir de pantalla completa',
            loader_default: 'CARGANDO JUEGO...',
            loader_loading_rom: 'CARGANDO ROM...',

            btn_play: '▶ COMENZAR',
            btn_pause: '⏸ PAUSAR',
            btn_pause_active: '⏸ PAUSADO',
            btn_stop: '⏹ DETENER',
            btn_view_controls: '◈ Ver Controles',

            gamepad_not_detected: 'Control no detectado - Conecte un control y presione cualquier botón',
            gamepad_connected_prefix: '🎮 Conectado: ',
            gamepad_disconnected: 'Gamepad desconectado',

            status_fetching: 'Descargando ROM...',
            status_playing_prefix: 'Reproduciendo: ',
            status_paused: 'Pausado — presioná ▶ JUGAR para continuar',
            status_load_error: 'Error de carga',
            status_error_loading: 'Error al cargar el ROM',
            status_engine_not_found: 'Motor no encontrado',

            err_could_not_start: 'No se pudo iniciar el emulador: ',
            err_could_not_read: 'No se pudo leer el archivo ROM.',
            err_could_not_load_preset: 'No se pudo cargar el ROM.',

            catalog_loading: 'Cargando catálogo…',
            catalog_empty: 'Todavía no hay ROMs cargados en el catálogo.',
            catalog_load_failed: 'No se pudo cargar el catálogo de ROMs (data/games.json). Podés cargar tu ROM manualmente abajo.',
            catalog_empty_fallback: 'No hay ROMs en el catálogo.',
            catalog_no_results_prefix: 'No se encontraron juegos para "',

            catalog_heading: '◈ Catálogo',
            search_placeholder: 'Buscar juego...',
            drop_title: 'CARGAR JUEGO',
            drop_sub_html: 'Arrastrá y soltá tu archivo acá<br>.md / .bin / .gen / .32x',

            controls_title: '◈ CONTROLES',
            tab_keyboard: '⌨ TECLADO',
            tab_gamepad: '🎮 CONTROL',
            keyboard_edit_hint: 'Editá las teclas a tu gusto',
            reset_defaults: '↺ Restablecer',
            keyboard_hint_html: 'Presioná <strong>Set</strong> junto a una acción, y luego presioná la tecla que querés usar. Se aplica la próxima vez que cargues un ROM.',
            col_buttons: 'Botones',
            shortcuts_title: 'Atajos internos (Genesis.js)',
            shortcut_save_state: 'Guardar estado',
            shortcut_load_state: 'Cargar estado',
            shortcut_mute: 'Silenciar',
            shortcut_fullscreen: 'Pantalla completa',
            shortcut_restart: 'Reiniciar',
            gamepad_no_connected: 'Sin gamepad conectado',
            gamepad_hint_html: 'Presioná <strong>Set</strong> junto a una acción, y luego presioná el botón físico de tu gamepad. Se aplica la próxima vez que cargues un ROM.',
            gamepad_dpad_fixed: 'Fijo (D-pad)',
            gamepad_dpad_fixed_note: 'Arriba, abajo, izquierda y derecha usan siempre los ejes del D-pad del control y no se pueden reasignar a un botón desde acá.',

            btn_set: 'Asignar',
            btn_cancel: 'Cancelar',
            press_button_full: 'Presioná un botón...',
            press_key_full: 'Presioná una tecla...',
            gpmap_button_prefix: 'Botón ',

            action_up: 'D-Pad Arriba', action_down: 'D-Pad Abajo',
            action_left: 'D-Pad Izquierda', action_right: 'D-Pad Derecha',
            action_a: 'Botón A', action_b: 'Botón B', action_c: 'Botón C',
            action_x: 'Botón X', action_y: 'Botón Y', action_z: 'Botón Z',
            action_l: 'Botón L', action_r: 'Botón R',
            action_start: 'Start', action_mode: 'Mode', action_select: 'Select',

            splash_text: 'CARGÁ UN ROM PARA EMPEZAR',
            footer_text: 'GENvault · Emulador de Sega Mega Drive / Genesis · Genesis.js (PicoDrive) · Gamepad API',
        },
        en: {
            aria_home: 'GENvault — home',
            aria_nav_nes: 'Go to NESvault',
            aria_nav_snes: 'Go to SNESvault',
            aria_nav_dos: 'Go to DOSVault',
            lang_toggle_aria: 'Language',

            fullscreen_title: 'Fullscreen',
            exit_fullscreen_title: 'Exit Fullscreen',
            loader_default: 'LOADING GAME...',
            loader_loading_rom: 'LOADING ROM...',

            btn_play: '▶ START',
            btn_pause: '⏸ PAUSE',
            btn_pause_active: '⏸ PAUSED',
            btn_stop: '⏹ STOP',
            btn_view_controls: '◈ View Controls',

            gamepad_not_detected: 'No controller detected — connect one and press any button',
            gamepad_connected_prefix: '🎮 Connected: ',
            gamepad_disconnected: 'Gamepad disconnected',

            status_fetching: 'Fetching ROM...',
            status_playing_prefix: 'Playing: ',
            status_paused: 'Paused — press ▶ PLAY to continue',
            status_load_error: 'Load error',
            status_error_loading: 'Error loading ROM',
            status_engine_not_found: 'Engine not found',

            err_could_not_start: 'Could not start emulator: ',
            err_could_not_read: 'Could not read the ROM file.',
            err_could_not_load_preset: 'Could not load preset ROM.',

            catalog_loading: 'Loading catalog…',
            catalog_empty: 'No games loaded in the catalog yet.',
            catalog_load_failed: "Couldn't load the ROM catalog (data/games.json). You can still load your ROM manually below.",
            catalog_empty_fallback: 'No games in the catalog.',
            catalog_no_results_prefix: 'No games found for "',

            catalog_heading: '◈ Catalog',
            search_placeholder: 'Search game...',
            drop_title: 'LOAD GAME',
            drop_sub_html: 'Drag and drop your file here<br>.md / .bin / .gen / .32x',

            controls_title: '◈ CONTROLS',
            tab_keyboard: '⌨ KEYBOARD',
            tab_gamepad: '🎮 GAMEPAD',
            keyboard_edit_hint: 'Edit the keys to your liking',
            reset_defaults: '↺ Reset defaults',
            keyboard_hint_html: 'Press <strong>Set</strong> next to an action, then press the key you want to use. It applies the next time you load a ROM.',
            col_buttons: 'Buttons',
            shortcuts_title: 'Internal shortcuts (Genesis.js)',
            shortcut_save_state: 'Save state',
            shortcut_load_state: 'Load state',
            shortcut_mute: 'Mute',
            shortcut_fullscreen: 'Fullscreen',
            shortcut_restart: 'Restart',
            gamepad_no_connected: 'No gamepad connected',
            gamepad_hint_html: 'Press <strong>Set</strong> next to an action, then press the physical button on your gamepad. It applies the next time you load a ROM.',
            gamepad_dpad_fixed: 'Fixed (D-pad)',
            gamepad_dpad_fixed_note: 'Up, down, left and right always use the controller\'s D-pad axes and can\'t be reassigned to a button here.',

            btn_set: 'Set',
            btn_cancel: 'Cancel',
            press_button_full: 'Press button...',
            press_key_full: 'Press a key...',
            gpmap_button_prefix: 'Button ',

            action_up: 'D-Pad Up', action_down: 'D-Pad Down',
            action_left: 'D-Pad Left', action_right: 'D-Pad Right',
            action_a: 'Button A', action_b: 'Button B', action_c: 'Button C',
            action_x: 'Button X', action_y: 'Button Y', action_z: 'Button Z',
            action_l: 'Button L', action_r: 'Button R',
            action_start: 'Start', action_mode: 'Mode', action_select: 'Select',

            splash_text: 'LOAD A ROM TO START',
            footer_text: 'GENvault · Sega Mega Drive / Genesis Emulator · Genesis.js (PicoDrive) · Gamepad API',
        },
    };

    function detectBrowserLang() {
        const nav = (navigator.language || (navigator.languages && navigator.languages[0]) || 'en').toLowerCase();
        return nav.startsWith('es') ? 'es' : 'en';
    }

    function getInitialLang() {
        // 1) ?lang= en la URL — así "viaja" el idioma al cruzar entre los
        //    4 sitios hermanos desde el navbar (dominios separados, sin
        //    localStorage compartido).
        try {
            const urlLang = new URLSearchParams(location.search).get('lang');
            if (urlLang === 'es' || urlLang === 'en') {
                localStorage.setItem(STORAGE_KEY, urlLang);
                return urlLang;
            }
        } catch (_) { }
        // 2) preferencia ya guardada en este dominio.
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'es' || stored === 'en') return stored;
        } catch (_) { }
        // 3) idioma del navegador del visitante.
        return detectBrowserLang();
    }

    let currentLang = getInitialLang();

    function t(key) {
        const dict = STRINGS[currentLang] || STRINGS.en;
        return (key in dict) ? dict[key] : (STRINGS.en[key] ?? key);
    }
    window.t = t;
    window.getLang = function () { return currentLang; };

    // Reescribe los <a> del navbar hacia los sitios hermanos para que
    // lleven ?lang= — así el idioma elegido acá se respeta al llegar allá.
    function propagateLangToSiblingLinks(lang) {
        document.querySelectorAll('a[href]').forEach(a => {
            try {
                const u = new URL(a.getAttribute('href'), location.href);
                if (SIBLING_HOSTS.includes(u.hostname)) {
                    u.searchParams.set('lang', lang);
                    a.setAttribute('href', u.toString());
                }
            } catch (_) { /* href relativo tipo "#", ignorar */ }
        });
    }

    function applyLang(lang) {
        currentLang = lang;
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
        });

        document.querySelectorAll('.lang-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });

        propagateLangToSiblingLinks(lang);

        // Avisa al resto de app.js (splash, textos ya renderizados, etc.)
        // para que puedan re-dibujarse en el idioma nuevo.
        window.dispatchEvent(new CustomEvent('vaultlangchange', { detail: { lang } }));
    }

    function setLang(lang) {
        if (lang !== 'es' && lang !== 'en') return;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { }
        applyLang(lang);
    }
    window.setLang = setLang;

    // Para cuando el HTML ya está parseado (el script va al final del
    // body, después de todo el markup) — no hace falta esperar a
    // DOMContentLoaded.
    applyLang(currentLang);
    document.querySelectorAll('.lang-opt').forEach(btn => {
        btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
})();
