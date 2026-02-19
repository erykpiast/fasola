# Session Context

## User Prompts

### Prompt 1

# Implement Specification

Implement the specification at: 

STM_STATUS: Not installed

## Pre-Execution Checks

1. **Check Task Management**:
   - If STM shows "Available but not initialized" → Run `stm init` first, then `/spec:decompose` to create tasks
   - If STM shows "Available and initialized" → Use STM for tasks
   - If STM shows "Not installed" → Use TodoWrite instead

2. **Verify Specification**:
   - Confirm spec file exists and is complete
   - Check that required tools are ava...

### Prompt 2

[Request interrupted by user]

### Prompt 3

# Implement Specification

Implement the specification at: @specs/014_status_bar_inset/plan.md

STM_STATUS: Not installed

## Pre-Execution Checks

1. **Check Task Management**:
   - If STM shows "Available but not initialized" → Run `stm init` first, then `/spec:decompose` to create tasks
   - If STM shows "Available and initialized" → Use STM for tasks
   - If STM shows "Not installed" → Use TodoWrite instead

2. **Verify Specification**:
   - Confirm spec file exists and is complete
   ...

### Prompt 4

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are all the features actually working, or just pretending to work?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Would refactoring the surrounding code make everything simpler?

**Codebase Consistency:**
• Are there related files that need the same changes?

💡 **Tip:** The code-review-expert subagent is ...

