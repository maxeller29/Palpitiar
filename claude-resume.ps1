# =========================================================================
# claude-resume.ps1
# Versao PowerShell (Windows nativo) do auto-resume do Claude Code.
# Use esta versao se preferir rodar fora do Git Bash.
#
# COMO USAR:
#   1. Ajuste as variaveis na secao CONFIG abaixo (ou defina como
#      variaveis de ambiente antes de rodar).
#   2. Execute no PowerShell:  .\claude-resume.ps1
#      (se der erro de execution policy, rode antes:
#       Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass)
# =========================================================================

# ------------------------- CONFIG -------------------------
$TaskPrompt   = if ($env:CLAUDE_TASK_PROMPT)   { $env:CLAUDE_TASK_PROMPT }   else { "Continue a tarefa que estava em andamento no projeto." }
$ProjectDir   = if ($env:CLAUDE_PROJECT_DIR)   { $env:CLAUDE_PROJECT_DIR }   else { "" }
$PollInterval = if ($env:CLAUDE_POLL_INTERVAL) { [int]$env:CLAUDE_POLL_INTERVAL } else { 300 }   # segundos
$MaxRetries   = if ($env:CLAUDE_MAX_RETRIES)   { [int]$env:CLAUDE_MAX_RETRIES }   else { 200 }
$LogFile      = if ($env:CLAUDE_LOG_FILE)      { $env:CLAUDE_LOG_FILE }      else { "claude-resume.log" }
# -------------------------------------------------------------

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

if ($ProjectDir -ne "") {
    if (-not (Test-Path $ProjectDir)) {
        Write-Host "Pasta do projeto nao encontrada: $ProjectDir"
        exit 1
    }
    Set-Location $ProjectDir
}

Write-Log "===== Iniciando claude-resume ====="
Write-Log "Pasta do projeto: $(Get-Location)"

$attempt  = 0
$firstRun = $true

while ($attempt -lt $MaxRetries) {
    $attempt++

    if ($firstRun) {
        Write-Log "Tentativa $attempt`: iniciando nova sessao com o prompt da tarefa..."
        claude -p $TaskPrompt
        $exitCode = $LASTEXITCODE
        $firstRun = $false
    } else {
        Write-Log "Tentativa $attempt`: retomando sessao anterior (claude -c)..."
        claude -c "Continue exatamente de onde parou, sem repetir trabalho ja feito."
        $exitCode = $LASTEXITCODE
    }

    if ($exitCode -eq 0) {
        Write-Log "Tarefa concluida com sucesso (exit code 0). Encerrando."
        exit 0
    }

    Write-Log "Sessao encerrada com codigo $exitCode (provavel limite de uso atingido)."
    Write-Log "Aguardando $PollInterval s antes de tentar novamente..."
    Start-Sleep -Seconds $PollInterval
}

Write-Log "Numero maximo de tentativas ($MaxRetries) atingido sem concluir a tarefa."
exit 1
