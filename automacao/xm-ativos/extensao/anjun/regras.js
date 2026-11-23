// O que a XM - Ativos decide na Anjun, sem tela. Usado pelo ativos.js (a pagina dentro do portal da
// Anjun). Nos testes, carregado pelo Node. O login e o envio ao sistema passam pelo fundo.js (as
// mesmas regras das outras transportadoras).
//
// Modelo: confirmacao_anjun (dado pelo usuario em 23/11/2026):
//   {{1}} nome do cliente  {{2}} quem dispara (a conta do sistema)  {{3}} remetente (a loja)  {{4}} pedido (AJ)
// Remetente = o nome unico da loja, tirado do "Nome do comerciante" da Anjun (ver lojaUnica): o
// "Nome do cliente" deles e um codigo interno (temud2d, sheind2d, szanjun...) e nao serve.

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
    // clientes da Anjun (confirmado pelo usuario): szanjun = Shein, temud2d = Temu, tiktok logistics = TikTok
    [/shein|szanjun/i, 'Shein'], [/temu/i, 'Temu'], [/tik\s*tok/i, 'TikTok'], [/mercado\s*livre|\bmeli\b/i, 'Mercado Livre'],
    [/shopee/i, 'Shopee'], [/aliexpress|cainiao/i, 'AliExpress'], [/\bkwai\b/i, 'Kwai'], [/amazon/i, 'Amazon'],
    [/magalu|magazine\s*luiza/i, 'Magalu'],
  ];
  const marca = (texto) => { const m = MARCAS.find(([re]) => re.test(String(texto || ''))); return m ? m[1] : ''; };

  // Razao social no fim do nome: "PTE.LTD.", "LTDA", "EIRELI", "S/A", "-INTERNACIONAL"...
  // (pelo menos um separador antes: "Home" nao perde o "me" do fim)
  const SUFIXO = /[\s.,\-–]+(?:pte\.?\s*ltd|ltda|ltd|limited|eireli|s\s*\/\s*a|s\.a|inc|corp|co|me|epp|internacional|international)\.?$/i;
  const temRazaoSocial = (texto) => /\b(?:pte|ltda|ltd|limited|eireli|inc|corp)\b|s\s*\/\s*a\b/i.test(String(texto || ''));

  const ilegivel = (texto) => /[぀-ヿ㐀-鿿가-힯＀-￯]/.test(texto) || /\d{4,}/.test(texto);

  function semSufixos(texto) {
    let t = String(texto || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 6 && SUFIXO.test(t); i += 1) t = t.replace(SUFIXO, '').trim();
    return t.replace(/^[\s.,\-–]+|[\s.,\-–]+$/g, '');
  }

  /**
   * O nome unico da loja para o "Remetente" da mensagem.
   * - Do "Nome do comerciante" da Anjun (o "Nome do cliente" deles e codigo interno: temud2d, szanjun).
   * - Razao social com a marca entre parenteses vira so a marca:
   *   "MERCURY SHINE PTE.LTD.(SHEIN)-INTERNACIONAL" -> "Shein".
   * - Sem os sufixos de razao social no fim ("LOJA X LTDA" -> "LOJA X").
   * - Sem comerciante: a marca que der para reconhecer no cliente (temud2d -> Temu); senao, vazio.
   */
  function lojaUnica(comerciante, cliente) {
    const c = String(comerciante || '').replace(/\s+/g, ' ').trim();
    if (c) {
      const par = c.match(/\(([^)]+)\)/);
      if (par) {
        const fora = c.replace(par[0], ' ');
        if (marca(par[1])) return marca(par[1]);
        if (temRazaoSocial(fora)) return semSufixos(par[1]);
      }
      const limpo = semSufixos(c.replace(/\([^)]*\)/g, ' '));
      // Nome em chines/japones/coreano ou com cara de codigo ("J741829'shop"): o cliente nao
      // reconhece; vale a marca do cliente da Anjun, se houver.
      if (ilegivel(limpo)) return marca(cliente);
      if (limpo) return marca(limpo) && limpo.length <= marca(limpo).length + 2 ? marca(limpo) : limpo;
    }
    return marca(cliente);
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
    // A Meta recusa parametro vazio.
    const remetenteTexto = String(remetente || '').trim() || 'não informado';
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
    lerCodigos, digitosLocais, validarTelefone, telefoneLegivel, lojaUnica, montarTexto, montarEnvio, eBloqueio,
  };
  if (typeof self !== 'undefined') self.XMAtivosAnjun = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
