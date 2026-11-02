"""
Tests del SDK Python — sin red y sin servidor.

`httpx.MockTransport` intercepta cada petición y devuelve respuestas
fabricadas. Lo que se verifica es el CONTRATO con la API: paths exactos,
cabeceras, cuerpo, envelope de error y parseo — que es donde un SDK se rompe
de verdad. La lógica del servidor ya tiene sus propios tests en el monorepo.
"""

import json
import unittest
from pathlib import Path

import httpx

from kitsuden import (
    AsyncKitsudenClient,
    KitsudenClient,
    KitsudenError,
    ToonDecodeError,
    decode_toon,
    parse_toon,
)

BASE = "http://kitsuden.test"


def make_client(handler, **kwargs) -> KitsudenClient:
    return KitsudenClient(
        BASE, api_key="kitsuden_sk_test", transport=httpx.MockTransport(handler), **kwargs
    )


class Capture:
    """Guarda la última petición y responde lo configurado."""

    def __init__(self, status=200, payload=None, headers=None):
        self.status = status
        self.payload = payload if payload is not None else {}
        self.headers = headers or {}
        self.last: httpx.Request = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.last = request
        body = (
            self.payload
            if isinstance(self.payload, (str, bytes))
            else json.dumps(self.payload)
        )
        return httpx.Response(self.status, content=body, headers=self.headers)


class TestPathsAndHeaders(unittest.TestCase):
    """El contrato literal con la API: mismos paths que el SDK TS."""

    def test_table_list_path_y_auth(self):
        cap = Capture(payload={"data": [], "pagination": None})
        with make_client(cap) as client:
            client.table("games").list(limit=5, page=2)

        self.assertEqual(cap.last.url.path, "/api/explorer/games")
        self.assertIn("limit=5", str(cap.last.url))
        self.assertIn("page=2", str(cap.last.url))
        # El API key viaja como Bearer, igual que en TS.
        self.assertEqual(cap.last.headers["authorization"], "Bearer kitsuden_sk_test")

    def test_crud_completo_usa_los_verbos_correctos(self):
        cap = Capture(payload={"id": "1"})
        with make_client(cap) as client:
            table = client.table("games")

            table.create({"title": "Elden Ring"})
            self.assertEqual((cap.last.method, cap.last.url.path), ("POST", "/api/explorer/games"))
            self.assertEqual(json.loads(cap.last.content), {"title": "Elden Ring"})

            table.update("42", {"title": "DLC"})
            self.assertEqual(
                (cap.last.method, cap.last.url.path), ("PATCH", "/api/explorer/games/42")
            )

            table.delete("42")
            self.assertEqual(
                (cap.last.method, cap.last.url.path), ("DELETE", "/api/explorer/games/42")
            )

    def test_collection_lee_y_escribe_en_paths_distintos(self):
        # El contrato actual de la API: lectura y escritura difieren. El SDK
        # debe reproducirlo, no "arreglarlo".
        cap = Capture(payload={"data": []})
        with make_client(cap) as client:
            col = client.collection("mmorpg-builds")

            col.entries(limit=3)
            self.assertEqual(cap.last.url.path, "/api/datasets/mmorpg-builds/entries")

            col.insert({"name": "necro"})
            self.assertEqual(cap.last.url.path, "/api/datasets/slug/mmorpg-builds/entries")

    def test_vector_search_y_tree(self):
        cap = Capture(payload={"results": []})
        with make_client(cap) as client:
            client.vector_search("ds1", "builds de nigromante", limit=5, threshold=0.7)
            self.assertEqual(cap.last.url.path, "/api/datasets/ds1/vector-search")
            body = json.loads(cap.last.content)
            self.assertEqual(body["query"], "builds de nigromante")
            self.assertEqual(body["threshold"], 0.7)

            client.tree_retrieve("# Doc\n## A", "qué hay en A", sections=["a"])
            self.assertEqual(cap.last.url.path, "/api/brain/tree/retrieve")
            self.assertEqual(json.loads(cap.last.content)["sections"], ["a"])

    def test_sin_api_key_no_hay_cabecera_authorization(self):
        cap = Capture(payload={})
        with KitsudenClient(BASE, transport=httpx.MockTransport(cap)) as client:
            client.table("games").options()
        self.assertNotIn("authorization", cap.last.headers)


