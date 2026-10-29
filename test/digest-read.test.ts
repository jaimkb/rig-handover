import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

function row(rows: DigestRow[], job: string): DigestRow {
  const found = rows.find((r) => r.job === job);
  if (!found) throw new Error(`no row for ${job}`);
  return found;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('has 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
  });

  it('counts retries and keeps the last status', () => {
    const refresh = row(night!.rows, 'fixtures/refresh');
    expect(refresh.retries).toBe(3);
    expect(refresh.runs).toBe(4);
    expect(refresh.lastStatus).toBe('ok');
    expect(refresh.lastError).toBe('upstream 503');
    expect(row(night!.rows, 'lane/sync').retries).toBe(1);
  });

  it('keeps the last error of a failed job', () => {
    const backup = row(night!.rows, 'notes/backup');
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row(night!.rows, 'digest/render').owner).toBeNull();
  });

  it('keeps times as written, offset included', () => {
    const rotate = row(night!.rows, 'rig/rotate-logs');
    expect(rotate.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(rotate.lastAt).toBe('2026-10-28T23:00:02+01:00');
    const sync = row(night!.rows, 'lane/sync');
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt.endsWith('+01:00')).toBe(true);
  });

  it('counts parsed lines per status', () => {
    const { ok, retry, fail } = night!.counts;
    expect(retry).toBe(4);
    expect(fail).toBe(1);
    const runs = night!.rows.reduce((sum, r) => sum + r.runs, 0);
    expect(ok + retry + fail).toBe(runs);
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-read-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '1999-01-01')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('strips CRLF, skips blank lines and counts bad ones without throwing', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"b","status":"retry","owner":"x","error":"e1"}',
      '',
      '   ',
      '{"at":"2026-01-02T02:00:00+01:00","job":"b","status":"ok","owner":null}',
      '{"at":"2026-01-02T03:00:00+01:00","job":"a","status":"fail","owner":"y","error":"boom"}',
      'not json',
      '{"at":"2026-01-02T04:00:00+01:00","job":"c","status":"weird","owner":"z"}',
      '{"at":"2026-01-02T04:00:00+01:00","status":"ok","owner":"z"}',
      '{"at":"2026-01-02T04:00:00+01:00","job":"c","status":"ok","owner":7}',
      '[1,2]',
      'null',
    ];
    writeFileSync(join(dir, '2026-01-02.jsonl'), lines.join('\r\n') + '\r\n');
    const night = readNight(dir, '2026-01-02');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(6);
    expect(night!.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(night!.rows).toEqual([
      { job: 'a', owner: 'y', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'boom', firstAt: '2026-01-02T03:00:00+01:00', lastAt: '2026-01-02T03:00:00+01:00' },
      { job: 'b', owner: null, runs: 2, retries: 1, lastStatus: 'ok', lastError: 'e1', firstAt: '2026-01-02T01:00:00+01:00', lastAt: '2026-01-02T02:00:00+01:00' },
    ]);
  });
});
