// ESPIAO DA AT - descobre onde nasce a AT na tela de cluster do SPX
//
// Pra que serve: a AT nao vem de arquivo nenhum, ela nasce no SPX no instante
// em que o pedido e colado. Pra capturar ela automaticamente eu preciso saber
// DE ONDE ela sai - de qual resposta da API, ou de qual pedaco da tela. Este
// script descobre isso sem eu ter que adivinhar o formato dela.
//
// COMO USAR
//   1. Abra a tela do SPX onde voce cria a AT (cluster / sorting task)
//   2. F12 > aba Console
//   3. Cole este arquivo inteiro e de Enter
//      (se o Chrome pedir, digite  allow pasting  e Enter antes)
//   4. Bipe UM pedido normalmente, do jeito que voce faz
//   5. OLHE A TELA e ache a AT que acabou de nascer
//   6. No console, digite:      espiao.achar("COLE_A_AT_AQUI")
//      (com a AT exatamente como aparece na tela, entre aspas)
//   7. Me mande o que ele imprimir
//
// Ele NAO altera nada e NAO envia nada pra lugar nenhum: so escuta o que a
// pagina ja faz. Pra desligar:   espiao.parar()

(() => {
  'use strict';

  if (window.espiao) {
    console.warn('[espiao] ja estava ligado. Rodando espiao.parar() antes de religar.');
    try { window.espiao.parar(); } catch (e) {}
  }

  // Teto de tudo que se guarda. E um console aberto o dia inteiro numa pagina
  // que fala muito com o servidor: sem teto isso vira vazamento de memoria.
  const MAX_REDE = 200;
  const MAX_DOM = 400;
  // Depois de um bipe, o que nascer dentro dessa janela conta como "resposta a
  // ele". Mais que isso ja e outra coisa acontecendo na tela.
  const JANELA_MS = 8000;

  const rede = [];      // {hora, metodo, url, enviado, recebido}
  const domNovo = [];   // {hora, texto, seletor, elemento}
  const bipes = [];     // {hora, codigo}

  const agora = () => Date.now();
  const hhmmss = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour12: false }) +
                        '.' + String(new Date(t).getMilliseconds()).padStart(3, '0');

  // ── caminho CSS ate um elemento ──────────────────────────────────────────
  // Serve pra eu escrever o seletor na extensao depois. Prefere id, senao monta
  // o caminho com as classes que parecem estaveis (sem hash gerado por build).
  function seletorDe(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + el.id;
    const partes = [];
    let n = el;
    let profundidade = 0;
    while (n && n !== document.body && profundidade < 6) {
      let parte = n.tagName ? n.tagName.toLowerCase() : '';
      if (n.id) { partes.unshift('#' + n.id); break; }
      const classes = (n.className && typeof n.className === 'string' ? n.className : '')
        .split(/\s+/)
        .filter(c => c && !/^[a-z]*[-_]?[0-9a-f]{5,}$/i.test(c))  // classe com hash nao serve
        .slice(0, 2);
      if (classes.length) parte += '.' + classes.join('.');
      else if (n.parentElement) {
        const irmaos = [...n.parentElement.children].filter(x => x.tagName === n.tagName);
        if (irmaos.length > 1) parte += `:nth-of-type(${irmaos.indexOf(n) + 1})`;
      }
      partes.unshift(parte);
      n = n.parentElement;
      profundidade++;
    }
    return partes.join(' > ');
  }

  // ── caminho da chave dentro de um JSON ───────────────────────────────────
  // Devolve, por exemplo, "data.task_list[0].task_id" — que e o que eu preciso
  // pra ler o valor certo na extensao, em vez de raspar a tela.
  function caminhosDoValor(obj, alvo, prefixo = '', achados = [], nivel = 0) {
    if (nivel > 12 || achados.length > 20) return achados;
    if (obj === null || obj === undefined) return achados;

    if (typeof obj !== 'object') {
      if (String(obj).trim() === alvo) achados.push({ caminho: prefixo || '(raiz)', valor: obj });
      return achados;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => caminhosDoValor(v, alvo, `${prefixo}[${i}]`, achados, nivel + 1));
      return achados;
    }
    for (const [k, v] of Object.entries(obj)) {
      caminhosDoValor(v, alvo, prefixo ? `${prefixo}.${k}` : k, achados, nivel + 1);
    }
    return achados;
  }

  // Chaves cujo NOME cheira a AT. Serve pro relatorio automatico, quando ainda
  // nao se sabe o valor — mas quem manda e o espiao.achar(), que casa o valor.
  const CHEIRO_DE_AT = /(task|_at\b|\bat_|atid|at_id|assign|cluster|to_?num|tracking_task)/i;

  function chavesSuspeitas(obj, prefixo = '', achados = [], nivel = 0) {
    if (nivel > 8 || achados.length > 40 || !obj || typeof obj !== 'object') return achados;
    if (Array.isArray(obj)) {
      obj.slice(0, 5).forEach((v, i) => chavesSuspeitas(v, `${prefixo}[${i}]`, achados, nivel + 1));
      return achados;
    }
    for (const [k, v] of Object.entries(obj)) {
      const caminho = prefixo ? `${prefixo}.${k}` : k;
      if (CHEIRO_DE_AT.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        achados.push({ caminho, valor: v });
      }
      if (v && typeof v === 'object') chavesSuspeitas(v, caminho, achados, nivel + 1);
    }
    return achados;
  }

  function tentarJson(texto) {
    if (typeof texto !== 'string') return null;
    const t = texto.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function guardar(lista, item, teto) {
    lista.push(item);
    if (lista.length > teto) lista.shift();
  }

  // ── 1. espiao da rede: fetch ─────────────────────────────────────────────
  // A AT quase certamente vem numa resposta de API. Ler daqui e MUITO mais
  // confiavel que raspar a tela: nao quebra quando o SPX muda o layout.
  const fetchOriginal = window.fetch;
  window.fetch = function (...args) {
    const inicio = agora();
    const url = String(args[0] && args[0].url ? args[0].url : args[0] || '');
    const metodo = (args[1] && args[1].method) || (args[0] && args[0].method) || 'GET';
    const enviado = args[1] && args[1].body ? String(args[1].body).slice(0, 2000) : null;

    return fetchOriginal.apply(this, args).then(resposta => {
      // clone() pra ler sem consumir o corpo — sem isso a pagina quebra.
      resposta.clone().text().then(texto => {
        guardar(rede, {
          hora: inicio, metodo, url, enviado,
          recebido: texto.slice(0, 200000),
        }, MAX_REDE);
      }).catch(() => {});
      return resposta;
    });
  };

  // ── 2. espiao da rede: XMLHttpRequest ────────────────────────────────────
  // Sistema antigo costuma usar XHR e nao fetch. Cobrir os dois evita a
  // conclusao errada de "a AT nao vem da rede".
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__espiao = { metodo, url: String(url) };
    return xhrOpen.call(this, metodo, url, ...resto);
  };
  XMLHttpRequest.prototype.send = function (corpo) {
    const marca = this.__espiao || {};
    marca.hora = agora();
    marca.enviado = corpo ? String(corpo).slice(0, 2000) : null;
    this.addEventListener('load', () => {
      let texto = '';
      try { texto = this.responseType === '' || this.responseType === 'text' ? this.responseText : ''; }
      catch (e) {}
      guardar(rede, {
        hora: marca.hora, metodo: marca.metodo, url: marca.url,
        enviado: marca.enviado, recebido: String(texto).slice(0, 200000),
      }, MAX_REDE);
    });
    return xhrSend.call(this, corpo);
  };

  // ── 3. espiao da tela ────────────────────────────────────────────────────
  // Se a AT nao vier da rede (renderizada de um estado que ja estava la), ela
  // vai aparecer aqui: todo texto novo que nasce na tela.
  const observador = new MutationObserver(muts => {
    for (const m of muts) {
      for (const no of m.addedNodes) {
        const texto = (no.textContent || '').trim();
        if (!texto || texto.length > 300) continue;
        guardar(domNovo, {
          hora: agora(), texto,
          seletor: seletorDe(no.nodeType === 1 ? no : no.parentElement),
          elemento: no.nodeType === 1 ? no : no.parentElement,
        }, MAX_DOM);
      }
      if (m.type === 'characterData') {
        const texto = (m.target.textContent || '').trim();
        if (texto) {
          guardar(domNovo, {
            hora: agora(), texto,
            seletor: seletorDe(m.target.parentElement),
            elemento: m.target.parentElement,
          }, MAX_DOM);
        }
      }
    }
  });
  observador.observe(document.body, {
    childList: true, subtree: true, characterData: true,
  });

  // ── 4. marcar o instante do bipe ─────────────────────────────────────────
  // O Enter no campo e o momento zero. Tudo que nascer depois dele, dentro da
  // janela, e candidato a ser a AT daquele pedido.
  function ouvirEnter(e) {
    if (e.key !== 'Enter') return;
    const alvo = e.target;
    if (!alvo || !['INPUT', 'TEXTAREA'].includes(alvo.tagName)) return;
    const codigo = String(alvo.value || '').trim();
    if (!codigo) return;
    guardar(bipes, { hora: agora(), codigo }, 100);
    console.log(`%c[espiao] bipe: ${codigo} — ${hhmmss(agora())}`,
                'color:#2c7be5;font-weight:bold');
  }
  document.addEventListener('keydown', ouvirEnter, true);

  // ── o comando principal ──────────────────────────────────────────────────
  function achar(valor) {
    const alvo = String(valor == null ? '' : valor).trim();
    if (!alvo) {
      console.error('[espiao] use: espiao.achar("a AT como aparece na tela")');
      return;
    }
    console.log(`%c=== DE ONDE VEM "${alvo}" ===`,
                'font-size:14px;font-weight:bold;color:#2c7be5');

    // --- na rede ---
    const naRede = rede.filter(r => r.recebido && r.recebido.includes(alvo));
    if (naRede.length) {
      console.log(`%c[1] ACHEI NA RESPOSTA DA API (${naRede.length}) — este e o caminho bom`,
                  'color:green;font-weight:bold');
      naRede.slice(-3).forEach(r => {
        console.log(`  ${r.metodo} ${r.url}`);
        console.log(`  hora: ${hhmmss(r.hora)}`);
        const json = tentarJson(r.recebido);
        if (json) {
          const caminhos = caminhosDoValor(json, alvo);
          if (caminhos.length) {
            console.log('  %cCAMINHO NO JSON:', 'font-weight:bold',
                        caminhos.map(c => c.caminho).join('  |  '));
          } else {
            console.log('  (esta no corpo, mas nao como valor exato de uma chave — veja o trecho)');
            const i = r.recebido.indexOf(alvo);
            console.log('  trecho:', r.recebido.slice(Math.max(0, i - 200), i + 200));
          }
          console.log('  resposta inteira:', json);
        } else {
          const i = r.recebido.indexOf(alvo);
          console.log('  trecho:', r.recebido.slice(Math.max(0, i - 200), i + 200));
        }
        if (r.enviado) console.log('  o que foi enviado:', r.enviado);
      });
    } else {
      console.log('%c[1] NAO veio em resposta de API que eu tenha visto.',
                  'color:#b8860b');
      console.log('    Pode ser que ela ja estivesse na tela antes do script ligar,');
      console.log('    ou que venha por WebSocket. Veja o item [2].');
    }

    // --- na tela, no que nasceu ---
    const naTela = domNovo.filter(d => d.texto.includes(alvo));
    if (naTela.length) {
      console.log(`%c[2] ACHEI NA TELA (${naTela.length} vezes) — caminho de reserva`,
                  'color:green;font-weight:bold');
      naTela.slice(-5).forEach(d => {
        console.log(`  ${hhmmss(d.hora)}  seletor: ${d.seletor}`);
        console.log('    texto:', d.texto.slice(0, 200));
        console.log('    elemento:', d.elemento);
      });
    } else {
      console.log('%c[2] Nao vi esse texto NASCER na tela enquanto eu escutava.', 'color:#b8860b');
    }

    // --- na tela, onde quer que esteja agora ---
    const atuais = [];
    const caminhar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = caminhar.nextNode()) && atuais.length < 10) {
      if ((no.textContent || '').includes(alvo)) atuais.push(no.parentElement);
    }
    if (atuais.length) {
      console.log(`%c[3] Onde esse texto esta na tela AGORA (${atuais.length})`,
                  'color:#2c7be5;font-weight:bold');
      atuais.forEach(el => console.log('  seletor:', seletorDe(el), el));
    }

    // --- o bipe correspondente ---
    const bipe = [...bipes].reverse().find(b => naRede.some(r => Math.abs(r.hora - b.hora) < JANELA_MS)
                                             || naTela.some(d => Math.abs(d.hora - b.hora) < JANELA_MS));
    if (bipe) {
      console.log(`%c[4] Nasceu logo depois do bipe de ${bipe.codigo} (${hhmmss(bipe.hora)})`,
                  'color:green;font-weight:bold');
    } else if (bipes.length) {
      console.log('[4] Nao consegui casar com nenhum bipe pela hora. Ultimos bipes:',
                  bipes.slice(-3).map(b => `${b.codigo} @ ${hhmmss(b.hora)}`).join(', '));
    }

    console.log('%cMe mande um print deste console inteiro.', 'font-weight:bold');
  }

  // Relatorio do que aconteceu depois do ultimo bipe, sem precisar saber a AT.
  // Serve pra quando a AT nao estiver obvia na tela.
  function ultimoBipe() {
    const bipe = bipes[bipes.length - 1];
    if (!bipe) return console.warn('[espiao] nenhum bipe visto ainda. Bipe um pedido primeiro.');

    console.log(`%c=== O QUE ACONTECEU APOS ${bipe.codigo} (${hhmmss(bipe.hora)}) ===`,
                'font-size:14px;font-weight:bold;color:#2c7be5');

    const chamadas = rede.filter(r => r.hora >= bipe.hora - 500 && r.hora <= bipe.hora + JANELA_MS);
    console.log(`%c${chamadas.length} chamadas de API na janela:`, 'font-weight:bold');
    chamadas.forEach(r => {
      console.log(`  ${r.metodo} ${r.url}  (${hhmmss(r.hora)})`);
      const json = tentarJson(r.recebido);
      if (json) {
        const suspeitas = chavesSuspeitas(json);
        if (suspeitas.length) {
          console.log('    %cchaves com cara de AT:', 'color:green;font-weight:bold');
          suspeitas.slice(0, 12).forEach(s => console.log(`      ${s.caminho} = ${JSON.stringify(s.valor)}`));
        }
        console.log('    resposta:', json);
      }
    });

    const nascidos = domNovo.filter(d => d.hora >= bipe.hora && d.hora <= bipe.hora + JANELA_MS);
    console.log(`%c${nascidos.length} textos novos na tela na janela (os 15 primeiros):`, 'font-weight:bold');
    nascidos.slice(0, 15).forEach(d => console.log(`  "${d.texto.slice(0, 80)}"  <- ${d.seletor}`));

    console.log('%cSe voce ja identificou a AT na tela, rode:  espiao.achar("a AT")',
                'font-weight:bold;color:#e67e22');
  }

  function parar() {
    window.fetch = fetchOriginal;
    XMLHttpRequest.prototype.open = xhrOpen;
    XMLHttpRequest.prototype.send = xhrSend;
    observador.disconnect();
    document.removeEventListener('keydown', ouvirEnter, true);
    delete window.espiao;
    console.log('[espiao] desligado. A pagina voltou ao normal.');
  }

  window.espiao = {
    achar, ultimoBipe, parar,
    rede, domNovo, bipes,
    // atalhos pra quando eu pedir algo especifico
    chamadas: () => rede.map(r => `${r.metodo} ${r.url}`),
    bruto: () => ({ rede, domNovo, bipes }),
  };

  console.log('%c=== ESPIAO DA AT LIGADO ===', 'font-size:14px;font-weight:bold;color:#2c7be5');
  console.log('Escutando: chamadas de API (fetch e XHR) e tudo que nasce na tela.');
  if (window.top !== window.self) {
    console.warn('ATENCAO: isto esta rodando dentro de um IFRAME. Se a tela do cluster estiver');
    console.warn('em outro frame, troque o seletor de contexto do console (o dropdown "top").');
  }
  console.log('%cAGORA: bipe UM pedido normalmente.', 'font-size:13px;font-weight:bold;color:#e67e22');
  console.log('Depois, com a AT que apareceu na tela:');
  console.log('%c  espiao.achar("COLE_A_AT_AQUI")', 'font-family:monospace;font-size:13px;background:#eee');
  console.log('Se nao achar a AT na tela, rode:  espiao.ultimoBipe()');
})();
