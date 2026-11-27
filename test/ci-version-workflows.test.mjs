import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

test('all publishing workflows use the shared version calculator', () => {
  const directory = new URL('../.github/workflows/', import.meta.url);
  const publishing = [];
  const calculators = new Set();
  for (const name of readdirSync(directory)) {
    const workflow = parse(readFileSync(new URL(name, directory), 'utf8'));
    for (const job of Object.values(workflow.jobs)) {
      const steps = job.steps ?? [];
      assert.ok(!steps.some(step => /gittools\/actions\/gitversion/i.test(step.uses ?? '')), name);
      const version = steps.find(step => step.id === 'version');
      if (!version) continue;
      assert.match(version.uses, /^nowastelogistics\/procedures\/\.github\/actions\/ci-version@[0-9a-f]{40}$/);
      assert.equal(version.if, undefined, name);
      calculators.add(version.uses);
      publishing.push(name);
    }
  }
  assert.equal(calculators.size, 1);
  assert.deepEqual(publishing.sort(), [
    'docker.yml', 'label.yml', 'nuget-windows.yml', 'nuget.yml', 'publish-dotnet-webapp.yml',
    'templates-ask.yml', 'templates.yml', 'windows-deploy.yml',
  ]);
});
