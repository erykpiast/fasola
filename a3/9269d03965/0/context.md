# Session Context

## User Prompts

### Prompt 1

The input button cuts too much of a placeholder text while it has a lot of space on the right

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are all the features actually working, or just pretending to work?

**Code Quality:**
• Are you using different patterns than the existing code uses?

**Integration & Refactoring:**
• Should you extract the new functionality into cleaner abstractions?

**Codebase Consistency:**
• Did you update all the places that depend on what you changed?

💡 **Tip:** The code-review-exper...

### Prompt 3

Commit as fix:

### Prompt 4

Create a git commit following the project's established style

## Git Expert Integration
For complex commit scenarios (merge commits, conflict resolution, commit history issues, interactive rebasing), consider using the Task tool with `git-expert` subagent for specialized git expertise.

## Efficiency Note:
This command intelligently reuses recent git:status results when available to avoid redundant operations. If you just ran /git:status, the commit process will be faster.

When git conventi...

