// Regras da XM - Baixas Anjun, sem tela e sem rede (testadas em testes/regras.test.js).
//
// - codigos: le a lista colada (um AJ por linha, ou separados por espaco).
// - etiquetas: acha, no PDF de etiquetas, a pagina da etiqueta de cada AJ.
// - documento: so formata o que a pessoa digitou. A extensao nunca inventa CPF.
// - tracos: transforma o texto da assinatura (o nome de quem esta dando a baixa) em
//   riscos para "deslizar" no quadro de assinatura da Anjun.

(() => {
  const CODIGO = /AJ\d{15}/g;

  /** Codigos AJ do texto colado, sem repetir, na ordem em que aparecem. */
  function lerCodigos(texto) {
    const achados = String(texto || '').toUpperCase().match(CODIGO) || [];
    return [...new Set(achados)];
  }

  /**
   * paginas: [{ numero, texto }]. Devolve { AJ...: numero da pagina }.
   * O PDF traz, para cada pedido, a etiqueta (DANFE simplificado) e a lista de mercadorias;
   * as duas citam o AJ. Vale a etiqueta; sem ela, a primeira pagina que citar o codigo.
   */
  function mapearEtiquetas(paginas) {
    const etiqueta = {};
    const qualquer = {};
    for (const { numero, texto } of paginas) {
      const ehEtiqueta = /ETIQUETA|DESTINAT/i.test(texto || '');
      for (const codigo of lerCodigos(texto)) {
        if (!(codigo in qualquer)) qualquer[codigo] = numero;
        if (ehEtiqueta && !(codigo in etiqueta)) etiqueta[codigo] = numero;
      }
    }
    return { ...qualquer, ...etiqueta };
  }

  /** '00000000000' ou '000.000.000-00' -> '000.000.000-00'. Fora de 11 digitos: ''. */
  function formatarCpf(valor) {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length !== 11) return '';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  /**
   * Riscos horizontais que cobrem o desenho do texto.
   * alfa: opacidade de cada pixel (largura x altura, linha a linha), como o canal A de um
   * ImageData. A cada `passo` linhas, cada trecho opaco vira um risco da esquerda para a
   * direita, com pontos a cada `salto` px (o quadro da Anjun desenha seguindo o mouse).
   */
  function tracosDoTexto(alfa, largura, altura, { passo = 3, salto = 6, limiar = 100 } = {}) {
    const tracos = [];
    for (let y = 0; y < altura; y += passo) {
      let inicio = -1;
      for (let x = 0; x <= largura; x += 1) {
        const cheio = x < largura && alfa[y * largura + x] >= limiar;
        if (cheio && inicio < 0) inicio = x;
        if (!cheio && inicio >= 0) {
          const fim = x - 1;
          const pontos = [];
          for (let px = inicio; px < fim; px += salto) pontos.push({ x: px, y });
          pontos.push({ x: fim, y });
          tracos.push(pontos);
          inicio = -1;
        }
      }
    }
    return tracos;
  }

  /** Texto curto de cada situacao, para a lista do painel e o CSV. */
  const SITUACOES = {
    pendente: 'Na fila',
    sem_etiqueta: 'Sem etiqueta no PDF',
    rodando: 'Dando baixa...',
    ok: 'Baixa feita',
    erro: 'Erro',
  };

  /** Linhas do CSV de resultado (separador ;, que o Excel em portugues abre direto). */
  function montarCsv(itens) {
    const aspas = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhas = [['Codigo', 'Situacao', 'Motivo', 'Hora'].map(aspas).join(';')];
    for (const i of itens) {
      linhas.push([i.codigo, SITUACOES[i.situacao] || i.situacao, i.motivo || '', i.hora || ''].map(aspas).join(';'));
    }
    return linhas.join('\r\n');
  }

  const api = { lerCodigos, mapearEtiquetas, formatarCpf, tracosDoTexto, montarCsv, SITUACOES };
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.XMBaixasRegras = api;
})();
