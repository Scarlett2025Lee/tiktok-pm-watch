// Cloud watcher (GitHub Actions): finds new TikTok product-related internship roles in the
// Product Management table of SimplifyJobs/Summer2027-Internships and alerts you.
//
// Alerts:
//   - Always: opens a GitHub issue in this repo (GitHub emails you + pushes to the GitHub mobile app).
//   - Optional: also emails ALERT_TO through Gmail if GMAIL_USER and GMAIL_APP_PASSWORD secrets are set.
// seen.json is only updated after every configured alert was sent, so a failed run retries next time.
//
// Usage: node watch.mjs            -> check and alert
//        DRY_RUN=1 node watch.mjs  -> check only, print what would be sent, change nothing
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEEN = join(HERE, 'seen.json');
const URL_RAW = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md';
const PAGE = 'https://github.com/SimplifyJobs/Summer2027-Internships/blob/dev/README.md#-product-management-internship-roles';
const env = process.env;
const DRY = !!env.DRY_RUN;

const load = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const text = html =>
  html
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export function tiktokRoles(readme) {
  const start = readme.indexOf('## 📱 Product Management Internship Roles');
  if (start < 0) throw new Error('Product Management section not found; the README layout may have changed');
  const rest = readme.slice(start + 10);
  const end = rest.search(/\n## /);
  const section = end < 0 ? rest : rest.slice(0, end);
  const roles = [];
  let company = '';
  for (const row of section.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    if (cells.length < 5) continue;
    const name = text(cells[0]).replace(/^🔥\s*/, '');
    if (name !== '↳') company = name; // "↳" rows belong to the company above
    if (!/^(TikTok|ByteDance\s*\/\s*TikTok)$/i.test(company)) continue;
    const links = [...cells[3].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    const apply = links.find(l => !l.includes('simplify.jobs/p/')) ?? links[0] ?? '';
    const simplify = links.find(l => l.includes('simplify.jobs/p/')) ?? '';
    const role = text(cells[1]);
    if (!/product/i.test(role)) continue; // product-related roles only (Product Manager, Product Operations, etc.)
    const location = text(cells[2]);
    const key = simplify.match(/simplify\.jobs\/p\/([\w-]+)/)?.[1] ?? `${role}|${location}|${apply}`;
    roles.push({ key, role, location, age: text(cells[4]), apply: apply.replace(/[?&]utm_source=Simplify&ref=Simplify$/, ''), closed: !links.length || cells[3].includes('🔒') });
  }
  return roles;
}

const subjectFor = roles => (roles.length === 1 ? `🔥 New TikTok PM internship: ${roles[0].role}` : `🔥 ${roles.length} new TikTok PM internships`);

async function openIssue(roles) {
  const body =
    roles.map(r => `- **${r.role}** — ${r.location} — ${r.age} — [Apply](${r.apply})`).join('\n') + `\n\n[See the full list](${PAGE})`;
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tiktok-pm-watch' },
    body: JSON.stringify({ title: subjectFor(roles), body }),
  });
  if (!response.ok) throw new Error(`Creating the issue failed: HTTP ${response.status} ${await response.text()}`);
  return (await response.json()).html_url;
}

async function sendEmail(roles) {
  const { default: nodemailer } = await import('nodemailer');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    '<ul>' +
    roles.map(r => `<li><b>${esc(r.role)}</b> — ${esc(r.location)} — ${esc(r.age)} — <a href="${r.apply}">Apply</a></li>`).join('') +
    `</ul><p><a href="${PAGE}">See the full list</a></p>`;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
  await transport.sendMail({ from: env.GMAIL_USER, to: env.ALERT_TO || env.GMAIL_USER, subject: subjectFor(roles), html });
}

const response = await fetch(URL_RAW + '?t=' + Date.now(), { headers: { 'User-Agent': 'tiktok-pm-watch' }, signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
const open = tiktokRoles(await response.text()).filter(r => !r.closed);

if (!existsSync(SEEN)) {
  // First run without history: record everything as a baseline instead of alerting on old roles.
  if (!DRY) save(SEEN, open.map(r => r.key));
  console.log(`Baseline recorded: ${open.length} TikTok product roles.`);
  process.exit(0);
}

const seen = new Set(load(SEEN, []));
const fresh = open.filter(r => !seen.has(r.key));
console.log(`TikTok product roles listed: ${open.length}; new: ${fresh.length}`);
for (const r of fresh) console.log(`  NEW  ${r.role} — ${r.location} — ${r.age} — ${r.apply}`);
if (!fresh.length || DRY) process.exit(0);

console.log('Issue opened:', await openIssue(fresh));
if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
  await sendEmail(fresh);
  console.log('Email sent.');
}
for (const r of fresh) seen.add(r.key);
save(SEEN, [...seen]);
