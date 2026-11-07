// Fluxo do M3 num navegador: ficha gerada pelo template, cálculos, recursos, condições,
// tempo real entre jogador e mestre, fila offline e persistência da fila ao fechar o app.
// Requer: Supabase local (pnpm db:start) e o app rodando (pnpm dev).
// Uso: node apps/web/e2e/ficha.e2e.cjs   (opcionais: E2E_BASE, E2E_OUT para as capturas)
const { chromium } = require('playwright');
const OUT = process.env.E2E_OUT || require('node:os').tmpdir();
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const stamp = Date.now();

async function signUp(page, name, email, start = '/') {
  await page.goto(BASE + start);
  await page.waitForURL(/\/entrar/);
  await page.getByRole('button', { name: 'Primeira vez? Criar conta' }).click();
  await page.getByLabel('Seu nome na mesa').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('segredo123');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
}

const pv = (page) => page.getByRole('meter', { name: 'Pontos de Vida' }).first();
const pvNow = async (page) => Number(await pv(page).getAttribute('aria-valuenow'));
async function waitPv(page, value, timeout = 10000) {
  await page.waitForFunction(
    (v) => document.querySelector('[role="meter"][aria-label="Pontos de Vida"]')?.getAttribute('aria-valuenow') === String(v),
    value,
    { timeout },
  );
}
const saved = (page) => page.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 10000 });

