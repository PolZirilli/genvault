// ════════════════════════════════════════════
//  SNESvault — Emulador Super Nintendo
//  Motor: SuperNintendo.js (Snes9x 2005, JS puro)
// ════════════════════════════════════════════

// ══ REFS UI ══
const splash = document.getElementById('splashCanvas');
let emuContainer = document.getElementById('emuContainer');
const loaderOvrl = document.getElementById('loaderOverlay');
const ledEl = document.getElementById('led');
const statusEl = document.getElementById('statusText');
const fpsEl = document.getElementById('fpsCounter');
const romNameEl = document.getElementById('romName');
const errorBox = document.getElementById('errorBox');
const screenWrap = document.getElementById('screenWrap');

// ══ ESTADO ══
let emuRunning = false;
let paused = false;
let lastROMName = '';
let fpsInterval = null;
let fpsFrames = 0;
let fpsLast = performance.now();

const TARGET_FPS = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const DEAD = 0.45;

// ════════════════════════════════════════════
//  GALERÍA DE ROMs — catálogo centralizado en data/games.json.
//  Cada juego trae { id, name, region, cover, url }. El carousel se
//  puebla dinámicamente con lo que haya ahí: si hay uno, muestra uno;
//  si no carga nada, muestra un estado vacío (nunca cards fantasma).
// ════════════════════════════════════════════
const GAMES_JSON_URL = 'data/games.json';
let ROM_LIBRARY = [];
let catalogErrorMsg = null;
// 'empty' | 'failed' | null — para poder recalcular catalogErrorMsg en el
// idioma correcto si el usuario cambia ES/EN después de cargar el catálogo.
let catalogErrorKind = null;

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function loadGameLibrary() {
    try {
        const res = await fetch(GAMES_JSON_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('data/games.json debe ser un array de juegos.');
        ROM_LIBRARY = data.filter(g => g && typeof g.name === 'string' && typeof g.url === 'string');
        catalogErrorKind = ROM_LIBRARY.length ? null : 'empty';
        catalogErrorMsg = catalogErrorKind ? t('catalog_empty') : null;
    } catch (err) {
        console.error('No se pudo cargar data/games.json:', err);
        ROM_LIBRARY = [];
        catalogErrorKind = 'failed';
        catalogErrorMsg = t('catalog_load_failed');
    }
    renderCarousel();
}

// Ícono de cartucho en pixel-art puro CSS/SVG — se usa como portada por
// default (o si `cover` no carga) hasta que el juego tenga portada real.
const CART_ICON_SVG = `
<svg class="cart-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <path d="M6 2h12v3h1v3h-1v11H6V8H5V5h1V2z m2 2v3h8V4H8z m-1 6v9h10v-9H7z m2 2h2v2H9v-2z m4 0h2v2h-2v-2z"/>
</svg>`;

// ════════════════════════════════════════════
//  CAROUSEL DE ROMs — nunca más de 2 filas visibles.
//  El número de columnas se adapta al ancho (5 / 3 / 2), y cada
//  "página" del carousel siempre tiene columnas × 2 tarjetas.
// ════════════════════════════════════════════
let carouselPage = 0;
let carouselPages = [];
let searchQuery = '';

function getCarouselColumns() {
    const w = window.innerWidth;
    if (w <= 620) return 2;
    if (w <= 1180) return 3;
    return 5;
}

// Filtra por nombre o región ("USA", "JPN", etc.) — sin distinguir mayúsculas.
function getVisibleLibrary() {
    if (!searchQuery) return ROM_LIBRARY;
    const q = searchQuery.toLowerCase();
    return ROM_LIBRARY.filter(rom =>
        rom.name.toLowerCase().includes(q) ||
        (rom.region && rom.region.toLowerCase().includes(q)));
}

function buildCarouselPages(list) {
    const perPage = getCarouselColumns() * 3;
    const pages = [];
    for (let i = 0; i < list.length; i += perPage) {
        pages.push(list.slice(i, i + perPage));
    }
    return pages.length ? pages : [[]];
}

function romCardHTML(rom) {
    const name = escapeHtml(rom.name);
    const url = escapeHtml(rom.url);
    const tagHTML = rom.region ? `<span class="rom-tag">${escapeHtml(rom.region)}</span>` : '';
    const coverHTML = rom.cover
        ? `<img class="rom-cover-img" src="${escapeHtml(rom.cover)}" alt="${name}" loading="lazy">`
        : CART_ICON_SVG;
    return `
        <button type="button" class="rom-card" data-url="${url}" data-name="${name}">
            <span class="rom-cover">
                ${coverHTML}
                ${tagHTML}
            </span>
            <span class="rom-info">
                <span class="rom-title">${name}</span>
            </span>
        </button>`;
}

function renderCarousel() {
    const track = document.getElementById('romTrack');
    const dotsEl = document.getElementById('pageDots');
    const prevBtn = document.getElementById('pagePrev');
    const nextBtn = document.getElementById('pageNext');
    const paginationEl = document.querySelector('.rom-pagination');
    if (!track) return;

    const visible = getVisibleLibrary();

    // Sin resultados — catálogo vacío, falló la carga, o la búsqueda no matcheó nada.
    if (!visible.length) {
        const msg = !ROM_LIBRARY.length
            ? (catalogErrorMsg || t('catalog_empty_fallback'))
            : `${t('catalog_no_results_prefix')}${searchQuery}".`;
        track.innerHTML = `<div class="rom-page rom-empty-page"><p class="rom-empty">${escapeHtml(msg)}</p></div>`;
        track.style.transform = 'translateX(0)';
        if (paginationEl) paginationEl.style.display = 'none';
        if (dotsEl) dotsEl.innerHTML = '';
        return;
    }

    carouselPages = buildCarouselPages(visible);
    if (carouselPage >= carouselPages.length) carouselPage = carouselPages.length - 1;
    if (carouselPage < 0) carouselPage = 0;

    // Cada página solo contiene las cards que existen — nunca se rellena
    // con celdas vacías (si el último grupo tiene menos que columnas×2,
    // el grid de esa página simplemente muestra menos cards).
    track.innerHTML = carouselPages.map(page => `<div class="rom-page">${page.map(romCardHTML).join('')}</div>`).join('');
    track.querySelectorAll('.rom-card').forEach(card => {
        card.addEventListener('click', () => loadPresetROM(card.dataset.url, card.dataset.name));
    });
    // Si una portada real (rom.cover) no carga, caemos al ícono placeholder.
    track.querySelectorAll('.rom-cover-img').forEach(img => {
        img.addEventListener('error', () => { img.outerHTML = CART_ICON_SVG; }, { once: true });
    });

    const showPagination = carouselPages.length > 1;
    if (paginationEl) paginationEl.style.display = showPagination ? '' : 'none';

    if (dotsEl) {
        dotsEl.innerHTML = '';
        if (showPagination) {
            carouselPages.forEach((_, i) => {
                const dot = document.createElement('span');
                dot.className = 'dot' + (i === carouselPage ? ' active' : '');
                dot.addEventListener('click', () => goToCarouselPage(i));
                dotsEl.appendChild(dot);
            });
        }
    }

    if (prevBtn) prevBtn.disabled = carouselPage <= 0;
    if (nextBtn) nextBtn.disabled = carouselPage >= carouselPages.length - 1;

    track.style.transform = `translateX(-${carouselPage * 100}%)`;
}

function goToCarouselPage(index) {
    carouselPage = index;
    renderCarousel();
}

document.getElementById('romSearch')?.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    carouselPage = 0;
    renderCarousel();
});

