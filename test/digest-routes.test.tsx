import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Nights live in a temp dir, so runs/ is never read for these tests or written to (plan § 2d).
const NIGHTS = {
  digest: '2026-10-28', // three jobs: one null owner, one with 3 retries, one that failed
  empty: '2026-10-25', // an empty file: nothing ran
  badLine: '2026-10-26', // one good line and one that does not parse
};
const MISSING = '2026-10-24'; // no file in the temp dir
const MALFORMED = 'abc'; // not a night at all

const JOBS = ['digest/render', 'fixtures/refresh', 'notes/backup'];

let runsDir: string;
let app: ReturnType<typeof createApp>;

const jsonLines = (...rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

// The job rows of the digest table, in page order, with whether they carry the warn class.
function pageRows(html: string) {
  return [...html.matchAll(/<tr( class="warn")?><td>([^<]*)<\/td>/g)].map((m) => ({
    job: m[2],
    warn: m[1] !== undefined,
  }));
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(
    join(runsDir, `${NIGHTS.digest}.jsonl`),
    jsonLines(
      { at: '2026-10-28T23:00:05+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'fixtures', error: 'upstream 503' },
      { at: '2026-10-28T23:00:04+01:00', job: 'digest/render', status: 'ok', owner: null },
      { at: '2026-10-28T23:00:20+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'fixtures', error: 'upstream 503' },
      { at: '2026-10-28T23:02:00+01:00', job: 'notes/backup', status: 'fail', owner: 'notes', error: 'quota exceeded' },
      { at: '2026-10-28T23:00:50+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'fixtures', error: 'upstream 503' },
      { at: '2026-10-28T23:01:20+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'fixtures' },
    ),
  );
  writeFileSync(join(runsDir, `${NIGHTS.empty}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${NIGHTS.badLine}.jsonl`),
    jsonLines({ at: '2026-10-26T23:00:03+01:00', job: 'lane/sync', status: 'ok', owner: 'lane' }) + 'not json\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders a night with a file: jobs, a dash for the null owner, warn rows', async () => {
    const res = await app.request(`/digest/${NIGHTS.digest}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${NIGHTS.digest}`);
    for (const job of JOBS) expect(html).toContain(`<td>${job}</td>`);
    expect(html).toContain('<td>digest/render</td><td>—</td>');
    expect(html).toContain('quota exceeded');
    expect(pageRows(html)).toEqual([
      { job: 'digest/render', warn: false },
      { job: 'fixtures/refresh', warn: true },
      { job: 'notes/backup', warn: true },
    ]);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('answers 404 for a malformed night', async () => {
    const res = await app.request(`/digest/${MALFORMED}`);
    expect(res.status).toBe(404);
  });

  it('renders the empty night as nothing ran', async () => {
    const res = await app.request(`/digest/${NIGHTS.empty}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageRows(html)).toEqual([]);
  });

  it('renders a night with a bad line and counts it', async () => {
    const res = await app.request(`/digest/${NIGHTS.badLine}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<td>lane/sync</td>');
    // Hono escapes the apostrophe as &#39;; the browser shows it as '.
    expect(html).toContain('1 line didn&#39;t parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows for a night with a file, in the same order as the page', async () => {
    const res = await app.request(`/api/digest/${NIGHTS.digest}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(NIGHTS.digest);
    expect(body.rows.map((row) => row.job)).toEqual(JOBS);
    expect(body.rows[0]!.owner).toBeNull();
    expect(body.rows[1]).toMatchObject({ job: 'fixtures/refresh', owner: 'fixtures', runs: 4, retries: 3, lastStatus: 'ok' });
    expect(body.rows[2]).toMatchObject({ job: 'notes/backup', owner: 'notes', runs: 1, lastStatus: 'fail' });
    expect(body.badLines).toBe(0);

    const html = await (await app.request(`/digest/${NIGHTS.digest}`)).text();
    expect(body.rows.map((row) => row.job)).toEqual(pageRows(html).map((row) => row.job));
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('answers 404 for a malformed night', async () => {
    const res = await app.request(`/api/digest/${MALFORMED}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows for the empty night', async () => {
    const res = await app.request(`/api/digest/${NIGHTS.empty}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: NIGHTS.empty,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns the night with a bad line and counts it', async () => {
    const res = await app.request(`/api/digest/${NIGHTS.badLine}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows.map((row) => row.job)).toEqual(['lane/sync']);
    expect(body.badLines).toBe(1);
  });
});
