// Fluxo offline do M7, no build de produção (service worker): abrir o app sem internet com os
// últimos dados, mexer na ficha, rolar no aparelho, e tudo chegar ao mestre quando a rede volta.
// Requer: Supabase local (pnpm db:start) e o build servido (pnpm --filter @rpg/web build && pnpm --filter @rpg/web preview).
// Uso: node apps/web/e2e/offline.e2e.cjs   (opcionais: E2E_BASE=http://localhost:4173, E2E_OUT)
const { chromium } = require('playwright');
const OUT = process.env.E2E_OUT || require('node:os').tmpdir();
const BASE = process.env.E2E_BASE || 'http://localhost:4173';
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
const saved = (p) => p.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 15000 });
const pvNow = (p, v, timeout = 10000) =>
  p.waitForFunction((x) => document.querySelector('[role="meter"][aria-label="Pontos de Vida"]')?.getAttribute('aria-valuenow') === String(x), v, { timeout });

(async () => {
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
  const gm = await (await browser.newContext(phone)).newPage();
  const plCtx = await browser.newContext(phone);
  const pl = await plCtx.newPage();
  for (const p of [gm, pl]) {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  }
  const ok = (msg) => console.log('OK  ', msg);
  globalThis.__dump = async () => {
    for (const [n, p] of [['JOGADOR', pl], ['MESTRE', gm]]) {
      console.log(n, p.url(), '\n', (await p.locator('body').innerText().catch(() => '?')).replace(/\n+/g, ' | ').slice(0, 600));
    }
  };
  for (const p of [gm, pl]) p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));

  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('link', { name: 'Criar mesa' }).click();
  await gm.getByLabel('Nome da mesa').fill('Sem sinal');
  await gm.getByRole('button', { name: 'Criar e virar mestre' }).click();
  const code = (await gm.getByLabel('Código de convite').textContent()).trim();
  const tableUrl = gm.url();
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${code}`);
  await pl.getByRole('heading', { name: 'Sem sinal' }).waitFor({ timeout: 15000 });
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await pl.getByRole('button', { name: 'Pular para a ficha (modo livre)' }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await saved(pl);
  await pvNow(pl, 21);
  const sheetUrl = pl.url();
  // Espera o service worker assumir a página e o cache das consultas ser gravado no aparelho.
  await pl.evaluate(() => navigator.serviceWorker.ready);
  await pl.reload();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  await pl.getByRole('tab', { name: 'Perícias' }).click();
  await pl.getByRole('button', { name: 'Rolar Luta' }).waitFor();
  await pl.waitForTimeout(2500);
  ok('ficha aberta online; service worker ativo');

  // 1. Sem internet: recarregar abre o app e a ficha com os últimos dados.
  await plCtx.setOffline(true);
  await pl.reload();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor({ timeout: 15000 });
  await pvNow(pl, 21);
  ok('sem internet, o app abriu e mostrou a ficha (PV 21/21)');

  // 2. Dano offline fica guardado.
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await pvNow(pl, 19);
  await pl.getByRole('status').filter({ hasText: 'Sem conexão' }).waitFor({ timeout: 10000 });
  ok('dano offline: PV 19, mudanças guardadas');

  // 3. Rolagem offline: feita no aparelho, marcada como aguardando envio.
  await pl.getByRole('tab', { name: 'Perícias' }).click();
  await pl.getByRole('button', { name: 'Rolar Luta' }).click();
  const dlg = pl.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Rolar', exact: true }).click();
  await dlg.getByText('Sem internet: rolado no aparelho').waitFor({ timeout: 10000 });
  const total = Number((await dlg.getByRole('status').locator('span').first().textContent()).replace('−', '-'));
  await dlg.getByRole('button', { name: 'Fechar' }).click();
  await pl.getByRole('link', { name: /Sem sinal/ }).click();
  await pl.getByRole('list', { name: 'Histórico da mesa' }).getByText('offline · aguardando envio').waitFor({ timeout: 10000 });
  ok(`rolagem offline (${total}) no histórico local, aguardando envio`);
  await pl.screenshot({ path: `${OUT}/m7-01-offline.png`, fullPage: true });

  // 4. A rede volta: dano e rolagem chegam ao mestre; a rolagem aparece marcada como offline.
  await gm.goto(tableUrl + '/rolagens');
  await gm.getByRole('heading', { name: 'Rolagens' }).waitFor();
  await plCtx.setOffline(false);
  const row = gm.getByRole('list', { name: 'Histórico da mesa' }).getByRole('listitem').filter({ hasText: 'Elena: Luta' });
  await row.waitFor({ timeout: 20000 });
  await row.getByText('offline', { exact: true }).waitFor();
  ok('rede voltou: mestre recebeu "Elena: Luta" marcada como offline');
  await gm.goto(sheetUrl);
  await pvNow(gm, 19, 15000);
  ok('e o dano feito offline (PV 19) chegou à ficha do mestre');

  await browser.close();
  console.log('TUDO OK');
})().catch(async (e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join('\n'));
  if (process.env.E2E_DEBUG) await globalThis.__dump?.();
  process.exit(1);
});
