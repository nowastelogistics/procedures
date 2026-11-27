import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';

const action = parse(readFileSync(new URL('../.github/actions/gitversion-optimization/action.yml', import.meta.url), 'utf8'));
const script = action.runs.steps[0].run;
const bash = process.platform === 'win32'
  ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
  : 'bash';
const defaults = String.raw`major-version-bump-message: "\\+semver:\\s?(breaking|major)"
minor-version-bump-message: "\\+semver:\\s?(feature|minor)"
patch-version-bump-message: "\\+semver:\\s?(fix|patch)"
no-bump-message: "\\+semver:\\s?(none|skip)"`;

function fixture(t) {
  const tempRoot = realpathSync(tmpdir());
  const dir = mkdtempSync(join(tempRoot, 'gitversion-optimization-'));
  t.after(() => {
    const actual = realpathSync(dir);
    assert.equal(actual, dir);
    assert.equal(dirname(actual), tempRoot);
    assert.match(basename(actual), /^gitversion-optimization-[A-Za-z0-9]+$/);
    rmSync(actual, { recursive: true });
  });
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'Initial commit']);
  writeFileSync(join(bin, 'dotnet-gitversion'), '#!/usr/bin/env bash\n[[ "$*" == "--roll-forward Major /config GitVersionConfig.yml /showconfig" ]] || exit 1\ncat "$TEST_CONFIG"\n', { mode: 0o755 });
  return { dir, bin };
}

function runCheck(f, config = defaults) {
  const output = join(f.dir, 'output');
  const configFile = join(f.dir, 'effective-config');
  const scriptFile = join(f.dir, 'action.sh');
  writeFileSync(output, '');
  writeFileSync(configFile, config);
  writeFileSync(scriptFile, script);
  const result = spawnSync(bash, ['-e', '-o', 'pipefail', scriptFile], {
    cwd: f.dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: f.bin + delimiter + process.env.PATH, TEST_CONFIG: configFile, GITHUB_OUTPUT: output }
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(output, 'utf8').trim().split('\n').at(-1).trim();
}

test('enables the override only for the known rules and marker-free history', t => {
  const f = fixture(t);
  assert.equal(runCheck(f), 'override-config=commit-message-incrementing=Disabled');
  assert.equal(runCheck(f, defaults.replace('(fix|patch)', '(custom|patch)')), 'override-config=');
  assert.equal(runCheck(f, defaults + '\n' + defaults.split('\n')[0]), 'override-config=');
  execFileSync('git', ['-C', f.dir, 'commit', '-q', '--allow-empty', '-m', 'Change', '-m', 'body mentions +SeMvEr: minor']);
  assert.equal(runCheck(f), 'override-config=');
  execFileSync('git', ['-C', f.dir, 'checkout', '-q', '--detach', 'HEAD~']);
  assert.equal(runCheck(f), 'override-config=');
});

test('falls back when GitVersion or git cannot inspect the inputs', t => {
  const f = fixture(t);
  writeFileSync(join(f.bin, 'dotnet-gitversion'), '#!/usr/bin/env bash\nexit 1\n');
  assert.equal(runCheck(f), 'override-config=');
  writeFileSync(join(f.bin, 'dotnet-gitversion'), '#!/usr/bin/env bash\n[[ "$*" == "--roll-forward Major /config GitVersionConfig.yml /showconfig" ]] || exit 1\ncat "$TEST_CONFIG"\n');
  renameSync(join(f.dir, '.git'), join(f.dir, 'git-hidden'));
  assert.equal(runCheck(f), 'override-config=');
});
