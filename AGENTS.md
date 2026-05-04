# Code Standards

## Package Manager

- Always use `pnpm`. Never `npm` or `yarn`.

## Common Commands

```bash
pnpm build         # Compile TypeScript to dist/
pnpm test          # Run BATS shell tests
pnpm run test:ts   # Run Vitest unit tests
```

## TypeScript

- Strict mode throughout. No `any` types. No `@ts-ignore`.
- Do not use `null` unless required for API compatibility or when explicitly distinguishing `null` from `undefined`. Prefer `undefined` for absent/optional values throughout the codebase.
- Use `async/await`, not `.then()` chains.

## Code Conventions

- **Favor type inference.** Explicit generic type arguments (for example, `someFn<Foo>(...)`) are a code smell when TypeScript can infer them.
- **No spurious variables.** Do not assign a value to a variable only to immediately return it on the next line — return the expression directly instead.
- **No IIFEs.** Do not use immediately-invoked function expressions. Extract the logic into a named helper function or compute the value with a plain expression instead.
- **No function-style imports.** Do not use inline `import("…").Type` syntax in type annotations. Use module-level `import type { … } from "…"` statements at the top of the file.
- **No unnecessary helpers.** Do not extract logic into a helper function unless it separates significant logic or belongs in a different module. Three similar lines is better than a premature abstraction.
- **Enums and constant objects** should be kept in alphabetical order to minimize merge conflicts.

## File Organization

- **Source files**: Target under ~200 lines; consider splitting by logical concern around ~300 lines. Existing large files (`rotate-keys.ts`) are known exceptions until refactored.
- **Test files**: Target under ~300 lines. Place in `src/__tests__/` using `.test.ts` extension. When splitting, organize into a `{module}-tests/` subdirectory.
- Use named exports. Default exports are not used in this project.

## Testing Conventions

- Use `describe`/`it` from Vitest (not `test`).
- Shell behavior is tested with BATS (`tests/bats/`); TypeScript logic is tested with Vitest (`src/__tests__/`).

### Test Design

- **Control inputs and outputs.** Do not rely on a function's default return values as the assertion of a test unless the purpose of the test is specifically to verify those defaults. Use explicit, non-default values so a passing test proves the value was produced by logic, not inherited from an initializer.
- **One reason to fail per test.** Each test should assert a single logical outcome. Helper functions are fine, but if a test invokes two functions from the codebase it should be explicitly testing how those two interact. Incidental coverage of a second function is not a reason to combine assertions.
- **Keep tests simple.** A failing test should make it immediately obvious whether the failure is a bug or an intentional change in behavior. If understanding a failure requires reading more than one layer of test setup or multiple assertions, split the test.
- **Granularity scales with level of abstraction.** Low-level functions (pure utilities, parsers) warrant thorough edge-case coverage. High-level functions (service orchestration) should have smoke tests that verify they correctly apply the lower-level logic — not re-test every edge case that belongs in the lower-level tests.

## Git Conventions

- Branch names: lowercase with hyphens, prefixed by type: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`, `ci/` (e.g., `feat/yaml-driven-init-config`).
- Commit messages: imperative verbs (Add, Implement, Fix, Update, Extract, Remove). No `feat:`/`fix:` prefixes within a feature branch — this repo uses squash merges, so only the PR title (which must follow Conventional Commits) enters main's history and drives semantic-release versioning.
- PR titles must follow Conventional Commits format: `<type>: description` or `<type>(<scope>): description`. Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`, `build`, `revert`. A `!` suffix is allowed before the colon to denote breaking changes (e.g., `feat!: remove legacy auth`). This is enforced by CI.
- PR descriptions must use `Closes #123`, `Fixes #123`, or `Resolves #123` to trigger GitHub's automatic issue close on merge. Phrases like "Addresses #123" or "Related to #123" do NOT trigger auto-close.
- PR descriptions must be descriptive prose, not a task checklist. A good description covers: (1) what the PR does and why, (2) key technical decisions or non-obvious implementation choices.
