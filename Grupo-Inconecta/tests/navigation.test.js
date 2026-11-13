import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAppRoute, buildAppHash } from '../public/assets/js/navigation.js';

const src = readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('atualizar a página mantém a seção selecionada no fragmento da URL', () => {
 for (const section of ['diretorio','aniversariantes','conexoes','dashboard','membros','pendencias','despesas','area','perfil','senha']) {
  const url = buildAppHash(section);
  assert.equal(parseAppRoute(url).view, section);
 }
});

test('atualizar a página preserva a aba selecionada em relatórios e configurações', () => {
 for (const tab of ['caixa','membros','conexoes']) {
  const hash = buildAppHash('relatorios', { reportTab:tab });
  assert.deepEqual(parseAppRoute(hash), {view:'relatorios', reportTab:tab, configTab:'financeiro'});
 }
 for (const tab of ['financeiro','ramos','categorias']) {
  const hash = buildAppHash('config', { configTab:tab });
  assert.deepEqual(parseAppRoute(hash), {view:'config', reportTab:'caixa', configTab:tab});
 }
});

test('rotas inválidas não permitem navegação para seções arbitrárias', () => {
 assert.deepEqual(parseAppRoute('#/pagina-inexistente'), { view:'', reportTab:'caixa', configTab:'financeiro' });
 assert.equal(buildAppHash('invalida'), '#/');
 assert.equal(parseAppRoute('#/relatorios/aba-inexistente').reportTab, 'caixa');
});

test('navegação é sincronizada com URL e histórico do navegador', () => {
 assert.match(src, /parseAppRoute\(window\.location\.hash\)/);
 assert.match(src, /history\.pushState/);
 assert.match(src, /history\.replaceState/);
 assert.match(src, /addEventListener\('popstate'/);
 assert.match(src, /addEventListener\('hashchange'/);
 assert.match(src, /if\(tab\.dataset\.group==='relatorios'\)/);
});

test('HTML força carregamento dos recursos da mesma versão do pacote', () => {
 assert.match(html, new RegExp(`style\\.css\\?v=${pkg.version.replaceAll('.','\\.')}`));
 assert.match(html, new RegExp(`app\\.js\\?v=${pkg.version.replaceAll('.','\\.')}`));
 assert.match(html, new RegExp(`name="application-version" content="${pkg.version.replaceAll('.','\\.')}"`));
});
