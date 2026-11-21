import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { validate } from '../.github/actions/production-data-gate/check.mjs';
import { Evaluator, Lexer, Parser, data } from '@actions/expressions';

const sha = 'a'.repeat(40), repo = 'nowastelogistics/WMan.Api', tag = '2026.1.1';
const evidence = () => ({ sha, status: 'passed', rules: [{ predicate: `https://github.com/${repo}/blob/${sha}/src/Rule.cs#L1-L2`, affectedTenants: ['synthetic-a', 'synthetic-b'], results: ['synthetic-a', 'synthetic-b'].map(tenant => ({ tenant, status: 'pass', proof: 'https://evidence.example/review' })) }] });
const release = e => ({ draft: false, prerelease: false, published_at: '2026-01-01T12:00:00Z', tag_name: tag, body: '```nowaste-production-data\n' + JSON.stringify(e) + '\n```' });
const check = r => validate(r, tag, sha, repo);

test('accepts passed and reviewed not-applicable evidence', () => {
  check(release(evidence()));
  check({...release(evidence()), prerelease: true});
  check(release({ sha, status: 'not-applicable', reason: 'Reviewed diff and deployed baseline', proof: 'https://evidence.example/scope' }));
});
test('rejects absent, malformed, duplicate, unpublished or wrong release evidence', () => {
  const good = release(evidence());
  for (const bad of [null, {...good, draft: true}, {...good, published_at: null}, {...good, published_at: 'invalid'}, {...good, tag_name: 'wrong'}, {...good, body: ''}, {...good, body: good.body + '\n' + good.body}, {...good, body: '```nowaste-production-data\n{\n```'}]) assert.throws(() => check(bad));
});
test('rejects mismatched revisions, duplicate scope and incomplete or failed results', () => {
  const mutations = [
    e => e.sha = 'b'.repeat(40), e => e.rules = [], e => e.rules.push(structuredClone(e.rules[0])),
    e => e.rules[0].predicate = e.rules[0].predicate.replace(sha, 'b'.repeat(40)),
    e => e.rules[0].predicate = e.rules[0].predicate.replace('github.com', 'user@github.com'),
    e => e.rules[0].predicate = e.rules[0].predicate.replace('/src/', '/other/../src/'),
    e => e.rules[0].affectedTenants.push('synthetic-a'), e => e.rules[0].affectedTenants.push('Synthetic-A'),
    e => e.rules[0].affectedTenants.push(' synthetic-a'), e => e.rules[0].results.pop(),
    e => e.rules[0].results[1].tenant = 'synthetic-a', e => e.rules[0].results[1].tenant = 'unexpected',
    e => e.rules[0].status = 'fail', e => e.rules[0].results[0].extraStatus = 'fail',
    e => e.rules[0].results[0].proof = 'https:example.invalid',
    e => e.rules[0].results[0].proof = ' https://example.com', e => e.rules[0].results[0].proof = 'https://example.com/\\path',
    e => e.rules[0].results[0].proof = ['https://example.com'], e => e.rules[0].results[0].status = 'fail', e => e.rules[0].results[0].proof = 'http://example.com',
  ];
  for (const mutate of mutations) { const e = evidence(); mutate(e); assert.throws(() => check(release(e))); }
  assert.throws(() => check(release({ sha, status: 'not-applicable', reason: '', proof: 'https://example.com' })));
  assert.throws(() => check(release({ sha, status: 'not-applicable', reason: 'reviewed', proof: 'https://user@example.com' })));
});
test('rejects contradictory fields, duplicate decoded JSON keys and nested examples', () => {
  const good = release({ sha, status: 'not-applicable', reason: 'reviewed baseline', proof: 'https://example.com' });
  assert.throws(() => check(release({ sha, status: 'not-applicable', reason: 'reviewed', proof: 'https://example.com', rules: [] })));
  assert.throws(() => check(release({ ...evidence(), reason: 'contradiction' })));
  assert.throws(() => check({ ...good, body: good.body.replace('"status":"not-applicable"', '"status":"blocked","status":"not-applicable"') }));
  assert.throws(() => check({ ...good, body: good.body.replace('"status":"not-applicable"', '"status":"blocked","sta\\u0074us":"not-applicable"') }));
  assert.throws(() => check({ ...good, body: '````markdown\n' + good.body + '\n````' }));
  assert.throws(() => check({ ...good, body: '<!-- hidden\n' + good.body + '\n-->' }));
  assert.throws(() => check({ ...good, body: '~~~markdown\n' + good.body + '\n~~~' }));
});
test('workflow gate runs after checkout and before build, promotion and downstream signing', async () => {
  const w = parse(await readFile(new URL('../.github/workflows/docker.yml', import.meta.url), 'utf8'));
  const steps = w.jobs.build.steps, index = steps.findIndex(s => s.name === 'Require production data evidence'), gate = steps[index];
  assert.equal(index, 1); assert.equal(steps[0].name, 'Checkout source');
  assert.equal(gate.uses, 'nowastelogistics/procedures/.github/actions/production-data-gate@master');
  assert.equal(gate['continue-on-error'], undefined);
  assert.ok(index < steps.findIndex(s => s.name === 'Build Docker image'));
  assert.ok(index < steps.findIndex(s => s.name === 'Promote Docker image'));
  assert.equal(w.jobs.sign.needs, 'build');
  const expr = new Parser(new Lexer(gate.if).lex().tokens, ['github'], []).parse();
  const evalFor = (repository, ref) => new Evaluator(expr, new data.Dictionary({key:'github', value: new data.Dictionary({key:'repository', value:new data.StringData(repository)}, {key:'ref', value:new data.StringData(ref)})})).evaluate().coerceString() === 'true';
  assert.equal(evalFor(repo, 'refs/tags/2026.1.1'), true);
  assert.equal(evalFor(repo, 'refs/tags/hotfix'), true);
  assert.equal(evalFor(repo, 'refs/heads/release/2026.1.1'), false);
  assert.equal(evalFor('other/repo', 'refs/tags/2026.1.1'), false);
});
