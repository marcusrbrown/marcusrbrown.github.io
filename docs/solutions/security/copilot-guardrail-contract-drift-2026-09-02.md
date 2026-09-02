---
title: A guardrail that allowed every command it existed to block
date: 2026-09-02
category: security
module: agent tooling and CI guardrails
problem_type: security_issue
component: tooling
symptoms:
  - '`git push --force origin main` returned `{"action":"allow"}` from the Copilot pre-tool-use hook'
  - "59 hook tests passed against a guardrail that blocked nothing"
  - "Destructive commands were still permitted after the payload fix, via `git -C <path>` and other global options"
root_cause: wrong_api
resolution_type: code_fix
severity: high
related_components:
  - .github/hooks/pre-tool-use.ts
  - .github/hooks/copilot-hook-utils.ts
  - .github/workflows/fro-bot.yaml
  - .github/workflows/blog-refresh.yaml
tags:
  - copilot
  - hooks
  - contract-drift
  - guardrail
  - silent-failure
  - github-actions
  - validation
---

# A guardrail that allowed every command it existed to block

## Problem

`.github/hooks/pre-tool-use.ts` exists to block destructive shell commands issued by GitHub Copilot. It permitted all of them, and had done so since it was written. A workflow-and-hooks audit found it alongside six smaller defects sharing one shape: a check reporting success while validating nothing.

That shape is already documented for CI and reporting in [checks that pass while validating nothing](../best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md). This doc covers the security-layer instance, whose root cause is different: the handler was adapted from a sibling ecosystem and never revalidated against its actual host contract.

## Symptoms

Piping Copilot's real payload into the hook:

```console
$ echo '{"toolName":"bash","toolArgs":"{\"command\":\"git push --force origin main\"}"}' \
    | node .github/hooks/pre-tool-use.ts
{"action":"allow"}
```

The 59-test suite covering this file passed. `pnpm lint`, `pnpm build`, and type checks were all clean.

## What Didn't Work

**Trusting the test suite.** The tests constructed payloads in the shape the implementation looked for and asserted the schema the implementation emitted, so they verified the code against itself. A guardrail that blocked nothing had full green coverage. The test rewrite mattered more than the code fix.

**Fixing the reported case.** Once patterns actually evaluated, the same evasion surfaced three times in three review rounds, because each round fixed the example in front of it:

1. The pattern list fell to argument reordering and separators — `rm -r -f /`, `rm -rf -- /`, `rm --preserve-root -rf /`
2. The subcommand locator fell to git global options — `git clean -fdx` denied, `git -C ../other clean -fdx` allowed
3. The pre-existing force-push and hard-reset rules were never routed through the locator at all — `git -C ../other push --force origin main` allowed

Only an inventory of every rule and the matcher path it takes ended the sequence.

**Assuming an exception fails closed.** Copilot treats malformed stdout as _no output_ and falls through to the normal permission flow. Only a crash or a nonzero exit denies, and a timeout fails open. A parse error therefore produced a permissive result unless the handler denied explicitly.

## Solution

Read the command from Copilot's documented location, and answer in Copilot's documented schema.

The config key selects the payload shape. `copilot-guardrails.json` registers lowercase `preToolUse`, which means camelCase fields and the arguments under **`toolArgs`** — the field the old resolver never looked at. The contract types `toolArgs` as `unknown`; the documented example carries a JSON-encoded string, which is what the CLI sends in practice:

```json
{
  "sessionId": "…",
  "toolName": "bash",
  "toolArgs": "{\"command\":\"git push --force origin main\",\"description\":\"Push changes\"}"
}
```

Because the type is open, `resolveCommandText` in `.github/hooks/copilot-hook-utils.ts` accepts both the string form and an already-parsed object rather than assuming either. Registering PascalCase `PreToolUse` instead selects a compatibility shape using `tool_name` and `tool_input`, which it also handles.

The resolver deliberately checks a wider set of candidates than the two documented shapes — `toolArgs`, `toolInput`, `tool_input`, `command`, `input` — and extracts recursively from nested values. Preserve that breadth. Narrowing it to whatever the host happens to send today is how the original defect happened.

Narrowing to string-only would be its own version of this bug: a guardrail that rejects a documented-valid invocation is as broken as one that permits an invalid command.

The response contract is `permissionDecision` with values `allow`, `deny`, or `ask`, and `permissionDecisionReason` required on a denial:

```ts
function writeDecision(response: {permissionDecision: "allow" | "deny"; permissionDecisionReason?: string}): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}
```

Failing closed is explicit, because the host does not do it: malformed stdin, an unrecognised payload shape, unparseable bash arguments, and a bash call with no command all deny. A non-bash tool with no `command` allows, since file-tool arguments legitimately carry `path` instead.

Matcher rules resolve the git subcommand through `locateGitSubcommand()`, which skips recognised global options (`-C`, `-c`, `--git-dir=`, `--work-tree=`, `--no-pager`, and the rest) and treats an unrecognised leading option as unparseable — denying rather than falling through.

