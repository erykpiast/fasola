# Session Context

## User Prompts

### Prompt 1

The import source selector panel (camera/library) always appears in the middle of the screen when the app starts with zero recipes. Even after adding a recipe - that's still the case. The app needs to be restarted. funny enough, the opposite is not the case. so when there is already a recipe and the panel appears instead of the plus button in the bottom right, and then I remove the only recipe so there are no recipes anymore and a big plus button is displayed in the middle of the screen, then...

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you create a mock implementation just to pass tests instead of real functionality?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Should you extract the new functionality into cleaner abstractions?

**Codebase Consistency:**
• Did you create a utility that existing code could benefit from?

💡 **Tip:** The code-r...

### Prompt 3

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess State

Run these commands in parallel to understand the full context:

- `git status` and `git diff` — understand all staged/unstaged/untracked changes
- `gh pr view --json title,body,url,state 2>/dev/null` — check if a PR already exists for the current branch
- `git log --oneline main..HEAD`...

### Prompt 4

yes

