# Kitsuden en tu máquina Windows, con un solo comando. Solo necesita Docker.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1             crea .env, compila, arranca e imprime las URLs
#   powershell -ExecutionPolicy Bypass -File install.ps1 -DryRun     solo crea .env y dice qué usaría
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Rebuild    vuelve a compilar (tras actualizar el código)
#
# Para un servidor con dominio y TLS: scripts/deploy.sh (docs/install/server.md).
#
# No pisa nada ajeno. Si en esta máquina ya hay otra instalación, elige otro
# prefijo (kitsuden2…) y otros puertos: docker-compose.yml nombra sus volúmenes
# con KITSUDEN_INSTANCE, así que sin esto compartiría la base con la primera.
# Mantener en paralelo con install.sh.

param([switch]$DryRun, [switch]$Rebuild)

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

$Marca = '# Created by install.sh'

function Morir([string]$Texto) {
  [Console]::Error.WriteLine("`nInstall stopped: $Texto")
  exit 1
}

function Correcto([scriptblock]$Comando) {
  & $Comando *> $null
  return $LASTEXITCODE -eq 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Morir 'Docker is not installed. Get it at https://docs.docker.com/get-docker/ and run this again.'
}
if (-not (Correcto { docker compose version })) { Morir "this needs the Docker Compose v2 plugin ('docker compose')." }
if (-not (Correcto { docker info })) { Morir 'Docker is installed but not running. Start it and run this again.' }

# Un checkout con override es un despliegue a medida: esto no es para él.
if (Test-Path docker-compose.override.yml) {
  Morir 'this folder has a docker-compose.override.yml, so it is a custom deployment. Use your own deploy process.'
}

