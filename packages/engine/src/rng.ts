/** Gerador de dados: devolve um inteiro de 1 a `sides`. */
export type Rng = (sides: number) => number;

/** Gerador determinístico (mulberry32) para testes e reprodução de rolagens. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (sides) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * sides) + 1;
  };
}

/** Gerador criptográfico, sem viés (amostragem por rejeição). Usado no servidor. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return (sides) => {
    const limit = Math.floor(0x100000000 / sides) * sides;
    for (;;) {
      globalThis.crypto.getRandomValues(buf);
      const x = buf[0]!;
      if (x < limit) return (x % sides) + 1;
    }
  };
}

/** Gerador que devolve uma sequência fixa de resultados (para testes). */
export function fixedRng(values: number[]): Rng {
  let i = 0;
  return (sides) => {
    const v = values[i++ % values.length]!;
    if (v < 1 || v > sides) throw new Error(`fixedRng: ${v} fora de 1..${sides}`);
    return v;
  };
}
