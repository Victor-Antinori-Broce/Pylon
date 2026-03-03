<!--
  PublicForm.vue — Client-side hydrated island
  Auto-renders form inputs from dataset schema fields,
  validates with isRequired / validationRegex,
  and POSTs to /api/data-sets/:id/public-submit
-->
<template>
  <form class="public-form" @submit.prevent="handleSubmit" novalidate>
    <div class="form-fields">
      <div v-for="field in visibleFields" :key="field.id || field.key" class="field-group" :class="{ 'has-error': fieldErrors[field.key] }">

        <label :for="`field-${field.key}`" class="field-label">
          {{ field.label || field.key }}
          <span v-if="field.isRequired" class="required-dot">*</span>
        </label>

        <p v-if="field.helpText" class="field-help">{{ field.helpText }}</p>

        <!-- Text -->
        <input
          v-if="field.type === 'text' || field.type === 'email' || field.type === 'url'"
          :id="`field-${field.key}`"
          :type="field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'"
          v-model="formData[field.key]"
          :placeholder="field.label"
          :required="field.isRequired"
          :maxlength="field.maxLength || undefined"
          class="field-input"
          @blur="validateField(field)"
        />

        <!-- Number -->
        <input
          v-else-if="field.type === 'number'"
          :id="`field-${field.key}`"
          type="number"
          v-model.number="formData[field.key]"
          :placeholder="field.label"
          :required="field.isRequired"
          :min="field.minValue"
          :max="field.maxValue"
          class="field-input"
          @blur="validateField(field)"
        />

        <!-- Date -->
        <input
          v-else-if="field.type === 'date'"
          :id="`field-${field.key}`"
          type="date"
          v-model="formData[field.key]"
          :required="field.isRequired"
          class="field-input"
          @blur="validateField(field)"
        />

        <!-- Boolean -->
        <div v-else-if="field.type === 'boolean'" class="toggle-row">
          <button
            type="button"
            :id="`field-${field.key}`"
            @click="formData[field.key] = !formData[field.key]"
            :class="['toggle-btn', { active: formData[field.key] }]"
            role="switch"
            :aria-checked="!!formData[field.key]"
          >
            <span class="toggle-thumb" />
          </button>
          <span class="toggle-label">{{ formData[field.key] ? 'Yes' : 'No' }}</span>
        </div>

        <!-- Select -->
        <select
          v-else-if="field.type === 'select'"
          :id="`field-${field.key}`"
          v-model="formData[field.key]"
          :required="field.isRequired"
          class="field-input field-select"
          @blur="validateField(field)"
        >
          <option value="" disabled>Select {{ field.label }}...</option>
          <option
            v-for="opt in (field.options || [])"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>

        <!-- Richtext / JSON / longtext → textarea -->
        <textarea
          v-else-if="field.type === 'richtext' || field.type === 'json'"
          :id="`field-${field.key}`"
          v-model="formData[field.key]"
          :placeholder="field.label"
          :required="field.isRequired"
          rows="4"
          class="field-input field-textarea"
          @blur="validateField(field)"
        />

        <!-- Image / fallback → text input -->
        <input
          v-else
          :id="`field-${field.key}`"
          type="text"
          v-model="formData[field.key]"
          :placeholder="field.label"
          :required="field.isRequired"
          class="field-input"
          @blur="validateField(field)"
        />

        <!-- Error message -->
        <p v-if="fieldErrors[field.key]" class="field-error">{{ fieldErrors[field.key] }}</p>
      </div>
    </div>

    <!-- Submit -->
    <button
      type="submit"
      class="submit-btn"
      :disabled="submitting"
    >
      <span v-if="submitting" class="spinner" />
      {{ submitting ? 'Submitting...' : 'Submit' }}
    </button>

    <!-- Server error -->
    <p v-if="serverError" class="server-error">{{ serverError }}</p>

    <!-- Success -->
    <Transition name="success">
      <div v-if="submitted" class="success-card">
        <div class="success-icon">✓</div>
        <h3>Thank you!</h3>
        <p>Your submission to <strong>{{ datasetName }}</strong> has been received.</p>
        <button type="button" class="reset-btn" @click="resetForm">Submit another</button>
      </div>
    </Transition>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";

interface FieldDef {
  id?: string;
  key: string;
  label: string;
  type: string;
  helpText?: string;
  isRequired?: boolean;
  isUnique?: boolean;
  validationRegex?: string;
  defaultValue?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  options?: { label: string; value: string }[];
  hidden?: boolean;
  order?: number;
}

const props = defineProps<{
  fields: FieldDef[];
  datasetId: string;
  datasetName: string;
}>();

const API = (import.meta.env.PUBLIC_API_URL || import.meta.env.VITE_API_URL || "http://localhost:3001") as string;

