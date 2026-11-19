// Conduz a tela "Baixar Pacotes" da Anjun (#/views/operatingCenter/signScan), um pacote por vez.
//
// Usa a propria tela, como uma pessoa faria: bipa o codigo, Proximo, marca "Proprio" (o nome
// do recebedor vem da Anjun), coloca o documento configurado, anexa a etiqueta nas duas fotos
// obrigatorias, assina com o nome de quem esta dando a baixa e confirma o recebimento.
// Assim a Anjun aplica as regras dela (validacao, marca d'agua com hora e codigo na foto,
// localizacao, codigo de entrega) e nada e montado por fora.
//
// Classes vindas do codigo da tela (ScanStep, SignInfoStep, PhotoStep, ConfirmStep, SignDialog):
// .sign-steps .sign-step.is-active, .scan-field__row, .scan-list, .receiver-options,
// .doc-type-switch, .photo-grid .photo-cell, .signature-card, .sign-dialog, .sign-box__pad canvas,
// .sign-footer__actions, .upload-stat.

(() => {
  const PROPRIO = '0'; // valor do botao "Proprio" no tipo de recibo

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  function visivel(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  // Mensagens do Element Plus (ElMessage) somem em 3 s; o observador guarda todas.
  const mensagens = [];
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      for (const no of m.addedNodes) {
        if (!(no instanceof HTMLElement)) continue;
        const caixas = no.matches('.el-message') ? [no] : [...no.querySelectorAll('.el-message')];
        for (const c of caixas) {
          const tipo = ['error', 'warning', 'success', 'info'].find((t) => c.classList.contains(`el-message--${t}`)) || 'info';
          const texto = (c.querySelector('.el-message__content') || c).textContent.trim();
          mensagens.push({ tipo, texto, em: Date.now() });
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  function erroDesde(t) {
    const m = mensagens.find((x) => x.em >= t && (x.tipo === 'error' || x.tipo === 'warning'));
    return m ? m.texto || 'a Anjun recusou' : '';
  }

  /** Espera fn() devolver algo; se aparecer mensagem de erro da Anjun antes, falha com ela. */
  async function aguardar(fn, { tempo = 20000, desde = null, motivo = 'a tela não respondeu a tempo' } = {}) {
    const fim = Date.now() + tempo;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (desde !== null) {
        const erro = erroDesde(desde);
        if (erro) throw new Error(erro);
      }
      if (Date.now() > fim) throw new Error(motivo);
      await esperar(150);
    }
  }

  function preencher(input, valor) {
    input.focus();
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const naTela = () => !!document.querySelector('.sign-wizard .sign-steps');

  function passoAtual() {
    const passos = [...document.querySelectorAll('.sign-wizard .sign-steps .sign-step')];
    return passos.findIndex((p) => p.classList.contains('is-active'));
  }

  const ocupada = () => visivel(document.querySelector('.sign-wizard > .el-loading-mask'));

  function botaoAvancar() {
    const b = document.querySelectorAll('.sign-footer__actions button');
    return b[b.length - 1] || null;
  }

  function linhasDaLista() {
    return [...document.querySelectorAll('.scan-list .el-table__body tbody tr')]
      .filter((tr) => !tr.querySelector('.scan-list__empty'));
  }

  const naLista = (codigo) => linhasDaLista().find((tr) => tr.textContent.includes(codigo)) || null;

  function dialogosAbertos() {
    return [...document.querySelectorAll('.el-dialog')].filter((d) => visivel(d) && !d.classList.contains('sign-dialog'));
  }

  /** Pode comecar: na tela de baixa, no passo 1, sem pacote na lista e sem janela aberta. */
  function conferirInicio() {
    if (!naTela()) return 'Abra Centro de operação › Baixar Pacotes na Anjun.';
    if (passoAtual() !== 0) return 'Volte a tela da Anjun para o passo 1 (Escanear Pacotes).';
    if (linhasDaLista().length) return 'A lista "Pacotes para Recebimento" já tem pacote. Remova ou conclua antes de começar.';
    if (dialogosAbertos().length) return 'Feche a janela aberta na tela da Anjun antes de começar.';
    return '';
  }

  async function avancar(para) {
    const t = Date.now();
    botaoAvancar().click();
    await aguardar(() => passoAtual() === para && !ocupada(), { desde: t });
  }

  // ── passo 1: bipar ───────────────────────────────────────────────────────────
  async function bipar(codigo) {
    const t = Date.now();
    const campo = document.querySelector('.scan-field__row input');
    const botao = document.querySelector('.scan-field__row button');
    if (!campo || !botao) throw new Error('campo de bipar não encontrado');
    preencher(campo, codigo);
    botao.click();
    await aguardar(() => naLista(codigo), { desde: t, motivo: 'o pacote não entrou na lista' });
    if (linhasDaLista().length !== 1) throw new Error('a lista ficou com mais de um pacote');
    await avancar(1);
  }

  // ── passo 2: recebedor ───────────────────────────────────────────────────────
  function botaoDoGrupo(grupo, valor) {
    if (!grupo) return null;
    return [...grupo.querySelectorAll('.el-radio-button')].find((l) => {
      const i = l.querySelector('input');
      return i && i.value === valor;
    }) || null;
  }

  async function informarRecebedor(cpf) {
    const proprio = botaoDoGrupo(document.querySelector('.receiver-options'), PROPRIO);
    if (!proprio) throw new Error('botão "Próprio" não encontrado');
    (proprio.querySelector('.el-radio-button__inner') || proprio).click();
    await aguardar(() => proprio.classList.contains('is-active'));

    const doc = document.querySelector('.doc-type-switch');
    if (!doc) throw new Error('campo de documento não encontrado');
    const botaoCpf = botaoDoGrupo(doc, 'CPF');
    if (botaoCpf && !botaoCpf.classList.contains('is-active')) {
      (botaoCpf.querySelector('.el-radio-button__inner') || botaoCpf).click();
      await aguardar(() => botaoCpf.classList.contains('is-active'));
    }
    const campo = doc.querySelector('.el-input input');
    preencher(campo, cpf);
    await aguardar(() => campo.value === cpf, { motivo: 'a tela não aceitou o documento' });
    await avancar(2);
  }

  // ── passo 3: fotos ───────────────────────────────────────────────────────────
  async function anexarFotos(codigo, imagem) {
    for (const n of [0, 1]) {
      const celula = () => document.querySelectorAll('.photo-grid .photo-cell')[n];
      if (!celula()) throw new Error('quadro de foto não encontrado');
      if (!celula().querySelector('.photo-preview')) {
        const input = celula().querySelector('input[type=file]');
        if (!input) throw new Error('campo de foto não encontrado');
        const dt = new DataTransfer();
        dt.items.add(new File([imagem], `${codigo}.jpg`, { type: 'image/jpeg' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await aguardar(() => celula() && celula().querySelector('.photo-preview'), { motivo: 'a foto não entrou' });
    }
    await avancar(3);
  }

  // ── passo 4: assinar e confirmar ─────────────────────────────────────────────
  /** Nome que a propria Anjun mostra na janela de assinatura: a conta logada. */
  function nomeDaConta(dialogo) {
    const celula = dialogo.querySelector('.el-descriptions .el-descriptions__content');
    const nome = celula ? celula.textContent.trim() : '';
    return nome && nome !== '- -' ? nome : '';
  }

  /** Desenha o texto no quadro (vue-esign: mousedown/mousemove/mouseup, posicao pelo offset). */
  async function desenhar(canvas, texto) {
    const caixa = canvas.getBoundingClientRect();
    const largura = Math.round(caixa.width);
    const altura = Math.round(caixa.height);
    const rascunho = document.createElement('canvas');
    rascunho.width = largura;
    rascunho.height = altura;
    const ctx = rascunho.getContext('2d');
    const familia = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
    let tamanho = Math.round(altura * 0.38);
    ctx.font = `italic ${tamanho}px ${familia}`;
    const medida = ctx.measureText(texto).width;
    if (medida > largura * 0.88) tamanho = Math.floor(tamanho * (largura * 0.88) / medida);
    ctx.font = `italic ${tamanho}px ${familia}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, largura / 2, altura / 2);

    const dados = ctx.getImageData(0, 0, largura, altura).data;
    const alfa = new Uint8Array(largura * altura);
    for (let i = 0; i < alfa.length; i += 1) alfa[i] = dados[i * 4 + 3];
    const tracos = XMBaixasRegras.tracosDoTexto(alfa, largura, altura);
    if (!tracos.length) throw new Error('não deu para desenhar a assinatura');

    const evento = (tipo, p) => new MouseEvent(tipo, {
      bubbles: true, cancelable: true, view: window, button: 0, buttons: tipo === 'mouseup' ? 0 : 1,
      clientX: caixa.left + p.x, clientY: caixa.top + p.y,
    });
    for (let i = 0; i < tracos.length; i += 1) {
      const pontos = tracos[i];
      canvas.dispatchEvent(evento('mousedown', pontos[0]));
      for (const p of pontos.slice(1)) canvas.dispatchEvent(evento('mousemove', p));
      canvas.dispatchEvent(evento('mouseup', pontos[pontos.length - 1]));
      if (i % 40 === 39) await esperar(0); // deixa a tela respirar
    }
  }

  async function assinar(textoFixo) {
    const t = Date.now();
    const abrir = document.querySelector('.signature-card button');
    if (!abrir) throw new Error('botão Assinar não encontrado');
    abrir.click();
    const dialogo = await aguardar(() => {
      const d = document.querySelector('.sign-dialog');
      return d && visivel(d) && visivel(d.querySelector('.sign-box__pad canvas')) ? d : null;
    }, { desde: t, motivo: 'a janela de assinatura não abriu' });
    await esperar(800); // a janela limpa o quadro logo depois de abrir

    const texto = (textoFixo || '').trim() || nomeDaConta(dialogo);
    if (!texto) throw new Error('sem nome para assinar: preencha "Assinar como" no painel');
    await desenhar(dialogo.querySelector('.sign-box__pad canvas'), texto);

    const t2 = Date.now();
    dialogo.querySelector('.el-dialog__footer .el-button--primary').click();
    await aguardar(() => !visivel(document.querySelector('.sign-dialog'))
      && document.querySelector('.confirm-grid strong.is-signed'), { tempo: 60000, desde: t2, motivo: 'a assinatura não foi aceita' });
    return texto;
  }

  function textoDoDialogo(d) {
    const linhas = [...d.querySelectorAll('.dialog-list__row')].map((l) => l.textContent.replace(/\s+/g, ' ').trim());
    const corpo = (d.querySelector('.el-dialog__body') || d).textContent.replace(/\s+/g, ' ').trim();
    return linhas.length ? linhas.join(' | ') : corpo;
  }

  function fecharDialogo(d) {
    const botao = d.querySelector('.el-dialog__headerbtn') || d.querySelector('.el-dialog__footer button');
    if (botao) botao.click();
  }

  async function confirmarRecebimento(codigo) {
    const t = Date.now();
    botaoAvancar().click();
    const fim = await aguardar(() => {
      const aberto = dialogosAbertos()[0];
      if (aberto) return { dialogo: aberto };
      if (passoAtual() === 0 && !ocupada() && !naLista(codigo)) return { ok: true };
      return null;
    }, { tempo: 120000, desde: t, motivo: 'a Anjun não confirmou a baixa a tempo' });
    // A janela de falhas (quantos subiram e por que falharam) abre junto com a volta ao passo 1.
    const dialogo = fim.dialogo || (await esperar(800), dialogosAbertos()[0]);
    if (!dialogo) {
      const erro = erroDesde(t);
      if (erro) throw new Error(erro);
      return;
    }
    const motivo = textoDoDialogo(dialogo);
    fecharDialogo(dialogo);
    throw new Error(dialogo.querySelector('.upload-stat') ? `a Anjun recusou: ${motivo}` : `a Anjun pediu mais: ${motivo}`);
  }

  /** Depois de um erro: fecha janelas, volta ao passo 1 e tira o pacote da lista. */
  async function voltarAoInicio(codigo) {
    for (const d of dialogosAbertos()) fecharDialogo(d);
    const assinatura = document.querySelector('.sign-dialog');
    if (visivel(assinatura)) fecharDialogo(assinatura);
    await esperar(400);
    if (passoAtual() > 0) {
      document.querySelectorAll('.sign-wizard .sign-steps .sign-step')[0].click();
      await aguardar(() => passoAtual() === 0, { motivo: 'não voltou ao passo 1' });
    }
    const linha = naLista(codigo);
    if (linha) {
      const remover = linha.querySelector('.classDelIcon');
      if (remover) remover.click();
      await aguardar(() => !naLista(codigo), { motivo: 'não deu para tirar o pacote da lista' });
    }
  }

  /** Uma baixa inteira. aoMudar(texto) mostra a etapa no painel. Devolve o nome assinado. */
  async function darBaixa({ codigo, imagem, cpf, assinarComo, aoMudar = () => {} }) {
    aoMudar('Bipando');
    await bipar(codigo);
    aoMudar('Recebedor');
    await informarRecebedor(cpf);
    aoMudar('Fotos');
    await anexarFotos(codigo, imagem);
    aoMudar('Assinando');
    const assinado = await assinar(assinarComo);
    aoMudar('Confirmando');
    await confirmarRecebimento(codigo);
    return assinado;
  }

  globalThis.XMBaixasTela = { naTela, conferirInicio, darBaixa, voltarAoInicio, desenhar };
})();
