// MACRO: COLADOR (Recebimento e AT Cluster)
//
// Substitui o colador_neon.py + a extensao-colador separada (WebSocket, uma aba
// por porta 9876-9885): agora e so mais um macro desta extensao, seguindo o
// mesmo desenho de comando/painel/agenda dos outros tres - so que "continuo"
// (fica rodando, colando o que chegar) em vez de "roda uma vez e termina".
//
// DE ONDE VEM O CODIGO: nao daqui. O site (bipagem da operacao, ou pedido de AT
// do entregador) grava em shopee_recebimentos / entregador_pedidos_at; este
// macro so RESERVA um lote (FOR UPDATE SKIP LOCKED no backend, nunca pega o
// mesmo codigo que outra maquina), digita um por um na tela do SPX, e confirma.
// Ver modules/at/colagem.js (backend) e vigia_alimentacao.py (a ponte - o
// content script nao alcanca 127.0.0.1 direto, por isso tudo passa por
// chrome.runtime.sendMessage ate o fundo.js).
//
// CADA CODIGO, UMA TENTATIVA POR VEZ: ao contrario dos outros macros (uma acao,
// confere, segue), aqui e um laco que nao para sozinho enquanto `continuo` for
// true - so registro novo aparecendo faz ele continuar. O botao Parar do painel
// e o unico jeito de encerrar um "continuo".
//
// A CAPTURA DA AT (AT Cluster): quando o codigo e colado nessa tela, o SPX cria
// a AT e devolve o numero na PROPRIA resposta da chamada que ele faz. Quem
// intercepta essa chamada e o rede.js (roda no MUNDO DA PAGINA, world: "MAIN" -
// e o unico jeito de ver o fetch/XHR que o SPX de fato usa) e manda pra ca por
// postMessage. Grava-se no backend por fora do laco de colagem, pra nao atrasar
// o proximo codigo por causa de um POST que nao tem nada a ver com ele.
//
// FALHA NAO DERRUBA A SESSAO NA HORA: um codigo que nao entrou (campo sumiu,
// aba recarregou) libera a reserva (volta pra fila, pra qualquer maquina
// pegar) e conta como falha; so depois de MAX_FALHAS_SEGUIDAS falhas seguidas
// e que o macro desiste e avisa - antes disso, seguem os proximos da lista.
// Campo NAO ENCONTRADO NENHUMA VEZ (tela errada, ou o SPX mudou o layout) para
// na hora: insistir nisso e so gastar a reserva de codigos bons.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const P = G.painel;

  // Cada tela do SPX identifica o campo de codigo pelo placeholder - texto que
  // o usuario le, e o unico que sobrevive a troca de classe/id do React entre
  // versoes. Fallbacks genericos por ultimo, caso a Shopee troque o texto.
  const CATALOGO = {
    recebimento: {
      titulo: 'Colador — Recebimento',
      seletoresCampo: [
        'input[placeholder="Por favor, insira"]',
        'input[placeholder*="insira"]',
        'input[placeholder*="rastreamento"]',
      ],
    },
    at_cluster: {
      titulo: 'Colador — AT Cluster',
      seletoresCampo: [
        'input[placeholder="Please Scan or Input"]',
        'input[placeholder*="Scan"]',
      ],
    },
  };

  // O e-mail logado (ex.: adm.xpt-cfc-01@shopeemobile-external.com) carrega o
  // XPT de verdade — ler DA PÁGINA, em vez de confiar só numa config digitada
  // à mão, é o que impede colar código do polo errado quando a MESMA extensão
  // roda em SPX de contas diferentes (Caçador e Videira, cada PC na sua
  // conta, rodando ao mesmo tempo). Se a página não trouxer nenhum sinal,
  // devolve null — quem chama cai pra config.xpt (comportamento de antes).
  function xptDaPagina() {
    const m = String(document.body && document.body.innerText || '').match(/xpt[_-]?(cfc|via)/i);
    return m ? `XPT_${m[1].toUpperCase()}` : null;
  }

  // O XPT que vale pra esta sessão: o da página quando dá pra detectar (nunca
  // o da config, que pode estar errada ou desatualizada); a config só serve
  // quando a página não dá nenhum sinal. Página e config DISCORDANDO é motivo
  // de parar — rodar mesmo assim arriscaria colar o polo errado.
  function xptEfetivo(config) {
    const real = xptDaPagina();
    if (real && config.xpt && real !== config.xpt) {
      throw new Error(`configurado para ${config.xpt}, mas esta aba está logada em ${real} — corrija a configuração ou o computador antes de rodar`);
    }
    return real || config.xpt || null;
  }

  const MAX_FALHAS_SEGUIDAS = 3;
  const ESPERA_SEM_CODIGO_MS = 4000;
  const ESPERA_CAMPO_LIVRE_MS = 15000;
  // Depois de colar, o SPX costuma SELECIONAR o texto pra avisar que aceitou -
  // ele nao limpa nem desabilita o campo pra isso. Sem esse sinal em meio
  // segundo, segue mesmo assim: nem toda tela do SPX da um aviso claro, e
  // esperar mais so atrasa o proximo codigo (mesma folga da extensao-colador).
  const ESPERA_SINAL_MS = 500;

  // ── a AT capturada pelo rede.js (mundo da pagina) ─────────────────────────
  // rede.js manda {__xmMacroAt:true, codigo, at} por postMessage quando o SPX
  // cria a AT (ver ali o porque de ser um arquivo a parte). Guarda numa fila
  // simples: gravar é responsabilidade daqui, não do rede.js.
  const atsCapturados = [];
  raiz.addEventListener('message', (evento) => {
    if (evento.source !== raiz) return;
    const d = evento.data;
    if (d && d.__xmMacroAt === true && d.codigo && d.at) {
      atsCapturados.push({ codigo: String(d.codigo), at: String(d.at) });
    }
  });

  function acharCampo(qual) {
    const cat = CATALOGO[qual];
    if (!cat) return null;
    for (const seletor of cat.seletoresCampo) {
      const el = document.querySelector(seletor);
      if (el && S.visivel(el)) return el;
    }
    return null;
  }

  // O placeholder genérico "Por favor, insira" não é exclusivo da tela de digitar: a própria
  // LISTA de Recebimento (#/generalReceiveTaskOps, sem nenhum id) tem os mesmos campos de
  // filtro ("ID de recebimento", "Número de manifesto") com o MESMO placeholder - acharCampo()
  // sozinho não enxerga essa diferença, e um `return` cedo baseado só nele fazia o colador achar
  // que já estava pronto estando ainda na lista, sem nunca clicar em "Recebimento unitário"
  // (achado ao vivo, 01/10/2026: ficava "aguardando novos códigos" pra sempre, sem erro nenhum,
  // porque a reserva de verdade não tem nada a ver com qual tela o navegador está mostrando).
  // O AT Cluster tem a MESMA armadilha: a lista (#/sorting-task/list) tem no topo o campo "ID da
  // tarefa de separação" com placeholder "Please Scan or Input", igual ao de bipar dentro da
  // tarefa (02/10/2026). Ali não se sabe o endereço da tarefa aberta, então vale o contrário:
  // na LISTA, nunca está pronto.
  const URL_TELA_PRONTA = {
    recebimento: (h) => /singleReceiveNew/.test(h),
    at_cluster: (h) => !/sorting-task\/list/.test(h),
  };

  function naTelaDeDigitar(qual) {
    const pronta = URL_TELA_PRONTA[qual];
    if (pronta && !pronta(String(location.hash || ''))) return false;
    return !!acharCampo(qual);
  }

  /** true se o campo destravou dentro do limite (ou já estava livre). */
  async function esperarCampoLivre(campo, limiteMs) {
    const fim = Date.now() + limiteMs;
    while (S.desabilitado(campo)) {
      if (Date.now() > fim) return false;
      await S.dormir(150);
    }
    return true;
  }

  /** Digita um código e espera o sinal de que o SPX processou. Lança se o campo sumir. */
  async function colarUm(qual, codigo) {
    const campo = acharCampo(qual);
    if (!campo) throw new Error('não achei o campo de código nesta tela — é a tela certa do SPX?');

    await esperarCampoLivre(campo, ESPERA_CAMPO_LIVRE_MS);
    S.escrever(campo, codigo);
    S.apertarEnter(campo);

    const fim = Date.now() + ESPERA_SINAL_MS;
    for (;;) {
      if (S.parar) throw new S.Parado('parado por você');
      // Desabilitou: o SPX está processando de verdade - vale esperar mais.
      if (S.desabilitado(campo)) {
        await esperarCampoLivre(campo, ESPERA_CAMPO_LIVRE_MS);
        return;
      }
      if (campo.value === codigo && campo.selectionStart === 0 && campo.selectionEnd === codigo.length) {
        return; // selecionou o texto colado - sinal de "aceitei"
      }
      if (Date.now() > fim) return; // sem sinal claro: segue mesmo assim
      await S.dormir(16);
    }
  }

  // ── preparar a tela (criar a RT / a tarefa de separação) ──────────────────
  // fundo.js só leva a aba até a LISTA (Entrada > Recebimento, Entrega >
  // Sorting Task Management) — o endereço da tela onde se digita de fato tem
  // um id que muda a cada recebimento/tarefa criado, então não dá pra navegar
  // direto pra ela. Daqui pra frente é clique dentro da página.
  //
  // Se acharCampo() já enxerga o campo, pula tudo isso: reaproveita uma RT ou
  // tarefa que já esteja aberta (de uma rodada anterior, ou que a pessoa
  // mesma tenha deixado pronta), em vez de criar outra à toa.

  // S.acharBotao sozinho exige um elemento CLICAVEL (button, [class*="btn"/
  // "button"]...); folhaVisivelComTexto acha por TEXTO, sem depender de
  // classe — mesmo fallback que alimentacao.js já usa pro botão "Mais" dos
  // filtros. Serve pros botões do formulário do AT Cluster (Criar tarefa,
  // Static, YES, Confirm, Participar Desta Tarefa).
  function acharPorTexto(texto) {
    return S.acharBotao(texto) || S.folhaVisivelComTexto(texto) || S.acharBotao(texto, { comeca: true });
  }

  async function prepararRecebimento() {
    // Clicar em "Receber por pedido" vem ANTES de confiar em acharCampo, não depois: a
    // aba padrão do "Recebimento unitário" ("Manifesto/Motorista/Por TO/SP PARA Receber")
    // tem um campo com o MESMO placeholder genérico ("Por favor, insira") do campo certo
    // — se a tela já estiver aberta nessa aba errada, acharCampo('recebimento') encontra
    // esse campo e um `return` cedo aqui nunca chegava a clicar em "Receber por pedido":
    // o colador colava na aba errada sem erro nenhum (achado ao vivo, 30/09/2026). Clicar
    // numa aba já selecionada não atrapalha nada.
    let abaPedido = acharPorTexto('Receber por pedido');
    if (abaPedido) { S.clicar(abaPedido); await S.dormir(300); }

    if (naTelaDeDigitar('recebimento')) return;

    P.passo('abrindo um recebimento unitário novo');
    // "Recebimento unitário"/"Recebimento em massa" NÃO foram achados nem por
    // classe nem por texto puro contra o SPX de verdade (29/09/2026) - devem
    // estar num componente que foge dos dois (Shadow DOM é o suspeito
    // principal). Ensinado (Alt+R), como o ícone de baixar do Backlog.
    const botao = G.aprender.elementosEnsinados('recebimento_unitario').filter(S.visivel)[0];
    if (!botao) {
      throw new Error('"Recebimento unitário" ainda não foi ensinado — abra o popup e clique em "Ensinar o Recebimento unitário" (ou Alt+R nesta tela)');
    }
    const base = S.rede.ativas;
    S.clicar(botao);
    await S.dormir(600);
    await S.esperarRede({ base, limite: 20000 });

    await S.esperar(() => acharPorTexto('Receber por pedido'), {
      oque: 'a aba "Receber por pedido"', limite: 20000, intervalo: 300 });
    abaPedido = acharPorTexto('Receber por pedido');
    if (abaPedido) { S.clicar(abaPedido); await S.dormir(300); }

    await S.esperar(() => acharCampo('recebimento'), {
      oque: 'o campo de código aparecer', limite: 20000, intervalo: 300 });
  }

  // O campo clicável logo abaixo de um rótulo ("* Grupo de Rotas" com o campo
  // "Por favor, selecione" embaixo) — o formulário do SPX agrupa rótulo e
  // campo bem próximos, então basta subir alguns pais a partir do rótulo.
  function campoDoRotulo(rotulo) {
    const label = S.folhaVisivelComTexto(rotulo) || S.folhaVisivelComTexto(`* ${rotulo}`);
    if (!label) return null;
    let container = label.parentElement;
    for (let i = 0; i < 4 && container; i++, container = container.parentElement) {
      const campo = container.querySelector('input, [class*="select"], [class*="dropdown"]');
      if (campo && S.visivel(campo)) return campo;
    }
    return null;
  }

  // AS OPÇÕES DO MENU = O QUE APARECEU COM O CLIQUE. Antes era só a opção ENSINADA (Alt+G/Alt+T),
  // e o "Grupo de Rotas" ensinado não confere texto (o nome muda por polo) - ao vivo (02/10/2026)
  // ele clicou em outra coisa com o mesmo seletor (o "Rotas Caçador" cinza do topo do formulário)
  // e o campo ficou "Por favor, selecione". Comparando o que estava visível antes e depois de
  // abrir o campo, sobram só as opções DESTE menu, e aí dá pra escolher pelo texto.
  const OPCOES_DE_MENU = 'li, [role="option"], [class*="option"], [class*="item"]';

  function opcoesVisiveis() {
    return [...document.querySelectorAll(OPCOES_DE_MENU)]
      .filter(S.visivel)
      .filter((el) => String(el.textContent || '').trim() && !el.querySelector(OPCOES_DE_MENU));
  }

  // O campo mostra o valor escolhido no lugar do "Por favor, selecione".
  function campoPreenchido(rotulo) {
    const campo = campoDoRotulo(rotulo);
    if (!campo) return false;
    const caixa = (campo.closest && campo.closest('[class*="select"]')) || campo;
    const texto = `${caixa.textContent || ''} ${campo.value || ''}`.trim();
    return !!texto && !/selecione/i.test(texto);
  }

  // `escolha(novas)`: das opções que apareceram, qual clicar (ou null).
  async function escolherNoDropdown(rotulo, escolha, qualEnsinado) {
    const campo = campoDoRotulo(rotulo);
    if (!campo) throw new Error(`não achei o campo "${rotulo}"`);
    const antes = new Set(opcoesVisiveis());
    S.clicar(campo);
    await S.dormir(500);

    const novas = await S.esperar(() => {
      const n = opcoesVisiveis().filter((el) => !antes.has(el));
      return n.length ? n : null;
    }, { oque: `o menu de "${rotulo}" abrir`, limite: 8000, intervalo: 200 }).catch(() => []);

    let opcao = escolha(novas);
    // Ensinado só como reserva, e só onde ele confere texto (Tipo de Rota) - ver acima.
    if (!opcao && qualEnsinado) opcao = G.aprender.elementosEnsinados(qualEnsinado).filter(S.visivel)[0] || null;
    if (!opcao) {
      const vistas = novas.map((el) => String(el.textContent).trim()).filter(Boolean).slice(0, 5).join(' / ');
      throw new Error(`não achei a opção certa em "${rotulo}"${vistas ? ` (apareceram: ${vistas})` : ' (o menu não abriu)'}`);
    }
    S.clicar(opcao);
    await S.esperar(() => campoPreenchido(rotulo), { oque: `"${rotulo}" ficar preenchido`, limite: 4000, intervalo: 200 })
      .catch(() => { throw new Error(`cliquei em "${String(opcao.textContent || '').trim()}" mas "${rotulo}" continuou vazio`); });
  }

  // "Grupo de Rotas" só tem UMA opção (a do polo logado - confirmado pelo usuário, 30/09/2026).
  // Se aparecer mais de uma, só aceita a que fala em "rota"; sem certeza, para com erro claro.
  function escolherGrupoDeRotas(novas) {
    if (novas.length === 1) return novas[0];
    const comRota = novas.filter((el) => /rota/i.test(String(el.textContent || '')));
    return comRota.length === 1 ? comRota[0] : null;
  }

  const escolherPorTexto = (texto) => (novas) =>
    novas.find((el) => L.chave(el.textContent) === L.chave(texto)) || null;

  async function prepararAtCluster() {
    if (naTelaDeDigitar('at_cluster')) return;

    P.passo('criando uma tarefa de separação (AT Cluster)');
    // ESPERA o botão: a aba acabou de ser aberta/navegada e o SPX ainda carrega a lista - procurar
    // uma vez só dava "não achei o botão Criar tarefa" com ele aparecendo na tela segundos depois
    // (02/10/2026). Ensinado (Alt+C) vale também, pro caso de a busca por texto não bastar.
    const acharCriar = () => acharPorTexto('Criar tarefa') ||
      G.aprender.elementosEnsinados('criar_tarefa').filter(S.visivel)[0] || null;
    const criar = await S.esperar(acharCriar, { oque: 'o botão "Criar tarefa"', limite: 20000, intervalo: 300 })
      .catch(() => null);
    if (!criar) {
      throw new Error('não achei o botão "Criar tarefa" — confira se a aba está em Entrega > Gestão de Tarefas de Separação (ou ensine: Alt+C nessa tela)');
    }
    S.clicar(criar);
    await S.esperar(() => S.folhaVisivelComTexto('Criar Tarefa de Separação'), {
      oque: 'o formulário de criar tarefa', limite: 10000, intervalo: 200 });
    await S.dormir(300);

    const estatico = acharPorTexto('Static');
    if (!estatico) throw new Error('não achei a opção "Static" (Modo de Rota)');
    S.clicar(estatico);

    const sim = acharPorTexto('YES');
    if (!sim) throw new Error('não achei a opção "YES" (Grupo de Rota Necessário)');
    S.clicar(sim);
    await S.dormir(300);

    await escolherNoDropdown('Grupo de Rotas', escolherGrupoDeRotas);
    await escolherNoDropdown('Tipo de Rota de Entrega', escolherPorTexto('Bulky&Non-bulky'), 'tipo_rota_entrega');

    const confirmar = acharPorTexto('Confirm');
    if (!confirmar) throw new Error('não achei o botão "Confirm"');
    S.clicar(confirmar);

    await S.esperar(() => acharPorTexto('Participar Desta Tarefa'), {
      oque: 'a confirmação de tarefa criada', limite: 15000, intervalo: 300 });
    S.clicar(acharPorTexto('Participar Desta Tarefa'));

    await S.esperar(() => naTelaDeDigitar('at_cluster'), {
      oque: 'o campo de código aparecer', limite: 20000, intervalo: 300 });
  }

  const PREPARAR = { recebimento: prepararRecebimento, at_cluster: prepararAtCluster };

  // ── ponte com o vigia (por fundo.js — ver o porquê no cabeçalho) ─────────
  function pedirAoVigia(acao, extra) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ xmColador: acao, ...extra }, (r) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!r || r.ok === false) return reject(new Error((r && r.error) || 'sem resposta do vigia'));
        resolve(r);
      });
    });
  }

  const diaDoLote = (config) => (config.todos_dias ? null : (config.dia || null));
  // A AT é gravada com o dia de HOJE quando "todos os dias" está marcado (é
  // quando a colagem está acontecendo) - dia do filtro, nos outros casos.
  const diaDaAt = (config) => config.dia || new Date().toISOString().slice(0, 10);

  /** Descarrega o que rede.js capturou, sem travar a digitação por causa disso. */
  async function drenarAts(config) {
    while (atsCapturados.length) {
      const item = atsCapturados[0];
      try {
        await pedirAoVigia('at', { codigo: item.codigo, dia: diaDaAt(config), at: item.at });
        atsCapturados.shift();
      } catch (e) {
        break; // tenta de novo na próxima rodada - a AT não trava a fila de colagem
      }
    }
  }

  let rodando = null;
  // O id do comando (fila.js, backend) desta rodada — null quando disparado sem um (ex.:
  // chamado direto, como nos testes). Sem isso, um "parar" remoto atrasado (chegou depois que
  // ESTA rodada já tinha terminado e outra do mesmo qual/máquina começou) derrubava a rodada
  // NOVA por engano, só por bater o qual (bug real, 01/10/2026 - junto com a fila nunca marcar
  // o pedido de parar como entregue, ver fila.js).
  let rodandoId = null;
  // true quando quem pediu pra parar foi o botão "Parar" da tela Macros (via fundo.js), não o
  // clique local no painel - só muda a mensagem final, a parada em si é a mesma (S.parar).
  let paradoPelaTela = false;

  async function rodar(qual, config, idComando) {
    if (rodando) { P.nota(`${(CATALOGO[qual] || {}).titulo || qual} já está rodando`); return; }
    if (!CATALOGO[qual]) throw new Error(`Colador desconhecido: ${qual}`);
    rodando = qual;
    rodandoId = idComando !== undefined ? idComando : null;
    S.parar = false;
    paradoPelaTela = false;
    P.abrir(CATALOGO[qual].titulo, () => { S.parar = true; });

    let colados = 0;
    let falhasSeguidas = 0;
    try {
      // Sem isso, numa aba nova (conteúdo recém-injetado) o que foi ensinado (Alt+R etc.)
      // podia ainda não estar carregado do chrome.storage quando prepararRecebimento
      // chamasse elementosEnsinados — a corrida dependia de outro script (alimentacao.js)
      // ter carregado primeiro, sem garantia nenhuma disso acontecer a tempo (achado ao
      // vivo, 30/09/2026: ensinar funcionou, mas rodar direto depois disse "ainda não foi
      // ensinado"). Mesma linha que backlog.js já usa, por isso mesmo.
      await G.aprender.carregar();

      const xpt = xptEfetivo(config);
      await PREPARAR[qual]();

      P.passo('procurando códigos pra colar');
      let lote = [];
      let tabela = null;

      for (;;) {
        if (S.parar) throw new S.Parado('parado por você');

        if (!lote.length) {
          const r = await pedirAoVigia('lote', {
            modo: qual, tam: config.lote, carencia: config.carencia,
            dia: diaDoLote(config), xpt,
          });
          tabela = r.tabela;
          lote = Array.isArray(r.itens) ? r.itens.slice() : [];
          if (!lote.length) {
            if (!config.continuo) break;
            // diagnostico (colagem.js, só vem quando o lote sai vazio): mostra ONDE o código
            // está sumindo (dia errado, xpt errado, ou já colado) em vez de só "nada achei" -
            // sem isso, "0 de hoje mesmo o código aparecendo em Shopee > Receber" (achado ao
            // vivo, 01/10/2026) não dava pra investigar sem acesso direto ao banco.
            const d = r.diagnostico;
            const extra = d ? ` (hoje: ${d.do_dia} · desse XPT: ${d.do_dia_e_xpt} · pendentes: ${d.pendentes})` : '';
            P.nota(`${colados} colado(s) até agora · aguardando novos códigos${extra}`);
            await S.dormir(ESPERA_SEM_CODIGO_MS);
            continue;
          }
        }

        const item = lote.shift();
        try {
          await colarUm(qual, item.codigo);
          await pedirAoVigia('confirmar', { modo: qual, tabela, ids: [item.id] });
          colados++;
          falhasSeguidas = 0;
          P.nota(`${colados} colado(s) · ${item.codigo}`);
        } catch (e) {
          if (e instanceof S.Parado) throw e;
          await pedirAoVigia('liberar', { modo: qual, tabela, ids: [item.id] }).catch(() => {});
          falhasSeguidas++;
          if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
            throw new Error(`${falhasSeguidas} falhas seguidas (${e.message || e}) — parei pra não gastar a fila à toa`);
          }
          P.nota(`não colei ${item.codigo}: ${e.message || e} — devolvi pra fila`);
        }

        await drenarAts(config);
        if (!S.parar) await S.dormir(Math.max(0, Math.round((config.intervalo || 0) * 1000)));
      }

      await drenarAts(config);
      P.ok(`${colados} colado(s)`);
    } catch (e) {
      if (e instanceof S.Parado) P.erro(paradoPelaTela ? 'parado pela tela do site' : 'parado por você');
      else P.erro(`${e.message || e} (${colados} colado(s) até parar)`);
    } finally {
      rodando = null;
      rodandoId = null;
      S.parar = false;
      paradoPelaTela = false;
    }
  }

  G.colador = { rodar, CATALOGO, acharCampo, colarUm, diaDoLote, diaDaAt,
                prepararRecebimento, prepararAtCluster, campoDoRotulo, escolherNoDropdown, acharPorTexto,
                xptDaPagina, xptEfetivo, escolherGrupoDeRotas };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (!msg) return;

      // "Parar" pedido pela tela Macros (fundo.js repassa, ~30s de atraso) - só derruba se for
      // ESTE colador que está rodando agora, E (quando o recado trouxer um id) se for A MESMA
      // rodada que pediu pra parar - um recado atrasado não pode derrubar uma rodada nova que
      // começou depois dele, só por ser do mesmo qual. Sem id no recado (compat), vale só o
      // qual. Sem responder: fundo.js dispara e não espera confirmação.
      if (msg.xmColadorParar) {
        const bateQual = msg.xmColadorParar === rodando;
        const bateId = msg.idComando === undefined || msg.idComando === rodandoId;
        if (bateQual && bateId) { paradoPelaTela = true; S.parar = true; }
        return;
      }

      if (!CATALOGO[msg.xmMacro]) return;
      if (rodando) { responder({ ok: false, error: `${CATALOGO[msg.xmMacro].titulo} já está rodando` }); return; }
      if (!msg.config || typeof msg.config !== 'object') { responder({ ok: false, error: 'comando sem config' }); return; }
      rodar(msg.xmMacro, msg.config, msg.idComando);
      responder({ ok: true });
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
