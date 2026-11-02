/**
 * Verificación de RLS en el arranque — el aislamiento se PRUEBA, no se declara
 * ============================================================================
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
 *
 * Todo lo que rodea a RLS en este repo comprueba DECLARACIONES:
 *
 *   · `rls-coverage.test.ts` comprueba que cada tabla con dueño está decidida.
 *   · `start-with-check.sh` comprueba que el rol de aplicación existe y no es
 *     superusuario.
 *   · Las migraciones comprueban que las políticas se crean.
 *
 * Ninguna comprueba que el aislamiento OCURRA. Y las cuatro formas de romperlo
 * dejan el sistema funcionando igual de bien, solo que enseñando datos ajenos:
 *
 *   1. El rol de la app resulta ser superusuario → Postgres ignora las políticas.
 *   2. Alguien concede `BYPASSRLS` para depurar y no lo quita.
 *   3. Una tabla nueva nace con `ENABLE` pero sin `FORCE`.
 *   4. Una política mal escrita que siempre da verdadero.
 *
 * Ninguna de las cuatro produce un error. Producen datos. Por eso esto no es
 * un test de la suite: es una comprobación de ARRANQUE, contra la base real,
 * con el rol real, en el momento en que se despliega.
 *
 * ── QUÉ PRUEBA EXACTAMENTE ─────────────────────────────────────────────────
 *
 * Con el contexto fijado a un usuario que no existe, una tabla aislada tiene
 * que devolver CERO filas. Si devuelve alguna, ese usuario está viendo filas
 * de otro y el despliegue no debe seguir.
 *
 * Desde 2026-10-23 la vara es «nada que no vea también el anónimo» (ver
 * COMPARTIDO_CON_SESION más abajo): hay tablas con filas públicas por diseño.
 *
 * Ojo con lo que NO prueba: el contexto VACÍO (id Y rol vacíos) es el
 * sistema y lo ve todo, a propósito: migraciones, cargadores y tareas de fondo.
 * Una ruta que no pase por `withTransactionalRLS()` corre así. Las rutas del
 * núcleo que lo montan y TODAS las de los kons (module-loader) fijan el
 * contexto; esta comprobación verifica la capa de base de datos, no puede
 * verificar qué rutas la usan.
 */

import { Client } from "pg";

const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;

/** Un id que no puede ser de nadie: si se ven filas con esto, se ven todas. */
const NADIE = "rls-probe-usuario-que-no-existe-0000";

interface Fuga {
  tabla: string;
  filas: number;
  /** Con qué contexto se vieron (rol `user`, o rol vacío con usuario). */
  como: string;
}

/**
 * ── LO PÚBLICO NO ES UNA FUGA (2026-10-23) ──────────────────────────────────
 *
 * Desde que las rutas de los kons corren en su transacción RLS, hay tablas
 * con filas que CUALQUIERA lee por diseño: plantillas de tier list, builds
 * publicadas, entradas de datasets públicos. Un usuario que no es dueño de
 * nada las ve, y eso no es que vea filas «de otro»: es que las ve todo el
 * mundo.
 *
 * Así que la vara de medir ya no es «cero filas», sino «nada que no vea
 * también el ANÓNIMO» (id '' y rol `anonymous`, el contexto que fija
 * `withTransactionalRLS()` sin sesión). Una política que deje a un usuario
 * cualquiera ver filas ajenas que no son públicas sigue saltando aquí.
 *
 * Lo que se comparte con cualquier SESIÓN (no con el anónimo) tiene que
 * declararse aquí, con el predicado que lo define. Sin declarar, cuenta como
 * fuga: mejor un arranque parado por algo legítimo que se declara en una
 * línea, que una fuga que pasa por legítima.
 */
const COMPARTIDO_CON_SESION: Record<string, string> = {
  // Datasets con `readAccess: authenticated` (data_entries_lectura_por_dataset)
  data_entries: `data_set_id IN (SELECT id FROM data_sets WHERE policy_json->>'readAccess' = 'authenticated')`,
  // Asignación de un curso a un GRUPO (kon-academy-lms/0003): no es de nadie
  asignaciones: `user_id IS NULL`,
};

/** El anónimo de una petición, tal como lo fija `withTransactionalRLS()`. */
const ANONIMO = { id: "", rol: "anonymous" };

/**
 * Los extraños con los que se mide: una cuenta corriente, y la MISMA cuenta
 * con el rol sin fijar. La segunda es la que cazó en producción la escotilla
 * de la newsletter (rol vacío + usuario = «sistema»).
 */
const EXTRANOS = [
  { id: NADIE, rol: "user", como: "usuario cualquiera" },
  { id: NADIE, rol: "", como: "usuario con el rol sin fijar" },
];

