import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const fail = () => { throw new Error('Production data evidence is missing or invalid. Review the release notes and retry.'); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function https(value) {
  if (typeof value !== 'string' || !value.startsWith('https://') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
}
function predicate(value, sha, repository) {
  if (!https(value) || /(?:^|\/)\.\.?\//.test(value)) return false;
  const url = new URL(value);
  const prefix = `/${repository}/blob/${sha}/`;
  return url.hostname.toLowerCase() === 'github.com' && url.pathname.startsWith(prefix) &&
    url.pathname.length > prefix.length && /^#L[1-9]\d*(?:-L[1-9]\d*)?$/.test(url.hash) && !url.search;
}
// JSON.parse establishes syntax; scan its strings again to detect repeated decoded keys.
function parseEvidence(source) {
  const parsed = JSON.parse(source);
  const stack = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      const begin = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (/\s/.test(source[next] ?? '')) next++;
      if (source[next] === ':' && stack.at(-1) instanceof Set) {
        const key = JSON.parse(source.slice(begin, i + 1));
        if (stack.at(-1).has(key)) fail();
        stack.at(-1).add(key);
      }
    } else if (c === '{') stack.push(new Set());
    else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') stack.pop();
  }
  return parsed;
}
// Only top-level Markdown fences count; an example inside another fence is not evidence.
function evidenceBlocks(body) {
  const blocks = [];
  let fence = null;
  const visible = body.replace(/<!--[\s\S]*?(?:-->|$)/g, comment => comment.replace(/[^\r\n]/g, ' '));
  for (const line of visible.split(/\r?\n/)) {
    if (!fence) {
      const open = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
      if (open) fence = { char: open[2][0], length: open[2].length, evidence: open[3].trim() === 'nowaste-production-data', lines: [] };
    } else {
      const close = /^( {0,3})(`+|~+)[ \t]*$/.exec(line);
      if (close && close[2][0] === fence.char && close[2].length >= fence.length) {
        if (fence.evidence) blocks.push(fence.lines.join('\n'));
        fence = null;
      } else if (fence.evidence) fence.lines.push(line);
    }
  }
  if (fence?.evidence) fail();
  return blocks;
}
export function validate(release, tag, sha, repository) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !release || release.draft !== false ||
      !nonempty(release.published_at) || !Number.isFinite(Date.parse(release.published_at)) ||
      release.tag_name !== tag || typeof release.body !== 'string') fail();
  const blocks = evidenceBlocks(release.body);
  if (blocks.length !== 1) fail();
  let evidence;
  try { evidence = parseEvidence(blocks[0]); } catch { fail(); }
  if (!evidence || Array.isArray(evidence) || evidence.sha !== sha) fail();
  if (evidence.status === 'not-applicable') {
    if (!nonempty(evidence.reason) || !https(evidence.proof) || Object.keys(evidence).some(key => !['sha', 'status', 'reason', 'proof'].includes(key))) fail();
    return;
  }
  if (Object.keys(evidence).some(key => !['sha', 'status', 'rules'].includes(key)) || evidence.status !== 'passed' || !Array.isArray(evidence.rules) || evidence.rules.length === 0) fail();
  const predicates = new Set();
  for (const rule of evidence.rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).some(key => !['predicate', 'affectedTenants', 'results'].includes(key)) || !predicate(rule.predicate, sha, repository) || predicates.has(rule.predicate) ||
        !Array.isArray(rule.affectedTenants) || !rule.affectedTenants.length || !Array.isArray(rule.results)) fail();
    predicates.add(rule.predicate);
    const tenants = new Set(rule.affectedTenants);
    if (tenants.size !== rule.affectedTenants.length || [...tenants].some(t => !nonempty(t) || t !== t.trim()) ||
        new Set([...tenants].map(t => t.toLowerCase())).size !== tenants.size || rule.results.length !== tenants.size) fail();
    const seen = new Set();
    for (const result of rule.results) {
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(key => !['tenant', 'status', 'proof'].includes(key)) || !tenants.has(result.tenant) || seen.has(result.tenant) || result.status !== 'pass' || !https(result.proof)) fail();
      seen.add(result.tenant);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, tag, sha, repository] = process.argv.slice(2);
    validate(JSON.parse(await readFile(file, 'utf8')), tag, sha, repository);
    console.log('Production data evidence accepted.');
  } catch {
    console.error('Production data evidence is missing or invalid. Review the release notes and retry.');
    process.exitCode = 1;
  }
}
