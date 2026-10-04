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
