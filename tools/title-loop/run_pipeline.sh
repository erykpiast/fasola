#!/usr/bin/env bash
set -euo pipefail

# ── Per-language ML training pipeline ─────────────────────────────────────────
#
# Trains separate title extraction models for Polish and English.
#
# Usage:
#   bash tools/title-loop/run_pipeline.sh
#
# Logs: tools/title-loop/models/pipeline.log

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$REPO_ROOT/tools/title-loop/models"
LOG_FILE="$LOG_DIR/pipeline.log"

mkdir -p "$LOG_DIR"

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
log "Log:  $LOG_FILE"
log ""

# Install deps
log "Installing Python dependencies..."
pip3 install --break-system-packages -q -r tools/title-loop/requirements-ml.txt >> "$LOG_FILE" 2>&1
log "✓ Dependencies installed"

# Step 1: Generate synthetic + augmented data (shared, both languages)
run_step \
    "Generate training data" \
    "python3 tools/title-loop/generate_training_data.py"

# Per-language pipeline
for LANG in pl en; do
    log ""
    log "╔══════════════════════════════════════════════════╗"
    log "║  Language: $(echo $LANG | tr a-z A-Z)                                   ║"
    log "╚══════════════════════════════════════════════════╝"

    # Step 2: Prepare BIO-labeled data
    run_step \
        "Prepare $(echo $LANG | tr a-z A-Z) training data" \
        "python3 tools/title-loop/prepare_training_data.py --lang $LANG"

    # Step 3: Train model (skip if already trained)
    if [ -f "tools/title-loop/models/$LANG/best/config.json" ]; then
        log "━━━ STEP: Train $(echo $LANG | tr a-z A-Z) model ━━━"
        log "✓ $(echo $LANG | tr a-z A-Z) model already trained, skipping"
    else
        run_step \
            "Train $(echo $LANG | tr a-z A-Z) model" \
            "python3 tools/title-loop/train_title_model.py --lang $LANG"
    fi

    # Step 4: Evaluate
    run_step \
        "Evaluate $(echo $LANG | tr a-z A-Z) model" \
        "python3 tools/title-loop/eval_model.py --lang $LANG"

    # Step 5: Export
    run_step \
        "Export $(echo $LANG | tr a-z A-Z) model" \
        "python3 tools/title-loop/export_to_executorch.py --lang $LANG"
done

log ""
log "╔══════════════════════════════════════════════════╗"
log "║  Pipeline complete!                             ║"
log "╚══════════════════════════════════════════════════╝"
log "Polish:  tools/title-loop/models/pl/best/"
log "English: tools/title-loop/models/en/best/"
log "Export:  tools/title-loop/models/export/{pl,en}/"
log "Full log: $LOG_FILE"
