/**
 * Setup.gs
 * Criação e configuração automática da planilha.
 *
 * Execute setupSistema() uma única vez (ou sempre que quiser reaplicar a
 * formatação). A função é idempotente: nunca apaga dados existentes.
 */

/**
 * Ponto de entrada da instalação.
 * @return {string} Resumo do que foi feito.
 */
function setupSistema() {
  const planilha = getPlanilha_();

  try {
    planilha.setSpreadsheetTimeZone(APP.TIMEZONE);
    planilha.setSpreadsheetLocale(APP.LOCALE);
  } catch (err) {
    logErro_('setupSistema (locale)', err);
  }

  const criadas = [];
  configurarAbaConfig_(planilha, criadas);
  configurarAbaEntregadores_(planilha, criadas);
  configurarAbaExtravios_(planilha, criadas);
  configurarAbaHistorico_(planilha, criadas);

  ordenarAbas_(planilha);
  removerAbaPadraoVazia_(planilha);
  limparCaches_();

  const resumo = criadas.length
    ? 'Sistema configurado. Abas criadas: ' + criadas.join(', ') + '.'
    : 'Sistema configurado. Todas as abas já existiam — formatação reaplicada.';

  console.log(resumo);
  return resumo;
}

/* ------------------------------------------------------------------ */
/* Abas                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} planilha
 * @param {string} nome
 * @param {string[]} criadas
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function obterOuCriarAba_(planilha, nome, criadas) {
  let aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
    criadas.push(nome);
  }
  return aba;
}

/**
 * Escreve o cabeçalho e aplica o visual padrão.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {string[]} cabecalho
 */
function aplicarCabecalho_(aba, cabecalho) {
  const faixa = aba.getRange(1, 1, 1, cabecalho.length);
  faixa.setValues([cabecalho]);
  faixa.setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground('#0F172A')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  aba.setRowHeight(1, 34);
  aba.setFrozenRows(1);
}

/** Configura a aba CONFIG. */
function configurarAbaConfig_(planilha, criadas) {
  const aba = obterOuCriarAba_(planilha, ABAS.CONFIG, criadas);
  aplicarCabecalho_(aba, CABECALHOS.CONFIG);

  preencherListaSeVazia_(aba, CONFIG_COL.STATUS, PADROES.STATUS);
  preencherListaSeVazia_(aba, CONFIG_COL.TRANSPORTADORAS, PADROES.TRANSPORTADORAS);
  preencherListaSeVazia_(aba, CONFIG_COL.CAUSAS, PADROES.CAUSAS);

  // Parâmetros (colunas E/F) — só grava os que ainda não existem.
  const ultimaLinha = aba.getLastRow();
  const existentes = {};
  if (ultimaLinha >= 2) {
    const atuais = aba.getRange(2, CONFIG_COL.PARAMETRO, ultimaLinha - 1, 1).getValues();
    for (let i = 0; i < atuais.length; i++) {
      const chave = texto_(atuais[i][0]).toUpperCase();
      if (chave) existentes[chave] = true;
    }
  }

  const faltando = PADROES.PARAMETROS.filter(function (par) { return !existentes[par[0]]; });
  if (faltando.length) {
    let destino = 2;
    if (ultimaLinha >= 2) {
      const atuais = aba.getRange(2, CONFIG_COL.PARAMETRO, ultimaLinha - 1, 1).getValues();
      for (let i = 0; i < atuais.length; i++) {
        if (texto_(atuais[i][0])) destino = i + 3;
      }
    }
    garantirLinhas_(aba, destino + faltando.length);
    aba.getRange(destino, CONFIG_COL.PARAMETRO, faltando.length, 2).setValues(faltando);
  }

  aba.getRange(1, 4).setBackground('#0F172A');
  aba.setColumnWidth(1, 150);
  aba.setColumnWidth(2, 170);
  aba.setColumnWidth(3, 240);
  aba.setColumnWidth(4, 30);
  aba.setColumnWidth(5, 220);
  aba.setColumnWidth(6, 120);

  const nota = 'Edite estas listas para mudar as opções do sistema.\n' +
    'STATUS: valores permitidos no campo Status.\n' +
    'TRANSPORTADORAS: opções do dropdown de transportadora.\n' +
    'CAUSAS FREQUENTES: sugestões rápidas no formulário.\n' +
    'PARÂMETROS: ITENS_POR_PAGINA, EXIGIR_DATA_DESCONTO (SIM/NÃO) e VALOR_MAXIMO.\n' +
    'As alterações aparecem no sistema em até 1 minuto.';
  aba.getRange(1, 1).setNote(nota);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {number} coluna
 * @param {string[]} valores
 */
function preencherListaSeVazia_(aba, coluna, valores) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha >= 2) {
    const atuais = aba.getRange(2, coluna, ultimaLinha - 1, 1).getValues();
    for (let i = 0; i < atuais.length; i++) {
      if (texto_(atuais[i][0])) return; // já tem conteúdo: não mexe
    }
  }
  garantirLinhas_(aba, valores.length + 1);
  aba.getRange(2, coluna, valores.length, 1)
    .setValues(valores.map(function (v) { return [v]; }));
}

