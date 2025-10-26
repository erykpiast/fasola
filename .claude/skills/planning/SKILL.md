---
name: Planning
description: Create comprehensive and detailed implementation plan from a high-level spec. Use when in plan mode.
---

# Planning Skill

## Activation Trigger

Use this skill when:

- User explicitly requests a plan or enters plan mode
- Task involves implementing a new feature from scratch
- Multiple interconnected components need modification
- User provides a specification document or detailed requirements

## Problem space

There are two main inputs to consider:

1. The user prompt (direct or a provided specification file)
2. The current codebase as is

### User prompt analysis

**Action items:**

1. Read the user prompt and break it into contextual pieces
2. Analyze all explicit requirements (MUST have features)
3. Identify implicit requirements (inferred from context)
4. Search for inconsistencies and gaps in reasoning
5. Ask clarifying questions if ambiguity exists (do not assume)
6. Document any user preferences or solution ideas mentioned

### Use case discovery

**Action items:**

1. List all use-cases explicitly mentioned by the user
2. Map user flows: entry points → actions → outcomes
3. Identify edge cases:
   - Empty/null states
   - Error conditions
   - Concurrent operations
   - Permission/access scenarios
   - Performance boundaries

### Codebase analysis

**Tools to use:** Grep, Glob, Read, Task (for complex searches)

**Action items:**

1. Identify affected areas using grep/glob for relevant keywords
2. Read current implementation of related features
3. Map domain boundaries:
   - Package dependencies (check package.json files)
   - Module imports/exports
   - API contracts between systems
4. Identify integration points:
   - Where to add new routes/endpoints
   - Which components to extend
   - Required hooks/events to listen to

## Design

### System architecture

**Output format:** Create clear sections for each area below

1. **Domain mapping:**

   - List all domains involved (e.g., auth, analytics, UI)
   - Draw ASCII/Mermaid diagram or bullet-list showing data flow

2. **Module design:**

   - Define clear API boundaries (input/output types)
   - List public vs private methods
   - Specify dependency direction (what imports what)

3. **Component responsibilities:**

   - One sentence per component describing its single responsibility
   - List what it owns vs what it delegates

4. **Data model:**

   ```typescript
   // Include TypeScript interfaces/types
   // Show state shape
   // Define API response/request formats
   ```

5. **Business logic:**

   - List validation rules
   - Define calculation formulas
   - Specify state transitions

6. **Test scenarios:**
   - Unit tests: List method + input + expected output
   - Integration: List user action + system response
   - Visual stories: List component states to showcase

### Design principles

**Apply these constraints:**

1. **Simplicity:** Prefer composition over inheritance, pure functions over stateful classes
2. **Low coupling:** Each module should depend on abstractions, not concrete implementations
3. **Progressive enhancement:** Start with MVP, then layer complexity
4. **Test value:** Write tests for business logic and integration points, skip trivial getters/setters

## Implementation strategy

### Phase planning

**Structure each phase as:**

```
Phase X: [Feature Name]
Goal: [User-visible outcome]
Tasks:
1. [Specific file/component to create/modify]
2. [API endpoint or method to implement]
3. [Tests to write]
Validation: [How to verify this phase works]
```

**Phase guidelines:**

- **Vertical slices:** Each phase delivers end-to-end functionality (UI → API → DB)
- **Incremental value:** User can test/use feature after each phase
- **Temporary code OK:** Use stubs/mocks for future phases
- **Refactor first:** Phase 0 can be pure refactoring if needed

### Validation checkpoints

**After each phase, verify:**

- [ ] Code compiles (`pnpm ci:typecheck`)
- [ ] Tests pass (`pnpm test`)
- [ ] Linting clean (`pnpm eslint`)
- [ ] Feature works manually (describe test steps)

## Plan document template

Create a structured markdown document with these sections:

### 1. Executive summary

```markdown
## Feature: [Name]

**Purpose:** [One sentence]
**User benefit:** [What problem this solves]
**Scope:** [What's included/excluded]
```

### 2. Context & constraints

```markdown
## Context

- **Existing code:** [List relevant files/modules discovered]
- **Dependencies:** [External libraries or services required]
- **Constraints:** [Performance, browser support, etc.]
- **Assumptions:** [What we're taking as given]
```

### 3. Requirements mapping

```markdown
## Requirements

| Requirement   | Solution approach | Phase |
| ------------- | ----------------- | ----- |
| User can X    | Implement Y       | 1     |
| System must Z | Add validation    | 2     |
```

### 4. Technical design

````markdown
## Architecture

[ASCII/Mermaid diagram or component tree]

## Key interfaces

```typescript
// Core types and APIs
```

## Data flow

1. User action →
2. Component state →
3. API call →
4. Response handling
````

### 5. Implementation roadmap

```markdown
## Phase 1: [Name]

**Deliverable:** [What works after this phase]

### Files to modify:

- [ ] path/to/file.ts - Add method X
- [ ] path/to/component.tsx - Add prop Y

### New files:

- [ ] path/to/newfile.ts - Purpose

### Tests:

- [ ] Unit: Test X function with Y input
- [ ] Integration: Verify Z flow

### Validation:

1. Run `pnpm test path/to/test`
2. Manual test: Click button → See result

## Phase 2: [Continue pattern]
```
