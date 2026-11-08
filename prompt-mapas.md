# Prompt: implementar o editor de mapas com grid (M8 — Mapas)

Cole tudo abaixo numa sessão nova do Claude Code aberta na raiz do projeto `rpg-mesa`.

---

## ESTADO ATUAL (atualizado em 08/11/2026, branch `feat/mapas`)

**Pronto e testado — não refaça:**

- `supabase/migrations/20261108000007_maps.sql`: tabelas `maps`, `map_tokens` e `map_marks`; RPC `set_active_map`; triggers de guarda, herança de mesa e "tocar o mapa"; `private.token_visible`; RLS; bucket `maps`; publicação no tempo real. Já aplicada no Supabase local.
  - Detalhe: a guarda dos tokens roda antes da herança de `campaign_id`, por isso usa `m.campaign_id` do mapa.
  - No insert de token ou marca, o `campaign_id` enviado é sobrescrito pelo do mapa, mas a coluna é `not null`: envie o `campaign_id` da mesa.
- `supabase/test/mapas.test.ts`: 7 testes cobrindo visibilidade, mapa ativo, jogador movendo só o próprio token, limites do grid, névoa, combatente escondido, toque no mapa e marcas `gm_only`. Os 66 testes do banco passam.
- `supabase/test/global-setup.ts`: corrigido para Windows (`fileURLToPath`).
- `apps/web/src/lib/database.types.ts`: regenerado com as tabelas novas.
- `apps/web/src/map/geometry.ts` + `apps/web/test/map-geometry.test.ts` (15 testes passando): `cellAt`, `toCellSpace`, `toImageSpace`, `cellRect`, `snapToken`, `distanceCells`, `distanceMeters`, `formatMeters`, `areaCells` (circle/cone/line, `CONE_ANGLE` = 90), `tokensInCells`, `paintFog`, `fillFog`, `isRevealed`, `tokenVisible`, `freeSpots`, `simplifyStroke`.
- `tsc -p apps/web` passa.

**Como rodar os testes do banco neste Windows:**

