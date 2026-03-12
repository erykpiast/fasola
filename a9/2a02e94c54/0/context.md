# Session Context

## User Prompts

### Prompt 1

# Implement Specification

Implement the specification at: @.simple-task-master/tasks/9-when-processing-and-we-dont-know-the-title-and-the-tags-yet-we-should-show-some-skeleton-ui-instead-.md

!claudekit status stm

## Pre-Execution Checks

1. **Check Task Management**:
   - If STM shows "Available but not initialized" → Run `stm init` first, then `/spec:decompose` to create tasks
   - If STM shows "Available and initialized" → Use STM for tasks
   - If STM shows "Not installed" → Use TodoWri...

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you finish what you started or leave work half-done?

**Code Quality:**
• Is every piece of code still serving a clear purpose?

**Integration & Refactoring:**
• Did you just add code on top without integrating it properly?

**Codebase Consistency:**
• Are there related files that need the same changes?

💡 **Tip:** The code-review-expert subagent is available. Use it to ...

### Prompt 3

the skeleton UI clearly takes space but it doesn't appear

### Prompt 4

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are there any "Not implemented yet" placeholders or TODO comments in production code?

**Code Quality:**
• Are you using different patterns than the existing code uses?

**Integration & Refactoring:**
• Does the code structure still make sense after your additions?

**Codebase Consistency:**
• Are there related files that need the same changes?

💡 **Tip:** The code-review-ex...

### Prompt 5

Okay, now it's better. Few adjustments:

### Prompt 6

[Request interrupted by user]

### Prompt 7

1. The layout should be: one high line for the title, book title (real text), four low boxes for tags (see the attached image)
2. The blink animation should be two times slower

### Prompt 8

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you stub out functionality with placeholder messages instead of real logic?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Did you just add code on top without integrating it properly?

**Codebase Consistency:**
• Should your solution be applied elsewhere for consistency?

💡 **Tip:** The code-review-expert subag...

