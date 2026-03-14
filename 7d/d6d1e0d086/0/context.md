# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Improve title extraction: burst detection + full scan + multi-title

## Context

The current `extractTitleWithEmbeddings` scans only the first ~10 non-empty lines. Real cookbook OCR pages often start with a burst of short garbled lines from a partially visible adjacent page, pushing real titles out of the window. Pages can also contain multiple recipes.

## Approach

1. Detect and skip the initial burst of short/garbled lines
2. Scan all remaining lines for ca...

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you finish what you started or leave work half-done?

**Code Quality:**
• Did you leave the code better than you found it?

**Integration & Refactoring:**
• Should you consolidate similar functions that now exist?

**Codebase Consistency:**
• Should other parts of the codebase be updated to match your improvements?

💡 **Tip:** The code-review-expert subagent is available...

