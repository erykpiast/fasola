# Session Context

## User Prompts

### Prompt 1

Base directory for this skill: /Users/eryk.napierala/.claude/skills/ship

# Ship

Prepare code changes for a pull request using conversation context and current git state.

## Process

### Step 1: Assess Changes

Run `git status` and `git diff` to understand all changes. Combine with conversation context about what was worked on to provide better descriptions.

### Step 2: Propose Branch Name

Follow the format: `{PREFIX}/{SHORT_NAME}`

- `PREFIX` — the Linear ticket ID if available, otherwis...

### Prompt 2

Tool loaded.

### Prompt 3

yes!

### Prompt 4

Some dependencies in package.json use floating version selectors. Let's pin them to actually installed versions.

### Prompt 5

Tool loaded.

### Prompt 6

Tool loaded.

### Prompt 7

Why Expo doctor insists to use floating selectors for these packages? eryk.napierala@Eryks-MacBook-Pro ~/P/fasola-chore-testflight_build (chore/testflight_build) [1]> npx expo install --check
The following packages should be updated for best compatibility with the installed expo version:
  @react-navigation/bottom-tabs@7.4.9 - expected version: ^7.4.0
  @react-navigation/native@7.1.18 - expected version: ^7.1.8
Your project may not work correctly until you install the expected versions of the...

### Prompt 8

Yes

