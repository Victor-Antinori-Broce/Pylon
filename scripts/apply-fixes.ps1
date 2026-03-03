# ═══════════════════════════════════════════════════════════════
# GremiusCMS — Apply Fixes Script
#
# Run AFTER stopping pnpm dev (Ctrl+C):
#   powershell -ExecutionPolicy Bypass -File scripts/apply-fixes.ps1
#
# Fixes:
#   1. queue.ts — prevent ECONNREFUSED crash loop when Redis is down
#   2. module-registry.ts — correct module categories (native/core/optional)
#   3. Redis eviction policy — noeviction in docker-compose.yml (already done)
# ═══════════════════════════════════════════════════════════════

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "`n🔧 GremiusCMS — Applying fixes...`n" -ForegroundColor Cyan

# 1. Fix queue.ts
$queueSrc = Join-Path $root "apps\api\src\lib\queue.fixed.ts"
$queueDst = Join-Path $root "apps\api\src\lib\queue.ts"

if (Test-Path $queueSrc) {
    Copy-Item $queueSrc $queueDst -Force
    Remove-Item $queueSrc -Force
    Write-Host "  ✅ queue.ts — Redis fail-safe fix applied" -ForegroundColor Green
} else {
    Write-Host "  ⏭️  queue.fixed.ts not found (already applied?)" -ForegroundColor Yellow
}

# 2. Fix module-registry.ts
$registrySrc = Join-Path $root "apps\api\src\services\module-registry.fixed.ts"
$registryDst = Join-Path $root "apps\api\src\services\module-registry.ts"

if (Test-Path $registrySrc) {
    Copy-Item $registrySrc $registryDst -Force
    Remove-Item $registrySrc -Force
    Write-Host "  ✅ module-registry.ts — categories fix applied" -ForegroundColor Green
} else {
    Write-Host "  ⏭️  module-registry.fixed.ts not found (already applied?)" -ForegroundColor Yellow
}

Write-Host "`n🎉 All fixes applied! Run 'pnpm dev' to start.`n" -ForegroundColor Cyan
