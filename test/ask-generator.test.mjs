import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const workflow = parse(readFileSync(new URL('../.github/workflows/templates-ask.yml', import.meta.url), 'utf8'));
const install = workflow.jobs.build.steps.find(step => step.name === 'Install validation tool');
const calculator = fileURLToPath(new URL('../scripts/ci-version.ps1', import.meta.url));
const bash = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
  : 'bash';

// Exercise the workflow shell and its jq filter. Only NuGet search and installation are simulated.
const simulateNuGet = `
dotnet() {
  case "$1 $2" in
    "package search") printf '%s\\n' "$FEED" ;;
    "tool install") printf '%s\\n' "$*" ;;
    *) return 2 ;;
  esac
}
`;

const versions = [
  '2026.48.1-mh-test.9.2', '2026.48.1-MH-test.10.2', '2026.48.1-MH-test.10.11',
  '2026.48.1-MH-test.extra.99.1', '2026.48.1-MH-test2.99.1',
  '2026.49.1-MH-test.99.1', '2026.48.1-rc.999.1', '2026.48.1',
];

function runInstall(ref, available) {
  const version = execFileSync('pwsh', ['-NoProfile', '-File', calculator, '-Ref', ref,
    '-RunNumber', '842', '-RunAttempt', '1'], { encoding: 'utf8' }).trim();
  const packages = available.map(version => ({ id: 'NoEffect.Generator', version }));
  packages.push({ id: 'Other.Tool', version: '2026.48.1-MH-test.100.1' });
  const feed = JSON.stringify({ searchResult: [{ packages }] });
  return spawnSync(bash, ['-eo', 'pipefail', '-c', simulateNuGet + install.run], {
    encoding: 'utf8', env: { ...process.env, GITHUB_REF: ref, TEMPLATE_VERSION: version, FEED: feed },
  });
}

test('named release installs its latest generator, independently of template and RC counters', () => {
  assert.equal(install.env.TEMPLATE_VERSION, '${{ steps.version.outputs.version }}');
  const result = runInstall('refs/heads/release/2026.48.1-MH-test', versions);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trimEnd(), /tool install NoEffect\.Generator --global --version 2026\.48\.1-MH-test\.10\.11$/);
});

test('a named release with only RC packages fails before installation', () => {
  const result = runInstall('refs/heads/release/2026.48.1-MH-test', ['2026.48.1-rc.999.1']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /No matching NoEffect.Generator/);
  assert.doesNotMatch(result.stdout, /tool install/);
});

test('ordinary release still chooses the latest RC, including legacy RC versions', () => {
  for (const [available, expected] of [[versions, '2026.48.1-rc.999.1'], [['2026.48.1-rc00003'], '2026.48.1-rc00003']]) {
    const result = runInstall('refs/heads/release/2026.48.1', available);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.trimEnd().endsWith('--version ' + expected), result.stdout);
  }
});
