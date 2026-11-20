import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const require = createRequire(import.meta.url);
const SHA = 'a'.repeat(40);
const BOT = 'github-actions[bot]';

const workflow = parse(await readFile(new URL('../.github/workflows/ai-review.yml', import.meta.url), 'utf8'));
const job = workflow.jobs.post;
const step = job.steps.find((s) => s.id === 'post');

const encode = (value) => gzipSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))).toString('base64');

// Runs the github-script step against a fake GitHub that records every write.
async function post(payload, { pr = {}, reviews = [], reviewsAfter = null, readBackFails = false, createFails = null, dismissFails = false, prNumber = '7', actor = 'dev' } = {}) {
  let lists = 0;
  const calls = { created: [], dismissed: [] };
  const failures = [];
  const warnings = [];
  const outputs = {};
  const github = {
    rest: {
      pulls: {
        get: async (p) => { calls.get = p; return { data: { state: 'open', head: { sha: SHA }, ...pr } }; },
        listReviews: 'listReviews',
        createReview: async (p) => {
          if (createFails) { const e = new Error(createFails.message); e.status = createFails.status; throw e; }
          calls.created.push(p);
          return { data: { id: 99, state: p.event === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : 'COMMENTED', html_url: 'https://example.invalid/r/99' } };
        },
        dismissReview: async (p) => {
          if (dismissFails) { const e = new Error('forbidden'); e.status = 403; throw e; }
          calls.dismissed.push(p);
          return { data: {} };
        },
      },
    },
    paginate: async (method, params) => {
      assert.equal(method, 'listReviews'); assert.equal(params.pull_number, 7);
      lists++;
      if (lists > 1 && readBackFails) throw new Error('read back failed');
      return lists > 1 && reviewsAfter ? reviewsAfter : reviews;
    },
  };
  const core = {
    setFailed: (m) => failures.push(m), warning: (m) => warnings.push(m), info: () => {},
    setOutput: (k, v) => { outputs[k] = v; },
  };
  const context = { runId: 4242, repo: { owner: 'nowastelogistics', repo: 'WMan.Api' } };
  const env = { PR: prNumber, PAYLOAD: typeof payload === 'string' && !payload.startsWith('{') ? payload : encode(payload), ACTOR: actor };
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    await new AsyncFunction('require', 'github', 'context', 'core', step.with.script)(require, github, context, core);
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
  return { calls, failures, warnings, outputs };
}

const base = { commit_id: SHA, event: 'COMMENT', body: 'Ser bra ut.' };

