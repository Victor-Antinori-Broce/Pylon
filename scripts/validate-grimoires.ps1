#!/usr/bin/env pwsh
# Validación completa del sistema Grimoire

$errors = @()
$warnings = @()
$ok = @()

Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VALIDACIÓN COMPLETA DEL SISTEMA GRIMOIRE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar estructura de directorios
Write-Host "1. ESTRUCTURA DE DIRECTORIOS" -ForegroundColor Yellow
$grimoires = @(
    @{Name="grimoire-blocks"; Core=$true},
    @{Name="grimoire-blog"; Core=$true},
    @{Name="grimoire-formulas"; Core=$true},
    @{Name="grimoire-academy-lms"; Core=$false},
    @{Name="grimoire-booking"; Core=$false},
    @{Name="grimoire-directory"; Core=$false},
    @{Name="grimoire-dms"; Core=$false},
    @{Name="ai-memories"; Core=$false},
    @{Name="grimoire-crm"; Core=$false},
    @{Name="grimoire-games"; Core=$false},
    @{Name="grimoire-esports"; Core=$false},
    @{Name="grimoire-streamers"; Core=$false}
)

foreach ($g in $grimoires) {
    $path = "packages/grimoires/$($g.Name)"
    if (Test-Path $path -PathType Container) {
        $ok += "✅ $($g.Name)"
        Write-Host "   ✅ $($g.Name)" -ForegroundColor Green
    } else {
        $errors += "❌ $($g.Name) - NO EXISTE"
        Write-Host "   ❌ $($g.Name) - NO EXISTE" -ForegroundColor Red
    }
}

# 2. Verificar archivos esenciales de Blocks
Write-Host ""
Write-Host "2. ARCHIVOS ESENCIALES - BLOCKS" -ForegroundColor Yellow
$blocksFiles = @(
    "packages/grimoires/grimoire-blocks/blocks.routes.ts",
    "packages/grimoires/grimoire-blocks/blocks.schema.ts",
    "packages/grimoires/grimoire-blocks/index.ts",
    "packages/grimoires/grimoire-blocks/grimoire.json"
)

foreach ($file in $blocksFiles) {
    if (Test-Path $file -PathType Leaf) {
        $ok += "✅ $file"
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        $errors += "❌ $file - FALTA"
        Write-Host "   ❌ $file - FALTA" -ForegroundColor Red
    }
}

# 3. Verificar creación de router con DI
Write-Host ""
Write-Host "3. DEPENDENCY INJECTION - FACTORY FUNCTIONS" -ForegroundColor Yellow
$diChecks = @(
    @{File="packages/grimoires/grimoire-blocks/blocks.routes.ts"; Pattern="createBlocksRouter"},
    @{File="packages/grimoires/grimoire-blocks/index.ts"; Pattern="createBlocksRouter"},
    @{File="packages/grimoires/grimoire-academy-lms/src/index.ts"; Pattern="createAcademyRouter"},
    @{File="packages/grimoires/grimoire-academy-lms/academy-lms.routes.ts"; Pattern="createAcademyLMSRoutes"},
    @{File="packages/grimoires/grimoire-blog/src/routes.ts"; Pattern="createBlogRouter"},
    @{File="packages/grimoires/grimoire-blog/src/index.ts"; Pattern="createRouter"}
)

foreach ($check in $diChecks) {
    if (Test-Path $check.File -PathType Leaf) {
        $content = Get-Content $check.File -Raw
        if ($content -match $check.Pattern) {
            $ok += "✅ $($check.File) tiene $($check.Pattern)"
            Write-Host "   ✅ $($check.Pattern) en $($check.File)" -ForegroundColor Green
        } else {
            $errors += "❌ $($check.File) NO tiene $($check.Pattern)"
            Write-Host "   ❌ $($check.Pattern) NO ENCONTRADO en $($check.File)" -ForegroundColor Red
        }
    }
}

