// XM - Ativos iMile: o grupo "Ativos" (Disparar ativos) dentro do modulo "XMTT" (logo XM) da barra de
// icones do DS da iMile, junto com o grupo "Conferencias" da XM - Conferencias. O modulo, o painel e o
// entrar/sair sao do imile/xmtt-modulo.js (arquivo igual nas duas extensoes); aqui fica a pagina de
// disparo, no tema do proprio DS. Mesmo fluxo da XM - Ativos Shopee, com o modelo da iMile.
//
// Fluxo: cola os waybills -> o imile.js faz a busca normal de cada um (sem cota; remetente) -> o
// sistema diz quem ja recebeu ativo -> "Disparar": para cada marcado, o olho (nome, telefone e
// produto; 1 da cota) e o envio pelo WABA do sistema (modelo confirmacao_imile).

(() => {
  const R = self.XMAtivosImile;
  const CANAL = 'xmAtivosImile'; // o mesmo do imile.js
  const AZUL = '#2546ff'; // a cor de destaque do DS
  const RITMO_OLHO_MS = 1200; // o mesmo da XM - Consultas de telefone na iMile
  const PAUSA_ENVIO_MS = 500; // igual ao disparo em massa do sistema
  const PAGINAS = [{ chave: 'disparar', titulo: 'Disparar ativos' }];

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── estilo (a pagina; o menu usa as classes do proprio DS) ───────────────────
  const CSS = `
  .xm-im-pagina { padding: 16px 20px 32px; color: #1d2129; font-size: 14px; line-height: 1.5; box-sizing: border-box; min-width: 0; }
  .xm-im-pagina * { box-sizing: border-box; }
  .xm-im-pagina [hidden] { display: none !important; }
  .xm-im-pagina .xm-cartao { background: #fff; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; border: 1px solid #e4e5ed; }
  .xm-im-pagina .xm-titulo { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .xm-im-pagina .xm-sub { color: #86909c; font-size: 13px; margin: 0 0 16px; }
  .xm-im-pagina .xm-rotulo { display: block; color: #4e5969; font-size: 13px; margin: 0 0 6px; }
  .xm-im-pagina .xm-campo, .xm-im-pagina .xm-area { width: 100%; border: 1px solid #e4e5ed; border-radius: 6px; font: inherit; color: #1d2129; background: #fff; outline: none; }
  .xm-im-pagina .xm-campo { height: 34px; padding: 0 12px; }
  .xm-im-pagina .xm-area { min-height: 120px; padding: 8px 12px; resize: vertical; font-family: inherit; }
  .xm-im-pagina .xm-campo:focus, .xm-im-pagina .xm-area:focus { border-color: ${AZUL}; }
  .xm-im-pagina .xm-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-im-pagina .xm-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-im-pagina .xm-acoes { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
  .xm-im-pagina .xm-btn { height: 34px; padding: 0 16px; border: 1px solid #e4e5ed; border-radius: 6px; background: #fff; color: #1d2129; font: inherit; cursor: pointer; white-space: nowrap; }
  .xm-im-pagina .xm-btn:hover:not(:disabled) { color: ${AZUL}; border-color: ${AZUL}; }
  .xm-im-pagina .xm-btn-primario { background: ${AZUL}; border-color: ${AZUL}; color: #fff; }
  .xm-im-pagina .xm-btn-primario:hover:not(:disabled) { background: #1a37d6; border-color: #1a37d6; color: #fff; }
  .xm-im-pagina .xm-btn:disabled { opacity: .5; cursor: not-allowed; }
  .xm-im-pagina .xm-link { background: none; border: 0; padding: 0; color: ${AZUL}; font: inherit; cursor: pointer; }
  .xm-im-pagina .xm-link:hover { text-decoration: underline; }
  .xm-im-pagina .xm-status { color: #4e5969; font-size: 13px; }
  .xm-im-pagina .xm-status.xm-erro { color: #f53f3f; }
  .xm-im-pagina .xm-conta { color: #4e5969; font-size: 13px; float: right; }
  .xm-im-pagina .xm-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .xm-im-pagina .xm-contas { color: #4e5969; font-size: 13px; }
  .xm-im-pagina .xm-contas b { color: #1d2129; }
  .xm-im-pagina .xm-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid #e4e5ed; border-radius: 6px; }
  .xm-im-pagina table.xm-tabela { width: 100%; border-collapse: collapse; }
  .xm-im-pagina .xm-tabela th { position: sticky; top: 0; background: #f6f7fa; color: #4e5969; font-weight: 500; text-align: left; padding: 10px 14px; border-bottom: 1px solid #e4e5ed; white-space: nowrap; z-index: 1; }
  .xm-im-pagina .xm-tabela td { padding: 10px 14px; border-bottom: 1px solid #f0f1f5; vertical-align: middle; }
  .xm-im-pagina .xm-tabela tr:hover td { background: #f8f9fc; }
  .xm-im-pagina .xm-tabela .xm-cod { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .xm-im-pagina .xm-tabela input[type=checkbox] { width: 16px; height: 16px; accent-color: ${AZUL}; cursor: pointer; }
  .xm-im-pagina .xm-tag { display: inline-block; padding: 0 8px; border-radius: 4px; font-size: 12px; line-height: 22px; white-space: nowrap; }
  .xm-im-pagina .xm-tag-pronto { background: #f2f3f5; color: #4e5969; }
  .xm-im-pagina .xm-tag-ok { background: #e8ffea; color: #00b42a; }
  .xm-im-pagina .xm-tag-aviso { background: #fff7e8; color: #d25f00; }
  .xm-im-pagina .xm-tag-erro { background: #ffece8; color: #f53f3f; }
  .xm-im-pagina .xm-previa { white-space: pre-wrap; background: #f6f7fa; border: 1px solid #e4e5ed; border-radius: 6px; padding: 12px 16px; font-size: 13px; margin-top: 12px; }
  .xm-im-pagina details summary { cursor: pointer; color: #4e5969; font-size: 13px; margin-top: 12px; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-im-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-im-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  let papelAtual = null; // cargo da conta entrada (null = ninguém entrou ainda)
  let pagina = null;

  /** Cargo sem acesso aos ativos: o grupo "Ativos" some do XMTT (e a pagina fecha). */
  function aplicarPapel(papel) {
    papelAtual = papel;
    self.XMTTDs.ocultarGrupo(!(papel == null || R.ROLES_ATIVOS.includes(papel)));
  }

  // ── conversa com o fundo.js e com o imile.js ──────────────────────────────────
  function pedirAoFundo(tipo, dados = {}) {
    if (!chrome.runtime || !chrome.runtime.id) return Promise.reject(new Error('A extensão foi atualizada. Aperte F5 nesta página.'));
    return chrome.runtime.sendMessage({ tipo, ...dados }).then((r) => {
      if (!r) throw new Error('A extensão não respondeu. Aperte F5 nesta página.');
      if (r.erro) { const e = new Error(r.erro); e.conta = !!r.conta; throw e; }
      return r;
    });
  }

  /** Pede ao imile.js (mundo da página) e espera a resposta final; o andamento vai para aviso. */
  function pedirAoDs(tipo, dados, aviso = () => {}) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || ''), e.data); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) { const err = new Error(e.data.erro); err.parar = !!e.data.parar; reject(err); } else resolve(e.data);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: tipo, id, ...dados }, location.origin);
    });
  }

  // ── a pagina ──────────────────────────────────────────────────────────────────
  const estado = { linhas: [], ocupado: false, logado: false, nome: '', cota: null };
  const $ = (id) => pagina.querySelector(`#xm-im-${id}`);

  function montarPagina() {
    const p = document.createElement('div');
    p.className = 'xm-im-pagina';
    p.innerHTML = `
      <div class="xm-cartao">
        <span class="xm-conta" id="xm-im-conta"></span>
        <h2 class="xm-titulo">Disparar ativos</h2>
        <p class="xm-sub">Mensagem de confirmação de recebimento da iMile (modelo confirmacao_imile) pelo WhatsApp da GC. A conversa aparece no sistema XMTT.</p>
        <div id="xm-im-login" hidden>
          <div class="xm-linha">
            <label><span class="xm-rotulo">Usuário do sistema</span><input class="xm-campo" id="xm-im-usuario" autocomplete="username"></label>
            <label><span class="xm-rotulo">Senha</span><input class="xm-campo" id="xm-im-senha" type="password" autocomplete="current-password"></label>
            <button class="xm-btn xm-btn-primario" id="xm-im-entrar" type="button">Entrar</button>
          </div>
        </div>
        <div id="xm-im-busca" hidden>
          <label class="xm-rotulo" for="xm-im-codigos">Waybill (um por linha, ou separados por espaço)</label>
          <textarea class="xm-area" id="xm-im-codigos" placeholder="Waybill..."></textarea>
          <div class="xm-acoes">
            <button class="xm-btn xm-btn-primario" id="xm-im-buscar" type="button">Buscar pedidos</button>
            <button class="xm-btn" id="xm-im-limpar" type="button">Redefinir</button>
          </div>
        </div>
        <p class="xm-status" id="xm-im-status"></p>
      </div>
      <div class="xm-cartao" id="xm-im-resultado" hidden>
        <div class="xm-cabecalho">
          <span class="xm-contas" id="xm-im-contas"></span>
          <button class="xm-btn xm-btn-primario" id="xm-im-disparar" type="button" disabled>Disparar</button>
        </div>
        <div class="xm-tabela-caixa">
          <table class="xm-tabela">
            <thead><tr><th style="width:40px"><input type="checkbox" id="xm-im-todos" title="Marcar todos os prontos"></th><th>Waybill</th><th>Remetente</th><th>Nome do cliente</th><th>Telefone</th><th>Produto</th><th>Situação</th></tr></thead>
            <tbody id="xm-im-linhas"></tbody>
          </table>
        </div>
        <details><summary>Ver a mensagem</summary><div class="xm-previa" id="xm-im-previa"></div></details>
      </div>`;
    p.querySelector('#xm-im-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-im-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-im-buscar').addEventListener('click', buscar);
    p.querySelector('#xm-im-limpar').addEventListener('click', limpar);
    p.querySelector('#xm-im-disparar').addEventListener('click', disparar);
    p.querySelector('#xm-im-todos').addEventListener('change', (e) => {
      estado.linhas.forEach((l) => { if (podeMarcar(l)) l.marcado = e.target.checked; });
      desenhar();
    });
    p.querySelector('#xm-im-linhas').addEventListener('change', (e) => {
      const cod = e.target && e.target.dataset && e.target.dataset.cod;
      const l = estado.linhas.find((x) => x.codigo === cod);
      if (l) { l.marcado = e.target.checked; desenharContas(); }
    });
    return p;
  }

  function status(texto, erro = false) {
    if (!pagina) return;
    $('status').textContent = texto;
    $('status').className = `xm-status${erro ? ' xm-erro' : ''}`;
  }

  function mostrarLogin(logado, nome) {
    estado.logado = logado;
    estado.nome = nome || '';
    $('login').hidden = logado;
    $('busca').hidden = !logado;
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="xm-link" id="xm-im-sair" type="button">Sair</button>` : '';
    const sair = $('sair');
    if (sair) sair.addEventListener('click', () => pedirAoFundo('sair').then(() => { aplicarPapel(null); mostrarLogin(false); status(''); }));
    desenharContas();
  }

  function atualizarConta() {
    pedirAoFundo('estado').then((r) => { aplicarPapel(r.logado ? r.papel : null); mostrarLogin(r.logado, r.nome); })
      .catch((e) => status(e.message, true));
  }

  function erroDeConta(e) {
    if (e.conta) mostrarLogin(false);
    status(e.message, true);
  }

  async function entrar() {
    const usuario = $('usuario').value;
    const senha = $('senha').value;
    if (!usuario || !senha) return status('Preencha usuário e senha.', true);
    status('Entrando...');
    try {
      const r = await pedirAoFundo('entrar', { usuario, senha });
      $('senha').value = '';
      aplicarPapel(r.papel);
      mostrarLogin(true, r.nome);
      status('');
    } catch (e) { status(e.message, true); }
  }

  function limpar() {
    if (estado.ocupado) return;
    $('codigos').value = '';
    estado.linhas = [];
    $('resultado').hidden = true;
    status('');
  }

  // ── linhas da tabela ──────────────────────────────────────────────────────────
  // Nome, telefone e produto só vêm pelo olho, na hora do disparo (1 da cota por pedido marcado).
  // Já revelado sem nome ou telefone que sirva: abrir de novo só gastaria outra revelação.
  const semContato = (l) => l.revelado && (!l.nome || !R.validarTelefone(l.telefone).ok);
  const podeMarcar = (l) => l.achado && l.situacao_envio !== 'enviado' && !semContato(l);

  function situacaoTexto(l) {
    if (l.situacao_envio === 'olho') return ['Abrindo nome e telefone...', 'pronto'];
    if (l.situacao_envio === 'enviando') return ['Enviando...', 'pronto'];
    if (l.situacao_envio === 'enviado') return ['Enviado', 'ok'];
    if (l.situacao_envio === 'erro') return [`Não enviou: ${l.erro}`, 'erro'];
    if (l.naoBuscado) return ['Não buscado: a iMile pediu para ir mais devagar. Clique em Buscar pedidos de novo daqui a pouco', 'aviso'];
    if (!l.achado) return [`Não achado na iMile${l.motivo ? `: ${l.motivo}` : ''}`, 'erro'];
    if (l.ativo) {
      const quando = l.ativo.enviado_em ? new Date(l.ativo.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const resposta = l.ativo.estado === 'recebeu' ? ' · respondeu: recebeu' : l.ativo.estado === 'nao_recebeu' ? ' · respondeu: não recebeu' : ' · sem resposta';
      return [`Já recebeu ativo${quando ? ` em ${quando}` : ''}${resposta}`, 'aviso'];
    }
    return ['Pronto', 'pronto'];
  }

  function desenharContas() {
    if (!pagina) return;
    const ls = estado.linhas;
    const prontos = ls.filter((l) => podeMarcar(l)).length;
    const marcados = ls.filter((l) => l.marcado && podeMarcar(l)).length;
    const naoBuscados = ls.filter((l) => l.naoBuscado).length;
    const naoAchados = ls.filter((l) => !l.achado && !l.naoBuscado).length;
    const achados = ls.filter((l) => l.achado).length;
    const jaTem = ls.filter((l) => l.ativo).length;
    const enviados = ls.filter((l) => l.situacao_envio === 'enviado').length;
    const cota = estado.cota && estado.cota.max ? ` · cota de revelações: ${numero(estado.cota.usadas)} de ${numero(estado.cota.max)}` : '';
    $('contas').innerHTML = `<b>${numero(ls.length)}</b> pedido(s) · ${numero(achados)} achado(s) na iMile · ${numero(naoAchados)} não achado(s)${naoBuscados ? ` · <b>${numero(naoBuscados)}</b> não buscado(s)` : ''}`
      + ` · ${numero(jaTem)} já receberam ativo${enviados ? ` · <b>${numero(enviados)}</b> enviado(s) agora` : ''}${esc(cota)}`;
    const btn = $('disparar');
    btn.textContent = `Disparar ${numero(marcados)} ativo(s)`;
    btn.disabled = estado.ocupado || !marcados || !estado.logado;
    const todos = $('todos');
    todos.checked = prontos > 0 && marcados === prontos;
    todos.disabled = estado.ocupado;
    const exemplo = ls.find((l) => l.nome) || ls.find((l) => l.marcado && podeMarcar(l)) || ls.find((l) => podeMarcar(l));
    $('previa').textContent = R.montarTexto({
      nome: exemplo && exemplo.nome ? exemplo.nome : '(nome do cliente)',
      atendente: estado.nome || '(seu nome)',
      produto: exemplo && exemplo.produto ? exemplo.produto : '(produto)',
      pedido: exemplo ? exemplo.codigo : '(pedido)',
    });
  }

  function desenhar() {
    $('resultado').hidden = !estado.linhas.length;
    $('linhas').innerHTML = estado.linhas.map((l) => {
      const [txt, tipo] = situacaoTexto(l);
      const tel = l.e164 ? R.telefoneLegivel(l.e164) : (l.telefone || (podeMarcar(l) ? 'abre ao disparar' : '—'));
      return `<tr>
        <td><input type="checkbox" data-cod="${esc(l.codigo)}" ${l.marcado ? 'checked' : ''} ${podeMarcar(l) && !estado.ocupado ? '' : 'disabled'}></td>
        <td class="xm-cod">${esc(l.codigo)}</td>
        <td>${esc(l.remetente || '—')}</td>
        <td${l.nome ? '' : ' style="color:#86909c"'}>${esc(l.nome || (podeMarcar(l) ? 'abre ao disparar' : '—'))}</td>
        <td style="white-space:nowrap;${l.e164 ? '' : 'color:#86909c'}">${esc(tel)}</td>
        <td>${esc(l.produto || '—')}</td>
        <td><span class="xm-tag xm-tag-${tipo}">${esc(txt)}</span></td>
      </tr>`;
    }).join('');
    desenharContas();
  }

  // ── buscar e disparar ─────────────────────────────────────────────────────────
  async function buscar() {
    if (estado.ocupado) return;
    const { codigos, ignorados } = R.lerCodigos($('codigos').value);
    if (!codigos.length) return status('Cole pelo menos um waybill da iMile (só números).', true);
    if (codigos.length > R.MAX_CODIGOS) return status(`São ${numero(codigos.length)} waybills; o limite por vez é ${numero(R.MAX_CODIGOS)}.`, true);
    estado.ocupado = true;
    $('buscar').disabled = true;
    try {
      // Buscar de novo a mesma lista: os já achados ficam como estão (com o que o olho já abriu);
      // só vai à iMile o que faltou (os "não buscados" de quando ela pediu calma, e os novos).
      const jaAchados = new Map(estado.linhas.filter((l) => l.achado).map((l) => [l.codigo, l]));
      const buscarAgora = codigos.filter((c) => !jaAchados.has(c));
      const { pedidos } = buscarAgora.length ? await pedirAoDs('buscar', { codigos: buscarAgora }, status) : { pedidos: [] };
      const novos = new Map(pedidos.map((p) => [p.codigo, p]));
      status('Vendo no sistema quem já recebeu ativo...');
      const { estados } = await pedirAoFundo('situacao', { pedidos: codigos });
      estado.linhas = codigos.map((c) => {
        const ativo = (estados || {})[c] || null;
        const antes = jaAchados.get(c);
        if (antes) return { ...antes, ativo };
        const l = { ...novos.get(c), nome: '', telefone: '', produto: '', e164: '', ativo, marcado: false };
        l.marcado = podeMarcar(l) && !ativo; // quem já recebeu ativo fica desmarcado
        return l;
      });
      const faltam = estado.linhas.filter((l) => !l.achado && !l.naoBuscado).length;
      const naoBuscados = estado.linhas.filter((l) => l.naoBuscado).length;
      status([
        ignorados.length ? `${numero(ignorados.length)} item(ns) ignorado(s) por não parecer waybill (${ignorados.slice(0, 3).join(', ')}${ignorados.length > 3 ? '...' : ''}).` : '',
        faltam ? `${numero(faltam)} waybill(s) não achado(s) na iMile.` : '',
        naoBuscados ? `${numero(naoBuscados)} não buscado(s): a iMile pediu para ir mais devagar. Espere uns minutos e clique em Buscar pedidos de novo; só esses serão buscados.` : '',
        'Nome, telefone e produto são abertos no olho da iMile só na hora do disparo: 1 da cota por pedido marcado.',
      ].filter(Boolean).join(' '));
    } catch (e) {
      erroDeConta(e);
    } finally {
      estado.ocupado = false;
      $('buscar').disabled = false;
      desenhar();
    }
  }

  async function disparar() {
    if (estado.ocupado) return;
    const fila = estado.linhas.filter((l) => l.marcado && podeMarcar(l));
    if (!fila.length) return;
    estado.ocupado = true;
    let ok = 0;
    let falha = 0;
    let ultimoOlho = 0;
    let parada = '';
    try {
      for (let i = 0; i < fila.length; i += 1) {
        const l = fila[i];
        status(`Pedido ${numero(i + 1)} de ${numero(fila.length)}... (${numero(ok)} enviado(s), ${numero(falha)} falha(s))`);
        try {
          if (!l.revelado) {
            const espera = RITMO_OLHO_MS - (Date.now() - ultimoOlho);
            if (espera > 0) await dormir(espera);
            l.situacao_envio = 'olho';
            desenhar();
            ultimoOlho = Date.now();
            const olho = await pedirAoDs('revelar', { codigo: l.codigo });
            l.nome = olho.nome;
            l.telefone = olho.telefone;
            l.produto = olho.produto;
            l.revelado = true;
            estado.cota = olho.cota;
            if (olho.parar) parada = olho.parar; // envia este e para depois dele
          }
          const envio = R.montarEnvio({ codigo: l.codigo, nome: l.nome, telefone: l.telefone, produto: l.produto, atendente: estado.nome });
          if (envio.erro) throw new Error(envio.erro);
          l.e164 = envio.corpo.numero;
          l.situacao_envio = 'enviando';
          desenhar();
          await pedirAoFundo('enviar', { corpo: envio.corpo });
          l.situacao_envio = 'enviado';
          l.marcado = false;
          ok += 1;
        } catch (e) {
          l.situacao_envio = 'erro';
          l.erro = e.message;
          if (semContato(l)) l.marcado = false;
          falha += 1;
          if (e.conta) { erroDeConta(e); parada = e.message; break; }
          // A iMile recusou o olho (cota, sessão): parar, não insistir.
          if (e.parar || /A iMile recusou|não respondeu|F5/.test(e.message)) { parada = e.message; break; }
        }
        desenhar();
        if (parada) break;
        if (i < fila.length - 1) await dormir(PAUSA_ENVIO_MS);
      }
      const resumo = `${numero(ok)} enviado(s), ${numero(falha)} falha(s).`;
      status(parada ? `${parada} ${resumo}` : `Concluído: ${resumo}`, !!parada || (falha > 0 && ok === 0));
    } finally {
      estado.ocupado = false;
      desenhar();
    }
  }

  colocarEstilo();
  self.XMTTDs.registrar({
    dono: 'ativos', ordem: 2, titulo: 'Ativos', itens: PAGINAS,
    montarPagina: () => (pagina = montarPagina()),
    aoMostrar: () => atualizarConta(),
  });
  if (chrome.runtime && chrome.runtime.id) {
    pedirAoFundo('estado').then((r) => aplicarPapel(r.logado ? r.papel : null)).catch(() => {});
  }
})();
