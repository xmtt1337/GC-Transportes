/**
 * Code.gs
 * Ponto de entrada do Web App e API chamada pelo front-end via google.script.run.
 *
 * Toda função api* devolve sempre um objeto simples com a propriedade "ok".
 * Erros técnicos ficam no log; o usuário recebe mensagem amigável.
 */

/* ------------------------------------------------------------------ */
/* Renderização da página                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} e Evento do Web App.
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  try {
    return criarPagina_()
      .setTitle(APP.NOME + ' · GC Transportes')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    logErro_('doGet', err);
    return HtmlService.createHtmlOutput(
      '<div style="font-family:system-ui,sans-serif;padding:40px;max-width:560px;margin:0 auto">' +
      '<h2 style="color:#0F172A">Não foi possível abrir o sistema</h2>' +
      '<p style="color:#475569;line-height:1.6">Verifique se a planilha está configurada ' +
      '(execute <b>setupSistema()</b>) e se você tem acesso a ela. Se o problema continuar, ' +
      'peça ao responsável para conferir os registros de execução do Apps Script.</p></div>'
    );
  }
}

/**
 * Monta a página com os dados iniciais já embutidos (evita uma ida ao servidor).
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function criarPagina_() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.dadosIniciais = jsonParaScript_(apiBootstrap());
  return template.evaluate();
}

/**
 * Inclui outro arquivo HTML (também avaliado como template).
 * @param {string} nome
 * @return {string}
 */
function include(nome) {
  return HtmlService.createTemplateFromFile(nome).evaluate().getContent();
}

/**
 * Serializa com segurança para dentro de uma tag <script>.
 * @param {*} valor
 * @return {string}
 */
function jsonParaScript_(valor) {
  return JSON.stringify(valor)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp('[' + String.fromCharCode(8232, 8233) + ']', 'g'), function (c) {
      return c.charCodeAt(0) === 8232 ? '\\u2028' : '\\u2029';
    });
}

/* ------------------------------------------------------------------ */
/* Respostas padronizadas                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} dados
 * @return {Object}
 */
function respostaOk_(dados) {
  const resposta = { ok: true };
  if (dados) {
    Object.keys(dados).forEach(function (chave) { resposta[chave] = dados[chave]; });
  }
  return resposta;
}

/**
 * @param {string} mensagem
 * @param {string=} tipo
 * @return {Object}
 */
function respostaErro_(mensagem, tipo) {
  return { ok: false, tipo: tipo || 'erro', mensagem: mensagem };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Dados necessários para montar a interface.
 * @return {Object}
 */
function apiBootstrap() {
  try {
    const listas = cfgListas_();
    return respostaOk_({
      usuario: usuarioAtual_(),
      app: { nome: APP.NOME, versao: APP.VERSAO },
      status: listas.status,
      transportadoras: listas.transportadoras,
      causas: listas.causas,
      responsaveis: listas.responsaveis,
      statusPadrao: STATUS.PADRAO,
      statusMulta: STATUS.MULTA,
      statusParaDesconto: STATUS.PARA_DESCONTO,
      exigirDataDesconto: parametroBooleano_(listas.parametros, 'EXIGIR_DATA_DESCONTO', true),
      itensPorPagina: parametroNumero_(listas.parametros, 'ITENS_POR_PAGINA', 25),
      valorMaximo: parametroNumero_(listas.parametros, 'VALOR_MAXIMO', 100000),
      coresStatus: CORES_STATUS,
      coresTransportadora: CORES_TRANSPORTADORA,
      hoje: hojeIso_()
    });
  } catch (err) {
    logErro_('apiBootstrap', err);
    return respostaErro_('Não foi possível carregar as configurações. Verifique se a planilha foi configurada com setupSistema().');
  }
}

/**
 * Recarrega as listas ignorando o cache (útil após editar CONFIG/ENTREGADORES).
 * @return {Object}
 */
function apiRecarregarListas() {
  try {
    limparCaches_();
    const listas = cfgListas_();
    return respostaOk_({
      status: listas.status,
      transportadoras: listas.transportadoras,
      causas: listas.causas,
      responsaveis: listas.responsaveis
    });
  } catch (err) {
    logErro_('apiRecarregarListas', err);
    return respostaErro_('Não foi possível atualizar as listas. Tente novamente.');
  }
}

/**
 * @param {Object} dados Campos do formulário.
 * @return {Object}
 */
function apiCriarExtravio(dados) {
  try {
    return dbCriarExtravio(dados);
  } catch (err) {
    logErro_('apiCriarExtravio', err);
    return respostaErro_('Não foi possível salvar o registro. Tente novamente.');
  }
}

/**
 * @param {Object} filtros
 * @return {Object}
 */
function apiListarExtravios(filtros) {
  try {
    return respostaOk_(dbListarExtravios(filtros));
  } catch (err) {
    logErro_('apiListarExtravios', err);
    return respostaErro_('Não foi possível carregar os registros. Tente novamente.');
  }
}

/**
 * @param {number|string} id
 * @return {Object}
 */
function apiObterExtravio(id) {
  try {
    const resultado = dbObterExtravio(id);
    if (!resultado) return respostaErro_('Registro não encontrado.', 'nao_encontrado');
    return respostaOk_(resultado);
  } catch (err) {
    logErro_('apiObterExtravio', err);
    return respostaErro_('Não foi possível abrir os detalhes do registro.');
  }
}

/**
 * @param {Object} dados {id, status, dataDesconto, observacao}
 * @return {Object}
 */
function apiAtualizarStatus(dados) {
  try {
    return dbAtualizarStatus(dados);
  } catch (err) {
    logErro_('apiAtualizarStatus', err);
    return respostaErro_('Não foi possível atualizar o status. Tente novamente.');
  }
}

/**
 * @param {Object} filtros {dataInicio, dataFim}
 * @return {Object}
 */
function apiDashboard(filtros) {
  try {
    return respostaOk_(dbDashboard(filtros));
  } catch (err) {
    logErro_('apiDashboard', err);
    return respostaErro_('Não foi possível carregar o painel. Tente novamente.');
  }
}

/**
 * @param {Object} filtros {busca, acao, pagina, porPagina}
 * @return {Object}
 */
function apiListarHistorico(filtros) {
  try {
    return respostaOk_(dbListarHistorico(filtros));
  } catch (err) {
    logErro_('apiListarHistorico', err);
    return respostaErro_('Não foi possível carregar o histórico. Tente novamente.');
  }
}
