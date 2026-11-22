import {pgQuery, withPgTransaction, writePostgresAuditLog} from './postgres.ts';

/**
 * Small async compatibility layer for the existing route query style.
 * Every database operation returns a Promise and must be awaited by its caller.
 */
function bindParameters(sql: string): string {
  let index = 0;
  let result = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      result += ch;
      if (escaped) escaped = false;
      else if (ch === '\\' && quote !== "'") escaped = true;
      else if (ch === quote) {
        if (quote === "'" && sql[i + 1] === "'") {
          result += sql[++i];
        } else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch as "'" | '"' | '`';
      result += ch;
    } else if (ch === '?') {
      result += `$${++index}`;
    } else {
      result += ch;
    }
  }
  return result;
}

function normalizeSql(sql: string): string {
  const ignoreInsert = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  let normalized = ignoreInsert ? sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO') : sql;
  normalized = bindParameters(normalized);
  if (ignoreInsert) normalized = normalized.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  return normalized;
}

export const db = {
  prepare(sql: string) {
    const statement = normalizeSql(sql);
    return {
      async get<T = Record<string, unknown>>(...values: unknown[]): Promise<T | undefined> {
        const result = await pgQuery(statement, values);
        const row = result.rows[0] as Record<string, unknown> | undefined;
        if (row) {
          for (const [key, value] of Object.entries(row)) {
            if ((key === 'count' || key.endsWith('_count')) && typeof value === 'string') {
              row[key] = Number(value);
            }
          }
        }
        return row as T | undefined;
      },
      async all<T = Record<string, unknown>>(...values: unknown[]): Promise<T[]> {
        const result = await pgQuery(statement, values);
        return result.rows.map((source) => {
          const row = source as Record<string, unknown>;
          for (const [key, value] of Object.entries(row)) {
            if ((key === 'count' || key.endsWith('_count')) && typeof value === 'string') {
              row[key] = Number(value);
            }
          }
          return row as T;
        });
      },
      async run(...values: unknown[]): Promise<{changes: number}> {
        const result = await pgQuery(statement, values);
        return {changes: result.rowCount ?? 0};
      },
    };
  },
  transaction<T>(work: () => Promise<T> | T): () => Promise<T> {
    return () => withPgTransaction(async () => await work());
  },
};

export async function writeAuditLog(params: Parameters<typeof writePostgresAuditLog>[0]): Promise<void> {
  await writePostgresAuditLog(params);
}
