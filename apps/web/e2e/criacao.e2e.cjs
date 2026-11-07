// Fluxo do M4 num navegador: assistente de criação (Ordem Paranormal por pontos, Tormenta20 por rolagem),
// rascunho retomado depois de recarregar, retrato enviado e visto pelo mestre, modo livre.
// Requer: Supabase local (pnpm db:start) e o app rodando (pnpm dev).
// Uso: node apps/web/e2e/criacao.e2e.cjs   (opcionais: E2E_BASE, E2E_OUT para as capturas)
const { chromium } = require('playwright');
const OUT = process.env.E2E_OUT || require('node:os').tmpdir();
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const stamp = Date.now();
// PNG 2x2 válido para o envio de retrato.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

async function signUp(page, name, email, start = '/') {
  await page.goto(BASE + start);
  await page.waitForURL(/\/entrar/);
  await page.getByRole('button', { name: 'Primeira vez? Criar conta' }).click();
  await page.getByLabel('Seu nome na mesa').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('segredo123');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
}

async function newTable(page, name, system) {
  await page.goto(BASE + '/mesas/nova');
  await page.getByLabel('Nome da mesa').fill(name);
  await page.getByLabel('Sistema').selectOption({ label: system });
  await page.getByRole('button', { name: 'Criar e virar mestre' }).click();
  await page.getByRole('heading', { name }).waitFor();
  return { code: (await page.getByLabel('Código de convite').textContent()).trim(), url: page.url() };
}

const next = (p) => p.getByRole('button', { name: 'Próximo' }).click();
const step = (p, title) => p.getByRole('heading', { name: title, exact: true }).waitFor();
const status = (p) => p.getByRole('status').filter({ hasText: 'Pontos restantes' });
const bought = async (p, label) => (await p.getByLabel(`${label} comprado`).textContent()).trim();
const saved = (p) => p.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 10000 });