/** Configura a aba ENTREGADORES. */
function configurarAbaEntregadores_(planilha, criadas) {
  const aba = obterOuCriarAba_(planilha, ABAS.ENTREGADORES, criadas);
  aplicarCabecalho_(aba, CABECALHOS.ENTREGADORES);

  aba.setColumnWidth(1, 260);
  aba.setColumnWidth(2, 90);
  aba.setColumnWidth(3, 320);

  const validacaoAtivo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NÃO'], true)
    .setAllowInvalid(false)
    .setHelpText('Use NÃO para esconder o nome do dropdown sem apagar o histórico.')
    .build();
  aba.getRange(2, 2, Math.max(aba.getMaxRows() - 1, 1), 1).setDataValidation(validacaoAtivo);

  aba.getRange(1, 1).setNote(
    'Digite um nome por linha na coluna A.\n' +
    'O dropdown de RESPONSÁVEL do sistema lê esta coluna automaticamente.\n' +
    'Coluna ATIVO em branco ou SIM = aparece no dropdown; NÃO = fica oculto.'
  );

  aplicarFiltro_(aba, TOTAL_COLUNAS.ENTREGADORES);
}

/** Configura a aba EXTRAVIOS (a principal). */
function configurarAbaExtravios_(planilha, criadas) {
  const aba = obterOuCriarAba_(planilha, ABAS.EXTRAVIOS, criadas);
  aplicarCabecalho_(aba, CABECALHOS.EXTRAVIOS);

  const linhas = Math.max(aba.getMaxRows() - 1, 1);

  aba.getRange(2, COL.ID, linhas, 1).setNumberFormat('0').setHorizontalAlignment('center');
  aba.getRange(2, COL.DATA, linhas, 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  aba.getRange(2, COL.HORA, linhas, 1).setNumberFormat('@').setHorizontalAlignment('center');
  aba.getRange(2, COL.CODIGO, linhas, 1).setNumberFormat('@');
  aba.getRange(2, COL.VALOR, linhas, 1).setNumberFormat('R$ #,##0.00');
  aba.getRange(2, COL.DATA_DESCONTO, linhas, 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  aba.getRange(2, COL.DATA_REGISTRO, linhas, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  aba.getRange(2, COL.ENDERECO, linhas, 1).setWrap(false);
  aba.getRange(2, COL.CAUSA, linhas, 1).setWrap(false);

  const larguras = [70, 130, 140, 100, 70, 170, 110, 170, 300, 260, 120, 160, 220];
  for (let i = 0; i < larguras.length; i++) {
    aba.setColumnWidth(i + 1, larguras[i]);
  }

  aplicarValidacoesExtravios_(planilha, aba, linhas);
  aplicarCoresDeStatus_(aba);
  aplicarFiltro_(aba, TOTAL_COLUNAS.EXTRAVIOS);
  protegerComAviso_(aba, 'Use o sistema de extravios para incluir registros — evite digitar direto na planilha.');

  aba.getRange(1, COL.CODIGO).setNote('Cada código só pode aparecer uma vez, exceto quando o status é "' + STATUS.MULTA + '".');
}

/**
 * Dropdowns na própria planilha (rede de segurança para edições manuais).
 */
function aplicarValidacoesExtravios_(planilha, aba, linhas) {
  const abaConfig = planilha.getSheetByName(ABAS.CONFIG);
  const abaEntregadores = planilha.getSheetByName(ABAS.ENTREGADORES);
  if (!abaConfig || !abaEntregadores) return;

  const validacaoStatus = SpreadsheetApp.newDataValidation()
    .requireValueInRange(abaConfig.getRange(2, CONFIG_COL.STATUS, 500, 1), true)
    .setAllowInvalid(false)
    .build();
  aba.getRange(2, COL.STATUS, linhas, 1).setDataValidation(validacaoStatus);

  const validacaoTransportadora = SpreadsheetApp.newDataValidation()
    .requireValueInRange(abaConfig.getRange(2, CONFIG_COL.TRANSPORTADORAS, 500, 1), true)
    .setAllowInvalid(false)
    .build();
  aba.getRange(2, COL.TRANSPORTADORA, linhas, 1).setDataValidation(validacaoTransportadora);

  const validacaoResponsavel = SpreadsheetApp.newDataValidation()
    .requireValueInRange(abaEntregadores.getRange(2, 1, 2000, 1), true)
    .setAllowInvalid(true)
    .build();
  aba.getRange(2, COL.RESPONSAVEL, linhas, 1).setDataValidation(validacaoResponsavel);
}

/** Pinta a coluna STATUS de acordo com o valor. */
function aplicarCoresDeStatus_(aba) {
  const faixa = aba.getRange(2, COL.STATUS, Math.max(aba.getMaxRows() - 1, 1), 1);
  const regras = [];

  Object.keys(CORES_STATUS).forEach(function (status) {
    regras.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status)
        .setBackground(CORES_STATUS[status])
        .setFontColor('#FFFFFF')
        .setRanges([faixa])
        .build()
    );
  });

  aba.setConditionalFormatRules(regras);
}

/** Configura a aba HISTORICO. */
function configurarAbaHistorico_(planilha, criadas) {
  const aba = obterOuCriarAba_(planilha, ABAS.HISTORICO, criadas);
  aplicarCabecalho_(aba, CABECALHOS.HISTORICO);

  const linhas = Math.max(aba.getMaxRows() - 1, 1);
  aba.getRange(2, COL_HIST.ID_EXTRAVIO, linhas, 1).setNumberFormat('0').setHorizontalAlignment('center');
  aba.getRange(2, COL_HIST.DATA_HORA, linhas, 1).setNumberFormat('dd/MM/yyyy HH:mm');

  const larguras = [100, 150, 230, 170, 140, 140, 340];
  for (let i = 0; i < larguras.length; i++) {
    aba.setColumnWidth(i + 1, larguras[i]);
  }

  aplicarFiltro_(aba, TOTAL_COLUNAS.HISTORICO);
  protegerComAviso_(aba, 'Histórico gerado automaticamente pelo sistema. Não edite manualmente.');
}

/* ------------------------------------------------------------------ */
/* Auxiliares de formatação                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {number} colunas
 */
function aplicarFiltro_(aba, colunas) {
  try {
    const filtroAtual = aba.getFilter();
    if (filtroAtual) filtroAtual.remove();
    aba.getRange(1, 1, aba.getMaxRows(), colunas).createFilter();
  } catch (err) {
    logErro_('aplicarFiltro_ (' + aba.getName() + ')', err);
  }
}

/**
 * Protege a aba apenas com aviso: o script continua escrevendo normalmente,
 * mas quem editar à mão recebe um alerta.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {string} descricao
 */
function protegerComAviso_(aba, descricao) {
  try {
    const protecoes = aba.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (let i = 0; i < protecoes.length; i++) {
      if (protecoes[i].getDescription() === descricao) return;
    }
    aba.protect().setDescription(descricao).setWarningOnly(true);
  } catch (err) {
    logErro_('protegerComAviso_ (' + aba.getName() + ')', err);
  }
}

/** Deixa as abas na ordem lógica de uso. */
function ordenarAbas_(planilha) {
  const ordem = [ABAS.EXTRAVIOS, ABAS.HISTORICO, ABAS.ENTREGADORES, ABAS.CONFIG];
  for (let i = 0; i < ordem.length; i++) {
    const aba = planilha.getSheetByName(ordem[i]);
    if (!aba) continue;
    planilha.setActiveSheet(aba);
    planilha.moveActiveSheet(i + 1);
  }
  const principal = planilha.getSheetByName(ABAS.EXTRAVIOS);
  if (principal) planilha.setActiveSheet(principal);
}

/** Remove a aba "Página1"/"Sheet1" criada junto com a planilha, se estiver vazia. */
function removerAbaPadraoVazia_(planilha) {
  const nossas = [ABAS.EXTRAVIOS, ABAS.HISTORICO, ABAS.ENTREGADORES, ABAS.CONFIG];
  const abas = planilha.getSheets();
  if (abas.length <= nossas.length) return;

  for (let i = 0; i < abas.length; i++) {
    const aba = abas[i];
    if (nossas.indexOf(aba.getName()) >= 0) continue;
    const padrao = /^(P[áa]gina\s?1|Sheet\s?1|Folha\s?1)$/i.test(aba.getName());
    if (padrao && aba.getLastRow() === 0 && aba.getLastColumn() === 0) {
      try {
        planilha.deleteSheet(aba);
      } catch (err) {
        logErro_('removerAbaPadraoVazia_', err);
      }
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Menu na planilha                                                    */
/* ------------------------------------------------------------------ */

/** Cria o menu ao abrir a planilha. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Extravios')
      .addItem('Abrir sistema', 'abrirSistema')
      .addSeparator()
      .addItem('Configurar / reaplicar formatação', 'setupSistemaComAviso')
      .addItem('Atualizar listas (limpar cache)', 'limparCacheComAviso')
      .addToUi();
  } catch (err) {
    logErro_('onOpen', err);
  }
}

/** Abre a interface dentro da própria planilha. */
function abrirSistema() {
  const pagina = criarPagina_()
    .setWidth(1400)
    .setHeight(860);
  SpreadsheetApp.getUi().showModalDialog(pagina, APP.NOME);
}

/** setupSistema() com retorno visual, chamado pelo menu. */
function setupSistemaComAviso() {
  try {
    const resumo = setupSistema();
    SpreadsheetApp.getUi().alert(APP.NOME, resumo, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {
    logErro_('setupSistemaComAviso', err);
    SpreadsheetApp.getUi().alert(APP.NOME, 'Não foi possível concluir a configuração. Verifique os registros de execução.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/** Limpa o cache, chamado pelo menu. */
function limparCacheComAviso() {
  limparCaches_();
  SpreadsheetApp.getActive().toast('Listas e dados serão recarregados na próxima ação.', APP.NOME, 5);
}
