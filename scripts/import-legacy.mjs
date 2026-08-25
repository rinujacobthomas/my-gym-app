#!/usr/bin/env node
/**
 * import-legacy.mjs — one-shot migrator for pre-2.0 openGym flat-file data.
 * Zero dependencies. Node >= 18.
 *
 * INPUT  — legacy self-hosted data dir (default ./data):
 *            db.json            { users: [{ id, name, admin?, disabled? }], ... }
 *            state-<uid>.json   per-user blob; workouts live in `.workouts[]`
 *                               as { id, d, start, end, name, vol, prs,
 *                                    entries: [{ id, sets, topW }, ...] }
 *
 * OUTPUT — ./data-import/ :
 *            users.csv       legacy roster (id, name, flags, workout count)
 *            workouts.ndjson one JSON payload PER LINE shaped exactly like
 *                            POST /api/workouts:
 *                              { id, date, startedAt, endedAt, routineName,
 *                                totalVolume, prCount, entries:[{id,sets,topW}] }
 *            report.json     counts + skipped ids
 *
 * IDENTITY MATCHING: the new platform keys users by EMAIL from Google login;
 * legacy records have no email. Admins should tell each member their account
 * appears once they log in with a Google address — replaying a user's lines
 * attaches history to whoever is authenticated as that email. Verify names in
 * users.csv before replaying.
 *
 * USAGE
 *   node scripts/import-legacy.mjs [--in ./data] [--out ./data-import]
 *                                  [--existing ids.txt|ids.json]
 *
 *   --existing  optional file of workout ids ALREADY imported (JSON array or
 *               one id per line); matching ids are skipped → safe re-runs.
 *
 * REPLAY (run on the server, as an authenticated ADMIN session):
 *   # 1) log into the admin UI in a browser, copy your session cookie value
 *   SID='<paste session cookie>'
 *   while IFS= read -r line; do
 *     curl -fsS -X POST "$PUBLIC_APP_URL/api/workouts" \
 *       -H 'Content-Type: application/json' -H "Cookie: sid=$SID" -d "$line" \
 *       || echo "FAILED: $line"
 *   done < data-import/workouts.ndjson
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const IN_DIR = path.resolve(opt('--in', './data'));
const OUT_DIR = path.resolve(opt('--out', './data-import'));
const EXISTING_FILE = opt('--existing', null);

// Map a legacy workout record onto the POST /api/workouts payload contract.
function mapWorkout(w) {
  return {
    id: w.id,
    date: w.d,
    startedAt: w.start,
    endedAt: w.end,
    routineName: w.name ?? '',
    totalVolume: w.vol ?? 0,
    prCount: w.prs ?? 0,
    entries: Array.isArray(w.entries)
      ? w.entries.map((e) => ({ id: e.id, sets: e.sets ?? 0, topW: e.topW ?? 0 }))
      : [],
  };
}

async function loadExistingIds(file) {
  if (!file) return new Set();
  const raw = await readFile(path.resolve(file), 'utf8');
  let ids;
  try {
    ids = JSON.parse(raw); // JSON array case
  } catch {
    ids = raw.split('\n'); // newline-separated case
  }
  const set = new Set(ids.map((s) => String(s).trim()).filter(Boolean));
  console.log(`→ loaded ${set.size} existing workout id(s) from ${file}`);
  return set;
}

async function main() {
  const db = JSON.parse(await readFile(path.join(IN_DIR, 'db.json'), 'utf8'));
  const users = Array.isArray(db.users) ? db.users : [];
  const existing = await loadExistingIds(EXISTING_FILE);

  await mkdir(OUT_DIR, { recursive: true });
  const files = new Set(await readdir(IN_DIR));

  const csv = ['legacy_id,name,is_admin,is_disabled,state_file,workouts'];
  const ndjson = [];
  let written = 0;
  let skippedExisting = 0;
  const missingState = [];

  for (const u of users) {
    const stateFile = `state-${u.id}.json`;
    let count = 0;

    if (files.has(stateFile)) {
      const state = JSON.parse(await readFile(path.join(IN_DIR, stateFile), 'utf8'));
      const workouts = Array.isArray(state?.workouts) ? state.workouts : [];
      for (const w of workouts) {
        if (existing.has(String(w.id))) {
          skippedExisting++;
          continue;
        }
        // One payload per line — ready for the documented curl replay loop.
        ndjson.push(JSON.stringify(mapWorkout(w)));
        written++;
        count++;
      }
    } else {
      missingState.push({ userId: u.id, name: u.name });
    }

    csv.push(
      [u.id, u.name ?? '', u.admin ? 'yes' : 'no', u.disabled ? 'yes' : 'no', stateFile, count]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
  }

  const usersCsvPath = path.join(OUT_DIR, 'users.csv');
  const ndjsonPath = path.join(OUT_DIR, 'workouts.ndjson');
  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(usersCsvPath, csv.join('\n') + '\n', 'utf8');
  await writeFile(ndjsonPath, ndjson.length ? ndjson.join('\n') + '\n' : '', 'utf8');
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputDir: IN_DIR,
        users: {
          total: users.length,
          admins: users.filter((u) => u.admin).length,
          disabled: users.filter((u) => u.disabled).length,
        },
        workouts: { written, skippedExisting, totalInDb: written + skippedExisting },
        usersMissingStateFile: missingState,
        notes: [
          'New platform matches users by EMAIL on next Google login.',
          'Replay workouts.ndjson via the curl loop documented in this script header.',
          skippedExisting
            ? `${skippedExisting} id(s) skipped via --existing (already imported).`
            : 'No --existing list supplied; re-running will duplicate workouts unless you pass it.',
        ],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`✓ users.csv        ${users.length} users → ${usersCsvPath}`);
  console.log(`✓ workouts.ndjson  ${written} workouts (${skippedExisting} skipped) → ${ndjsonPath}`);
  console.log(`✓ report.json      → ${reportPath}`);
}

main().catch((err) => {
  console.error('✗ import failed:', err.message);
  process.exit(1);
});