document.getElementById('pagePrev')?.addEventListener('click', () => {
    if (carouselPage > 0) goToCarouselPage(carouselPage - 1);
});
document.getElementById('pageNext')?.addEventListener('click', () => {
    if (carouselPage < carouselPages.length - 1) goToCarouselPage(carouselPage + 1);
});

let carouselResizeTO = null;
window.addEventListener('resize', () => {
    clearTimeout(carouselResizeTO);
    carouselResizeTO = setTimeout(renderCarousel, 200);
});

// ════════════════════════════════════════════
//  MAPEO DE ACCIONES (teclado + gamepad)
//  SNES: D-Pad + A/B/X/Y + L/R (hombros) + Start/Select
// ════════════════════════════════════════════
const ACTIONS = [
    { id: 'up', labelKey: 'action_up' },
    { id: 'down', labelKey: 'action_down' },
    { id: 'left', labelKey: 'action_left' },
    { id: 'right', labelKey: 'action_right' },
    { id: 'a', labelKey: 'action_a' },
    { id: 'b', labelKey: 'action_b' },
    { id: 'x', labelKey: 'action_x' },
    { id: 'y', labelKey: 'action_y' },
    { id: 'l', labelKey: 'action_l' },
    { id: 'r', labelKey: 'action_r' },
    { id: 'start', labelKey: 'action_start' },
    { id: 'select', labelKey: 'action_select' },
];
const DPAD_IDS = ['up', 'down', 'left', 'right'];
const BUTTON_IDS = ['a', 'b', 'x', 'y', 'l', 'r'];
const EXTRA_IDS = ['start', 'select'];

