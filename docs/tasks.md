# Task Tracking

We use [Simple Task Master](https://github.com/carlrannaberg/simple-task-master) to track bugs and jobs to be done. Tasks are stored as markdown files in `.simple-task-master/tasks/` and committed to the repo.

## Installation

```bash
npm install -g simple-task-master
```

## Common Commands

### Add a task

```bash
stm add "Fix translation on book screen" --tags bug,translations
stm add "Enable horizontal pan when not zoomed" --tags feature --priority high
```

### List tasks

```bash
stm list                      # all tasks
stm list --status pending     # filter by status: pending, in-progress, done
stm list --tags bug           # filter by tag
```

### Show task details

```bash
stm show <id>
```

### Update a task

```bash
stm update <id> --status in-progress
stm update <id> --status done
stm update <id> --title "New title" --tags new-tag
```

### Delete a task

```bash
stm delete <id>
```

## Workflow

1. Add tasks with `stm add` when bugs or feature requests come up
2. Set a task to `in-progress` when you start working on it
3. Set a task to `done` when complete
4. Commit task file changes alongside related code changes

## Full Documentation

See the [Simple Task Master README](https://github.com/carlrannaberg/simple-task-master) for all options including search, export, and custom fields.
