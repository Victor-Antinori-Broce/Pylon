/**
 * Mock de `$app/stores` para tests unitarios. Ver app-navigation.ts.
 *
 * Son stores legibles mínimos: los tests comprueban el DOM que producen los
 * componentes, no la navegación de SvelteKit.
 */

type Suscriptor<T> = (value: T) => void;

function readable<T>(value: T) {
  return {
    subscribe(run: Suscriptor<T>) {
      run(value);
      return () => {};
    },
  };
}

export const page = readable({
  url: new URL("http://localhost/"),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: undefined,
  state: {},
});

export const navigating = readable(null);
export const updated = { ...readable(false), check: async () => false };
