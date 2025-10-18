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