class TestToon(unittest.TestCase):
    def test_toon_negocia_con_query_y_accept(self):
        cap = Capture(payload={"data": []})
        with make_client(cap, format="toon") as client:
            client.table("games").list()

        self.assertIn("format=toon", str(cap.last.url))
        self.assertEqual(cap.last.headers["accept"], "application/vnd.toon")

    def test_writes_siempre_json_aunque_el_cliente_sea_toon(self):
        # TOON es formato de RESPUESTA. Mandar escrituras en TOON rompería el
        # servidor; el SDK TS fuerza JSON en writes y este hace lo mismo.
        cap = Capture(payload={})
        with make_client(cap, format="toon") as client:
            client.table("games").create({"a": 1})

        self.assertNotIn("format=toon", str(cap.last.url))
        self.assertEqual(cap.last.headers["content-type"], "application/json")

    def test_parsea_respuesta_toon(self):
        # TOON de verdad, como lo escribe la API: tabla con las claves una vez.
        toon = "[2]{id,title,active}:\n  1,Elden Ring,true\n  2,DS3,false"
        cap = Capture(payload=toon, headers={"content-type": "application/vnd.toon"})
        with make_client(cap, format="toon") as client:
            rows = client.table("games").get("whatever")

        self.assertEqual(rows[0]["title"], "Elden Ring")
        self.assertIs(rows[0]["active"], True)
        self.assertIs(rows[1]["active"], False)

    def test_auto_negocia_solo_con_accept(self):
        cap = Capture(payload={"data": []})
        with make_client(cap, format="auto") as client:
            client.table("games").list()

        self.assertNotIn("format=", str(cap.last.url))
        self.assertEqual(
            cap.last.headers["accept"], 'application/vnd.kitsuden.auto; formats="json,toon"'
        )

    def test_auto_lee_json_o_toon_segun_content_type(self):
        for cuerpo, tipo in (
            ('{"a":[1,2]}', "application/json"),
            ("a[2]: 1,2", "application/vnd.toon"),
        ):
            cap = Capture(payload=cuerpo, headers={"content-type": tipo})
            with make_client(cap, format="auto") as client:
                self.assertEqual(client.table("x").get("1"), {"a": [1, 2]})

    def test_toon_mal_formado_lanza(self):
        with self.assertRaises(ToonDecodeError):
            decode_toon("a[3]{x}:\n  1\n  2")

    def test_casos_compartidos_con_la_api(self):
        # Pares TOON -> JSON escritos por el encoder de la API (un test de la
        # API vigila que el fichero siga al día).
        ruta = Path(__file__).parent / "fixtures" / "toon-casos.json"
        casos = json.loads(ruta.read_text(encoding="utf-8"))
        self.assertGreater(len(casos), 10)
        for caso in casos:
            with self.subTest(caso["nombre"]):
                self.assertEqual(decode_toon(caso["toon"]), caso["json"])
                self.assertEqual(parse_toon(caso["toon"]), caso["json"])


class TestErrores(unittest.TestCase):
    def test_error_envelope_conserva_status_y_mensaje(self):
        cap = Capture(status=403, payload={"error": {"code": "FORBIDDEN", "message": "no"}})
        with make_client(cap) as client:
            with self.assertRaises(KitsudenError) as ctx:
                client.table("games").get("1")

        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(str(ctx.exception), "no")
        # El payload crudo queda disponible para decidir programáticamente.
        self.assertEqual(ctx.exception.payload["error"]["code"], "FORBIDDEN")

    def test_error_sin_json_no_revienta_el_parser(self):
        cap = Capture(status=502, payload="<html>Bad Gateway</html>")
        with make_client(cap) as client:
            with self.assertRaises(KitsudenError) as ctx:
                client.table("x").get("1")
        self.assertEqual(ctx.exception.status, 502)

    def test_ping_no_lanza(self):
        cap = Capture(status=500, payload={})
        with make_client(cap) as client:
            self.assertFalse(client.ping())

        ok = Capture(payload={"status": "ok"})
        with make_client(ok) as client:
            self.assertTrue(client.ping())


class TestListResponse(unittest.TestCase):
    def test_paginacion_e_iteracion(self):
        cap = Capture(
            payload={
                "data": [{"id": "1"}, {"id": "2"}],
                "pagination": {
                    "page": 1,
                    "limit": 2,
                    "total": 10,
                    "totalPages": 5,
                    "hasNextPage": True,
                    "hasPrevPage": False,
                },
            }
        )
        with make_client(cap) as client:
            page = client.table("games").list(limit=2)

        self.assertEqual(len(page), 2)
        self.assertEqual([r["id"] for r in page], ["1", "2"])
        self.assertEqual(page.pagination.total, 10)
        self.assertTrue(page.pagination.has_next_page)


class TestAsyncClient(unittest.IsolatedAsyncioTestCase):
    """El async comparte la construcción con el sync: basta verificar que el
    contrato es idéntico en una muestra de operaciones."""

    async def test_mismo_contrato_que_el_sync(self):
        cap = Capture(payload={"data": [{"id": "1"}], "pagination": None})
        async with AsyncKitsudenClient(
            BASE, api_key="kitsuden_sk_test", transport=httpx.MockTransport(cap)
        ) as client:
            page = await client.table("games").list(limit=1)
            self.assertEqual(cap.last.url.path, "/api/explorer/games")
            self.assertEqual(page.data[0]["id"], "1")

            await client.collection("builds").insert({"x": 1})
            self.assertEqual(cap.last.url.path, "/api/datasets/slug/builds/entries")

    async def test_error_async(self):
        cap = Capture(status=404, payload={"error": "Not found"})
        async with AsyncKitsudenClient(BASE, transport=httpx.MockTransport(cap)) as client:
            with self.assertRaises(KitsudenError) as ctx:
                await client.table("games").get("nope")
        self.assertEqual(ctx.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
