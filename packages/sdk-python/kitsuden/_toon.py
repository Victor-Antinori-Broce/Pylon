"""
Decoder de TOON (https://toonformat.dev) — puerto del de la API.

Es el decoder de ``apps/api/src/lib/toon-tabular.ts`` traducido línea a línea:
lee todo lo que escribe la API (y la implementación de referencia
``@toon-format/toon@4.4.0``): tablas con columnas plegadas en la cabecera
(``docs[2]{id,_meta{ds,at}}:``), tablas con clave (``porId[2:]{x,y}:``), forma
de lista a cualquier profundidad, arrays en línea, objeto vacío (``clave:`` sin
nada) y los delimitadores ``,`` ``\\t`` ``|``.

``tests/fixtures/toon-casos.json`` son pares TOON → JSON escritos por el encoder
de la API; el test de este paquete los decodifica todos, y un test de la API
comprueba que siguen siendo lo que su encoder escribe hoy.

Ante TOON mal formado lanza ``ToonDecodeError``: nunca devuelve datos a medias.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional, Tuple

INDENTACION = 2
DELIMITADOR = ","
DELIMITADORES = (",", "\t", "|")
LITERAL_NUMERICO = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$", re.IGNORECASE)
LONGITUD_DE_ARRAY = re.compile(r"^(?:0|[1-9]\d*)$")


class ToonDecodeError(ValueError):
    """TOON mal formado. ``line`` es la línea (desde 1), si se sabe."""

    def __init__(self, mensaje: str, line: Optional[int] = None):
        super().__init__(f"Line {line}: {mensaje}" if line is not None else mensaje)
        self.line = line


class _Linea:
    __slots__ = ("nivel", "texto", "num")

    def __init__(self, nivel: int, texto: str, num: int):
        self.nivel = nivel
        self.texto = texto
        self.num = num


def _escanear(texto: str) -> List[_Linea]:
    out: List[_Linea] = []
    for n, raw in enumerate(texto.split("\n")):
        if n == 0 and raw.startswith("\uFEFF"):
            raw = raw[1:]
        if raw.endswith("\r"):
            raw = raw[:-1]
        sangria = re.match(r"^[ \t]*", raw).group(0)
        con_tab = "\t" in sangria
        contenido = raw[len(sangria):].rstrip(" ")
        if not contenido:
            continue
        if not con_tab and contenido[0] == "#":
            continue
        if con_tab:
            raise ToonDecodeError("Tabs are not allowed in indentation", n + 1)
        out.append(_Linea(len(sangria) // INDENTACION, contenido, n + 1))
    return out


def _recortar(s: str) -> str:
    return s.strip(" ")


def _desescapar(s: str) -> str:
    if "\\" not in s:
        return s
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        sig = s[i + 1] if i + 1 < len(s) else ""
        i += 2
        if sig == "n":
            out.append("\n")
        elif sig == "t":
            out.append("\t")
        elif sig == "r":
            out.append("\r")
        elif sig == "\\":
            out.append("\\")
        elif sig == '"':
            out.append('"')
        elif sig == "u":
            hexa = s[i : i + 4]
            if not re.fullmatch(r"[0-9a-fA-F]{4}", hexa):
                raise ValueError(f"Invalid escape sequence: \\u{hexa}")
            out.append(chr(int(hexa, 16)))
            i += 4
        else:
            raise ValueError(f"Invalid escape sequence: \\{sig}")
    return "".join(out)


def _cierre_de_comillas(s: str, desde: int) -> int:
    i = desde + 1
    while i < len(s):
        if s[i] == "\\":
            i += 2
            continue
        if s[i] == '"':
            return i
        i += 1
    return -1


def _fuera_de_comillas(s: str, ch: str, desde: int = 0) -> int:
    dentro = False
    i = desde
    while i < len(s):
        c = s[i]
        if dentro and c == "\\":
            i += 2
            continue
        if c == '"':
            dentro = not dentro
        elif not dentro and c == ch:
            return i
        i += 1
    return -1


def _texto_literal(token: str) -> str:
    t = _recortar(token)
    if not t.startswith('"'):
        return t
    fin = _cierre_de_comillas(t, 0)
    if fin == -1:
        raise ValueError("Unterminated string: missing closing quote")
    if fin != len(t) - 1:
        raise ValueError("Unexpected characters after closing quote")
    return _desescapar(t[1:fin])


def _primitivo(token: str) -> Any:
    t = _recortar(token)
    if not t:
        return ""
    if t.startswith('"'):
        return _texto_literal(t)
    if t == "true":
        return True
    if t == "false":
        return False
    if t == "null":
        return None
    if LITERAL_NUMERICO.match(t):
        n = float(t)
        if n == n and n not in (float("inf"), float("-inf")):
            # Igual que JSON: un entero sin decimales ni exponente es int
            if re.fullmatch(r"-?\d+", t):
                return int(t)
            return 0.0 if n == 0 else n
    return t


def _separar(entrada: str, delim: str) -> List[str]:
    valores: List[str] = []
    actual: List[str] = []
    dentro = False
    i = 0
    while i < len(entrada):
        c = entrada[i]
        if dentro and c == "\\" and i + 1 < len(entrada):
            actual.append(c + entrada[i + 1])
            i += 2
            continue
        if c == '"':
            dentro = not dentro
            actual.append(c)
        elif not dentro and c == delim:
            valores.append(_recortar("".join(actual)))
            actual = []
        else:
            actual.append(c)
        i += 1
    if actual or valores:
        valores.append(_recortar("".join(actual)))
    return valores


def _llave_que_cierra(s: str, desde: int) -> int:
    dentro = False
    prof = 0
    i = desde
    while i < len(s):
        c = s[i]
        if dentro and c == "\\":
            i += 2
            continue
        if c == '"':
            dentro = not dentro
        elif not dentro and c == "{":
            prof += 1
        elif not dentro and c == "}":
            prof -= 1
            if prof == 0:
                return i
        i += 1
    return -1


class _Campo:
    __slots__ = ("nombre", "hijos")

    def __init__(self, nombre: str, hijos: Optional[List["_Campo"]] = None):
        self.nombre = nombre
        self.hijos = hijos


def _leer_campos(segmento: str, delim: str) -> List[_Campo]:
    partes: List[str] = []
    actual: List[str] = []
    dentro = False
    prof = 0
    i = 0
    while i < len(segmento):
        c = segmento[i]
        if dentro and c == "\\" and i + 1 < len(segmento):
            actual.append(c + segmento[i + 1])
            i += 2
            continue
        if c == '"':
            dentro = not dentro
        elif not dentro and c == "{":
            prof += 1
        elif not dentro and c == "}":
            prof -= 1
        elif not dentro and prof == 0 and c == delim:
            partes.append("".join(actual))
            actual = []
            i += 1
            continue
        actual.append(c)
        i += 1
    partes.append("".join(actual))
    campos: List[_Campo] = []
    for p in partes:
        t = _recortar(p)
        if not t:
            raise ValueError("Empty field name in field list")
        abre = _fuera_de_comillas(t, "{")
        if abre == -1:
            campos.append(_Campo(_texto_literal(t)))
            continue
        cierra = _llave_que_cierra(t, abre)
        if cierra != len(t) - 1:
            raise ValueError("Unexpected content after nested field group")
        campos.append(_Campo(_texto_literal(t[:abre]), _leer_campos(t[abre + 1 : cierra], delim)))
    return campos


def _contar_hojas(cs: List[_Campo]) -> int:
    return sum(_contar_hojas(c.hijos) if c.hijos else 1 for c in cs)


class _Cabecera:
    __slots__ = ("clave", "longitud", "delim", "campos", "con_clave", "en_linea")

    def __init__(self, clave, longitud, delim, campos, con_clave, en_linea):
        self.clave = clave
        self.longitud = longitud
        self.delim = delim
        self.campos = campos
        self.con_clave = con_clave
        self.en_linea = en_linea


def _leer_cabecera(texto: str) -> Optional[_Cabecera]:
    if texto.startswith('"'):
        fin = _cierre_de_comillas(texto, 0)
        if fin == -1 or texto[fin + 1 : fin + 2] != "[":
            return None
        abre = fin + 1
    else:
        abre = _fuera_de_comillas(texto, "[")
    if abre == -1:
        return None
    dos_puntos = _fuera_de_comillas(texto, ":")
    if dos_puntos == -1 or dos_puntos < abre:
        return None
    cierra = _fuera_de_comillas(texto, "]", abre)
    if cierra == -1:
        raise ValueError("Unterminated bracket segment")

    fin_llaves = cierra + 1
    llave = _fuera_de_comillas(texto, "{", cierra)
    if llave != -1 and llave < _fuera_de_comillas(texto, ":", cierra):
        if llave != cierra + 1:
            raise ValueError("Unexpected content between bracket segment and field list")
        fin = _llave_que_cierra(texto, llave)
        if fin != -1:
            fin_llaves = fin + 1
    colon = _fuera_de_comillas(texto, ":", max(cierra, fin_llaves))
    if colon == -1:
        raise ValueError("Missing colon after array header")
    if colon != max(cierra + 1, fin_llaves):
        raise ValueError("Unexpected content between bracket segment and colon")

    clave = None
    if abre > 0:
        cruda = texto[:abre]
        if cruda.endswith((" ", "\t")):
            raise ValueError("Unexpected whitespace between key and bracket segment")
        clave = _texto_literal(cruda) if cruda.startswith('"') else cruda

    seg = texto[abre + 1 : cierra]
    delim = DELIMITADOR
    if seg.endswith("\t"):
        delim, seg = "\t", seg[:-1]
    elif seg.endswith("|"):
        delim, seg = "|", seg[:-1]
    con_clave = False
    if seg.endswith(":"):
        con_clave, seg = True, seg[:-1]
    if not LONGITUD_DE_ARRAY.match(seg):
        raise ValueError(f'Invalid array length: "{seg}"')

    campos = None
    if llave != -1 and llave < colon:
        fin = _llave_que_cierra(texto, llave)
        if fin != -1 and fin < colon:
            contenido = texto[llave + 1 : fin]
            for otro in DELIMITADORES:
                if otro != delim and _fuera_de_comillas(contenido, otro) != -1:
                    raise ValueError("Header delimiter mismatch")
            campos = _leer_campos(contenido, delim)
    despues = _recortar(texto[colon + 1 :])
    if con_clave and not campos:
        raise ValueError("Keyed header requires a field list")
    if campos and despues:
        raise ValueError("Unexpected content after fields-bearing header colon")
    return _Cabecera(clave, int(seg), delim, campos, con_clave, despues or None)


def _leer_clave(texto: str) -> Tuple[str, int]:
    if texto.startswith('"'):
        cierra = _cierre_de_comillas(texto, 0)
        if cierra == -1:
            raise ValueError("Unterminated quoted key")
        p = cierra + 1
        while p < len(texto) and texto[p] == " ":
            p += 1
        if p >= len(texto) or texto[p] != ":":
            raise ValueError("Missing colon after key")
        return _desescapar(texto[1:cierra]), p + 1
    colon = _fuera_de_comillas(texto, ":")
    if colon == -1:
        raise ValueError("Missing colon after key")
    return _recortar(texto[:colon]), colon + 1


def _es_cabecera_sin_clave(t: str) -> bool:
    return _recortar(t).startswith("[") and _fuera_de_comillas(t, ":") != -1


def _es_par(t: str) -> bool:
    return _fuera_de_comillas(t, ":") != -1


def _es_fila(texto: str, delim: str) -> bool:
    colon = _fuera_de_comillas(texto, ":")
    if colon == -1:
        return True
    d = _fuera_de_comillas(texto, delim)
    return d != -1 and d < colon


def _objeto_de_campos(cs: List[_Campo], valores: List[Any]) -> dict:
    it = iter(valores)

    def construir(nodos: List[_Campo]) -> dict:
        o: dict = {}
        for n in nodos:
            o[n.nombre] = construir(n.hijos) if n.hijos else next(it)
        return o

    return construir(cs)


class _Decodificador:
    def __init__(self, lineas: List[_Linea]):
        self.lineas = lineas
        self.i = 0

    def mirar(self) -> Optional[_Linea]:
        return self.lineas[self.i] if self.i < len(self.lineas) else None

    def leer(self) -> Optional[_Linea]:
        l = self.mirar()
        self.i += 1
        return l

    @staticmethod
    def con_linea(l: _Linea, fn):
        try:
            return fn()
        except ToonDecodeError:
            raise
        except (ValueError, StopIteration) as e:
            raise ToonDecodeError(str(e), l.num) from e

    def documento(self) -> Any:
        primera = self.mirar()
        if primera is None:
            return {}
        if primera.nivel != 0:
            raise ToonDecodeError("Over-indented line", primera.num)
        if primera.texto == "[]":
            self.leer()
            self.consumido()
            return []
        if _es_cabecera_sin_clave(primera.texto):
            h = self.con_linea(primera, lambda: _leer_cabecera(primera.texto))
            if h:
                self.leer()
                v = self.desde_cabecera(h, 0, primera)
                self.consumido()
                return v
        self.leer()
        if self.mirar() is None and not _es_par(primera.texto):
            return self.con_linea(primera, lambda: _primitivo(primera.texto))
        if not _es_par(primera.texto):
            raise ToonDecodeError("Top-level document must start with a key-value or array-header line", primera.num)
        o: dict = {}
        self.par(primera, 0, o)
        while (l := self.mirar()) is not None:
            if l.nivel != 0:
                raise ToonDecodeError("Over-indented line", l.num)
            self.leer()
            self.par(l, 0, o)
        return o

    def consumido(self) -> None:
        l = self.mirar()
        if l is not None:
            raise ToonDecodeError("Unexpected content after the document root", l.num)

    def par(self, l: _Linea, base: int, o: dict) -> None:
        h = self.con_linea(l, lambda: _leer_cabecera(l.texto))
        if h:
            if h.clave is None:
                raise ToonDecodeError("Keyless array header is only valid at the root or as a list item", l.num)
            if h.clave in o:
                raise ToonDecodeError(f'Duplicate sibling key "{h.clave}"', l.num)
            o[h.clave] = self.desde_cabecera(h, base, l)
            return
        clave, fin = self.con_linea(l, lambda: _leer_clave(l.texto))
        if clave in o:
            raise ToonDecodeError(f'Duplicate sibling key "{clave}"', l.num)
        resto = _recortar(l.texto[fin:])
        if not resto:
            sig = self.mirar()
            o[clave] = self.campos(base + 1) if sig is not None and sig.nivel > base else {}
            return
        o[clave] = [] if resto == "[]" else self.con_linea(l, lambda: _primitivo(resto))

    def campos(self, base: int) -> dict:
        o: dict = {}
        nivel = None
        while (l := self.mirar()) is not None and l.nivel >= base:
            if nivel is None:
                nivel = l.nivel
            if l.nivel != nivel:
                raise ToonDecodeError(f"Over-indented line: expected depth {nivel}", l.num)
            self.leer()
            self.par(l, nivel, o)
        return o

    def nivel_del_contenido(self, base: int) -> int:
        l = self.mirar()
        return base + 1 if l is None or l.nivel <= base + 1 else l.nivel

    def desde_cabecera(self, h: _Cabecera, base: int, l: _Linea) -> Any:
        if h.con_clave:
            return self.tabla_con_clave(h, base, l)
        if h.en_linea is not None:
            valores = self.con_linea(l, lambda: [_primitivo(v) for v in _separar(h.en_linea, h.delim)])
            if len(valores) != h.longitud:
                raise ToonDecodeError(f"Expected {h.longitud} inline values, got {len(valores)}", l.num)
            return valores
        if h.campos:
            return self.tabla(h, base, l)
        return self.lista(h, base, l)

    def tabla(self, h: _Cabecera, base: int, cab: _Linea) -> list:
        nivel = self.nivel_del_contenido(base)
        hojas = _contar_hojas(h.campos)
        filas: list = []
        while len(filas) < h.longitud:
            l = self.mirar()
            if l is None or l.nivel <= base:
                break
            if l.nivel != nivel:
                raise ToonDecodeError(f"Over-indented line: expected depth {nivel}", l.num)
            if not _es_fila(l.texto, h.delim):
                break
            self.leer()
            valores = self.con_linea(l, lambda: [_primitivo(v) for v in _separar(l.texto, h.delim)])
            if len(valores) != hojas:
                raise ToonDecodeError(f"Expected {hojas} row values, got {len(valores)}", l.num)
            filas.append(_objeto_de_campos(h.campos, valores))
        if len(filas) != h.longitud:
            raise ToonDecodeError(f"Expected {h.longitud} tabular rows, got {len(filas)}", cab.num)
        return filas

    def tabla_con_clave(self, h: _Cabecera, base: int, cab: _Linea) -> dict:
        nivel = self.nivel_del_contenido(base)
        hojas = _contar_hojas(h.campos)
        o: dict = {}
        while (l := self.mirar()) is not None and l.nivel > base:
            if l.nivel != nivel:
                raise ToonDecodeError(f"Over-indented line: expected depth {nivel}", l.num)
            self.leer()
            clave, fin = self.con_linea(l, lambda: _leer_clave(l.texto))
            if clave in o:
                raise ToonDecodeError(f'Duplicate key "{clave}"', l.num)
            celdas = _recortar(l.texto[fin:])
            valores = [] if celdas == "" else self.con_linea(l, lambda: [_primitivo(v) for v in _separar(celdas, h.delim)])
            if len(valores) != hojas:
                raise ToonDecodeError(f"Expected {hojas} entry cells, got {len(valores)}", l.num)
            o[clave] = _objeto_de_campos(h.campos, valores)
        if len(o) != h.longitud:
            raise ToonDecodeError(f"Expected {h.longitud} keyed entries, got {len(o)}", cab.num)
        return o

    def lista(self, h: _Cabecera, base: int, cab: _Linea) -> list:
        nivel = self.nivel_del_contenido(base)
        items: list = []
        while len(items) < h.longitud:
            l = self.mirar()
            if l is None or l.nivel <= base:
                break
            if l.nivel != nivel:
                raise ToonDecodeError(f"Over-indented line: expected depth {nivel}", l.num)
            if not (l.texto.startswith("- ") or l.texto == "-"):
                break
            items.append(self.item(nivel))
        if len(items) != h.longitud:
            raise ToonDecodeError(f"Expected {h.longitud} list items, got {len(items)}", cab.num)
        sig = self.mirar()
        if sig is not None and sig.nivel == nivel and (sig.texto.startswith("- ") or sig.texto == "-"):
            raise ToonDecodeError(f"Expected {h.longitud} list items, but found more", sig.num)
        return items

    def item(self, base: int) -> Any:
        l = self.leer()
        if l.texto == "-":
            return {}
        tras = l.texto[2:].lstrip(" ")
        if not _recortar(tras):
            return {}
        if _recortar(tras) == "[]":
            return []
        li = _Linea(l.nivel, tras, l.num)
        if _es_cabecera_sin_clave(tras):
            h = self.con_linea(li, lambda: _leer_cabecera(tras))
            if h:
                if h.con_clave or h.campos:
                    raise ToonDecodeError("Keyless header with a field list is only valid at the root", li.num)
                return self.desde_cabecera(h, base, li)
        h = self.con_linea(li, lambda: _leer_cabecera(tras))
        if h and h.clave is not None and h.campos is not None:
            o: dict = {h.clave: self.desde_cabecera(h, base + 1, li)}
            self.hermanos(base + 1, o)
            return o
        if _es_par(tras):
            o = {}
            self.par(li, base + 1, o)
            self.hermanos(base + 1, o)
            return o
        return self.con_linea(li, lambda: _primitivo(tras))

    def hermanos(self, nivel: int, o: dict) -> None:
        while (l := self.mirar()) is not None and l.nivel >= nivel:
            if l.nivel != nivel:
                raise ToonDecodeError(f"Over-indented line: expected depth {nivel}", l.num)
            self.leer()
            self.par(l, nivel, o)


def decode_toon(text: str) -> Any:
    """Decodifica TOON a dict/list/escalares de Python. El documento vacío es ``{}``."""
    return _Decodificador(_escanear(text)).documento()
