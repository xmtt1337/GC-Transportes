// Painel da XM - Baixas Anjun, dentro da tela "Baixar Pacotes".
//
// Recebe um ou mais PDFs de etiquetas e a lista de codigos, acha em qualquer dos PDFs a
// pagina da etiqueta de cada AJ e da a baixa de um em um pela propria tela da Anjun
// (baixa.js). Os PDFs ficam so na memoria desta aba; CPF e "Assinar como" ficam guardados
// no Chrome deste computador.
//
// O pdf.js roda aqui mesmo, sem Worker: o pdf.worker.min.js entra antes como content script
// e o pdf.js usa o globalThis.pdfjsWorker dele.

(() => {
  const R = globalThis.XMBaixasRegras;
  const TELA = globalThis.XMBaixasTela;
  const ROTA = 'operatingCenter/signScan';
  const CPF_PADRAO = '000.000.000-00';
  const ERROS_SEGUIDOS = 3; // tres erros em seguida: algo maior (sessao caiu, tela mudou); para

  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .botao { position: fixed; right: 20px; bottom: 92px; z-index: 2147483646; padding: 10px 16px; color: #e8eaed;
        background: #16181d; border: 1px solid #3a3f4a; border-radius: 22px; box-shadow: 0 4px 14px rgba(0,0,0,.35);
        font: 700 13px system-ui, sans-serif; cursor: pointer; }
      .botao:hover { border-color: #6ea8fe; }
      .painel { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; width: 400px;
        max-height: calc(100vh - 40px); display: flex; flex-direction: column; color: #e8eaed; background: #16181d;
        border: 1px solid #3a3f4a; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,.45); font: 13px system-ui, sans-serif; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        border-bottom: 1px solid #3a3f4a; font-weight: 700; }
      .corpo { overflow: auto; padding: 4px 14px 14px; }
      label { display: flex; justify-content: space-between; align-items: baseline; margin: 12px 0 4px; color: #c9ced6; }
      input, textarea { width: 100%; padding: 7px 8px; color: #e8eaed; background: #0f1115; border: 1px solid #3a3f4a;
        border-radius: 4px; font: inherit; }
      input[type=file] { padding: 5px; }
      textarea { height: 110px; resize: vertical; font-family: ui-monospace, Consolas, monospace; }
      button.link { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      button.link:hover:not(:disabled) { text-decoration: underline; }
      button.link:disabled { color: #6b7280; cursor: default; }
      .acoes { display: flex; gap: 18px; margin-top: 14px; }
      .suave { margin: 4px 0 0; color: #a8adb7; line-height: 1.4; }
      .erro { color: #f87171; }
      #status { margin: 12px 0 0; min-height: 18px; line-height: 1.4; }
      .atual { display: flex; gap: 10px; align-items: flex-start; margin-top: 8px; }
      canvas { width: 90px; border: 1px solid #3a3f4a; border-radius: 4px; background: #fff; }
      ol { margin: 10px 0 0; padding: 0; list-style: none; }
      #arquivos { margin: 6px 0 0; padding: 0 0 0 16px; }
      #arquivos:empty { display: none; }
      #lista li { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-top: 1px solid #262a33;
        font-variant-numeric: tabular-nums; }
      #lista li .cod { font-family: ui-monospace, Consolas, monospace; }
      #lista li .sit { text-align: right; }
      #lista li .motivo { display: block; color: #a8adb7; font-size: 12px; }
      .ok { color: #4ade80; }
      .pendente, .rodando { color: #fbbf24; }
      .sem_etiqueta { color: #f87171; }
    </style>
    <button class="botao" type="button">XM Baixas</button>
    <div class="painel" hidden>
      <div class="cabecalho"><span>XM - Baixas Anjun</span><button class="link" id="minimizar" type="button">Minimizar</button></div>
      <div class="corpo">
        <label for="pdf">PDFs das etiquetas <button class="link" id="tirar" type="button" hidden>Tirar os PDFs</button></label>
        <input id="pdf" type="file" accept="application/pdf,.pdf" multiple>
        <p class="suave" id="info-pdf">Pode escolher mais de um, de uma vez ou um depois do outro. A etiqueta de cada código vai nas duas fotos obrigatórias.</p>
        <ul class="suave" id="arquivos"></ul>

        <label for="codigos">Códigos AJ <button class="link" id="todos" type="button" disabled>Usar todos dos PDFs</button></label>
        <textarea id="codigos" spellcheck="false" placeholder="Um código por linha"></textarea>
        <p class="suave" id="contagem"></p>

        <p class="suave">Recebido por: <b>Próprio</b>. O nome do recebedor vem da própria Anjun.</p>
        <label for="cpf">CPF na baixa</label>
        <input id="cpf" inputmode="numeric" maxlength="14">
        <label for="assinar">Assinar como</label>
        <input id="assinar" placeholder="Em branco: o nome da conta logada na Anjun">

        <div class="acoes">
          <button class="link" id="iniciar" type="button" disabled>Iniciar baixas</button>
          <button class="link" id="parar" type="button" disabled>Parar</button>
          <button class="link" id="csv" type="button" disabled>Baixar resultado</button>
        </div>
        <p id="status"></p>
        <div class="atual" hidden><canvas id="previa"></canvas><p class="suave" id="etapa"></p></div>
        <ol id="lista"></ol>
      </div>
    </div>`;

  const $ = (id) => sombra.getElementById(id);
  const botao = sombra.querySelector('.botao');
  const painel = sombra.querySelector('.painel');

  let pdfs = []; // { nome, tamanho, doc, paginas: [{ numero, texto }], codigos }
  let mapa = {}; // { AJ: { arquivo, numero } } procurando em todos os PDFs
  let itens = []; // { codigo, situacao, motivo, hora }
  let rodando = false;
  let parar = false;

  // ── mostrar so na tela de baixa ──────────────────────────────────────────────
  function naRota() { return location.hash.includes(ROTA); }
  function atualizarVisibilidade() {
    const aqui = naRota();
    botao.hidden = !aqui || !painel.hidden;
    if (!aqui && !rodando) painel.hidden = true;
  }
  botao.addEventListener('click', () => { painel.hidden = false; atualizarVisibilidade(); });
  $('minimizar').addEventListener('click', () => { painel.hidden = true; atualizarVisibilidade(); });
  window.addEventListener('hashchange', atualizarVisibilidade);

  // ── configuracao guardada ────────────────────────────────────────────────────
  chrome.storage.local.get(['cpf', 'assinarComo']).then((s) => {
    $('cpf').value = s.cpf || CPF_PADRAO;
    $('assinar').value = s.assinarComo || '';
    contar();
  }).catch(() => { $('cpf').value = CPF_PADRAO; contar(); });
  $('cpf').addEventListener('change', () => {
    const f = R.formatarCpf($('cpf').value);
    if (f) { $('cpf').value = f; chrome.storage.local.set({ cpf: f }); }
    contar();
  });
  $('assinar').addEventListener('change', () => chrome.storage.local.set({ assinarComo: $('assinar').value.trim() }));

  // ── PDF ──────────────────────────────────────────────────────────────────────
  async function lerPdf(arquivo) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false }).promise;
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const texto = await (await doc.getPage(n)).getTextContent();
      paginas.push({ numero: n, texto: texto.items.map((i) => i.str).join(' ') });
    }
    return { nome: arquivo.name, tamanho: arquivo.size, doc, paginas, codigos: Object.keys(R.localizarEtiquetas(paginas)).length };
  }

  function juntarPdfs() {
    mapa = R.localizarEtiquetas(pdfs.flatMap((p, arquivo) => p.paginas.map((pg) => ({ ...pg, arquivo }))));
    const ul = $('arquivos');
    ul.textContent = '';
    for (const p of pdfs) {
      const li = document.createElement('li');
      li.textContent = `${p.nome}: ${p.codigos} código(s) em ${p.paginas.length} página(s)`;
      ul.append(li);
    }
    $('tirar').hidden = !pdfs.length;
    $('todos').disabled = !Object.keys(mapa).length;
    contar();
  }

  $('pdf').addEventListener('change', async () => {
    const escolhidos = [...$('pdf').files];
    $('pdf').value = ''; // deixa escolher o mesmo arquivo de novo depois de tirar
    if (!escolhidos.length) return;
    $('info-pdf').className = 'suave';
    const falhas = [];
    for (const [n, arquivo] of escolhidos.entries()) {
      if (pdfs.some((p) => p.nome === arquivo.name && p.tamanho === arquivo.size)) continue; // ja esta na lista
      $('info-pdf').textContent = `Lendo ${arquivo.name} (${n + 1} de ${escolhidos.length})...`;
      try {
        pdfs.push(await lerPdf(arquivo));
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e.message}`);
      }
    }
    juntarPdfs();
    $('info-pdf').className = falhas.length ? 'suave erro' : 'suave';
    $('info-pdf').textContent = falhas.length
      ? `Não deu para ler: ${falhas.join(' | ')}`
      : `${pdfs.length} PDF(s), ${Object.keys(mapa).length} código(s) com etiqueta no total.`;
  });

  $('tirar').addEventListener('click', () => {
    pdfs = [];
    juntarPdfs();
    $('info-pdf').className = 'suave';
    $('info-pdf').textContent = 'PDFs tirados. Escolha de novo.';
  });

  $('todos').addEventListener('click', () => {
    $('codigos').value = Object.keys(mapa).join('\n');
    contar();
  });
  $('codigos').addEventListener('input', contar);

  async function imagemDaEtiqueta({ arquivo, numero }) {
    const p = await pdfs[arquivo].doc.getPage(numero);
    const vp = p.getViewport({ scale: 2.5 });
    const tela = document.createElement('canvas');
    tela.width = Math.ceil(vp.width);
    tela.height = Math.ceil(vp.height);
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tela.width, tela.height);
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    const previa = $('previa');
    previa.width = 180;
    previa.height = Math.round(180 * tela.height / tela.width);
    previa.getContext('2d').drawImage(tela, 0, 0, previa.width, previa.height);
    const blob = await new Promise((r) => tela.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('não deu para gerar a imagem da etiqueta');
    return blob;
  }

  // ── lista ────────────────────────────────────────────────────────────────────
  function contar() {
    const codigos = R.lerCodigos($('codigos').value);
    const comEtiqueta = codigos.filter((c) => c in mapa).length;
    const partes = [`${codigos.length} código(s)`];
    if (pdfs.length) partes.push(`${comEtiqueta} com etiqueta`, `${codigos.length - comEtiqueta} sem etiqueta nos PDFs`);
    $('contagem').textContent = codigos.length ? partes.join(' · ') : '';
    $('iniciar').disabled = rodando || !comEtiqueta || !R.formatarCpf($('cpf').value);
  }

  function desenharLista() {
    const ol = $('lista');
    ol.textContent = '';
    for (const i of itens) {
      const li = document.createElement('li');
      const cod = document.createElement('span');
      cod.className = 'cod';
      cod.textContent = i.codigo;
      const sit = document.createElement('span');
      sit.className = `sit ${i.situacao}`;
      sit.textContent = i.etapa && i.situacao === 'rodando' ? i.etapa : R.SITUACOES[i.situacao];
      if (i.motivo) {
        const m = document.createElement('span');
        m.className = 'motivo';
        m.textContent = i.motivo;
        sit.append(m);
      }
      li.append(cod, sit);
      ol.append(li);
    }
    const feitos = itens.filter((i) => i.situacao === 'ok').length;
    const erros = itens.filter((i) => i.situacao === 'erro' || i.situacao === 'sem_etiqueta').length;
    $('csv').disabled = !itens.length || rodando;
    return { feitos, erros };
  }

  function mostrarStatus(texto, erro = false) {
    $('status').className = erro ? 'erro' : '';
    $('status').textContent = texto;
  }

  // ── rodar ────────────────────────────────────────────────────────────────────
  $('iniciar').addEventListener('click', async () => {
    const problema = TELA.conferirInicio();
    if (problema) { mostrarStatus(problema, true); return; }
    const cpf = R.formatarCpf($('cpf').value);
    const assinarComo = $('assinar').value.trim();
    const codigos = R.lerCodigos($('codigos').value);
    const comEtiqueta = codigos.filter((c) => c in mapa);
    const ok = window.confirm(`Dar baixa em ${comEtiqueta.length} pacote(s), um por vez?\n\n`
      + `Recebido por: Próprio (nome do recebedor da Anjun)\nCPF: ${cpf}\n`
      + `Assinatura: ${assinarComo || 'nome da conta logada na Anjun'}\nFoto: a etiqueta de cada um, achada em ${pdfs.length} PDF(s)`);
    if (!ok) return;

    itens = codigos.map((codigo) => ({ codigo, situacao: codigo in mapa ? 'pendente' : 'sem_etiqueta' }));
    rodando = true;
    parar = false;
    $('parar').disabled = false;
    $('pdf').disabled = true;
    $('tirar').disabled = true;
    $('codigos').disabled = true;
    contar();
    desenharLista();
    sombra.querySelector('.atual').hidden = false;

    let seguidos = 0;
    for (const item of itens) {
      if (parar) break;
      if (item.situacao !== 'pendente') continue;
      item.situacao = 'rodando';
      item.etapa = 'Preparando a foto';
      desenharLista();
      mostrarStatus(`Dando baixa em ${item.codigo}...`);
      try {
        const imagem = await imagemDaEtiqueta(mapa[item.codigo]);
        await TELA.darBaixa({
          codigo: item.codigo, imagem, cpf, assinarComo,
          aoMudar: (etapa) => { item.etapa = etapa; $('etapa').textContent = `${item.codigo}: ${etapa}`; desenharLista(); },
        });
        item.situacao = 'ok';
        seguidos = 0;
      } catch (e) {
        item.situacao = 'erro';
        item.motivo = e.message;
        seguidos += 1;
        try {
          await TELA.voltarAoInicio(item.codigo);
        } catch (e2) {
          item.motivo += ` (e a tela não voltou ao passo 1: ${e2.message})`;
          parar = true;
        }
        if (seguidos >= ERROS_SEGUIDOS) parar = true;
      }
      item.hora = new Date().toLocaleTimeString('pt-BR');
      delete item.etapa;
      desenharLista();
    }

    rodando = false;
    $('parar').disabled = true;
    $('pdf').disabled = false;
    $('tirar').disabled = false;
    $('codigos').disabled = false;
    const { feitos, erros } = desenharLista();
    const faltam = itens.filter((i) => i.situacao === 'pendente').length;
    let fim = `${feitos} baixa(s) feita(s), ${erros} com erro`;
    if (faltam) fim += `, ${faltam} na fila`;
    if (seguidos >= ERROS_SEGUIDOS) fim += '. Parei depois de 3 erros seguidos: confira a tela da Anjun';
    mostrarStatus(`${fim}.`, erros > 0 || faltam > 0);
    $('etapa').textContent = '';
    contar();
  });

  $('parar').addEventListener('click', () => {
    parar = true;
    $('parar').disabled = true;
    mostrarStatus('Vou parar depois da baixa que está em andamento.');
  });

  $('csv').addEventListener('click', () => {
    const csv = `﻿${R.montarCsv(itens)}`;
    const agora = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    const nome = `baixas-anjun-${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  window.addEventListener('beforeunload', (e) => {
    if (rodando) { e.preventDefault(); e.returnValue = ''; }
  });

  document.documentElement.append(hospedeiro);
  atualizarVisibilidade();
})();
