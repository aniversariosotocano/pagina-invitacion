import os
import sys
import json
import sqlite3
import re
import base64
from html import escape
import hashlib
import hmac
import secrets
import threading
import time
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs, quote, urlencode
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from og_preview import render_preview

HOST = os.environ.get("PROTOCOLO_HOST", "127.0.0.1")
PORT = int(os.environ.get("PROTOCOLO_PORT", "8000"))
MAX_BODY_BYTES = 1_000_000
ALLOWED_TEMPLATES = {
    "tucano-sunset", "supertucano", "maule", "tucanos-formacion",
    "soto-cano-pista", "tucano-vuelo", "classic"
}
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "assets", "data", "protocolo.db")
JSON_INVITADOS_PATH = os.path.join(BASE_DIR, "assets", "data", "invitados.json")
JSON_CONFIG_PATH = os.path.join(BASE_DIR, "assets", "data", "config.json")
PUBLIC_BASE_URL = os.environ.get("PROTOCOLO_PUBLIC_URL", "https://aniversariosotocano.pythonanywhere.com").strip().rstrip("/")
SESSION_TTL_SECONDS = 8 * 60 * 60
COOKIE_SECURE = os.environ.get("PROTOCOLO_COOKIE_SECURE", "0").strip().lower() in {"1", "true", "yes"}
ADMIN_USER = os.environ.get("PROTOCOLO_ADMIN_USER", "admin").strip() or "admin"
ADMIN_PASSWORD = os.environ.get("PROTOCOLO_ADMIN_PASSWORD", "").strip()
PASSWORD_ITERATIONS = 210_000
PASSWORD_MIN_LENGTH = 6
SESSION_COOKIE = "protocolo_session"
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()
PROTECTED_PAGES = {"/admin.html", "/ajustes.html", "/usuarios.html"}
PROTECTED_GET_PATHS = {"/api/invitados", "/api/users"}
PROTECTED_POST_PATHS = {
    "/api/config", "/api/invitados", "/api/invitados/toggle",
    "/api/invitados/delete", "/api/invitados/import", "/api/users",
    "/api/users/toggle", "/api/auth/password"
}
NEVER_PUBLIC_FILES = {"/server.py", "/assets/data/protocolo.db"}

def clean_text(value, field, default="", max_length=240, required=False, min_length=0):
    text = str(value if value is not None else default).strip()
    if required and len(text) < min_length:
        raise ValueError(f"{field} debe tener al menos {min_length} caracteres")
    if len(text) > max_length:
        raise ValueError(f"{field} no puede superar {max_length} caracteres")
    return text

def bounded_int(value, field, default, minimum, maximum):
    try:
        number = int(value if value is not None else default)
    except (TypeError, ValueError):
        raise ValueError(f"{field} debe ser un número entero")
    if not minimum <= number <= maximum:
        raise ValueError(f"{field} debe estar entre {minimum} y {maximum}")
    return number

def parse_bool(value, field, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "sí", "si", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    raise ValueError(f"{field} debe ser booleano")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(PASSWORD_ITERATIONS, base64.urlsafe_b64encode(salt).decode(), base64.urlsafe_b64encode(digest).decode())

def verify_password(password, encoded):
    try:
        algorithm, iterations, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, UnicodeError):
        return False

def ensure_auth_schema():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    row = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
    if not row:
        if ADMIN_PASSWORD and len(ADMIN_PASSWORD) < PASSWORD_MIN_LENGTH:
            conn.close()
            raise ValueError(f"PROTOCOLO_ADMIN_PASSWORD debe tener al menos {PASSWORD_MIN_LENGTH} caracteres")
        generated = not ADMIN_PASSWORD
        initial_password = ADMIN_PASSWORD or secrets.token_urlsafe(16)
        conn.execute(
            "INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, 'admin', 1)",
            (ADMIN_USER, hash_password(initial_password))
        )
        conn.commit()
        if generated:
            print(f"Usuario inicial creado: {ADMIN_USER}")
            print(f"Contraseña inicial (guárdela y cámbiela antes de producción): {initial_password}")
    else:
        conn.commit()
    conn.close()

