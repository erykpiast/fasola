# Session Context

## User Prompts

### Prompt 1

## Context
- Existing specs: total 0
drwxr-xr-x@ 20 eryk.napierala  staff   640 Mar  9 22:54 .
drwxr-xr-x@ 41 eryk.napierala  staff  1312 Mar 14 01:45 ..
drwxr-xr-x@  4 eryk.napierala  staff   128 Mar  3 22:19 001_initial
drwxr-xr-x@  4 eryk.napierala  staff   128 Mar  3 22:19 002_metadata
drwxr-xr-x@  7 eryk.napierala  staff   224 Mar  3 22:19 003_search
drwxr-xr-x@  4 eryk.napierala  staff   128 Mar  3 22:19 004_photo_ajdustment
drwxr-xr-x@  4 eryk.napierala  staff   128 Mar  3 22:19 005_te...

### Prompt 2

yes

### Prompt 3

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are there any "Not implemented yet" placeholders or TODO comments in production code?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Would refactoring the surrounding code make everything simpler?

**Codebase Consistency:**
• Are you following the same patterns used elsewhere in the codebase?

💡 **Tip:** The code-re...

### Prompt 4

Okay. For recipe generation, please use Haiku model.

### Prompt 5

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you implement the full solution or just the minimum to make tests green?

**Code Quality:**
• Did you leave the code better than you found it?

**Integration & Refactoring:**
• Should you consolidate similar functions that now exist?

**Codebase Consistency:**
• Did you update all the places that depend on what you changed?

💡 **Tip:** The code-review-expert subagent is ...

### Prompt 6

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess State

Run these commands in parallel to understand the full context:

- `git status` and `git diff` — understand all staged/unstaged/untracked changes
- `gh pr view --json title,body,url,state 2>/dev/null` — check if a PR already exists for the current branch
- `git log --oneline main..HEAD`...

### Prompt 7

yes

