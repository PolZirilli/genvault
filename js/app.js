// ════════════════════════════════════════════
//  GENvault — Emulador Sega Mega Drive / Genesis
//  Motor: Genesis.js (PicoDrive JS puro)
// ════════════════════════════════════════════

// ══ REFS UI ══
const splash       = document.getElementById('splashCanvas');
let   emuContainer = document.getElementById('emuContainer');
const loaderOvrl   = document.getElementById('loaderOverlay');
const ledEl        = document.getElementById('led');
const statusEl     = document.getElementById('statusText');
const fpsEl        = document.getElementById('fpsCounter');
const romNameEl    = document.getElementById('romName');
const errorBox     = document.getElementById('errorBox');
const screenWrap   = document.getElementById('screenWrap');

// ══ ESTADO ══
let emuRunning  = false;
let paused      = false;
let lastROMName = '';
let fpsInterval = null;
let fpsFrames   = 0;
let fpsLast     = performance.now();

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const DEAD           = 0.45;

// ════════════════════════════════════════════
//  GALERÍA DE ROMs (mismos títulos que la versión anterior,
//  ahora en un carousel de máx. 2 filas en vez de <select>)
// ════════════════════════════════════════════
const ROM_LIBRARY = [
    { name: 'Castlevania - Bloodlines',                       tag: 'ESP', url: 'roms/Castlevania - Bloodlines (ESP).md' },
    { name: 'Sonic The Hedgehog',                              tag: 'ESP', url: 'roms/Sonic The Hedgehog (ESP).md' },
    { name: 'Taz in Escape from Mars',                         tag: 'ESP', url: 'roms/Taz in Escape from Mars (ESP).bin' },
    { name: "TMNT - The Hyperstone Heist",                     tag: 'ESP', url: 'roms/Teenage Mutant Ninja Turtles - The Hyperstone Heist (ESP).bin' },
    { name: "TMNT - Tournament Fighters",                      tag: 'ESP', url: 'roms/Teenage Mutant Ninja Turtles - Tournament Fighters (ESP).bin' },
    { name: 'Terminator 2 - Judgment Day',                     tag: 'ESP', url: 'roms/Terminator 2 - Judgment Day (ESP).bin' },
    { name: 'Tetris',                                          tag: 'ESP', url: 'roms/Tetris (ESP).bin' },
    { name: 'The Addams Family',                               tag: 'ESP', url: 'roms/The Addams Family (ESP).bin' },
    { name: 'The Death and Return of Superman',                tag: 'ESP', url: 'roms/The Death and Return of Superman (ESP).bin' },
    { name: 'The Flintstones',                                 tag: 'ESP', url: 'roms/The Flintstones (ESP-Wave).md' },
    { name: 'The Lion King',                                   tag: 'ESP', url: 'roms/The Lion King (ESP).bin' },
    { name: 'The Terminator',                                  tag: 'ESP', url: 'roms/The Terminator (ESP).bin' },
    { name: "Tiny Toon Adventures - Buster's Hidden Treasure", tag: 'ESP', url: "roms/Tiny Toon Adventures - Buster's Hidden Treasure (ESP).md" },
    { name: 'Toejam & Earl',                                   tag: 'ESP', url: 'roms/Toejam & Earl (ESP).bin' },
    { name: 'Toy Story',                                       tag: 'ESP', url: 'roms/Toy Story (ESP).bin' },
    { name: 'Turbo Outrun',                                    tag: 'ESP', url: 'roms/Turbo Outrun (ESP).bin' },
    { name: 'Venom - Spider-Man Separation Anxiety',           tag: 'ESP', url: 'roms/Venom - Spider-Man Separation Anxiety (ESP).gen' },
];

// Ícono de cartucho en pixel-art puro CSS/SVG — placeholder hasta tener
// portadas reales (no usamos arte de tapa con copyright).
const CART_ICON_SVG = `
<svg class="cart-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <path d="M6 2h12v3h1v3h-1v11H6V8H5V5h1V2z m2 2v3h8V4H8z m-1 6v9h10v-9H7z m2 2h2v2H9v-2z m4 0h2v2h-2v-2z"/>
</svg>`;

// ════════════════════════════════════════════
//  CAROUSEL DE ROMs — nunca más de 2 filas visibles.
//  El número de columnas se adapta al ancho (4 / 3 / 2), y cada
//  "página" del carousel siempre tiene columnas × 2 tarjetas.
// ════════════════════════════════════════════
let carouselPage = 0;
let carouselPages = [];

