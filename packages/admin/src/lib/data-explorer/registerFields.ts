/**
 * Registration of default DataExplorer field components
 *
 * Este archivo registra todos los componentes de campo por defecto.
 * Los grimoires pueden registrar sus propios componentes adicionales.
 */

// Importar componentes base
import BooleanField from "$lib/components/data-explorer/fields/BooleanField.svelte";
import CalculatedField from "$lib/components/data-explorer/fields/CalculatedField.svelte";
import DateField from "$lib/components/data-explorer/fields/DateField.svelte";
import NumberField from "$lib/components/data-explorer/fields/NumberField.svelte";
import StatusBadgeField from "$lib/components/data-explorer/fields/StatusBadgeField.svelte";
import TextField from "$lib/components/data-explorer/fields/TextField.svelte";

import { fieldRegistry } from "./fieldRegistry";

/**
 * Registrar todos los tipos de campo por defecto
 */
export function registerDefaultFields() {
  // Campos básicos
  fieldRegistry.register("text", TextField);
  fieldRegistry.register("textarea", TextField); // Por ahora usa el mismo, se puede extender
  fieldRegistry.register("email", TextField);
  fieldRegistry.register("url", TextField);
  fieldRegistry.register("slug", TextField);

  // Numéricos
  fieldRegistry.register("number", NumberField);

  // Booleanos
  fieldRegistry.register("boolean", BooleanField);

  // Fechas
  fieldRegistry.register("date", DateField);
  fieldRegistry.register("datetime", DateField);

  // Status
  fieldRegistry.register("status-badge", StatusBadgeField);
  fieldRegistry.register("select", StatusBadgeField); // Para enums simples

  // Calculados
  fieldRegistry.register("calculated", CalculatedField);

  // Por defecto para cualquier tipo no registrado
  // (esto se maneja en el componente principal)
}

// Auto-registrar al importar
registerDefaultFields();
