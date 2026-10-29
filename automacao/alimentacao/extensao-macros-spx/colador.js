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
    // Uma AT NOVA por pedido de AT dos entregadores (Atribuições > Solicitar AT, no site): cria a
    // tarefa de atribuição em Entrega > Atribuição de Entrega, põe o código nela pelo "Add New
    // Order" e CONCLUI a AT (botão "Concluído" + "Confirmar") - sem concluir, sair dela pede
    // "Você quer sair sem completar esta tarefa de atribuição?" (pedido do usuário, 20/10/2026).
    criar_at: {
      titulo: 'Colador — Criar AT (entregadores)',
      seletoresCampo: [
        'input[placeholder*="escaneie ou insira"]',
        'input[placeholder*="SPX T"]',
      ],
    },
  };

  // O e-mail logado (ex.: adm.xpt-cfc-01@shopeemobile-external.com) carrega o
  // XPT de verdade — ler DA PÁGINA, em vez de confiar só numa config digitada
  // à mão, é o que impede colar código do polo errado quando a MESMA extensão
  // roda em SPX de contas diferentes (Caçador e Videira, cada PC na sua
  // conta, rodando ao mesmo tempo). Se a página não trouxer nenhum sinal,
  // devolve null — quem chama cai pra config.xpt (comportamento de antes).
  // A fonte principal é a estação embaixo da logo ("XPT_SC_Videira"); o e-mail fica de reserva.
  function xptDaPagina() {
    const texto = String(document.body && document.body.innerText || '');
    const daEstacao = L.xptDaEstacao(L.estacaoNoTexto(texto));
    if (daEstacao) return daEstacao;
    const m = texto.match(/xpt[_-]?(cfc|via)/i);
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
    const xpt = real || config.xpt;
    // Sem XPT o lote viria dos dois polos misturados — melhor não colar nada.
    if (!xpt) throw new Error('não achei o XPT desta aba (XPT_SC_… embaixo da logo) — confira se o SPX carregou');
    return xpt;
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
  // Criar AT: a resposta do SPX pro código que acabou de ir no "Add New Order" (ver rede.js).
  const respostasDoSpx = {};
  raiz.addEventListener('message', (evento) => {
    if (evento.source !== raiz) return;
    const d = evento.data;
    if (d && d.__xmMacroAt === true && d.codigo && d.at) {
      atsCapturados.push({ codigo: String(d.codigo), at: String(d.at) });
    }
    if (d && d.__xmMacroResposta === true && d.codigo) {
      // O código pode ir duas vezes (o campo envia sozinho e o Enter envia de novo): a segunda
      // volta "já está na gaiola". Uma vez aceito, fica aceito - a última resposta não apaga isso.
      const antes = respostasDoSpx[String(d.codigo)];
      respostasDoSpx[String(d.codigo)] = (antes && antes.ok)
        ? antes : { ok: !!d.ok, mensagem: String(d.mensagem || '') };
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
  // Só vale campo que vem DEPOIS do rótulo no documento, e nunca radio/checkbox: subindo os pais,
  // o container cresce e o "primeiro input" passava a ser um campo de CIMA (o YES/NO do "Grupo de
  // Rota Necessário") - o clique ia nele e o menu do Grupo de Rotas nem abria (02/10/2026).
  const CAMPO_DE_ROTULO = 'input:not([type="radio"]):not([type="checkbox"]), [class*="select"], [class*="dropdown"]';
  const DEPOIS = 4; // Node.DOCUMENT_POSITION_FOLLOWING

  function campoDoRotulo(rotulo) {
    const label = S.folhaVisivelComTexto(rotulo) || S.folhaVisivelComTexto(`* ${rotulo}`);
    if (!label) return null;
    const vemDepois = (el) => !label.compareDocumentPosition || (label.compareDocumentPosition(el) & DEPOIS);
    let container = label.parentElement;
    for (let i = 0; i < 4 && container; i++, container = container.parentElement) {
      const candidatos = container.querySelectorAll
        ? [...container.querySelectorAll(CAMPO_DE_ROTULO)]
        : [container.querySelector(CAMPO_DE_ROTULO)].filter(Boolean);
      const campo = candidatos.find((c) => vemDepois(c) && S.visivel(c));
      if (campo) return campo;
    }
    return null;
  }

  // DIGITAR E DAR ENTER (dica do usuário, 02/10/2026). O "Grupo de Rotas" e o "Tipo de Rota de
  // Entrega" são selects com busca: clicar, digitar o texto da opção e dar Enter escolhe. Antes:
  // 1) a opção ENSINADA (Alt+G) não confere texto e clicou no "Rotas Caçador" cinza do topo do
  //    formulário (mesmo seletor) - o campo ficou "Por favor, selecione";
  // 2) procurar as opções por classe (li/option/item) não achou nada - as opções desse componente
  //    não usam essas classes, e o menu aberto parecia "não abriu".
  // Se o Enter não escolher (menu continua aberto com a opção), clica na opção pelo texto. No fim
  // confere: menu fechado E o campo mostrando o texto - senão para com erro claro.
  //
  // O nome do grupo muda por polo (só existe a opção do polo logado), e o XPT da aba já é conhecido.
  const GRUPO_DE_ROTAS_DO_XPT = { XPT_CFC: 'Rotas Caçador', XPT_VIA: 'Rotas Videira' };
  const TIPO_DE_ROTA = 'Bulky&Non-bulky';

  const caixaDoCampo = (campo) => (campo.closest && campo.closest('[class*="select"]')) || campo;

  function entradaDoCampo(campo) {
    if (String(campo.tagName || '').toUpperCase() === 'INPUT') return campo;
    return (campo.querySelector && campo.querySelector('input')) || null;
  }

  // A opção com esse texto que está visível AGORA e não estava antes de abrir o campo, fora da
  // caixa do próprio campo (onde o valor escolhido aparece depois).
  function opcaoAbertaCom(texto, antes, caixa) {
    return S.folhasComTexto(texto).filter(S.visivel)
      .find((el) => !antes.has(el) && !(caixa.contains && caixa.contains(el))) || null;
  }

  // O que foi DIGITADO fica no campo mesmo sem nada ter sido escolhido - por isso o valor do input
  // só conta se o menu chegou a abrir com a opção (`viuOpcao`) e fechou; senão só vale o texto
  // que o componente mostra como selecionado.
  function campoMostra(rotulo, texto, viuOpcao) {
    const campo = campoDoRotulo(rotulo);
    if (!campo) return false;
    const caixa = caixaDoCampo(campo);
    const mostrado = String(caixa.textContent || '');
    if (/selecione/i.test(mostrado)) return false;
    if (L.chave(mostrado).includes(L.chave(texto))) return true;
    return !!viuOpcao && L.chave(campo.value || '').includes(L.chave(texto));
  }

  async function escolherNoDropdown(rotulo, texto) {
    const campo = campoDoRotulo(rotulo);
    if (!campo) throw new Error(`não achei o campo "${rotulo}"`);
    const caixa = caixaDoCampo(campo);
    const antes = new Set(S.folhasComTexto(texto).filter(S.visivel));

    S.clicar(campo);
    await S.dormir(400);
    const entrada = entradaDoCampo(campo);
    let viuOpcao = !!opcaoAbertaCom(texto, antes, caixa);
    if (entrada) {
      S.escrever(entrada, texto);
      await S.dormir(600);
      viuOpcao = viuOpcao || !!opcaoAbertaCom(texto, antes, caixa);
      S.apertarEnter(entrada);
      await S.dormir(500);
    }
    const aberta = opcaoAbertaCom(texto, antes, caixa);
    if (aberta) { viuOpcao = true; S.clicar(aberta); await S.dormir(400); }

    const ok = await S.esperar(() => !opcaoAbertaCom(texto, antes, caixa) && campoMostra(rotulo, texto, viuOpcao),
      { oque: `"${rotulo}" ficar com "${texto}"`, limite: 4000, intervalo: 200 }).catch(() => false);
    if (!ok) throw new Error(`não consegui escolher "${texto}" em "${rotulo}" — o campo continuou sem ele`);
  }

  async function prepararAtCluster(xpt) {
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

    const grupo = GRUPO_DE_ROTAS_DO_XPT[xpt];
    if (!grupo) throw new Error('não sei o nome do Grupo de Rotas pro XPT ' + (xpt || '(nenhum)') + ' — confira o XPT da aba');
    await escolherNoDropdown('Grupo de Rotas', grupo);
    await escolherNoDropdown('Tipo de Rota de Entrega', TIPO_DE_ROTA);

    const confirmar = acharPorTexto('Confirm');
    if (!confirmar) throw new Error('não achei o botão "Confirm"');
    S.clicar(confirmar);

    await S.esperar(() => acharPorTexto('Participar Desta Tarefa'), {
      oque: 'a confirmação de tarefa criada', limite: 15000, intervalo: 300 });
    S.clicar(acharPorTexto('Participar Desta Tarefa'));

    await S.esperar(() => naTelaDeDigitar('at_cluster'), {
      oque: 'o campo de código aparecer', limite: 20000, intervalo: 300 });
  }

  // ── criar uma AT do zero pra um código (modo criar_at) ─────────────────────
  // Sempre do zero, um código por AT: volta pra lista, "Criar tarefa de atribuição", Enviar (a data
  // já vem a de hoje), e o SPX abre a AT nova (#/assignment-task/detailNoLabel?id=AT...). O id
  // sai do endereço; o código entra pelo "Add New Order" e só conta quando aparece na tabela.
  const TELA_LISTA_ATRIBUICAO = '#/delivery-assignment/list';
  const ID_DA_AT_NA_URL = /assignment-task\/detail[^?]*\?id=(AT[A-Z0-9]+)/i;
  const TEXTO_CRIAR_ATRIBUICAO = 'Criar tarefa de atribuição';

  // O SPX recusou o código na AT (não vale tentar de novo: o entregador precisa saber).
  class Recusado extends Error {}

  // O que o ENTREGADOR lê quando o pedido não vira AT (vai pro at_erro, aparece no app dele):
  // curto e na língua dele. O texto inteiro do SPX continua no log do macro, pra quem cuida.
  // Pedido do usuário (20/10/2026): "O status do pedido é Delivered, não pode ser adicionado
  // ao AT" -> 'Pedido com o status "entregue"'; Delivering = o pedido já está na rua.
  function resumoParaEntregador(motivo) {
    const t = String(motivo || '');
    if (/fleet order not found/i.test(t)) return 'Código não existe no SPX';
    if (/\bdelivered\b/i.test(t)) return 'Pedido com o status "entregue"';
    if (/\bdelivering\b/i.test(t)) return 'Pedido já está na rua (em rota de entrega)';
    // "O status do pedido é Hub_LHArrived, não pode ser adicionado ao AT" (22/10/2026): o pacote
    // chegou na transferência mas ainda não foi bipado no recebimento do hub.
    if (/\bhub_lharrived\b/i.test(t)) return 'O pedido não foi recebido no HUB';
    // Janela "Pedido interceptado - por favor, encaminhe BR... para área de Tratativas" (29/10/2026).
    if (/interceptad/i.test(t)) return 'Pedido interceptado — fale com o responsável';
    // "Não foi possível adicionar o pedido à gaiola": o pedido já está em outra AT (20/10/2026).
    if (/gaiola|\bcage\b/i.test(t)) return 'Esse pedido já está em uma AT';
    // "estação atual inválida: 7326, ID da estação do pedido: 5968": o pedido é do outro polo.
    if (/esta[cç][aã]o atual inv[aá]lida|esta[cç][aã]o do pedido|invalid station|station.*invalid/i.test(t)) {
      return 'Esse pedido é de uma estação diferente da sua. Confirme o seu polo — se estiver errado, peça a troca de polo';
    }
    if (/não confirmou|não apareceu/i.test(t)) return 'Não deu pra confirmar a AT — fale com o responsável';
    // Sem resumo conhecido: a frase do SPX sem o número interno ("141201028:") nem o código.
    const limpa = t.replace(/^.*?recusou o código na AT\w+:\s*/i, '').replace(/^\d{5,}:\s*/, '')
      .replace(/\bBR\w{13}\b:?\s*/g, '').trim();
    return limpa ? `Não foi possível criar a AT: ${limpa}` : 'Não foi possível criar a AT';
  }

  const atDaUrl = () => { const m = ID_DA_AT_NA_URL.exec(String(location.hash || '')); return m ? m[1].toUpperCase() : null; };

  // Resposta do SPX pra código que não existe: "<código> Fleet order not found" (20/10/2026).
  const CODIGO_INEXISTENTE = /fleet order not found/i;

  // Os avisos flutuantes do SPX (o balão de erro/sucesso no topo da tela). Erro = classe de erro
  // ou texto de erro; o texto deles também é tirado da página antes de procurar o código, porque
  // o aviso de erro costuma trazer o próprio código ("BR123... Fleet order not found").
  const SELETOR_AVISOS = '[class*="message"], [class*="notification"], [class*="toast"], [role="alert"]';
  const TEXTO_DE_ERRO = /not found|erro|error|fail|falh|inv[aá]lid|n[aã]o (foi|pode|encontr|existe|permit)|already|j[aá] (est|exist)|exist|duplic|cannot|can't|unable/i;
  // Uma linha da página com o código E cara de erro: o formato de erro do SPX ("141201027: BR...")
  // ou uma frase de erro tirando o próprio código. A linha da tabela da AT tem código + endereço,
  // sem essas frases.
  function linhaDeErroComCodigo(texto, codigo) {
    for (const linha of String(texto || '').split(/\n+/)) {
      if (!linha.includes(codigo)) continue;
      if (/\d{6,}:\s*BR\w{13}/i.test(linha) || TEXTO_DE_ERRO.test(linha.split(codigo).join(' '))) {
        return linha.trim().slice(0, 250);
      }
    }
    return null;
  }

  // O código numa linha da tabela da AT (td/tr/role=row/linha de tabela do design system do SPX).
  const SELETOR_LINHAS_DA_TABELA = 'td, tr, [role="row"], [role="cell"], [class*="table-row"], [class*="table-cell"]';
  function codigoNaTabela(codigo) {
    const doc = raiz.document;
    if (!doc || !doc.querySelectorAll) return false;
    try {
      return Array.from(doc.querySelectorAll(SELETOR_LINHAS_DA_TABELA))
        .some((el) => String(el.textContent || '').includes(codigo));
    } catch (e) { return false; }
  }

  function avisosNaTela() {
    const doc = raiz.document;
    if (!doc || !doc.querySelectorAll) return [];
    const vistos = [];
    for (const el of Array.from(doc.querySelectorAll(SELETOR_AVISOS))) {
      if (!S.visivel(el)) continue;
      const texto = String(el.innerText || el.textContent || '').trim();
      if (!texto || vistos.some((v) => v.texto.includes(texto) || texto.includes(v.texto))) continue;
      const classe = String((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '');
      vistos.push({ texto: texto.slice(0, 200), erro: /error|fail|warn|danger/i.test(classe) || TEXTO_DE_ERRO.test(texto) });
    }
    return vistos;
  }

  const naLista = () => !atDaUrl() && acharPorTexto(TEXTO_CRIAR_ATRIBUICAO);

  const PEDIDO_INTERCEPTADO = /pedido interceptado/i;
  async function fecharJanelaDeInterceptado() {
    const confirmar = await S.esperar(() => acharPorTexto('Confirmar'),
      { oque: 'o botão "Confirmar" da janela de pedido interceptado', limite: 5000, intervalo: 200 })
      .catch((e) => { if (e instanceof S.Parado) throw e; return null; });
    if (confirmar) { S.clicar(confirmar); await S.dormir(600); }
  }

  // "Você quer sair sem completar esta tarefa de atribuição? [Cancelar] [Determinar]" - aparece ao
  // sair de uma AT não concluída (a que o SPX recusou e ficou vazia, ou a que não deu pra concluir).
  // Sair mesmo: o pedido já foi resolvido (AT entregue, ou recusa registrada).
  async function confirmarSairSeAvisar() {
    const sair = S.acharBotao('Determinar') || S.folhaVisivelComTexto('Determinar');
    if (sair) { S.clicar(sair); await S.dormir(600); }
  }

  // Voltar da AT aberta pra lista. Só trocar o endereço às vezes não redesenha a tela (20/10/2026:
  // "a tela Atribuição de Entrega não carregou" três vezes seguidas, saindo de dentro de uma AT) -
  // então tenta voltar uma página e, por último, o item do menu da esquerda.
  async function irParaListaDeAtribuicao() {
    if (naLista()) return;
    const tentativas = [
      () => { raiz.location.hash = TELA_LISTA_ATRIBUICAO; },
      () => { if (raiz.history && raiz.history.back) raiz.history.back(); },
      () => {
        const item = S.folhasComTexto('Atribuição de Entrega').filter(S.visivel)[0];
        if (item) S.clicar(item); else raiz.location.hash = TELA_LISTA_ATRIBUICAO;
      },
    ];
    for (const tentar of tentativas) {
      tentar();
      await S.dormir(800);
      await confirmarSairSeAvisar();
      const ok = await S.esperar(naLista, { oque: 'a tela Atribuição de Entrega', limite: 15000, intervalo: 300 }).catch((e) => {
        if (e instanceof S.Parado) throw e;
        return null;
      });
      if (ok) return;
    }
    throw new Error('não consegui voltar pra Entrega > Atribuição de Entrega (a tela não carregou)');
  }

  async function criarAtPara(codigo) {
    await irParaListaDeAtribuicao();
    const criar = await S.esperar(() => acharPorTexto(TEXTO_CRIAR_ATRIBUICAO),
      { oque: `o botão "${TEXTO_CRIAR_ATRIBUICAO}"`, limite: 20000, intervalo: 300 });
    S.clicar(criar);
    const enviar = await S.esperar(() => acharPorTexto('Enviar'),
      { oque: 'a janela "Criar tarefa de atribuição" (botão Enviar)', limite: 10000, intervalo: 200 });
    await S.dormir(300);
    const base = S.rede.ativas;
    S.clicar(enviar);
    await S.dormir(600);
    await S.esperarRede({ base, limite: 20000 });
    const at = await S.esperar(atDaUrl, { oque: 'a AT nova abrir', limite: 25000, intervalo: 300 });

    const campo = await S.esperar(() => acharCampo('criar_at'),
      { oque: 'o campo "Add New Order" da AT', limite: 20000, intervalo: 300 });
    await esperarCampoLivre(campo, ESPERA_CAMPO_LIVRE_MS);
    delete respostasDoSpx[codigo];
    raiz.postMessage({ __xmMacroEscutar: codigo }, raiz.location.origin);
    const antesRede = S.rede.ativas;
    S.escrever(campo, codigo);
    // O campo do SPX às vezes envia sozinho ao receber o código (como um leitor). O Enter em cima
    // disso mandava o código DE NOVO: o 1º entrava, o 2º voltava "já está na gaiola" e o
    // entregador via "já está em uma AT" com o código dentro dela (20/10/2026). Só aperta Enter
    // se nada saiu sozinho.
    const foiSozinho = await S.esperar(() => respostasDoSpx[codigo] || null,
      { oque: 'o campo enviar sozinho', limite: 1500, intervalo: 150 }).catch((e) => {
      if (e instanceof S.Parado) throw e;
      return null;
    });
    if (!foiSozinho) S.apertarEnter(campo);
    await S.dormir(800);
    await S.esperarRede({ base: antesRede, limite: 20000 });

    // A AT só vai pro entregador com o código DENTRO dela. O código solto na página NÃO prova
    // nada: a faixa vermelha de erro do SPX ("141201027: BR... Não foi possível adicionar o pedido
    // na gaiola...") traz o código e não tem classe de aviso conhecida - foi assim que um pedido
    // que nem entrou virou AT entregue (20/10/2026, duas vezes). Nesta ordem:
    //   1. entrou: a aba "Atribuído (N)" com N > 0, ou o código numa linha da TABELA da AT (a AT
    //      é nova e só leva este código). Vem ANTES do erro: um envio repetido dá "já está na
    //      gaiola" com o código já dentro;
    //   2. o SPX aceitou alguma vez: espera a tabela mostrar (o erro que vier é do envio repetido);
    //   3. erro: aviso de erro, resposta do SPX dizendo que falhou, ou qualquer linha da página
    //      com o código + frase de erro (ou no formato "141201027: BR...") -> recusado.
    const resultado = await S.esperar(() => {
      const texto = String((raiz.document && raiz.document.body && raiz.document.body.innerText) || '');
      const atribuidos = /Atribu[ií]do\s*\((\d+)\)/i.exec(texto);
      if ((atribuidos && Number(atribuidos[1]) > 0) || codigoNaTabela(codigo)) return { ok: true, mensagem: '' };
      // Janela "Pedido interceptado - por favor, encaminhe BR... para área de Tratativas" (29/10/2026):
      // não é balão nem faixa, e a frase não tem cara de erro - por isso conferida à parte.
      if (PEDIDO_INTERCEPTADO.test(texto)) return { ok: false, mensagem: 'Pedido interceptado', interceptado: true };
      const r = respostasDoSpx[codigo];
      if (r && r.ok) return null;
      const erroNaTela = avisosNaTela().find((a) => a.erro);
      if (erroNaTela) return { ok: false, mensagem: erroNaTela.texto };
      if (r && !r.ok) return r;
      if (CODIGO_INEXISTENTE.test(texto)) return { ok: false, mensagem: 'Fleet order not found' };
      const linhaDeErro = linhaDeErroComCodigo(texto, codigo);
      if (linhaDeErro) return { ok: false, mensagem: linhaDeErro };
      return null;
    }, { oque: `o SPX responder sobre o ${codigo}`, limite: 15000, intervalo: 300 }).catch((e) => {
      if (e instanceof S.Parado) throw e;
      return null;
    });
    if (!resultado) {
      const r = respostasDoSpx[codigo];
      // O SPX disse ok mas o código não apareceu na tabela: se a página mostra um erro com o
      // código, é ele o motivo (mais útil pro entregador que "não confirmou").
      const texto = String((raiz.document && raiz.document.body && raiz.document.body.innerText) || '');
      const erroNaTela = avisosNaTela().find((a) => a.erro);
      const erro = (erroNaTela && erroNaTela.texto) || linhaDeErroComCodigo(texto, codigo);
      if (erro) throw new Recusado(`o SPX recusou o código na ${at}: ${erro}`);
      throw new Recusado(r && r.ok
        ? `o SPX respondeu ok, mas o código não apareceu na ${at} — confira essa AT no SPX`
        : `o SPX não confirmou o código na ${at} — confira essa AT no SPX`);
    }
    // Esse texto vai pra tela do entregador (at_erro), então é a frase pra ele, não a do SPX.
    if (!resultado.ok && CODIGO_INEXISTENTE.test(resultado.mensagem)) {
      throw new Recusado(`o SPX recusou o código na ${at}: ${codigo} Fleet order not found (o código não existe no SPX)`);
    }
    // A janela do interceptado fica por cima de tudo: sem "Confirmar", sair da AT não funciona.
    if (!resultado.ok && resultado.interceptado) await fecharJanelaDeInterceptado();
    if (!resultado.ok) {
      throw new Recusado(`o SPX recusou o código na ${at}${resultado.mensagem ? `: ${resultado.mensagem}` : ''}`);
    }
    return at;
  }

  // Concluir a AT aberta: "Concluído" no topo (ao lado de "Imprimir etiqueta") e "Confirmar" no card
  // que abre. Pronto quando o card fecha e o botão "Concluído" some (ou fica desabilitado).
  async function concluirAt(at) {
    const concluir = await S.esperar(() => acharPorTexto('Concluído'),
      { oque: 'o botão "Concluído" da AT', limite: 10000, intervalo: 300 });
    S.clicar(concluir);
    const confirmar = await S.esperar(() => acharPorTexto('Confirmar'),
      { oque: 'o card de confirmar a conclusão', limite: 10000, intervalo: 200 });
    await S.dormir(300);
    const base = S.rede.ativas;
    S.clicar(confirmar);
    await S.dormir(800);
    await S.esperarRede({ base, limite: 20000 });
    await S.esperar(() => {
      if (acharPorTexto('Confirmar')) return null;
      const botao = acharPorTexto('Concluído');
      return !botao || S.desabilitado(botao) || !atDaUrl() || atDaUrl() !== at ? true : null;
    }, { oque: `a ${at} ficar concluída`, limite: 15000, intervalo: 300 });
  }

  const PREPARAR = { recebimento: prepararRecebimento, at_cluster: prepararAtCluster, criar_at: async () => {} };

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

  // Avisa o fundo.js que esta sessão acabou de propósito: não é pra reabrir sozinha.
  function encerrarSessao(qual) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      const r = chrome.runtime.sendMessage({ xmColadorFim: qual });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) { /* contexto da extensão invalidado: nada a avisar */ }
  }

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

      // A barra da esquerda (com a estação) demora a desenhar numa aba recém-aberta: sem esperar,
      // a sessão rodava sem saber o polo da página e aparecia como "polo ?" no sistema (20/10/2026).
      await S.esperar(xptDaPagina, { oque: 'a estação embaixo da logo', limite: 15000, intervalo: 500 }).catch((e) => {
        if (e instanceof S.Parado) throw e;
        return null;
      });
      const xpt = xptEfetivo(config);
      if (P.polo) P.polo(xpt);
      await PREPARAR[qual](xpt);

      P.passo('procurando códigos pra colar');
      let lote = [];
      let tabela = null;

      for (;;) {
        if (S.parar) throw new S.Parado('parado por você');

        if (!lote.length) {
          const r = await pedirAoVigia('lote', {
            // Criar AT: um de cada vez - cada código é uma AT do zero, e o resto fica livre pra
            // outra máquina do mesmo polo pegar enquanto esta trabalha.
            modo: qual, tam: qual === 'criar_at' ? 1 : config.lote, carencia: config.carencia,
            dia: diaDoLote(config), xpt,
          });
          tabela = r.tabela;
          lote = Array.isArray(r.itens) ? r.itens.slice() : [];
          if (!lote.length) {
            // Só sai com "contínuo" DESLIGADO de propósito. Config antiga sem o campo é contínua
            // (é o que a tela mostra) - antes saía no primeiro lote vazio e a sessão "parava"
            // sozinha com 0 colado(s), sem pegar o pedido seguinte do entregador (20/10/2026).
            if (config.continuo === false) break;
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
          if (qual === 'criar_at') {
            P.passo(`criando a AT do ${item.codigo}`);
            const at = await criarAtPara(item.codigo);
            // A AT vai pro entregador ANTES do confirmar: é o que ele espera na tela dele.
            await pedirAoVigia('at', { codigo: item.codigo, dia: item.dia || diaDaAt(config), at });
            await pedirAoVigia('confirmar', { modo: qual, tabela, ids: [item.id] });
            colados++;
            falhasSeguidas = 0;
            // Concluir fecha o ciclo. Se não der, a AT do entregador continua valendo (o código
            // está nela) - só fica anotado, e a próxima volta pra lista sai pelo "Determinar".
            try {
              await concluirAt(at);
              P.nota(`${colados} AT(s) criada(s) · ${item.codigo} → ${at} (concluída)`);
            } catch (e) {
              if (e instanceof S.Parado) throw e;
              P.nota(`${item.codigo} → ${at}, mas não consegui concluir a AT: ${e.message || e}`);
            }
          } else {
            await colarUm(qual, item.codigo);
            await pedirAoVigia('confirmar', { modo: qual, tabela, ids: [item.id] });
            colados++;
            falhasSeguidas = 0;
            P.nota(`${colados} colado(s) · ${item.codigo}`);
          }
        } catch (e) {
          if (e instanceof S.Parado) throw e;
          // Recusado pelo SPX: não volta pra fila (repetiria pra sempre) - fica com o motivo, que o
          // entregador vê na tela dele, e ele pode pedir de novo.
          if (e instanceof Recusado) {
            await pedirAoVigia('falhou', { modo: qual, tabela, id: item.id, erro: resumoParaEntregador(e.message) }).catch(() => {});
            P.nota(`${item.codigo}: ${e.message}`);
            await S.dormir(Math.max(0, Math.round((config.intervalo || 0) * 1000)));
            continue;
          }
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
      encerrarSessao(qual);
    } catch (e) {
      // Parada de propósito encerra a sessão; erro não - a extensão reabre sozinha (fundo.js).
      if (e instanceof S.Parado) {
        P.erro(paradoPelaTela ? 'parado pela tela do site' : 'parado por você');
        encerrarSessao(qual);
      } else {
        P.erro(`${e.message || e} (${colados} colado(s) até parar) — tento de novo em instantes`);
      }
    } finally {
      rodando = null;
      rodandoId = null;
      S.parar = false;
      paradoPelaTela = false;
    }
  }

  G.colador = { rodar, CATALOGO, resumoParaEntregador, linhaDeErroComCodigo, SELETOR_LINHAS_DA_TABELA, avisosNaTela, SELETOR_AVISOS, acharCampo, colarUm, diaDoLote, diaDaAt, criarAtPara, concluirAt, Recusado,
                prepararRecebimento, prepararAtCluster, campoDoRotulo, escolherNoDropdown, acharPorTexto,
                xptDaPagina, xptEfetivo, GRUPO_DE_ROTAS_DO_XPT };

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
