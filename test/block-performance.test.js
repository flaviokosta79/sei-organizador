import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = (name) => readFileSync(new URL('../extension/' + name, import.meta.url), 'utf8');
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const row = (id, href = `?id_procedimento=${id}`) =>
  `<tr><td><input type="checkbox"></td><td>${id}</td><td><a href="${href}">SEI-1/${id}/2026</a></td><td>Tipo</td><td></td><td><a href="#">Ações</a></td></tr>`;
function fixture(sendMessage, rows = row('100') + row('200')) {
  const dom = new JSDOM(
    `<h1>Processos do Bloco Interno</h1><a id="lnkUsuarioSistema" title="Pessoa Teste (teste/SEPM)" href="?infra_unidade_atual=1"></a><form id="frmRelBlocoProtocoloLista"><div id="divInfraAreaPaginacaoSuperior"></div><table id="tblProtocolosBlocos"><tr><th></th><th>Seq.</th><th>Processo</th><th>Tipo</th><th>Anotações</th><th>Ações</th></tr>${rows}</table></form>`,
    { url: 'https://sei.rj.gov.br/sei/controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=2', runScripts: 'outside-only' },
  );
  const w = dom.window;
  Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
  let sync;
  const nativeInterval = w.setInterval.bind(w);
  w.setInterval = (callback, delay, ...args) => {
    if (delay === 10000) sync = callback;
    return nativeInterval(callback, delay, ...args);
  };
  w.chrome = { runtime: { sendMessage } };
  w.SEI_ORGANIZADOR_CONFIG = { serviceUrl: 'https://ext.5cpa.com.br', unitId: '1', org: 'SEPM' };
  for (const file of ['history.js', 'theme.js', 'content.js']) w.eval(read(file));
  return { w, d: w.document, sync: () => sync() };
}
const state = (version, extra = {}) => ({
  data: { version, tabs: [{ id: 'a', name: 'Assunto' }], assignments: { 100: ['a'] }, statuses: {}, ...extra },
});

test('linhas recebem as colunas só depois da primeira resposta e não são refeitas sem mudança', async () => {
  let answer;
  let next = new Promise((resolve) => (answer = resolve));
  const f = fixture(() => next);
  try {
    await wait();
    // The bar is there, the native table is untouched while the service has not answered.
    assert.ok(f.d.querySelector('#sei-organizador'));
    assert.match(f.d.querySelector('.so-summary').textContent, /^2 processos carregados/);
    assert.equal(f.d.querySelectorAll('[data-so-column],.so-copy-number,.so-status-marker,.so-floating-header').length, 0);
    answer(state(1));
    await wait();
    const first = f.d.querySelector('table').rows[1];
    const label = first.querySelector('.so-subject-label'),
      marker = first.querySelector('.so-status-marker');
    assert.equal(label.textContent, 'Assunto');
    assert.equal(f.d.querySelectorAll('th[data-so-column]').length, 2);
    assert.equal(f.d.querySelectorAll('.so-copy-number').length, 2);
    // The header floats in the next frame; wait for it instead of a fixed time.
    for (let i = 0; i < 50 && f.d.querySelectorAll('.so-floating-header').length !== 8; i++) await wait();
    assert.equal(f.d.querySelectorAll('.so-floating-header').length, 8);
    // A colleague changes only a status: the subject control of every row is kept, the marker is updated.
    next = Promise.resolve(state(2, { statuses: { 100: 'urgent' } }));
    f.sync();
    await wait();
    assert.equal(first.querySelector('.so-subject-label'), label);
    assert.equal(first.querySelector('.so-status-marker'), marker);
    assert.match(marker.textContent, /Urgente/);
    // Opening a subject tab removes the subject column; going back reuses the same cell and control.
    const tab = (name) => [...f.d.querySelectorAll('[role=tab]')].find((b) => b.textContent === name).click();
    tab('Assunto');
    assert.equal(f.d.querySelectorAll('[data-so-column=subject]').length, 0);
    assert.equal(f.d.querySelector('table').rows[2].hidden, true);
    tab('Geral');
    assert.equal(first.querySelector('.so-subject-label'), label);
    assert.deepEqual(
      [...first.cells].map((c) => c.dataset.soColumn || ''),
      ['', '', '', '', 'subject', 'status', '', ''],
    );
    // The subject changes: only then the control is redrawn.
    next = Promise.resolve(state(3, { assignments: {} }));
    f.sync();
    await wait();
    assert.equal(first.querySelector('.so-subject-label').textContent, 'Sem assunto');
  } finally {
    f.w.close();
  }
});

test('sem resposta do serviço em 400 ms, as linhas aparecem como não sincronizadas', async () => {
  const f = fixture(() => new Promise(() => {}));
  try {
    await wait(100);
    assert.equal(f.d.querySelectorAll('[data-so-column]').length, 0);
    await wait(400);
    const first = f.d.querySelector('table').rows[1];
    assert.equal(first.querySelector('[data-so-column=subject]').textContent, 'Não sincronizado');
    assert.match(first.querySelector('.so-status-marker').textContent, /indisponível/);
    assert.equal(first.querySelector('.so-status-marker').disabled, true);
  } finally {
    f.w.close();
  }
});

test('extensão recarregada com a página aberta pede para recarregar a página', async () => {
  const f = fixture(async () => {
    throw new Error('Extension context invalidated.');
  });
  try {
    await wait();
    const status = f.d.querySelector('#sei-organizador [role=status]:not(.so-viewing)');
    assert.match(status.textContent, /A extensão foi atualizada ou recarregada\. Recarregue esta página \(F5\)/);
    // The rows are still drawn once, as not synchronised.
    assert.equal(f.d.querySelectorAll('.so-status-marker').length, 2);
  } finally {
    f.w.close();
  }
});

test('sem resposta da extensão, a mensagem é clara em vez de um erro interno', async () => {
  const f = fixture(async () => undefined);
  try {
    await wait();
    assert.match(f.d.querySelector('#sei-organizador').textContent, /A extensão não respondeu/);
  } finally {
    f.w.close();
  }
});

test('identificador do processo é lido do endereço como antes', async () => {
  const rows =
    row('11', 'controlador.php?acao=procedimento_trabalhar&amp;id_procedimento=11&amp;infra_unidade_atual=1') +
    row('22', 'https://sei.rj.gov.br/sei/controlador.php?id_procedimento=22#topo') +
    row('33', '?xid_procedimento=33') +
    row('44', '?id_procedimento=abc');
  const f = fixture(async () => state(1, { assignments: { 11: ['a'], 22: ['a'] } }), rows);
  try {
    await wait();
    assert.match(f.d.querySelector('.so-summary').textContent, /^2 processos carregados nesta página · 2 com assunto/);
    assert.equal(f.d.querySelectorAll('.so-status-marker').length, 2);
  } finally {
    f.w.close();
  }
});
