#!/usr/bin/env python3
"""
GENvault - Auto-fetch de portadas (box art) desde libretro-thumbnails
=======================================================================

Busca la portada de cada juego de data/games.json contra el repo publico
libretro/libretro-thumbnails (el mismo que usa RetroArch), matcheando por
nombre, y completa el campo "cover" con la URL directa a la imagen.
No requiere API key. No descarga ni re-hostea nada: las URLs quedan
apuntando a raw.githubusercontent.com.

Uso:
    python3 match_covers.py                # usa ./data/games.json
    python3 match_covers.py ruta/games.json # ruta custom

Requiere: git (para clonar el repo de thumbnails, solo la carpeta que
hace falta gracias a sparse-checkout) y Python 3.

Los juegos sin match quedan con "cover": null (el sitio cae automaticamente
al icono de cartucho placeholder para esos, no rompe nada).
"""
import json, os, re, sys, subprocess, difflib, urllib.parse, tempfile

CONSOLE_DIR = "Sega - Mega Drive - Genesis"
RAW_BASE = "https://raw.githubusercontent.com/libretro-thumbnails/Sega_-_Mega_Drive_-_Genesis/master/Named_Boxarts/"


def normalize(s):
    s = s.replace(".png", "")
    s = re.sub(r"\s*\([^)]*\)", "", s)  # saca tags (USA), (Rev A), (Unl), etc.
    s = re.sub(r",\s*The$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^The\s+", "", s, flags=re.IGNORECASE)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]", "", s.lower())
    return s


def fetch_boxart_filenames(workdir):
    print("Clonando listado de portadas (libretro-thumbnails, solo Genesis)...")
    repo_dir = os.path.join(workdir, "lrthumbs")
    subprocess.run(
        ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
         "https://github.com/libretro/libretro-thumbnails.git", repo_dir],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "sparse-checkout", "set", f"{CONSOLE_DIR}/Named_Boxarts"],
        check=True, cwd=repo_dir, capture_output=True,
    )
    boxart_dir = os.path.join(repo_dir, CONSOLE_DIR, "Named_Boxarts")
    return os.listdir(boxart_dir)


def main():
    games_path = sys.argv[1] if len(sys.argv) > 1 else "data/games.json"
    if not os.path.exists(games_path):
        print(f"No encontre {games_path}. Pasa la ruta como argumento.")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as workdir:
        files = fetch_boxart_filenames(workdir)

    index = {}
    for f in files:
        index.setdefault(normalize(f), []).append(f)

    games = json.load(open(games_path, encoding="utf-8"))

    matched = 0
    for g in games:
        key = normalize(g["name"])
        candidates = index.get(key)
        method = "exact"
        if not candidates:
            close = difflib.get_close_matches(key, index.keys(), n=1, cutoff=0.88)
            if close:
                candidates = index[close[0]]
                method = "fuzzy"
        if candidates:
            usa = [c for c in candidates if "(USA)" in c]
            chosen = usa[0] if usa else candidates[0]
            g["cover"] = RAW_BASE + urllib.parse.quote(chosen)
            matched += 1
            print(f"  [{method}] {g['name']} -> {chosen}")
        else:
            print(f"  [SIN MATCH] {g['name']} (queda con placeholder)")

    with open(games_path, "w", encoding="utf-8") as f:
        json.dump(games, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\n{matched}/{len(games)} juegos matcheados. {games_path} actualizado.")


if __name__ == "__main__":
    main()
