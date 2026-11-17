# Production data evidence for WMan.Api releases

Before publishing and tagging a production release, review the exact release diff against the deployed production baseline. For each changed data predicate, obtain endorsement of the full affected tenant scope. Run a read-only comparison of the old and proposed predicates against existing production data for every tenant in that scope before the manual Octopus deployment. A reviewer must check the linked code, scope and durable proofs. The gate checks the evidence structure and the reviewer verifies its truth and completeness. Never put data, credentials or secrets in release notes.

Create the GitHub Release for the tag, publish it as a release or prerelease, and include exactly one fenced block named `nowaste-production-data`. The `sha` is the full checked-out commit SHA, including when the tag is annotated. Each predicate must be an HTTPS GitHub code link in `nowastelogistics/WMan.Api`, pinned to that SHA and anchored to lines. Use durable HTTPS proof links. Names below are synthetic examples:

````markdown
```nowaste-production-data
{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"passed","rules":[{"predicate":"https://github.com/nowastelogistics/WMan.Api/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/src/Rule.cs#L1-L2","affectedTenants":["synthetic-a","synthetic-b"],"results":[{"tenant":"synthetic-a","status":"pass","proof":"https://evidence.example/a"},{"tenant":"synthetic-b","status":"pass","proof":"https://evidence.example/b"}]}]}
```
````

If no changed rule needs a data check, use the alternative below with a specific reviewed release-diff and deployed-baseline rationale and a link to reviewed scope evidence:

````markdown
```nowaste-production-data
{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"not-applicable","reason":"Reviewed release diff and deployed baseline: explain why no changed rule needs a data check.","proof":"https://evidence.example/reviewed-scope"}
```
````

The shared Docker workflow enforces this for official WMan.Api tag runs, including hotfixes, before building or promoting the image and before signing and Octopus release creation. Release-branch TEST builds and other repositories are unaffected. Stage the release metadata and review before triggering the tag workflow. If release metadata is unavailable or invalid, correct or publish the GitHub Release and rerun the failed workflow. CI only reads release metadata and does not run SQL. This gate cannot retroactively control manual redeployments of existing artifacts.