function getCarouselColumns() {
    const w = window.innerWidth;
    if (w <= 620) return 2;
    if (w <= 1180) return 3;
    return 4;
}

function buildCarouselPages() {
    const perPage = getCarouselColumns() * 2;
    const pages = [];
    for (let i = 0; i < ROM_LIBRARY.length; i += perPage) {
        pages.push(ROM_LIBRARY.slice(i, i + perPage));
    }
    return pages.length ? pages : [[]];
}

function romCardHTML(rom) {
    return `
        <button type="button" class="rom-card" data-url="${rom.url}" data-name="${rom.name}">
            <span class="rom-cover">
                ${CART_ICON_SVG}
                <span class="rom-tag">${rom.tag}</span>
            </span>
            <span class="rom-info">
                <span class="rom-title">${rom.name}</span>
            </span>
        </button>`;
}

function renderCarousel() {
    const track  = document.getElementById('romTrack');
    const dotsEl = document.getElementById('pageDots');
    const prevBtn = document.getElementById('pagePrev');
    const nextBtn = document.getElementById('pageNext');
    if (!track) return;

    carouselPages = buildCarouselPages();
    if (carouselPage >= carouselPages.length) carouselPage = carouselPages.length - 1;
    if (carouselPage < 0) carouselPage = 0;

    track.innerHTML = carouselPages.map(page => `<div class="rom-page">${page.map(romCardHTML).join('')}</div>`).join('');
    track.querySelectorAll('.rom-card').forEach(card => {
        card.addEventListener('click', () => loadPresetROM(card.dataset.url, card.dataset.name));
    });

    if (dotsEl) {
        dotsEl.innerHTML = '';
        carouselPages.forEach((_, i) => {
            const dot = document.createElement('span');
            dot.className = 'dot' + (i === carouselPage ? ' active' : '');
            dot.addEventListener('click', () => goToCarouselPage(i));
            dotsEl.appendChild(dot);
        });
    }

    if (prevBtn) prevBtn.disabled = carouselPage <= 0;
    if (nextBtn) nextBtn.disabled = carouselPage >= carouselPages.length - 1;

    track.style.transform = `translateX(-${carouselPage * 100}%)`;
}

function goToCarouselPage(index) {
    carouselPage = index;
    renderCarousel();
}

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
//  GAMEPAD MAPPING
// ════════════════════════════════════════════
const ACTIONS = [
    { id: 'up',    label: 'D-Pad Up',    key: 'ArrowUp'    },
    { id: 'down',  label: 'D-Pad Down',  key: 'ArrowDown'  },
    { id: 'left',  label: 'D-Pad Left',  key: 'ArrowLeft'  },
    { id: 'right', label: 'D-Pad Right', key: 'ArrowRight' },
    { id: 'a',     label: 'Button A',    key: 'KeyA'       },
    { id: 'b',     label: 'Button B',    key: 'KeyS'       },
    { id: 'c',     label: 'Button C',    key: 'KeyD'       },
    { id: 'x',     label: 'Button X',    key: 'KeyQ'       },
    { id: 'y',     label: 'Button Y',    key: 'KeyW'       },
    { id: 'z',     label: 'Button Z',    key: 'KeyE'       },
    { id: 'start', label: 'Start',       key: 'Enter'      },
    { id: 'mode',  label: 'Mode',        key: 'KeyZ'       },
];

const DEFAULT_GP_MAP = {
    0:'b', 1:'a', 2:'x', 3:'y', 4:'c', 5:'z',
    8:'mode', 9:'start',
    12:'up', 13:'down', 14:'left', 15:'right',
};

let gpMap = loadGPMap();
function loadGPMap() {
    try { const s = localStorage.getItem('totogen_gpmap'); if (s) return JSON.parse(s); } catch(_) {}
    return { ...DEFAULT_GP_MAP };
}
function saveGPMap() {
    try { localStorage.setItem('totogen_gpmap', JSON.stringify(gpMap)); } catch(_) {}
}

// ════════════════════════════════════════════
//  PREVENIR SCROLL CON FLECHAS
// ════════════════════════════════════════════
window.addEventListener('keydown', e => {
    if (!emuRunning) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
}, { passive: false });

