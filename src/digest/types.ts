// Plan morning-digest § 1. The contract every part of § 2 starts against: commit this before
// the reader, so the page, the JSON, the board link and the route tests can go in parallel.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times are kept as written in the log, offset included (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD, as in the file name
  rows: DigestRow[]; // sorted by job; empty for an empty file ("nothing ran")
  badLines: number; // lines that didn't parse: counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines per status, for the board's ok / retry / fail
};

// Reads runsDir/<night>.jsonl. Returns null when the night has no file (routes answer 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