// ── Teclado — editable por el usuario, se guarda en localStorage ──
// Coincide con el default del propio motor (SuperNintendo.js).
const DEFAULT_KEYMAP = {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    a: 'KeyW', b: 'KeyQ', x: 'KeyS', y: 'KeyA', l: 'KeyZ', r: 'KeyX',
    start: 'Enter', select: 'ShiftRight',
};
let keymap = loadKeymap();
function loadKeymap() {
    try { const s = localStorage.getItem('snesvault_keymap'); if (s) return { ...DEFAULT_KEYMAP, ...JSON.parse(s) }; } catch (_) { }
    return { ...DEFAULT_KEYMAP };
}
function saveKeymap() {
    try { localStorage.setItem('snesvault_keymap', JSON.stringify(keymap)); } catch (_) { }
}

function keyLabel(code) {
    if (!code) return '—';
    const named = {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Enter: '↵', Space: 'SPACE',
        ControlLeft: 'CTRL', ControlRight: 'CTRL',
        ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
        AltLeft: 'ALT', AltRight: 'ALT',
    };
    if (named[code]) return named[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

// ── Gamepad — mapeo estándar (Standard Gamepad): caras A/B/X/Y del
// control moderno rotadas a la posición equivalente del diamante SNES,
// hombros a L/R, back/select y start tal cual. ──
const DEFAULT_GP_MAP = {
    0: 'b', 1: 'a', 2: 'y', 3: 'x', 4: 'l', 5: 'r',
    8: 'select', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

let gpMap = loadGPMap();
function loadGPMap() {
    try { const s = localStorage.getItem('snesvault_gpmap'); if (s) return JSON.parse(s); } catch (_) { }
    return { ...DEFAULT_GP_MAP };
}
function saveGPMap() {
    try { localStorage.setItem('snesvault_gpmap', JSON.stringify(gpMap)); } catch (_) { }
}

// ════════════════════════════════════════════
//  PREVENIR SCROLL CON FLECHAS
// ════════════════════════════════════════════
window.addEventListener('keydown', e => {
    if (!emuRunning) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
}, { passive: false });

// ════════════════════════════════════════════
//  SPLASH
// ════════════════════════════════════════════
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#140a26'); g.addColorStop(1, '#1f0f3d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(124,58,237,0.10)'; ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = '#3a3255'; ctx.font = '7px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t('splash_text'), w / 2, h / 2);
}

// ════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════
function setStatus(msg, ledState) {
    statusEl.textContent = msg;
    ledEl.className = 'led' + (ledState ? ' ' + ledState : '');
}
function enableButtons(play, pause, stop) {
    document.getElementById('btnPlay').disabled = !play;
    document.getElementById('btnPause').disabled = !pause;
    document.getElementById('btnStop').disabled = !stop;
}
function showError(msg, hint) {
    errorBox.style.display = 'block';
    document.getElementById('errorMsg').textContent = ' ' + msg;
    document.getElementById('errorHint').textContent = hint || '';
}
function hideError() { errorBox.style.display = 'none'; }
function showLoader(txt) {
    document.getElementById('loaderText').textContent = txt || 'LOADING...';
    loaderOvrl.style.display = 'flex';
}
function hideLoader() { loaderOvrl.style.display = 'none'; }

// ════════════════════════════════════════════
//  FPS
// ════════════════════════════════════════════
function startFPS() {
    stopFPS(); fpsFrames = 0; fpsLast = performance.now();
    fpsInterval = setInterval(() => {
        const now = performance.now(), delta = now - fpsLast;
        if (delta >= 1000) {
            fpsEl.textContent = Math.min(Math.round((fpsFrames / delta) * 1000), 60) + ' FPS';
            fpsFrames = 0; fpsLast = now;
        }
        fpsFrames++;
    }, FRAME_DURATION);
}
function stopFPS() {
    if (fpsInterval) { clearInterval(fpsInterval); fpsInterval = null; }
    fpsEl.textContent = '';
}

// ════════════════════════════════════════════
//  GAMEPAD POLLING
// ════════════════════════════════════════════
let gpPrev = {}, gpAxesPrev = { up: false, down: false, left: false, right: false };

function actionToKey(id) { return keymap[id] || null; }
function fireKey(code, down) {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
}

function pollGamepad() {
    if (!emuRunning || paused) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    if (!gp) return;

    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const code = actionToKey(gpMap[i]);
        if (!code) return;
        if (pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed && gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });

    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const axL = ax < -DEAD, axR = ax > DEAD, axU = ay < -DEAD, axD = ay > DEAD;
    [[axL, gpAxesPrev.left, 'left'], [axR, gpAxesPrev.right, 'right'],
    [axU, gpAxesPrev.up, 'up'], [axD, gpAxesPrev.down, 'down']].forEach(([c, p, aid]) => {
        const code = actionToKey(aid);
        if (!code) return;
        if (c && !p) fireKey(code, true);
        if (!c && p) fireKey(code, false);
    });
    gpAxesPrev = { left: axL, right: axR, up: axU, down: axD };
}

let gpPollInterval = null;
function startGPPoll() { stopGPPoll(); gpPollInterval = setInterval(pollGamepad, FRAME_DURATION); }
function stopGPPoll() {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up: false, down: false, left: false, right: false };
}