// ════════════════════════════════════════════
//  SPLASH
// ════════════════════════════════════════════
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,'#000d22'); g.addColorStop(1,'#001a44');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(0,102,255,0.10)'; ctx.lineWidth = 1;
    for (let y=0; y<h; y+=16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let x=0; x<w; x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    ctx.fillStyle = '#2a3a52'; ctx.font = '7px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LOAD A ROM TO START', w/2, h/2);
}

// ════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════
function setStatus(msg, ledState) {
    statusEl.textContent = msg;
    ledEl.className = 'led' + (ledState ? ' ' + ledState : '');
}
function enableButtons(play, pause, stop) {
    document.getElementById('btnPlay').disabled  = !play;
    document.getElementById('btnPause').disabled = !pause;
    document.getElementById('btnStop').disabled  = !stop;
}
function showError(msg, hint) {
    errorBox.style.display = 'block';
    document.getElementById('errorMsg').textContent  = ' ' + msg;
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
            fpsEl.textContent = Math.min(Math.round((fpsFrames/delta)*1000),60) + ' FPS';
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
let gpPrev = {}, gpAxesPrev = { up:false, down:false, left:false, right:false };

function actionToKey(id) { return ACTIONS.find(a => a.id === id)?.key || null; }
function fireKey(code, down) {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key:code, bubbles:true }));
}

function pollGamepad() {
    if (!emuRunning || paused) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    if (!gp) return;

    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const code = actionToKey(gpMap[i]);
        if (!code) return;
        if ( pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed &&  gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });

    const ax = gp.axes[0]||0, ay = gp.axes[1]||0;
    const axL=ax<-DEAD, axR=ax>DEAD, axU=ay<-DEAD, axD=ay>DEAD;
    [[axL,gpAxesPrev.left,'left'],[axR,gpAxesPrev.right,'right'],
     [axU,gpAxesPrev.up,'up'],[axD,gpAxesPrev.down,'down']].forEach(([c,p,aid]) => {
        const code = actionToKey(aid);
        if (!code) return;
        if ( c && !p) fireKey(code, true);
        if (!c &&  p) fireKey(code, false);
    });
    gpAxesPrev = { left:axL, right:axR, up:axU, down:axD };
}

let gpPollInterval = null;
function startGPPoll() { stopGPPoll(); gpPollInterval = setInterval(pollGamepad, FRAME_DURATION); }
function stopGPPoll() {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up:false, down:false, left:false, right:false };
}

window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = '🎮 Connected: ' + e.gamepad.id.substring(0,55);
    el.classList.add('connected');
    renderGPMap();
});
window.addEventListener('gamepaddisconnected', () => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = 'Gamepad disconnected';
    el.classList.remove('connected');
    stopGPPoll();
});

// ════════════════════════════════════════════
//  FULLSCREEN
// ════════════════════════════════════════════
const btnFullscreen = document.getElementById('btnFullscreen');
btnFullscreen.addEventListener('click', toggleFullscreen);
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange'].forEach(ev =>
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
    btnFullscreen.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
}

// ════════════════════════════════════════════
//  MONTAR EMULADOR
// ════════════════════════════════════════════
function mountEmulator(romBuffer, romName) {
    hideError();
    if (typeof embedGenesis === 'undefined') {
        showError('Engine not found: js/Genesis.min.js',
            '→ Download from: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
        setStatus('Engine not found', 'err'); return;
    }

    lastROMName = romName;
    splash.style.display       = 'none';
    emuContainer.style.display = 'block';
    showLoader('LOADING ROM...');

    try {
        embedGenesis({
            container: 'emuContainer',
            name: romName,
            rom: romBuffer,
            soundEnabled: true,
            showMobileControls: false,
            player1: {
                up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
                start:'Enter', mode:'KeyZ',
                a:'KeyA', b:'KeyS', c:'KeyD', x:'KeyQ', y:'KeyW', z:'KeyE',
            },
            cbStarted: function() {
                hideLoader();
                emuRunning = true;
                paused     = false;
                romNameEl.textContent = '▸ ' + romName;
                setStatus('Playing: ' + romName, 'on');
                enableButtons(false, true, true);
                startFPS();
                startGPPoll();
            }
        });
    } catch(e) {
        hideLoader();
        splash.style.display       = 'block';
        emuContainer.style.display = 'none';
        setStatus('Error loading ROM', 'err');
        showError('Could not start emulator: ' + e.message);
    }
}

// ════════════════════════════════════════════
//  CARGA DE ROM
// ════════════════════════════════════════════
function handleROMFile(file) {
    if (!file) return;
    hideError();
    const reader = new FileReader();
    reader.onload  = ev => mountEmulator(ev.target.result, file.name);
    reader.onerror = () => showError('Could not read the ROM file.');
    reader.readAsArrayBuffer(file);
}

document.getElementById('romInput').addEventListener('change', e => {
    handleROMFile(e.target.files[0]); e.target.value = '';
});
const drop = document.getElementById('fileDrop');
drop.addEventListener('click',    () => document.getElementById('romInput').click());
drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); handleROMFile(e.dataTransfer.files[0]); });

