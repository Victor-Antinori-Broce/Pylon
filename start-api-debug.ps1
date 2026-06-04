$env:PORT="3001"
$env:NODE_ENV="development"
cd "C:\Users\vantinori\Documents\github\cms\apps\api"
bun run src/index.ts > "C:\Users\vantinori\Documents\github\cms\api-debug.log" 2>&1
