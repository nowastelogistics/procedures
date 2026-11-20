# Shared workflows

## Docker image smoke tests

`docker.yml` accepts an optional `docker_smoke_test_command` (Bash). The command runs
in the caller's checkout after the image is built, pushed under its temporary CI tag,
and pulled by digest, before promotion. `IMAGE_REF` is the immutable image reference;
`NUGET_CONFIG` points to a temporary authenticated NuGet configuration.

```yaml
docker_smoke_test_command: >-
  dotnet restore Service.IntegrationTests --configfile "$NUGET_CONFIG" &&
  dotnet test Service.IntegrationTests --no-restore
  --results-directory ./TestResults --logger "trx;LogFileName=smoke.trx"
```

The test project starts the supplied image and its own dependencies. It must fail if
`IMAGE_REF` is missing; it must not build another application image. A nonzero command
exit fails the build job, preventing promotion, signing and Octopus release creation.
Temporary images may remain in the registry for diagnosis. TRX files in `TestResults`
are reported even when the command fails. Omit the input to retain existing behavior.

The build also exposes `nuget_config` as a BuildKit secret for Dockerfiles using
`RUN --mount=type=secret,id=nuget_config,required=true`. Legacy NuGet build arguments
remain available to existing callers.

NuGet configuration uses the SDK's `dotnet new nugetconfig` template and
`dotnet nuget add source`, rather than hand-written XML. Unlike the integration-test
workflow's persistent runner configuration, this file is created for each build and
removed afterward; it supplies both BuildKit and the smoke command.

## Required check and docs-only pull requests

`required.yml` is the one check branch protection requires (NWL-5649), so protection does
not depend on each repo's job names. `docs-only.yml` tells the caller whether a pull request
changes only the files its `allowed_paths` globs list (`*` within a folder, `**` across
folders); the caller then skips its build and tests. Both run on the self-hosted Linux runner.

```yaml
jobs:
  changes:
    uses: nowastelogistics/procedures/.github/workflows/docs-only.yml@master
    permissions:
      contents: read
      pull-requests: read
    with:
      allowed_paths: |
        README.md
        docs/**/*.md

  build:
    needs: changes
    if: needs.changes.outputs.docs_only != 'true'
    uses: nowastelogistics/procedures/.github/workflows/docker.yml@master
    # ...

  required:
    needs: [changes, build]
    if: always()
    uses: nowastelogistics/procedures/.github/workflows/required.yml@master
    with:
      results: ${{ toJSON(needs) }}
      docs_only: ${{ needs.changes.outputs.docs_only }}
```

The check is named `required / gate`. It passes when every job in `needs` succeeded, or when
the change is docs-only and every job in `needs` succeeded or was skipped; otherwise a
failed, cancelled or skipped job fails it. List every build and test job in `needs`. A rename counts with
both paths, and a pull request with no files or 3000 files (the API's limit) is never
docs-only. A pull request whose last commit carries `[skip ci]` runs no workflow, so the check
stays pending until a commit without it is pushed.

## AI review as github-actions[bot]

`ai-review.yml` posts a PR review that an agent prepared on a developer's machine, so the
review shows as `github-actions[bot]` instead of as that developer (NWL-5376). The
agent-skills helper `post-review.js` dispatches the repo's own `ai-review.yml` with the
review as base64 gzipped JSON; this workflow repeats the helper's refresh (PR open, head still
the reviewed sha, nobody else approved), posts one review with its inline comments, and can
dismiss an earlier changes request the bot posted for the same person. It never approves.
The posted body ends with a visible line `🤖 AI-review på uppdrag av <actor>` (a profile link, no
@-mention) and then `<!-- ai-review-requested-by: <actor>; request: <id> -->`, the actor taken from GitHub and
not from the payload; the agent-skills review queue and weekly retro read it to count the review as
that person's, so keep it as the body's last line. The request id (`post-review.js` sends one per
dispatch; a re-run reuses it) lets the workflow find a review GitHub stored although its answer was
lost, so a retry never posts twice. A re-run of a run only reports a review stored under its request id
and never posts: after an unknown outcome, reconcile on the PR and dispatch a new review. A changes request on the dispatching actor's own PR is refused,
as GitHub refuses it to the person. The token is the caller's,
so a review can only land in the repo that dispatched it. A repo opts in with this caller on
its default branch, under exactly this file name:

```yaml
# .github/workflows/ai-review.yml
name: AI review
run-name: "AI review PR #${{ inputs.pr }} (${{ inputs.request }})"

on:
  workflow_dispatch:
    inputs:
      pr:
        required: true
        type: number
      payload:
        required: true
        type: string
      request:
        description: Correlation id post-review.js uses to find this run.
        required: true
        type: string

concurrency:
  group: ai-review-${{ inputs.pr }}
  cancel-in-progress: false

jobs:
  post:
    permissions:
      pull-requests: write
    uses: nowastelogistics/procedures/.github/workflows/ai-review.yml@master
    with:
      pr: ${{ inputs.pr }}
      payload: ${{ inputs.payload }}
```

Without the caller, `post-review.js` posts with the developer's own GitHub access as before.
