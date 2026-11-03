/** Lecteur CSV RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans un champ, BOM, CRLF. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/**
 * Lignes indexées par nom de colonne. Les noms sont normalisés (casse, espaces, ponctuation)
 * pour tolérer les variantes d'en-têtes : « Your Rating », « your rating », « YourRating ».
 */
export function csvRecords(text: string): { columns: string[]; records: Array<Record<string, string>> } {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { columns: [], records: [] };
  const columns = header.map(columnKey);
  return {
    columns,
    records: lines.map((l) => Object.fromEntries(columns.map((c, i) => [c, (l[i] ?? '').trim()]))),
  };
}

export const columnKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Première colonne présente parmi plusieurs noms possibles. */
export function pick(record: Record<string, string>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = record[columnKey(n)];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}
