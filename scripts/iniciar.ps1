# Levanta MACHOBOL en este equipo: API, servidor de acciones de Rasa, Rasa y panel web, cada uno en su ventana.
# Uso: doble clic en iniciar.cmd (raíz del proyecto), o:  .\iniciar.cmd -Recarga
#   -Recarga  la API se reinicia sola al editar el backend (node --watch). Cómodo para programar, pero cada
#             reinicio corta las respuestas del bot que estén en curso: para probar el chat, mejor sin él.
# Para detener todo, cierra las cuatro ventanas.
param([switch]$Recarga)

$raiz = Split-Path -Parent $PSScriptRoot

function Error-Y-Salir($mensaje) {
  Write-Host "`n$mensaje" -ForegroundColor Red
  Read-Host 'Presiona Enter para salir'
  exit 1
}

function Puerto-Ocupado($puerto) {
  [bool](Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
}

# Rasa y las acciones escuchan solo en 127.0.0.1: se comprueban por esa dirección y no por "localhost", que Windows
# intenta primero por IPv6 (::1) y tarda unos 2 s en descartar.
function Responde($url, $texto) {
  try { (Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 5).Content -match $texto } catch { $false }
}

Write-Host "MACHOBOL - iniciando desde $raiz`n" -ForegroundColor Cyan

# 1. Requisitos
if (-not (Test-Path "$raiz\backend\.env")) { Error-Y-Salir 'Falta backend\.env (cópialo de backend\.env.example y complétalo).' }
$urlBase = (Get-Content "$raiz\backend\.env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', ''
if (-not $urlBase) { Error-Y-Salir 'Falta DATABASE_URL en backend\.env.' }
if ($urlBase -match '\[YOUR-PASSWORD\]') {
  Error-Y-Salir 'En backend\.env, la línea DATABASE_URL todavía dice [YOUR-PASSWORD]: reemplázalo por la contraseña de la base de Supabase.'
}
if ($urlBase -match '@(localhost|127\.0\.0\.1|\[::1\])[:/]') {
  # Base local: el servicio de PostgreSQL de Windows tiene que estar corriendo.
  $postgres = Get-Service 'postgresql-x64-*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $postgres) { Error-Y-Salir 'No encuentro el servicio de PostgreSQL (postgresql-x64-*).' }
  if ($postgres.Status -ne 'Running') {
    Error-Y-Salir "PostgreSQL ($($postgres.Name)) está detenido. Inícialo desde 'Servicios' de Windows, o en una terminal de administrador: Start-Service $($postgres.Name)"
  }
  Write-Host 'Base de datos: PostgreSQL local' -ForegroundColor DarkGray
} else {
  # Base remota (Supabase): la API avisará si no puede conectarse; aquí solo se comprueba el certificado.
  if ($urlBase -match 'sslrootcert=([^&]+)' -and -not (Test-Path (Join-Path "$raiz\backend" $Matches[1]))) {
    Error-Y-Salir "Falta el certificado de la base: backend\$($Matches[1])"
  }
  Write-Host ('Base de datos: remota (' + ($urlBase -replace '^.*@([^:/]+).*$', '$1') + ')') -ForegroundColor DarkGray
}
if (-not (Test-Path "$raiz\backend\node_modules")) { Error-Y-Salir 'Faltan las dependencias del backend: en backend\ ejecuta npm install.' }
if (-not (Test-Path "$raiz\frontend\node_modules")) { Error-Y-Salir 'Faltan las dependencias del panel: en frontend\ ejecuta npm install.' }
if (-not (Test-Path "$raiz\rasa_bot\.venv\Scripts\rasa.exe")) { Error-Y-Salir 'Falta el entorno de Rasa: ver rasa_bot\README.md (Python 3.10 y .venv).' }
if (-not (Get-ChildItem "$raiz\rasa_bot\models\*.tar.gz" -ErrorAction SilentlyContinue)) {
  Error-Y-Salir 'No hay un modelo de Rasa entrenado: en rasa_bot\ ejecuta .venv\Scripts\rasa train'
}

# 2. Servicios (cada uno en su ventana; si su puerto ya está ocupado, se asume que ya está corriendo)

# Cada ventana desactiva la "edición rápida" de la consola: con ella activa, un clic dentro de la ventana la pone en
# modo "Seleccionar" y congela al servicio (no puede escribir su log) hasta presionar Esc. Rasa congelado = bot mudo.
# Para copiar texto de una ventana: clic derecho en la barra de título > Editar > Marcar.
$sinEdicionRapida = @'
Add-Type -Namespace Machobol -Name Consola -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m); [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);'
$entrada = [Machobol.Consola]::GetStdHandle(-10); $modo = 0
if ([Machobol.Consola]::GetConsoleMode($entrada, [ref]$modo)) { [void][Machobol.Consola]::SetConsoleMode($entrada, ($modo -band (-bnot 0x40)) -bor 0x80) }
'@

$entornoPython = "`$env:RASA_TELEMETRY_ENABLED='false'; `$env:TF_CPP_MIN_LOG_LEVEL='2'; `$env:PYTHONWARNINGS='ignore'; `$env:SQLALCHEMY_SILENCE_UBER_WARNING='1'"
$servicios = @(
  @{ nombre = 'API'; puerto = 4000; carpeta = 'backend'; comando = $(if ($Recarga) { 'npm run dev' } else { 'npm start' }); salud = 'http://localhost:4000/api/health'; texto = '"ok"' },
  @{ nombre = 'Acciones Rasa'; puerto = 5055; carpeta = 'rasa_bot'; comando = "$entornoPython; .venv\Scripts\rasa.exe run actions --port 5055"; salud = 'http://127.0.0.1:5055/health'; texto = 'ok' },
  @{ nombre = 'Rasa'; puerto = 5005; carpeta = 'rasa_bot'; comando = "$entornoPython; .venv\Scripts\rasa.exe run --interface 127.0.0.1 --port 5005"; salud = 'http://127.0.0.1:5005/'; texto = 'Hello' },
  @{ nombre = 'Panel web'; puerto = 5173; carpeta = 'frontend'; comando = 'npm run dev'; salud = 'http://localhost:5173/'; texto = 'html' }
)

foreach ($s in $servicios) {
  if (Puerto-Ocupado $s.puerto) {
    Write-Host ("  {0,-14} ya está corriendo (puerto {1})" -f $s.nombre, $s.puerto) -ForegroundColor Yellow
    continue
  }
  $script = "`$Host.UI.RawUI.WindowTitle = 'MACHOBOL - $($s.nombre) ($($s.puerto))'; $sinEdicionRapida`nSet-Location '$raiz\$($s.carpeta)'; $($s.comando)"
  $codificado = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  Start-Process powershell -ArgumentList "-NoExit -NoProfile -EncodedCommand $codificado"
  Write-Host ("  {0,-14} abriendo ventana (puerto {1})" -f $s.nombre, $s.puerto)
}

# 3. Esperar a que todos respondan (Rasa tarda en cargar el modelo: hasta un par de minutos)
Write-Host "`nEsperando a que todo responda" -NoNewline
$limite = (Get-Date).AddMinutes(4)
do {
  Start-Sleep -Seconds 3
  Write-Host '.' -NoNewline
  $pendientes = $servicios | Where-Object { -not (Responde $_.salud $_.texto) }
} while ($pendientes -and (Get-Date) -lt $limite)

if ($pendientes) {
  Error-Y-Salir "No respondió: $(($pendientes | ForEach-Object { $_.nombre }) -join ', '). Revisa su ventana para ver el error."
}

Write-Host "`n`nTodo listo:" -ForegroundColor Green
Write-Host '  Panel web .............. http://localhost:5173'
Write-Host '  API .................... http://localhost:4000/api/health'
Write-Host '  Chat de prueba ......... en una terminal: cd backend  y luego  npm run whatsapp:simular'
Write-Host "`nPara detener todo, cierra las cuatro ventanas de MACHOBOL."
Read-Host "`nPresiona Enter para cerrar esta ventana (los servicios siguen corriendo)"
