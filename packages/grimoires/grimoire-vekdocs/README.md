# VekDocs Grimoire

Entorno KITSUDEN para procesamiento documental inteligente sobre los **3 componentes vekdocs**:

```
┌─────────────────────────┐      ┌──────────────────────────────────────────┐
│  KITSUDEN backend (este CMS) │      │  konusagi (repo "rabbit mq")            │
│                         │      │                                          │
│  kon-ocr ────────────────────▶ gateway :8001 ──▶ RabbitMQ ──▶ worker ───┐│
│   /api/ocr/gateway/*    │      │     │                            │      ││
│                         │      │  Postgres (jobs)   S3 (in/out) ◀─┘      ││
│  kon-ocr-training ─────────┐ └──────────────────────────────────────────┘│
│   /api/ocr-training/yomi/*  │ │                                            │
│                             │ │ ┌──────────────────────────────┐           │
│  VekStudio (Svelte)    │ └─▶ vekocr engine :8000 ◀──────────────────┘
│   window.__vekstudio_config   │   │ (fp-yomi: OCR cascade,       │
└─────────────────────────────┘   │  templates, HITL, /train)    │
                                  └──────────────────────────────┘
```

## Kons

| Kon                            | Mount               | Rol                                                                                                                                                                                                     | Upstream                 |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `kon-ocr` (requerido)          | `/api/ocr`          | Ciclo de vida de jobs: encolar, estados en vivo (SSE), resultados, correcciones, búsqueda full-text; tabla local `ocr_documents` que vincula cada job a registros KITSUDEN                              | `VEKDOCS_GATEWAY_URL`    |
| `kon-ocr-training` (requerido) | `/api/ocr-training` | Operación del modelo (propuestas de template, `/train`, vocabulario, `/overview`) **+ gobierno del LLM de visión**: config en `ocr_vision_config`, provider key en KITSUDEN Secrets, panel "Ajustes IA" | `VEKOCR_URL` (+ gateway) |
| `kon-dms` (opcional)           | `/api/dms`          | Archivo documental formal para los documentos ya extraídos                                                                                                                                              | —                        |

Los proxies usan **allowlist por prefijo** — solo el contrato conocido se reenvía
(gateway: `jobs, corrections, training, models, health, events`; yomi:
`proposals, train, templates, vocabulary, feedback, extract, status, health`).

## El combo completo

VekStudio + KITSUDEN + konusagi + vekocr como una sola pieza:

- **konusagi** (gateway Go + RabbitMQ + worker + Postgres + S3): ingesta,
  cola, resultados, correcciones HITL, entrenamiento, analítica, búsqueda,
  clasificación de tipo, esquemas y reglas de negocio.
- **vekocr** (engine): cascada OCR barato-primero (tesseract/paddle → surya/
  doctr) + TemplateStore + LLM de visión como último recurso.
- **KITSUDEN** (este CMS): auth, Secrets (provider keys cifradas), y el panel de
  ajustes. Cada documento leído se vincula a registros KITSUDEN.
- **VekStudio**: la interfaz visual, servida bajo `/vekstudio`, hablando
  con todo a través de los kons (auth de KITSUDEN en cada llamada).

### LLM de visión gobernado por KITSUDEN

La provider API key vive en **KITSUDEN Secrets** (`VEKOCR_VISION_LLM_API_KEY`,
cifrada AES-256-GCM). El kon ejecuta la llamada al proveedor **él mismo** —
la key nunca toca la cola RabbitMQ ni el engine. Los knobs no sensibles
(proveedor, modelo, umbral de fidelidad, stage, base_url) se editan en el panel
**Ajustes IA** del admin de KITSUDEN.

| Endpoint                                         | Qué hace                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /api/ocr-training/vision-config`            | Lee la config (indica si la key está presente, sin revelarla)                        |
| `PUT /api/ocr-training/vision-config`            | Guarda los knobs                                                                     |
| `POST /api/ocr-training/vision-config/test`      | Prueba la credencial con una llamada barata                                          |
| `POST /api/ocr-training/vision-reprocess/:jobId` | Relee un documento dudoso con el LLM (baja el input del gateway, llama al proveedor) |

Dos topologías, cada una segura:

- **Standalone** (sin KITSUDEN): el engine usa `VEKOCR_VISION_LLM_*` en su `.env`.
- **Con KITSUDEN**: la key en Secrets, el kon ejecuta, el panel gobierna.

## Puesta en marcha

1. **Levantar el stack OCR** (repo `rabbit mq`):
   ```bash
   # .env → COMPOSE_PROFILES=seaweedfs,go   (binario Go: gateway+worker)
   docker compose up -d
   ```
2. **Configurar KITSUDEN** (Secrets o `.env` del API):
   ```
   VEKDOCS_GATEWAY_URL=http://gateway_api:8001      # o http://localhost:8015 si KITSUDEN corre fuera de esa red docker
   VEKOCR_URL=http://vekocr_engine:8000
   ```
   Si KITSUDEN corre fuera de la red `konusagi_net`, apunta a los puertos publicados
   por el nginx del stack OCR o une el contenedor del API a esa red.
3. **Activar el grimoire** `grimoire-vekdocs` desde el admin (habilita `kon-ocr`;
   `kon-ocr-training` es opcional).
4. **Ejecutar migraciones** de `kon-ocr` (`migrations/0000_initial.sql`).
5. **Conectar VekStudio** — el SPA (base `/vekstudio`) se configura sin rebuild:
   ```html
   <script>
     window.__vekstudio_config = {
       gatewayUrl: "/api/ocr/gateway",
       yomiUrl: "/api/ocr-training/yomi",
     };
   </script>
   ```
   Con eso todas las llamadas del studio (jobs, revisión HITL, entrenamiento,
   propuestas de template y el stream SSE) pasan por KITSUDEN con auth de KITSUDEN.

## Flujo HITL completo

1. Usuario sube documento → `POST /api/ocr/gateway/jobs/extract` → job en RabbitMQ.
2. Worker (Go) baja el input de S3, llama `POST /extract/bytes` del engine y guarda resultado en S3 + Postgres. `kon-ocr` refleja el estado en `ocr_documents`.
3. Lecturas con confianza < 0.75 aparecen en "Revisión" del studio; las correcciones se persisten en konusagi (`POST /corrections`) — la fuente de verdad. Al llegar al umbral se encola un training job.
4. El engine captura **propuestas de template** automáticamente (confianza > 0.90 con hints); se revisan en el studio o vía `/api/ocr-training/yomi/proposals` y se promueven con `/train`.