window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = t('gamepad_connected_prefix') + e.gamepad.id.substring(0, 55);
    el.classList.add('connected');
    renderGPMap();
});
window.addEventListener('gamepaddisconnected', () => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = t('gamepad_disconnected');
    el.classList.remove('connected');
    stopGPPoll();
});

// ════════════════════════════════════════════
//  FULLSCREEN
// ════════════════════════════════════════════
const btnFullscreen = document.getElementById('btnFullscreen');
btnFullscreen.addEventListener('click', toggleFullscreen);
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, updateFullscreenBtn));

function toggleFullscreen() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFS) {
        const req = screenWrap.requestFullscreen || screenWrap.webkitRequestFullscreen;
        if (req) req.call(screenWrap);
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
    }
}
function updateFullscreenBtn() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btnFullscreen.textContent = isFS ? '✕' : '⛶';
    btnFullscreen.title = isFS ? t('exit_fullscreen_title') : t('fullscreen_title');
}

// ════════════════════════════════════════════
//  MONTAR EMULADOR
// ════════════════════════════════════════════
function mountEmulator(romBuffer, romName) {
    hideError();
    if (typeof embedSuperNintendo === 'undefined') {
        showError('Engine not found: js/SuperNintendo.min.js',
            '→ Download from: https://github.com/lrusso/SuperNintendo/raw/main/SuperNintendo.min.js');
        setStatus(t('status_engine_not_found'), 'err'); return;
    }

    lastROMName = romName;
    splash.style.display = 'none';
    emuContainer.style.display = 'block';
    showLoader(t('loader_loading_rom'));

    try {
        embedSuperNintendo({
            container: 'emuContainer',
            name: romName,
            rom: romBuffer,
            soundEnabled: true,
            showMobileControls: false,
            // Usa el keymap actual (editable desde ⌨ Keyboard en "Ver Controles").
            player1: {
                up: keymap.up, down: keymap.down, left: keymap.left, right: keymap.right,
                start: keymap.start, select: keymap.select,
                a: keymap.a, b: keymap.b, x: keymap.x, y: keymap.y, l: keymap.l, r: keymap.r,
            },
            cbStarted: function () {
                hideLoader();
                emuRunning = true;
                paused = false;
                romNameEl.textContent = '▸ ' + romName;
                setStatus(t('status_playing_prefix') + romName, 'on');
                enableButtons(false, true, true);
                startFPS();
                startGPPoll();
            }
        });
    } catch (e) {
        hideLoader();
        splash.style.display = 'block';
        emuContainer.style.display = 'none';
        setStatus(t('status_error_loading'), 'err');
        showError(t('err_could_not_start') + e.message);
    }
}

