import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { Evaluator, Lexer, Parser, data } from '@actions/expressions';
import { parse } from 'yaml';

const workflowFiles = ['docker.yml', 'integration-tests-linux.yml', 'integration-tests.yml', 'test.yml', 'nuget.yml', 'nuget-windows.yml', 'windows-deploy.yml'];
const always = { name: 'always', minArgs: 0, maxArgs: 0, call: () => new data.BooleanData(true) };

async function readWorkflow(file) {
  return parse(await readFile(new URL('../.github/workflows/' + file, import.meta.url), 'utf8'));
}

function steps(workflow) {
  return workflow.jobs.build.steps;
}

function reporter(workflow) {
  return steps(workflow).find(step => step.id === 'test-reporter');
}

function requiredResultsGuard(workflow) {
  return steps(workflow).find(step => step.name === 'Require passing test results');
}

function dictionary(value) {
  return new data.Dictionary(...Object.entries(value).map(([key, item]) => ({
    key,
    value: typeof item === 'object' && item !== null
      ? dictionary(item)
      : typeof item === 'boolean'
        ? new data.BooleanData(item)
        : new data.StringData(String(item))
  })));
}

function evaluate(condition, context) {
  const source = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const expression = new Parser(new Lexer(source).lex().tokens, ['inputs', 'steps'], [always]).parse();
  return new Evaluator(expression, dictionary(context), new Map([['always', always]])).evaluate().coerceString() === 'true';
}

function assertStrictReportPolicy(workflow, name, expectedCondition) {
  const report = reporter(workflow);
  assert.ok(report, name + ' must identify its reporter step');
  assert.equal(report.if, expectedCondition);
  assert.equal(report.with['fail-on-empty'], 'true');
  assert.equal(report.with['fail-on-error'], 'true');
  assert.doesNotMatch(report.if, /hashFiles/);

  const guard = requiredResultsGuard(workflow);
  assert.ok(guard, name + ' must fail before publication when no test passed');
  assert.equal(guard.run, 'exit 1');
  assert.match(guard.if, /outputs\.passed == ''/);
  assert.match(guard.if, /outputs\.passed == '0'/);
  assert.equal(report['continue-on-error'], undefined);
  assert.equal(guard['continue-on-error'], undefined);
  assert.ok(steps(workflow).indexOf(guard) > steps(workflow).indexOf(report), name + ' guard must follow its reporter');
  for (const step of publicationSteps(workflow)) {
    assert.ok(
      steps(workflow).indexOf(step) > steps(workflow).indexOf(guard),
      name + ' must gate test results before packaging or publication (' + (step.name ?? step.id) + ')'
    );
  }
}

// The docker build pushes only a ci-<run> tag the tests run inside; promotion to the
// published tags is the step that must wait for the guard.
const publicationCommands = [
  /\bdotnet\s+(pack|publish)\b/i,
  /\bdotnet\s+nuget\s+push\b/i,
  /\bdocker\s+(push|buildx\s+imagetools\s+create)\b/i,
  /\boctopus\s+(package\s+upload|release\s+create|deploy-release|build-information\s+upload)\b/i
];

function publicationSteps(workflow) {
  return steps(workflow).filter(step => publicationCommands.some(pattern => pattern.test(step.run ?? '')));
}

function moveBeforeGuard(workflow, predicate) {
  const all = steps(workflow);
  const step = all.find(predicate);
  assert.ok(step, 'mutation target must exist');
  all.splice(all.indexOf(step), 1);
  all.splice(all.indexOf(requiredResultsGuard(workflow)), 0, step);
  return workflow;
}

