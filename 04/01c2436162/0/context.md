# Session Context

## User Prompts

### Prompt 1

When there's no source present in the system, display the add source form right away instead of source selector.

### Prompt 2

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Are there any "Not implemented yet" placeholders or TODO comments in production code?

**Code Quality:**
• Did you leave the code better than you found it?

**Integration & Refactoring:**
• Did you leave any temporary workarounds or hacks?

**Codebase Consistency:**
• Are you following the same patterns used elsewhere in the codebase?

💡 **Tip:** The code-review-e...

### Prompt 3

In this particular case the (x) button should cancel adding the recipe. The checkmark button should both add the new source and add the recipe

### Prompt 4

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you create a mock implementation just to pass tests instead of real functionality?

**Code Quality:**
• Is there duplicated logic that should be extracted?

**Integration & Refactoring:**
• Would refactoring the surrounding code make everything simpler?

**Codebase Consistency:**
• Did you create a utility that existing code could benefit from?

💡 **Tip:** The...

### Prompt 5

What's important that in this particular mode the "autoaccept" for the confirm button must be disabled. No fill out animation!

### Prompt 6

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Does the implementation actually do what it claims, or just return hardcoded values?

**Code Quality:**
• Did you clean up after making your changes work?

**Integration & Refactoring:**
• Should you extract the new functionality into cleaner abstractions?

**Codebase Consistency:**
• Did you update all the places that depend on what you changed?

💡 **Tip:** The c...

### Prompt 7

Please make the add new source input automatically focused when it appears on the screen

### Prompt 8

It is not focusing. Maybe it's simulator limitation?

### Prompt 9

Stop hook feedback:
📋 **Self-Review**

Please review these aspects of your changes:

**Implementation Completeness:**
• Did you implement the full solution or just the minimum to make tests green?

**Code Quality:**
• Did you leave the code better than you found it?

**Integration & Refactoring:**
• Does the code structure still make sense after your additions?

**Codebase Consistency:**
• Should your solution be applied elsewhere for consistency?

💡 **Tip:** The code-review-expert...

### Prompt 10

Selectively stage and then commit all and only changes related to autofocus using the `fix: ` prefix. Then stage all other changes and commit as `fix: show add source form immediatelly when no source defined`