// ════════════════════════════════════════════
//  CARGA DE ROM
// ════════════════════════════════════════════
function handleROMFile(file) {
    if (!file) return;
    hideError();
    const reader = new FileReader();
    reader.onload = ev => mountEmulator(ev.target.result, file.name);
    reader.onerror = () => showError(t('err_could_not_read'));
    reader.readAsArrayBuffer(file);
}

document.getElementById('romInput').addEventListener('change', e => {
    handleROMFile(e.target.files[0]); e.target.value = '';
});
const drop = document.getElementById('fileDrop');
drop.addEventListener('click', () => document.getElementById('romInput').click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); handleROMFile(e.dataTransfer.files[0]); });

function loadPresetROM(url, displayName) {
    if (!url) return;
    hideError(); setStatus(t('status_fetching'), null);
    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(buf => mountEmulator(buf, displayName || url.split('/').pop()))
        .catch(err => { showError(t('err_could_not_load_preset'), err.message); setStatus(t('status_load_error'), 'err'); });
}

// ════════════════════════════════════════════
//  BOTONES
// ════════════════════════════════════════════
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning || paused) return;
    paused = true; stopFPS(); stopGPPoll();
    ledEl.className = 'led';
    setStatus(t('status_paused'), null);
    document.getElementById('btnPause').textContent = t('btn_pause_active');
    enableButtons(true, false, true);
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (_) { }
};

document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning || !paused) return;
    paused = false;
    setStatus(t('status_playing_prefix') + lastROMName, 'on');
    document.getElementById('btnPause').textContent = t('btn_pause');
    enableButtons(false, true, true); startFPS(); startGPPoll();
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (_) { }
};

// STOP — recargar la página mata todo sin excepción
document.getElementById('btnStop').onclick = () => location.reload();

// ════════════════════════════════════════════
//  POPUP DE CONTROLES
// ════════════════════════════════════════════
const overlay = document.getElementById('controlsOverlay');
const btnOpen = document.getElementById('btnControls');
const btnClose = document.getElementById('btnControlsClose');

btnOpen.addEventListener('click', () => {
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
    renderGPMap(); renderKeymapEditor();
});
btnClose.addEventListener('click', closeControls);
overlay.addEventListener('click', e => { if (e.target === overlay) closeControls(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (listeningForKey) { cancelListenKeyboard(); return; }
        if (listeningFor) { cancelListen(); return; }
        if (overlay.classList.contains('open')) closeControls();
    }
});
function closeControls() {
    if (listeningFor) cancelListen();
    if (listeningForKey) cancelListenKeyboard();
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true');
}

