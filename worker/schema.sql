-- Ya aplicado en la base D1 "vault-admin" (uuid ba3b1e3a-6bfb-4945-a065-e911a338ab78)
-- durante esta sesión. Se deja el archivo para referencia / por si hace falta
-- recrear la base en otra cuenta.
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
