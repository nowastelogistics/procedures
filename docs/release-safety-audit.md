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
| Nowaste.Reporting | 1 | declarations only |
| Nowaste.Scheduling | 2 | declarations only |
| Nowaste.SOX | 1 | declarations only |
| Nowaste.Test | 1 | declarations only |
| Nowaste.Transport | 2 | declarations only |
| PalletIntegration | 1 | declarations only |
| PrintQueueService | 1 | declarations only |
| printservice | 1 | Docker route promises tests; PR and test-path gaps remain |
| procedures | 0 | workflow policy tests added in NWL-5376 |
| terraform | 0 | declarations only |
| WMan.API | 8 | integration and unit gates added in NWL-5376 |
| WMan.Api.Localization | 1 | declarations only |
| WMan.OrderSchedulerService | 2 | declarations only |
| WMan.Types | 0 | declarations only |
| WMan.WebClient | 0 | no root Node test script |
| WMan.WebClient.Templates | 0 | declarations only |

The inventory evidence was collected from test-project declarations and Node entry points. The durable producer evidence is [WManApi.yml](https://github.com/nowastelogistics/WMan.Api/blob/feature/NWL-5376_Regression_And_Release_Gates/.github/workflows/WManApi.yml), [Documents RegressionChecks.yml](https://github.com/nowastelogistics/Nowaste.Documents/blob/feature/NWL-5376_Regression_And_Release_Gates/.github/workflows/RegressionChecks.yml), and [printservice DocumentStore.yml](https://github.com/nowastelogistics/printservice/blob/master/.github/workflows/DocumentStore.yml). Run npm run audit-consumers -- --wman-api <path> --documents <path> --printservice <path> from this repository to re-check those actual worktrees without embedding a machine-specific path.

## Coverage and gaps

Reusable callers now receive strict test-result reporting only when they promise tests. The rule prevents a missing report, reporter error, missing passed output, or zero passed tests from continuing to image promotion, package publication, or deployment. It intentionally keeps optional test inputs for callers that do not supply a test project.

NWL-5376 also added WMan.API integration and unit regression gates and Nowaste.Documents routing coverage. The WMan SQL audit has 65 raw unresolved entries: 60 SCHEMA-GAP and 5 SQL-DEFECT, down from a 117-entry baseline. It removed 52 entries: 34 are now executable with schema or real-view support, 10 named absent methods, and 8 were stale data or other transitions. Those raw classifications are diagnostic data, not coverage counts. The executable coverage is separate: six real-view and three schema cases ran in the 3,603-passed, 5-skipped integration suite; the 2,784-unit baseline was previously verified. Existing-baseline DATA and OTHER entries now fail; entries without a baseline remain diagnostic.

The remaining gaps include the fake view fixture and the absent WMan.WebClient test script. printservice was inspected but has not been changed in this batch; it is the expected uncovered deployment route. Those gaps require repository-specific work before this inventory can be treated as execution evidence.

The next priorities are the approved printservice producer PR gate and source-path trigger, the WMan.WebClient test entry point, and the repository-specific SQL and fixture work. The table cannot establish runner availability, secrets, test discovery, database behavior, visual PDF correctness, or a successful publish; those require each repository's executable gate.
