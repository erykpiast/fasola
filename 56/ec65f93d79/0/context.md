# Session Context

## User Prompts

### Prompt 1

Let's document how to release the project to external testing (via TestFlight). Include the initial EAS setup like the credentials command etc. There are different past conversations about that

### Prompt 2

The EAS executable is eas-cli

### Prompt 3

That's incorrect, see eryk.napierala@Eryks-MacBook-Pro ~/P/fasola (main)> npx eas submit --platform ios
npm error could not determine executable to run
npm error A complete log of this run can be found in: /Users/eryk.napierala/.npm/_logs/2026-03-09T22_15_05_794Z-debug-0.log
eryk.napierala@Eryks-MacBook-Pro ~/P/fasola (main) [1]> npx eas-cli submit --platform ios
Found eas-cli in your project dependencies.
It's recommended to use the "cli.version" field in eas.json to enforce the eas-cli vers...

### Prompt 4

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess State

Run these commands in parallel to understand the full context:

- `git status` and `git diff` — understand all staged/unstaged/untracked changes
- `gh pr view --json title,body,url,state 2>/dev/null` — check if a PR already exists for the current branch
- `git log --oneline main..HEAD`...

### Prompt 5

Yes

