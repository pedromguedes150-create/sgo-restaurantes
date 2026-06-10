# =============================================================================
# SGO Beija Flor — Backup local (Windows / desenvolvimento)
# Dump do Postgres do SGO via container. Para 3-2-1 completo (criptografia +
# offsite) use scripts/backup-db.sh no servidor de produção.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
# =============================================================================
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# Carrega .env
$env_vars = @{}
Get-Content ".env" | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  $env_vars[$k.Trim()] = $v.Trim()
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "backups"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$dump = Join-Path $out "sgo-db-$stamp.sql"

Write-Host "Dump do PostgreSQL ($($env_vars['POSTGRES_DB']))..."
docker exec sgo_postgres pg_dump -U $env_vars['POSTGRES_USER'] -d $env_vars['POSTGRES_DB'] | Out-File -Encoding utf8 $dump

# Retenção local simples (30 dias)
Get-ChildItem $out -Filter "*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force

Write-Host "OK - backup salvo em $dump"