// ── Tabs ──
document.querySelectorAll('.ctrl-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.ctrl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ctrl-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
    });
});

// ── Gamepad mapper ──
let listeningFor = null, listenInterval = null;

function renderGPMap() {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    const gpNameEl = document.getElementById('gpName');
    if (gpNameEl) gpNameEl.textContent = gp ? gp.id.substring(0, 60) : t('gamepad_no_connected');
    const list = document.getElementById('gpMapList');
    if (!list) return;
    list.innerHTML = '';
    ACTIONS.forEach(action => {
        const btnIndex = Object.keys(gpMap).find(k => gpMap[k] === action.id);
        const row = document.createElement('div');
        row.className = 'gpmap-row'; row.id = 'gprow-' + action.id;
        row.innerHTML = `
            <span class="gpmap-action">${t(action.labelKey)}</span>
            <span class="gpmap-btn" id="gpbtn-${action.id}">${btnIndex !== undefined ? t('gpmap_button_prefix') + btnIndex : '—'}</span>
            <button class="gpmap-set" data-action="${action.id}">${t('btn_set')}</button>`;
        list.appendChild(row);
    });
    list.querySelectorAll('.gpmap-set').forEach(btn => btn.addEventListener('click', () => startListen(btn.dataset.action)));
}

function startListen(actionId) {
    if (listeningFor) cancelListen();
    if (listeningForKey) cancelListenKeyboard();
    listeningFor = actionId;
    const row = document.getElementById('gprow-' + actionId);
    const btnEl = document.getElementById('gpbtn-' + actionId);
    const setBtn = row.querySelector('.gpmap-set');
    row.classList.add('gpmap-listening');
    btnEl.textContent = t('press_button_full');
    setBtn.textContent = t('btn_cancel');
    setBtn.onclick = cancelListen;
    listenInterval = setInterval(() => {
        const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
        if (!gp) return;
        gp.buttons.forEach((btn, i) => {
            if ((btn.pressed || btn.value > 0.5) && listeningFor) {
                Object.keys(gpMap).forEach(k => { if (gpMap[k] === listeningFor) delete gpMap[k]; });
                gpMap[i] = listeningFor;
                saveGPMap(); cancelListen(); renderGPMap();
            }
        });
    }, 50);
}

function cancelListen() {
    if (listenInterval) { clearInterval(listenInterval); listenInterval = null; }
    listeningFor = null; renderGPMap();
}

document.getElementById('btnGPReset')?.addEventListener('click', () => {
    gpMap = { ...DEFAULT_GP_MAP }; saveGPMap(); renderGPMap();
});

// ── Editor de teclado — 2 columnas (D-Pad | Botones), editable ──
let listeningForKey = null;

function keymapRowHTML(action) {
    return `
        <div class="gpmap-row" id="kmrow-${action.id}">
            <span class="gpmap-action">${t(action.labelKey)}</span>
            <span class="gpmap-btn" id="kmbtn-${action.id}">${keyLabel(keymap[action.id])}</span>
            <button class="gpmap-set" data-action="${action.id}">${t('btn_set')}</button>
        </div>`;
}

// Botones A/B/X/Y/L/R — tarjeta compacta para la grilla de 3×2.
function keymapButtonCardHTML(action) {
    const shortLabel = action.id.toUpperCase();
    return `
        <div class="keymap-btn-card" id="kmrow-${action.id}">
            <span class="keymap-btn-label">${shortLabel}</span>
            <span class="gpmap-btn" id="kmbtn-${action.id}">${keyLabel(keymap[action.id])}</span>
            <button class="gpmap-set" data-action="${action.id}">${t('btn_set')}</button>
        </div>`;
}

