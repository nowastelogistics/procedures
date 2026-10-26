import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

async function readWorkflow(file) {
  return parse(await readFile(new URL('../.github/workflows/' + file, import.meta.url), 'utf8'));
}

// Runs a github-script step the way the action does: `github`, `context` and `core` in scope,
// `env` from the step.
async function runScript(step, env, { files = [], pullRequest = { number: 7 } } = {}) {
  const outputs = {};
  const failures = [];
  const core = { setOutput: (name, value) => { outputs[name] = value; }, setFailed: message => failures.push(message), info: () => {} };
  const github = { rest: { pulls: { listFiles: 'listFiles' } }, paginate: async (method, params) => {
    assert.equal(method, 'listFiles');
    assert.equal(params.pull_number, pullRequest.number);
    return files;
  } };
  const context = { payload: pullRequest ? { pull_request: pullRequest } : {}, repo: { owner: 'nowastelogistics', repo: 'WMan.Api' } };
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    await new AsyncFunction('github', 'context', 'core', step.with.script)(github, context, core);
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
  return { outputs, failures };
}

const allowList = 'README.md\nAGENTS.md\ndocs/**/*.md\n';

describe('docs-only.yml', async () => {
  const workflow = await readWorkflow('docs-only.yml');
  const job = workflow.jobs.changes;
  const step = job.steps.find(s => s.id === 'classify');
  const classify = async (filenames, options = {}) =>
    (await runScript(step, { ALLOWED_PATHS: options.allowList ?? allowList }, { files: filenames.map(f => typeof f === 'string' ? { filename: f } : f), ...options })).outputs.docs_only;

  it('runs on the self-hosted Linux runner and exposes docs_only', () => {
    assert.deepEqual(job['runs-on'], ['self-hosted', 'Linux']);
    assert.equal(workflow.on.workflow_call.outputs.docs_only.value, '${{ jobs.changes.outputs.docs_only }}');
    assert.equal(job.outputs.docs_only, '${{ steps.classify.outputs.docs_only }}');
    assert.equal(job.permissions['pull-requests'], 'read');
  });

  it('is docs-only when every changed file is allow-listed', async () => {
    assert.equal(await classify(['README.md', 'docs/a.md', 'docs/recipes/b/c.md']), 'true');
  });

  it('requires build and tests for any other file', async () => {
    assert.equal(await classify(['README.md', 'WMan.Api.Data/ItemRepository.cs']), 'false');
    assert.equal(await classify(['WMan.TestData/README.md']), 'false', 'README.md is the root file only');
    assert.equal(await classify(['docs/schema.json']), 'false', 'only .md under docs');
    assert.equal(await classify(['READMExmd']), 'false', 'a dot is literal');
  });

  it('keeps a single * within one folder', async () => {
    assert.equal(await classify(['notes/a.md'], { allowList: 'notes/*.md' }), 'true');
    assert.equal(await classify(['notes/deep/a.md'], { allowList: 'notes/*.md' }), 'false');
  });

  it('checks both paths of a rename', async () => {
    assert.equal(await classify([{ filename: 'docs/moved.md', previous_filename: 'docs/old.md' }]), 'true');
    assert.equal(await classify([{ filename: 'docs/moved.md', previous_filename: 'src/Old.cs' }]), 'false');
  });

  it('fails safe on no files, a cut-off list, no allow-list and non-PR events', async () => {
    assert.equal(await classify([]), 'false');
    assert.equal(await classify(Array.from({ length: 3000 }, (_, i) => `docs/${i}.md`)), 'false');
    assert.equal(await classify(['README.md'], { allowList: '\n  \n' }), 'false');
    assert.equal(await classify(['README.md'], { pullRequest: null }), 'false');
  });
});

describe('required.yml', async () => {
  const workflow = await readWorkflow('required.yml');
  const job = workflow.jobs.gate;
  const step = job.steps[0];
  const gate = async (results, docsOnly) => (await runScript(step, { RESULTS: JSON.stringify(results), DOCS_ONLY: docsOnly })).failures;
  const result = r => ({ result: r, outputs: {} });

  it('runs on the self-hosted Linux runner with no token permissions', () => {
    assert.deepEqual(job['runs-on'], ['self-hosted', 'Linux']);
    assert.deepEqual(job.permissions, {});
    assert.deepEqual(Object.keys(workflow.on.workflow_call.inputs).sort(), ['docs_only', 'results']);
  });

  it('passes when every job succeeded', async () => {
    assert.deepEqual(await gate({ changes: result('success'), integrationtests: result('success'), wmanapi: result('success') }, 'false'), []);
  });

  it('fails on a failed, cancelled or skipped job unless the change is docs-only', async () => {
    for (const bad of ['failure', 'cancelled', 'skipped']) {
      const failures = await gate({ changes: result('success'), integrationtests: result('success'), wmanapi: result(bad) }, 'false');
      assert.equal(failures.length, 1, bad);
      assert.match(failures[0], new RegExp(`wmanapi \\(${bad}\\)`));
    }
  });

  it('passes a docs-only change whose build and tests were skipped, but not a failed one', async () => {
    assert.deepEqual(await gate({ changes: result('success'), integrationtests: result('skipped'), wmanapi: result('skipped') }, 'true'), []);
    assert.equal((await gate({ changes: result('success'), integrationtests: result('failure'), wmanapi: result('skipped') }, 'true')).length, 1);
  });

  it('fails when the docs-only check itself did not succeed or nothing was passed', async () => {
    assert.equal((await gate({ changes: result('failure'), integrationtests: result('skipped'), wmanapi: result('skipped') }, '')).length, 1);
    assert.equal((await gate({}, 'true')).length, 1);
  });
});
