#!/usr/bin/env bash
set -euo pipefail

# ── Per-language ML training pipeline ─────────────────────────────────────────
#
# Trains separate title extraction models for Polish and English.
#
# Usage:
#   bash tools/title-loop/run_pipeline.sh
#   bash tools/title-loop/run_pipeline.sh --lang pl
#   bash tools/title-loop/run_pipeline.sh --skip-to export
#   bash tools/title-loop/run_pipeline.sh --lang pl --skip-to export
#
# Steps: generate, prepare, train, evaluate, export
#
# Logs: tools/title-loop/models/pipeline.log

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$REPO_ROOT/tools/title-loop/models"
LOG_FILE="$LOG_DIR/pipeline.log"

mkdir -p "$LOG_DIR"

# ── Args ─────────────────────────────────────────────────────────────────────

SKIP_TO=""
LANGS="pl en"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-to)
            SKIP_TO="$2"; shift 2 ;;
        --lang)
            LANGS="$2"; shift 2 ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: $0 [--lang pl|en] [--skip-to generate|prepare|train|evaluate|export]" >&2
            exit 1 ;;
    esac
done

# Map step names to numbers for ordering
step_num() {
    case "$1" in
        generate) echo 1 ;; prepare) echo 2 ;; train) echo 3 ;;
        evaluate) echo 4 ;; export)  echo 5 ;;
        *) echo "Unknown step: $1" >&2; exit 1 ;;
    esac
}

SKIP_TO_NUM=0
if [ -n "$SKIP_TO" ]; then
    SKIP_TO_NUM=$(step_num "$SKIP_TO")
fi

should_run() {
    local step_n
    step_n=$(step_num "$1")
    [ "$step_n" -ge "$SKIP_TO_NUM" ]
}

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

run_step() {
    local step_name="$1"
    local step_cmd="$2"

    log "━━━ STEP: $step_name ━━━"
    log "Running: $step_cmd"

    local output_file
    output_file=$(mktemp)
    local exit_code=0
    eval "$step_cmd" > "$output_file" 2>&1 || exit_code=$?

    cat "$output_file" >> "$LOG_FILE"

    if [ $exit_code -eq 0 ]; then
        log "✓ $step_name succeeded"
        tail -5 "$output_file"
        rm -f "$output_file"
        return 0
    fi

    log "✗ $step_name failed (exit $exit_code)"
    cat "$output_file"
    rm -f "$output_file"
    return 1
}

# ── Main ──────────────────────────────────────────────────────────────────────

cd "$REPO_ROOT"

log "╔══════════════════════════════════════════════════╗"
log "║  Per-Language Title Extraction — Training        ║"
log "╚══════════════════════════════════════════════════╝"
log "Repo: $REPO_ROOT"
log "Lang: $LANGS"
if [ -n "$SKIP_TO" ]; then
    log "Skip to: $SKIP_TO"
fi
log "Log:  $LOG_FILE"
log ""

# Install deps
log "Installing Python dependencies..."
uv pip install --system --break-system-packages -q -r tools/title-loop/requirements-ml.txt >> "$LOG_FILE" 2>&1
log "✓ Dependencies installed"

# Step 1: Generate synthetic + augmented data (shared, both languages)
if should_run generate; then
    run_step \
        "Generate training data" \
        "python3 tools/title-loop/generate_training_data.py"
else
    log "Skipping: Generate training data"
fi

# Per-language pipeline
for LANG in $LANGS; do
    log ""
    log "╔══════════════════════════════════════════════════╗"
    log "║  Language: $(echo $LANG | tr a-z A-Z)                                   ║"
    log "╚══════════════════════════════════════════════════╝"

    # Step 2: Prepare BIO-labeled data
    if should_run prepare; then
        run_step \
            "Prepare $(echo $LANG | tr a-z A-Z) training data" \
            "python3 tools/title-loop/prepare_training_data.py --lang $LANG"
    else
        log "Skipping: Prepare $(echo $LANG | tr a-z A-Z) training data"
    fi

    # Step 3: Train model (skip if already trained)
    if should_run train; then
        if [ -f "tools/title-loop/models/$LANG/best/config.json" ]; then
            log "━━━ STEP: Train $(echo $LANG | tr a-z A-Z) model ━━━"
            log "✓ $(echo $LANG | tr a-z A-Z) model already trained, skipping"
        else
            run_step \
                "Train $(echo $LANG | tr a-z A-Z) model" \
                "python3 tools/title-loop/train_title_model.py --lang $LANG"
        fi
    else
        log "Skipping: Train $(echo $LANG | tr a-z A-Z) model"
    fi

    # Step 4: Evaluate
    if should_run evaluate; then
        run_step \
            "Evaluate $(echo $LANG | tr a-z A-Z) model" \
            "python3 tools/title-loop/eval_model.py --lang $LANG"
    else
        log "Skipping: Evaluate $(echo $LANG | tr a-z A-Z) model"
    fi

    # Step 5: Export (requires executorch — use dedicated venv if available)
    if should_run export; then
        EXPORT_VENV="$REPO_ROOT/tools/title-loop/.venv-export/bin/activate"
        if [ -f "$EXPORT_VENV" ]; then
            run_step \
                "Export $(echo $LANG | tr a-z A-Z) model" \
                "source $EXPORT_VENV && python3 tools/title-loop/export_to_executorch.py --lang $LANG"
        else
            log "━━━ STEP: Export $(echo $LANG | tr a-z A-Z) model ━━━"
            log "⚠ Export venv not found at $EXPORT_VENV"
            log "  Create it with: uv venv --python 3.13 tools/title-loop/.venv-export"
            log "  Then install: source tools/title-loop/.venv-export/bin/activate && uv pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cpu && uv pip install executorch==1.1.0 transformers accelerate"
            run_step \
                "Export $(echo $LANG | tr a-z A-Z) model (system python)" \
                "python3 tools/title-loop/export_to_executorch.py --lang $LANG"
        fi
    else
        log "Skipping: Export $(echo $LANG | tr a-z A-Z) model"
    fi
done

log ""
log "╔══════════════════════════════════════════════════╗"
log "║  Pipeline complete!                             ║"
log "╚══════════════════════════════════════════════════╝"
log "Polish:  tools/title-loop/models/pl/best/"
log "English: tools/title-loop/models/en/best/"
log "Export:  tools/title-loop/models/export/{pl,en}/"
log "Full log: $LOG_FILE"
