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
const printservice = await workflow(argument('--printservice'), 'DocumentStore.yml');

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

const printJob = printservice.jobs.PrintService;
assert.match(printJob.uses, /procedures\/.github\/workflows\/docker\.yml@master$/);
assert.equal(printJob.with.docker_has_tests, true);
const trigger = printservice.on.push;
const includesTestsPath = trigger.paths.some(path => path === 'Nowaste.DocumentStore.Tests/**');

console.log('WMan.API: integration job supplies a project, and image job needs integrationtests.');
console.log('Nowaste.Documents: pull_request regression-tests runs dotnet test and Assert-TrxResults.ps1.');
console.log('printservice: Docker route promises tests; PR trigger=' + (printservice.on.pull_request !== undefined) + ', test-source path=' + includesTestsPath + '.');
if (!includesTestsPath || printservice.on.pull_request === undefined) {
  console.log('printservice gap: its approved producer PR gate and test-source trigger are not present in this checkout.');
}
