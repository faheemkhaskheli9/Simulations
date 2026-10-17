// Builds docs/REFERENCE.md from the simulation modules themselves, so the
// reference can never drift from the code. Run: npm run docs:reference
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SIMULATIONS } from '../src/sims/index.js';
import { LESSONS } from '../src/lessons/index.js';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const num = (v) => (typeof v === 'number' ? +v.toPrecision(4) : v);

function paramRange(d) {
  if (d.type === 'checkbox') return 'on / off';
  if (d.type === 'select') return d.options.map((o) => o.label).join(', ');
  return `${num(d.min)} – ${num(d.max)}${d.log ? ' (log scale)' : ''}`;
}

function paramDefault(d) {
  if (d.type === 'checkbox') return d.value ? 'on' : 'off';
  if (d.type === 'select') return d.options.find((o) => o.value === d.value)?.label ?? d.value;
  return num(d.value);
}

export function buildReference() {
  const out = [];
  out.push('# Simulation Reference', '');
  out.push('> Generated from the source code by `npm run docs:reference`. Do not edit by hand:',
    '> `tests/reference.test.js` fails if this file is out of date.', '');
  out.push('For how to use the app, see the [User Guide](USER_GUIDE.md).', '');
  out.push('## Contents', '');
  for (const S of SIMULATIONS) out.push(`- [${S.meta.title}](#${S.meta.id}) (${S.meta.category})`);
  out.push('- [Lessons and challenges](#lessons-and-challenges)', '');

  for (const S of SIMULATIONS) {
    const sim = new S();
    const m = S.meta;
    out.push(`<a id="${m.id}"></a>`, '', `## ${m.title}`, '');
    out.push(`**Category:** ${m.category} · **Link:** \`#${m.id}\` · **Time unit:** ${sim.timeUnit}`, '');
    out.push(m.description, '');
    if (m.model?.summary) out.push(`**Model.** ${m.model.summary}`, '');

    out.push('### Scenarios', '', '| Scenario | Link |', '|---|---|');
    for (const s of sim.scenarios) out.push(`| ${cell(s.label)} | \`#${m.id}/${s.id}\` |`);
    out.push('');

    out.push('### Parameters', '', '| Parameter | Link key | Range | Default |', '|---|---|---|---|');
    for (const d of sim.paramDefs) out.push(`| ${cell(d.label)} | \`${d.key}\` | ${cell(paramRange(d))} | ${cell(paramDefault(d))} |`);
    out.push('');

    out.push('### Things you can add', '');
    for (const k of sim.spawnKinds) out.push(`- ${k.label}`);
    out.push('');

    out.push('### Tool meanings', '', '| Tool | In this simulation |', '|---|---|',
      `| Energy | **${cell(sim.energyTool.label)}** (hold Shift or tick Invert: **${cell(sim.energyTool.negLabel)}**) |`,
      '| Add | Adds the kind chosen in *Object to add* (list above) |',
      '| Inspect | Shows and edits the clicked object\'s properties |', '');

    const stats = sim.stats();
    out.push('### Statistics', '', '| Statistic | Charted |', '|---|---|');
    for (const s of stats) out.push(`| ${cell(s.label)} | ${sim.chartKeys.includes(s.key) ? '✓' : ''} |`);
    out.push('');

    if (m.model?.equations?.length) {
      out.push('### Equations', '');
      m.model.equations.forEach((e, i) => out.push(`${i + 1}. ${e}`));
      out.push('');
    }
    if (m.model?.assumptions?.length) {
      out.push('### Simplifications', '');
      for (const a of m.model.assumptions) out.push(`- ${a}`);
      out.push('');
    }
    if (m.model?.references?.length) {
      out.push('### Further reading', '');
      for (const r of m.model.references) out.push(`- ${r}`);
      out.push('');
    }
  }

  out.push('<a id="lessons-and-challenges"></a>', '', '## Lessons and challenges', '');
  out.push('| Title | Type | Simulation | Steps | Link | Summary |', '|---|---|---|---|---|---|');
  for (const l of LESSONS) {
    const S = SIMULATIONS.find((s) => s.meta.id === l.sim);
    out.push(`| ${cell(l.title)} | ${l.type} | ${cell(S?.meta.title ?? l.sim)} | ${l.steps?.length ?? '—'} | \`#learn/${l.id}\` | ${cell(l.summary)} |`);
  }
  out.push('');
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../docs/REFERENCE.md', import.meta.url));
  writeFileSync(target, buildReference());
  console.log(`Wrote ${target}`);
}
