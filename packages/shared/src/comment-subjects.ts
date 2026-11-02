/**
 * De qué se puede comentar, declarado en UN solo sitio
 * ============================================================================
 *
 * ── EL PROBLEMA QUE ESTO RESUELVE ──────────────────────────────────────────
 *
 * `kon-comments` es polimórfico: un comentario cuelga de `(subjectType,
 * subjectId)` sin clave foránea, y por eso el mismo motor sirve para artículos,
 * páginas de wiki y fichas del catálogo sin repetir hilos, votos y moderación
 * cinco veces. Es la decisión correcta.
 *
 * Pero `subjectType` solo se validaba de FORMA:
 *
 *     subjectType: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/)
 *
 * Así que `post`, `blog_post` y `blogpost` se aceptan los tres y crean TRES
 * hilos distintos sobre el mismo artículo. Quien escriba la página elige una
 * cadena, quien escriba el widget de la barra lateral elige otra, y los
 * comentarios simplemente no aparecen donde se esperaba. Sin error, sin log, y
 * sin nada que buscar: los dos lados «funcionan».
 *
 * ── POR QUE UN VOCABULARIO NO MATA EL POLIMORFISMO ─────────────────────────
 *
 * Podría parecer que cerrar la lista contradice el diseño. No: lo que se cierra
 * es la ESCRITURA, y añadir un tipo cuesta una línea aquí. Lo que antes era un
 * error de tecleo silencioso pasa a ser un acto deliberado. La lectura sigue
 * aceptando cualquier cadena, porque pedir un hilo que no existe devuelve una
 * lista vacía y no rompe nada.
 *
 * ── Y DE PASO, LA VISIBILIDAD ──────────────────────────────────────────────
 *
 * Cada entrada dice de qué tabla es el sujeto y qué estados suyos son públicos.
 * Con eso `kon-comments` puede comprobar que el sujeto EXISTE y es visible sin
 * importar ni un solo kon: la tabla sale de este literal, nunca de la petición.
 *
 * Sin esa comprobación se pueden colgar comentarios del id de un borrador, y
 * como la lectura de hilos es pública, el hilo de un artículo no publicado se
 * leería desde fuera. Es la misma familia de fuga que ya aparecio en blog,
 * games y esports.
 */

/** Una cosa comentable: dónde vive y cuándo es pública. */
export interface SujetoComentable {
  /** Para mensajes de error y para el panel. */
  label: string;
  /** Quién es dueño del sujeto. Documental: aquí no se importa nada. */
  kon: string;
  /**
   * Tabla donde vive. Sale de este literal y NUNCA de la petición: es lo que
   * permite interpolarla en una consulta sin abrir una inyección.
   */
  tabla: string;
  /** Columna de estado, si la tiene. `null` = todo lo que existe es público. */
  columnaEstado: string | null;
  /** Estados que un visitante sin permisos puede ver. */
  estadosPublicos: string[];

  /**
   * Columna con el nombre legible del sujeto.
   *
   * ── POR QUE ESTA AQUI ────────────────────────────────────────────────────
   *
   * Sin esto, la cola de moderación enseña un cuerpo de comentario junto a un
   * uuid. Quien modera necesita saber DE QUE articulo viene para decidir: el
   * mismo texto puede ser una respuesta legítima en un hilo y spam en otro. Es
   * la columna «In response to» de WordPress, y sin ella moderar es adivinar.
   */
  columnaTitulo: string;
  /** Columna del slug, para poder enlazar al sitio público. */
  columnaSlug: string;
}

/**
 * El vocabulario.
 *
 * Solo lo que existe de verdad y está conectado. Declarar aquí `game` o
 * `build` antes de que nada los use seria inventar: una entrada sin uso no se
 * revisa, y el dia que alguien la use puede estar apuntando a una tabla que
 * cambio de nombre.
 */
export const SUJETOS_COMENTABLES = {
  blog_post: {
    label: "Artículo del blog",
    kon: "kon-blog",
    tabla: "blog_posts",
    columnaEstado: "status",
    estadosPublicos: ["published"],
    columnaTitulo: "title",
    columnaSlug: "slug",
  },
  /**
   * Una página del constructor de bloques.
   *
   * Está aquí porque el bloque de comentarios dice «vacío = el sujeto de esta
   * página», y sin esta entrada esa frase no tenía a qué referirse en una
   * página de bloques: el vocabulario solo conocía artículos. Prometer un
   * comportamiento que no existe manda a buscar un fallo donde no lo hay.
   */
  block_page: {
    label: "Página del constructor",
    kon: "kon-blocks",
    tabla: "block_pages",
    columnaEstado: "status",
    estadosPublicos: ["published"],
    columnaTitulo: "title",
    columnaSlug: "slug",
  },
  /**
   * Una página de una wiki (kon-wiki). Sin estado: toda página que existe es
   * pública, y su contenido lo edita cualquier sesión.
   *
   * La usa la ficha de la wiki (`<wiki>.<dominio>/<página>`), pestaña
   * «Comentarios». El id es el de `wiki_pages`, no el slug: el slug solo es
   * único dentro de su wiki.
   */
  wiki_page: {
    label: "Página de wiki",
    kon: "kon-wiki",
    tabla: "wiki_pages",
    columnaEstado: null,
    estadosPublicos: [],
    columnaTitulo: "title",
    columnaSlug: "slug",
  },
} as const satisfies Record<string, SujetoComentable>;

export type TipoDeSujeto = keyof typeof SUJETOS_COMENTABLES;

/** Los tipos válidos, para mensajes de error que digan cuáles son. */
export const TIPOS_DE_SUJETO = Object.keys(SUJETOS_COMENTABLES) as TipoDeSujeto[];

export function esTipoDeSujeto(tipo: string): tipo is TipoDeSujeto {
  return Object.prototype.hasOwnProperty.call(SUJETOS_COMENTABLES, tipo);
}

export function sujetoComentable(tipo: string): SujetoComentable | null {
  return esTipoDeSujeto(tipo) ? SUJETOS_COMENTABLES[tipo] : null;
}
