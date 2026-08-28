---
name: vue3-ts-engineer
description: >
  Senior-level software engineering guidance for Vue 3 + TypeScript + Tailwind v4 + PrimeVue v4 + buildkit-primevue (FormKit) module-based applications.
  Use this skill whenever the user asks to create, refactor, review, or architect any Vue 3 component, composable, service, type, module, or form — especially when they mention modules, admin panels, CRUD views, filters, forms, composables, API services, Pinia stores, or SRP/OCP/DRY.
  Also trigger for: "write a composable for...", "create a module for...", "how should I structure...", "refactor this component", "add a new field to form", "create a service for...", or any task involving buildkit-primevue FormKit fields.
---

# Vue 3 TypeScript Software Engineer Skill

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| UI Library | PrimeVue v4 |
| Form Library | `buildkit-primevue` (FormKit) |
| State | Pinia |
| Validation | Zod (via FormKit schema strings) |
| HTTP | Axios |
| Utilities | VueUse |

---

## Core Principles (ALWAYS APPLY)

### SRP — Single Responsibility Principle
Every file does exactly one thing:
- `useAdminFields.ts` → only field definitions
- `useAdminFilter.ts` → only filter logic
- `AdminAPI.ts` → only API calls
- `Admin.ts` → only type definitions
- Never mix API logic into components; never mix field definitions into views

### OCP — Open/Closed Principle
- Add new behavior by adding new files, not editing existing ones
- New field types → extend `FormKitField` via pass-through props, don't fork the library
- New filter options → extend the filter composable, don't touch the view
- New API endpoints → add to the service file, don't scatter axios calls

### DRY — Don't Repeat Yourself
- Shared types go in `types/`
- Reusable field definitions go in composables (`useXxxFields.ts`)
- Common API patterns go in base services or shared helpers
- Use `setFields`, `getPayload`, `clear` from buildkit-primevue — never reimplement

---

## Module Structure

Every feature module follows this exact layout:

```
modules/
└── feature-name/
    ├── components/          # UI-only components (dumb/presentational)
    ├── composables/
    │   ├── useFeatureAPI.ts        # API call orchestration (calls service)
    │   ├── useFeatureFields.ts     # FormKit field definitions
    │   ├── useFeatureFilter.ts     # Filter state & logic
    │   ├── useFeatureHelper.ts     # Pure helper functions
    │   └── useFeatureStore.ts      # Pinia store wrapper (if needed)
    ├── services/
    │   └── FeatureAPI.ts           # Raw axios calls, returns typed responses
    ├── types/
    │   ├── Feature.ts              # Domain model types
    │   ├── FeatureFilter.ts        # Filter-related types
    │   └── FeatureStore.ts         # Store state types
    ├── views/
    │   └── FeatureModule.vue       # Route-level view (smart component)
    ├── router.ts
    └── store.ts
```

**Rule:** If a file doesn't fit cleanly into one of these categories, it needs to be split.

---

## FormKit (buildkit-primevue) Patterns

> Read `references/formkit.md` for full API reference. Below are the patterns to always follow.

### Field Definition Composable

```typescript
// useFeatureFields.ts
import type { FormKitField } from "buildkit-primevue";

export function useFeatureFields() {
  const fields: Record<string, FormKitField> = {
    name: {
      label: "Name",
      defaultValue: "",
      colSpan: { mobile: 1, tablet: 2, desktop: 3 },
      schema: "required|max:100",
      placeholder: "Enter name",
    },
    status: {
      label: "Status",
      as: "Select",
      defaultValue: null,
      colSpan: { mobile: 1, tablet: 2, desktop: 3 },
      schema: "required",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  };

  return { fields };
}
```

**Rules for field composables:**
- Always type `fields` as `Record<string, FormKitField>`
- Always include `colSpan` (it is required)
- Use `schema` string for validation: `"required|email|max:100"`
- Use `as` to specify PrimeVue component (default: `InputText`)
- Use `showWhen`/`hideWhen` for conditional visibility — never v-if in template
- Keep field definitions in composable, never inline in the view

### Form View Pattern

```vue
<template>
  <FormKit v-bind="formArgs" v-model="form" @submit="onSubmit" />
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import FormKit, { getPayload, setFields, clear } from "buildkit-primevue";
import type { FormKitProps } from "buildkit-primevue";
import { useFeatureFields } from "../composables/useFeatureFields";
import { useFeatureAPI } from "../composables/useFeatureAPI";

const { fields } = useFeatureFields();
const { save, load } = useFeatureAPI();

const form = ref<Record<string, any>>({});
const formArgs = reactive<FormKitProps>({
  fields,
  size: "small",
  locale: "en",
});

const onSubmit = async ({ valid, states }: any) => {
  if (!valid) return;
  const payload = getPayload(states, fields);
  await save(payload);
};

const loadData = async (id: number) => {
  const data = await load(id);
  setFields(data, fields);
};
</script>
```

### Supported `as` Values (PrimeVue Components)

`InputText` · `InputNumber` · `Textarea` · `Select` · `MultiSelect` · `Checkbox` · `CheckboxGroup` · `RadioButton` · `DatePicker` · `Editor` · `Password` · `ToggleSwitch` · `Rating` · `ColorPicker`

