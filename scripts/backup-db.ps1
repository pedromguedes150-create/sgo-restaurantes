# =============================================================================
# SGO Beija Flor - Backup automatico do PostgreSQL (Windows / producao)
# - Dump em formato CUSTOM (-Fc): comprimido e restauravel com pg_restore.
# - Feito via docker exec + docker cp (nao usa pipe do PowerShell, que
#   corromperia o binario/encoding).
# - 2a copia (3-2-1): se BACKUP_MIRROR_DIR existir no .env, espelha pra la
#   (use um drive/pasta DIFERENTE - externo, rede ou nuvem sincronizada).
# - Retencao: mantem os ultimos RETENTION_DAYS (padrao 30) em ambos destinos.
# Uso manual:  powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
# Agendado:    via Tarefa "sgo-backup" (ver scripts\install-backup-task.ps1)
# =============================================================================
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# --- carrega .env ---
$envv = @{}
Get-Content ".env" | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  $envv[$k.Trim()] = $v.Trim()
}
$PUSER = $envv['POSTGRES_USER']
$PDB   = $envv['POSTGRES_DB']
$RET   = if ($envv['RETENTION_DAYS']) { [int]$envv['RETENTION_DAYS'] } else { 30 }
$MIRROR = $envv['BACKUP_MIRROR_DIR']

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "backups"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$file = "sgo-db-$stamp.dump"
$local = Join-Path $out $file

Write-Host "[$(Get-Date -Format o)] Dump de '$PDB' (formato custom)..."
# 1) gera o dump DENTRO do container
docker exec sgo_postgres pg_dump -U $PUSER -d $PDB -Fc -f "/tmp/$file"
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (exit $LASTEXITCODE)" }
# 2) copia pra fora
docker cp "sgo_postgres:/tmp/$file" $local
if ($LASTEXITCODE -ne 0) { throw "docker cp falhou (exit $LASTEXITCODE)" }
# 3) limpa o tmp do container
docker exec sgo_postgres rm -f "/tmp/$file" | Out-Null

# valida tamanho (>1KB)
$size = (Get-Item $local).Length
if ($size -lt 1024) { throw "Backup suspeito: so $size bytes em $local" }
Write-Host ("OK - backup local: {0} ({1} MB)" -f $local, [math]::Round($size/1MB,2))

# --- 2a copia (3-2-1) ---
if ($MIRROR) {
  try {
    New-Item -ItemType Directory -Force -Path $MIRROR | Out-Null
    Copy-Item $local (Join-Path $MIRROR $file) -Force
    Write-Host "OK - copia espelhada: $MIRROR"
    Get-ChildItem $MIRROR -Filter "sgo-db-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RET) } | Remove-Item -Force
  } catch {
    Write-Warning ("Falha ao espelhar para '{0}': {1}" -f $MIRROR, $_.Exception.Message)
  }
} else {
  Write-Host "AVISO: BACKUP_MIRROR_DIR nao definido no .env - sem 2a copia (3-2-1 incompleto)."
}

# --- retencao local ---
Get-ChildItem $out -Filter "sgo-db-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RET) } | Remove-Item -Force

Write-Host "[$(Get-Date -Format o)] Backup concluido."