const visibleFields = computed(() => {
  return [...props.fields]
    .filter(f => !f.hidden && f.type !== "relation")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

// Initialize form data with defaults
const formData = reactive<Record<string, any>>({});
for (const field of props.fields) {
  if (field.type === "boolean") {
    formData[field.key] = field.defaultValue === "true" || false;
  } else if (field.type === "number") {
    formData[field.key] = field.defaultValue ? Number(field.defaultValue) : null;
  } else {
    formData[field.key] = field.defaultValue || "";
  }
}

const fieldErrors = reactive<Record<string, string>>({});
const submitting = ref(false);
const submitted = ref(false);
const serverError = ref("");

function validateField(field: FieldDef): boolean {
  const value = formData[field.key];
  fieldErrors[field.key] = "";

  // Required
  if (field.isRequired && (value === undefined || value === null || value === "")) {
    fieldErrors[field.key] = `${field.label} is required`;
    return false;
  }

  // Regex
  if (field.validationRegex && value && typeof value === "string") {
    try {
      if (!new RegExp(field.validationRegex).test(value)) {
        fieldErrors[field.key] = `${field.label} format is invalid`;
        return false;
      }
    } catch { /* bad regex in schema */ }
  }

  // Number range
  if (field.type === "number" && value != null && value !== "") {
    const num = Number(value);
    if (field.minValue !== undefined && num < field.minValue) {
      fieldErrors[field.key] = `Must be at least ${field.minValue}`;
      return false;
    }
    if (field.maxValue !== undefined && num > field.maxValue) {
      fieldErrors[field.key] = `Must be at most ${field.maxValue}`;
      return false;
    }
  }

  // String length
  if (typeof value === "string" && field.minLength && value.length < field.minLength) {
    fieldErrors[field.key] = `Must be at least ${field.minLength} characters`;
    return false;
  }

  return true;
}

function validateAll(): boolean {
  let valid = true;
  for (const field of visibleFields.value) {
    if (!validateField(field)) valid = false;
  }
  return valid;
}

async function handleSubmit() {
  serverError.value = "";

  if (!validateAll()) return;

  submitting.value = true;
  try {
    const res = await fetch(`${API}/api/data-sets/${props.datasetId}/public-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...formData } }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.errors?.length) {
        for (const err of body.errors) {
          if (err.field) fieldErrors[err.field] = err.message;
        }
        serverError.value = "Please fix the errors above.";
      } else {
        serverError.value = body.error || "Submission failed. Please try again.";
      }
      return;
    }

    submitted.value = true;
  } catch {
    serverError.value = "Network error. Please try again.";
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  submitted.value = false;
  serverError.value = "";
  for (const field of props.fields) {
    if (field.type === "boolean") {
      formData[field.key] = false;
    } else if (field.type === "number") {
      formData[field.key] = null;
    } else {
      formData[field.key] = field.defaultValue || "";
    }
  }
  Object.keys(fieldErrors).forEach(k => { fieldErrors[k] = ""; });
}
</script>

<style scoped>
.public-form {
  position: relative;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
}
.required-dot {
  color: #FF2A6D;
  margin-left: 2px;
}

.field-help {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.3);
  margin: 0;
}

.field-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: #fff;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field-input::placeholder {
  color: rgba(255,255,255,0.2);
}
.field-input:focus {
  border-color: rgba(0,229,255,0.4);
  box-shadow: 0 0 0 3px rgba(0,229,255,0.08);
}

.has-error .field-input {
  border-color: rgba(255,42,109,0.4);
}
.has-error .field-input:focus {
  box-shadow: 0 0 0 3px rgba(255,42,109,0.1);
}

.field-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  padding-right: 2.5rem;
}

.field-textarea {
  resize: vertical;
  min-height: 100px;
}

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.toggle-btn {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 9999px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.toggle-btn.active {
  background: rgba(0,229,255,0.2);
  border-color: rgba(0,229,255,0.3);
}
.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255,255,255,0.6);
  transition: transform 0.2s;
}
.toggle-btn.active .toggle-thumb {
  transform: translateX(20px);
  background: #00E5FF;
}
.toggle-label {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.4);
}

/* Errors */
.field-error {
  font-size: 0.7rem;
  color: #FF2A6D;
  margin: 0;
}

.server-error {
  text-align: center;
  font-size: 0.8rem;
  color: #FF2A6D;
  margin-top: 1rem;
}

/* Submit */
.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  margin-top: 2rem;
  padding: 0.9rem;
  border-radius: 0.75rem;
  border: none;
  background: linear-gradient(135deg, #00E5FF, #00B8D4);
  color: #000;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0,0,0,0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success */
.success-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(12,12,20,0.98);
  border-radius: 1rem;
  padding: 3rem 2rem;
  z-index: 10;
}
.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(0,229,255,0.15);
  border: 2px solid rgba(0,229,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: #00E5FF;
  margin-bottom: 1rem;
}
.success-card h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
}
.success-card p {
  font-size: 0.9rem;
  color: rgba(255,255,255,0.4);
  margin: 0 0 1.5rem;
}
.success-card strong {
  color: rgba(0,229,255,0.7);
}
.reset-btn {
  padding: 0.6rem 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.6);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}
.reset-btn:hover {
  background: rgba(255,255,255,0.08);
}

/* Transitions */
.success-enter-active {
  transition: all 0.3s ease;
}
.success-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
</style>
