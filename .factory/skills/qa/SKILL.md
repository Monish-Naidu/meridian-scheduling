---
name: qa
description: >
  Run QA tests for meridian-scheduling. Analyzes the git diff to determine affected areas,
  runs the relevant API flows against a local server started from the branch, and generates
  diff-targeted tests. Uses curl for all HTTP calls (API-only project).
  Use when testing PRs, releases, or smoke testing the API.
---

# QA Orchestrator

**SCOPE: This skill performs manual/functional QA only -- verifying that the API actually works by calling it as a real client would. Do NOT run or report on CI checks, linting, ESLint, typecheck, unit tests (Vitest), or any static analysis. Those are handled separately.**

## Step 1: Load Configuration

Read `.factory/skills/qa/config.yaml` for the environment, personas, app definitions, cleanup, and failure-learning settings.

This project has no interactive app (web, Electron, terminal/TUI, or desktop), so droid-control is not used and no video is recorded. If an interactive app is ever added to `apps:` in config, invoke the `droid-control` skill for it, use its Capture and Verify stages, and load Compose only when both `video_evidence` and `droid_control.compose` are true in config. Read those values on every run; never cache them.

## Step 2: Determine Target Environment

Use `default_target` from config (`local`) unless the user names another target. Respect every entry in the environment's `restrictions`:

- Always test the branch's own code by starting the API locally. Never fall back to a remote environment.
- Never point `DB_PATH` at `data/meridian.db` or any shared or production database.
- Never set `SENTRY_DSN` and never call real Epic endpoints.

## Step 3: Analyze Git Diff

Determine the diff base: in CI it is passed in the prompt (for example `origin/main`); locally, use `origin/main`. Run `git diff --name-only <base>...HEAD` and then `git diff <base>...HEAD` for the content. Map changed files to apps using `path_patterns` in config.

Files that don't match ANY app's path_patterns (for example `tests/**`, `.factory/**`, `.github/**`, `scripts/**`, `README.md`, `AGENTS.md`) are NOT associated with any app. Do NOT run app flows for them.

For each affected app:

- Run ONLY that app's relevant flows from its sub-skill
- Generate ADDITIONAL targeted tests based on the specific changes in the diff

If NO app is affected by the diff, report a single INCONCLUSIVE row: "No app code changed -- QA not applicable for this diff." Do NOT run any app flows.

## Step 4: Pre-flight Checks (affected apps only)

For the `api` app, follow the "Testing Target" section of `.factory/skills/qa-api/SKILL.md`: install dependencies if needed, start the server on a throwaway database, and wait for `/health`.

If a pre-flight check fails, report every affected flow as BLOCKED with the exact error and remediation steps.

## Step 5: Execute Diff-Relevant Flows Only

For each affected app, read its sub-skill at `.factory/skills/qa-<app-name>/SKILL.md`. It contains a MENU of flows. You must:

1. Read the diff carefully and identify which flows are relevant to the change
2. Run those flows PLUS adjacent flows that verify the change integrates correctly (for example, a booking change should also re-check the slot list and cancel/rebook)
3. Do NOT run completely unrelated flows
4. If no existing flow covers the change, write a NEW ad-hoc test that directly verifies the changed behavior
5. Do NOT run unit tests, lint, typecheck, or any automated test suite

## Step 6: Evidence Capture

Use **text evidence only**: the exact curl command (method and path), the HTTP status, and a trimmed JSON excerpt showing the field that proves the result. Embed each as a labeled fenced code block.

**PHI rule (from AGENTS.md):** never put patient names, emails, phone numbers, or dates of birth in the report or in files under `qa-results/`, even though the data is fictional. For `/visits/:id/context` and any Patient resource, show only IDs, resource types, counts, and status fields. Redact anything else as `"<redacted>"`.

Do not embed images. Save any raw response files you need under `./qa-results/$RUN_ID/` only after redacting them; the workflow uploads `qa-results/` as an artifact.

## Step 7: Test Quality Gate

1. CHANGE-SPECIFIC FIRST. At least half the tests must verify the new or changed behavior itself.
2. INTEGRATION TESTS ARE VALID. Checks that the change works with neighboring endpoints are good.
3. NO UNRELATED FLOWS.
4. NO AUTOMATED TEST SUITES. Do NOT run vitest, npm test, or similar.
5. NEGATIVE TESTS. Include at least 1 test of an error path or boundary related to the change.
6. INTERACTIVE TESTING. Call the running API over HTTP as a client would.
7. INCONCLUSIVE IF UNSURE. If you cannot say what the PR changes, report INCONCLUSIVE rather than PASS.

## Step 8: Handle Failures

**Never silently skip a flow. If a flow cannot complete, report it as BLOCKED with what was tried and how the user can fix it.** Then continue with the next flow; never abort the whole run for one failure.

Always run the sub-skill's cleanup (stop the server, delete the temporary database directory), even after failures.

## Step 9: Generate Report

Write the report to `./qa-results/report.md` using `.factory/skills/qa/REPORT-TEMPLATE.md`:

- Start with `## QA Report` followed by the results table
- Result column uses: :white_check_mark: PASS, :x: FAIL, :no_entry: BLOCKED, :warning: FLAKY, :grey_question: INCONCLUSIVE
- Keep it concise: the table, a short "Action Required" section if needed, and all evidence in one collapsed `<details>` block
- Do NOT add a behavioral change summary, metadata tables, or long explanations
- Do NOT report setup steps (install, server start, health wait) as test rows

## Step 10: Suggest Skill Updates (Failure Learning)

`failure_learning` in config decides the strategy. With `suggest_in_report`, add the section below to the report only, and do NOT write `qa-results/skill-updates.json`.

After the report, check whether any BLOCKED or FAIL result revealed a new **testing environment insight** (for example, a port conflict pattern, a startup delay, or a date that the server clock rejects) that is not already in the sub-skill's Known Failure Modes. Do not suggest fixes for skill typos or for behavior changes that the PR intended.

## Suggested Skill Updates (N issues found)

| #   | Severity        | File     | Issue               | Fix Prompt                                                                           |
| --- | --------------- | -------- | ------------------- | ------------------------------------------------------------------------------------ |
| 1   | <emoji> <level> | `<file>` | <short description> | <details><summary>Copy</summary><br>`<full droid prompt to fix the issue>`</details> |

Severity levels:

- `🔴 Breaking`: causes failures every run
- `🟡 Degraded`: intermittent failures or suboptimal behavior
- `🔵 Info`: new knowledge that improves future runs

Each Fix Prompt must be a self-contained instruction that Droid can run when pasted. If there are no new insights, omit this section entirely.
