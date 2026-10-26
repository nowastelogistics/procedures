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
