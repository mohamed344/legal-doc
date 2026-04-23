import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(2);
}

async function sqlExec(query, params = []) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  return JSON.parse(text);
}

async function docxToHtml(filePath) {
  const buf = fs.readFileSync(filePath);
  const { value } = await mammoth.convertToHtml(
    { buffer: buf },
    {
      styleMap: ['table => table.legal-table', 'p[style-name="Heading 1"] => h1:fresh'],
      includeDefaultStyleMap: true,
    }
  );
  return value;
}

const ROOT = process.cwd();

const TEMPLATES = [
  {
    name: 'Notification judiciaire (article 416)',
    category: 'Huissier',
    description: "محضر تبليغ قرار حضوري / Service judiciaire d'un arrêt à la partie publique.",
    source: '85_2026_ بوخدومة سعدية_ النيابة.docx',
    replacements: [
      [/85\s*م\/2026/g, '{{file_number}}'],
      [/بوخدومة\s*سعدية/g, '{{requestor_name}}'],
      [/07\s*زيتوني\s*ميلود[^<\n]*/g, '{{requestor_address}}'],
      [/11\/01667/g, '{{case_number}}'],
      [/11\/02593/g, '{{index_number}}'],
      [/2011\/06\/26/g, '{{decision_date}}'],
      [/\.{6,}/g, '{{blank}}'],
    ],
    placeholderKeys: [
      { marker: '{{blank}}', replaceWith: ['{{service_date}}', '{{service_month}}', '{{service_hour}}'] },
    ],
    variables: [
      { key: 'file_number', label: 'Numéro de dossier', type: 'text', scope: 'batch', required: true, order_index: 0 },
      { key: 'service_date', label: 'Date de signification', type: 'date', scope: 'batch', required: true, order_index: 1 },
      { key: 'service_month', label: 'Mois de signification', type: 'text', scope: 'batch', required: false, order_index: 2 },
      { key: 'service_hour', label: 'Heure de signification', type: 'text', scope: 'batch', required: false, order_index: 3 },
      { key: 'decision_date', label: "Date de l'arrêt", type: 'date', scope: 'batch', required: true, order_index: 4 },
      { key: 'case_number', label: "Numéro d'affaire", type: 'text', scope: 'batch', required: true, order_index: 5 },
      { key: 'index_number', label: "Numéro d'index", type: 'text', scope: 'batch', required: false, order_index: 6 },
      { key: 'requestor_name', label: 'Nom du demandeur', type: 'text', scope: 'per_row', required: true, order_index: 7 },
      { key: 'requestor_address', label: 'Adresse du demandeur', type: 'text', scope: 'per_row', required: false, order_index: 8 },
    ],
  },
  {
    name: "Notification d'avertissement (Art. 12 Loi 06/03)",
    category: 'Huissier',
    description: "محضر تبليغ اعذار / Mise en demeure entre parties contractantes.",
    source: '480 بوعبيدة للترقية العقارية_ اوبي سي قروب.docx',
    replacements: [
      [/480\s*ن\/2026/g, '{{file_number}}'],
      [/بوعبيدة\s*للترقية\s*العقارية/g, '{{requestor_company}}'],
      [/بوعبيدة\s*نبيل/g, '{{requestor_manager}}'],
      [/نسيم\s*البحر[^<\n]*/g, '{{requestor_address}}'],
      [/OPC\s*GROUP/gi, '{{defendant_company}}'],
      [/104\s*تقوانيت[^<\n]*/g, '{{defendant_address}}'],
      [/\.{6,}/g, '{{blank}}'],
    ],
    variables: [
      { key: 'file_number', label: 'Numéro de dossier', type: 'text', scope: 'batch', required: true, order_index: 0 },
      { key: 'service_date', label: 'Date de signification', type: 'date', scope: 'batch', required: true, order_index: 1 },
      { key: 'service_hour', label: 'Heure de signification', type: 'text', scope: 'batch', required: false, order_index: 2 },
      { key: 'court_jurisdiction', label: 'Juridiction (conseil judiciaire)', type: 'text', scope: 'batch', required: false, order_index: 3 },
      { key: 'served_officer_name', label: "Nom de l'officier signifié", type: 'text', scope: 'batch', required: false, order_index: 4 },
      { key: 'requestor_company', label: 'Société demanderesse', type: 'text', scope: 'per_row', required: true, order_index: 5 },
      { key: 'requestor_manager', label: 'Gérant du demandeur', type: 'text', scope: 'per_row', required: false, order_index: 6 },
      { key: 'requestor_address', label: 'Adresse du demandeur', type: 'text', scope: 'per_row', required: false, order_index: 7 },
      { key: 'defendant_company', label: 'Société défenderesse', type: 'text', scope: 'per_row', required: true, order_index: 8 },
      { key: 'defendant_manager', label: 'Gérant du défendeur', type: 'text', scope: 'per_row', required: false, order_index: 9 },
      { key: 'defendant_address', label: 'Adresse du défendeur', type: 'text', scope: 'per_row', required: false, order_index: 10 },
      { key: 'defendant_id', label: 'Pièce ID du défendeur', type: 'text', scope: 'per_row', required: false, order_index: 11 },
      { key: 'warning_subject', label: "Objet de l'avertissement", type: 'text', scope: 'batch', required: true, order_index: 12 },
      { key: 'deadline_days', label: 'Délai (jours)', type: 'number', scope: 'batch', required: false, order_index: 13 },
    ],
  },
  {
    name: 'Procès-verbal de constat',
    category: 'Huissier',
    description: 'محضر معاينة / Constat physique sur site.',
    source: 'Copie de 484_ معاينةالواجهة_مهيدي مناد.docx',
    replacements: [
      [/484\s*ن\/2026/g, '{{file_number}}'],
      [/مهيدي\s*مناد/g, '{{requestor_name}}'],
      [/مهيدي\s*مهدي/g, '{{rental_tenant}}'],
      [/402097616/g, '{{requestor_id}}'],
      [/12\/06\/2025/g, '{{requestor_id_date}}'],
      [/14\/01\/2026/g, '{{rental_agreement_date}}'],
      [/2026\/0047/g, '{{rental_agreement_index}}'],
      [/محمد\s*معاصمي/g, '{{notary_name}}'],
      [/17:30/g, '{{inspection_time}}'],
      [/17:45/g, '{{departure_time}}'],
      [/إتمام\s*واجهة\s*المحل/g, '{{inspection_findings}}'],
      [/شارع\s*الجنرال\s*فيراردو[^<\n]*74[^<\n]*/g, '{{inspection_address}}'],
    ],
    variables: [
      { key: 'file_number', label: 'Numéro de dossier', type: 'text', scope: 'batch', required: true, order_index: 0 },
      { key: 'inspection_date', label: 'Date du constat', type: 'date', scope: 'batch', required: true, order_index: 1 },
      { key: 'inspection_time', label: "Heure d'arrivée", type: 'text', scope: 'batch', required: false, order_index: 2 },
      { key: 'departure_time', label: 'Heure de départ', type: 'text', scope: 'batch', required: false, order_index: 3 },
      { key: 'inspection_address', label: 'Adresse du constat', type: 'text', scope: 'batch', required: false, order_index: 4 },
      { key: 'requestor_name', label: 'Nom du demandeur', type: 'text', scope: 'per_row', required: true, order_index: 5 },
      { key: 'requestor_id', label: 'ID du demandeur', type: 'text', scope: 'per_row', required: false, order_index: 6 },
      { key: 'requestor_id_date', label: "Date de l'ID", type: 'date', scope: 'per_row', required: false, order_index: 7 },
      { key: 'rental_tenant', label: 'Locataire (bail)', type: 'text', scope: 'per_row', required: false, order_index: 8 },
      { key: 'rental_agreement_date', label: 'Date du bail', type: 'date', scope: 'per_row', required: false, order_index: 9 },
      { key: 'rental_agreement_index', label: 'Numéro du bail', type: 'text', scope: 'per_row', required: false, order_index: 10 },
      { key: 'notary_name', label: 'Notaire', type: 'text', scope: 'batch', required: false, order_index: 11 },
      { key: 'inspection_findings', label: 'Constatations', type: 'text', scope: 'per_row', required: true, order_index: 12 },
    ],
  },
];

