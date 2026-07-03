#!/usr/bin/env bash
# =========================================================================
# claude-resume.sh
# Retoma automaticamente uma sessao do Claude Code apos o limite de
# uso/tokens do periodo resetar, sem precisar ficar digitando "continue".
#
# COMO USAR:
#   1. Rode o Claude Code normalmente ate ele bater no limite
#      (o comando abaixo ja inicia a tarefa e cuida do resto sozinho).
#   2. Ajuste as variaveis na secao CONFIG abaixo.
#   3. Execute: bash claude-resume.sh
#   4. Pode deixar rodando em segundo plano (ex: numa aba do terminal
#      integrado do VS Code) e ir fazer outra coisa.
# =========================================================================

set -uo pipefail

# ------------------------- CONFIG -------------------------
# Prompt inicial da tarefa (so e usado na PRIMEIRA execucao).
TASK_PROMPT="${CLAUDE_TASK_PROMPT:-Continue implementando o pipeline de conferência do Palpitiar}"

# Pasta do projeto (ex: Palpitiar). Deixe vazio para usar a pasta atual.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"

# Intervalo de checagem quando o limite estoura, em segundos.
POLL_INTERVAL="${CLAUDE_POLL_INTERVAL:-300}"   # 5 minutos

# Numero maximo de tentativas antes de desistir (evita loop infinito).
MAX_RETRIES="${CLAUDE_MAX_RETRIES:-200}"

# Arquivo de log
LOG_FILE="${CLAUDE_LOG_FILE:-claude-resume.log}"
# -------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

if [[ -n "$PROJECT_DIR" ]]; then
  cd "$PROJECT_DIR" || { echo "Pasta do projeto nao encontrada: $PROJECT_DIR"; exit 1; }
fi

log "===== Iniciando claude-resume ====="
log "Pasta do projeto: $(pwd)"

attempt=0
first_run=true

while (( attempt < MAX_RETRIES )); do
  attempt=$((attempt + 1))

  if $first_run; then
    log "Tentativa $attempt: iniciando nova sessao com o prompt da tarefa..."
    claude -p "$TASK_PROMPT" --dangerously-skip-permissions=false
    EXIT_CODE=$?
    first_run=false
  else
    log "Tentativa $attempt: retomando sessao anterior (claude -c)..."
    claude -c "Continue exatamente de onde parou, sem repetir trabalho ja feito."
    EXIT_CODE=$?
  fi

  if [[ $EXIT_CODE -eq 0 ]]; then
    log "Tarefa concluida com sucesso (exit code 0). Encerrando."
    exit 0
  fi

  log "Sessao encerrada com codigo $EXIT_CODE (provavel limite de uso atingido)."
  log "Aguardando ${POLL_INTERVAL}s antes de tentar novamente..."
  sleep "$POLL_INTERVAL"
done

log "Numero maximo de tentativas ($MAX_RETRIES) atingido sem concluir a tarefa."
exit 1
