/**
 * vault-admin — Worker centralizado para subir ROMs a GENvault/SNESvault/NESvault
 * ================================================================================
 *
 * Qué hace:
 *   1. Login simple (usuario/contraseña, guardado hasheado en D1).
 *   2. POST /api/upload (autenticado): sube el ROM al bucket R2 compartido
 *      ("assets", carpeta projects/<sitio>/), busca la portada en el repo
 *      público libretro/libretro-thumbnails (mismo algoritmo que ya usaba
 *      actualizar-portadas.html) y commitea el data/games.json del repo
 *      correspondiente en GitHub (PolZirilli/<repo>) con el juego nuevo o
 *      actualizado.
 *
 * Plataformas nuevas: agregar una entrada al objeto PLATFORMS de abajo. Si
 * la plataforma no usa el mismo esquema {id,name,region,cover,url} o no
 * tiene portadas en libretro-thumbnails (ej. algo tipo DOSVault), esta
 * herramienta NO es el lugar — eso sigue con su propio proceso manual.
 *
 * Secretos que hacen falta (wrangler secret put <NOMBRE>) — ver README.md:
 *   GITHUB_TOKEN     Personal Access Token con permiso de escritura sobre
 *                    Contents en los repos de PLATFORMS (fine-grained: Contents
 *                    Read & Write en nesvault, snesvault, genvault).
 *   SESSION_SECRET   String aleatorio largo, firma los tokens de sesión.
 *   BOOTSTRAP_KEY    Clave temporal de un solo uso para crear la primera
 *                    cuenta de administrador (podés borrarla después).
 */

// ---------------------------------------------------------------------------
// Configuración de plataformas soportadas
// ---------------------------------------------------------------------------
const GITHUB_OWNER = 'PolZirilli';

const PLATFORMS = {
  nes: {
    label: 'NES / Famicom',
    repo: 'nesvault',
    r2Prefix: 'projects/nesvault/',
    extensions: ['.nes'],
    thumbDir: 'Nintendo - Nintendo Entertainment System',
    thumbRawBase:
      'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System/master/Named_Boxarts/',
  },
  snes: {
    label: 'Super Nintendo',
    repo: 'snesvault',
    r2Prefix: 'projects/snesvault/',
    extensions: ['.sfc', '.smc'],
    thumbDir: 'Nintendo - Super Nintendo Entertainment System',
    thumbRawBase:
      'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System/master/Named_Boxarts/',
  },
  genesis: {
    label: 'Sega Genesis / Mega Drive',
    repo: 'genvault',
    r2Prefix: 'projects/genvault/',
    extensions: ['.md', '.bin', '.gen'],
    thumbDir: 'Sega - Mega Drive - Genesis',
    thumbRawBase:
      'https://raw.githubusercontent.com/libretro-thumbnails/Sega_-_Mega_Drive_-_Genesis/master/Named_Boxarts/',
  },
};