```bash
docker exec supabase_db_rpg psql -U postgres -c "drop database if exists rpg_test" -c "create database rpg_test"
```

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/rpg_test npx vitest run --project banco
```

**Falta fazer (nesta ordem):**

1. `apps/web/src/api/maps.ts` (hooks e ações) + cache da imagem na Cache Storage + limpar o cache em `forgetEverything`.
2. Handlers no `api/realtime.ts`.
3. Strings `maps` no `pt-BR.ts`.
4. Página de lista `/mesas/:id/mapas` + `MapCard` e atalho no hub.
5. Quadro `/mesas/:id/mapas/:mapId` com pan/zoom e ferramentas.
6. Painel do token.
7. Exportar campanha.
8. README.
9. Verificação no navegador com duas contas e e2e opcional.

---

Implemente uma feature nova no projeto **rpg-mesa**: **mapas com grid para posicionar os personagens**, integrada ao sistema que já existe, como se sempre tivesse feito parte dele. O escopo já foi definido com o usuário (decisões abaixo). Não faça mais perguntas de escopo: estude o código, implemente, teste e verifique no navegador.

## Contexto do projeto (já estudado)

- Monorepo pnpm: `packages/engine` (motor de regras), `packages/templates`, `apps/web` (React 19 + Vite + Tailwind 4 + TanStack Query + supabase-js + react-router 7 + i18next + lucide-react, PWA), `supabase/migrations`, `supabase/test` (testes do banco com vitest + pg).
- Textos da interface e comentários em **português**; strings em `apps/web/src/i18n/pt-BR.ts`.
- Padrões a seguir:
  - Migrações em `supabase/migrations/AAAAMMDDNNNNNN_nome.sql`. A última é `20261108000006_templates_v3.sql`; crie `20261108000007_maps.sql`.
  - Funções auxiliares de RLS: `private.is_member(c)`, `private.is_gm(c)`, `private.owns_character(ch)`, `private.require_user()`, `private.try_uuid(t)`, `private.touch_updated_at()`. Funções públicas são `security definer set search_path = ''`, e se faz `revoke execute ... from public, anon` + `grant execute ... to authenticated`. Erros com códigos `42501` (permissão), `PT404` (não encontrado), `22023` (valor inválido), com mensagem em português.
  - Tabelas da mesa carregam `campaign_id` (RLS + filtro do tempo real). Para entrar no tempo real: `alter publication supabase_realtime add table ...`.
  - Storage: buckets privados, caminho `<campaign_id>/<arquivo>` e políticas usando `(storage.foldername(name))[1]` (ver `20261107000002_rls.sql`, que tem o modelo dos buckets `portraits` e `handouts`).
  - Truque para o tempo real quando uma linha deixa de ser visível para o jogador: um trigger "toca" a linha pai (ver `private.touch_encounter` em `20261108000003_combat.sql`).
  - API do app: hooks em `apps/web/src/api/*.ts` (modelo: `combat.ts`, `handouts.ts`), helper `check()`, chaves de query `[recurso, campaignId]`.
  - Tempo real: um canal por mesa em `apps/web/src/api/realtime.ts`. Adicione handlers para as tabelas novas, invalide `['maps', campaignId]` quando houver mudança e inclua `'maps'` na lista que é relida no `SUBSCRIBED`. Mudanças em `encounters` e `combatants` também devem invalidar os mapas, porque afetam quais tokens o jogador enxerga.
  - Upload de imagem: `resizeImage(file, max)` em `apps/web/src/api/portraits.ts` (gera WebP). Para mapas, use `max` de aproximadamente 3000.
  - UI: `Button`, `Card`, `Field`, `Input`, `Select`, `ErrorNote`, `Spinner`, `cx` em `components/ui.tsx`; `Toggle` em `sheet/fields.tsx`; alvos de toque de 48px; tema com variáveis CSS (`bg-surface`, `text-accent`, `border-line` etc.).
  - Rotas lazy em `apps/web/src/main.tsx`. O hub da mesa (`pages/Campaign.tsx`) tem a grade de atalhos de ferramentas e o `CombatCard`.
  - Combate: `useCurrentEncounter(campaignId)` em `api/combat.ts` devolve `current_combatant_id`, `combatants[]` com `public_status`, `hidden`, `character`. Os componentes `PcVitals` e `NpcVitals` ficam em `combat/Vitals.tsx`.
  - Personagens: `useCharacters(campaignId)` (sem biblioteca), `useLibrary`, `PortraitImage` em `sheet/Portrait.tsx`, `usePortraitUrl`.
  - Offline: o cache do React Query é persistido no IndexedDB. `forgetEverything()` em `sync/index.ts` limpa tudo ao sair da conta.
  - Exportar campanha: `api/exporting.ts` (inclua `maps`, `map_tokens` e `map_marks`).
  - Tipos do banco: `apps/web/src/lib/database.types.ts` é gerado. Depois de aplicar a migração no Supabase local, rode `pnpm db:types`.
- Ambiente: Windows. O Supabase local já está rodando no Docker (`supabase_db_rpg` em `127.0.0.1:54322`, usuário e senha `postgres`). Não há Postgres instalado na máquina; para os testes do banco, crie um banco vazio no container (ex.: `docker exec supabase_db_rpg psql -U postgres -c "create database rpg_test"`) e rode com `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/rpg_test pnpm test:db`. Recrie o banco a cada rodada.

## Decisões do usuário (escopo fechado)

1. **Uso:** compartilhado ao vivo. O mestre cria; todos veem no celular e os tokens se movem em tempo real.
2. **Criação:** imagem de fundo enviada pelo mestre + grid sobreposto, com tamanho da célula e deslocamento (offset) ajustáveis para alinhar com o desenho. A imagem é opcional: sem imagem, o mapa fica com fundo liso e o grid.
3. **Grid:** só quadrado. 1 quadrado = 1,5 m por padrão (configurável por mapa).
4. **Tokens ligados às fichas:** vêm de personagens (PJs/NPCs) e de combatentes do combate. Usam o retrato, mostram estado/PV e destacam de quem é a vez.
5. **Extras, todos incluídos:** névoa de guerra, régua de distância, áreas de efeito (círculo, cone, linha) e desenho livre + alfinetes com nota (visíveis a todos ou só ao mestre).
6. **Movimento:** o jogador move o próprio token (personagem cujo `owner_id` é ele); o mestre move qualquer um.
7. **Tamanho do token:** de 1x1 a 4x4 (pequeno/médio = 1, grande = 2, enorme = 3, colossal = 4).
8. **Offline:** só leitura (como inventário e combate). O último estado aparece sem rede; mover e editar exigem internet.
9. **Mapa ativo:** a mesa tem vários mapas, e o mestre marca um como "na mesa", que aparece em destaque para todos. Os outros ficam em preparo, escondidos dos jogadores (a não ser que sejam revelados).
10. **Integração com o combate:** botão "colocar combatentes do combate no mapa"; o token da vez fica destacado; combatentes escondidos no combate não aparecem para os jogadores.
11. **Fora desta versão:** iluminação dinâmica, paredes com linha de visão, grid hexagonal, pintura de terreno célula a célula e edição offline.

## Desenho técnico proposto

### Banco (`20261108000007_maps.sql`)

- `public.maps`: `id`, `campaign_id`, `name` (1–100), `image_path` (nulo = sem imagem), `image_w`, `image_h` (pixels; sem imagem = `cols*cell_px` × `rows*cell_px`), `cell_px` (tamanho da célula em pixels da imagem, ex.: 70), `offset_x`, `offset_y` (origem do grid, de 0 a `cell_px`), `cols`, `rows` (limite de ~100x100), `cell_meters numeric default 1.5`, `diagonal text default 'alternate' check in ('alternate','equal')` (régua: diagonal alternando 1–2 ou sempre 1), `revealed boolean default false`, `active boolean default false`, `fog_enabled boolean default false`, `fog text not null default ''` (bitstring `'0'/'1'` de tamanho `cols*rows`, onde `'1'` = célula revelada; posições que faltam = escondidas), `created_at`, `updated_at` (com o trigger `touch_updated_at`).
  - Índice único parcial `(campaign_id) where active`. Trigger: `active` ⇒ `revealed := true`.
  - RPC `public.set_active_map(p_campaign uuid, p_map uuid)` (só o mestre; `p_map` nulo tira o mapa da mesa), que desmarca os outros de forma atômica.
  - RLS: select = mestre, ou membro com `revealed`; insert/update/delete = mestre.
- `public.map_tokens`: `id`, `map_id` (cascade), `campaign_id` (herdado do mapa por trigger), `character_id` (set null), `combatant_id` (set null), `label`, `x`, `y` (célula do canto superior esquerdo), `size int 1..4`, `color text`, `hidden boolean default false`, `created_at`, `updated_at`.
  - Trigger de guarda: o personagem ou combatente precisa ser da mesma mesa; posição dentro do grid (`0 ≤ x ≤ cols - size`); quem não é mestre só pode mudar `x` e `y`.
  - Função `private.token_visible(map, x, y, size)`: verdadeira se a névoa está desligada ou se alguma célula coberta pelo token está revelada.
  - RLS select: mestre, ou membro com o mapa visível (subconsulta respeitando o RLS de maps) e `not hidden` e (`combatant_id` nulo ou o combatente visível para quem lê) e `token_visible(...)`.
  - insert/delete = mestre; update = mestre ou `owns_character(character_id)`.
  - Trigger after update de `x`, `y`, `hidden`: se a visibilidade pela névoa ou o `hidden` mudou, toca `maps.updated_at` para os jogadores relerem (o tempo real não avisa quem deixou de ver a linha).
- `public.map_marks`: `id`, `map_id` (cascade), `campaign_id` (herdado), `author_id`, `kind text check in ('draw','pin','area')`, `data jsonb`, `color text`, `gm_only boolean default false`, `created_at`.
  - `data`: desenho = `{points: [[x,y],...], width}` em pixels da imagem (simplificar e limitar a ~2000 pontos); alfinete = `{x, y, text}`; área = `{shape: 'circle'|'cone'|'line', origin: {x,y}, target: {x,y}, size_m}` em unidades de célula.
  - RLS select: mestre, ou membro com o mapa visível e `not gm_only`. Insert: membro com `author_id = auth.uid()`, mapa visível, e `gm_only` só para o mestre. Delete: autor ou mestre. Sem update.
- Bucket `maps` (privado): select = mestre ou `exists (select 1 from public.maps m where m.image_path = objects.name)`; insert/delete = mestre.
- Adicionar `maps`, `map_tokens` e `map_marks` à publicação `supabase_realtime`.
- Limitação conhecida (documentar no README): a névoa cobre a imagem no aparelho do jogador, mas a imagem inteira é baixada. Os tokens escondidos, esses sim, nunca chegam ao jogador.

### Geometria (`apps/web/src/map/geometry.ts`, com testes em `apps/web/test/map-geometry.test.ts`)

Funções puras: célula sob um ponto, retângulo da célula, distância em quadrados e metros (regras `alternate` e `equal`), células atingidas por área (círculo: centro da célula a uma distância ≤ raio; cone de 90° a partir do centro da célula de origem, na direção do alvo; linha com 1 célula de largura), tokens atingidos, leitura e escrita da névoa (get/set, pincel quadrado, revelar ou cobrir tudo, reset quando `cols`/`rows` mudarem) e busca de células livres para posicionar vários tokens de uma vez.

### App

- `api/maps.ts`: `useMaps(campaignId)`, `useMap(campaignId, mapId)` (mapa + tokens + marcas), ações (criar com upload, editar grid, revelar, ativar, apagar mapa e imagem do storage, colocar/mover/redimensionar/esconder/remover token, colocar combatentes do combate, criar/apagar marca, salvar névoa com debounce). Movimento de token otimista; o evento de UPDATE do tempo real atualiza o cache direto.
- Imagem do mapa offline: baixar via signed URL e guardar na Cache Storage (`caches.open('map-images')`, chave sintética por `path`); ler do cache primeiro e usar object URL. Limpar esse cache em `forgetEverything()`.
- Rotas: `/mesas/:id/mapas` (lista; o mestre cria, revela, ativa e apaga) e `/mesas/:id/mapas/:mapId` (quadro).
- Hub (`Campaign.tsx`): atalho "Mapas" na grade de ferramentas e um `MapCard`, no estilo do `CombatCard`, mostrando o mapa "na mesa".
- Quadro em tela cheia (`fixed inset-0`, por cima do layout `max-w-2xl`), em SVG com viewBox em pixels da imagem: imagem de fundo, grid via `<pattern>`, marcas, tokens (círculo com retrato recortado, anel de estado, destaque de turno, tamanho N×N) e a névoa por cima (opaca para jogadores, translúcida para o mestre).
  - Pan e zoom: arrastar com um dedo, pinça com dois, roda do mouse.
  - Barra de ferramentas: Mover (pan + arrastar token com snap na célula), Régua (arrastar mostra quadrados e metros), Área (círculo/cone/linha com tamanho em metros; destaca as células e tokens atingidos; botão para fixar no mapa), Desenho (cor), Alfinete (texto; o mestre escolhe "só mestre"), Névoa (só o mestre: pincel revelar/cobrir, revelar tudo, cobrir tudo, liga/desliga) e Ajustar grid (só o mestre: `cell_px`, offsets, `cols`/`rows`, metros por quadrado, regra da diagonal).
  - Painel do mestre para colocar tokens: lista de PJs/NPCs (não biblioteca) e combatentes do combate atual. Tocar escolhe e depois tocar na célula coloca. Botão "Colocar todos do combate" usa células livres.
  - Tocar num token abre um painel inferior com nome, `PcVitals`/`NpcVitals` quando ligado a um combatente, estado público, link para a ficha e, para o mestre, tamanho, esconder e remover.
  - Destaque do turno: `token.combatant_id === current_combatant_id`, ou token de PJ cujo `character_id` é o do combatente atual.
  - Sem rede: aviso "só leitura" e ferramentas de edição desativadas.
- i18n: novo bloco `maps` em `pt-BR.ts`, com todas as strings da feature.
- Exportar campanha: incluir `maps`, `map_tokens` e `map_marks`.
- README: linha "M8 — Mapas" na tabela de estado, a limitação da névoa e o novo e2e.

## Testes e verificação

1. Testes do banco em `supabase/test/mapas.test.ts`, usando os helpers `createTable`, `createCharacter`, `as`, `admin` e `expectPgError` de `supabase/test/db.ts`:
   - o jogador só vê mapa revelado e ativo;
   - `set_active_map` deixa um ativo só;
   - o jogador move o próprio token e não o dos outros, nem muda `size`/`hidden`;
   - token escondido, sob névoa ou de combatente escondido não chega ao jogador;
   - marca `gm_only` só para o mestre;
   - quem não é membro não vê nada.
2. Testes de geometria (projeto vitest `web`).
3. `pnpm typecheck` e `pnpm test`.
4. Aplicar a migração no Supabase local (`pnpm supabase migration up` ou `pnpm db:reset`), rodar `pnpm db:types` e depois `pnpm dev`. Verificar no navegador embutido com duas contas (mestre e jogador, viewport de celular): criar mapa com imagem, alinhar o grid, ativar, colocar tokens, o jogador mover o próprio token ao vivo, névoa escondendo token, régua, área, desenho, alfinete e destaque do turno com o combate rodando.
5. Opcional: `apps/web/e2e/mapas.e2e.cjs` no estilo de `mestre.e2e.cjs` (Playwright, duas páginas de celular) e incluí-lo no script `e2e` do `package.json`.

Não faça commit sem eu pedir. No fim, resuma o que foi feito, o que foi testado e o que ficou de fora.