# 4. Verificar vistas admin
Write-Host ""
Write-Host "4. VISTAS ADMIN" -ForegroundColor Yellow
$adminViews = @(
    @{Path="packages/admin/src/views/blocks/BlocksView.svelte"; Required=$true},
    @{Path="packages/admin/src/views/academy/AcademyView.svelte"; Required=$true},
    @{Path="packages/admin/src/views/content/PostsView.svelte"; Required=$true},
    @{Path="packages/admin/src/views/games/GamesView.svelte"; Required=$true},
    @{Path="packages/admin/src/routes/blocks/+page.svelte"; Required=$true},
    @{Path="packages/admin/src/routes/academy/+page.svelte"; Required=$true},
    @{Path="packages/admin/src/routes/posts/+page.svelte"; Required=$true}
)

foreach ($view in $adminViews) {
    if (Test-Path $view.Path -PathType Leaf) {
        $ok += "✅ $($view.Path)"
        Write-Host "   ✅ $($view.Path)" -ForegroundColor Green
    } elseif ($view.Required) {
        $errors += "❌ $($view.Path) - FALTA"
        Write-Host "   ❌ $($view.Path) - FALTA" -ForegroundColor Red
    } else {
        $warnings += "⚠️ $($view.Path) - No requerido pero útil"
        Write-Host "   ⚠️ $($view.Path) - No requerido" -ForegroundColor Yellow
    }
}

# 5. Verificar configuración
Write-Host ""
Write-Host "5. CONFIGURACIÓN" -ForegroundColor Yellow
$configFiles = @(
    @{Path="apps/api/gremius.config.ts"; Required=$true},
    @{Path="apps/api/src/services/module-registry.ts"; Required=$true},
    @{Path="packages/admin/src/lib/grimoire-loader.ts"; Required=$true},
    @{Path="apps/api/src/services/admin-registry.ts"; Required=$true}
)

foreach ($cfg in $configFiles) {
    if (Test-Path $cfg.Path -PathType Leaf) {
        $ok += "✅ $($cfg.Path)"
        Write-Host "   ✅ $($cfg.Path)" -ForegroundColor Green
    } else {
        $errors += "❌ $($cfg.Path) - FALTA"
        Write-Host "   ❌ $($cfg.Path) - FALTA" -ForegroundColor Red
    }
}

# 6. Verificar nomenclatura consistente en config
Write-Host ""
Write-Host "6. NOMENCLATURA EN CONFIG" -ForegroundColor Yellow
$configContent = Get-Content "apps/api/gremius.config.ts" -Raw
$expectedGrimoires = @(
    "grimoire-blocks",
    "grimoire-blog", 
    "grimoire-formulas",
    "grimoire-academy-lms",
    "ai-memories"
)

foreach ($g in $expectedGrimoires) {
    if ($configContent -match [regex]::Escape($g)) {
        $ok += "✅ $g en gremius.config.ts"
        Write-Host "   ✅ $g" -ForegroundColor Green
    } else {
        $errors += "❌ $g NO ENCONTRADO en gremius.config.ts"
        Write-Host "   ❌ $g NO ENCONTRADO" -ForegroundColor Red
    }
}

# 7. Verificar rutas de API
Write-Host ""
Write-Host "7. MOUNT POINTS DE API" -ForegroundColor Yellow
$mountPoints = @(
    @{Grimoire="grimoire-blog"; Path="/api/blog"; File="packages/grimoires/grimoire-blog/grimoire.json"},
    @{Grimoire="grimoire-blocks"; Path="/api/page-builder"; File="packages/grimoires/grimoire-blocks/grimoire.json"},
    @{Grimoire="grimoire-academy-lms"; Path="/api/academy"; File="packages/grimoires/grimoire-academy-lms/grimoire.json"}
)

