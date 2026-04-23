import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.join(os.homedir(), '.claude', 'projects');
const all = [];
for (const dir of fs.readdirSync(root)) {
  const full = path.join(root, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.jsonl')) continue;
    const fp = path.join(full, f);
    all.push({ path: fp, mtime: fs.statSync(fp).mtimeMs });
  }
}
all.sort((a, b) => b.mtime - a.mtime);
const files = all.slice(0, 50).map(x => x.path);
console.error(`Scanning ${files.length} transcripts`);

const bashCounts = new Map();
const mcpCounts = new Map();

function extractLeading(cmd) {
  if (!cmd) return null;
  let s = cmd.trim();
  // strip leading env-var prefixes like FOO=bar BAR=baz
  while (/^[A-Z_][A-Z0-9_]*=/.test(s)) s = s.replace(/^[A-Z_][A-Z0-9_]*=\S+\s+/, '');
  // remove subshells/pipes — take up to first &&, ||, ;, |
  s = s.split(/&&|\|\||;|\|/)[0].trim();
  // strip sudo/timeout
  s = s.replace(/^sudo\s+/, '').replace(/^timeout\s+\S+\s+/, '');
  const parts = s.split(/\s+/);
  if (!parts.length) return null;
  const cmd0 = parts[0];
  const cmd1 = parts[1] || '';
  // for commands with recognized subcommands, keep two tokens; otherwise just one
  const twoTokenCmds = new Set(['git', 'gh', 'docker', 'kubectl', 'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'go', 'supabase', 'claude']);
  if (twoTokenCmds.has(cmd0) && cmd1 && !cmd1.startsWith('-')) {
    return `${cmd0} ${cmd1}`;
  }
  return cmd0;
}

for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const c of msg.content) {
      if (c.type !== 'tool_use') continue;
      if (c.name === 'Bash') {
        const leading = extractLeading(c.input?.command);
        if (leading) bashCounts.set(leading, (bashCounts.get(leading) || 0) + 1);
      } else if (c.name?.startsWith('mcp__')) {
        mcpCounts.set(c.name, (mcpCounts.get(c.name) || 0) + 1);
      }
    }
  }
}

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
console.log('=== BASH ===');
for (const [k, v] of sortDesc(bashCounts)) console.log(`${v}\t${k}`);
console.log('\n=== MCP ===');
for (const [k, v] of sortDesc(mcpCounts)) console.log(`${v}\t${k}`);
