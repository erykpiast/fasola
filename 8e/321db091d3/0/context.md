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

Stop hook feedback:
[claudekit-hooks run typecheck-project]: Running project-wide TypeScript validation...
████ TypeScript Validation Failed ████

TypeScript compilation errors must be fixed:

  app/index.tsx(133,11): error TS2578: Unused '@ts-expect-error' directive.
  app/index.tsx(173,13): error TS2578: Unused '@ts-expect-error' directive.
  app/index.tsx(177,15): error TS2578: Unused '@ts-expect-error' directive.
  features/search/components/SearchBar.tsx(138,8): error TS2578: Unused '@ts...

### Prompt 3

Please re-check changes on this branch, some of what you mentioned is already in main

### Prompt 4

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
• Should other parts of the codebase be updated to match your improvements?

💡 **Tip:** The c...

