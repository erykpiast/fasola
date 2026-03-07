---
description: Reflect on the current session and distill learnings into docs/learnings.md
category: workflow
allowed-tools: Read, Edit, Write
---

# Learn - Session Retrospective

Review the current conversation and distill any noteworthy insights into `docs/learnings.md`.

## Process

### 1. Review the session

Look back through the conversation for:
- Bugs that were non-obvious or took multiple attempts to fix
- Surprising behavior from frameworks, libraries, or tools
- Patterns that worked well and should be reused
- Approaches that failed and should be avoided
- Configuration or environment gotchas
- Performance pitfalls or improvements discovered
- **User corrections on UX/design** — where the user said something should look or behave differently than what was initially implemented (e.g., layout, interaction patterns, navigation, visual hierarchy)
- **Refactoring requests** — where the user asked to restructure code that was already working, indicating a preference for a different style, abstraction level, or pattern

### 2. Check for duplicates

Read `docs/learnings.md` and verify the insight isn't already captured. If a related entry exists, update it rather than adding a duplicate.

### 3. Write concise entries

For each new insight, append a short entry under the appropriate topic section in `docs/learnings.md`.

For **technical issues**, use this format:

```
### Short descriptive title (YYYY-MM-DD)

**Problem:** One sentence describing what went wrong or was surprising.
**Solution:** One sentence (or a short code snippet) showing what fixed it.
**Takeaway:** One sentence generalizing the lesson.
```

For **UX/design corrections** and **code style/refactoring preferences**, use this format:

```
### Short descriptive title (YYYY-MM-DD)

**Initial approach:** What was implemented first.
**Preferred approach:** What the user asked for instead.
**Rule:** A generalizable guideline for future work.
```

When a preference entry generalizes into a rule that should always be followed, consider whether it belongs in `AGENTS.md` as a hard convention instead. Flag this to the user.

Keep entries terse. The goal is quick reference, not a blog post.

### 4. Add new topic sections if needed

If an insight doesn't fit any existing section, add a new `## Topic` section in alphabetical order among the existing sections.

### 5. Report

Summarize what was added to the user.
