// Fluxo completo do M2 num navegador: cadastro, mesa, convite, tempo real, presença, preferências.
// Requer: Supabase local (pnpm supabase start) e o app rodando (pnpm --filter @rpg/web dev).
// Uso: node apps/web/e2e/mesa.e2e.cjs   (variáveis opcionais: E2E_BASE, E2E_OUT para as capturas)
const { chromium } = require('playwright');
const OUT = process.env.E2E_OUT || require('node:os').tmpdir();
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const stamp = Date.now();

async function signUp(page, name, email) {
  await page.goto(BASE + '/');
  await page.waitForURL(/\/entrar/);
  await page.getByRole('button', { name: 'Primeira vez? Criar conta' }).click();
  await page.getByLabel('Seu nome na mesa').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('segredo123');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
}

(async () => {
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
  const gmCtx = await browser.newContext(phone);
  const plCtx = await browser.newContext(phone);
  const gm = await gmCtx.newPage();
  const pl = await plCtx.newPage();
  for (const p of [gm, pl]) {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    p.on('console', (m) => (m.type() === 'error') && console.log('CONSOLE', m.text()));
  }
  const ok = (msg) => console.log('OK  ', msg);

  // 1. Login
  await gm.goto(BASE + '/entrar');
  await gm.screenshot({ path: `${OUT}/01-login.png` });
  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('heading', { name: 'Suas mesas' }).waitFor();
  await gm.getByText('Você ainda não está em nenhuma mesa.').waitFor();
  ok('mestre criou conta e vê lista vazia');
  await gm.screenshot({ path: `${OUT}/02-lista-vazia.png` });

  // 2. Criar mesa
  await gm.getByRole('link', { name: 'Criar mesa' }).click();
  await gm.getByLabel('Nome da mesa').fill('Segredos de Santo Berço');
  const options = await gm.getByLabel('Sistema').locator('option').allTextContents();
  ok('sistemas disponíveis: ' + options.join(', '));
  await gm.getByLabel('Sistema').selectOption({ label: 'Ordem Paranormal' });
  await gm.getByRole('button', { name: 'Criar e virar mestre' }).click();
  await gm.getByRole('heading', { name: 'Segredos de Santo Berço' }).waitFor();
  const code = (await gm.getByLabel('Código de convite').textContent()).trim();
  ok('mesa criada, código ' + code);
  const campaignUrl = gm.url();

  // 3. Jogador entra pelo link
  await pl.goto(`${BASE}/convite/${code}`);
  await pl.waitForURL(/\/entrar\?next=/);
  ok('link de convite pede login e guarda o destino');
  await pl.getByRole('button', { name: 'Primeira vez? Criar conta' }).click();
  await pl.getByLabel('Seu nome na mesa').fill('João');
  await pl.getByLabel('E-mail').fill(`joao${stamp}@teste.dev`);
  await pl.getByLabel('Senha').fill('segredo123');
  await pl.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await pl.getByRole('heading', { name: 'Segredos de Santo Berço' }).waitFor({ timeout: 15000 });
  if (pl.url() !== campaignUrl) throw new Error('jogador caiu em ' + pl.url());
  ok('jogador criou conta e entrou direto na mesa');
  if (await pl.getByLabel('Código de convite').count()) throw new Error('jogador está vendo o convite');
  ok('jogador não vê o convite');

  // 4. Tempo real e presença no aparelho do mestre
  await gm.getByText('João').waitFor({ timeout: 10000 });
  ok('mestre viu o João entrar sem recarregar');
  await gm.waitForFunction(() => document.querySelectorAll('[aria-label="conectado"]').length === 2, null, { timeout: 10000 });
  ok('presença: 2 conectados');
  await gm.screenshot({ path: `${OUT}/03-mesa-mestre.png`, fullPage: true });
  await pl.screenshot({ path: `${OUT}/04-mesa-jogador.png`, fullPage: true });

  // 5. Código inválido
  await pl.goto(BASE + '/');
  await pl.getByText('Segredos de Santo Berço').waitFor();
  await pl.getByLabel('Código de convite').fill('zzzzzz');
  await pl.getByRole('button', { name: 'Entrar com código' }).click();
  await pl.getByText('Código de convite inválido').waitFor();
  ok('código inválido mostra erro em português');
  await pl.screenshot({ path: `${OUT}/05-lista-jogador.png` });

  // 6. Jogador sai; mestre vê sair
  await pl.getByText('Segredos de Santo Berço').click();
  await pl.getByRole('button', { name: 'Sair da mesa' }).click();
  await pl.getByRole('heading', { name: 'Suas mesas' }).waitFor();
  await gm.getByText('João').waitFor({ state: 'detached', timeout: 10000 });
  ok('jogador saiu e sumiu da lista do mestre ao vivo');

  // 7. Mestre troca o código; o antigo deixa de valer
  await gm.getByRole('button', { name: 'Gerar código novo' }).click();
  await gm.waitForFunction((old) => document.querySelector('[aria-label="Código de convite"]')?.textContent?.trim() !== old, code);
  await pl.getByLabel('Código de convite').fill(code);
  await pl.getByRole('button', { name: 'Entrar com código' }).click();
  await pl.getByText('Código de convite inválido').waitFor();
  ok('código antigo deixou de funcionar');

  // 8. Preferências: tema claro e fonte maior
  await gm.getByRole('link', { name: 'Perfil e preferências' }).click();
  await gm.getByText('Claro', { exact: true }).click();
  await gm.getByText('Maior', { exact: true }).click();
  const isDark = await gm.evaluate(() => document.documentElement.classList.contains('dark'));
  const fs = await gm.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  if (isDark || fs !== '20px') throw new Error(`prefs não aplicadas: dark=${isDark} fs=${fs}`);
  ok('tema claro e fonte 125% aplicados');
  await gm.screenshot({ path: `${OUT}/06-perfil-claro.png`, fullPage: true });
  await gm.reload();
  if (await gm.evaluate(() => document.documentElement.classList.contains('dark'))) throw new Error('tema não persistiu');
  ok('preferência persiste após recarregar');

  // 9. Apagar mesa
  await gm.goto(campaignUrl);
  await gm.getByRole('button', { name: 'Apagar mesa' }).click();
  await gm.getByText('Você ainda não está em nenhuma mesa.').waitFor();
  ok('mestre apagou a mesa');

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
