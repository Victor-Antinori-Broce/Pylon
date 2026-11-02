"""
The Python client (sync and async) against a REAL Kitsuden API on a test
database. Started by ``node scripts/sdk/integration.mjs``; skipped when run alone.
"""

from __future__ import annotations

import asyncio
import os
import time

import pytest

from kitsuden import (
    AsyncKitsudenApi,
    KitsudenApi,
    KitsudenApiError,
    Ok,
    ProposalPending,
    RequestOptions,
    expect_ok,
)

pytestmark = pytest.mark.skipif(os.environ.get("KITSUDEN_SDK_IT") != "1", reason="needs scripts/sdk/integration.mjs")

SELLO = format(int(time.time() * 1000), "x")


@pytest.fixture(scope="module")
def agente():
    with KitsudenApi() as k:  # KITSUDEN_API_URL + KITSUDEN_API_TOKEN
        yield k


@pytest.fixture(scope="module")
def admin():
    with KitsudenApi(token=False, session_cookie=os.environ.get("KITSUDEN_SDK_IT_COOKIE")) as k:
        yield k


@pytest.fixture(scope="module")
def dataset(agente: KitsudenApi, admin: KitsudenApi):
    expect_ok(admin.aprobaciones.guardar_configuracion_de_aprobaciones(body={"enabled": True}))
    expect_ok(admin.aprobaciones.modo_de_agente(id=os.environ["KITSUDEN_SDK_IT_PROPOSE_ID"], body={"mode": "propose"}))
    expect_ok(admin.aprobaciones.modo_de_agente(id=os.environ["KITSUDEN_SDK_IT_DIRECT_ID"], body={"mode": "direct"}))
    cuerpo = {
        "name": f"SDK PY {SELLO}",
        "slug": f"sdk-py-{SELLO}",
        "schema": [{"name": "score", "fieldName": "score", "type": "number", "fieldType": "number"}],
    }
    r = agente.datasets.crear_dataset(body=cuerpo)
    assert isinstance(r, Ok) and r.status == 201
    assert r.meta.idempotency_key and r.meta.idempotency_key.startswith("ksdk-") and not r.meta.replayed
    otra = agente.datasets.crear_dataset(body=cuerpo, request_options=RequestOptions(idempotency_key=r.meta.idempotency_key))
    assert isinstance(otra, Ok) and otra.meta.replayed and otra.data["id"] == r.data["id"]
    yield r.data
    expect_ok(admin.aprobaciones.guardar_configuracion_de_aprobaciones(body={"enabled": False}))


def test_entries_formats_and_provenance(agente: KitsudenApi, dataset):
    for i in range(3):
        expect_ok(agente.datasets.crear_entrada(id=dataset["id"], body={"title": f"e{i}", "data": {"score": i}}))
    lista = expect_ok(agente.datasets.listar_entradas(id=dataset["id"], limit=10))
    assert sorted(d["title"] for d in lista["docs"]) == ["e0", "e1", "e2"]
    for fmt in ("toon", "tron", "auto"):
        r = agente.datasets.listar_entradas(id=dataset["id"], limit=10, request_options=RequestOptions(format=fmt))
        assert expect_ok(r) == lista, fmt
        assert r.meta.format is not None
    r = agente.datasets.listar_entradas(id=dataset["id"], request_options=RequestOptions(provenance=True))
    assert isinstance(r, Ok)


def test_typed_problem(agente: KitsudenApi, dataset):
    with pytest.raises(KitsudenApiError) as e:
        agente.datasets.obtener_dataset(id="0c6e1c2e-0000-4000-8000-00000000dead")
    assert e.value.code == "KITSUDEN_E_NOT_FOUND" and e.value.status == 404 and e.value.problem["hint"]


def test_proposal_pending_async(dataset):
    async def main() -> None:
        async with AsyncKitsudenApi(token=os.environ["KITSUDEN_SDK_IT_PROPOSE_TOKEN"]) as k:
            r = await k.datasets.crear_dataset(body={"name": f"SDK PY held {SELLO}", "slug": f"sdk-py-held-{SELLO}"})
            assert isinstance(r, ProposalPending), r
            assert r.proposal["status"] == "pending" and r.proposal["id"] in r.proposal["statusUrl"]
            assert r.meta.attempts == 1
            estado = expect_ok(await k.propuestas.estado_de_propuesta(id=r.proposal["id"]))
            assert "pending" in str(estado)

    asyncio.run(main())


def test_admin_iterates_pending_proposals(admin: KitsudenApi, dataset):
    vistas = list(admin.aprobaciones.iter_listar_propuestas(status="pending", limit=50))
    assert vistas
