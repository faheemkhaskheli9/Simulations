// Share links, CSV export and file helpers.

/**
 * Parse "#sim/scenario?key=value&..." into { simId, scenarioId, params }.
 * Parameter values stay strings; coerceParams() converts them using paramDefs.
 */
export function parseHash(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [simId = '', scenarioId = ''] = path.split('/').map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { simId, scenarioId, params };
}

export function buildHash(simId, scenarioId, params = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return `#${encodeURIComponent(simId)}/${encodeURIComponent(scenarioId)}${q ? `?${q}` : ''}`;
}

/** Convert string values to typed, in-range parameter values; unknown keys are dropped. */
export function coerceParams(paramDefs, raw) {
  const out = {};
  for (const d of paramDefs) {
    if (!(d.key in raw)) continue;
    const s = raw[d.key];
    if (d.type === 'checkbox') out[d.key] = s === 'true' || s === '1';
    else if (d.type === 'select') { if (d.options.some((o) => o.value === s)) out[d.key] = s; }
    else {
      const v = Number(s);
      if (Number.isFinite(v)) out[d.key] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return out;
}

/**
 * Teacher mode: the "lock" link key names parameters learners cannot change,
 * as a comma-separated list or "all". Unknown keys are dropped.
 */
export function parseLock(paramDefs, raw) {
  if (!raw) return [];
  const want = new Set(String(raw).split(',').map((k) => k.trim()));
  return paramDefs.map((d) => d.key).filter((k) => want.has('all') || want.has(k));
}

export function formatLock(paramDefs, keys) {
  if (!keys.length) return '';
  return keys.length === paramDefs.length ? 'all' : keys.join(',');
}

/** Parameters that differ from a reference (e.g. the scenario defaults). */
export function diffParams(params, reference) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    const r = reference[k];
    const same = typeof v === 'number' && typeof r === 'number' ? Math.abs(v - r) <= 1e-9 * Math.max(1, Math.abs(r)) : v === r;
    if (!same) out[k] = typeof v === 'number' ? +v.toPrecision(6) : v;
  }
  return out;
}

/** rows: [{ time, key: value, ... }], columns: [{ key, label }]. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  return [header, ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n') + '\n';
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file) {
  return file.text();
}
