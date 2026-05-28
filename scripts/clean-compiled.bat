@echo off
REM ===================================================================
REM Clean compiled artifacts from admin source directories
REM These .js/.d.ts/.js.map/.d.ts.map files conflict with SvelteKit
REM ===================================================================

echo Cleaning compiled artifacts from apps\admin\src...

REM Routes - these cause "Multiple layout module files" crash
del /q "apps\admin\src\routes\+layout.js" 2>nul
del /q "apps\admin\src\routes\+layout.js.map" 2>nul
del /q "apps\admin\src\routes\+layout.d.ts" 2>nul
del /q "apps\admin\src\routes\+layout.d.ts.map" 2>nul
del /q "apps\admin\src\routes\webhooks\+page.js" 2>nul
del /q "apps\admin\src\routes\webhooks\+page.js.map" 2>nul
del /q "apps\admin\src\routes\webhooks\+page.d.ts" 2>nul
del /q "apps\admin\src\routes\webhooks\+page.d.ts.map" 2>nul
del /q "apps\admin\src\routes\workers\+page.js" 2>nul
del /q "apps\admin\src\routes\workers\+page.js.map" 2>nul
del /q "apps\admin\src\routes\workers\+page.d.ts" 2>nul
del /q "apps\admin\src\routes\workers\+page.d.ts.map" 2>nul

REM Lib compiled artifacts
for /r "apps\admin\src\lib" %%f in (*.js *.js.map *.d.ts *.d.ts.map) do (
    REM Skip .svelte.ts files that have been compiled
    echo   Deleting: %%f
    del /q "%%f" 2>nul
)

REM API compiled artifacts (also cause issues)
for /r "apps\api\src" %%f in (*.js *.js.map *.d.ts *.d.ts.map) do (
    echo   Deleting: %%f
    del /q "%%f" 2>nul
)

REM API root compiled files
del /q "apps\api\*.js" 2>nul
del /q "apps\api\*.js.map" 2>nul
del /q "apps\api\*.d.ts" 2>nul
del /q "apps\api\*.d.ts.map" 2>nul

echo.
echo Done! Now run: pnpm dev
