const CODE_TEXT: Record<string, string> = {
  GRAPH_VERSION_CONFLICT:
    'Граф на сервере новее. Черновик сохранён локально — можно перечитать сервер.',
  PRECONDITION_REQUIRED: 'Нет ETag для сохранения. Перечитайте граф.',
  INVALID_GRAPH: 'Связи или ноды не проходят проверку сервера.',
  GRAPH_CHANGED: 'Сначала сохраните граф — ETag устарел.',
  GENERATION_IN_PROGRESS: 'У этого генератора уже идёт запуск.',
  IDEMPOTENCY_CONFLICT: 'Ключ уже использован с другими данными.',
  GENERATOR_REQUIRED: 'Запуск доступен только у ноды генератора.',
  INCOMPLETE_CHAIN: 'Нужны непустой текст, генератор и связанный результат.',
  SPACE_NOT_FOUND: 'Рабочее пространство не найдено.',
  GENERATION_NOT_FOUND: 'Генерация не найдена.',
};

export type ErrorKind = 'network' | 'http' | 'parse';

type ErrorBody = { error?: { code?: string; message?: string } };

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    kind: ErrorKind,
    message: string,
    extras: { status?: number | null; code?: string | null; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.status = extras.status ?? null;
    this.code = extras.code ?? null;
    this.requestId = extras.requestId ?? null;
  }

  get userMessage(): string {
    if (this.code && CODE_TEXT[this.code]) return CODE_TEXT[this.code];
    if (this.kind === 'network') return 'Нет связи с сервером. Проверьте сеть и повторите.';
    if (this.kind === 'parse') return 'Сервер вернул некорректный ответ.';
    return this.message || 'Не удалось выполнить запрос.';
  }

  static network(): AppError {
    return new AppError('network', 'Нет связи с сервером.');
  }

  static parse(): AppError {
    return new AppError('parse', 'Сервер вернул некорректный ответ.');
  }

  static fromResponse(status: number, body: unknown, requestId: string | null): AppError {
    const payload = body && typeof body === 'object' ? (body as ErrorBody) : null;
    return new AppError('http', payload?.error?.message || `Ошибка ${status}`, {
      status,
      code: payload?.error?.code ?? null,
      requestId,
    });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function isAbort(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}

export function toAppError(value: unknown): AppError {
  if (value instanceof AppError) return value;
  return AppError.network();
}
