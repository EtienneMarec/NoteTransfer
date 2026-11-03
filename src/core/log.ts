export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export const REDACTED = '[masqué]';

// Noms de clés dont la valeur ne doit jamais apparaître dans un log ou un export.
const SENSITIVE_KEY = /authorization|cookie|token|secret|session|password|passwd|api[-_]?key|bearer/i;
// Valeurs qui ressemblent à un secret, même sous une clé anodine.
const SENSITIVE_VALUE = [/\bBearer\s+\S+/gi, /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') {
    return SENSITIVE_VALUE.reduce((s, re) => s.replace(re, REDACTED), value);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Headers) {
    return redact(Object.fromEntries(value.entries()), depth + 1);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogRecord {
  at: string;
  level: LogLevel;
  msg: string;
  data?: unknown;
}

/** Logger qui masque systématiquement les données sensibles avant de les transmettre. */
export function createLogger(sink: (record: LogRecord) => void, now = () => new Date()): Logger {
  const emit = (level: LogLevel) => (msg: string, data?: unknown) =>
    sink({ at: now().toISOString(), level, msg: redact(msg) as string, ...(data !== undefined && { data: redact(data) }) });
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
