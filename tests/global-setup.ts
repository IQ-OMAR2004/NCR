// Creates a fresh throwaway SQLite DB (test.db) for the test run.
// We own this file: remove it and push the schema onto a clean database —
// no destructive flags needed.
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export default function setup(): void {
  const root = path.resolve(__dirname, '..');
  for (const f of ['test.db', 'test.db-journal', 'test.db-wal', 'test.db-shm']) {
    fs.rmSync(path.join(root, f), { force: true });
  }
  execSync('npx prisma db push', {
    cwd: root,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