foreach ($mp in $mountPoints) {
    if (Test-Path $mp.File -PathType Leaf) {
        $content = Get-Content $mp.File -Raw | ConvertFrom-Json
        if ($content.mount.path -eq $mp.Path) {
            $ok += "✅ $($mp.Grimoire) mount: $($mp.Path)"
            Write-Host "   ✅ $($mp.Grimoire) → $($mp.Path)" -ForegroundColor Green
        } else {
            $errors += "❌ $($mp.Grimoire) mount incorrecto"
            Write-Host "   ❌ $($mp.Grimoire) mount incorrecto (esperado: $($mp.Path))" -ForegroundColor Red
        }
    }
}

# 8. Verificar schema exports
Write-Host ""
Write-Host "8. SCHEMA EXPORTS" -ForegroundColor Yellow
$schemaFile = "apps/api/src/db/schema-all.ts"
if (Test-Path $schemaFile -PathType Leaf) {
    $schemaContent = Get-Content $schemaFile -Raw
    $expectedSchemas = @(
        "grimoire-academy-lms/academy-lms.schema",
        "ai-memories/schema"
    )
    
    foreach ($schema in $expectedSchemas) {
        if ($schemaContent -match [regex]::Escape($schema)) {
            $ok += "✅ Schema: $schema"
            Write-Host "   ✅ $schema" -ForegroundColor Green
        } else {
            $errors += "❌ Schema NO exportado: $schema"
            Write-Host "   ❌ $schema NO EXPORTADO" -ForegroundColor Red
        }
    }
}

# 9. Verificar sidebar
Write-Host ""
Write-Host "9. SIDEBAR NAVIGATION" -ForegroundColor Yellow
$sidebarFile = "packages/admin/src/lib/components/layout/SidebarLayout.svelte"
if (Test-Path $sidebarFile -PathType Leaf) {
    $sidebarContent = Get-Content $sidebarFile -Raw
    $expectedRoutes = @(
        @{Path="/blocks"; ModuleKey="grimoire-blocks"},
        @{Path="/posts"; ModuleKey="blog"},
        @{Path="/academy"; ModuleKey="academy"}
    )
    
    foreach ($route in $expectedRoutes) {
        if ($sidebarContent -match [regex]::Escape($route.Path)) {
            $ok += "✅ Sidebar: $($route.Path)"
            Write-Host "   ✅ $($route.Path)" -ForegroundColor Green
        } else {
            $errors += "❌ Sidebar NO tiene: $($route.Path)"
            Write-Host "   ❌ $($route.Path) NO ENCONTRADO" -ForegroundColor Red
        }
    }
}

# 10. Verificar API Client
Write-Host ""
Write-Host "10. API CLIENT METHODS" -ForegroundColor Yellow
$apiFile = "packages/admin/src/lib/api.ts"
if (Test-Path $apiFile -PathType Leaf) {
    $apiContent = Get-Content $apiFile -Raw
    $expectedMethods = @(
        "getPages",
        "createPage",
        "getAcademyCursos",
        "createAcademyCurso",
        "getPosts",
        "createPost"
    )
    
    foreach ($method in $expectedMethods) {
        if ($apiContent -match [regex]::Escape($method)) {
            $ok += "✅ API Method: $method"
            Write-Host "   ✅ $method" -ForegroundColor Green
        } else {
            $warnings += "⚠️ API Method no encontrado: $method"
            Write-Host "   ⚠️ $method NO ENCONTRADO" -ForegroundColor Yellow
        }
    }
}

# RESUMEN
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ OK: $($ok.Count)" -ForegroundColor Green
Write-Host "⚠️  ADVERTENCIAS: $($warnings.Count)" -ForegroundColor Yellow
Write-Host "❌ ERRORES: $($errors.Count)" -ForegroundColor Red
Write-Host ""

if ($errors.Count -eq 0) {
    Write-Host "🎉 TODAS LAS VALIDACIONES PASARON" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  HAY ERRORES QUE CORREGIR" -ForegroundColor Red
    Write-Host ""
    Write-Host "ERRORES:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    exit 1
}