(async () => {
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
  const gm = await (await browser.newContext(phone)).newPage();
  const pl = await (await browser.newContext(phone)).newPage();
  for (const p of [gm, pl]) {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  }
  const ok = (msg) => console.log('OK  ', msg);

  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('heading', { name: 'Suas mesas' }).waitFor();
  const op = await newTable(gm, 'Mesa OP', 'Ordem Paranormal');
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${op.code}`);
  await pl.getByRole('heading', { name: 'Mesa OP' }).waitFor({ timeout: 15000 });

  // ---------- Ordem Paranormal: assistente por pontos ----------
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await step(pl, 'Conceito');
  if ((await pl.getByLabel('Nome', { exact: true }).inputValue()) !== 'Elena') throw new Error('nome não veio preenchido');
  await pl.getByLabel('Jogador').fill('João');
  await pl.getByLabel('Conceito').fill('Ex-policial');
  await next(pl);
  await step(pl, 'Origem');
  await pl.getByLabel('Origem').fill('Policial');
  await next(pl);
  await step(pl, 'Classe');
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await next(pl);
  await step(pl, 'Atributos');
  await status(pl).filter({ hasText: 'Pontos restantes: 4 de 4' }).waitFor();
  ok('assistente: conceito, origem e classe; atributos começam com 4 pontos');

  const inc = (l) => pl.getByRole('button', { name: `Aumentar ${l}` }).click();
  const dec = (l) => pl.getByRole('button', { name: `Diminuir ${l}` }).click();
  await inc('Força');
  await inc('Força');
  await inc('Agilidade');
  await inc('Vigor');
  await status(pl).filter({ hasText: 'Pontos restantes: 0 de 4' }).waitFor();
  if (!(await pl.getByRole('button', { name: 'Aumentar Força' }).isDisabled())) throw new Error('Força passou de 3');
  await inc('Agilidade');
  await status(pl).filter({ hasText: 'Pontos demais: 1 acima do total de 4' }).waitFor();
  ok('gastar a mais avisa sem bloquear; Força para em 3');
  await dec('Agilidade');
  await dec('Intelecto');
  await status(pl).filter({ hasText: 'Pontos restantes: 1 de 4' }).waitFor();
  await inc('Presença');
  await status(pl).filter({ hasText: 'Pontos restantes: 0 de 4' }).waitFor();
  const got = [];
  for (const l of ['Agilidade', 'Força', 'Intelecto', 'Presença', 'Vigor']) got.push(await bought(pl, l));
  if (got.join(',') !== '2,3,0,2,2') throw new Error('atributos ' + got.join(','));
  ok('baixar Intelecto para 0 devolveu 1 ponto: AGI 2, FOR 3, INT 0, PRE 2, VIG 2');
  await saved(pl);

  // Rascunho: recarrega e volta no mesmo passo, com os mesmos valores.
  await pl.reload();
  await step(pl, 'Atributos');
  if ((await bought(pl, 'Força')) !== '3') throw new Error('rascunho perdeu os atributos');
  ok('recarregar a página retoma o rascunho no passo de atributos');

  await next(pl);
  await step(pl, 'Perícias');
  await pl.getByRole('combobox', { name: 'Luta: Grau' }).selectOption({ label: 'Treinado' });
  await next(pl);
  await step(pl, 'Equipamento');
  await next(pl);
  await step(pl, 'Detalhes');
  await pl.getByLabel('Escolher retrato').setInputFiles({ name: 'elena.png', mimeType: 'image/png', buffer: PNG });
  await pl.getByRole('img', { name: 'Retrato do personagem' }).waitFor({ timeout: 15000 });
  ok('retrato enviado (redimensionado no aparelho) e exibido');
  await pl.getByLabel('Aparência').fill('Cabelo curto, jaqueta surrada.');
  await next(pl);
  await step(pl, 'Revisão');
  await pl.getByText('Tudo certo pelas regras do template.').waitFor();
  const review = await pl.locator('main').innerText();
  for (const expected of ['Pontos de Vida\n22', 'Pontos de Esforço\n4', 'Sanidade\n12']) {
    if (!review.includes(expected)) throw new Error('revisão sem ' + JSON.stringify(expected) + '\n' + review);
  }
  ok('revisão: PV 22, PE 4, SAN 12, sem avisos');
  await pl.screenshot({ path: `${OUT}/m4-01-revisao.png`, fullPage: true });
  await pl.getByRole('button', { name: 'Concluir', exact: true }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  if (await pl.getByRole('link', { name: 'Continuar criação' }).count()) throw new Error('ficha ainda em rascunho');
  ok('concluir leva à ficha e tira do rascunho');

  await gm.goto(op.url);
  const card = gm.getByRole('link', { name: /Elena/ });
  await card.waitFor();
  await card.getByRole('img', { name: 'Elena' }).waitFor({ timeout: 10000 });
  if (await card.getByText('rascunho').count()) throw new Error('mestre vê rascunho');
  ok('mestre vê Elena com retrato na lista da mesa');

  // ---------- Tormenta20: rolagem com ajuste de raça ----------
  const t20 = await newTable(gm, 'Mesa T20', 'Tormenta20 (Jogo do Ano)');
  await gm.getByRole('button', { name: 'Novo personagem' }).click();
  await gm.getByLabel('Nome do personagem').fill('Kara');
  await gm.getByRole('button', { name: 'Criar ficha' }).click();
  await step(gm, 'Conceito');
  await next(gm);
  await step(gm, 'Raça');
  await gm.getByLabel('Raça').fill('Anã');
  await next(gm);
  await step(gm, 'Classe');
  await gm.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Guerreiro' });
  await next(gm);
  await step(gm, 'Atributos');
  await gm.getByRole('radio', { name: 'Rolar' }).click();
  await gm.getByRole('button', { name: 'Rolar atributos' }).click();
  await gm.getByRole('list', { name: 'Resultados rolados' }).locator('li').nth(5).waitFor();
  const sel = (l) => gm.getByRole('combobox', { name: `${l}: resultado` });
  const forBefore = await sel('Força').inputValue();
  const carBefore = await sel('Carisma').inputValue();
  await sel('Força').selectOption(carBefore);
  await gm.waitForFunction(
    ([f, c]) =>
      document.querySelector('select[aria-label="Força: resultado"]')?.value === c &&
      document.querySelector('select[aria-label="Carisma: resultado"]')?.value === f,
    [forBefore, carBefore],
  );
  ok('rolou 6 resultados; trocar Força ↔ Carisma troca os dois');

  const conAdj = gm.getByLabel('Constituição: Raça e origem');
  await conAdj.fill('2');
  await conAdj.press('Enter');
  const conText = await gm.getByRole('combobox', { name: 'Constituição: resultado' }).locator('option:checked').textContent();
  const rolled = Number(conText.trim().split(' ')[0].replace('−', '-').replace('+', ''));
  await gm.waitForFunction(
    (v) => [...document.querySelectorAll('li')].some((li) => li.textContent?.includes('Constituição') && li.textContent?.includes(`Final ${v}`.replace('-', '−'))),
    rolled + 2,
  );
  ok(`ajuste de raça: Constituição ${rolled} + 2 = ${rolled + 2}`);
  await gm.screenshot({ path: `${OUT}/m4-02-rolagem.png`, fullPage: true });

  // Modo livre: pula para a ficha a qualquer momento.
  await gm.getByRole('button', { name: 'Pular para a ficha (modo livre)' }).click();
  await gm.getByRole('heading', { name: 'Kara' }).waitFor();
  const con = await gm.getByRole('textbox', { name: 'Constituição', exact: true }).inputValue();
  if (Number(con.replace('−', '-')) !== rolled + 2) throw new Error('Constituição na ficha: ' + con);
  ok('modo livre abre a ficha com os atributos do assistente');

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});
