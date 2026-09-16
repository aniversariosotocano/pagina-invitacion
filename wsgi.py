"""WSGI adapter for PythonAnywhere.

The project uses ``http.server`` locally.  PythonAnywhere serves WSGI apps,
so this module translates each WSGI request into the HTTP request expected by
``ProtocoloRequestHandler`` and translates its response back to WSGI.
"""

import io
import os

from server import ProtocoloRequestHandler, ensure_public_token_schema


ensure_public_token_schema()


class _NonClosingBytesIO(io.BytesIO):
    """Keep the captured stream readable after BaseHTTPRequestHandler.finish."""

    def close(self):
        self.flush()


class _WSGIConnection:
    def __init__(self, request_bytes):
        self._rfile = _NonClosingBytesIO(request_bytes)
        self._wfile = _NonClosingBytesIO()

    def makefile(self, mode, *args, **kwargs):
        return self._rfile if "r" in mode else self._wfile

    def getpeername(self):
        return ("127.0.0.1", 0)

    def setsockopt(self, *args, **kwargs):
        return None

    def shutdown(self, *args, **kwargs):
        return None

    def sendall(self, data):
        self._wfile.write(data)

    def close(self):
        return None


class _DummyServer:
    timeout = None


def _request_bytes(environ):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO") or "/"
    query = environ.get("QUERY_STRING", "")
    target = f"{path}?{query}" if query else path

    headers = {
        "Host": environ.get("HTTP_HOST", "localhost"),
        "Connection": "close",
    }
    for key, value in environ.items():
        if key.startswith("HTTP_") and key not in {"HTTP_HOST", "HTTP_CONNECTION"}:
            header_name = key[5:].replace("_", "-").title()
            headers[header_name] = value

    content_length = environ.get("CONTENT_LENGTH", "")
    if content_length:
        headers["Content-Length"] = content_length
    if environ.get("CONTENT_TYPE"):
        headers["Content-Type"] = environ["CONTENT_TYPE"]

    body = b""
    if content_length:
        body = environ["wsgi.input"].read(int(content_length))

    header_bytes = "".join(f"{name}: {value}\r\n" for name, value in headers.items())
    return f"{method} {target} HTTP/1.1\r\n{header_bytes}\r\n".encode("latin-1") + body


def application(environ, start_response):
    connection = _WSGIConnection(_request_bytes(environ))
    ProtocoloRequestHandler(
        connection,
        connection.getpeername(),
        _DummyServer(),
    )

    response = connection._wfile.getvalue()
    separator = response.find(b"\r\n\r\n")
    if separator < 0:
        start_response("500 Internal Server Error", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Invalid response from application"]

    header_lines = response[:separator].split(b"\r\n")
    status_line = header_lines[0].decode("latin-1")
    status = status_line.split(" ", 1)[1] if " " in status_line else "500 Internal Server Error"
    headers = []
    for line in header_lines[1:]:
        if b":" in line:
            name, value = line.split(b":", 1)
            headers.append((name.decode("latin-1"), value.lstrip().decode("latin-1")))

    start_response(status, headers)
    return [response[separator + 4:]]


application.__file__ = os.path.abspath(__file__)