async function main() {
  if (!ADMIN_URL) {
    console.error("✗ RLS: no hay DATABASE_ADMIN_URL ni DATABASE_URL");
    process.exit(1);
  }

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();
  const q = async <T>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await db.query(text, values as never[])).rows as T[];

  try {
    /**
     * Si la app corre con la misma cuenta que migra y esa cuenta es
     * superusuario, no hay nada que medir: Postgres se salta las políticas
     * enteras y cualquier prueba daría verde por el motivo equivocado.
     */
    const appUser = APP_URL ? decodeURIComponent(new URL(APP_URL).username) : null;
    if (appUser) {
      const [rol] = await q<{ rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1",
        [appUser]
      );
      if (!rol) {
        console.error(`✗ RLS: el rol de aplicación "${appUser}" no existe`);
        process.exit(1);
      }
      if (rol.rolsuper || rol.rolbypassrls) {
        console.error(
          `✗ RLS: el rol "${appUser}" es superusuario o tiene BYPASSRLS.\n` +
            "     Postgres ignora TODAS las políticas para ese rol: el aislamiento\n" +
            "     entre usuarios no existe, aunque las políticas estén creadas."
        );
        process.exit(1);
      }
    }

    // Tablas con RLS activo. Las que no tienen filas no se pueden comprobar:
    // una tabla vacía devuelve cero por estar vacía, no por estar aislada.
    const tablas = await q<{ relname: string; forced: boolean }>(
      `SELECT c.relname, c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       ORDER BY c.relname`
    );

    if (!tablas.length) {
      console.error("✗ RLS: ninguna tabla tiene RLS activo. ¿Se aplicaron las políticas?");
      process.exit(1);
    }

    const sinForce = tablas.filter((t) => !t.forced).map((t) => t.relname);
    const sinPolitica = await q<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policies p
                         WHERE p.schemaname = 'public' AND p.tablename = c.relname)`
    );

    const fugas: Fuga[] = [];
    const publicasPorDiseno: string[] = [];
    let probadas = 0;
    let vacias = 0;

    if (!appUser) {
      console.log("  RLS: sin rol de aplicación separado, no hay aislamiento que medir");
    } else {
      for (const { relname } of tablas) {
        const [{ n: total }] = await q<{ n: number }>(
          `SELECT count(*)::int AS n FROM "${relname}"`
        );
        if (Number(total) === 0) {
          vacias++;
          continue;
        }

        /**
         * `SET LOCAL ROLE` dentro de una transacción: se prueba con el rol de
         * la aplicación de verdad y se deshace solo. Probar como el rol que
         * migra sería medir a la persona equivocada.
         */
        const compartido = COMPARTIDO_CON_SESION[relname];
        const consulta =
          `SELECT count(*)::int AS n FROM "${relname}"` +
          (compartido ? ` WHERE NOT COALESCE((${compartido}), false)` : "");
        const visiblesCon = async (id: string, rol: string): Promise<number> => {
          await db.query("BEGIN");
          try {
            await db.query(`SET LOCAL ROLE "${appUser}"`);
            await db.query(
              "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)",
              [id, rol]
            );
            const [r] = await q<{ n: number }>(consulta);
            return Number(r.n);
          } finally {
            await db.query("ROLLBACK");
          }
        };

        const publicas = await visiblesCon(ANONIMO.id, ANONIMO.rol);
        if (publicas > 0) publicasPorDiseno.push(`${relname} (${publicas})`);
        for (const extrano of EXTRANOS) {
          const visibles = await visiblesCon(extrano.id, extrano.rol);
          if (visibles > publicas) {
            fugas.push({ tabla: relname, filas: visibles - publicas, como: extrano.como });
          }
        }
        probadas++;
      }
    }

    // ── Informe ────────────────────────────────────────────────────────────
    console.log(
      `  RLS: ${tablas.length} tablas protegidas · ${probadas} comprobadas con datos` +
        (vacias ? ` · ${vacias} vacías (no comprobables)` : "")
    );

    let fallo = false;

    if (sinForce.length) {
      // Sin FORCE, el dueño de la tabla queda exento y las políticas son
      // decorativas para él. Es el bug que ya nos mordió una vez.
      console.error(
        `✗ RLS: ${sinForce.length} tablas con ENABLE pero sin FORCE: ${sinForce.join(", ")}`
      );
      fallo = true;
    }
    if (sinPolitica.length) {
      console.error(
        `✗ RLS: ${sinPolitica.length} tablas con RLS activo y NINGUNA política: ` +
          sinPolitica.map((t) => t.relname).join(", ") +
          "\n     Con RLS activo y cero políticas, la tabla no devuelve NADA a la app."
      );
      fallo = true;
    }
    if (publicasPorDiseno.length) {
      // Informativo: lo que lee el anónimo por diseño. Si aquí aparece una
      // tabla de datos personales, la fuga es la política pública.
      console.log(`  RLS: legibles sin sesión (por política): ${publicasPorDiseno.join(", ")}`);
    }
    if (fugas.length) {
      console.error(
        `✗ RLS: ${fugas.length} casos de filas ajenas visibles más allá de lo público:`
      );
      for (const f of fugas)
        console.error(`     ${f.tabla}: ${f.filas} filas de más (${f.como})`);
      console.error("     El aislamiento entre usuarios NO se está aplicando.");
      fallo = true;
    }

    if (fallo) process.exit(1);
    console.log("  RLS: aislamiento verificado contra la base real");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("✗ RLS: la verificación falló:", err instanceof Error ? err.message : err);
  process.exit(1);
});
