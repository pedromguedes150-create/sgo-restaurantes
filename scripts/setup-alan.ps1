# =============================================================================
# SGO Beija Flor - Configuracao da maquina (Windows) para desenvolver e publicar
# Deixa tudo pronto de uma vez: clona o projeto, instala dependencias, sobe o
# banco local e prepara o ambiente. Rode UMA vez.
#
# Como rodar (PowerShell):
#   1. Abra o PowerShell.
#   2. Va ate a pasta onde quer guardar o projeto (ex.: cd C:\Users\SeuNome\Documentos).
#   3. Rode:  powershell -ExecutionPolicy Bypass -File setup-alan.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$REPO = "https://github.com/pedromguedes150-create/sgo-restaurantes.git"
$DIR  = "sgo-restaurantes"

function Ok($m)   { Write-Host "  [OK]  $m" -ForegroundColor Green }
function Info($m) { Write-Host ">> $m" -ForegroundColor Cyan }
function Erro($m) { Write-Host "  [!]  $m" -ForegroundColor Red }

Write-Host ""
Write-Host "===== SGO - Configuracao da maquina =====" -ForegroundColor Yellow
Write-Host ""

# --- 1) Conferir os programas necessarios ---
Info "Conferindo os programas necessarios..."
$faltando = @()
foreach ($cmd in @("git","node","npm","docker")) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Ok "$cmd encontrado" }
  else { Erro "$cmd NAO encontrado"; $faltando += $cmd }
}
if ($faltando.Count -gt 0) {
  Write-Host ""
  Erro "Faltam programas: $($faltando -join ', ')"
  Write-Host "Instale antes de continuar:" -ForegroundColor Yellow
  Write-Host "  - Git:            https://git-scm.com/download/win"
  Write-Host "  - Node.js 20+:    https://nodejs.org (versao LTS)"
  Write-Host "  - Docker Desktop: https://www.docker.com/products/docker-desktop"
  Write-Host "Depois de instalar, ABRA o Docker Desktop e rode este script de novo."
  exit 1
}

# --- 2) Docker esta rodando? ---
Info "Conferindo se o Docker esta rodando..."
try { docker info *> $null; Ok "Docker rodando" }
catch { Erro "Docker instalado mas NAO esta rodando. Abra o Docker Desktop e espere ficar verde, depois rode de novo."; exit 1 }

# --- 3) Clonar o projeto ---
if (Test-Path $DIR) {
  Info "Pasta '$DIR' ja existe - atualizando..."
  Set-Location $DIR
  git pull origin main
} else {
  Info "Baixando o projeto do GitHub (pode abrir o navegador pedindo seu login do GitHub)..."
  git clone $REPO $DIR
  Set-Location $DIR
}
Ok "Projeto pronto em: $(Get-Location)"

# --- 4) Identidade do Git (para os commits sairem no seu nome) ---
Info "Configurando sua identidade no Git (aparece nos commits)..."
$nome  = Read-Host "  Seu nome (ex.: Alan)"
$email = Read-Host "  Seu e-mail do GitHub (ex.: operacoespostos@grupobeijaflor.com)"
if ($nome)  { git config user.name  "$nome" }
if ($email) { git config user.email "$email" }
Ok "Identidade: $(git config user.name) <$(git config user.email)>"

# --- 5) Arquivo .env (valores de desenvolvimento) ---
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Ok "Arquivo .env criado a partir do modelo (valores de DEV)"
} else { Ok ".env ja existe (mantido)" }

# --- 6) Dependencias ---
Info "Instalando as dependencias (npm install) - pode levar alguns minutos..."
npm install
Ok "Dependencias instaladas"

# --- 7) Banco de dados local ---
Info "Subindo o banco de dados local (Docker)..."
docker compose up -d
Start-Sleep -Seconds 6
Info "Criando as tabelas e dados de exemplo..."
npm run db:migrate
npm run db:seed
Ok "Banco pronto"

Write-Host ""
Write-Host "===== TUDO PRONTO! =====" -ForegroundColor Green
Write-Host ""
Write-Host "Para rodar o SGO na sua maquina, use:" -ForegroundColor Yellow
Write-Host "   npm run dev"
Write-Host "E abra no navegador:  http://localhost:3100"
Write-Host ""
Write-Host "Login de teste:  admin@beijaflor.com.br  /  Beijaflor@123"
Write-Host ""
Write-Host "Daqui pra frente, use o Claude Code dentro desta pasta para editar e publicar."
Write-Host "Guia completo: docs\setup-dev.md  e  docs\deploy-automatico.md"
Write-Host ""