async function setNumber(page, label, value) {
  const box = page.getByRole('textbox', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
}

(async () => {
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
  const gmCtx = await browser.newContext(phone);
  const plCtx = await browser.newContext(phone);
  const gm = await gmCtx.newPage();
  let pl = await plCtx.newPage();
  const watch = (p) => {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  };
  watch(gm);
  watch(pl);
  const ok = (msg) => console.log('OK  ', msg);

  // Mesa com mestre e jogador.
  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('link', { name: 'Criar mesa' }).click();
  await gm.getByLabel('Nome da mesa').fill('Ficha de teste');
  await gm.getByLabel('Sistema').selectOption({ label: 'Ordem Paranormal' });
  await gm.getByRole('button', { name: 'Criar e virar mestre' }).click();
  const code = (await gm.getByLabel('Código de convite').textContent()).trim();
  const campaignUrl = gm.url();
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${code}`);
  await pl.getByRole('heading', { name: 'Ficha de teste' }).waitFor({ timeout: 15000 });
  ok('mesa pronta');

  // Jogador cria a ficha.
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  const sheetUrl = pl.url();
  await pl.getByRole('button', { name: '2 avisos' }).click();
  await pl.getByText('Na criação, os atributos somam 9 (todos em 1 mais 4 pontos); agora somam 5.').waitFor();
  await pl.getByText('Escolha uma classe para calcular PV, PE e Sanidade.').waitFor();
  ok('ficha criada pelo template, com avisos de classe e de soma de atributos');

  // Classe, NEX e atributos → PV 34, Defesa 12.
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await setNumber(pl, 'NEX (%)', 15);
  for (const [label, v] of [['Agilidade', 2], ['Força', 3], ['Intelecto', 1], ['Presença', 1], ['Vigor', 2]]) await setNumber(pl, label, v);
  await waitPv(pl, 34);
  const max = await pv(pl).getAttribute('aria-valuemax');
  if (max !== '34') throw new Error('PV máximo ' + max);
  await pl.getByRole('button', { name: 'Defesa: 12' }).waitFor();
  if (await pl.getByRole('button', { name: /avisos?$/ }).count()) throw new Error('ainda há avisos');
  ok('Combatente NEX 15%: PV 34/34, Defesa 12, sem avisos');
  await saved(pl);
  await pl.screenshot({ path: `${OUT}/m3-01-ficha.png`, fullPage: true });

  // Dano com toques rápidos: vira um lote só.
  for (let i = 0; i < 3; i++) await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await waitPv(pl, 31);
  await saved(pl);
  ok('três toques de −1: PV 31 e salvo');

  // Mestre abre a ficha e vê o mesmo; depois vê ao vivo.
  await gm.goto(campaignUrl);
  await gm.getByRole('link', { name: /Elena/ }).click();
  await gm.getByRole('heading', { name: 'Elena' }).waitFor();
  await waitPv(gm, 31);
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await waitPv(gm, 30);
  ok('mestre viu o PV cair para 30 sem recarregar');

  // Mestre aplica Desprevenido; o jogador vê a Defesa cair.
  await gm.getByRole('button', { name: 'Mudar condições' }).click();
  await gm.getByRole('button', { name: 'Desprevenido' }).click();
  await pl.getByRole('button', { name: 'Defesa: 7' }).waitFor({ timeout: 10000 });
  await pl.getByText('Desprevenido', { exact: true }).waitFor();
  await pl.getByRole('button', { name: 'Defesa: 7' }).click();
  await pl.getByText('−5 · Desprevenido').waitFor();
  ok('condição do mestre chegou ao jogador; Defesa 7 com a origem do −5');

  // Perícias: Luta treinada.
  await pl.getByRole('tab', { name: 'Perícias' }).click();
  await pl.getByRole('combobox', { name: 'Luta: Grau' }).selectOption({ label: 'Treinado' });
  await pl.getByRole('button', { name: 'Luta Bônus: +5' }).waitFor();
  ok('Luta treinada: +5');
  await saved(pl);
  await pl.screenshot({ path: `${OUT}/m3-02-pericias.png` });
  await pl.getByRole('tab', { name: 'Personagem' }).click();

  // Sem internet: as mudanças ficam guardadas e vão quando a rede volta.
  await plCtx.setOffline(true);
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await waitPv(pl, 28);
  await pl.getByRole('status').filter({ hasText: 'Sem conexão' }).waitFor({ timeout: 10000 });
  await pl.screenshot({ path: `${OUT}/m3-03-offline.png` });
  await gm.waitForTimeout(1500);
  if ((await pvNow(gm)) !== 30) throw new Error('mestre recebeu algo offline?');
  await plCtx.setOffline(false);
  await waitPv(gm, 28, 15000);
  await saved(pl);
  ok('offline: 2 mudanças guardadas; ao voltar, o mestre viu PV 28');

  // Fecha o app com mudança pendente e abre de novo: a fila sobrevive.
  await plCtx.setOffline(true);
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await pl.getByRole('status').filter({ hasText: 'Sem conexão' }).waitFor({ timeout: 10000 });
  await pl.close();
  await plCtx.setOffline(false);
  pl = await plCtx.newPage();
  watch(pl);
  await pl.goto(sheetUrl);
  await waitPv(gm, 27, 15000);
  await waitPv(pl, 27);
  ok('mudança feita offline antes de fechar o app chegou depois de reabrir');

  // Nota pública do jogador aparece para o mestre.
  await pl.getByRole('tab', { name: 'Notas' }).click();
  await pl.getByRole('button', { name: 'Nova nota' }).click();
  await pl.getByLabel('Título').fill('Pista do porão');
  await pl.getByLabel('Texto').fill('Símbolo de Sangue na parede.');
  await pl.getByLabel('Quem vê').selectOption({ label: 'Toda a mesa' });
  await pl.getByRole('button', { name: 'Salvar' }).click();
  await gm.getByRole('tab', { name: 'Notas' }).click();
  await gm.getByText('Pista do porão').waitFor({ timeout: 10000 });
  ok('nota pública do jogador apareceu para o mestre');

  // Terceira pessoa (outro jogador) vê a ficha só para leitura.
  const otherCtx = await browser.newContext(phone);
  const other = await otherCtx.newPage();
  watch(other);
  await signUp(other, 'Bia', `bia${stamp}@teste.dev`, `/convite/${code}`);
  await other.getByRole('heading', { name: 'Ficha de teste' }).waitFor({ timeout: 15000 });
  await other.goto(sheetUrl);
  await other.getByRole('heading', { name: 'Elena' }).waitFor();
  await other.getByText('Só leitura').waitFor();
  if (await other.getByRole('button', { name: 'Diminuir Pontos de Vida' }).count()) throw new Error('outro jogador pode editar');
  ok('outro jogador vê a ficha só para leitura');

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
