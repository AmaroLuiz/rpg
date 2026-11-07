// Fluxo do M6 num navegador: inventário com carga e bônus, biblioteca de itens, baú livre revelado ao vivo,
// item misterioso identificado pelo mestre, handout para um jogador só, diário com busca e etiqueta, nota privada.
// Requer: Supabase local (pnpm db:start) e o app rodando (pnpm dev).
// Uso: node apps/web/e2e/mestre.e2e.cjs   (opcionais: E2E_BASE, E2E_OUT para as capturas)
const { chromium } = require('playwright');
const OUT = process.env.E2E_OUT || require('node:os').tmpdir();
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const stamp = Date.now();
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
async function setNumber(page, label, value) {
  const box = page.getByRole('textbox', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
}
const saved = (p) => p.getByRole('status').filter({ hasText: 'Salvo' }).waitFor({ timeout: 10000 });
const defense = (p, v) => p.getByRole('button', { name: `Defesa: ${v}` }).waitFor({ timeout: 10000 });

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
  await gm.getByRole('link', { name: 'Criar mesa' }).click();
  await gm.getByLabel('Nome da mesa').fill('Mesa do mestre');
  await gm.getByRole('button', { name: 'Criar e virar mestre' }).click();
  const code = (await gm.getByLabel('Código de convite').textContent()).trim();
  const tableUrl = gm.url();
  await signUp(pl, 'João', `joao${stamp}@teste.dev`, `/convite/${code}`);
  await pl.getByRole('heading', { name: 'Mesa do mestre' }).waitFor({ timeout: 15000 });
  await pl.getByRole('button', { name: 'Novo personagem' }).click();
  await pl.getByLabel('Nome do personagem').fill('Elena');
  await pl.getByRole('button', { name: 'Criar ficha' }).click();
  await pl.getByRole('button', { name: 'Pular para a ficha (modo livre)' }).click();
  await pl.getByRole('heading', { name: 'Elena' }).waitFor();
  await pl.getByRole('combobox', { name: 'Classe' }).selectOption({ label: 'Combatente' });
  await setNumber(pl, 'Força', 3);
  await saved(pl);
  const sheetUrl = pl.url();
  await defense(pl, 11);

  // 1. Inventário: Proteção leve (2 espaços, +5 Defesa) equipada.
  await pl.getByRole('tab', { name: 'Inventário' }).click();
  await pl.getByRole('button', { name: 'Adicionar item' }).click();
  await pl.getByLabel('Nome', { exact: true }).fill('Proteção leve');
  await pl.getByRole('textbox', { name: 'Espaços', exact: true }).fill('2');
  await pl.getByRole('button', { name: 'Adicionar bônus' }).click();
  await pl.getByLabel('Valor do bônus').fill('5');
  await pl.getByLabel('Onde o bônus vale').selectOption({ label: 'Defesa' });
  await pl.getByRole('button', { name: 'Salvar' }).click();
  await pl.getByLabel('Carga 2 de 15').waitFor({ timeout: 10000 });
  await pl.getByRole('switch', { name: 'Equipar Proteção leve' }).click();
  await pl.getByRole('tab', { name: 'Personagem' }).click();
  await defense(pl, 16);
  ok('inventário: Proteção leve ocupa 2 de 15 e, equipada, leva a Defesa a 16');

  // 2. Biblioteca e baú: anel misterioso num baú "cada um pega", escondido até revelar.
  await gm.goto(tableUrl + '/itens');
  await gm.getByRole('button', { name: 'Novo item na biblioteca' }).click();
  await gm.getByLabel('Nome', { exact: true }).fill('Anel estranho');
  await gm.getByLabel('Item misterioso (jogadores veem outra coisa até o mestre identificar)').check();
  await gm.getByLabel('Nome verdadeiro').fill('Anel do Medo');
  const realBox = gm.locator('fieldset').filter({ hasText: 'Bônus verdadeiro' });
  await realBox.getByRole('button', { name: 'Adicionar bônus' }).click();
  await realBox.getByLabel('Valor do bônus').fill('-2');
  await realBox.getByLabel('Onde o bônus vale').selectOption({ label: 'Defesa' });
  await gm.getByRole('button', { name: 'Salvar' }).click();
  await gm.getByLabel('Nome do baú').fill('Cofre');
  await gm.getByRole('button', { name: 'Criar baú' }).click();
  await gm.getByRole('heading', { name: 'Cofre' }).waitFor();
  await gm.getByLabel('Como divide').selectOption({ label: 'Cada um pega' });
  const lib = gm.getByRole('list', { name: 'Biblioteca de itens' });
  await lib.getByRole('button', { name: /Anel estranho/ }).click();
  await lib.getByRole('button', { name: 'Pôr no baú' }).click();
  await gm.getByRole('list', { name: 'Cofre' }).getByText('Anel estranho').waitFor({ timeout: 10000 });
  await pl.goto(tableUrl + '/itens');
  await pl.getByText('Nenhum baú aberto para vocês ainda.').waitFor();
  await gm.getByRole('button', { name: 'Revelar' }).click();
  await pl.getByRole('list', { name: 'Cofre' }).getByText('Anel estranho').waitFor({ timeout: 10000 });
  ok('baú escondido até o mestre revelar; o jogador viu o "Anel estranho" aparecer ao vivo');

  await pl.getByRole('list', { name: 'Cofre' }).getByRole('button', { name: /Anel estranho/ }).click();
  await pl.getByRole('button', { name: 'Pegar para' }).click();
  await pl.getByText('Baú vazio.').waitFor({ timeout: 10000 });
  await pl.goto(sheetUrl);
  await pl.getByRole('tab', { name: 'Inventário' }).click();
  const inv = pl.getByRole('list', { name: 'Inventário' });
  await inv.getByText('Anel estranho').waitFor();
  await inv.getByText('não identificado').waitFor();
  await pl.getByRole('switch', { name: 'Equipar Anel estranho' }).click();
  await pl.getByRole('tab', { name: 'Personagem' }).click();
  await defense(pl, 16);
  ok('jogador pegou o anel; equipado e não identificado, não muda a Defesa');

  // 3. Mestre identifica pela ficha da Elena: vira Anel do Medo, −2 Defesa para o jogador.
  await gm.goto(sheetUrl);
  await gm.getByRole('tab', { name: 'Inventário' }).click();
  await gm.getByRole('list', { name: 'Inventário' }).getByRole('button', { name: /Anel estranho/ }).click();
  await gm.getByRole('button', { name: 'Identificar' }).click();
  await defense(pl, 14);
  await pl.getByRole('tab', { name: 'Inventário' }).click();
  await pl.getByRole('list', { name: 'Inventário' }).getByText('Anel do Medo').waitFor();
  ok('mestre identificou: jogador vê "Anel do Medo" e a Defesa cai para 14');

  // 4. Handout só para o João, com imagem e aviso.
  await gm.goto(tableUrl + '/handouts');
  await gm.getByRole('button', { name: 'Novo handout' }).click();
  await gm.getByLabel('Título').fill('Carta do culto');
  await gm.getByLabel('Texto').fill('Encontrem-nos à meia-noite.');
  await gm.getByLabel('Adicionar imagem').setInputFiles({ name: 'carta.png', mimeType: 'image/png', buffer: PNG });
  await gm.getByRole('button', { name: 'Salvar' }).click();
  await gm.getByRole('heading', { name: 'Carta do culto' }).waitFor();
  await pl.goto(tableUrl + '/handouts');
  await pl.getByText('O mestre ainda não revelou nada.').waitFor();
  await gm.getByRole('switch', { name: 'Revelar "Carta do culto" a João' }).click();
  await pl.getByRole('status').filter({ hasText: 'O mestre revelou: Carta do culto' }).waitFor({ timeout: 10000 });
  await pl.getByRole('heading', { name: 'Carta do culto' }).waitFor({ timeout: 10000 });
  await pl.getByRole('img', { name: 'Carta do culto' }).waitFor({ timeout: 10000 });
  ok('handout revelado só ao João: aviso, texto e imagem');
  await pl.screenshot({ path: `${OUT}/m6-01-handout.png`, fullPage: true });

  // 5. Diário: sessão pública com etiqueta; jogador acha pela busca e pela etiqueta.
  await gm.goto(tableUrl + '/diario');
  await gm.getByRole('button', { name: 'Registrar sessão' }).click();
  await gm.getByLabel('Título').fill('Sessão 1: a mansão');
  await gm.getByLabel('Texto').fill('Os agentes investigaram a mansão e acharam o símbolo.');
  await gm.getByLabel('Etiquetas').fill('Cultistas, mansão');
  await gm.getByRole('button', { name: 'Salvar' }).click();
  await gm.getByRole('heading', { name: 'Sessão 1: a mansão' }).waitFor();
  await pl.goto(tableUrl + '/diario');
  await pl.getByRole('heading', { name: 'Sessão 1: a mansão' }).waitFor({ timeout: 10000 });
  await pl.getByLabel('Buscar').fill('investigar');
  await pl.getByRole('heading', { name: 'Sessão 1: a mansão' }).waitFor();
  await pl.getByLabel('Buscar').fill('dragão');
  await pl.getByText('Nada encontrado.').waitFor();
  await pl.getByLabel('Buscar').fill('');
  await pl.getByRole('button', { name: '#cultistas' }).click();
  await pl.getByRole('heading', { name: 'Sessão 1: a mansão' }).waitFor();
  ok('diário: jogador lê a sessão; busca "investigar" acha "investigaram"; etiqueta filtra');
  await pl.screenshot({ path: `${OUT}/m6-02-diario.png`, fullPage: true });

  // 6. Nota privada do jogador não aparece para o mestre.
  await pl.goto(tableUrl + '/notas');
  await pl.getByRole('button', { name: 'Nova nota' }).click();
  await pl.getByLabel('Título').fill('Desconfio do padre');
  await pl.getByLabel('Tipo').selectOption({ label: 'NPC' });
  await pl.getByLabel('Quem vê').selectOption({ label: 'Só eu' });
  await pl.getByRole('button', { name: 'Salvar' }).click();
  await pl.getByRole('heading', { name: 'Desconfio do padre' }).waitFor();
  await gm.goto(tableUrl + '/notas');
  await gm.getByRole('heading', { name: 'Notas da campanha' }).waitFor();
  await gm.waitForTimeout(1000);
  if (await gm.getByText('Desconfio do padre').count()) throw new Error('mestre viu nota privada');
  ok('nota privada do jogador invisível ao mestre');

  await browser.close();
  console.log('TUDO OK');
})().catch((e) => {
  console.error('FALHOU:', e.message.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});
