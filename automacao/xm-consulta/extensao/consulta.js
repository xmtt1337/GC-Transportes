// O que o XM Consulta decide, sem tela. pagina.js so desenha e liga os botoes.
//
// Transportadora nova: ativa=true e padrao aqui, um script dela (como anjun.js)
// e os matches/host_permissions no manifest.
//
// O CSV tem dado pessoal de cliente: nada aqui escreve nome ou telefone em log.

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // Atras de verificarNaoEntregador: entregador entra na conta mas nao passa daqui.
  // Nao toca no banco, para o login nao esperar.
  const ROTA_ACESSO = '/macros/acesso';
  // 1 pacote a cada 3s foi o ritmo que passou 157 de uma vez. A 2 por segundo a Anjun
  // barrou no 4o pacote, com 30 minutos de castigo (30/10/2026). Nao acelerar sem testar.
  const INTERVALO_MS = 3000;
  const ESPERA_ABA_MS = 20000;
  // Consulta mais recente ha menos que isso: outra aba rodando, ou reinicio em cima do anterior.
  const FOLGA_ENTRE_RODADAS_MS = 10000;
  const BLOQUEIO_PADRAO_MS = 30 * 60 * 1000;
  const MARGEM_BLOQUEIO_MS = 60 * 1000;
  // Pedido a pedido, a pedido do usuario. Sao 3 campos por pedido, cerca de 2 chamadas por
  // segundo: o ritmo que a Anjun barrou. Se o SPX recusar, voltar a subir este numero.
  const INTERVALO_SHOPEE_MS = 1500;
  const COLUNAS = ['waybill', 'status', 'nome', 'telefone'];
  const COLUNAS_SHOPEE = ['waybill', 'status', 'nome', 'telefone', 'remetente'];
  const PASTA_CSV = 'XM Consultas de telefone';

  const TRANSPORTADORAS = [
    {
      chave: 'anjun',
      nome: 'Anjun',
      ativa: true,
      padrao: /^AJ\d{10,}$/i,
      abas: 'https://newsupplier.anjunexpress.com/*',
      url: 'https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery',
      intervaloMs: INTERVALO_MS,
      colunas: COLUNAS,
    },
    {
      chave: 'shopee',
      nome: 'Shopee',
      ativa: true,
      padrao: /^BR[0-9A-Z]{10,16}$/i,
      abas: 'https://spx.shopee.com.br/*',
      url: 'https://spx.shopee.com.br/#/orderTracking',
      intervaloMs: INTERVALO_SHOPEE_MS,
      colunas: COLUNAS_SHOPEE,
    },
    { chave: 'imile', nome: 'iMile', ativa: false },
  ];

  class ErroDeConta extends Error {}

  // Mesmo acesso do XM Vigia: canal 'vigia', que so abre as rotas /macros/ e nao
  // derruba a sessao do site.
  async function entrar(usuario, senha, buscar = fetch) {
    let corpo;
    try {
      const r = await buscar(`${BACKEND}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: usuario, password: senha, canal: 'vigia' }),
      });
      corpo = await r.json();
    } catch {
      throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
    }
    if (corpo.inativo) throw new ErroDeConta('Esse usuário está inativo.');
    if (!corpo.success) throw new ErroDeConta('Usuário ou senha não confere.');
    if (corpo.require_password_change) throw new ErroDeConta('A senha é temporária. Entre no site e troque.');
    if (!corpo.token) throw new Error('O login passou, mas não veio token.');

    await conferir(corpo.token, buscar);
    return { token: corpo.token, nome: corpo.name || corpo.username || usuario };
  }

  // O token ainda abre e a conta tem acesso? Roda antes de cada consulta.
  async function conferir(token, buscar = fetch) {
    let r;
    try {
      r = await buscar(`${BACKEND}${ROTA_ACESSO}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
    }
    if (r.status === 401 || r.status === 403) {
      throw new ErroDeConta('Sessão vencida ou conta sem acesso. Entre de novo.');
    }
    if (!r.ok) throw new Error(`O sistema respondeu ${r.status}.`);
  }

  function extrairCodigos(texto, padrao) {
    const codigos = [];
    const vistos = new Set();
    let ignorados = 0;
    for (const pedaco of String(texto || '').split(/[\s,;]+/)) {
      if (!pedaco) continue;
      const codigo = pedaco.toUpperCase();
      if (!padrao.test(codigo)) ignorados += 1;
      else if (!vistos.has(codigo)) {
        vistos.add(codigo);
        codigos.push(codigo);
      }
    }
    return { codigos, ignorados };
  }

  // Com DDI e espacos: so numero, com 13 digitos, o Excel mostra 5,5E+12 e perde o telefone
  // ao salvar. Fora do padrao, sai como veio.
  function formatarTelefone(telefone) {
    const bruto = String(telefone || '');
    const d = bruto.replace(/\D/g, '');
    const local = (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
    if (local.length !== 10 && local.length !== 11) return bruto;
    return `55 ${local.slice(0, 2)} ${local.slice(2)}`;
  }

  const telefoneValido = (telefone) => /^55 \d{2} \d{8,9}$/.test(String(telefone || ''));

  const porcentagem = (feitos, total) => (total ? Math.floor((feitos * 100) / total) : 0);

  function textoTempo(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
  }

  // Nome vem de fora: "=..." viraria formula ao abrir no Excel.
  function tempoDeBloqueio(erro) {
    const texto = String(erro || '');
    if (!/muito frequentes|frequent|too many|频繁/i.test(texto)) return null;
    const minutos = texto.match(/(\d+)\s*minuto/i);
    const segundos = texto.match(/(\d+)\s*segundo/i);
    if (!minutos && !segundos) return BLOQUEIO_PADRAO_MS + MARGEM_BLOQUEIO_MS;
    return ((Number(minutos?.[1] || 0) * 60) + Number(segundos?.[1] || 0)) * 1000 + MARGEM_BLOQUEIO_MS;
  }

  // Tentar durante o bloqueio so arrisca piorar, e duas abas juntas dobrariam o ritmo.
  function motivoParaNaoIniciar({ agora, bloqueadoAte, ultimaConsulta }) {
    if (bloqueadoAte && agora < bloqueadoAte) {
      const hora = new Date(bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `A transportadora bloqueou por excesso de consultas. Tente depois das ${hora} (falta ${textoTempo(bloqueadoAte - agora)}).`;
    }
    if (ultimaConsulta && agora - ultimaConsulta < FOLGA_ENTRE_RODADAS_MS) {
      return 'Teve consulta há poucos segundos, nesta ou em outra aba. Aguarde 10 segundos e confira se nenhuma outra está rodando.';
    }
    return null;
  }

  function celula(valor) {
    const t = String(valor ?? '');
    const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t;
    return `"${seguro.replace(/"/g, '""')}"`;
  }

  function montarCsv(linhas, colunas = COLUNAS) {
    const corpo = linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'));
    return `﻿${[colunas.join(';'), ...corpo].join('\r\n')}\r\n`;
  }

  // A extensao abre no site em que o menu esta, para nao consultar a transportadora errada.
  function indiceDoSite(origem) {
    const i = TRANSPORTADORAS.findIndex((t) => t.abas && t.abas.startsWith(`${origem}/`));
    return Math.max(0, i);
  }

  function nomeArquivo(chave, agora = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    const dia = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
    const hora = `${p(agora.getHours())}-${p(agora.getMinutes())}-${p(agora.getSeconds())}`;
    return `${chave}-contatos-${dia}_${hora}.csv`;
  }

  function criarAbas({ tabs, esperar, agora = Date.now }) {
    async function perguntar(id, pedido) {
      try {
        return await tabs.sendMessage(id, pedido);
      } catch {
        return null; // aba sem o content script: aberta antes de instalar a extensao
      }
    }

    async function abaPronta(t) {
      for (const aba of await tabs.query({ url: t.abas })) {
        const status = await perguntar(aba.id, { tipo: 'status' });
        if (status && status.pronto) return aba.id;
      }
      return null;
    }

    return {
      async preparar(t) {
        let id = await abaPronta(t);
        if (id === null) {
          const abertas = await tabs.query({ url: t.abas });
          if (!abertas.length) await tabs.create({ url: t.url, active: false });
          const limite = agora() + ESPERA_ABA_MS;
          while (id === null && agora() < limite) {
            await esperar(500);
            id = await abaPronta(t);
          }
        }
        if (id === null) {
          throw new Error(`A aba da ${t.nome} não está pronta. Entre no site, atualize com F5, clique em Buscar e tente de novo.`);
        }
        // Chrome descarta aba parada para liberar memoria, e levaria a sessao junto.
        await tabs.update(id, { autoDiscardable: false }).catch(() => {});
      },

      async consultar(t, codigo) {
        const id = await abaPronta(t);
        if (id === null) return { ok: false, erro: `A aba da ${t.nome} fechou ou perdeu a sessão.` };
        return (await perguntar(id, { tipo: 'consultar', codigo })) || { ok: false, erro: 'A aba não respondeu.' };
      },
    };
  }

  // Um codigo de cada vez, parando no primeiro erro: erro aqui costuma ser
  // bloqueio ou sessao vencida, e insistir so piora. O que veio fica, e o que
  // faltou volta em pendentes.
  async function executar({ codigos, pedir, aoAvancar, deveParar, dormir, agora = Date.now, intervalo = INTERVALO_MS }) {
    const res = { linhas: [], pendentes: [], erro: null, parado: false };
    for (let i = 0; i < codigos.length; i++) {
      const codigo = codigos[i];
      if (deveParar()) {
        res.parado = true;
        res.pendentes = codigos.slice(i);
        break;
      }
      const inicio = agora();
      let r;
      try {
        r = await pedir(codigo);
      } catch (e) {
        r = { ok: false, erro: e.message };
      }
      if (!r.ok) {
        res.erro = `Parou em ${codigo}: ${r.erro || 'a consulta falhou'}`;
        res.pendentes = codigos.slice(i);
        break;
      }
      const d = r.dados || {};
      res.linhas.push({
        waybill: codigo,
        status: d.status || '',
        nome: d.nome || '',
        telefone: formatarTelefone(d.telefone),
        remetente: d.remetente || '',
      });
      aoAvancar(i + 1, codigos.length);
      if (i < codigos.length - 1) await dormir(Math.max(0, intervalo - (agora() - inicio)));
    }
    return res;
  }

  const publico = {
    TRANSPORTADORAS, COLUNAS, PASTA_CSV, ErroDeConta, entrar, conferir, extrairCodigos, formatarTelefone, telefoneValido,
    porcentagem, textoTempo, tempoDeBloqueio, motivoParaNaoIniciar, montarCsv, indiceDoSite, nomeArquivo, criarAbas, executar,
  };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMConsulta = publico;
})();
