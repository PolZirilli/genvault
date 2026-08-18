#!/usr/bin/env python3
"""TotoGEN — servidor local. Uso: python3 servidor.py [puerto]"""
import http.server, socketserver, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass
print(f'TotoGEN en http://localhost:{PORT} — Ctrl+C para detener')
with socketserver.TCPServer(('', PORT), H) as s:
    try: s.serve_forever()
    except KeyboardInterrupt: print('\nDetenido.')