### Conditional Visibility

```typescript
// showWhen: show only when another field equals a value
showWhen: { field: "type", equals: "premium" }

// hideWhen: hide when condition matches (takes precedence over showWhen)
hideWhen: { field: "enabled", equals: false }

// Multiple conditions (OR logic)
showWhen: [
  { field: "role", equals: "admin" },
  { field: "role", equals: "editor" },
]

// includes: for array values
showWhen: { field: "tags", includes: "vip" }
```

### Utility Functions

```typescript
import { getPayload, setFields, setDynamicFields, clear } from "buildkit-primevue";

// Extract form payload (respects hidden fields)
const payload = getPayload(states, fields);

// Populate form from API response
setFields(apiData, fields);

// Populate with dynamic field key override
setDynamicFields(apiData, fields, "customKey");

// Reset form to defaultValues
clear(form.value, fields);
```

---

## TypeScript Patterns

### Domain Types

```typescript
// types/Feature.ts
export interface Feature {
  id: number;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface FeatureCreatePayload {
  name: string;
  status: string;
}

export interface FeatureUpdatePayload extends Partial<FeatureCreatePayload> {
  id: number;
}
```

### API Service

```typescript
// services/FeatureAPI.ts
import axios from "axios";
import type { Feature, FeatureCreatePayload } from "../types/Feature";

const BASE = "/api/features";

export const FeatureAPI = {
  getAll: () => axios.get<Feature[]>(BASE),
  getById: (id: number) => axios.get<Feature>(`${BASE}/${id}`),
  create: (payload: FeatureCreatePayload) => axios.post<Feature>(BASE, payload),
  update: (id: number, payload: Partial<FeatureCreatePayload>) =>
    axios.put<Feature>(`${BASE}/${id}`, payload),
  delete: (id: number) => axios.delete(`${BASE}/${id}`),
};
```

### API Composable

```typescript
// composables/useFeatureAPI.ts
import { ref } from "vue";
import { FeatureAPI } from "../services/FeatureAPI";
import type { Feature } from "../types/Feature";

export function useFeatureAPI() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const load = async (id: number): Promise<Feature | null> => {
    loading.value = true;
    try {
      const { data } = await FeatureAPI.getById(id);
      return data;
    } catch (e: any) {
      error.value = e.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  const save = async (payload: any): Promise<boolean> => {
    loading.value = true;
    try {
      await FeatureAPI.create(payload);
      return true;
    } catch (e: any) {
      error.value = e.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  return { load, save, loading, error };
}
```

---

## Filter Pattern

```typescript
// types/FeatureFilter.ts
export interface FeatureFilter {
  name: string;
  status: string | null;
  page: number;
  limit: number;
}

// composables/useFeatureFilter.ts
import { reactive } from "vue";
import type { FeatureFilter } from "../types/FeatureFilter";

export function useFeatureFilter() {
  const filter = reactive<FeatureFilter>({
    name: "",
    status: null,
    page: 1,
    limit: 20,
  });

  const reset = () => {
    filter.name = "";
    filter.status = null;
    filter.page = 1;
  };

  const toQueryParams = () => ({
    ...(filter.name && { name: filter.name }),
    ...(filter.status && { status: filter.status }),
    page: filter.page,
    limit: filter.limit,
  });

  return { filter, reset, toQueryParams };
}
```

---

## Tailwind v4 Notes

- Use utility classes directly; no `tailwind.config.js` needed for basic usage
- CSS variables for design tokens: `--color-primary`, `--spacing-*`
- Prefer `@apply` in `<style>` only for repeated patterns
- PrimeVue components use their own CSS variables — customize via `preset` or `:pt` (pass-through)

---

## Anti-patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|---------|--------------|
| Axios calls inside `.vue` files | Use service files + composables |
| Field definitions inline in template | Use `useXxxFields.ts` composable |
| `v-if` for form field visibility | Use `showWhen`/`hideWhen` in field def |
| Types defined inside composables | Define in `types/` directory |
| One giant composable doing everything | Split by responsibility (SRP) |
| `any` without type assertion | Proper TypeScript interfaces |
| Repeating `getPayload` logic | Always use the built-in utility |
| Hardcoded strings in templates | Constants or i18n |

---

## Checklist for New Module

Before writing code, ensure the module has:

- [ ] `types/` — domain model, filter, store types
- [ ] `services/` — one file per API resource
- [ ] `composables/useXxxAPI.ts` — orchestrates service, exposes loading/error
- [ ] `composables/useXxxFields.ts` — FormKit field definitions
- [ ] `composables/useXxxFilter.ts` — filter state (if filterable list exists)
- [ ] `views/XxxModule.vue` — thin view, imports composables
- [ ] `router.ts` — route definitions
- [ ] All types are exported from `types/` not inlined
- [ ] No raw axios in `.vue` files
- [ ] All form utilities (`getPayload`, `setFields`, `clear`) used from buildkit-primevue

---

## Reference Files

- `references/formkit.md` — Full buildkit-primevue API (field schema, all `as` components, utility functions, locale, complete examples)