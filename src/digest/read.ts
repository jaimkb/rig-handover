// Plan morning-digest § 1: read runs/<night>.jsonl into one DigestRow per job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parse at the edge: one raw line in, a RunLine or null (a bad line) out. Never throws.
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return line;
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  let lastError: string | null = null;
  for (const line of lines) if (line.error !== undefined) lastError = line.error;
  return {
    job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((line) => line.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const byJob = new Map<string, RunLine[]>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const raw = rawLine.replace(/\r$/, '');
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((job) => toRow(job, byJob.get(job)!));

  return { night, rows, badLines, counts };
};
