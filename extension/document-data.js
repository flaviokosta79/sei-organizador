// Pure readers for the SEI pages behind the document badge; no network or DOM side effects.
globalThis.seiDocumentData = (() => {
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  // The SEI writes the same sigla with º or ° depending on the page.
  const sigla = (text) => clean(text).replace(/º/g, '°').toUpperCase();
  // SEI captions may include the visible range: "(129 registros - 1 a 100)".
  function recordCount(table) {
    const match = clean(table?.querySelector('caption')?.textContent).match(/\(\s*([\d.]+)\s+registros?\b/i);
    const value = match ? Number(match[1].replaceAll('.', '')) : null;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  function parseDate(text) {
    const m = clean(text).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,? (?:às )?(\d{2}):(\d{2}))?/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)) : null;
  }
  // Reads the literal arguments of `new <name>(...)` calls in the tree script without evaluating it.
  function calls(source, name) {
    const result = [],
      marker = `new ${name}(`;
    for (let start = source.indexOf(marker); start >= 0; start = source.indexOf(marker, start + 1)) {
      const args = [];
      let i = start + marker.length,
        ok = true;
      while (ok && i < source.length) {
        while (/\s/.test(source[i])) i++;
        const c = source[i];
        if (c === ')') break;
        if (c === '"' || c === "'") {
          let value = '';
          for (i++; i < source.length && source[i] !== c; i++) {
            if (source[i] !== '\\') {
              value += source[i];
              continue;
            }
            const e = source[++i];
            if (e === 'u') {
              value += String.fromCharCode(parseInt(source.slice(i + 1, i + 5), 16));
              i += 4;
            } else value += { n: '\n', r: '\r', t: '\t' }[e] ?? e;
          }
          args.push(value);
          i++;
        } else {
          const token = source.slice(i).match(/^[\w.-]+/)?.[0];
          if (!token) ok = false;
          else {
            args.push({ null: null, true: true, false: false }[token] ?? token);
            i += token.length;
          }
        }
        while (/\s/.test(source[i])) i++;
        if (source[i] === ',') i++;
        else if (source[i] !== ')') ok = false;
      }
      if (ok) result.push(args);
    }
    return result;
  }
  function parseTree(source) {
    const nodes = calls(source, 'infraArvoreNo').map((a) => ({
      type: a[0],
      id: a[1],
      parent: a[2],
      url: a[3],
      target: a[4],
      title: a[5],
      description: a[6],
      icon: a[7],
      protocol: a[15],
    }));
    const actions = calls(source, 'infraArvoreAcao').map((a) => ({
      type: a[0],
      target: a[2],
      title: a[5],
      sigla: a[8],
    }));
    const process = nodes.find((n) => n.type === 'PROCESSO');
    return {
      process: process ? { id: process.id, number: process.title, type: process.description || '' } : null,
      document(id) {
        const node = nodes.find((n) => n.type === 'DOCUMENTO' && n.id === id);
        if (!node) return null;
        const signature = actions.find((a) => a.type === 'ASSINATURA' && a.target === id);
        // Tooltip lines after "Assinado por:" repeat name, role and unit for each signer.
        const lines = signature ? signature.title.split('\n').slice(1).filter(Boolean) : [];
        const signers = [];
        for (let i = 0; i < lines.length; i += 3)
          signers.push(lines[i + 1] ? `${lines[i]} (${lines[i + 1]})` : lines[i]);
        return {
          id,
          protocol: node.protocol,
          title: node.title,
          url: node.url,
          target: node.target,
          unit: actions.find((a) => a.type === 'UNIDADE_GERADORA' && a.target === id)?.sigla || null,
          signers,
        };
      },
      // Internal documents of the unit without any signature; external documents never carry one.
      pending(unit) {
        return nodes
          .filter(
            (n) =>
              n.type === 'DOCUMENTO' &&
              /documento_interno/.test(n.icon || '') &&
              sigla(actions.find((a) => a.type === 'UNIDADE_GERADORA' && a.target === n.id)?.sigla) === sigla(unit) &&
              !actions.some((a) => a.type === 'ASSINATURA' && a.target === n.id),
          )
          .map((n) => ({ id: n.id, protocol: n.protocol, title: n.title }));
      },
    };
  }
  // Waits for the process tree frame (it may load after the frame asking for it) and reads it.
  async function loadTree(top) {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 250));
      let treeDocument;
      try {
        treeDocument = top.getElementById('ifrArvore')?.contentDocument;
      } catch {
        return null;
      }
      const anchor = treeDocument?.querySelector('a[onclick*="procedimento_consultar_historico"]');
      const historyLink = anchor?.getAttribute('onclick').match(/'([^']*procedimento_consultar_historico[^']*)'/)?.[1];
      if (!historyLink) continue;
      const tree = parseTree(
        Array.from(treeDocument.scripts)
          .map((s) => s.textContent)
          .join('\n'),
      );
      return tree.process ? { treeDocument, tree, historyLink } : null;
    }
    return null;
  }
  // Same identity rules as the block list: configured unit and organization, from the top SEI frame.
  function seiContext(win, url, config) {
    if (url.searchParams.get('infra_unidade_atual') !== config?.unitId || win === win.top) return null;
    let top;
    try {
      top = win.top.document;
    } catch {
      return null;
    }
    const match = (top.querySelector('a#lnkUsuarioSistema')?.title || '').match(/^(.+)\s+\(([^/()]+)\/([^()]+)\)$/);
    const unit = top.querySelector('#lnkInfraUnidade')?.textContent.trim();
    if (!match || match[3] !== config.org || !unit) return null;
    return { top, unit, actor: { name: match[1].trim(), login: match[2], org: match[3] } };
  }
  function parseSignatures(text) {
    const result = [],
      pattern =
        /Documento assinado eletronicamente por (.+?), (.+?), em (\d{2}\/\d{2}\/\d{4}), às (\d{2}:\d{2}), conforme horário oficial/g;
    for (const m of clean(text).matchAll(pattern))
      result.push({ name: m[1], role: m[2], time: parseDate(`${m[3]} ${m[4]}`) });
    return result;
  }
  function parseHistory(doc) {
    if (!doc.querySelector('#tblHistorico'))
      throw new Error('Andamento não reconhecido. Verifique a sessão do SEI e recarregue a página.');
    const rows = [];
    for (const row of doc.querySelectorAll('#tblHistorico tr')) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) continue;
      const time = parseDate(cells[0].textContent);
      if (!time) continue;
      rows.push({
        time,
        unit: clean(cells[1].textContent),
        unitName: cells[1].querySelector('[title]')?.title || '',
        user: clean(cells[2].textContent),
        userName: cells[2].querySelector('[title]')?.title || '',
        text: clean(cells[3].textContent),
        open: row.classList.contains('andamentoAberto'),
      });
    }
    const toggle = doc.querySelector('#ancTipoHistorico');
    const total = recordCount(doc.querySelector('#tblHistorico'));
    return {
      rows,
      complete: !/completo/i.test(toggle?.textContent || ''),
      completeValue: /completo/i.test(toggle?.textContent || '')
        ? toggle.getAttribute('onclick')?.match(/verHistorico\('(\w+)'\)/)?.[1] || null
        : null,
      partial: total === null || total > rows.length,
    };
  }
  const byTime = (rows) => [...rows].sort((a, b) => b.time - a.time);
  // The native table can group open-unit rows ahead of more recent closed-unit events.
  function summarize(rows, protocol, unit) {
    rows = byTime(rows);
    const own = sigla(unit),
      escaped = String(protocol).replace(/\D/g, '');
    const mentions = new RegExp(escaped ? `\\b${escaped}\\b` : '(?!)');
    const generated = rows.find(
      (r) => /^(Gerado documento|Registro de documento externo)/.test(r.text) && mentions.test(r.text),
    );
    const signed = rows
      .filter((r) => /^Assinado Documento/.test(r.text) && mentions.test(r.text))
      .map((r) => ({ time: r.time, user: r.user, name: r.userName, unit: r.unit }));
    const sent = (r) => {
      const m = r.text.match(/^Processo remetido pela unidade (.+)$/);
      return m && sigla(m[1]) === own;
    };
    const first = rows.findIndex(sent);
    let lastSend = null;
    if (first >= 0) {
      const head = rows[first],
        destinations = [];
      for (const r of rows.slice(first))
        if (sent(r) && r.user === head.user && r.time.getTime() === head.time.getTime())
          destinations.push({ unit: r.unit, name: r.unitName });
      lastSend = {
        time: head.time,
        user: head.user,
        name: head.userName,
        destinations,
        afterDocument: !generated || head.time >= generated.time,
      };
    }
    const incoming = rows.find((r) => {
      const source = r.text.match(/^Processo remetido pela unidade (.+)$/);
      return sigla(r.unit) === own && source && sigla(source[1]) !== own;
    });
    const received = rows.find((r) => sigla(r.unit) === own && /^Processo recebido na unidade\b/.test(r.text));
    // A remessa registra quem enviou; o recebimento registra quem recebeu.
    // Uma remessa posterior ao último recebimento inicia uma nova entrada.
    const receipt = received && (!incoming || received.time >= incoming.time) ? received : null;
    const lastArrival =
      incoming || receipt
        ? {
            sentAt: incoming?.time || null,
            receivedAt: receipt?.time || null,
            origin: incoming?.text.match(/^Processo remetido pela unidade (.+)$/)[1] || null,
            user: incoming?.user || '',
            name: incoming?.userName || '',
          }
        : null;
    const open = [];
    for (const r of rows)
      if (r.open && !open.some((o) => sigla(o.unit) === sigla(r.unit)))
        open.push({ unit: r.unit, name: r.unitName, since: r.time, own: sigla(r.unit) === own });
    const blocks = { document: new Map(), process: new Map() };
    for (const r of rows.slice().reverse()) {
      if (sigla(r.unit) !== own) continue;
      const m = r.text.match(/^(Documento (\d+)\b.*?|Processo) (inserido no|retirado do) bloco (\d+)/);
      if (!m || (m[2] && m[2] !== escaped)) continue;
      const target = m[2] ? blocks.document : blocks.process;
      if (m[3] === 'inserido no') target.set(m[4], { id: m[4], since: r.time, user: r.user, name: r.userName });
      else target.delete(m[4]);
    }
    return {
      generatedUnit: generated?.unit || null,
      generatedAt: generated?.time || null,
      signed,
      lastSend,
      lastArrival,
      open,
      documentBlocks: [...blocks.document.values()],
      processBlocks: [...blocks.process.values()],
    };
  }
  function parseBlockList(doc) {
    const table = doc.querySelector('#tblBlocos');
    if (!table) return null;
    const header = Array.from(table.rows).find((r) => r.querySelector('th'));
    const names = header ? Array.from(header.cells).map((c) => clean(c.textContent)) : [];
    const blocks = new Map();
    for (const row of table.rows) {
      if (row === header) continue;
      const link = row.querySelector('a[href*="id_bloco="]');
      const id = link?.getAttribute('href').match(/[?&]id_bloco=(\d+)/)?.[1];
      if (!id) continue;
      const cell = (name) => {
        const index = names.indexOf(name);
        return index >= 0 && row.cells[index] ? clean(row.cells[index].textContent) : '';
      };
      blocks.set(id, {
        id,
        description: cell('Descrição'),
        state: cell('Estado'),
        available: cell('Disponibilização'),
      });
    }
    const total = recordCount(table);
    return { blocks, partial: total === null || total > blocks.size };
  }
  function age(since, now = new Date()) {
    const minutes = Math.max(0, Math.floor((now - since) / 60000));
    const days = Math.floor(minutes / 1440);
    const text =
      minutes < 60
        ? `${minutes} min`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} h`
          : `${days} ${days === 1 ? 'dia' : 'dias'}`;
    return { text, level: days >= 7 ? 'alert' : days >= 3 ? 'warn' : 'ok' };
  }
  const formatTime = (date) =>
    date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return {
    sigla,
    byTime,
    recordCount,
    parseDate,
    calls,
    parseTree,
    loadTree,
    seiContext,
    parseSignatures,
    parseHistory,
    summarize,
    parseBlockList,
    age,
    formatTime,
  };
})();