describe('reusable workflow test-result gates', () => {
  it('parses every changed workflow and makes reports strict when tests are promised', async () => {
    const workflows = Object.fromEntries(await Promise.all(workflowFiles.map(async file => [file, await readWorkflow(file)])));

    for (const file of ['integration-tests-linux.yml', 'integration-tests.yml', 'test.yml']) {
      assert.equal(workflows[file].on.workflow_call.inputs.project_test_file_path.required, true);
      assertStrictReportPolicy(workflows[file], file, '${{ always() }}');
    }
    assertStrictReportPolicy(workflows['docker.yml'], 'docker', '${{ always() && inputs.docker_has_tests == true }}');
    for (const file of ['nuget.yml', 'nuget-windows.yml', 'windows-deploy.yml']) {
      assertStrictReportPolicy(workflows[file], file, '${{ always() && steps.test.outputs.tests-exists == \'true\' }}');
    }

    const regression = await readWorkflow('RegressionChecks.yml');
    const regressionSteps = regression.jobs['regression-tests'].steps;
    assert.ok(regression.on.pull_request !== undefined);
    assert.ok(regressionSteps.some(step => step.run === 'npm ci'));
    assert.ok(regressionSteps.some(step => step.run === 'npm test'));
  });

  it('uses GitHub expression rules for promised, bypassed, missing, zero-passing, and passing reports', async () => {
    const workflows = Object.fromEntries(await Promise.all(workflowFiles.map(async file => [file, await readWorkflow(file)])));
    for (const file of workflowFiles) {
      const workflow = workflows[file];
      const report = reporter(workflow);
      const guard = requiredResultsGuard(workflow);
      const optional = ['nuget.yml', 'nuget-windows.yml', 'windows-deploy.yml'].includes(file);
      const docker = file === 'docker.yml';
      const promised = docker
        ? { inputs: { docker_has_tests: true }, steps: {} }
        : optional
          ? { inputs: {}, steps: { test: { outputs: { 'tests-exists': 'true' } } } }
          : { inputs: {}, steps: {} };
      const bypassed = docker
        ? { inputs: { docker_has_tests: false }, steps: {} }
        : optional
          ? { inputs: {}, steps: { test: { outputs: { 'tests-exists': 'false' } } } }
          : null;

      assert.equal(evaluate(report.if, promised), true, file + ' runs its reporter when tests are promised');
      if (bypassed) {
        assert.equal(evaluate(report.if, bypassed), false, file + ' preserves optional test bypasses');
      }
      for (const passed of ['', '0']) {
        const context = structuredClone(promised);
        context.steps['test-reporter'] = { outputs: { passed } };
        assert.equal(evaluate(guard.if, context), true, file + ' rejects missing or skipped-only results');
      }
      const missing = structuredClone(promised);
      missing.steps['test-reporter'] = { outputs: {} };
      assert.equal(evaluate(guard.if, missing), true, file + ' rejects a reporter with no passed output');
      const passing = structuredClone(promised);
      passing.steps['test-reporter'] = { outputs: { passed: '1' } };
      assert.equal(evaluate(guard.if, passing), false, file + ' permits a passing report');
      assert.equal(report.with['fail-on-error'], 'true', file + ' treats a failed reporter as a failed route');
    }
  });

  it('rejects mutations that remove the guard or weaken empty-report failure', async () => {
    const mutated = structuredClone(await readWorkflow('docker.yml'));
    mutated.jobs.build.steps = steps(mutated).filter(step => step.name !== 'Require passing test results');
    assert.throws(
      () => assertStrictReportPolicy(mutated, 'mutated docker', '${{ always() && inputs.docker_has_tests == true }}'),
      /must fail before publication/
    );

    const weakened = structuredClone(await readWorkflow('docker.yml'));
    delete reporter(weakened).with['fail-on-empty'];
    assert.throws(
      () => assertStrictReportPolicy(weakened, 'weakened docker', '${{ always() && inputs.docker_has_tests == true }}'),
      /Expected values to be strictly equal/
    );
  });

  it('finds the real publication steps and rejects moving any of them before the guard', async () => {
    const expected = {
      'docker.yml': ['Promote Docker image'],
      'nuget.yml': ['Build & Pack NuGet', 'Create NuGet release'],
      'nuget-windows.yml': ['Build & Pack NuGet', 'Create NuGet release'],
      'windows-deploy.yml': ['Build & Pack', 'Push build information to Octopus', 'Octopus Create release']
    };
    const conditions = {
      'docker.yml': '${{ always() && inputs.docker_has_tests == true }}',
      'nuget.yml': '${{ always() && steps.test.outputs.tests-exists == \'true\' }}',
      'nuget-windows.yml': '${{ always() && steps.test.outputs.tests-exists == \'true\' }}',
      'windows-deploy.yml': '${{ always() && steps.test.outputs.tests-exists == \'true\' }}'
    };
    for (const [file, names] of Object.entries(expected)) {
      const workflow = await readWorkflow(file);
      assert.deepEqual(publicationSteps(workflow).map(step => step.name), names, file + ' publication steps');
      for (const name of names) {
        const mutated = moveBeforeGuard(structuredClone(workflow), step => step.name === name);
        assert.throws(
          () => assertStrictReportPolicy(mutated, 'mutated ' + file, conditions[file]),
          /must gate test results before packaging or publication/,
          file + ': moving ' + name + ' before the guard must fail'
        );
      }
    }
  });
});