const THUMBS_TREE_REPO = 'libretro/libretro-thumbnails';
const FUZZY_THRESHOLD = 0.85;
const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB, de sobra para NES/SNES/Genesis
const GITHUB_API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Utilidades: base64/hex, hashing de contraseñas, tokens de sesión firmados
// ---------------------------------------------------------------------------
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function decodeBase64Utf8(b64) {
  const clean = b64.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
function encodeUtf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function createToken(payload, secret) {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(body, secret);
  return `${body}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = await hmacSign(body, secret);
  if (!timingSafeEqualStr(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
  } catch {
    return null;
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Matching de portadas — mismo algoritmo que actualizar-portadas.html/match_covers.py
// ---------------------------------------------------------------------------
function normalize(s) {
  s = s.replace(/\.png$/i, '');
  s = s.replace(/\s*\([^)]*\)/g, '');
  s = s.replace(/,\s*The$/i, '');
  s = s.replace(/^The\s+/i, '');
  s = s.replace(/&/g, ' and ');
  s = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return s;
}
function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.substr(i, 2);
    m.set(bg, (m.get(bg) || 0) + 1);
  }
  return m;
}
function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bgA = bigrams(a), bgB = bigrams(b);
  let intersection = 0;
  for (const [bg, countA] of bgA) if (bgB.has(bg)) intersection += Math.min(countA, bgB.get(bg));
  const totalA = [...bgA.values()].reduce((x, y) => x + y, 0);
  const totalB = [...bgB.values()].reduce((x, y) => x + y, 0);
  return (2 * intersection) / (totalA + totalB);
}
function matchCover(name, files) {
  const index = new Map();
  for (const f of files) {
    const key = normalize(f);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(f);
  }
  const key = normalize(name);
  let candidates = index.get(key);
  let method = 'exact', score = null;
  if (!candidates) {
    let best = null, bestScore = 0;
    for (const k of index.keys()) {
      const s = diceCoefficient(key, k);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    if (best && bestScore >= FUZZY_THRESHOLD) { candidates = index.get(best); method = 'fuzzy'; score = bestScore; }
  }
  if (!candidates) return null;
  const usa = candidates.filter(c => c.includes('(USA)'));
  return { file: usa.length ? usa[0] : candidates[0], method, score };
}

// ---------------------------------------------------------------------------
// GitHub API — listar portadas de libretro-thumbnails, leer/commitear games.json
// ---------------------------------------------------------------------------
function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vault-admin-worker',
  };
}
async function ghJson(url, token) {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} en ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchThumbFilenames(cfg, token) {
  const root = await ghJson(`${GITHUB_API}/repos/${THUMBS_TREE_REPO}/git/trees/master`, token);
  const consoleEntry = root.tree.find(t => t.path === cfg.thumbDir && t.type === 'tree');
  if (!consoleEntry) throw new Error(`No encontré la carpeta "${cfg.thumbDir}" en libretro-thumbnails.`);
  const consoleTree = await ghJson(`${GITHUB_API}/repos/${THUMBS_TREE_REPO}/git/trees/${consoleEntry.sha}`, token);
  const boxartsEntry = consoleTree.tree.find(t => t.path === 'Named_Boxarts' && t.type === 'tree');
  if (!boxartsEntry) throw new Error('No encontré la carpeta "Named_Boxarts".');
  const boxartsTree = await ghJson(`${GITHUB_API}/repos/${THUMBS_TREE_REPO}/git/trees/${boxartsEntry.sha}`, token);
  if (boxartsTree.truncated) throw new Error('El listado de portadas vino truncado (demasiados archivos).');
  return boxartsTree.tree.filter(t => t.type === 'blob').map(t => t.path);
}

async function updateGamesJson(cfg, entry, token) {
  const path = 'data/games.json';
  const contentsUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${cfg.repo}/contents/${path}`;
  const current = await ghJson(contentsUrl, token);
  const games = JSON.parse(decodeBase64Utf8(current.content));

  const idx = games.findIndex(g => g.id === entry.id);
  const action = idx >= 0 ? 'updated' : 'created';
  if (idx >= 0) games[idx] = { ...games[idx], ...entry };
  else games.push(entry);

  const newContent = JSON.stringify(games, null, 2) + '\n';
  const putRes = await fetch(contentsUrl, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${action === 'created' ? 'Agrega' : 'Actualiza'} "${entry.name}" vía vault-admin panel`,
      content: encodeUtf8ToBase64(newContent),
      sha: current.sha,
      branch: 'main',
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`No pude commitear data/games.json en ${cfg.repo}: ${putRes.status} ${text.slice(0, 200)}`);
  }
  const putJson = await putRes.json();
  return { action, commitUrl: putJson.commit && putJson.commit.html_url, gamesCount: games.length };
}

// ---------------------------------------------------------------------------
// Helpers varios
// ---------------------------------------------------------------------------
function jsonResponse(data, status, corsHdrs) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHdrs },
  });
}
function sanitizeFilename(name) {
  return String(name).replace(/[\/\\]/g, '').replace(/^\.+/, '').trim();
}
function slugify(name) {
  return String(name)
    .replace(/\([^)]*\)/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('');
}
async function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { ok: false, error: 'Falta autenticación.' };
  const payload = await verifyToken(token, env.SESSION_SECRET);
  if (!payload) return { ok: false, error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' };
  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleStatus(env, corsHdrs) {
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first();
  return jsonResponse({ hasAdmin: row.count > 0 }, 200, corsHdrs);
}

async function handleBootstrap(request, env, corsHdrs) {
  const key = request.headers.get('X-Bootstrap-Key');
  if (!key || !env.BOOTSTRAP_KEY || !timingSafeEqualStr(key, env.BOOTSTRAP_KEY)) {
    return jsonResponse({ error: 'Clave de arranque inválida.' }, 403, corsHdrs);
  }
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first();
  if (row.count > 0) {
    return jsonResponse({ error: 'Ya existe una cuenta de administrador. El bootstrap ya no está disponible.' }, 409, corsHdrs);
  }
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) return jsonResponse({ error: 'Faltan usuario/contraseña.' }, 400, corsHdrs);
  if (String(body.password).length < 8) return jsonResponse({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }, 400, corsHdrs);

  const { hash, salt } = await hashPassword(body.password);
  await env.DB.prepare(
    'INSERT INTO admin_users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)'
  ).bind(String(body.username).trim(), hash, salt, new Date().toISOString()).run();

  return jsonResponse({ ok: true }, 200, corsHdrs);
}

async function handleLogin(request, env, corsHdrs) {
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) return jsonResponse({ error: 'Faltan credenciales.' }, 400, corsHdrs);

  const row = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(String(body.username).trim()).first();
  if (!row) return jsonResponse({ error: 'Usuario o contraseña incorrectos.' }, 401, corsHdrs);

  const { hash } = await hashPassword(body.password, row.password_salt);
  if (!timingSafeEqualStr(hash, row.password_hash)) {
    return jsonResponse({ error: 'Usuario o contraseña incorrectos.' }, 401, corsHdrs);
  }

  const ttl = parseInt(env.SESSION_TTL_SECONDS || '43200', 10);
  const token = await createToken(
    { sub: row.id, username: row.username, exp: Math.floor(Date.now() / 1000) + ttl },
    env.SESSION_SECRET
  );
  return jsonResponse({ token, expiresIn: ttl }, 200, corsHdrs);
}

function handlePlatforms(corsHdrs) {
  const data = Object.fromEntries(
    Object.entries(PLATFORMS).map(([key, v]) => [key, { label: v.label, extensions: v.extensions }])
  );
  return jsonResponse(data, 200, corsHdrs);
}

async function handleUpload(request, env, corsHdrs) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, 401, corsHdrs);

  const form = await request.formData().catch(() => null);
  if (!form) return jsonResponse({ error: 'No pude leer el formulario enviado.' }, 400, corsHdrs);

  const platformKey = form.get('platform');
  const cfg = PLATFORMS[platformKey];
  if (!cfg) return jsonResponse({ error: `Plataforma desconocida: ${platformKey}` }, 400, corsHdrs);

  const file = form.get('rom');
  if (!file || typeof file === 'string') return jsonResponse({ error: 'Falta el archivo de ROM.' }, 400, corsHdrs);
  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: `El archivo supera el límite de ${MAX_FILE_SIZE / (1024 * 1024)}MB.` }, 400, corsHdrs);
  }

  const filename = sanitizeFilename(file.name);
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (!cfg.extensions.includes(ext)) {
    return jsonResponse(
      { error: `Extensión "${ext}" no válida para ${cfg.label}. Esperado: ${cfg.extensions.join(', ')}` },
      400,
      corsHdrs
    );
  }

  const name = String(form.get('name') || '').trim();
  if (!name) return jsonResponse({ error: 'Falta el nombre del juego.' }, 400, corsHdrs);
  const id = String(form.get('id') || '').trim() || slugify(name);
  const region = String(form.get('region') || '').trim();

  const log = [];
  try {
    // 1) Subir el ROM a R2
    const r2Key = cfg.r2Prefix + filename;
    await env.ASSETS_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
    const romUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '') + '/' + r2Key.split('/').map(encodeURIComponent).join('/');
    log.push({ kind: 'ok', msg: `ROM subida a R2: ${r2Key}` });

    // 2) Buscar portada en libretro-thumbnails
    let cover = null;
    try {
      const files = await fetchThumbFilenames(cfg, env.GITHUB_TOKEN);
      const match = matchCover(name, files);
      if (match) {
        cover = cfg.thumbRawBase + encodeURIComponent(match.file);
        const label = match.method === 'exact' ? 'match exacto' : `match aproximado (${(match.score * 100).toFixed(0)}%)`;
        log.push({ kind: match.method === 'exact' ? 'ok' : 'fuzzy', msg: `Cover — ${label}: ${match.file}` });
      } else {
        log.push({ kind: 'miss', msg: 'Sin match de cover en libretro-thumbnails — queda con el placeholder de cartucho.' });
      }
    } catch (e) {
      log.push({ kind: 'warn', msg: `No pude buscar la portada: ${e.message}` });
    }

    // 3) Commitear data/games.json en GitHub
    const entry = { id, name, region, cover, url: romUrl };
    const result = await updateGamesJson(cfg, entry, env.GITHUB_TOKEN);
    log.push({
      kind: 'ok',
      msg:
        result.action === 'created'
          ? `data/games.json de ${cfg.repo} actualizado — juego nuevo agregado (${result.gamesCount} en total).`
          : `data/games.json de ${cfg.repo} actualizado — se sobreescribió el juego existente con id "${id}" (${result.gamesCount} en total).`,
    });

    return jsonResponse({ ok: true, log, entry, commitUrl: result.commitUrl }, 200, corsHdrs);
  } catch (e) {
    log.push({ kind: 'err', msg: e.message });
    return jsonResponse({ ok: false, log, error: e.message }, 500, corsHdrs);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const corsHdrs = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bootstrap-Key',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHdrs });

    try {
      if (url.pathname === '/api/status' && request.method === 'GET') return await handleStatus(env, corsHdrs);
      if (url.pathname === '/api/bootstrap' && request.method === 'POST') return await handleBootstrap(request, env, corsHdrs);
      if (url.pathname === '/api/login' && request.method === 'POST') return await handleLogin(request, env, corsHdrs);
      if (url.pathname === '/api/platforms' && request.method === 'GET') return handlePlatforms(corsHdrs);
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(request, env, corsHdrs);
      return jsonResponse({ error: 'No encontrado.' }, 404, corsHdrs);
    } catch (e) {
      return jsonResponse({ error: `Error interno: ${e.message}` }, 500, corsHdrs);
    }
  },
};
