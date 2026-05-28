# GremiusCMS - Code Quality Standards

## 🎯 Quality Gates

Este proyecto mantiene estándares estrictos de calidad de código mediante herramientas automatizadas.

### Pre-commit Hooks

Todos los commits pasan por verificación automática:
- ✅ ESLint fix
- ✅ Prettier format
- ✅ TypeScript type check

### Scripts Disponibles

```bash
# Linting
pnpm run lint          # Verificar código
pnpm run lint:fix      # Corregir automáticamente

# Formatting
pnpm run format        # Formatear todo
pnpm run format:check  # Verificar formato

# Type checking
pnpm run typecheck     # Verificar tipos

# Quality Assurance (todo en uno)
pnpm run qa            # lint + format:check + typecheck
```

## 📋 ESLint Configuration

### Reglas Principales

| Regla | Nivel | Descripción |
|-------|-------|-------------|
| `@typescript-eslint/no-unused-vars` | error | Variables no usadas |
| `@typescript-eslint/no-explicit-any` | warn | Evitar `any` |
| `import/order` | error | Orden de imports |
| `import/no-cycle` | error | Prevenir ciclos |
| `no-console` | warn | Solo warn/error/info |
| `eqeqeq` | error | Igualdad estricta |

### Ignored Patterns

```
node_modules/
dist/
.svelte-kit/
drizzle/
*.config.*
_legacy_*
```

## 🎨 Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

Cada PR y push a `main`/`develop` ejecuta:

1. **Lint & Format Check** - Verifica estilo de código
2. **Type Check** - Verifica tipos TypeScript
3. **API Tests** - Ejecuta tests de backend
4. **Admin Tests** - Ejecuta tests de frontend
5. **Docker Build** - Verifica que las imágenes construyen

### Status Checks Requeridos

- [ ] ESLint passing
- [ ] Prettier format check
- [ ] TypeScript type check
- [ ] Tests passing
- [ ] Docker build

## 🚀 Mejoras Recientes

### 2026-03-06

- ✅ Configurado ESLint + Prettier
- ✅ Agregado lint-staged + husky
- ✅ Creado CI/CD con GitHub Actions
- ✅ Limpiado código legacy
- ✅ TypeScript 0 errores (backend + frontend)

## 📊 Métricas Actuales

```
TypeScript Errors:     0 ✅
ESLint Warnings:       ~20 (en progreso)
Code Coverage:         ~15% (meta: 60%)
Legacy Files:          0 ✅
Pre-commit Hooks:      ✅ Activo
CI/CD Pipeline:        ✅ Configurado
```

## 🔒 Seguridad

Herramientas de seguridad integradas:
- Dependabot (GitHub)
- `npm audit` en CI
- Secret scanning

## 📝 Guía de Contribución

1. **Antes de commitear:**
   ```bash
   pnpm run qa
   ```

2. **El hook pre-commit hará:**
   - Formatear archivos modificados
   - Corregir errores de ESLint auto-fixables
   - Bloquear commit si hay errores

3. **Si el CI falla:**
   - Revisar logs en GitHub Actions
   - Corregir issues localmente
   - Push nuevamente

## 🆘 Troubleshooting

### ESLint no encuentra imports

```bash
# Regenerar tsconfig paths
pnpm install
```

### Prettier falla en CI pero no local

```bash
# Normalizar line endings
git config core.autocrlf false
pnpm run format
```

### Type check tarda mucho

```bash
# Limpiar caché de TypeScript
rm -rf node_modules/.cache
cd apps/api && npx tsc --build --force
```
