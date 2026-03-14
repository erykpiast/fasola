# Session Context

## User Prompts

### Prompt 1

I would like the processing gradient a bit smoother. Today it displays a white halo around the black center. How to accomplish a nicer effect?

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you stub out functionality with placeholder messages instead of real logic?

**Code Quality:**
• Is every piece of code still serving a clear purpose?

**Integration & Refactoring:**
• Would refactoring the surrounding code make everything simpler?

**Codebase Consistency:**
• Are there related files that need the same changes?

💡 **Tip:** The code-review-expert subagent...

### Prompt 3

Better, but make it wider overall so the dark area takes more space

### Prompt 4

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are there any "Not implemented yet" placeholders or TODO comments in production code?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Should you extract the new functionality into cleaner abstractions?

**Codebase Consistency:**
• Should other parts of the codebase be updated to match your improvements?

💡 **Tip:** T...

### Prompt 5

mock the boolean so it always shows the overlay - to test

### Prompt 6

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Does the implementation actually do what it claims, or just return hardcoded values?

**Code Quality:**
• Did you leave the code better than you found it?

**Integration & Refactoring:**
• Does the code structure still make sense after your additions?

**Codebase Consistency:**
• Should your solution be applied elsewhere for consistency?

💡 **Tip:** The code-review-expert su...

### Prompt 7

actually - let's simplify. No ellipse, just a semi-transparent solid overlay

### Prompt 8

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are all the features actually working, or just pretending to work?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Did you just add code on top without integrating it properly?

**Codebase Consistency:**
• Are there related files that need the same changes?

💡 **Tip:** The code-review-expert subagent is available. Us...

### Prompt 9

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess State

Run these commands in parallel to understand the full context:

- `git status` and `git diff` — understand all staged/unstaged/untracked changes
- `gh pr view --json title,body,url,state 2>/dev/null` — check if a PR already exists for the current branch
- `git log --oneline main..HEAD`...

### Prompt 10

yes

