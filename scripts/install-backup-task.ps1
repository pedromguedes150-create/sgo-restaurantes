# =============================================================================
# SGO Beija Flor - Instala a Tarefa Agendada "sgo-backup" (Windows)
# Roda o backup-db.ps1 diariamente. Executa apenas com o usuario logado
# (o Docker Desktop do servidor sobe no logon), que e como o restante do
# stack ja funciona. Idempotente: recria a tarefa se ja existir.
#
# Uso:   powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1
#        (opcional)  -At "03:00"   -TaskName "sgo-backup"
#
# 3-2-1 COMPLETO: defina BACKUP_MIRROR_DIR no .env apontando para um 2o destino
# DIFERENTE (HD externo, pasta de rede ou nuvem sincronizada). Sem isso, ha
# apenas a copia local (o backup-db.ps1 avisa que o 3-2-1 fica incompleto).
# =============================================================================
param(
  [string]$At = "03:00",
  [string]$TaskName = "sgo-backup"
)
$ErrorActionPreference = "Stop"

$repo   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script = Join-Path $repo "scripts\backup-db.ps1"
if (-not (Test-Path $script)) { throw "Nao encontrei $script" }

Write-Host "Repo:   $repo"
Write-Host "Script: $script"
Write-Host "Horario diario: $At"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
  -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Daily -At $At

# Executa como o usuario atual, apenas quando logado (Docker roda no contexto do usuario).
# RunLevel Limited evita a exigencia de elevacao (UAC) ao registrar/rodar a tarefa.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)

# Recria se ja existir
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Tarefa '$TaskName' ja existe - recriando..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Backup diario do PostgreSQL do SGO (pg_dump custom + fotos + 3-2-1). Ver scripts\backup-db.ps1." | Out-Null

Write-Host ""
Write-Host "OK - Tarefa '$TaskName' agendada para todo dia as $At."
Write-Host "Testar agora:   Start-ScheduledTask -TaskName $TaskName"
Write-Host "Ver status:     Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Host "Remover:        Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
