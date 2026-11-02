/**
 * Ejemplo — una tier list de personajes con arrastrar y soltar
 * ============================================================================
 *
 * Copia el PATRÓN, no el diseño. Lo que importa de este fichero:
 *
 *   · `useTierList` trae la lista ya agrupada por filas (`vista.filas`) y los
 *     elementos sin colocar (`vista.sinRanquear`).
 *   · `colocar(itemId, tierId)` es optimista: la ficha se mueve al soltarla y
 *     vuelve a su sitio si la API la rechaza. Hay que capturar el error para
 *     enseñarlo, porque el hook lo relanza.
 *   · `null` como fila devuelve el elemento al pool sin ranquear.
 *
 * Los estilos son los mínimos para que se entienda la estructura.
 */

import { useState, type DragEvent } from "react";

import { useTierList, type KitsudenConfig, type TierItem } from "../index.js";

export function TierListDePersonajes({ config, slug }: { config: KitsudenConfig; slug: string }) {
  const { vista, loading, error, colocar } = useTierList(config, slug);
  const [aviso, setAviso] = useState<string | null>(null);

  if (loading) return <p>Cargando…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  if (!vista) return null;

  const alSoltar = (tierId: string | null) => (evento: DragEvent<HTMLElement>) => {
    evento.preventDefault();
    const itemId = evento.dataTransfer.getData("text/plain");
    if (!itemId) return;
    setAviso(null);
    colocar(itemId, tierId).catch((e: Error) => setAviso(e.message));
  };

  return (
    <div>
      {aviso && <p role="alert">{aviso}</p>}

      {vista.filas.map(({ tier, items }) => (
        <section
          key={tier.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={alSoltar(tier.id)}
          style={{
            display: "flex",
            gap: 8,
            minHeight: 64,
            borderLeft: `8px solid ${tier.color ?? "#888"}`,
          }}
        >
          <strong style={{ width: 40 }}>{tier.label}</strong>
          {items.map((item) => (
            <Ficha key={item.id} item={item} />
          ))}
        </section>
      ))}

      <section onDragOver={(e) => e.preventDefault()} onDrop={alSoltar(null)}>
        <h3>Sin ranquear</h3>
        {vista.sinRanquear.map((item) => (
          <Ficha key={item.id} item={item} />
        ))}
      </section>
    </div>
  );
}

function Ficha({ item }: { item: TierItem }) {
  return (
    <figure draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}>
      {item.imageUrl ? <img src={item.imageUrl} alt="" width={48} height={48} /> : null}
      <figcaption>{item.label}</figcaption>
    </figure>
  );
}
