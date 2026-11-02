"""
Núcleo de transporte — compartido por el cliente síncrono y el asíncrono.

POR QUÉ ESTA CAPA EXISTE

El SDK ofrece KitsudenClient (sync) y AsyncKitsudenClient (async). Duplicar la
construcción de peticiones y el manejo de errores en ambos es cómo los SDKs
divergen en silencio: un fix llega a una mitad y no a la otra. Aquí vive todo
lo que NO depende del modelo de ejecución — construir la petición, interpretar
la respuesta — como funciones puras. Los clientes solo aportan el I/O.

Es el gemelo de `HttpClient` en packages/sdk/src/index.ts: mismos paths,
mismas cabeceras, mismo envelope de error. Si cambias uno, cambia el otro.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping, Optional
from urllib.parse import urlencode

import httpx

from ._toon import decode_toon

TOON_MIME = "application/vnd.toon"
# `auto`: la API manda JSON compacto o TOON, el más corto que vuelva a dar los
# mismos datos (TRON no: este SDK no lo decodifica).
AUTO_ACCEPT = 'application/vnd.kitsuden.auto; formats="json,toon"'


class KitsudenError(Exception):
    """Error devuelto por la API de Kitsuden.

    Conserva el ``status`` HTTP y el payload crudo para que el llamador pueda
    distinguir un 404 (no existe) de un 403 (no puedes) sin parsear mensajes.
    """

    def __init__(self, message: str, status: int, payload: Optional[Any] = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


@dataclass(frozen=True)
class Request:
    """Petición ya construida, lista para el I/O del cliente."""

    method: str
    url: str
    headers: dict
    body: Optional[bytes]


def build_request(
    base_url: str,
    api_key: Optional[str],
    fmt: str,
    method: str,
    path: str,
    body: Optional[Any] = None,
    params: Optional[Mapping[str, Any]] = None,
    override_format: Optional[str] = None,
) -> Request:
    """Construye la petición con las mismas reglas que el SDK TS.

    - Los WRITES van siempre en JSON (TOON es formato de respuesta, no de
      envío).
    - TOON se pide con ``?format=toon`` + cabecera Accept, igual que el TS.
    - ``auto`` se pide solo con la cabecera Accept: la API elige por respuesta.
    """
    active_format = override_format or fmt
    if method != "GET":
        # Igual que en TS: las escrituras siempre negocian JSON.
        active_format = "json"

    query: dict = {}
    if params:
        # None significa "no enviar el parámetro", no "enviar null".
        query.update({k: v for k, v in params.items() if v is not None})
    if active_format == "toon":
        query["format"] = "toon"

    url = f"{base_url.rstrip('/')}/api{path}"
    if query:
        url += ("&" if "?" in url else "?") + urlencode(query)

    headers = {"Content-Type": "application/json"}
    if active_format == "toon":
        headers["Accept"] = TOON_MIME
    elif active_format == "auto":
        headers["Accept"] = AUTO_ACCEPT
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    raw = json.dumps(body).encode("utf-8") if body is not None else None
    return Request(method=method, url=url, headers=headers, body=raw)


def interpret_response(response: httpx.Response) -> Any:
    """Convierte la respuesta HTTP en datos o en KitsudenError.

    Mismo contrato que el SDK TS: en error se intenta leer el envelope
    ``{error}`` / ``{message}``; en 204 se devuelve None; TOON se parsea si el
    Content-Type lo declara.
    """
    if response.status_code >= 400:
        message = f"Request failed: {response.status_code}"
        payload = None
        try:
            payload = response.json()
            if isinstance(payload, dict):
                err = payload.get("error") or payload.get("message")
                if isinstance(err, dict):
                    err = err.get("message") or json.dumps(err)
                if err:
                    message = str(err)
        except Exception:
            # Cuerpo no-JSON (proxy, HTML de error): el status es el dato.
            pass
        raise KitsudenError(message, response.status_code, payload)

    if response.status_code == 204 or not response.content:
        return None

    content_type = response.headers.get("content-type", "")
    if TOON_MIME in content_type:
        return decode_toon(response.text)

    return response.json()


# ── TOON ─────────────────────────────────────────────────────────────────────
# El decoder vive en _toon.py (puerto del de la API). `parse_toon` se mantiene
# como nombre público: antes era un parser de un formato `clave:valor` + `---`
# que la API ya no escribe y que devolvía datos vacíos o mal formados.


def parse_toon(text: str):
    """Decodifica TOON (alias de :func:`kitsuden._toon.decode_toon`)."""
    return decode_toon(text)
