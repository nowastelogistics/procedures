$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '../scripts/ci-version.ps1'
$examples = @{
    'refs/pull/3015/merge' = '0.0.0-pr.3015.842.2'
    'refs/heads/feature/NWL-5613' = '0.0.0-ci.842.2'
    'refs/heads/release/2026.48.1' = '2026.48.1-rc.842.2'
    'refs/heads/release/2026.48.1-MH-test' = '2026.48.1-MH-test.842.2'
    'refs/tags/2026.48.1-beta' = '2026.48.1-beta'
    'refs/tags/2026.48.1' = '2026.48.1'
    'refs/tags/2026.01.01' = '2026.1.1'
}
foreach ($ref in $examples.Keys) {
    $actual = & $script -Ref $ref -RunNumber 842 -RunAttempt 2
    if ($actual -cne $examples[$ref]) { throw "Unexpected version '$actual' for '$ref'." }
}
foreach ($ref in 'refs/tags/latest', 'refs/heads/release/2026.54.1', 'refs/tags/2026.48.1-beta.01') {
    try { & $script -Ref $ref } catch { continue }
    throw "Unexpectedly accepted '$ref'."
}
Write-Host 'CI version cases passed.'
