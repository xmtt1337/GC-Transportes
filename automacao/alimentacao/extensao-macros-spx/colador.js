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

  async function rodar(qual, config) {
    if (rodando) { P.nota(`${(CATALOGO[qual] || {}).titulo || qual} já está rodando`); return; }
    if (!CATALOGO[qual]) throw new Error(`Colador desconhecido: ${qual}`);
    rodando = qual;
    S.parar = false;
    P.abrir(CATALOGO[qual].titulo, () => { S.parar = true; });

    let colados = 0;
    let falhasSeguidas = 0;
    try {
      P.passo('procurando códigos pra colar');
      let lote = [];
      let tabela = null;

      for (;;) {
        if (S.parar) throw new S.Parado('parado por você');

        if (!lote.length) {
          const r = await pedirAoVigia('lote', {
            modo: qual, tam: config.lote, carencia: config.carencia,
            dia: diaDoLote(config), xpt: config.xpt || null,
          });
          tabela = r.tabela;
          lote = Array.isArray(r.itens) ? r.itens.slice() : [];
          if (!lote.length) {
            if (!config.continuo) break;
            P.nota(`${colados} colado(s) até agora · aguardando novos códigos`);
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
      if (e instanceof S.Parado) P.erro('parado por você');
      else P.erro(`${e.message || e} (${colados} colado(s) até parar)`);
    } finally {
      rodando = null;
      S.parar = false;
    }
  }

  G.colador = { rodar, CATALOGO, acharCampo, colarUm, diaDoLote, diaDaAt };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (!msg || !CATALOGO[msg.xmMacro]) return;
      if (rodando) { responder({ ok: false, error: `${CATALOGO[msg.xmMacro].titulo} já está rodando` }); return; }
      if (!msg.config || typeof msg.config !== 'object') { responder({ ok: false, error: 'comando sem config' }); return; }
      rodar(msg.xmMacro, msg.config);
      responder({ ok: true });
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
