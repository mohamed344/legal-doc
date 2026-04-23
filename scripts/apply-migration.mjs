import fs from 'node:fs';

const [, , file] = process.argv;
if (!file) { console.error('usage: apply-migration.mjs <file>'); process.exit(2); }

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) { console.error('missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF'); process.exit(2); }

const sql = fs.readFileSync(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log(`[${res.status}] ${file}`);
console.log(text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
