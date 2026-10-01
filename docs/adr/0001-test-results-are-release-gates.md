# ADR 0001: Test results are release gates

## Context

The reusable Docker, Linux integration, Windows integration, UI test, NuGet, NuGet Windows, and Windows deployment workflows can build and publish release artifacts. Their callers choose whether a test project exists, except that the three test-only workflows are themselves test routes. A conditional reporter previously skipped a missing TRX file, leaving a successful publish path after a promised test run produced no report.

## Decision

When a caller promises tests, the workflow runs `dorny/test-reporter` with `fail-on-empty` and `fail-on-error`. Empty means no result files; it does not mean zero test cases. A following gate fails if the reporter has no `passed` output or reports zero passing tests. The gate is before promotion or publish steps.

`project_test_file_path` remains optional in the NuGet and Windows deployment workflows for callers that do not have tests. Their reporter and passed-result gate activate only when that input is supplied. The three test-only workflows require the input; no available caller omits it. Docker callers retain the optional `docker_has_tests` input and opt into the same strict gate.

## Consequences

The workflows distinguish an absent report from a valid zero-case report, while still requiring at least one passing test for a route that claimed tests. [workflow-policy.test.mjs](../../test/workflow-policy.test.mjs) parses the workflows and evaluates their GitHub expressions with the official expressions package; it covers promised, bypassed, missing, zero-passing, and passing states. It does not execute a GitHub runner, Docker image, test project, package publish, or deployment.