describe('ai-review.yml', () => {
  it('is a reusable workflow on the self-hosted Linux runner with only pull-requests write', () => {
    assert.equal(workflow.on.workflow_call.inputs.pr.type, 'number');
    assert.equal(workflow.on.workflow_call.inputs.payload.type, 'string');
    assert.deepEqual(job['runs-on'], ['self-hosted', 'Linux']);
    assert.deepEqual(job.permissions, { 'pull-requests': 'write' });
    assert.match(step.uses, /^actions\/github-script@[0-9a-f]{40}$/);
  });

  it('passes inputs through env, never interpolated into the script', () => {
    assert.doesNotMatch(step.with.script, /\$\{\{/);
    assert.equal(step.env.PAYLOAD, '${{ inputs.payload }}');
  });

  it('posts one review with the inline comments and only their known fields', async () => {
    const r = await post({ ...base, event: 'REQUEST_CHANGES', comments: [
      { path: 'A.cs', line: 12, body: 'Måste ändras.', extra: 'dropped' },
      { path: 'B.cs', start_line: 3, line: 5, side: 'LEFT', body: 'Flera rader.' },
    ] });
    assert.deepEqual(r.failures, []);
    assert.equal(r.calls.created.length, 1);
    const c = r.calls.created[0];
    assert.equal(c.commit_id, SHA);
    assert.equal(c.event, 'REQUEST_CHANGES');
    assert.equal(c.pull_number, 7);
    assert.equal(c.body, 'Ser bra ut.\n\n<!-- ai-review-requested-by: dev; request: run-4242 -->', 'the body is kept and names the dispatching actor, from GitHub, not the payload, and the request');
    assert.deepEqual(c.comments, [
      { path: 'A.cs', line: 12, side: 'RIGHT', body: 'Måste ändras.' },
      { path: 'B.cs', line: 5, side: 'LEFT', body: 'Flera rader.', start_line: 3, start_side: 'LEFT' },
    ]);
    assert.equal(r.outputs.review_url, 'https://example.invalid/r/99');
  });

  it('never approves', async () => {
    const r = await post({ ...base, event: 'APPROVE' });
    assert.equal(r.calls.created.length, 0);
    assert.match(r.failures[0], /never approves/);
  });

  it('refuses malformed payloads without posting', async () => {
    const cases = [
      ['not gzip', 'bm90IGd6aXA='],
      ['not an object', encode('[1]')],
      ['short sha', { ...base, commit_id: 'abc1234' }],
      ['empty body', { ...base, body: '  ' }],
      ['comment without line', { ...base, comments: [{ path: 'A.cs', body: 'x' }] }],
      ['start_line not below line', { ...base, comments: [{ path: 'A.cs', start_line: 5, line: 5, body: 'x' }] }],
      ['bad side', { ...base, comments: [{ path: 'A.cs', line: 5, side: 'UP', body: 'x' }] }],
      ['bad dismiss id', { ...base, dismiss_review_id: 'x' }],
    ];
    for (const [name, payload] of cases) {
      const r = await post(payload);
      assert.equal(r.calls.created.length, 0, name);
      assert.equal(r.failures.length, 1, name);
      assert.match(r.failures[0], /nothing posted/, name);
    }
    const badPr = await post(base, { prNumber: 'x' });
    assert.equal(badPr.calls.created.length, 0);
  });

  it('repeats the refresh: closed PR, moved head and another approval post nothing', async () => {
    assert.match((await post(base, { pr: { state: 'closed' } })).failures[0], /PR is closed/);
    assert.match((await post(base, { pr: { head: { sha: 'b'.repeat(40) } } })).failures[0], /head moved/);
    const approved = await post(base, { reviews: [{ id: 1, state: 'APPROVED', user: { login: 'colleague' }, submitted_at: 't' }] });
    assert.match(approved.failures[0], /APPROVED by colleague/);
    assert.equal(approved.calls.created.length, 0);
    const own = await post(base, { reviews: [{ id: 1, state: 'APPROVED', user: { login: 'dev' }, submitted_at: 't' }] });
    assert.deepEqual(own.failures, [], 'the dispatching developer\'s own approval does not block');
  });

  it('reports a refused review (an inline comment outside the diff) as nothing posted', async () => {
    const r = await post({ ...base, comments: [{ path: 'A.cs', line: 999, body: 'x' }] }, { createFails: { status: 422, message: 'Line could not be resolved' } });
    assert.match(r.failures[0], /HTTP 422.*nothing posted/);
  });

  it('dismisses only an active changes request the bot posted for the same actor', async () => {
    const mark = (who) => `Måste ändras.\n\n<!-- ai-review-requested-by: ${who}; request: old-1 -->`;
    const reviews = [
      { id: 5, state: 'CHANGES_REQUESTED', user: { login: BOT }, body: mark('Dev') },
      { id: 6, state: 'CHANGES_REQUESTED', user: { login: 'colleague' }, body: mark('dev') },
      { id: 8, state: 'DISMISSED', user: { login: BOT }, body: mark('dev') },
      { id: 9, state: 'CHANGES_REQUESTED', user: { login: BOT }, body: mark('colleague') },
      { id: 10, state: 'CHANGES_REQUESTED', user: { login: BOT }, body: 'Måste ändras.' },
      { id: 11, state: 'CHANGES_REQUESTED', user: { login: BOT }, body: `${mark('dev')}\n\nCiterat efteråt.` },
    ];
    const ok = await post({ ...base, dismiss_review_id: 5, dismiss_message: 'Åtgärdat.' }, { reviews });
    assert.deepEqual(ok.calls.dismissed.map((d) => [d.review_id, d.event, d.message]), [[5, 'DISMISS', 'Åtgärdat.']]);
    for (const id of [6, 8, 9, 10, 11, 404]) {
      const r = await post({ ...base, dismiss_review_id: id }, { reviews });
      assert.equal(r.calls.dismissed.length, 0, `review ${id}`);
      assert.equal(r.calls.created.length, 1, `review ${id} still posts`);
      assert.match(r.warnings[0], /not dismissed/);
    }
    const failed = await post({ ...base, dismiss_review_id: 5 }, { reviews, dismissFails: true });
    assert.deepEqual(failed.failures, []);
    assert.match(failed.warnings[0], /dismiss it by hand/);
  });
  it('never requests changes on the dispatching actor\'s own PR, but may comment there', async () => {
    const own = await post({ ...base, event: 'REQUEST_CHANGES' }, { pr: { user: { login: 'Dev' } } });
    assert.equal(own.calls.created.length, 0);
    assert.match(own.failures[0], /wrote this PR.*nothing posted/);
    const comment = await post(base, { pr: { user: { login: 'dev' } } });
    assert.deepEqual(comment.failures, []);
    assert.equal(comment.calls.created.length, 1);
    const other = await post({ ...base, event: 'REQUEST_CHANGES' }, { pr: { user: { login: 'author' } } });
    assert.equal(other.calls.created.length, 1);
  });

  it('a review already stored for the same request and actor is reported, not posted again', async () => {
    const stored = { id: 77, state: 'COMMENTED', html_url: 'https://example.invalid/r/77', user: { login: BOT }, body: 'x\n\n<!-- ai-review-requested-by: dev; request: req-1 -->' };
    const again = await post({ ...base, request: 'req-1' }, { reviews: [stored], pr: { head: { sha: 'b'.repeat(40) } } });
    assert.deepEqual(again.failures, [], 'a re-run after the head moved still reports the stored review');
    assert.equal(again.calls.created.length, 0);
    assert.equal(again.outputs.review_url, 'https://example.invalid/r/77');
    for (const [name, body, login] of [
      ['another request', 'x\n\n<!-- ai-review-requested-by: dev; request: req-2 -->', BOT],
      ['another actor', 'x\n\n<!-- ai-review-requested-by: carl; request: req-1 -->', BOT],
      ['not the bot', 'x\n\n<!-- ai-review-requested-by: dev; request: req-1 -->', 'mallory'],
    ]) {
      const r = await post({ ...base, request: 'req-1' }, { reviews: [{ ...stored, body, user: { login } }] });
      assert.equal(r.calls.created.length, 1, name);
      assert.match(r.calls.created[0].body, /request: req-1 -->$/, name);
    }
  });

  it('reads back after a failed post: a stored review is success, an unreadable list is not "nothing posted"', async () => {
    const stored = { id: 78, state: 'COMMENTED', html_url: 'https://example.invalid/r/78', user: { login: BOT }, body: 'Ser bra ut.\n\n<!-- ai-review-requested-by: dev; request: req-3 -->' };
    const lost = await post({ ...base, request: 'req-3' }, { createFails: { status: 502, message: 'Bad gateway' }, reviewsAfter: [stored] });
    assert.deepEqual(lost.failures, []);
    assert.equal(lost.outputs.review_url, 'https://example.invalid/r/78');
    assert.match(lost.warnings[0], /stored/);
    const unknown = await post({ ...base, request: 'req-3' }, { createFails: { status: 502, message: 'Bad gateway' }, readBackFails: true });
    assert.match(unknown.failures[0], /could not be read back; check the PR/);
    const refused = await post({ ...base, request: 'req-3' }, { createFails: { status: 422, message: 'Unprocessable' }, reviewsAfter: [] });
    assert.match(refused.failures[0], /HTTP 422.*nothing posted/);
  });

  it('refuses a malformed request id', async () => {
    const r = await post({ ...base, request: 'bad id!' });
    assert.equal(r.calls.created.length, 0);
    assert.match(r.failures[0], /request must be/);
  });});
