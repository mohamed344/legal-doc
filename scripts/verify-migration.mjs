const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return [r.status, await r.text()];
};
console.log('TABLES:', ...(await q("select table_name from information_schema.tables where table_schema='public' order by table_name")));
console.log('BUCKET:', ...(await q("select id, public from storage.buckets where id='document-imports'")));
console.log('ARCHIVE_COLS:', ...(await q("select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('is_archived','archived_at') order by table_name, column_name")));
