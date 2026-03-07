# scripts/

Build analysis, test automation, and one-time verification scripts.

## Active Scripts

| Script | Purpose | Used By |
| --- | --- | --- |
| `analyze-build.ts` | Bundle size analysis + performance budgets + GitHub job summaries | CI (`pnpm run analyze-build`) |
| `artifact-management.mjs` | Test artifact retention + cleanup + optimization | Manual |
| `generate-test-badges.mjs` | README badge generation from coverage/test data | Manual |
| `test-dashboard.mjs` | Aggregates test results → dashboard data | Manual |
| `visual-artifact-manager.mjs` | Visual regression artifact management (size thresholds, cleanup) | Manual |
| `configure-branch-protection.mjs` | GitHub branch protection rule setup via API | One-time |

## One-Time Migration/Verification Scripts

These were used during repo setup and migration. Safe to ignore for ongoing work.

| Script                       | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `migrate-repo.sh`            | Repository migration                                       |
| `verify-brand-sections.sh`   | Validates HTML structure + section content + canonical URL |
| `verify-dns-baseline.sh`     | DNS configuration check                                    |
| `verify-domains.sh`          | HTTP/TLS config for marcusrbrown.com routing               |
| `verify-evidence-naming.sh`  | Lints artifact naming conventions                          |
| `verify-history-parity.sh`   | Git history parity after migration                         |
| `verify-migration-parity.sh` | Commit/tag/author match between source and target repos    |
| `verify-repo-bootstrap.sh`   | Validates repo bootstrap state                             |

## Conventions

- TypeScript scripts: `.ts` extension, run via `tsx`
- Node scripts: `.mjs` extension (pure ESM)
- Shell scripts: `.sh` extension
- Performance budgets in `analyze-build.ts`: JS <500KB (warn), <2MB (max)

## Anti-Patterns

- **Don't add scripts to `package.json` without testing** — CI depends on these
- **Don't modify `analyze-build.ts` budget thresholds** without updating `.github/ACTIONS.md`
