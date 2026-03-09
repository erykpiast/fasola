# Session Context

## User Prompts

### Prompt 1

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess State

Run these commands in parallel to understand the full context:

- `git status` and `git diff` — understand all staged/unstaged/untracked changes
- `gh pr view --json title,body,url,state 2>/dev/null` — check if a PR already exists for the current branch
- `git log --oneline main..HEAD`...

### Prompt 2

task tracking - these should not be ignored. remove the gitignore entry

### Prompt 3

The "Why" is that we need a way to track bugs and job to be done

### Prompt 4

Testing isn't neccessary

### Prompt 5

yes

