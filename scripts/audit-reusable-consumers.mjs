import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error('Missing required argument ' + name);
  }
  return process.argv[index + 1];
}

async function workflow(root, file) {
  return parse(await readFile(join(root, '.github', 'workflows', file), 'utf8'));
}

const wman = await workflow(argument('--wman-api'), 'WManApi.yml');
const documents = await workflow(argument('--documents'), 'RegressionChecks.yml');
const printserviceDeployment = await workflow(argument('--printservice'), 'DocumentStore.yml');
const printserviceRegression = await workflow(argument('--printservice'), 'RegressionChecks.yml');

const wmanIntegration = wman.jobs.integrationtests;
const wmanImage = wman.jobs.wmanapi;
assert.match(wmanIntegration.uses, /procedures\/.github\/workflows\/integration-tests-linux\.yml@master$/);
assert.ok(wmanIntegration.with.project_test_file_path);
assert.equal(wmanImage.needs, 'integrationtests');
assert.equal(wmanImage.with.docker_has_tests, true);

assert.ok(documents.on.pull_request !== undefined);
assert.ok(documents.jobs['regression-tests']);
assert.ok(documents.jobs['regression-tests'].steps.some(step => String(step.run).includes('dotnet test')));
assert.ok(documents.jobs['regression-tests'].steps.some(step => String(step.run).includes('Assert-TrxResults.ps1')));

const printJob = printserviceDeployment.jobs.PrintService;
assert.match(printJob.uses, /procedures\/.github\/workflows\/docker\.yml@master$/);
assert.equal(printJob.with.docker_has_tests, true);
const trigger = printserviceDeployment.on.push;
const includesTestsPath = trigger.paths.some(path => path === 'Nowaste.DocumentStore.Tests/**');
assert.ok(includesTestsPath, 'printservice deployment workflow must trigger for test-source changes');

assert.ok(printserviceRegression.on.pull_request !== undefined);
const printRegressionJob = printserviceRegression.jobs['regression-tests'];
assert.ok(printRegressionJob);
assert.ok(printRegressionJob.steps.some(step => String(step.run).includes('dotnet test')));
assert.ok(printRegressionJob.steps.some(step => String(step.run).includes('Test-AssertTrxResults.ps1')));
assert.ok(printRegressionJob.steps.some(step => String(step.run).includes('Assert-TrxResults.ps1')));

console.log('WMan.API: integration job supplies a project, and image job needs integrationtests.');
console.log('Nowaste.Documents: pull_request regression-tests runs dotnet test and Assert-TrxResults.ps1.');
console.log('printservice: deployment test-source path is present; pull_request regression-tests runs dotnet test and the real TRX guard fixtures.');
