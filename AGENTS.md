# Agent Instructions

## Dependency Management

**Use NPM only.** Do not use PNPM or YARN for this project.

All package management operations must be executed via `npm`:

- Install dependencies: `npm install`
- Add packages: `npm install <package>`
- Remove packages: `npm uninstall <package>`
- Run scripts: `npm run <script>`

## TypeScript Code Style

**Explicit Return Types Required.** All exported functions in `.ts` and `.tsx` files must have explicitly typed return values.

## React Hooks

**Memoization Required.** All custom React hooks must implement proper memoization:

- Wrap all returned functions in `useCallback`
- Wrap all returned objects in `useMemo`

## Import Paths

**Use Path Aliases.** Always prefer `@/` imports over relative imports `../../`:

- Allowed: `../sibling` (one level above)
- Required: `@/platform/theme/useTheme` instead of `../../../platform/theme/useTheme`

## React Imports

**Import JSX Type Directly.** All `.tsx` files must import the JSX type for component return type annotations:

- Use: `import { type JSX } from "react";`
- For component return types: `function Component(): JSX.Element`
- Combine with other React imports: `import { useState, useEffect, type JSX } from "react";`
- Do NOT import the default `React` export unless you specifically need it (e.g., for `React.memo`, `React.forwardRef`)
