// Painel da XM - Perdas Anjun, em qualquer tela da Anjun.
//
// Recebe a lista de pedidos AJ, consulta o rastreio de cada um (pagina.js, mesma chamada da
// janela "Consulta de rastreamentos") e diz quem estava com o pacote quando a entrega falhou
// (regras.js). Gera o relatorio por pedido e o resumo por culpado em CSV.
//
// O resultado fica guardado no Chrome deste computador: atualizar a aba nao perde nada, e
// Analisar de novo so consulta o que falta.

(() => {
  const R = globalThis.XMPerdasRegras;
  // Um lote de consultas sai junto; o proximo espera 1,5 s desde o inicio do anterior.
  // A Anjun barra quem vai rapido demais ("operacoes muito frequentes"): se barrar, escolher
  // um lote menor no painel.
  const INTERVALO_MS = 1500;
  const LOTES = [1, 10, 25, 50];
  const LOTE_PADRAO = 50;
  const PRAZO_MS = 30000;

  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .botao { position: fixed; right: 20px; bottom: 140px; z-index: 2147483646; padding: 10px 16px; color: #e8eaed;
        background: #16181d; border: 1px solid #3a3f4a; border-radius: 22px; box-shadow: 0 4px 14px rgba(0,0,0,.35);
        font: 700 13px system-ui, sans-serif; cursor: pointer; }
      .botao:hover { border-color: #6ea8fe; }
      .painel { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; width: 460px;
        max-height: calc(100vh - 40px); display: flex; flex-direction: column; color: #e8eaed; background: #16181d;
        border: 1px solid #3a3f4a; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,.45); font: 13px system-ui, sans-serif; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        border-bottom: 1px solid #3a3f4a; font-weight: 700; }
      .corpo { overflow: auto; padding: 4px 14px 14px; }
      label { display: flex; justify-content: space-between; align-items: baseline; margin: 12px 0 4px; color: #c9ced6; }
      select { padding: 6px 8px; color: #e8eaed; background: #0f1115; border: 1px solid #3a3f4a; border-radius: 4px; font: inherit; }
      textarea { width: 100%; height: 110px; padding: 7px 8px; color: #e8eaed; background: #0f1115; border: 1px solid #3a3f4a;
        border-radius: 4px; resize: vertical; font: 13px ui-monospace, Consolas, monospace; }
      button.link { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      button.link:hover:not(:disabled) { text-decoration: underline; }
      button.link:disabled { color: #6b7280; cursor: default; }
      .acoes { display: flex; gap: 18px; margin-top: 12px; }
      .suave { margin: 4px 0 0; color: #a8adb7; line-height: 1.4; }
      .erro { color: #f87171; }
      #status { margin: 12px 0 0; min-height: 18px; line-height: 1.4; }
      h3 { margin: 16px 0 4px; font-size: 13px; color: #c9ced6; }
      table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      td { padding: 4px 0; border-top: 1px solid #262a33; vertical-align: top; }
      td.qtd { width: 48px; text-align: right; font-weight: 700; }
      td.tipo { width: 110px; color: #a8adb7; }
      ol { margin: 0; padding: 0; list-style: none; }
      #lista li { padding: 6px 0; border-top: 1px solid #262a33; }
      #lista .linha { display: flex; justify-content: space-between; gap: 10px; }
      #lista .cod { font-family: ui-monospace, Consolas, monospace; }
      #lista .quem { font-weight: 700; text-align: right; }
      #lista .detalhe { display: block; margin-top: 2px; color: #a8adb7; font-size: 12px; line-height: 1.35; }
      .pendente, .rodando { color: #fbbf24; }
      #conta { margin-top: 12px; padding: 10px 0 0; border-top: 1px solid #262a33; }
      #login { display: block; width: 100%; height: 96px; margin-top: 6px; border: 0; }
    </style>
    <button class="botao" type="button">XM Perdas</button>
    <div class="painel" hidden>
      <div class="cabecalho"><span>XM - Perdas Anjun</span><button class="link" id="minimizar" type="button">Minimizar</button></div>
      <div class="corpo">
        <label for="codigos">Pedidos AJ</label>
        <textarea id="codigos" spellcheck="false" placeholder="Cole os pedidos, um por linha"></textarea>
        <p class="suave" id="contagem"></p>
        <label for="lote">Consultar de quantos em quantos</label>
        <select id="lote">${LOTES.map((n) => `<option value="${n}">${n === 1 ? '1 por vez' : `${n} de uma vez`}</option>`).join('')}</select>
        <p class="suave">Se a Anjun disser "operações muito frequentes", espere e escolha um número menor.</p>
        <p class="suave">Culpado: quem estava com o pacote antes do "A entrega falhou". Saiu para entrega com alguém: o entregador. Foi recebido no ponto e o próximo passo já é a falha: a base.</p>

        <div id="conta">
          <p class="suave" id="contaTexto">Conferindo a conta do sistema...</p>
          <iframe id="login" title="Entrar no sistema" hidden></iframe>
        </div>

        <div class="acoes">
          <button class="link" id="analisar" type="button" disabled>Analisar</button>
          <button class="link" id="parar" type="button" disabled>Parar</button>
          <button class="link" id="limpar" type="button" disabled>Limpar resultado</button>
        </div>
        <p id="status"></p>

        <div id="blocoResumo" hidden>
          <h3>Culpados</h3>
          <table><tbody id="resumo"></tbody></table>
          <div class="acoes">
            <button class="link" id="csv" type="button">Baixar relatório</button>
            <button class="link" id="csvResumo" type="button">Baixar resumo</button>
          </div>
        </div>

        <h3 id="tituloLista" hidden>Pedidos</h3>
        <ol id="lista"></ol>
      </div>
    </div>`;

  const $ = (id) => sombra.getElementById(id);
  const botao = sombra.querySelector('.botao');
  const painel = sombra.querySelector('.painel');

  let itens = []; // { codigo, situacao, erro, ...R.analisar() }
  let rodando = false;
  let parar = false;

  botao.addEventListener('click', () => { painel.hidden = false; botao.hidden = true; });
  $('minimizar').addEventListener('click', () => { painel.hidden = true; botao.hidden = false; });

  // ── espera que nao atrasa com a aba em segundo plano ─────────────────────────
  // O Chrome segura os timers de aba escondida (ate 1 por minuto); o de um Worker, nao.
  const relogio = (() => {
    try {
      const codigo = 'onmessage=(e)=>setTimeout(()=>postMessage(e.data.id),e.data.ms)';
      const w = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })));
      const espera = new Map();
      let n = 0;
      w.onmessage = (e) => { const f = espera.get(e.data); espera.delete(e.data); if (f) f(); };
      return (ms) => new Promise((r) => { n += 1; espera.set(n, r); w.postMessage({ id: n, ms }); });
    } catch (e) {
      return null;
    }
  })();
  function esperar(ms) {
    const simples = new Promise((r) => setTimeout(r, ms + 1000)); // se o Worker nao andar
    return relogio ? Promise.race([relogio(ms), simples]) : simples;
  }

  // ── conversa com o pagina.js ────────────────────────────────────────────────
  let proximoId = 0;
  function pedirRastreio(codigo) {
    return new Promise((resolve) => {
      proximoId += 1;
      const id = `${Date.now()}-${proximoId}`;
      const fim = (resposta) => {
        clearTimeout(prazo);
        window.removeEventListener('message', ouvir);
        resolve(resposta);
      };
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data.xmPerdas !== 'resposta' || e.data.id !== id) return;
        fim(e.data.resposta);
      };
      const prazo = setTimeout(() => fim({ ok: false, erro: 'A Anjun não respondeu a tempo.' }), PRAZO_MS);
      window.addEventListener('message', ouvir);
      window.postMessage({ xmPerdas: 'pedido', id, codigo }, window.location.origin);
    });
  }

  // ── guardar ─────────────────────────────────────────────────────────────────
  function guardar() {
    chrome.storage.local.set({ analise: itens }).catch(() => {});
  }
  function tamanhoDoLote() {
    const n = Number($('lote').value);
    return LOTES.includes(n) ? n : LOTE_PADRAO;
  }
  $('lote').value = String(LOTE_PADRAO);
  $('lote').addEventListener('change', () => {
    chrome.storage.local.set({ lote: tamanhoDoLote() }).catch(() => {});
    contar();
  });
  chrome.storage.local.get(['analise', 'lote']).then((s) => {
    if (LOTES.includes(s.lote)) { $('lote').value = String(s.lote); contar(); }
    if (!Array.isArray(s.analise) || itens.length) return;
    itens = s.analise.map((i) => {
      if (i.situacao === 'rodando') return { codigo: i.codigo, situacao: 'pendente' };
      // resultado de versao antiga ou unidade nova em UNIDADES: refaz a unidade da base
      const unidade = R.unidadeDaBase(i.base);
      return i.tipo === 'base' ? { ...i, unidade, responsavel: unidade } : { ...i, unidade };
    });
    if (!$('codigos').value) $('codigos').value = itens.map((i) => i.codigo).join('\n');
    desenhar();
    contar();
  }).catch(() => {}).then(atualizarConta).then((nome) => { if (nome && !rodando) completarResponsaveis(); });

  // ── conta do sistema (entregador responsavel) ───────────────────────────────
  // O login e um iframe da propria extensao (login.html): a senha e o token nao passam por
  // esta pagina. Aqui so chega o nome da conta e, depois, os nomes dos entregadores.
  let conectado = null;

  function pedirFundo(pedido) {
    try {
      return chrome.runtime.sendMessage(pedido).catch((e) => ({ ok: false, erro: e.message }));
    } catch (e) {
      // extensao recarregada com a aba aberta
      return Promise.resolve({ ok: false, erro: 'A extensão foi atualizada. Atualize a aba (F5).' });
    }
  }

  async function atualizarConta() {
    const r = await pedirFundo({ tipo: 'conta' });
    conectado = (r && r.ok && r.nome) || null;
    const texto = $('contaTexto');
    texto.textContent = '';
    if (conectado) {
      texto.append(`Entregador responsável pelo sistema XMTT. Conectado como ${conectado}. `);
      const sair = document.createElement('button');
      sair.className = 'link';
      sair.type = 'button';
      sair.textContent = 'Sair';
      sair.addEventListener('click', async () => { await pedirFundo({ tipo: 'sair' }); atualizarConta(); });
      texto.append(sair);
      $('login').hidden = true;
      $('login').removeAttribute('src');
    } else {
      texto.textContent = 'Entre no sistema XMTT para o relatório já sair com o entregador responsável de cada login.';
      if (!$('login').getAttribute('src')) $('login').src = chrome.runtime.getURL('login.html');
      $('login').hidden = false;
    }
    return conectado;
  }

  window.addEventListener('message', async (e) => {
    if (e.origin !== `chrome-extension://${chrome.runtime.id}` || !e.data || e.data.xmPerdas !== 'conta') return;
    if (await atualizarConta() && !rodando) completarResponsaveis();
  });

  // Pergunta ao sistema o entregador de cada login culpado (pelo dia em que saiu com o pacote).
  async function completarResponsaveis() {
    const pedidos = R.pedidosDeConversao(itens);
    if (!pedidos.length) return '';
    const r = await pedirFundo({ tipo: 'entregadores', logins: pedidos });
    let aviso = '';
    if (r && r.ok) {
      R.aplicarConversao(itens, r.entregadores);
    } else {
      R.aplicarConversao(itens, null);
      aviso = (r && r.erro) || 'Não deu para buscar o entregador responsável.';
      if (r && r.deslogado) await atualizarConta();
    }
    guardar();
    desenhar();
    return aviso;
  }

  // ── tela ────────────────────────────────────────────────────────────────────
  const feito = (i) => i.situacao !== 'pendente' && i.situacao !== 'rodando' && i.situacao !== 'erro';

  function contar() {
    const codigos = R.lerCodigos($('codigos').value);
    const ja = new Set(itens.filter(feito).map((i) => i.codigo));
    const faltam = codigos.filter((c) => !ja.has(c)).length;
    const partes = [];
    if (codigos.length) partes.push(`${codigos.length} pedido(s)`);
    if (codigos.length && faltam < codigos.length) partes.push(`${codigos.length - faltam} já analisado(s)`);
    if (faltam) partes.push(`${faltam} para consultar, ${R.tempoEstimado(faltam, tamanhoDoLote(), INTERVALO_MS)}`);
    $('contagem').textContent = partes.join(' · ');
    $('analisar').disabled = rodando || !faltam;
    $('limpar').disabled = rodando || !itens.length;
  }
  $('codigos').addEventListener('input', contar);

  function detalhe(i) {
    if (i.situacao === 'pendente' || i.situacao === 'rodando') return R.SITUACOES[i.situacao];
    const partes = [];
    if (i.responsavel) partes.push(`Culpado no rastreio: ${i.culpado}`);
    if (i.falha) partes.push(`Falhou em ${i.falha.data}${i.falha.motivo ? `: ${i.falha.motivo}` : ''}`);
    if (i.evidencia) partes.push(`antes disso: ${i.evidencia.data}, ${i.evidencia.texto}`);
    const obs = R.observacao(i);
    if (obs) partes.push(obs);
    return partes.join(' · ');
  }

  function desenhar() {
    const ol = $('lista');
    ol.textContent = '';
    for (const i of itens) {
      const li = document.createElement('li');
      const linha = document.createElement('div');
      linha.className = 'linha';
      const cod = document.createElement('span');
      cod.className = 'cod';
      cod.textContent = i.codigo;
      const quem = document.createElement('span');
      quem.className = `quem ${i.situacao === 'erro' ? 'erro' : i.situacao}`;
      const semCulpado = { erro: 'Erro', sem_rastreio: 'Sem rastreio', pendente: '', rodando: '' };
      quem.textContent = i.responsavel || i.culpado || (i.situacao in semCulpado ? semCulpado[i.situacao] : R.TIPOS.nao_identificado);
      linha.append(cod, quem);
      const det = document.createElement('span');
      det.className = 'detalhe';
      det.textContent = detalhe(i);
      li.append(linha, det);
      ol.append(li);
    }
    $('tituloLista').hidden = !itens.length;

    const tbody = $('resumo');
    tbody.textContent = '';
    const grupos = R.resumir(itens);
    for (const g of grupos) {
      const tr = document.createElement('tr');
      for (const [classe, texto] of [['', g.nome], ['tipo', R.TIPOS[g.tipo]], ['qtd', g.pedidos.length]]) {
        const td = document.createElement('td');
        if (classe) td.className = classe;
        td.textContent = texto;
        tr.append(td);
      }
      tbody.append(tr);
    }
    const semCulpado = itens.filter((i) => feito(i) && !i.culpado).length + itens.filter((i) => i.situacao === 'erro').length;
    if (semCulpado) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td class="tipo"></td><td class="qtd"></td>';
      tr.children[0].textContent = 'Sem culpado (ver observação)';
      tr.children[2].textContent = semCulpado;
      tbody.append(tr);
    }
    $('blocoResumo').hidden = !itens.some((i) => i.situacao !== 'pendente' && i.situacao !== 'rodando');
    $('csv').disabled = rodando;
    $('csvResumo').disabled = rodando || !grupos.length;
  }

  function mostrarStatus(texto, erro = false) {
    $('status').className = erro ? 'erro' : '';
    $('status').textContent = texto;
  }

  // ── rodar ───────────────────────────────────────────────────────────────────
  $('analisar').addEventListener('click', async () => {
    const codigos = R.lerCodigos($('codigos').value);
    const anteriores = new Map(itens.map((i) => [i.codigo, i]));
    itens = codigos.map((codigo) => {
      const a = anteriores.get(codigo);
      return a && feito(a) ? a : { codigo, situacao: 'pendente' };
    });
    rodando = true;
    parar = false;
    $('parar').disabled = false;
    $('codigos').disabled = true;
    contar();
    desenhar();

    let motivoParada = '';
    let ultimo = 0;
    const fila = itens.filter((i) => i.situacao === 'pendente');
    const lote = tamanhoDoLote();
    const lotes = R.dividirEmLotes(fila, lote);
    let feitos = 0;
    for (const [n, grupo] of lotes.entries()) {
      if (parar) break;
      const falta = INTERVALO_MS - (Date.now() - ultimo);
      if (falta > 0) await esperar(falta);
      if (parar) break;
      ultimo = Date.now();
      for (const item of grupo) item.situacao = 'rodando';
      desenhar();
      mostrarStatus(lote === 1
        ? `Consultando ${grupo[0].codigo} (${feitos + 1} de ${fila.length})...`
        : `Consultando o lote ${n + 1} de ${lotes.length} (pedidos ${feitos + 1} a ${feitos + grupo.length} de ${fila.length})...`);
      const respostas = await Promise.all(grupo.map((item) => pedirRastreio(item.codigo)));
      grupo.forEach((item, k) => {
        const r = respostas[k];
        if (r.ok) {
          Object.assign(item, R.analisar(r.eventos));
          delete item.erro;
          return;
        }
        let motivo = '';
        if (r.frequente) motivo = `A Anjun pediu para ir mais devagar. Espere uns 30 minutos, escolha um número menor em "de quantos em quantos" e clique em Analisar: continua de onde parou.`;
        else if (r.semToken) motivo = r.erro;
        else if (r.sessao) motivo = 'A sessão da Anjun caiu. Entre de novo e clique em Analisar: continua de onde parou.';
        if (motivo) {
          // nao e problema do pedido: volta para a fila
          motivoParada = motivoParada || motivo;
          Object.assign(item, { situacao: 'pendente', culpado: '' });
          delete item.tipo;
          delete item.erro;
          parar = true;
        } else {
          Object.assign(item, { situacao: 'erro', tipo: 'erro', culpado: '', responsavel: '', erro: r.erro });
        }
      });
      feitos += grupo.length;
      guardar();
      desenhar();
    }

    rodando = false;
    $('parar').disabled = true;
    $('codigos').disabled = false;
    for (const i of itens) if (i.situacao === 'rodando') i.situacao = 'pendente';
    guardar();
    desenhar();
    contar();
    let avisoConta = '';
    if (R.pedidosDeConversao(itens).length) {
      mostrarStatus('Buscando o entregador responsável no sistema...');
      avisoConta = conectado
        ? await completarResponsaveis()
        : (R.aplicarConversao(itens, null), guardar(), desenhar(), 'Entre no sistema XMTT (abaixo) para trazer o entregador responsável.');
    }
    const comCulpado = itens.filter((i) => i.culpado).length;
    const erros = itens.filter((i) => i.situacao === 'erro').length;
    const faltam = itens.filter((i) => i.situacao === 'pendente').length;
    let fim = `${comCulpado} de ${itens.length} pedido(s) com culpado`;
    if (erros) fim += `, ${erros} com erro (Analisar tenta de novo)`;
    if (faltam) fim += `, ${faltam} na fila`;
    fim += '.';
    if (avisoConta) fim += ` ${avisoConta}`;
    mostrarStatus(motivoParada ? `${motivoParada} ${fim}` : fim, !!motivoParada || erros > 0 || !!avisoConta);
  });

  $('parar').addEventListener('click', () => {
    parar = true;
    $('parar').disabled = true;
    mostrarStatus('Vou parar quando o lote que está em andamento terminar.');
  });

  $('limpar').addEventListener('click', () => {
    if (!window.confirm('Apagar o resultado desta análise?')) return;
    itens = [];
    guardar();
    desenhar();
    contar();
    mostrarStatus('');
  });

  function baixar(prefixo, conteudo) {
    const agora = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    const nome = `${prefixo}-${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8' }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  $('csv').addEventListener('click', () => baixar('perdas-anjun', R.montarCsv(itens)));
  $('csvResumo').addEventListener('click', () => baixar('perdas-anjun-resumo', R.montarCsvResumo(itens)));

  window.addEventListener('beforeunload', (e) => {
    if (rodando) { e.preventDefault(); e.returnValue = ''; }
  });

  document.documentElement.append(hospedeiro);
  contar();
})();
