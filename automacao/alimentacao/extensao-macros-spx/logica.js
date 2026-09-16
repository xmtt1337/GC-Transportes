// Regras puras do macro: nada de DOM aqui.
//
// Fica separado porque e a parte que da pra testar no node sem navegador -
// e e justamente onde mora o erro que ninguem ve: baixar o relatorio errado,
// clicar num "15" do mes vizinho, aceitar uma data que o SPX nao entendeu.

(function (raiz) {
  'use strict';

  const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // O relatorio da alimentacao. O painel de tarefas mistura ele com o
  // "Br AT Romaneio V2", que nasce do outro botao e abre igualzinho no Excel -
  // por isso o nome e comparado inteiro, nunca por "contem".
  const NOME_RELATORIO = 'Br Assignment Task';

  // O nome que o SPX da ao export de pedidos pesquisados. E "Return Order"
  // mesmo vindo do botao "Exportar pedidos pesquisados" - nao ha como adivinhar
  // isso, so vendo acontecer.
  //
  // Enquanto nao se sabia, o macro esperava por "qualquer tarefa que nao estava
  // la antes". Com os dois macros rodando juntos, a tarefa nova que apareceu
  // foi a do OUTRO macro, e ele baixou o relatorio errado: dois arquivos
  // identicos, dois macros clicando no mesmo botao Baixar.
  const NOME_PESQUISADOS = 'Return Order';

  const normalizar = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

  // Comparacao de texto de tela: sem acento, sem caixa, sem espaco sobrando.
  // O SPX mistura portugues e ingles na mesma tela e troca traducao sem avisar;
  // comparar cru quebra por um acento.
  const chave = (t) => normalizar(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function partesDaData(d) {
    const p = (n) => String(n).padStart(2, '0');
    return {
      ano: String(d.getFullYear()),
      mes: p(d.getMonth() + 1),
      dia: p(d.getDate()),
      anoNumero: d.getFullYear(),
      mesNumero: d.getMonth() + 1,
      diaNumero: d.getDate(),
    };
  }

  // Ordem de tentativa pra digitar a data. O SPX nao diz qual formato espera e
  // ja apareceu nas duas linguas; digitar e conferir sai mais barato do que
  // fixar um e descobrir no dia que mudou.
  const FORMATOS_DATA = [
    (p) => `${p.ano}-${p.mes}-${p.dia}`,
    (p) => `${p.dia}/${p.mes}/${p.ano}`,
    (p) => `${p.ano}/${p.mes}/${p.dia}`,
    (p) => `${p.mes}/${p.dia}/${p.ano}`,
    (p) => `${p.dia}-${p.mes}-${p.ano}`,
  ];

  // Confere o que ficou no campo depois que o picker aceitou. Em vez de exigir
  // um formato, exige os tres numeros do dia: serve pra "2026-09-15",
  // "15/09/2026" e "15/09/2026 00:00:00" sem ter que adivinhar qual e.
  function dataConfere(valor, p) {
    const numeros = String(valor == null ? '' : valor).match(/\d+/g) || [];
    return numeros.includes(p.ano) && numeros.includes(p.mes) && numeros.includes(p.dia);
  }

  // Onde o dia cai na grade do calendario, contando da primeira celula.
  // O calendario desenha 6 semanas inteiras, entao as pontas sao dias do mes
  // vizinho: no fim de setembro aparece um "01" que e de outubro. Clicar por
  // posicao, e nao por texto, e o que impede pegar o dia errado.
  function indiceNaGrade(ano, mes, dia, primeiroDiaDaSemana) {
    const inicioDaSemana = primeiroDiaDaSemana == null ? 0 : primeiroDiaDaSemana;
    const diaDaSemanaDoPrimeiro = new Date(ano, mes - 1, 1).getDay();
    const deslocamento = (diaDaSemanaDoPrimeiro - inicioDaSemana + 7) % 7;
    return deslocamento + dia - 1;
  }

  // O cabecalho do painel do calendario ("2026 Set", "Sep 2026", "2026-09")
  // e o unico jeito de saber qual dos dois meses na tela e o nosso.
  function mesCombina(textoDoCabecalho, p) {
    const t = chave(textoDoCabecalho);
    if (!t.includes(p.ano)) return false;
    const resto = t.split(p.ano).join(' ');
    const i = p.mesNumero - 1;
    if (resto.includes(MESES_PT[i]) || resto.includes(MESES_EN[i])) return true;
    return new RegExp('(^|\\D)0*' + p.mesNumero + '(\\D|$)').test(resto);
  }

  const EH_MOMENTO = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

  // "2026-09-15 12:07:50" -> numero comparavel.
  function momentoDaTarefa(texto) {
    const m = String(texto == null ? '' : texto)
      .match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  const chaveTarefa = (t) => `${normalizar(t && t.nome)}|${normalizar(t && t.quando)}`;

  // Qual linha do painel e o relatorio que ACABAMOS de pedir.
  //
  // So vale a que tem o nome certo E nao existia antes do clique em Exportar.
  // Sem a segunda condicao o macro baixaria o relatorio da rodada anterior
  // enquanto o novo ainda esta em 0% - e ninguem perceberia, porque o arquivo
  // abre normalmente e so os numeros e que estao velhos.
  // nomeAlvo null: serve qualquer tarefa nova. E o caso do relatorio cujo nome
  // ainda nao se conhece - continua valendo a regra que importa (nao estava la
  // antes do clique), so sem a segunda peneira.
  function escolherTarefaNova(antes, agora, nomeAlvo) {
    const nome = nomeAlvo === null ? null : normalizar(nomeAlvo || NOME_RELATORIO);
    const vistas = new Set((antes || []).map(chaveTarefa));
    const novas = (agora || []).filter(
      (t) => (nome === null || normalizar(t.nome) === nome) && !vistas.has(chaveTarefa(t)));
    if (!novas.length) return null;
    return novas
      .slice()
      .sort((a, b) => (momentoDaTarefa(b.quando) || 0) - (momentoDaTarefa(a.quando) || 0))[0];
  }

  // ── agenda ─────────────────────────────────────────────────────────────
  // "8, 12 e 16h" -> [8, 12, 16]. Le os numeros do que a pessoa escreveu em
  // vez de exigir um formato: ninguem lembra de formato, e recusar o que foi
  // digitado do "jeito errado" e como nao ter o campo.
  function lerHorarios(texto) {
    const numeros = String(texto == null ? '' : texto).match(/\d{1,2}/g) || [];
    const horas = numeros.map(Number).filter((h) => h >= 0 && h <= 23);
    return [...new Set(horas)].sort((a, b) => a - b);
  }

  // Quantos minutos faltam pra proxima hora cheia da lista, a partir de um
  // relogio dado (minutos desde a meia-noite).
  //
  // Conta em minutos de proposito, em vez de montar uma data no fuso de
  // Brasilia: montar data em outro fuso e onde isso costuma errar por uma
  // hora, e um agendamento que dispara uma hora cedo ninguem percebe.
  function minutosAteProximaHora(horas, minutosAgora) {
    const limpas = lerHorarios(horas.join ? horas.join(',') : horas);
    if (!limpas.length) return null;
    let menor = Infinity;
    for (const h of limpas) {
      let falta = h * 60 - minutosAgora;
      // O "ja passou" tem folga de meio minuto: sem ela, o disparo das 8:00
      // remarcaria pra daqui a zero minuto e rodaria duas vezes seguidas.
      if (falta <= 0.5) falta += 24 * 60;
      menor = Math.min(menor, falta);
    }
    return menor;
  }

  const logica = {
    NOME_RELATORIO,
    NOME_PESQUISADOS,
    lerHorarios,
    minutosAteProximaHora,
    MESES_PT,
    MESES_EN,
    FORMATOS_DATA,
    EH_MOMENTO,
    normalizar,
    chave,
    partesDaData,
    dataConfere,
    indiceNaGrade,
    mesCombina,
    momentoDaTarefa,
    chaveTarefa,
    escolherTarefaNova,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = logica;
  } else {
    raiz.XMMacro = raiz.XMMacro || {};
    raiz.XMMacro.logica = logica;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
