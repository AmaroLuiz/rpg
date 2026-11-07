export type EngineErrorCode =
  | 'syntax'
  | 'unknown-ref'
  | 'unknown-function'
  | 'bad-argument'
  | 'type'
  | 'cycle'
  | 'dice-not-allowed'
  | 'dice-limit'
  | 'template-invalid';

/** Erro do motor. `message` vem em pt-BR; `code` serve para tradução e testes. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: EngineErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}
