# ===================================================================
# Delete ALL compiled artifacts from admin and api source directories
# Run this BEFORE pnpm dev
# ===================================================================

Write-Host "Cleaning compiled artifacts from packages/admin/src..." -ForegroundColor Cyan

# Admin: .svelte.js, .svelte.js.map, .svelte.d.ts, .svelte.d.ts.map
Get-ChildItem -Path "apps\admin\src" -Recurse -Include "*.svelte.js","*.svelte.js.map","*.svelte.d.ts","*.svelte.d.ts.map" | 
    Where-Object { $_.FullName -notmatch "node_modules|\.svelte-kit|build" } |
    ForEach-Object { 
        Write-Host "  DEL $_" -ForegroundColor DarkGray
        Remove-Item $_ -Force 
    }

# Admin: compiled .js/.d.ts in routes (cause "Multiple layout module" crash)
Get-ChildItem -Path "apps\admin\src" -Recurse -Include "*.js","*.js.map","*.d.ts","*.d.ts.map" | 
    Where-Object { $_.FullName -notmatch "node_modules|\.svelte-kit|build" } |
    Where-Object { $_.Name -notmatch "\.svelte\." } |
    ForEach-Object { 
        Write-Host "  DEL $_" -ForegroundColor DarkGray
        Remove-Item $_ -Force 
    }

# Admin: test compiled artifacts
Get-ChildItem -Path "apps\admin\src" -Recurse -Include "*.test.js","*.test.js.map","*.test.d.ts","*.test.d.ts.map" | 
    Where-Object { $_.FullName -notmatch "node_modules|\.svelte-kit|build" } |
    ForEach-Object { 
        Write-Host "  DEL $_" -ForegroundColor DarkGray
        Remove-Item $_ -Force 
    }

Write-Host ""
Write-Host "Cleaning compiled artifacts from apps/api/src..." -ForegroundColor Cyan

# API: compiled .js/.d.ts in src/
Get-ChildItem -Path "apps\api\src" -Recurse -Include "*.js","*.js.map","*.d.ts","*.d.ts.map" | 
    Where-Object { $_.FullName -notmatch "node_modules" } |
    ForEach-Object { 
        Write-Host "  DEL $_" -ForegroundColor DarkGray
        Remove-Item $_ -Force 
    }

# API: root-level compiled files (test-api.js, etc)
Get-ChildItem -Path "apps\api" -Include "*.js","*.js.map","*.d.ts","*.d.ts.map" |
    Where-Object { $_.FullName -notmatch "node_modules|dist|drizzle.config" } |
    ForEach-Object { 
        Write-Host "  DEL $_" -ForegroundColor DarkGray
        Remove-Item $_ -Force 
    }

Write-Host ""
Write-Host "Cleaning .svelte-kit cache..." -ForegroundColor Cyan
if (Test-Path "apps\admin\.svelte-kit") {
    Remove-Item -Recurse -Force "apps\admin\.svelte-kit"
    Write-Host "  DEL apps\admin\.svelte-kit" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done! Now run: pnpm dev" -ForegroundColor Green
