// O que a XM - Ativos decide na Anjun, sem tela. Usado pelo ativos.js (a pagina dentro do portal da
// Anjun). Nos testes, carregado pelo Node. O login e o envio ao sistema passam pelo fundo.js (as
// mesmas regras das outras transportadoras).
//
// Modelo: confirmacao_anjun (dado pelo usuario em 23/11/2026):
//   {{1}} nome do cliente  {{2}} quem dispara (a conta do sistema)  {{3}} remetente (a plataforma)  {{4}} pedido (AJ)
// Remetente = a plataforma, pelo "Nome do cliente" da Anjun (ver remetente): temud2d -> Temu...

(() => {
  const TEMPLATE = 'confirmacao_anjun';
  const MAX_CODIGOS = 500;
  // A Anjun barra "operacoes muito frequentes" (em 30/10/2026: a 2 pacotes/s parou no 3o e ficou
  // ~30 min bloqueada; a 1 a cada 3 s passaram 157). Abrir nome e telefone: 1 pedido a cada 3 s.
  const RITMO_OLHO_MS = 3000;
  const BLOQUEIO_MS = 30 * 60 * 1000;

  /** Waybills da Anjun colados (AJ + 12 a 18 digitos), sem repetir; devolve tambem o que nao serviu. */
  function lerCodigos(texto) {
    const vistos = new Set();
    const ignorados = [];
    for (const parte of String(texto || '').split(/[\s,;]+/)) {
      const c = parte.trim().toUpperCase();
      if (!c) continue;
      if (/^AJ\d{12,18}$/.test(c)) vistos.add(c);
      else ignorados.push(parte.trim());
    }
    return { codigos: [...vistos], ignorados };
  }

  function digitosLocais(valor) {
    const semPrefixo = String(valor || '').trim().replace(/^\+\s*55\s*/, '');
    let d = semPrefixo.replace(/\D/g, '');
    if (d.startsWith('55') && (d.length - 2 === 10 || d.length - 2 === 11)) d = d.slice(2);
    return d.slice(0, 11);
  }

  function validarTelefone(valor) {
    const d = digitosLocais(valor);
    if (!d) return { ok: false, erro: 'Sem telefone na Anjun.' };
    if (d.length < 10) return { ok: false, erro: 'Telefone incompleto.' };
    const ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return { ok: false, erro: `DDD inválido (${d.slice(0, 2)}).` };
    if (d.length === 11 && d[2] !== '9') return { ok: false, erro: 'Celular com 9 dígitos precisa começar com 9 depois do DDD.' };
    return { ok: true, e164: `55${d}` };
  }

  /** (49) 9 9999-9999 para mostrar na tela. */
  function telefoneLegivel(e164) {
    const d = String(e164 || '').replace(/^55/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(e164 || '');
  }

  // Marcas conhecidas: escritas do jeito que o cliente reconhece.
  const MARCAS = [
    // clientes da Anjun (confirmado pelo usuario): temud2d = Temu, tiktok logistics = TikTok.
    // szanjun NAO: nem sempre e Shein (o usuario corrigiu em 23/11).
    [/shein/i, 'Shein'], [/temu/i, 'Temu'], [/tik\s*tok/i, 'TikTok'], [/mercado\s*livre|\bmeli\b/i, 'Mercado Livre'],
    [/shopee/i, 'Shopee'], [/aliexpress|cainiao/i, 'AliExpress'], [/\bkwai\b/i, 'Kwai'], [/amazon/i, 'Amazon'],
    [/magalu|magazine\s*luiza/i, 'Magalu'],
  ];
  const marca = (texto) => { const m = MARCAS.find(([re]) => re.test(String(texto || ''))); return m ? m[1] : ''; };

  /**
   * O "Remetente" da mensagem = a plataforma, pelo cliente da Anjun (pedido do usuario em 23/11/2026:
   * "deixar apenas o cliente da anjun"; o nome da loja do comerciante nao vai mais).
   *   temud2d/temuxborder -> Temu, tiktok logistics brazil ltda -> TikTok, shein/sheind2d -> Shein.
   * Cliente que nao diz a plataforma (szanjun, que nem sempre e Shein): vale a plataforma citada no
   * comerciante ("...(SHEIN)...", "Shopee").
   * Sem plataforma nenhuma: vai o nome da loja (coluna Comerciante) do jeito que esta, e sem loja o
   * cliente da Anjun. NUNCA "nao informado" (pedido do usuario em 25/11/2026: "por hipotese alguma").
   */
  const limpo = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();
  function remetente(cliente, comerciante) {
    return marca(cliente) || marca(comerciante) || limpo(comerciante) || limpo(cliente);
  }

  /** O texto aprovado do confirmacao_anjun. */
  function montarTexto({ nome, atendente, remetente, pedido }) {
    return `Olá, ${nome || '___'}! Tudo bem?
Me chamo ${atendente || '___'} e faço parte do time de SAC da Anjun Express.
Gostaria de confirmar se você recebeu seu pedido:
Remetente: ${remetente || '___'}
Pedido: ${pedido || '___'}

Você recebeu o pedido?
Por favor, responda com SIM ou NÃO.`;
  }

  /**
   * Corpo do disparo, igual ao do disparo em massa do sistema: sem prazo e destino "outros" (o
   * servidor so respeita para dev; para os demais o cargo decide). Devolve { erro } ou { corpo }.
   */
  function montarEnvio({ codigo, nome, telefone, remetente, atendente }) {
    const tel = validarTelefone(telefone);
    if (!tel.ok) return { erro: tel.erro };
    if (!nome) return { erro: 'Sem nome na Anjun.' };
    if (!atendente) return { erro: 'Sem o nome de quem dispara (entre de novo no sistema).' };
    // A Meta recusa parametro vazio, e "nao informado" nao vai nunca: sem loja nem cliente, nao dispara.
    const remetenteTexto = limpo(remetente);
    if (!remetenteTexto) return { erro: 'Sem loja e sem cliente na Anjun (remetente vazio).' };
    return {
      corpo: {
        numero: tel.e164, template: TEMPLATE, parametros: [nome, atendente, remetenteTexto, codigo],
        texto: montarTexto({ nome, atendente, remetente: remetenteTexto, pedido: codigo }), nome_cliente: nome, pedido: codigo,
        prazo_horas: null, transportadora: 'anjun', destino: 'outros',
      },
    };
  }

  /** "Operações muito frequentes" (ou parecido): a Anjun bloqueia por ~30 min. */
  function eBloqueio(mensagem) {
    return /frequent|频繁|muitas (requisi|opera)|too many/i.test(String(mensagem || ''));
  }

  /** Quem vê o menu "Ativos" (o servidor barra os outros do mesmo jeito). */
  const ROLES_ATIVOS = ['sac', 'dev', 'admin'];

  const publico = {
    TEMPLATE, MAX_CODIGOS, RITMO_OLHO_MS, BLOQUEIO_MS, ROLES_ATIVOS,
    lerCodigos, digitosLocais, validarTelefone, telefoneLegivel, remetente, montarTexto, montarEnvio, eBloqueio,
  };
  if (typeof self !== 'undefined') self.XMAtivosAnjun = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