function wrapArabic(inner) {
  return `<div dir="rtl" lang="ar" class="legal-document">\n${inner}\n</div>`;
}

function replaceBlanksOrdered(html, replacements) {
  if (!replacements) return html;
  for (const { marker, replaceWith } of replacements) {
    let i = 0;
    while (html.includes(marker) && i < replaceWith.length) {
      html = html.replace(marker, replaceWith[i]);
      i += 1;
    }
    html = html.replaceAll(marker, '');
  }
  return html;
}

async function getFirstAuthUserId() {
  const rows = await sqlExec('select id from auth.users order by created_at asc limit 1');
  if (!rows.length) throw new Error('No auth.users row exists — create a user first.');
  return rows[0].id;
}

function sqlQuote(s) {
  return `'${String(s).replaceAll("'", "''")}'`;
}

function sqlQuoteNullable(s) {
  return s === null || s === undefined ? 'null' : sqlQuote(s);
}

async function upsertTemplate(tpl, bodyHtml, createdBy) {
  const existing = await sqlExec(
    `select id from public.templates where name = ${sqlQuote(tpl.name)} limit 1`
  );
  let id;
  if (existing.length) {
    id = existing[0].id;
    await sqlExec(
      `update public.templates set
        description = ${sqlQuote(tpl.description)},
        category = ${sqlQuote(tpl.category)},
        body_html = ${sqlQuote(bodyHtml)},
        is_archived = false,
        updated_at = now()
       where id = ${sqlQuote(id)}`
    );
    console.log(`  updated template ${tpl.name} (${id})`);
  } else {
    const inserted = await sqlExec(
      `insert into public.templates (name, description, category, body_html, created_by)
       values (${sqlQuote(tpl.name)}, ${sqlQuote(tpl.description)}, ${sqlQuote(tpl.category)}, ${sqlQuote(bodyHtml)}, ${sqlQuote(createdBy)})
       returning id`
    );
    id = inserted[0].id;
    console.log(`  inserted template ${tpl.name} (${id})`);
  }

  await sqlExec(`delete from public.template_variables where template_id = ${sqlQuote(id)}`);

  for (const v of tpl.variables) {
    await sqlExec(
      `insert into public.template_variables
       (template_id, key, label, type, required, order_index, scope)
       values (
         ${sqlQuote(id)},
         ${sqlQuote(v.key)},
         ${sqlQuote(v.label)},
         ${sqlQuote(v.type)}::variable_type,
         ${v.required ? 'true' : 'false'},
         ${Number(v.order_index)},
         ${sqlQuote(v.scope)}
       )`
    );
  }
  console.log(`    seeded ${tpl.variables.length} variables`);
  return id;
}

async function main() {
  const createdBy = await getFirstAuthUserId();
  console.log(`Using created_by = ${createdBy}`);

  for (const tpl of TEMPLATES) {
    const filePath = path.join(ROOT, tpl.source);
    if (!fs.existsSync(filePath)) {
      console.warn(`SKIP (missing): ${tpl.source}`);
      continue;
    }
    console.log(`\nProcessing: ${tpl.name}`);
    let html = await docxToHtml(filePath);

    for (const [pattern, replacement] of tpl.replacements) {
      html = html.replace(pattern, replacement);
    }
    html = replaceBlanksOrdered(html, tpl.placeholderKeys);
    html = html.replaceAll('{{blank}}', '');

    const wrapped = wrapArabic(html);
    await upsertTemplate(tpl, wrapped, createdBy);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
