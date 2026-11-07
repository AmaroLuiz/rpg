// Fluxo do M5 num navegador: rolagens no servidor (da ficha, livre, secreta), histórico e aviso ao vivo,
// biblioteca de monstros, combate com cópias numeradas, iniciativa, turnos, PV secreto e estado público.
// Requer: Supabase local com Edge Functions (pnpm db:start) e o app rodando (pnpm dev).
// Uso: node apps/web/e2e/mesa-jogo.e2e.cjs   (opcionais: E2E_BASE, E2E_OUT para as capturas)
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
async function setNumber(page, label, value) {
  const box = page.getByRole('textbox', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
}
const saved = (p) => p.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 10000 });
async function rollInDialog(page, visibilityLabel) {
  const dlg = page.getByRole('dialog');
  if (visibilityLabel) await dlg.getByRole('radio', { name: visibilityLabel }).click();
  await dlg.getByRole('button', { name: 'Rolar', exact: true }).click();
  await dlg.getByRole('status').waitFor({ timeout: 15000 });
  const total = Number((await dlg.getByRole('status').locator('span').first().textContent()).replace('−', '-'));
  await dlg.getByRole('button', { name: 'Fechar' }).click();
  return total;
}

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

  // Mesa, jogador e ficha da Elena (Combatente, FOR 3, Luta treinada).
  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('link', { name: 'Criar mesa' }).click();
  await gm.getByLabel('Nome da mesa').fill('Noite de jogo');
  await gm.getByRole('button', { name: 'Criar e virar mestre' }).click();
  const code = (await gm.getByLabel('Código de convite').textContent()).trim();
  const tableUrl = gm.url();
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${code}`);
  await pl.getByRole('heading', { name: 'Noite de jogo' }).waitFor({ timeout: 15000 });
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await pl.getByRole('button', { name: 'Pular para a ficha (modo livre)' }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  for (const [l, v] of [['Agilidade', 2], ['Força', 3], ['Vigor', 2]]) await setNumber(pl, l, v);
  await pl.getByRole('tab', { name: 'Perícias' }).click();
  await pl.getByRole('combobox', { name: 'Luta: Grau' }).selectOption({ label: 'Treinado' });
  await saved(pl);
  const sheetUrl = pl.url();
  ok('ficha da Elena pronta');

  // 1. Rolagem da ficha: Luta (3d20, fica com o maior, +5), feita no servidor.
  await gm.goto(tableUrl);
  await gm.getByRole('heading', { name: 'Noite de jogo' }).waitFor();
  await pl.getByRole('button', { name: 'Rolar Luta' }).click();
  const luta = await rollInDialog(pl);
  if (luta < 6 || luta > 25) throw new Error('Luta fora de 6..25: ' + luta);
  await gm.getByRole('status').filter({ hasText: `João rolou Elena: Luta: ${luta}` }).waitFor({ timeout: 10000 });
  await gm.getByRole('list', { name: 'Histórico da mesa' }).getByText('Elena: Luta').waitFor();
  ok(`Luta rolada no servidor (${luta}); mestre recebeu aviso e histórico ao vivo`);
  await pl.screenshot({ path: `${OUT}/m5-01-pericias-rolar.png` });

  // 2. Rolagem secreta do mestre não chega ao jogador; "só o mestre" do jogador chega ao mestre.
  await gm.goto(tableUrl + '/rolagens');
  await gm.getByLabel('Dados').fill('1d20+2');
  await gm.getByLabel('Motivo (opcional)').fill('Percepção do vilão');
  await gm.getByRole('button', { name: 'Rolar', exact: true }).click();
  await rollInDialog(gm, 'Secreta (só eu)');
  await pl.goto(tableUrl + '/rolagens');
  await pl.getByRole('button', { name: 'd6', exact: true }).click();
  await rollInDialog(pl, 'Só o mestre');
  await gm.getByRole('list', { name: 'Histórico da mesa' }).getByText('1d6').first().waitFor({ timeout: 10000 });
  await pl.reload();
  await pl.getByRole('list', { name: 'Histórico da mesa' }).waitFor();
  if (await pl.getByText('Percepção do vilão').count()) throw new Error('jogador viu a rolagem secreta');
  await gm.getByText('Percepção do vilão').waitFor();
  ok('secreta do mestre invisível ao jogador; "só o mestre" do jogador visível ao mestre');

  // 3. Biblioteca: Zumbi de Sangue (Combatente, NEX 5% → PV 21).
  await gm.goto(tableUrl);
  await gm.getByRole('button', { name: 'Novo', exact: true }).click();
  await gm.getByLabel('Nome do NPC ou monstro').fill('Zumbi de Sangue');
  await gm.getByRole('button', { name: 'Criar ficha', exact: true }).click();
  await gm.getByRole('heading', { name: 'Zumbi de Sangue' }).waitFor();
  await gm.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await saved(gm);
  await gm.goto(tableUrl);
  await pl.goto(tableUrl);
  await pl.getByRole('heading', { name: 'Noite de jogo' }).waitFor();
  if (await pl.getByText('Zumbi de Sangue').count()) throw new Error('jogador vê a biblioteca');
  ok('monstro criado na biblioteca, invisível ao jogador');

  // 4. Combate: Elena + 3 zumbis, iniciativa rolada, ordenada.
  await gm.getByRole('link', { name: /Combate/ }).click();
  await gm.getByLabel('Nome do combate').fill('Galpão');
  await gm.getByRole('button', { name: 'Começar a montar o combate' }).click();
  await gm.getByRole('heading', { name: 'Galpão' }).waitFor();
  await gm.getByRole('listitem').filter({ hasText: 'Elena' }).getByRole('button', { name: 'Adicionar' }).click();
  await gm.getByRole('button', { name: 'Mais Zumbi de Sangue' }).click();
  await gm.getByRole('button', { name: 'Mais Zumbi de Sangue' }).click();
  await gm.getByRole('listitem').filter({ hasText: 'Zumbi de Sangue' }).filter({ has: gm.getByRole('button', { name: 'Adicionar' }) }).getByRole('button', { name: 'Adicionar' }).click();
  const order = gm.getByRole('list', { name: 'Ordem de iniciativa' });
  for (const n of ['Elena', 'Zumbi de Sangue 1', 'Zumbi de Sangue 2', 'Zumbi de Sangue 3']) await order.getByText(n, { exact: true }).waitFor({ timeout: 20000 });
  ok('combate com Elena e Zumbi de Sangue 1, 2, 3');
  await gm.getByRole('button', { name: 'Rolar iniciativa' }).click();
  await gm.waitForFunction(() => [...document.querySelectorAll('input[aria-label^="Iniciativa de"]')].every((i) => i.value !== ''), null, { timeout: 20000 });
  const inits = await gm.$$eval('input[aria-label^="Iniciativa de"]', (els) => els.map((e) => Number(e.value)));
  if (inits.some((v, i) => i > 0 && v > inits[i - 1])) throw new Error('ordem errada: ' + inits.join(','));
  ok('iniciativas roladas no servidor e ordenadas: ' + inits.join(', '));

  // 5. Começar: os dois veem a mesma vez; inimigos só com estado.
  await gm.getByRole('button', { name: 'Começar combate' }).click();
  const firstName = (await order.locator('li[aria-current="true"] p').first().textContent()).trim();
  await pl.goto(tableUrl + '/combate');
  await pl.getByRole('status').filter({ hasText: `Rodada 1 · vez de ${firstName}` }).waitFor({ timeout: 10000 });
  const plOrder = pl.getByRole('list', { name: 'Ordem de iniciativa' });
  if ((await plOrder.getByText('Ileso').count()) !== 3) throw new Error('jogador não vê 3 inimigos ilesos');
  if (await plOrder.getByText('21/21').count()) throw new Error('jogador viu PV de inimigo');
  ok(`rodada 1, vez de ${firstName} para os dois; jogador vê "Ileso", não o número`);

  // 6. Mestre fere o Zumbi 1 até 10/21 → "Muito ferido" para o jogador.
  for (let i = 0; i < 11; i++) await gm.getByRole('button', { name: 'Diminuir PV Zumbi de Sangue 1' }).click();
  await gm.getByLabel('PV Zumbi de Sangue 1: 10 / 21').waitFor({ timeout: 10000 });
  await plOrder.getByRole('listitem').filter({ hasText: 'Zumbi de Sangue 1' }).getByText('Muito ferido').waitFor({ timeout: 10000 });
  ok('PV secreto 10/21: jogador vê "Muito ferido"');

  // 7. Esconder o Zumbi 3; avançar o turno.
  await gm.getByRole('button', { name: 'Esconder Zumbi de Sangue 3 dos jogadores' }).click();
  await plOrder.getByText('Zumbi de Sangue 3').waitFor({ state: 'detached', timeout: 10000 });
  const before = (await order.locator('li[aria-current="true"] p').first().textContent()).trim();
  await gm.getByRole('button', { name: 'Próximo' }).click();
  await gm.waitForFunction(
    (b) => document.querySelector('[aria-label="Ordem de iniciativa"] li[aria-current="true"] p')?.textContent?.trim() !== b,
    before,
    { timeout: 10000 },
  );
  const second = (await order.locator('li[aria-current="true"] p').first().textContent()).trim();
  if (second === 'Zumbi de Sangue 3') {
    // Vez de um escondido: o jogador não vê ninguém destacado.
    await pl.waitForFunction(() => !document.querySelector('[aria-label="Ordem de iniciativa"] li[aria-current="true"]'), null, { timeout: 10000 });
  } else {
    await pl.getByRole('status').filter({ hasText: `vez de ${second}` }).waitFor({ timeout: 10000 });
  }
  ok(`Zumbi 3 escondido do jogador; turno passou de ${before} para ${second}, igual nas duas telas`);

  // 8. Mestre tira 1 PV da Elena no combate; a ficha do jogador acompanha.
  await gm.getByRole('button', { name: 'Diminuir Pontos de Vida Elena' }).click();
  await pl.goto(sheetUrl);
  await pl.waitForFunction(() => document.querySelector('[role="meter"][aria-label="Pontos de Vida"]')?.getAttribute('aria-valuenow') === '21', null, { timeout: 10000 });
  ok('dano aplicado no combate chegou à ficha da Elena (21/22)');
  await gm.screenshot({ path: `${OUT}/m5-02-combate-mestre.png`, fullPage: true });
  await pl.goto(tableUrl + '/combate');
  await pl.getByRole('list', { name: 'Ordem de iniciativa' }).waitFor();
  await pl.getByLabel('Pontos de Vida Elena: 21 / 22').waitFor({ timeout: 10000 });
  ok('jogador vê e controla o próprio PV na lista do combate');
  await pl.screenshot({ path: `${OUT}/m5-03-combate-jogador.png`, fullPage: true });

  // 9. Encerrar.
  await gm.getByRole('button', { name: 'Encerrar combate' }).click();
  await gm.getByRole('button', { name: 'Começar a montar o combate' }).waitFor();
  await pl.getByText('Nenhum combate em andamento.').waitFor({ timeout: 10000 });
  ok('combate encerrado para os dois');

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});
