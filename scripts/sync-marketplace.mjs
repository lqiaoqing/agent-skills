#!/usr/bin/env node
// sync-marketplace.mjs: regenerate .claude-plugin/marketplace.json from skills/*/SKILL.md front matter.
//   node scripts/sync-marketplace.mjs           write the file
//   node scripts/sync-marketplace.mjs --check   exit 1 if the file is out of date (for CI / pre-commit)
// Every folder under skills/ that has a SKILL.md becomes one plugin entry: name and description come from the front
// matter (name must equal the folder name). Hand-tuned extras on an existing entry (category, keywords, license, …)
// are kept; entries whose skill folder is gone are dropped; new skills are appended in alphabetical order.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.claude-plugin/marketplace.json');
const REPO = 'lqiaoqing/agent-skills';
const MANAGED = ['name', 'description', 'source', 'strict', 'skills', 'homepage']; // fields this script owns

// minimal YAML front matter reader: `key: value`, quoted values, and folded/literal blocks (`>-`, `|`)
function frontMatter(file) {
  const m = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error(`${file}: no front matter`);
  const out = {}, lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    if (/^[>|][+-]?$/.test(v)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].trim());
      v = v.startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n');
    } else v = v.replace(/^(['"])(.*)\1$/, '$2');
    out[k] = v.trim();
  }
  return out;
}

const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const oldByName = Object.fromEntries((old.plugins || []).map(p => [p.name, p]));
const skills = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(ROOT, 'skills', d.name, 'SKILL.md'))).map(d => d.name);
const errors = [];
const entry = name => {
  const fm = frontMatter(join(ROOT, 'skills', name, 'SKILL.md'));
  if (fm.name !== name) errors.push(`skills/${name}/SKILL.md: front matter name "${fm.name}" must equal the folder name "${name}"`);
  if (!fm.description) errors.push(`skills/${name}/SKILL.md: missing description`);
  const keep = Object.fromEntries(Object.entries(oldByName[name] || {}).filter(([k]) => !MANAGED.includes(k)));
  return {
    name, description: fm.description, source: './', strict: false, skills: [`./skills/${name}`],
    ...('category' in keep ? {} : { category: 'productivity' }), ...keep,
    homepage: `https://github.com/${REPO}/tree/main/skills/${name}`,
  };
};
const order = [...(old.plugins || []).map(p => p.name).filter(n => skills.includes(n)), ...skills.filter(n => !oldByName[n]).sort()];
const plugins = order.map(entry);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const doc = {
  $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
  name: old.name || 'lqiaoqing-agent-skills',
  owner: old.owner || { name: 'lqiaoqing', url: 'https://github.com/lqiaoqing' },
  metadata: old.metadata || { description: 'Agent skills for Claude Code and Codex.' },
  plugins,
};
const text = JSON.stringify(doc, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.error('.claude-plugin/marketplace.json is out of date: run node scripts/sync-marketplace.mjs'); process.exit(1); }
  console.log(`marketplace.json up to date (${plugins.length} skills)`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote .claude-plugin/marketplace.json: ${plugins.map(p => p.name).join(', ')}`);
}