function renderKeymapEditor() {
    const dpadList = document.getElementById('keymapDpadList');
    const buttonsList = document.getElementById('keymapButtonsList');
    const extraList = document.getElementById('keymapExtraList');
    if (!dpadList || !buttonsList) return;

    dpadList.innerHTML = ACTIONS.filter(a => DPAD_IDS.includes(a.id)).map(keymapRowHTML).join('');
    buttonsList.innerHTML = ACTIONS.filter(a => BUTTON_IDS.includes(a.id)).map(keymapButtonCardHTML).join('');
    if (extraList) extraList.innerHTML = ACTIONS.filter(a => EXTRA_IDS.includes(a.id)).map(keymapRowHTML).join('');

    [dpadList, buttonsList, extraList].forEach(list => {
        if (!list) return;
        list.querySelectorAll('.gpmap-set').forEach(btn =>
            btn.addEventListener('click', () => startListenKeyboard(btn.dataset.action)));
    });
}

function startListenKeyboard(actionId) {
    if (listeningForKey) cancelListenKeyboard();
    if (listeningFor) cancelListen();
    listeningForKey = actionId;
    const row = document.getElementById('kmrow-' + actionId);
    const btnEl = document.getElementById('kmbtn-' + actionId);
    const setBtn = row?.querySelector('.gpmap-set');
    const compact = row?.classList.contains('keymap-btn-card');
    row?.classList.add('gpmap-listening');
    if (btnEl) btnEl.textContent = compact ? '…' : t('press_key_full');
    if (setBtn) { setBtn.textContent = t('btn_cancel'); setBtn.onclick = cancelListenKeyboard; }
    document.addEventListener('keydown', keyCaptureHandler, true);
}

function keyCaptureHandler(e) {
    if (!listeningForKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { cancelListenKeyboard(); return; }
    assignKeymapKey(listeningForKey, e.code);
}

function assignKeymapKey(actionId, code) {
    // Si esa tecla ya estaba usada por otra acción, la deja sin asignar
    // para evitar que dos acciones respondan a la misma tecla.
    Object.keys(keymap).forEach(k => { if (k !== actionId && keymap[k] === code) keymap[k] = null; });
    keymap[actionId] = code;
    saveKeymap();
    document.removeEventListener('keydown', keyCaptureHandler, true);
    listeningForKey = null;
    renderKeymapEditor();
}

function cancelListenKeyboard() {
    document.removeEventListener('keydown', keyCaptureHandler, true);
    listeningForKey = null;
    renderKeymapEditor();
}

document.getElementById('btnKeymapReset')?.addEventListener('click', () => {
    keymap = { ...DEFAULT_KEYMAP }; saveKeymap(); renderKeymapEditor();
});

// ════════════════════════════════════════════
//  INICIO
// ════════════════════════════════════════════
(function init() {
    const track = document.getElementById('romTrack');
    if (track) track.innerHTML = `<div class="rom-page rom-empty-page"><p class="rom-empty">${t('catalog_loading')}</p></div>`;
    loadGameLibrary();
    renderKeymapEditor();
    drawSplash();
    if (typeof embedSuperNintendo === 'undefined') {
        setStatus('⚠ Missing js/SuperNintendo.min.js — see README', 'err');
        showError('SuperNintendo.min.js not found in js/ folder.',
            '→ Download: https://github.com/lrusso/SuperNintendo/raw/main/SuperNintendo.min.js');
    }
    enableButtons(false, false, false);
})();

// ════════════════════════════════════════════
//  IDIOMA — re-renderizar lo que ya estaba dibujado cuando se
//  cambia ES/EN desde el toggle del header (js/i18n.js).
// ════════════════════════════════════════════
window.addEventListener('vaultlangchange', () => {
    // Los mensajes de catálogo vacío/error quedan "congelados" en el
    // idioma en el que se cargaron — se recalculan según el estado actual.
    if (catalogErrorKind === 'empty') catalogErrorMsg = t('catalog_empty');
    else if (catalogErrorKind === 'failed') catalogErrorMsg = t('catalog_load_failed');
    drawSplash();
    renderCarousel();
    renderGPMap();
    renderKeymapEditor();
    updateFullscreenBtn();
});