```
git -C ../other push --force origin main  → deny     git -C ../other push origin main      → allow
git -C ../other clean -fdx                → deny     git -C ../other checkout -b feature/x → allow
git --git-dir=/x push -f origin main      → deny     git -c user.name=x commit -m msg      → allow
rm -rf -- /                               → deny     rm -rf ./dist                         → allow
sudo rm -rf /                             → deny     ls -la                                → allow
```

The allow column is load-bearing. `git checkout -b`, `git restore --staged`, and `rm -rf ./dist` are everyday commands; blocking any of them makes the guardrail obstructive enough to get disabled, which is worse than the gap it closes.

**The matcher is token-based, not a shell parser.** `commandSegments()` splits on `[|;&]` and then on whitespace. It does not interpret quoting, escaping, or command substitution, so quoted and shell-escaped variants sit outside its model and are an accepted gap — not something the matrix above covers. That boundary is deliberate: this guards an agent's own tool calls against destructive accidents, and anyone with shell access has better options than defeating a token matcher. Stating it matters, because a matrix that looks exhaustive invites exactly the false confidence this doc is about.

## Why This Works

`{action, message}` was never a Copilot contract at any version. It matches Claude Code's hook ecosystem, which is the tell: the handler was ported across ecosystems and kept the source ecosystem's envelope. A schema that looks plausible because it came from a real system is more dangerous than an obviously invented one — it survives review.

The tests could not catch it because they encoded the same assumption as the code. Coverage measures how much of the implementation runs, not whether the implementation talks to anything real. Only an assertion against the _documented_ contract, exercised end-to-end through the actual script, distinguishes the two.

Contract: <https://docs.github.com/en/copilot/reference/hooks-reference>

## Prevention

**Test the documented contract, not the implementation's.** When integrating with an external host, at least one test must use a payload captured from or copied out of the vendor's documentation, and assert the vendor's response schema. At least one should run the real entry point as a subprocess — both defects here were only visible end-to-end.

**Treat cross-ecosystem adaptation as revalidation.** Porting a handler between agent ecosystems means re-reading the target's contract, not adjusting the parts that obviously differ.

**Establish the host's failure semantics before assuming fail-closed.** If malformed output falls through to permissive handling, the handler must deny explicitly on every error path. Verify by feeding it garbage.

**Verify matchers as deny/allow pairs.** A denial test alone cannot distinguish a working matcher from one that blocks everything. Over-blocking is the failure that gets a control turned off.

**When fixing an evasion, audit the rule set.** Spot-fixing the reported case leaves siblings on the old path. Produce an inventory of which matcher path each rule takes so the next gap is visible by inspection rather than found in review.

**Distinguish a valid negative from a failed lookup.** `fro-bot.yaml` resolved collaborator permission with `2>/dev/null || true`, making an API failure indistinguishable from a denial — the request then concluded green having done nothing. The fix has its own trap: GitHub returns **404** for "not a collaborator", a legitimate answer. Treating every non-2xx as failure would break ordinary denial.

**A check that cries wolf fails the same way as one that always passes.** Three test suites failed under parallel load and passed in isolation (subprocess startup contention from `pnpm exec tsx`, not temp-path collisions). The unreliable signal trained a subagent into pushing with `--no-verify`. Both ends of the reliability spectrum end with nobody reading the check.

## Same Audit, Other Findings

Smaller defects found alongside the guardrail, each worth checking for in similar code:

- Instructions to an agent carry the same argument-delivery hazards as scripts. `pnpm test -- --coverage` silently produces no coverage, because pnpm swallows everything after `--`; the third occurrence of this defect in this repository.
- `git diff --quiet` is blind to untracked files, so a change check gated on newly created artifacts reports no change. Use `git status --porcelain` when the output includes new files.
- An output sourced from an action that does not declare it evaluates falsy forever. `pnpm/action-setup` declares only `dest` and `bin_dest`; `actions/setup-node` is what declares `cache-hit`.
- A condition can be correct for the wrong reason. A trailing `github.event_name != 'workflow_run'` term made the preceding check unreachable, while the real filtering lived in a pinned callee.
- Write credentials on disk before `pnpm install` are exposed to dependency lifecycle scripts. Nothing needed them during installation.

## Related Issues

- [Checks that pass while validating nothing](../best-practices/checks-that-pass-while-validating-nothing-2026-09-01.md) — the CI and reporting instance of this defect class (#300–#326)
- #336 / PR #341 — the guardrail contract fix
- #344 — matcher evasion at three depths
- #337 / PR #343 — credentials on disk during dependency installation
- #338 / PR #350 — swallowed coverage flag and silent permission-lookup failure
- #339 / PR #349 — change detection blind to untracked files
- #340 / PR #342 — CI outputs that report nothing
- #348 / PR #351 — load-dependent test flakiness that trained a `--no-verify` bypass
- #270, #309 — earlier occurrences of the pnpm argument-swallowing defect