def sync_json_files():
    conn = get_db()
    cursor = conn.cursor()
    
    # Sync config.json
    cursor.execute("SELECT fecha_fundacion, aniversario, aniversario_auto, fecha_evento, hora_evento, vestimenta, plantilla_predeterminada, plantilla_version, nombre_evento FROM config_global WHERE id = 1")
    row = cursor.fetchone()
    if row:
        cfg = {
            "fecha_fundacion": row["fecha_fundacion"],
            "aniversario": row["aniversario"],
            "aniversario_auto": bool(row["aniversario_auto"]),
            "fecha_evento": row["fecha_evento"],
            "hora_evento": row["hora_evento"],
            "vestimenta": row["vestimenta"],
            "plantilla_predeterminada": row["plantilla_predeterminada"] or "tucano-sunset",
            "plantilla_version": row["plantilla_version"] or 1,
            "nombre_evento": row["nombre_evento"] or "Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”"
        }
        with open(JSON_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

    # Sync invitados.json
    cursor.execute("SELECT id, no, categoria, tratamiento, grado, nombre, cargo, activo, observaciones, plantilla_id, plantilla_version, updated_at FROM invitados ORDER BY no ASC")
    rows = cursor.fetchall()
    invitados = [
        {
            "id": r["id"],
            "no": r["no"],
            "categoria": r["categoria"],
            "tratamiento": r["tratamiento"],
            "grado": r["grado"],
            "nombre": r["nombre"],
            "cargo": r["cargo"],
            "activo": bool(r["activo"]),
            "observaciones": r["observaciones"] or "",
            "plantilla_id": r["plantilla_id"] or "tucano-sunset",
            "plantilla_version": r["plantilla_version"] or 1,
            "updated_at": r["updated_at"] or ""
        }
        for r in rows
    ]
    with open(JSON_INVITADOS_PATH, 'w', encoding='utf-8') as f:
        json.dump(invitados, f, ensure_ascii=False, indent=2)
        
    conn.close()

class ProtocoloRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def copyfile(self, source, outputfile):
        """Una navegación o recarga puede cancelar una descarga en curso."""
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # WinError 10054 no indica un fallo de la aplicación: el cliente cerró el socket.
            return

    def send_json(self, data, status=200, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, content_type, status=200, headers=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def current_user(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
        except (ValueError, UnicodeError):
            return None
        morsel = cookie.get(SESSION_COOKIE)
        token = morsel.value if morsel else ""
        if not token:
            return None

        with SESSIONS_LOCK:
            session = SESSIONS.get(token)
            if not session:
                return None
            if session["expires_at"] <= time.time():
                SESSIONS.pop(token, None)
                return None
            user_id = session["user_id"]

        conn = get_db()
        row = conn.execute("SELECT id, username, role, active FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        if not row or not bool(row["active"]):
            with SESSIONS_LOCK:
                SESSIONS.pop(token, None)
            return None
        return row

    def require_admin(self):
        user = self.current_user()
        if not user:
            self.send_json({"error": "Autenticación requerida"}, status=401)
            return None
        if user["role"] != "admin":
            self.send_json({"error": "Permisos insuficientes"}, status=403)
            return None
        return user

    def redirect_to_login(self, next_path):
        safe_path = next_path if next_path.startswith('/') and not next_path.startswith('//') else '/admin.html'
        self.send_response(302)
        self.send_header('Location', '/login.html?next=' + quote(safe_path, safe=''))
        self.end_headers()

    @staticmethod
    def _preview_value(params, key, default="", max_length=240):
        value = params.get(key, [default])[0]
        return str(value or default).strip()[:max_length]

    def preview_data(self, params):
        data = {
            "tratamiento": self._preview_value(params, "tratamiento", "Invitación especial"),
            "grado": self._preview_value(params, "grado"),
            "nombre": self._preview_value(params, "nombre", "Invitado especial"),
            "cargo": self._preview_value(params, "cargo"),
            "aniversario": self._preview_value(params, "aniversario", "38", 12),
            "fecha": self._preview_value(params, "fecha", "24 de Septiembre de 2026", 120),
            "hora": self._preview_value(params, "hora", "10:00 am", 80),
            "nombre_evento": self._preview_value(params, "nombre_evento", "Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”", 180),
        }

        guest_id = self._preview_value(params, "id", "", 40)
        if guest_id.isdigit():
            conn = get_db()
            row = conn.execute(
                "SELECT tratamiento, grado, nombre, cargo FROM invitados WHERE id = ?",
                (int(guest_id),),
            ).fetchone()
            conn.close()
            if row:
                for key in ("tratamiento", "grado", "nombre", "cargo"):
                    if row[key]:
                        data[key] = str(row[key]).strip()[:240]

        return data

    def _preview_url(self, data):
        image_query = urlencode({
            key: value for key, value in data.items()
            if value and key in {"tratamiento", "grado", "nombre", "cargo", "aniversario", "fecha", "hora", "nombre_evento"}
        })
        return f"{PUBLIC_BASE_URL}/og-image.png?{image_query}"

    def serve_dynamic_invitation(self, params):
        data = self.preview_data(params)
        with open(os.path.join(BASE_DIR, "index.html"), "r", encoding="utf-8") as file:
            document = file.read()

        name = escape(data["nombre"], quote=True)
        event = escape(data["nombre_evento"].replace("<br>", " "), quote=True)
        title = escape(f"Invitación para {data['nombre']}", quote=True)
        description = escape(
            f"{data['tratamiento']} {data['grado']} {data['nombre']}. {event}. {data['fecha']} a las {data['hora']}.",
            quote=True,
        )
        image_url = escape(self._preview_url(data), quote=True)
        current_url = escape(f"{PUBLIC_BASE_URL}/index.html?{urlencode(params, doseq=True)}", quote=True)

        replacements = {
            r'(<title>)[^<]*(</title>)': rf'\g<1>{title}\g<2>',
            r'(<meta property="og:title" content=")[^"]*(")': rf'\g<1>{title}\g<2>',
            r'(<meta property="og:description" content=")[^"]*(")': rf'\g<1>{description}\g<2>',
            r'(<meta property="og:image" content=")[^"]*(")': rf'\g<1>{image_url}\g<2>',
            r'(<meta name="twitter:title" content=")[^"]*(")': rf'\g<1>{title}\g<2>',
            r'(<meta name="twitter:description" content=")[^"]*(")': rf'\g<1>{description}\g<2>',
            r'(<meta name="twitter:image" content=")[^"]*(")': rf'\g<1>{image_url}\g<2>',
        }
        for pattern, replacement in replacements.items():
            document = re.sub(pattern, replacement, document, count=1)
        document = document.replace(
            '</head>',
            f'<meta property="og:url" content="{current_url}">\n</head>',
            1,
        )
        self.send_bytes(document.encode('utf-8'), 'text/html; charset=utf-8', headers={'Cache-Control': 'no-cache'})

    @staticmethod
    def session_cookie(token, max_age=SESSION_TTL_SECONDS):
        parts = [f"{SESSION_COOKIE}={token}", f"Max-Age={max_age}", "Path=/", "HttpOnly", "SameSite=Lax"]
        if COOKIE_SECURE:
            parts.append("Secure")
        return "; ".join(parts)

    def do_AUTH_login(self, payload):
        username = clean_text(payload.get('username'), 'username', '', 32, True, 3)
        password = payload.get('password')
        if not isinstance(password, str) or not password or len(password) > 128:
            self.send_json({"error": "Contraseña inválida"}, status=422)
            return

        conn = get_db()
        row = conn.execute(
            "SELECT id, username, role, active, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username,)
        ).fetchone()
        conn.close()
        if not row or not bool(row['active']) or not verify_password(password, row['password_hash']):
            self.send_json({"error": "Usuario o contraseña incorrectos"}, status=401)
            return

        token = secrets.token_urlsafe(32)
        with SESSIONS_LOCK:
            SESSIONS[token] = {"user_id": row['id'], "expires_at": time.time() + SESSION_TTL_SECONDS}
        self.send_json(
            {"ok": True, "user": {"id": row['id'], "username": row['username'], "role": row['role']}},
            headers={"Set-Cookie": self.session_cookie(token)}
        )

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == '/og-image.png':
            preview = render_preview(self.preview_data(params))
            self.send_bytes(preview, 'image/png', headers={'Cache-Control': 'public, max-age=300'})
            return

        if path == '/index.html' and any(key in params for key in ('id', 'nombre')):
            self.serve_dynamic_invitation(params)
            return

        if path == '/':
            # La raíz es la puerta de entrada administrativa; las invitaciones
            # públicas continúan disponibles mediante sus enlaces directos.
            self.redirect_to_login('/admin.html')
            return

        if path in PROTECTED_PAGES and not self.current_user():
            self.redirect_to_login(path)
            return

        if path in NEVER_PUBLIC_FILES:
            self.send_json({"error": "Recurso no disponible"}, status=404)
            return

        # El padrón completo y los archivos internos del panel nunca deben ser públicos.
        if path == '/assets/data/invitados.json' and not self.current_user():
            self.send_json({"error": "Recurso protegido"}, status=403)
            return

        if path == '/api/auth/me':
            user = self.current_user()
            if not user:
                self.send_json({"authenticated": False})
            else:
                self.send_json({
                    "authenticated": True,
                    "user": {"id": user['id'], "username": user['username'], "role": user['role']}
                })
            return

        if path == '/api/invitado':
            guest_id = params.get('id', [''])[0].strip()
            if not guest_id:
                self.send_json({"error": "ID requerido"}, status=400)
                return
            conn = get_db()
            row = conn.execute(
                "SELECT id, tratamiento, grado, nombre, cargo, activo, plantilla_id, plantilla_version FROM invitados WHERE id = ?",
                (guest_id,)
            ).fetchone()
            conn.close()
            if not row:
                self.send_json({"error": "Invitado no encontrado"}, status=404)
                return
            self.send_json({
                "id": row['id'],
                "tratamiento": row['tratamiento'],
                "grado": row['grado'],
                "nombre": row['nombre'],
                "cargo": row['cargo'],
                "activo": bool(row['activo']),
                "plantilla_id": row['plantilla_id'] or "tucano-sunset",
                "plantilla_version": row['plantilla_version'] or 1
            })
            return

        if path == '/api/users':
            if not self.require_admin():
                return
            conn = get_db()
            rows = conn.execute("SELECT id, username, role, active, created_at, updated_at FROM users ORDER BY username COLLATE NOCASE").fetchall()
            conn.close()
            self.send_json([
                {
                    "id": row['id'], "username": row['username'], "role": row['role'],
                    "active": bool(row['active']), "created_at": row['created_at'], "updated_at": row['updated_at']
                }
                for row in rows
            ])
            return

        # 1. API: Configuración Global
        if path == '/api/config':
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT fecha_fundacion, aniversario, aniversario_auto, fecha_evento, hora_evento, vestimenta, plantilla_predeterminada, plantilla_version, nombre_evento FROM config_global WHERE id = 1")
            row = c.fetchone()
            conn.close()
            if row:
                self.send_json({
                    "fecha_fundacion": row["fecha_fundacion"],
                    "aniversario": row["aniversario"],
                    "aniversario_auto": bool(row["aniversario_auto"]),
                    "fecha_evento": row["fecha_evento"],
                    "hora_evento": row["hora_evento"],
                    "vestimenta": row["vestimenta"],
                    "plantilla_predeterminada": row["plantilla_predeterminada"] or "tucano-sunset",
                    "plantilla_version": row["plantilla_version"] or 1,
                    "nombre_evento": row["nombre_evento"] or "Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”"
                })
            else:
                self.send_json({"error": "Configuración no encontrada"}, status=404)
            return

        # 2. API: Lista de Invitados (usa índices SQLite optimizados)
        if path == '/api/invitados':
            if not self.require_admin():
                return
            conn = get_db()
            c = conn.cursor()
            
            filtro = params.get('filtro', [''])[0].lower()
            q = params.get('q', [''])[0].strip().lower()

            query = "SELECT id, no, categoria, tratamiento, grado, nombre, cargo, activo, observaciones, plantilla_id, plantilla_version, updated_at FROM invitados WHERE 1=1"
            sql_params = []

            # Uso de índice idx_invitados_activo
            if filtro == 'activos':
                query += " AND activo = 1"
            elif filtro == 'inactivos':
                query += " AND activo = 0"

            # Búsqueda usando índices
            if q:
                query += " AND (LOWER(nombre) LIKE ? OR LOWER(grado) LIKE ? OR LOWER(cargo) LIKE ? OR LOWER(categoria) LIKE ? OR CAST(no AS TEXT) = ?)"
                like_q = f"%{q}%"
                sql_params.extend([like_q, like_q, like_q, like_q, q])

            if filtro == 'inactivos':
                query += " ORDER BY updated_at DESC, no DESC"
            else:
                query += " ORDER BY no ASC"

            c.execute(query, sql_params)
            rows = c.fetchall()
            conn.close()

            items = [
                {
                    "id": r["id"],
                    "no": r["no"],
                    "categoria": r["categoria"],
                    "tratamiento": r["tratamiento"],
                    "grado": r["grado"],
                    "nombre": r["nombre"],
                    "cargo": r["cargo"],
                    "activo": bool(r["activo"]),
                    "observaciones": r["observaciones"] or "",
                    "plantilla_id": r["plantilla_id"] or "tucano-sunset",
                    "plantilla_version": r["plantilla_version"] or 1,
                    "updated_at": r["updated_at"] or ""
                }
                for r in rows
            ]
            self.send_json(items)
            return

        # Si no es ruta de API, servir archivos estáticos estándar
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            content_len = int(self.headers.get('Content-Length', 0))
        except (TypeError, ValueError):
            self.send_json({"error": "Content-Length inválido"}, status=400)
            return
        if content_len < 0 or content_len > MAX_BODY_BYTES:
            self.send_json({"error": "La solicitud supera el tamaño permitido"}, status=413)
            return
        post_body = self.rfile.read(content_len) if content_len > 0 else b'{}'
        try:
            payload = json.loads(post_body.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json({"error": "El cuerpo debe contener JSON válido"}, status=400)
            return
        if not isinstance(payload, dict):
            self.send_json({"error": "El cuerpo JSON debe ser un objeto"}, status=400)
            return

        if path == '/api/auth/login':
            try:
                self.do_AUTH_login(payload)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=422)
            return

        if path == '/api/auth/logout':
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get('Cookie', ''))
            except (ValueError, UnicodeError):
                pass
            morsel = cookie.get(SESSION_COOKIE)
            if morsel:
                with SESSIONS_LOCK:
                    SESSIONS.pop(morsel.value, None)
            self.send_json({"ok": True}, headers={"Set-Cookie": self.session_cookie("", 0)})
            return

        if path in PROTECTED_POST_PATHS and not self.require_admin():
            return

        if path == '/api/users':
            try:
                username = clean_text(payload.get('username'), 'username', '', 32, True, 3)
                if not re.fullmatch(r'[A-Za-z0-9._-]{3,32}', username):
                    raise ValueError('El usuario solo puede contener letras, números, punto, guion y guion bajo')
                password = payload.get('password')
                if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH or len(password) > 128:
                    raise ValueError(f'La contraseña debe tener entre {PASSWORD_MIN_LENGTH} y 128 caracteres')
            except ValueError as error:
                self.send_json({"error": str(error)}, status=422)
                return

            conn = get_db()
            try:
                conn.execute(
                    "INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, 'admin', 1)",
                    (username, hash_password(password))
                )
                conn.commit()
            except sqlite3.IntegrityError:
                conn.rollback()
                conn.close()
                self.send_json({"error": "Ese usuario ya existe"}, status=409)
                return
            user_id = conn.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()['id']
            conn.close()
            self.send_json({"ok": True, "id": user_id, "username": username})
            return

        if path == '/api/users/toggle':
            try:
                user_id = bounded_int(payload.get('id'), 'id', 0, 1, 2_147_483_647)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=422)
                return
            current_user = self.current_user()
            if current_user and user_id == current_user['id']:
                self.send_json({"error": "No puede desactivar su propia cuenta"}, status=409)
                return
            conn = get_db()
            row = conn.execute("SELECT active FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                conn.close()
                self.send_json({"error": "Usuario no encontrado"}, status=404)
                return
            if bool(row['active']):
                active_count = conn.execute("SELECT COUNT(*) AS total FROM users WHERE active = 1").fetchone()['total']
                if active_count <= 1:
                    conn.close()
                    self.send_json({"error": "Debe existir al menos un usuario activo"}, status=409)
                    return
            conn.execute("UPDATE users SET active = 1 - active, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
            conn.commit()
            updated = conn.execute("SELECT active FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.close()
            self.send_json({"ok": True, "id": user_id, "active": bool(updated['active'])})
            return

        if path == '/api/auth/password':
            current_user = self.current_user()
            current_password = payload.get('current_password')
            new_password = payload.get('new_password')
            if not isinstance(current_password, str) or not isinstance(new_password, str):
                self.send_json({"error": "Debe indicar la contraseña actual y la nueva"}, status=422)
                return
            if len(new_password) < PASSWORD_MIN_LENGTH or len(new_password) > 128:
                self.send_json({"error": f"La nueva contraseña debe tener entre {PASSWORD_MIN_LENGTH} y 128 caracteres"}, status=422)
                return
            conn = get_db()
            row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (current_user['id'],)).fetchone()
            if not row or not verify_password(current_password, row['password_hash']):
                conn.close()
                self.send_json({"error": "La contraseña actual no es correcta"}, status=401)
                return
            conn.execute("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (hash_password(new_password), current_user['id']))
            conn.commit()
            conn.close()
            self.send_json({"ok": True, "message": "Contraseña actualizada correctamente"})
            return

        # 1. API: Actualizar Configuración Global
        if path == '/api/config':
            conn = get_db()
            c = conn.cursor()
            
            try:
                aniversario = bounded_int(payload.get('aniversario'), 'aniversario', 38, 1, 999)
                aniversario_auto = 1 if parse_bool(payload.get('aniversario_auto'), 'aniversario_auto') else 0
                fecha_evento = clean_text(payload.get('fecha_evento'), 'fecha_evento', '24 de Septiembre de 2026', 120, True, 3)
                hora_evento = clean_text(payload.get('hora_evento'), 'hora_evento', '10:00 am', 80, True, 2)
                vestimenta = clean_text(payload.get('vestimenta'), 'vestimenta', 'Militar Uniforme D (Kepi) / Invitados Especiales Formal', 240, True, 2)
                fecha_fundacion = clean_text(payload.get('fecha_fundacion'), 'fecha_fundacion', '1988-09-01', 10, True, 10)
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', fecha_fundacion):
                    raise ValueError('fecha_fundacion debe usar el formato AAAA-MM-DD')
                nombre_evento = clean_text(payload.get('nombre_evento'), 'nombre_evento', 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”', 180, True, 4)
            except ValueError as error:
                conn.close()
                self.send_json({"error": str(error)}, status=422)
                return

            # Lógica de actualización de plantilla predeterminada:
            # Si se modifica la plantilla, se incrementa la versión para que sólo aplique a NUEVAS tarjetas generadas
            c.execute("SELECT plantilla_predeterminada, plantilla_version FROM config_global WHERE id = 1")
            prev_row = c.fetchone()
            prev_template = prev_row["plantilla_predeterminada"] if prev_row and prev_row["plantilla_predeterminada"] else "tucano-sunset"
            current_ver = prev_row["plantilla_version"] if prev_row and prev_row["plantilla_version"] else 1

            new_template = str(payload.get('plantilla_predeterminada', prev_template)).strip() or prev_template
            if new_template not in ALLOWED_TEMPLATES:
                conn.close()
                self.send_json({"error": "Plantilla no permitida"}, status=422)
                return
            if new_template != prev_template:
                new_ver = current_ver + 1
            else:
                new_ver = current_ver

            c.execute("""
            INSERT INTO config_global (id, fecha_fundacion, aniversario, aniversario_auto, fecha_evento, hora_evento, vestimenta, plantilla_predeterminada, plantilla_version, nombre_evento)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                fecha_fundacion=excluded.fecha_fundacion,
                aniversario=excluded.aniversario,
                aniversario_auto=excluded.aniversario_auto,
                fecha_evento=excluded.fecha_evento,
                hora_evento=excluded.hora_evento,
                vestimenta=excluded.vestimenta,
                plantilla_predeterminada=excluded.plantilla_predeterminada,
                plantilla_version=excluded.plantilla_version,
                nombre_evento=excluded.nombre_evento,
                updated_at=CURRENT_TIMESTAMP;
            """, (fecha_fundacion, aniversario, aniversario_auto, fecha_evento, hora_evento, vestimenta, new_template, new_ver, nombre_evento))
            
            conn.commit()
            conn.close()
            sync_json_files()
            
            self.send_json({
                "ok": True, 
                "message": "Ajustes globales, nombre del evento y plantilla predeterminada guardados con éxito en SQLite",
                "plantilla_predeterminada": new_template,
                "plantilla_version": new_ver,
                "nombre_evento": nombre_evento
            })
            return

        # 2. API: Toggle Activo / Inactivo
        if path == '/api/invitados/toggle':
            guest_id = str(payload.get('id', '')).strip()
            if not guest_id:
                self.send_json({"error": "ID requerido"}, status=400)
                return

            conn = get_db()
            c = conn.cursor()
            c.execute("UPDATE invitados SET activo = 1 - activo, updated_at=CURRENT_TIMESTAMP WHERE id = ?", (guest_id,))
            conn.commit()
            
            c.execute("SELECT activo, updated_at FROM invitados WHERE id = ?", (guest_id,))
            row = c.fetchone()
            conn.close()
            sync_json_files()

            if row:
                self.send_json({"ok": True, "id": guest_id, "activo": bool(row["activo"]), "updated_at": row["updated_at"] or ""})
            else:
                self.send_json({"error": "Invitado no encontrado"}, status=404)
            return

        # 3. API: Guardar / Actualizar Invitado
        if path == '/api/invitados':
            conn = get_db()
            c = conn.cursor()

            try:
                guest_id = clean_text(payload.get('id'), 'id', '', 120)
                no = bounded_int(payload.get('no'), 'no', 0, 0, 100000)
                categoria = clean_text(payload.get('categoria'), 'categoria', 'Invitado Especial', 120, True, 3)
                tratamiento = clean_text(payload.get('tratamiento'), 'tratamiento', 'Al:', 120)
                grado = clean_text(payload.get('grado'), 'grado', '', 120)
                nombre = clean_text(payload.get('nombre'), 'nombre', '', 160, True, 3)
                cargo = clean_text(payload.get('cargo'), 'cargo', '', 240)
                activo = 1 if parse_bool(payload.get('activo'), 'activo', True) else 0
                observaciones = clean_text(payload.get('observaciones'), 'observaciones', '', 500)
            except ValueError as error:
                conn.close()
                self.send_json({"error": str(error)}, status=422)
                return

            # Obtener plantilla global actual
            c.execute("SELECT plantilla_predeterminada, plantilla_version FROM config_global WHERE id = 1")
            cfg_row = c.fetchone()
            global_tmpl = cfg_row["plantilla_predeterminada"] if cfg_row and cfg_row["plantilla_predeterminada"] else "tucano-sunset"
            global_ver = cfg_row["plantilla_version"] if cfg_row and cfg_row["plantilla_version"] else 1

            plantilla_id = str(payload.get('plantilla_id', '')).strip() or global_tmpl
            if plantilla_id not in ALLOWED_TEMPLATES:
                conn.close()
                self.send_json({"error": "Plantilla no permitida"}, status=422)
                return
            try:
                plantilla_version = bounded_int(payload.get('plantilla_version'), 'plantilla_version', global_ver, 1, 10000)
            except ValueError as error:
                conn.close()
                self.send_json({"error": str(error)}, status=422)
                return

            if not guest_id:
                c.execute("SELECT COALESCE(MAX(no), 0) + 1 FROM invitados")
                no = c.fetchone()[0]
                guest_id = f"invitado-{no}"

            c.execute("""
            INSERT INTO invitados (id, no, categoria, tratamiento, grado, nombre, cargo, activo, observaciones, plantilla_id, plantilla_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                no=excluded.no,
                categoria=excluded.categoria,
                tratamiento=excluded.tratamiento,
                grado=excluded.grado,
                nombre=excluded.nombre,
                cargo=excluded.cargo,
                activo=excluded.activo,
                observaciones=excluded.observaciones,
                plantilla_id=COALESCE(excluded.plantilla_id, invitados.plantilla_id),
                plantilla_version=COALESCE(excluded.plantilla_version, invitados.plantilla_version),
                updated_at=CURRENT_TIMESTAMP;
            """, (guest_id, no, categoria, tratamiento, grado, nombre, cargo, activo, observaciones, plantilla_id, plantilla_version))

            conn.commit()
            conn.close()
            sync_json_files()

            self.send_json({"ok": True, "id": guest_id, "no": no})
            return

        # 4. API: Eliminar Invitado
        if path == '/api/invitados/delete':
            guest_id = str(payload.get('id', '')).strip()
            if not guest_id:
                self.send_json({"error": "ID requerido"}, status=400)
                return

            conn = get_db()
            c = conn.cursor()
            c.execute("DELETE FROM invitados WHERE id = ?", (guest_id,))
            rows_affected = c.rowcount
            conn.commit()
            conn.close()
            sync_json_files()

            if rows_affected > 0:
                self.send_json({"ok": True, "id": guest_id, "message": "Invitado eliminado exitosamente"})
            else:
                self.send_json({"error": "Invitado no encontrado"}, status=404)
            return

        # 5. API: Carga / Importación masiva desde JSON
        if path == '/api/invitados/import':
            items = payload.get('invitados', [])
            if not isinstance(items, list):
                self.send_json({"error": "Lista de invitados requerida"}, status=400)
                return
            if len(items) > 500:
                self.send_json({"error": "La importación no puede superar 500 registros por solicitud"}, status=413)
                return

            conn = get_db()
            c = conn.cursor()

            # Obtener plantilla global actual
            c.execute("SELECT plantilla_predeterminada, plantilla_version FROM config_global WHERE id = 1")
            cfg_row = c.fetchone()
            global_tmpl = cfg_row["plantilla_predeterminada"] if cfg_row and cfg_row["plantilla_predeterminada"] else "tucano-sunset"
            global_ver = cfg_row["plantilla_version"] if cfg_row and cfg_row["plantilla_version"] else 1

            for idx, item in enumerate(items):
                if not isinstance(item, dict):
                    conn.rollback()
                    conn.close()
                    self.send_json({"error": f"El registro {idx + 1} no es un objeto válido"}, status=422)
                    return
                try:
                    no = bounded_int(item.get('no'), 'no', idx + 1, 1, 100000)
                    g_id = clean_text(item.get('id'), 'id', f"invitado-{no}", 120, True, 1)
                    categoria = clean_text(item.get('categoria'), 'categoria', 'Protocolo', 120, True, 3)
                    tratamiento = clean_text(item.get('tratamiento'), 'tratamiento', 'Al:', 120)
                    grado = clean_text(item.get('grado'), 'grado', '', 120)
                    nombre = clean_text(item.get('nombre'), 'nombre', '', 160, True, 3)
                    cargo = clean_text(item.get('cargo'), 'cargo', '', 240)
                    activo = 1 if parse_bool(item.get('activo'), 'activo', False) else 0
                    obs = clean_text(item.get('observaciones'), 'observaciones', '', 500)
                    p_id = str(item.get('plantilla_id', '')).strip() or global_tmpl
                    if p_id not in ALLOWED_TEMPLATES:
                        raise ValueError('Plantilla no permitida')
                    p_ver = bounded_int(item.get('plantilla_version'), 'plantilla_version', global_ver, 1, 10000)
                except ValueError as error:
                    conn.rollback()
                    conn.close()
                    self.send_json({"error": f"Registro {idx + 1}: {error}"}, status=422)
                    return

                c.execute("""
                INSERT INTO invitados (id, no, categoria, tratamiento, grado, nombre, cargo, activo, observaciones, plantilla_id, plantilla_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    no=excluded.no,
                    categoria=excluded.categoria,
                    tratamiento=excluded.tratamiento,
                    grado=excluded.grado,
                    nombre=excluded.nombre,
                    cargo=excluded.cargo,
                    activo=excluded.activo,
                    observaciones=excluded.observaciones,
                    plantilla_id=COALESCE(excluded.plantilla_id, invitados.plantilla_id),
                    plantilla_version=COALESCE(excluded.plantilla_version, invitados.plantilla_version),
                    updated_at=CURRENT_TIMESTAMP;
                """, (g_id, no, categoria, tratamiento, grado, nombre, cargo, activo, obs, p_id, p_ver))

            conn.commit()
            conn.close()
            sync_json_files()

            self.send_json({"ok": True, "count": len(items)})
            return

        self.send_json({"error": "Ruta no encontrada"}, status=404)

def run():
    ensure_auth_schema()
    print(f"Iniciando Servidor de Protocolo con SQLite en http://{HOST}:{PORT}")
    server = ThreadingHTTPServer((HOST, PORT), ProtocoloRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()

if __name__ == '__main__':
    run()
