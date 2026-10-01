# Release-safety audit

This is the durable inventory taken on 2026-10-01 from 50 local checkouts representing 49 distinct GitHub origins. The declared-test-project count comes from each origin's project declarations, not a filename heuristic; Node entry points were audited separately. A declaration is not proof that a test command runs. Workflow behavior remains unverified until its repository has an executable gate.

| Checkout | Declared test projects | Status |
| --- | ---: | --- |
| Edrop.API | 3 | declarations only |
| Fraktsedel | 0 | declarations only |
| mimer_general | 0 | declarations only |
| noeffect-ui | 0 | Node Vitest entry point |
| noeffect-viewviewer | 0 | Node Mocha dependency, no test script |
| NoEffect.Api | 3 | declarations only |
| NoEffect.Views | 0 | declarations only |
| Nowaste | 7 | declarations only |
| Nowaste.AGVService | 1 | declarations only |
| Nowaste.CQRS | 1 | declarations only |
| nowaste.database.archiveservice | 3 | declarations only |
| nowaste.database.deployservice | 2 | declarations only |
| Nowaste.Documents | 1 | regression gate added in NWL-5376 |
| Nowaste.Edi.Integrations | 2 | declarations only |
| Nowaste.Edi.Integrations_NAJELL | 2 | duplicate origin of Nowaste.Edi.Integrations |
| Nowaste.HealthCheck | 1 | declarations only |
| Nowaste.Inbound.Portal | 1 | declarations only |
| Nowaste.Integration.DgOffice | 1 | declarations only |
| Nowaste.Integration.Domain | 1 | declarations only |
| Nowaste.Integration.Internal | 2 | declarations only |
| Nowaste.Integration.Lss | 2 | declarations only |
| Nowaste.Integration.Mestergruppen | 1 | declarations only |
| Nowaste.Integration.Specter | 1 | declarations only |
| Nowaste.Integration.SwisslogAutostore | 3 | declarations only |
| Nowaste.Integration.TisCustoms | 1 | declarations only |
| Nowaste.Integrations.Domino | 1 | declarations only |
| nowaste.integrations.kardex | 2 | declarations only |
| Nowaste.Integrations.Knapp | 1 | declarations only |
| Nowaste.Integrations.SGASortConveyor | 1 | declarations only |
| Nowaste.M3 | 1 | declarations only |
| Nowaste.MessageQueue | 1 | declarations only |
| Nowaste.Misc | 0 | declarations only |
| Nowaste.Order | 6 | declarations only |
| Nowaste.OrderGenerator | 1 | declarations only |
| Nowaste.Reporting | 1 | existing Windows deployment test gate |
| Nowaste.Scheduling | 2 | existing unit and SQL-job gate before Docker |
| Nowaste.SOX | 1 | declarations only |
| Nowaste.Test | 1 | declarations only |
| Nowaste.Transport | 2 | declarations only |
| PalletIntegration | 1 | declarations only |
| PrintQueueService | 1 | existing Windows deployment test gate |
| printservice | 1 | PR #41 regression gate: 49 passed, including 8 new disk/controller cases |
| procedures | 0 | workflow policy tests added in NWL-5376 |
| terraform | 0 | declarations only |
| WMan.API | 8 | integration and unit gates added in NWL-5376 |
| WMan.Api.Localization | 1 | declarations only |
| WMan.OrderSchedulerService | 2 | declarations only |
| WMan.Types | 0 | declarations only |
| WMan.WebClient | 0 | no root Node test script |
| WMan.WebClient.Templates | 0 | declarations only |

The inventory evidence was collected from test-project declarations and Node entry points. The durable producer evidence is [WManApi.yml](https://github.com/nowastelogistics/WMan.Api/blob/feature/NWL-5376_Regression_And_Release_Gates/.github/workflows/WManApi.yml), [Documents RegressionChecks.yml](https://github.com/nowastelogistics/Nowaste.Documents/blob/feature/NWL-5376_Regression_And_Release_Gates/.github/workflows/RegressionChecks.yml), and [printservice RegressionChecks.yml](https://github.com/nowastelogistics/printservice/blob/feature/NWL-5376_Regression_And_Release_Gates/.github/workflows/RegressionChecks.yml). Run npm run audit-consumers -- --wman-api <path> --documents <path> --printservice <path> from this repository to re-check those actual worktrees without embedding a machine-specific path.

## Coverage and gaps

Reusable callers now receive strict test-result reporting only when they promise tests. The rule prevents a missing report, reporter error, missing passed output, or zero passed tests from continuing to image promotion, package publication, or deployment. It intentionally keeps optional test inputs for callers that do not supply a test project.

NWL-5376 also added WMan.API integration and unit regression gates and Nowaste.Documents routing coverage. The WMan SQL audit has 65 raw unresolved entries: 60 SCHEMA-GAP and 5 SQL-DEFECT, down from a 117-entry baseline. It removed 52 entries: 34 are now executable with schema or real-view support, 10 named absent methods, and 8 were stale data or other transitions. Those raw classifications are diagnostic data, not coverage counts. The executable coverage is separate: six real-view and three schema cases ran in the 3,603-passed, 5-skipped integration suite; the verified unit baseline is 2,747, and the 2,784 total includes 37 additional unit cases. Existing-baseline DATA and OTHER entries now fail; entries without a baseline remain diagnostic.

printservice PR #41 now adds an unfiltered regression gate, tracks test source in the deployment workflow paths, and proves exact byte roundtrips, filename flattening, company isolation, truncating overwrite, missing reads, failed roots, and controller read failures. Its 49 passed tests include eight new cases. Remaining gaps include the fake WMan view fixture, the absent WMan.WebClient test script, PDF rendering, database/schema integration beyond repository fixtures, and frontend behavior. Those gaps require repository-specific work before this inventory can be treated as execution evidence.

The next priorities are merging the producer PRs before the Terraform branch-protection rollout, the WMan.WebClient test entry point, and the repository-specific SQL and fixture work. The table cannot establish runner availability, secrets, test discovery, database behavior, visual PDF correctness, or a successful publish; those require each repository's executable gate.

## Observed TEST delivery

The [Documents legacy Windows TEST job 110280930117](https://github.com/nowastelogistics/Nowaste.Documents/actions/runs/36835232324/job/110280930117) for [PR #180](https://github.com/nowastelogistics/Nowaste.Documents/pull/180) at `9d345690` passed 20 tests and uploaded the package, but failed while creating the Octopus release with `cannot find the item` for project `nowastedocuments` and channel `Development`. The [2026-08-31 job 99464877521](https://github.com/nowastelogistics/Nowaste.Documents/actions/runs/33384789654/job/99464877521) failed in the same way, so this batch did not introduce the failure. The new [Docker TEST run 36835232338](https://github.com/nowastelogistics/Nowaste.Documents/actions/runs/36835232338) built and signed successfully. The missing Octopus object is unknown; this evidence does not establish that the project was deleted or that the route is retired. The legacy route remains active while its requirement is decided.

## Observed infrastructure drift

The [Terraform PR #497 CI plan](https://github.com/nowastelogistics/terraform/actions/runs/36832494401/job/110272074640) on 2026-10-01 reported 0 additions, 4 changes and 0 deletions. Three changes add the requested status checks. The fourth restores the existing review policy on `nowaste.database.deployservice` master: one approving review, code-owner review and stale-review dismissal. That repository definition was not changed in this batch; the plan exposed a difference between configured policy and GitHub's applied state. The extra restoration is documented in the draft PR and has not been applied. Required-check rollout remains dependent on merging the three producer PRs first.
