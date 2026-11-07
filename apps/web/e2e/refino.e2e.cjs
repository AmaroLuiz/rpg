// Fluxo do M7 num navegador: subir NEX (o PV atual acompanha o máximo), descanso, macros,
// exportar ficha e campanha em JSON, importar a ficha em outra mesa (e recusar sistema diferente).
// Requer: Supabase local (pnpm db:start) e o app rodando (pnpm dev).
// Uso: node apps/web/e2e/refino.e2e.cjs   (opcionais: E2E_BASE, E2E_OUT)
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
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
async function newTable(page, name, system) {
  await page.goto(BASE + '/mesas/nova');
  await page.getByLabel('Nome da mesa').fill(name);
  await page.getByLabel('Sistema').selectOption({ label: system });
  await page.getByRole('button', { name: 'Criar e virar mestre' }).click();
  await page.getByRole('heading', { name }).waitFor();
  return { code: (await page.getByLabel('Código de convite').textContent()).trim(), url: page.url() };
}
async function setNumber(page, label, value) {
  const box = page.getByRole('textbox', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
}
const saved = (p) => p.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 10000 });
const meter = (p) => p.getByRole('meter', { name: 'Pontos de Vida' }).first();
async function pv(p, atual, max) {
  await p.waitForFunction(
    ([a, m]) => {
      const el = document.querySelector('[role="meter"][aria-label="Pontos de Vida"]');
      return el?.getAttribute('aria-valuenow') === String(a) && el?.getAttribute('aria-valuemax') === String(m);
    },
    [atual, max],
    { timeout: 10000 },
  );
}
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  return { file, json: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

(async () => {
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, acceptDownloads: true };
  const gm = await (await browser.newContext(phone)).newPage();
  const pl = await (await browser.newContext(phone)).newPage();
  for (const p of [gm, pl]) {
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  }
  const ok = (msg) => console.log('OK  ', msg);

  await signUp(gm, 'Marina', `marina${stamp}@teste.dev`);
  await gm.getByRole('heading', { name: 'Suas mesas' }).waitFor();
  const t1 = await newTable(gm, 'Campanha longa', 'Ordem Paranormal');
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${t1.code}`);
  await pl.getByRole('heading', { name: 'Campanha longa' }).waitFor({ timeout: 15000 });
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await pl.getByRole('button', { name: 'Pular para a ficha (modo livre)' }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await setNumber(pl, 'NEX (%)', 15);
  await pv(pl, 31, 31);
  for (let i = 0; i < 5; i++) await pl.getByRole('button', { name: 'Diminuir Pontos de Vida' }).first().click();
  await pv(pl, 26, 31);
  await saved(pl);

  // 1. Subir NEX: mostra o que muda e o PV atual sobe junto com o máximo.
  await pl.getByText('Evolução, descanso e exportar').click();
  await pl.getByRole('button', { name: 'Subir NEX (20)' }).click();
  const dlg = pl.getByRole('dialog', { name: 'Subir NEX' });
  await dlg.getByText('15 → 20').waitFor();
  await dlg.getByText('31 → 36').waitFor();
  await dlg.getByRole('button', { name: 'Confirmar' }).click();
  await pv(pl, 31, 36);
  ok('Subir NEX 15 → 20: PV máximo 31 → 36 e o atual 26 → 31');

  // 2. Descanso: recuperação total enche o PV.
  await pl.getByRole('button', { name: 'Recuperação total' }).click();
  const rest = pl.getByRole('dialog', { name: 'Recuperação total' });
  await rest.getByText('31 → 36').waitFor();
  await rest.getByRole('button', { name: 'Confirmar' }).click();
  await pv(pl, 36, 36);
  ok('recuperação total: PV 31 → 36, mostrado antes de confirmar');

  // 3. Macros: valida a expressão contra a ficha; rola no servidor.
  await pl.getByRole('button', { name: 'Nova', exact: true }).click();
  await pl.getByLabel('Nome da rolagem').fill('Ataque furioso');
  await pl.getByLabel('Rolagem', { exact: true }).fill('1d20 + @naoexiste');
  await pl.getByRole('button', { name: 'Salvar' }).click();
  await pl.getByText('Campo desconhecido @naoexiste').waitFor();
  await pl.getByLabel('Rolagem', { exact: true }).fill('1d20 + @for + 2');
  await pl.getByRole('button', { name: 'Salvar' }).click();
  await pl.getByRole('button', { name: 'Rolar Ataque furioso' }).click();
  const rdlg = pl.getByRole('dialog', { name: 'Ataque furioso' });
  await rdlg.getByRole('button', { name: 'Rolar', exact: true }).click();
  await rdlg.getByRole('status').waitFor({ timeout: 15000 });
  const macroText = await rdlg.getByRole('status').innerText();
  if (!/1d20 \[\d+\] \+ 1 \+ 2/.test(macroText)) throw new Error('macro: ' + macroText);
  await rdlg.getByRole('button', { name: 'Fechar' }).click();
  ok('macro "Ataque furioso" recusa campo inexistente e rola 1d20 + FOR + 2 no servidor');
  await saved(pl);
  await pl.screenshot({ path: `${OUT}/m7-02-acoes.png` });

  // 4. Exportar a ficha.
  const ficha = await download(pl, () => pl.getByRole('button', { name: 'Exportar ficha (JSON)' }).click());
  if (ficha.json.format !== 'rpg-ficha' || ficha.json.character.name !== 'Elena' || ficha.json.character.data.values.nex !== 20) {
    throw new Error('ficha exportada errada: ' + JSON.stringify(ficha.json).slice(0, 300));
  }
  if (ficha.json.character.data.macros && Object.values(ficha.json.character.data.macros)[0].label !== 'Ataque furioso') throw new Error('macro não exportada');
  ok(`ficha exportada (${path.basename(ficha.file)}): Elena, NEX 20, com a macro`);

  // 5. Importar em outra mesa do mesmo sistema; recusar em outro sistema.
  const t2 = await newTable(gm, 'Nova campanha', 'Ordem Paranormal');
  await pl.goto(`${BASE}/convite/${t2.code}`);
  await pl.getByRole('heading', { name: 'Nova campanha' }).waitFor({ timeout: 15000 });
  await pl.getByLabel('Importar ficha de outra mesa').setInputFiles(ficha.file);
  await pl.getByRole('heading', { name: 'Elena' }).waitFor({ timeout: 15000 });
  if ((await pl.getByRole('textbox', { name: 'NEX (%)', exact: true }).inputValue()) !== '20') throw new Error('NEX não veio');
  await pv(pl, 36, 36);
  await pl.getByRole('button', { name: 'Rolar Ataque furioso' }).waitFor();
  ok('ficha importada na outra mesa: NEX 20, PV 36/36 e a macro');

  const t3 = await newTable(gm, 'Mesa de Tormenta', 'Tormenta20 (Jogo do Ano)');
  await pl.goto(`${BASE}/convite/${t3.code}`);
  await pl.getByRole('heading', { name: 'Mesa de Tormenta' }).waitFor({ timeout: 15000 });
  await pl.getByLabel('Importar ficha de outra mesa').setInputFiles(ficha.file);
  await pl.getByText(/A ficha é de outro sistema \(ordem_paranormal\)/).waitFor();
  ok('importar numa mesa de outro sistema é recusado com explicação');

  // 6. Exportar a campanha (mestre).
  await gm.goto(t1.url);
  await gm.getByRole('heading', { name: 'Campanha longa' }).waitFor();
  const mesa = await download(gm, () => gm.getByRole('button', { name: 'Exportar campanha (JSON)' }).click());
  const j = mesa.json;
  if (j.format !== 'rpg-mesa' || j.campaign.name !== 'Campanha longa' || j.characters.length !== 1 || !j.rolls.some((r) => r.label === 'Elena: Ataque furioso') || !j.templates.length) {
    throw new Error('campanha exportada errada: ' + JSON.stringify({ f: j.format, n: j.characters?.length, r: j.rolls?.map((r) => r.label) }));
  }
  ok(`campanha exportada (${path.basename(mesa.file)}): fichas, rolagens, templates, membros`);

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});