function loadPresetROM(url, displayName) {
    if (!url) return;
    hideError(); setStatus('Fetching ROM...', null);
    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
        .then(buf => mountEmulator(buf, displayName || url.split('/').pop()))
        .catch(err => { showError('Could not load preset ROM.', err.message); setStatus('Load error','err'); });
}

// ════════════════════════════════════════════
//  BOTONES
// ════════════════════════════════════════════
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning || paused) return;
    paused = true; stopFPS(); stopGPPoll();
    ledEl.className = 'led';
    setStatus('Paused — press ▶ PLAY to continue', null);
    document.getElementById('btnPause').textContent = '⏸ PAUSED';
    enableButtons(true, false, true);
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch(_) {}
};

document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning || !paused) return;
    paused = false;
    setStatus('Playing: ' + lastROMName, 'on');
    document.getElementById('btnPause').textContent = '⏸ PAUSE';
    enableButtons(false, true, true); startFPS(); startGPPoll();
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch(_) {}
};

// STOP — recargar la página mata todo sin excepción
document.getElementById('btnStop').onclick = () => location.reload();

// ════════════════════════════════════════════
//  POPUP DE CONTROLES
// ════════════════════════════════════════════
const overlay  = document.getElementById('controlsOverlay');
const btnOpen  = document.getElementById('btnControls');
const btnClose = document.getElementById('btnControlsClose');

btnOpen.addEventListener('click', () => {
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); renderGPMap();
});
btnClose.addEventListener('click', closeControls);
overlay.addEventListener('click', e => { if (e.target===overlay) closeControls(); });
document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
        if (listeningFor) { cancelListen(); return; }
        if (overlay.classList.contains('open')) closeControls();
    }
});
function closeControls() {
    if (listeningFor) cancelListen();
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true');
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
    if (gpNameEl) gpNameEl.textContent = gp ? gp.id.substring(0,60) : 'No gamepad connected';
    const list = document.getElementById('gpMapList');
    if (!list) return;
    list.innerHTML = '';
    ACTIONS.forEach(action => {
        const btnIndex = Object.keys(gpMap).find(k => gpMap[k] === action.id);
        const row = document.createElement('div');
        row.className = 'gpmap-row'; row.id = 'gprow-' + action.id;
        row.innerHTML = `
            <span class="gpmap-action">${action.label}</span>
            <span class="gpmap-btn" id="gpbtn-${action.id}">${btnIndex !== undefined ? 'Button '+btnIndex : '—'}</span>
            <button class="gpmap-set" data-action="${action.id}">Set</button>`;
        list.appendChild(row);
    });
    list.querySelectorAll('.gpmap-set').forEach(btn => btn.addEventListener('click', () => startListen(btn.dataset.action)));
}

function startListen(actionId) {
    if (listeningFor) cancelListen();
    listeningFor = actionId;
    const row    = document.getElementById('gprow-'+actionId);
    const btnEl  = document.getElementById('gpbtn-'+actionId);
    const setBtn = row.querySelector('.gpmap-set');
    row.classList.add('gpmap-listening');
    btnEl.textContent  = 'Press button...';
    setBtn.textContent = 'Cancel';
    setBtn.onclick     = cancelListen;
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

// ════════════════════════════════════════════
//  INICIO
// ════════════════════════════════════════════
(function init() {
    renderCarousel();
    drawSplash();
    if (typeof embedGenesis === 'undefined') {
        setStatus('⚠ Missing js/Genesis.min.js — see README', 'err');
        showError('Genesis.min.js not found in js/ folder.',
            '→ Download: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
    }
    enableButtons(false, false, false);
})();
