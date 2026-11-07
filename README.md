# RPG de mesa — apoio digital

Web app para jogar presencialmente com ficha, dados, combate e organização da campanha no celular. Multi-sistema: as regras vêm de templates JSON, interpretados por um motor próprio.

Documento de arquitetura e modelo de dados: https://claude.ai/artifact/7NpTy27nTSeXqXgjYhXJ7x

## Estado

| Marco | Situação |
| --- | --- |
| M0 — Motor de regras | Pronto: fórmulas, dados, modificadores, validação de template, cálculo da ficha, rolagens, operações de escrita |
| M1 — Templates | Pronto: Ordem Paranormal e Tormenta20 (Jogo do Ano), com personagens de referência testados |
| M2 — Fundação (Supabase, login, mesas) | Próximo |

## Estrutura

```text
packages/engine      motor de regras (TypeScript puro)
packages/templates   ordem-paranormal.json, tormenta20.json
apps/web             PWA React (a fazer)
supabase/            migrações, RLS, Edge Functions (a fazer)
```

## Comandos

```bash
pnpm install
pnpm test        # testes do motor e dos templates
pnpm typecheck   # tsc -b em todos os pacotes
```

## Linguagem de fórmulas

| Elemento | Exemplo |
| --- | --- |
| Campo | `@agi`, `@nivel` |
| Recurso | `@pv` (atual), `@pv.max`, `@pv.temp` |
| Opção de catálogo | `@classe.pvInicial`, `option("classe").label` |
| Item de lista | `@pericias.luta.bonus` |
| Coluna de lista | `sum(@pericias.bonus)`, `count(@pericias.grau, 10)` |
| Dentro de lista | `@self.atributo`, `field(@self.atributo)` |
| Inventário | `sum(@itens.espacos * @itens.quantidade)` |
| Operadores | `+ - * / % ^`, `== != < <= > >=`, `&& \|\| !`, `cond ? a : b` |
| Funções | `floor ceil round trunc abs min max clamp sum count len has lookup if` |
| Ficha | `mod("alvo")`, `option("campo")`, `field("id")`, `condition("id")` |

Só em rolagens:

| Elemento | Exemplo |
| --- | --- |
| Dados | `2d6+3`, `d20`, `1d%` |
| Quantidade por fórmula | `(@agi)d20kh1` |
| Manter / descartar | `4d6kh3`, `2d20kl1`, `4d6dl1` |
| Explodir / rerrolar | `1d6!`, `1d20r1` |
| Pool de sucessos | `6d10cs>=8` |
| Opções da rolagem | `@rolagem.dados` (dados extras), `@rolagem.bonus` (situacional) |
| Expressão guardada | `roll(@self.dano)` |

Modificadores (de itens equipados, condições e escolhas de catálogo) entram sozinhos no campo-alvo: `{ "target": "defesa", "value": 5 }`. Alvos de lista usam `lista.chave.subcampo`, como `pericias.reflexos.bonus`. Alvos que não são campo são lidos com `mod("alvo")`.

## Uso do motor

```ts
import { Sheet, newCharacterData, applyOps, cryptoRng } from '@rpg/engine';
import { builtinTemplate } from '@rpg/templates';

const tpl = builtinTemplate('ordem_paranormal');
let data = newCharacterData(tpl);
data = applyOps(data, [{ op: 'set', path: ['values', 'classe'], value: 'combatente' }]);

const sheet = new Sheet(tpl, data, itensDoInventario);
sheet.resource('pv');            // { atual, max, min, temp, modifiers }
sheet.field('defesa');           // { value, base, modifiers: [{ source, value }] }
sheet.warnings();                // avisos, nunca bloqueiam
sheet.roll('pericia', { rng: cryptoRng(), itemKey: 'luta', bonus: 2 });
```

Os números dos templates (PV por classe, bônus de treino, condições) devem ser conferidos com os livros. Os templates não trazem textos dos livros; descrições de origens, poderes, rituais e magias ficam a cargo de cada mesa.
