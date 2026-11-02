"""
TRON decoder (Token Reduced Object Notation, https://tron-format.github.io/).

The twin of ``packages/sdk/src/api/tron.ts``: decode only (the API encodes, and
sends TRON only after checking that it decodes back to the same data). An
independent implementation, so the SDK keeps ``httpx`` as its only dependency.
Parity with the reference parser is tested on the fixtures shared with the
TypeScript SDK (``packages/sdk/tests/fixtures/tron-cases.json``, copied to
``tests/fixtures/tron-cases.json``).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

__all__ = ["decode_tron", "TronDecodeError"]


class TronDecodeError(ValueError):
    """Malformed TRON. Never returns partial data."""

    def __init__(self, message: str):
        super().__init__(f"TRON: {message}")


_SIMBOLOS = {"(": "(", ")": ")", "[": "[", "]": "]", "{": "{", "}": "}", ",": ",", ":": ":", ";": ";", "=": "="}
_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
_NUM = re.compile(r"[0-9.eE+\-]")
_IDENT_INI = re.compile(r"[A-Za-z_]")
_IDENT = re.compile(r"[A-Za-z0-9_]")
_ENTERO = re.compile(r"^-?\d+$")

# Token kinds
_CLASS, _IDENTK, _STR, _NUMK, _TRUE, _FALSE, _NULL, _NL, _EOF = (
    "class", "ident", "str", "num", "true", "false", "null", "nl", "eof",
)


def _tokens(src: str) -> List[Tuple[str, str, int]]:
    out: List[Tuple[str, str, int]] = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in " \t\r":
            i += 1
        elif c == "\n":
            out.append((_NL, c, i))
            i += 1
        elif c == "#":
            while i < n and src[i] != "\n":
                i += 1
        elif c in _SIMBOLOS:
            out.append((c, c, i))
            i += 1
        elif c == '"':
            at = i
            i += 1
            partes: List[str] = []
            while True:
                if i >= n:
                    raise TronDecodeError(f"unterminated string at {at}")
                d = src[i]
                if d == '"':
                    i += 1
                    break
                if d == "\\":
                    if i + 1 >= n:
                        raise TronDecodeError(f"unterminated string at {at}")
                    e = src[i + 1]
                    if e == "u":
                        hexa = src[i + 2 : i + 6]
                        if not re.fullmatch(r"[0-9a-fA-F]{4}", hexa):
                            raise TronDecodeError(f"bad \\u escape at {i}")
                        partes.append(chr(int(hexa, 16)))
                        i += 6
                    else:
                        partes.append(_ESCAPES.get(e, e))
                        i += 2
                else:
                    partes.append(d)
                    i += 1
            # 😀 → one code point, like JavaScript strings
            texto = "".join(partes).encode("utf-16", "surrogatepass").decode("utf-16")
            out.append((_STR, texto, at))
        elif c == "-" or c.isdigit():
            at = i
            i += 1
            while i < n and _NUM.match(src[i]):
                i += 1
            out.append((_NUMK, src[at:i], at))
        elif _IDENT_INI.match(c):
            at = i
            i += 1
            while i < n and _IDENT.match(src[i]):
                i += 1
            v = src[at:i]
            kind = {"class": _CLASS, "true": _TRUE, "false": _FALSE, "null": _NULL}.get(v, _IDENTK)
            out.append((kind, v, at))
        else:
            raise TronDecodeError(f"unexpected character {c!r} at {i}")
    out.append((_EOF, "", n))
    return out


class _Parser:
    def __init__(self, src: str):
        self.tk = _tokens(src)
        self.p = 0
        self.clases: Dict[str, List[str]] = {}

    def ver(self, kind: str) -> bool:
        return self.tk[self.p][0] == kind

    def siguiente_es(self, kind: str) -> bool:
        return self.p + 1 < len(self.tk) and self.tk[self.p + 1][0] == kind

    def tomar(self, kind: str) -> bool:
        if self.ver(kind):
            self.p += 1
            return True
        return False

    def exigir(self, kind: str, que: str) -> Tuple[str, str, int]:
        k = self.tk[self.p]
        if k[0] != kind:
            raise TronDecodeError(f"expected {que} at {k[2]}, found {k[1]!r}")
        self.p += 1
        return k

    def separadores(self) -> None:
        while self.tomar(";") or self.tomar(_NL):
            pass

    def saltos(self) -> None:
        while self.tomar(_NL):
            pass

    def clase(self) -> None:
        nombre = self.exigir(_IDENTK, "class name")[1]
        props: List[str] = []
        if self.tomar("("):
            padre = self.exigir(_IDENTK, "parent class name")[1]
            if padre not in self.clases:
                raise TronDecodeError(f"undefined parent class {padre}")
            props = list(self.clases[padre])
            self.exigir(")", "')'")
        self.exigir(":", "':'")
        while not self.ver(";") and not self.ver(_CLASS) and not self.ver(_EOF):
            if self.tomar(_NL):
                if self.ver(_CLASS) or self.ver(_EOF):
                    break
                if self.ver(_IDENTK) and self.siguiente_es("("):
                    break
                if not self.ver(_IDENTK) and not self.ver(_STR):
                    break
                continue
            if self.tomar(","):
                continue
            if self.ver(_IDENTK) or self.ver(_STR):
                props.append(self.tk[self.p][1])
                self.p += 1
            else:
                break
        self.clases[nombre] = props

    def valor(self) -> Any:
        kind, v, at = self.tk[self.p]
        if kind == _NULL:
            self.p += 1
            return None
        if kind == _TRUE:
            self.p += 1
            return True
        if kind == _FALSE:
            self.p += 1
            return False
        if kind == _NUMK:
            self.p += 1
            try:
                if _ENTERO.match(v):
                    return int(v)
                f = float(v)
            except ValueError:
                raise TronDecodeError(f"bad number {v!r} at {at}") from None
            return int(f) if f.is_integer() and "e" not in v.lower() and "." not in v else f
        if kind == _STR:
            self.p += 1
            return v
        if kind == "[":
            self.p += 1
            arr: List[Any] = []
            while True:
                self.saltos()
                if self.ver("]"):
                    break
                arr.append(self.valor())
                self.saltos()
                if not self.tomar(","):
                    break
            self.exigir("]", "']'")
            return arr
        if kind == "{":
            self.p += 1
            obj: Dict[str, Any] = {}
            while True:
                self.saltos()
                if self.ver("}"):
                    break
                clave = self.exigir(_STR, "quoted key")[1]
                self.exigir(":", "':'")
                obj[clave] = self.valor()
                self.saltos()
                if not self.tomar(","):
                    break
            self.exigir("}", "'}'")
            return obj
        if kind == _IDENTK:
            return self.instancia()
        raise TronDecodeError(f"unexpected {v!r} at {at}")

    def instancia(self) -> Dict[str, Any]:
        _, nombre, at = self.tk[self.p]
        self.p += 1
        if nombre not in self.clases:
            raise TronDecodeError(f"undefined class {nombre} at {at}")
        props = self.clases[nombre]
        self.exigir("(", "'('")
        obj: Dict[str, Any] = {}
        puestas = set()
        posicion = 0
        nombrados = False
        while True:
            self.saltos()
            if self.ver(")"):
                break
            if (self.ver(_IDENTK) or self.ver(_STR)) and self.siguiente_es("="):
                nombrados = True
                prop = self.tk[self.p][1]
                if prop not in props:
                    raise TronDecodeError(f"unknown property {prop} of {nombre}")
                if prop in puestas:
                    raise TronDecodeError(f"property {prop} repeated")
                self.p += 2
                obj[prop] = self.valor()
                puestas.add(prop)
            else:
                if nombrados:
                    raise TronDecodeError("positional argument after a named one")
                if posicion >= len(props):
                    raise TronDecodeError(f"too many arguments for {nombre}")
                prop = props[posicion]
                posicion += 1
                obj[prop] = self.valor()
                puestas.add(prop)
            self.saltos()
            if not self.tomar(","):
                break
        if len(puestas) < len(props):
            faltan = ", ".join(p for p in props if p not in puestas)
            raise TronDecodeError(f"missing arguments for {nombre}: {faltan}")
        self.exigir(")", "')'")
        return obj

    def documento(self) -> Any:
        self.separadores()
        while self.tomar(_CLASS):
            self.clase()
            self.separadores()
        if self.ver(_EOF):
            raise TronDecodeError("no data section")
        datos = self.valor()
        self.separadores()
        if not self.ver(_EOF):
            k = self.tk[self.p]
            raise TronDecodeError(f"unexpected {k[1]!r} after the data at {k[2]}")
        return datos


def decode_tron(text: str) -> Any:
    """Decode a TRON document into plain Python values (dict, list, str, int, float, bool, None)."""
    return _Parser(text).documento()