function Secreto {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Valor-Env([string]$Clave) {
  $linea = Get-Content .env | Where-Object { $_ -like "$Clave=*" } | Select-Object -Last 1
  if ($linea) { return $linea.Substring($Clave.Length + 1).Trim() }
  return ''
}

function Puerto-Ocupado([int]$Puerto) {
  $cliente = New-Object Net.Sockets.TcpClient
  try {
    $intento = $cliente.BeginConnect('127.0.0.1', $Puerto, $null, $null)
    return ($intento.AsyncWaitHandle.WaitOne(300) -and $cliente.Connected)
  } catch { return $false } finally { $cliente.Close() }
}

function Puerto-Libre([int]$Desde) {
  $p = $Desde
  while (Puerto-Ocupado $p) { $p++ }
  return $p
}

function Instancia-Ocupada([string]$Nombre) {
  $contenedores = docker ps -a --format '{{.Names}}'
  if ($contenedores -contains "${Nombre}_db_prod") { return $true }
  return (Correcto { docker volume inspect "${Nombre}_postgres_prod" })
}

function Crear-Env {
  $instancia = 'kitsuden'
  $n = 2
  while (Instancia-Ocupada $instancia) { $instancia = "kitsuden$n"; $n++ }

  $api = Puerto-Libre 3000
  $admin = Puerto-Libre 3001
  if ($admin -eq $api) { $admin = Puerto-Libre ($api + 1) }
  $db = Puerto-Libre 5432
  $valkey = Puerto-Libre 6379

  $salida = New-Object Collections.Generic.List[string]
  $salida.Add("$Marca. Secrets are in here: never commit it, and keep a copy.")
  foreach ($linea in Get-Content -Encoding UTF8 .env.production.example) {
    if ($linea -like '*=<openssl rand -hex 32>') { $linea = $linea.Substring(0, $linea.IndexOf('=') + 1) + (Secreto) }
    elseif ($linea -match '^(SITE_DOMAIN|ACME_EMAIL|MAIL_FROM)=') { $linea = $linea.Substring(0, $linea.IndexOf('=') + 1) }
    elseif ($linea -like 'COMPOSE_PROJECT_NAME=*') { $linea = "COMPOSE_PROJECT_NAME=$instancia" }
    $salida.Add($linea)
  }
  $salida.Add('')
  $salida.Add('# --- This machine (install.ps1) ---')
  $salida.Add("KITSUDEN_INSTANCE=$instancia")
  $salida.Add("KITSUDEN_API_IMAGE=$instancia/api:latest")
  $salida.Add("KITSUDEN_ADMIN_IMAGE=$instancia/admin:latest")
  $salida.Add("API_PORT=$api")
  $salida.Add("ADMIN_PORT=$admin")
  $salida.Add("DB_PORT=$db")
  $salida.Add("VALKEY_PORT=$valkey")
  $salida.Add("BETTER_AUTH_URL=http://localhost:$api")
  $salida.Add("ADMIN_URL=http://localhost:$admin")
  $salida.Add("APP_URL=http://localhost:$admin")
  $salida.Add("ALLOWED_ORIGINS=http://localhost:$admin,http://127.0.0.1:$admin,http://localhost:$api,http://127.0.0.1:$api")

  if ($salida | Where-Object { $_ -match '^[A-Z_]+=<' }) {
    Morir '.env.production.example has a placeholder this script does not know.'
  }
  # Sin BOM y con LF: docker compose leería el BOM como parte de la primera clave.
  [IO.File]::WriteAllText((Join-Path $PWD '.env'), (($salida -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
}

if (Test-Path .env) {
  # Un .env que no es nuestro puede ser una instalación real: no se toca.
  if (-not (Select-String -Path .env -SimpleMatch $Marca -Quiet)) {
    Morir 'this folder already has a .env that this script did not create. Use scripts/deploy.sh, or move that file away.'
  }
  Write-Host 'Using the existing .env.'
} else {
  if (-not (Test-Path .env.production.example)) { Morir '.env.production.example is missing. Run this from a full copy of the repository.' }
  Crear-Env
  Write-Host 'Created .env with new random secrets.'
}

$Instancia = Valor-Env 'KITSUDEN_INSTANCE'
$ApiPort = Valor-Env 'API_PORT'
$AdminPort = Valor-Env 'ADMIN_PORT'
if ($Instancia -ne 'kitsuden') {
  Write-Host "Another Kitsuden uses the default names on this machine, so this one is '$Instancia'. They share nothing."
}

if ($DryRun) {
  Write-Host "Dry run: would start '$Instancia' with the API on port $ApiPort and the panel on port $AdminPort."
  exit 0
}

# De una en una: compilarlas en paralelo llegó a tumbar Docker Desktop.
function Imagen-Falta([string]$Imagen) { return -not (Correcto { docker image inspect $Imagen }) }

if ($Rebuild -or (Imagen-Falta (Valor-Env 'KITSUDEN_API_IMAGE'))) {
  Write-Host 'Building the API image. The first time takes 5 to 15 minutes...'
  docker compose -f docker-compose.yml build kitsuden_api
  if ($LASTEXITCODE -ne 0) { Morir 'the API image did not build.' }
}
if ($Rebuild -or (Imagen-Falta (Valor-Env 'KITSUDEN_ADMIN_IMAGE'))) {
  Write-Host 'Building the panel image...'
  docker compose -f docker-compose.yml build kitsuden_admin
  if ($LASTEXITCODE -ne 0) { Morir 'the panel image did not build.' }
}

# Compilar tarda: los puertos elegidos pueden haberse ocupado mientras tanto, o
# desde el último arranque. Los de base y Valkey no los usa nadie a mano, así
# que se mueven solos; los de API y panel están en las URLs y se avisa.
function Poner-Env([string]$Clave, [string]$Valor) {
  $lineas = Get-Content .env | ForEach-Object { if ($_ -like "$Clave=*") { "$Clave=$Valor" } else { $_ } }
  [IO.File]::WriteAllText((Join-Path $PWD '.env'), (($lineas -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
}
if (-not (docker compose -f docker-compose.yml ps -q --status running kitsuden_api 2>$null)) {
  foreach ($clave in 'DB_PORT', 'VALKEY_PORT') {
    $actual = [int](Valor-Env $clave)
    if (Puerto-Ocupado $actual) {
      $nuevo = Puerto-Libre $actual
      Write-Host "Port $actual is now in use, so $clave moves to $nuevo."
      Poner-Env $clave $nuevo
    }
  }
  foreach ($puerto in $ApiPort, $AdminPort) {
    if (Puerto-Ocupado ([int]$puerto)) { Morir "port $puerto is in use by another program. Close it and run this again." }
  }
}

Write-Host 'Starting...'
docker compose -f docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) { Morir "the containers did not start. Docker's reason is just above." }

function Responde([string]$Url) {
  try {
    return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $Url).StatusCode -eq 200
  } catch { return $false }
}

$listo = $false
for ($i = 0; $i -lt 90; $i++) {
  if ((Responde "http://127.0.0.1:$AdminPort/") -and (Responde "http://127.0.0.1:$ApiPort/live")) { $listo = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $listo) { Morir 'it did not become ready in 3 minutes. See: docker compose -f docker-compose.yml logs kitsuden_api' }

Write-Host @"

Kitsuden is running.

  1. Open the panel and create your administrator:
       http://localhost:$AdminPort
     Do this first: until an administrator exists, whoever gets there first
     becomes one. Everything listens on this machine only.

  2. In the panel, go to Agents, create one and copy its key.

  3. Point your MCP client at:
       http://localhost:$ApiPort/api/mcp

  API: http://localhost:$ApiPort    Guide for agents: http://localhost:$ApiPort/llms.txt

  Stop:    docker compose -f docker-compose.yml stop
  Start:   powershell -ExecutionPolicy Bypass -File install.ps1
  Logs:    docker compose -f docker-compose.yml logs -f kitsuden_api
  Delete everything, data included:
           docker compose -f docker-compose.yml down -v
"@
