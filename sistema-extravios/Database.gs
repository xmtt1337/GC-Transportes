/**
 * Database.gs
 * Camada de acesso à planilha: leitura em lote com cache, escrita em lote,
 * bloqueio contra concorrência e histórico.
 *
 * Regra geral: ler tudo de uma vez, processar em memória, escrever de uma vez.
 */

let PLANILHA_MEMO_ = null;

/* ------------------------------------------------------------------ */
/* Acesso básico                                                       */
/* ------------------------------------------------------------------ */

/** @return {GoogleAppsScript.Spreadsheet.Spreadsheet} */
function getPlanilha_() {
  if (PLANILHA_MEMO_) return PLANILHA_MEMO_;

  let planilha = null;
  try {
    planilha = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    planilha = null;
  }

  if (!planilha) {
    const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
    if (!id) {
      throw new Error('Planilha não localizada. Vincule o script à planilha ou defina a propriedade SPREADSHEET_ID.');
    }
    planilha = SpreadsheetApp.openById(id);
  }

  PLANILHA_MEMO_ = planilha;
  return planilha;
}

/**
 * @param {string} nome
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getAba_(nome) {
  const aba = getPlanilha_().getSheetByName(nome);
  if (!aba) {
    throw new Error('Aba "' + nome + '" não encontrada. Execute setupSistema() na planilha.');
  }
  return aba;
}

/**
 * Garante que a aba tenha linhas suficientes antes de uma escrita direta.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {number} linhaDestino
 */
function garantirLinhas_(aba, linhaDestino) {
  const maximo = aba.getMaxRows();
  if (linhaDestino > maximo) {
    aba.insertRowsAfter(maximo, Math.max(200, linhaDestino - maximo));
  }
}

/* ------------------------------------------------------------------ */
/* Cache em fatias (CacheService limita 100 KB por chave)              */
/* ------------------------------------------------------------------ */

/**
 * Lê uma aba inteira convertendo cada linha em objeto, com cache invalidado
 * automaticamente quando o número de linhas muda.
 *
 * @param {{aba: string, colunas: number, prefixo: string,
 *          mapear: function(Array,number):?Object}} opcoes
 * @return {Object[]}
 */
function lerColecaoComCache_(opcoes) {
  const aba = getAba_(opcoes.aba);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const cache = CacheService.getScriptCache();
  const chaveMeta = opcoes.prefixo + 'meta';
  const meta = parseJsonSeguro_(cache.get(chaveMeta));

  if (meta && meta.versao === CACHE.VERSAO && meta.linhas === ultimaLinha && meta.partes > 0) {
    const chaves = [];
    for (let i = 0; i < meta.partes; i++) chaves.push(opcoes.prefixo + 'p' + i);

    const fatias = cache.getAll(chaves);
    let bruto = '';
    let completo = true;
    for (let i = 0; i < chaves.length; i++) {
      const fatia = fatias[chaves[i]];
      if (fatia === null || fatia === undefined) { completo = false; break; }
      bruto += fatia;
    }
    if (completo) {
      const dados = parseJsonSeguro_(bruto);
      if (dados && dados.length !== undefined) return dados;
    }
  }

  const valores = aba.getRange(2, 1, ultimaLinha - 1, opcoes.colunas).getValues();
  const registros = [];
  for (let i = 0; i < valores.length; i++) {
    const registro = opcoes.mapear(valores[i], i + 2);
    if (registro) registros.push(registro);
  }

  gravarColecaoNoCache_(opcoes.prefixo, registros, ultimaLinha);
  return registros;
}

/**
 * @param {string} prefixo
 * @param {Object[]} registros
 * @param {number} ultimaLinha
 */
function gravarColecaoNoCache_(prefixo, registros, ultimaLinha) {
  try {
    const bruto = JSON.stringify(registros);
    const partes = Math.max(1, Math.ceil(bruto.length / CACHE.TAMANHO_PARTE));
    if (partes > CACHE.MAX_PARTES) {
      // Volume grande demais para o cache: segue lendo direto da planilha.
      CacheService.getScriptCache().remove(prefixo + 'meta');
      return;
    }

    const mapa = {};
    for (let i = 0; i < partes; i++) {
      mapa[prefixo + 'p' + i] = bruto.substring(i * CACHE.TAMANHO_PARTE, (i + 1) * CACHE.TAMANHO_PARTE);
    }

    const cache = CacheService.getScriptCache();
    cache.putAll(mapa, CACHE.TTL_DADOS);
    cache.put(prefixo + 'meta', JSON.stringify({
      versao: CACHE.VERSAO,
      linhas: ultimaLinha,
      partes: partes
    }), CACHE.TTL_DADOS);
  } catch (err) {
    logErro_('gravarColecaoNoCache_', err);
  }
}

/** @param {string} prefixo */
function invalidarCache_(prefixo) {
  try {
    CacheService.getScriptCache().remove(prefixo + 'meta');
  } catch (err) {
    logErro_('invalidarCache_', err);
  }
}

/* ------------------------------------------------------------------ */
/* Mapeamento linha -> objeto                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {Array} linha
 * @param {number} numeroLinha
 * @return {?Object}
 */
function mapearExtravio_(linha, numeroLinha) {
  const codigo = normalizarCodigo_(linha[COL.CODIGO - 1]);
  const idBruto = linha[COL.ID - 1];
  if (!codigo && !texto_(idBruto)) return null;

  const valor = parseValor_(linha[COL.VALOR - 1]);

  return {
    linha: numeroLinha,
    id: Number(idBruto) || 0,
    status: texto_(linha[COL.STATUS - 1]) || STATUS.PADRAO,
    transportadora: texto_(linha[COL.TRANSPORTADORA - 1]),
    data: dataParaIso_(linha[COL.DATA - 1]),
    hora: parseHora_(linha[COL.HORA - 1]) || '',
    codigo: codigo,
    valor: valor === null ? 0 : valor,
    responsavel: texto_(linha[COL.RESPONSAVEL - 1]),
    endereco: texto_(linha[COL.ENDERECO - 1]),
    causa: textoMultilinha_(linha[COL.CAUSA - 1]),
    dataDesconto: dataParaIso_(linha[COL.DATA_DESCONTO - 1]),
    dataRegistro: dataHoraParaTexto_(linha[COL.DATA_REGISTRO - 1]),
    usuario: texto_(linha[COL.USUARIO - 1])
  };
}

/**
 * @param {Array} linha
 * @param {number} numeroLinha
 * @return {?Object}
 */
function mapearHistorico_(linha, numeroLinha) {
  const acao = texto_(linha[COL_HIST.ACAO - 1]);
  const idExtravio = texto_(linha[COL_HIST.ID_EXTRAVIO - 1]);
  if (!acao && !idExtravio) return null;

  return {
    linha: numeroLinha,
    idExtravio: Number(idExtravio) || 0,
    dataHora: dataHoraParaTexto_(linha[COL_HIST.DATA_HORA - 1]),
    usuario: texto_(linha[COL_HIST.USUARIO - 1]),
    acao: acao,
    statusAnterior: texto_(linha[COL_HIST.STATUS_ANTERIOR - 1]),
    novoStatus: texto_(linha[COL_HIST.NOVO_STATUS - 1]),
    observacao: textoMultilinha_(linha[COL_HIST.OBSERVACAO - 1])
  };
}

/** @return {Object[]} Todos os extravios (cacheados). */
function lerExtravios_() {
  return lerColecaoComCache_({
    aba: ABAS.EXTRAVIOS,
    colunas: TOTAL_COLUNAS.EXTRAVIOS,
    prefixo: CACHE.PREFIXO_EXTRAVIOS,
    mapear: mapearExtravio_
  });
}

/** @return {Object[]} Todo o histórico (cacheado). */
function lerHistorico_() {
  return lerColecaoComCache_({
    aba: ABAS.HISTORICO,
    colunas: TOTAL_COLUNAS.HISTORICO,
    prefixo: CACHE.PREFIXO_HISTORICO,
    mapear: mapearHistorico_
  });
}

/* ------------------------------------------------------------------ */
/* Listagem, filtros e paginação                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} filtros {busca, status, transportadora, dataInicio, dataFim,
 *                          ordenarPor, ordem, pagina, porPagina}
 * @return {Object}
 */
function dbListarExtravios(filtros) {
  const f = filtros || {};
  const listas = cfgListas_();
  let itens = lerExtravios_();

  const busca = chaveComparacao_(f.busca);
  if (busca) {
    itens = itens.filter(function (r) {
      return r.codigo.indexOf(busca) >= 0 ||
        String(r.id) === busca ||
        chaveComparacao_(r.responsavel).indexOf(busca) >= 0 ||
        chaveComparacao_(r.endereco).indexOf(busca) >= 0;
    });
  }

  const status = texto_(f.status);
  if (status) {
    const alvo = chaveComparacao_(status);
    itens = itens.filter(function (r) { return chaveComparacao_(r.status) === alvo; });
  }

  const transportadora = texto_(f.transportadora);
  if (transportadora) {
    const alvo = chaveComparacao_(transportadora);
    itens = itens.filter(function (r) { return chaveComparacao_(r.transportadora) === alvo; });
  }

  const inicio = isoValido_(f.dataInicio) ? texto_(f.dataInicio) : '';
  if (inicio) {
    itens = itens.filter(function (r) { return r.data && r.data >= inicio; });
  }

  const fim = isoValido_(f.dataFim) ? texto_(f.dataFim) : '';
  if (fim) {
    itens = itens.filter(function (r) { return r.data && r.data <= fim; });
  }

  const campo = CAMPOS_ORDENACAO.indexOf(f.ordenarPor) >= 0 ? f.ordenarPor : 'data';
  const direcao = f.ordem === 'asc' ? 1 : -1;
  itens = itens.slice().sort(comparadorExtravios_(campo, direcao));

  const total = itens.length;
  let valorTotal = 0;
  let valorParaDesconto = 0;
  const alvoDesconto = chaveComparacao_(STATUS.PARA_DESCONTO);
  for (let i = 0; i < itens.length; i++) {
    valorTotal += itens[i].valor;
    if (chaveComparacao_(itens[i].status) === alvoDesconto) valorParaDesconto += itens[i].valor;
  }

  const porPagina = limitar_(
    Number(f.porPagina) || parametroNumero_(listas.parametros, 'ITENS_POR_PAGINA', 25),
    5, 200
  );
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = limitar_(Number(f.pagina) || 1, 1, paginas);
  const corte = (pagina - 1) * porPagina;

  return {
    itens: itens.slice(corte, corte + porPagina),
    total: total,
    pagina: pagina,
    paginas: paginas,
    porPagina: porPagina,
    valorTotal: arredondar2_(valorTotal),
    valorParaDesconto: arredondar2_(valorParaDesconto)
  };
}

/**
 * @param {string} campo
 * @param {number} direcao 1 ou -1
 * @return {function(Object,Object):number}
 */
function comparadorExtravios_(campo, direcao) {
  return function (a, b) {
    let resultado = 0;

    if (campo === 'valor' || campo === 'id') {
      resultado = (a[campo] || 0) - (b[campo] || 0);
    } else if (campo === 'data') {
      const chaveA = (a.data || '0000-00-00') + ' ' + (a.hora || '00:00');
      const chaveB = (b.data || '0000-00-00') + ' ' + (b.hora || '00:00');
      resultado = chaveA < chaveB ? -1 : (chaveA > chaveB ? 1 : 0);
    } else {
      const chaveA = chaveComparacao_(a[campo]);
      const chaveB = chaveComparacao_(b[campo]);
      resultado = chaveA < chaveB ? -1 : (chaveA > chaveB ? 1 : 0);
    }

    if (resultado === 0) resultado = (a.id || 0) - (b.id || 0);
    return resultado * direcao;
  };
}

/**
 * @param {number|string} id
 * @return {?Object} Registro com seu histórico, ou null.
 */
function dbObterExtravio(id) {
  const alvo = Number(id);
  if (!isFinite(alvo) || alvo <= 0) return null;

  const itens = lerExtravios_();
  let registro = null;
  for (let i = 0; i < itens.length; i++) {
    if (itens[i].id === alvo) { registro = itens[i]; break; }
  }
  if (!registro) return null;

  const historico = lerHistorico_()
    .filter(function (h) { return h.idExtravio === alvo; })
    .sort(function (a, b) { return b.linha - a.linha; });

  return { registro: registro, historico: historico };
}

/**
 * @param {Object} filtros {busca, acao, pagina, porPagina}
 * @return {Object}
 */
function dbListarHistorico(filtros) {
  const f = filtros || {};
  let itens = lerHistorico_();

  const busca = chaveComparacao_(f.busca);
  if (busca) {
    itens = itens.filter(function (h) {
      return String(h.idExtravio) === busca ||
        chaveComparacao_(h.usuario).indexOf(busca) >= 0 ||
        chaveComparacao_(h.novoStatus).indexOf(busca) >= 0 ||
        chaveComparacao_(h.observacao).indexOf(busca) >= 0;
    });
  }

  const acao = texto_(f.acao);
  if (acao) {
    const alvo = chaveComparacao_(acao);
    itens = itens.filter(function (h) { return chaveComparacao_(h.acao) === alvo; });
  }

  // Mais recentes primeiro (a ordem de gravação é a própria ordem das linhas).
  itens = itens.slice().sort(function (a, b) { return b.linha - a.linha; });

  const total = itens.length;
  const porPagina = limitar_(Number(f.porPagina) || 25, 5, 200);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = limitar_(Number(f.pagina) || 1, 1, paginas);
  const corte = (pagina - 1) * porPagina;

  return {
    itens: itens.slice(corte, corte + porPagina),
    total: total,
    pagina: pagina,
    paginas: paginas,
    porPagina: porPagina
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {Object} filtros {dataInicio, dataFim}
 * @return {Object}
 */
function dbDashboard(filtros) {
  const f = filtros || {};
  const listas = cfgListas_();
  let itens = lerExtravios_();

  const inicio = isoValido_(f.dataInicio) ? texto_(f.dataInicio) : '';
  const fim = isoValido_(f.dataFim) ? texto_(f.dataFim) : '';
  if (inicio) itens = itens.filter(function (r) { return r.data && r.data >= inicio; });
  if (fim) itens = itens.filter(function (r) { return r.data && r.data <= fim; });

  const porStatus = {};
  const ordemStatus = [];
  for (let i = 0; i < listas.status.length; i++) {
    const nome = listas.status[i];
    porStatus[chaveComparacao_(nome)] = { nome: nome, quantidade: 0, valor: 0 };
    ordemStatus.push(chaveComparacao_(nome));
  }

  const porTransportadora = {};
  const ordemTransportadora = [];
  for (let i = 0; i < listas.transportadoras.length; i++) {
    const nome = listas.transportadoras[i];
    porTransportadora[chaveComparacao_(nome)] = { nome: nome, quantidade: 0, valor: 0 };
    ordemTransportadora.push(chaveComparacao_(nome));
  }

  let valorTotal = 0;
  let valorParaDesconto = 0;
  const alvoDesconto = chaveComparacao_(STATUS.PARA_DESCONTO);

  for (let i = 0; i < itens.length; i++) {
    const registro = itens[i];
    valorTotal += registro.valor;

    const chaveStatus = chaveComparacao_(registro.status);
    if (!porStatus[chaveStatus]) {
      porStatus[chaveStatus] = { nome: registro.status || '(sem status)', quantidade: 0, valor: 0 };
      ordemStatus.push(chaveStatus);
    }
    porStatus[chaveStatus].quantidade++;
    porStatus[chaveStatus].valor += registro.valor;
    if (chaveStatus === alvoDesconto) valorParaDesconto += registro.valor;

    const chaveTransportadora = chaveComparacao_(registro.transportadora);
    if (chaveTransportadora) {
      if (!porTransportadora[chaveTransportadora]) {
        porTransportadora[chaveTransportadora] = { nome: registro.transportadora, quantidade: 0, valor: 0 };
        ordemTransportadora.push(chaveTransportadora);
      }
      porTransportadora[chaveTransportadora].quantidade++;
      porTransportadora[chaveTransportadora].valor += registro.valor;
    }
  }

  const listaStatus = ordemStatus.map(function (chave) {
    const item = porStatus[chave];
    return { nome: item.nome, quantidade: item.quantidade, valor: arredondar2_(item.valor) };
  });

  const listaTransportadoras = ordemTransportadora
    .map(function (chave) {
      const item = porTransportadora[chave];
      return { nome: item.nome, quantidade: item.quantidade, valor: arredondar2_(item.valor) };
    })
    .sort(function (a, b) { return b.quantidade - a.quantidade; });

  const ultimos = itens.slice()
    .sort(function (a, b) { return b.id - a.id; })
    .slice(0, 5);

  return {
    total: itens.length,
    valorTotal: arredondar2_(valorTotal),
    valorParaDesconto: arredondar2_(valorParaDesconto),
    porStatus: listaStatus,
    porTransportadora: listaTransportadoras,
    ultimos: ultimos,
    periodo: { dataInicio: inicio, dataFim: fim }
  };
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cria um extravio com trava contra concorrência e verificação de duplicidade
 * feita diretamente na planilha (não no cache).
 *
 * @param {Object} dados Campos crus do formulário.
 * @return {Object} Resposta pronta para o cliente.
 */
function dbCriarExtravio(dados) {
  const trava = LockService.getScriptLock();
  let travou = false;
  try {
    travou = trava.tryLock(25000);
  } catch (err) {
    logErro_('dbCriarExtravio (tryLock)', err);
    travou = false;
  }

  if (!travou) {
    return {
      ok: false,
      tipo: 'ocupado',
      mensagem: 'O sistema está processando outro registro. Aguarde alguns segundos e tente novamente.'
    };
  }

  try {
    const listas = cfgListas_();
    const validacao = validarExtravio_(dados, listas);
    if (!validacao.valido) {
      return {
        ok: false,
        tipo: 'validacao',
        mensagem: 'Confira os campos destacados.',
        erros: validacao.erros
      };
    }

    const v = validacao.valores;
    const aba = getAba_(ABAS.EXTRAVIOS);
    const permiteDuplicado = chaveComparacao_(v.status) === chaveComparacao_(STATUS.MULTA);

    if (!permiteDuplicado) {
      const duplicado = buscarPorCodigoNaPlanilha_(aba, v.codigo);
      if (duplicado) {
        return {
          ok: false,
          tipo: 'duplicado',
          mensagem: 'Este código já está registrado.',
          duplicado: duplicado.registro,
          ocorrencias: duplicado.ocorrencias
        };
      }
    }

    const usuario = usuarioAtual_();
    const agora = new Date();
    const id = proximoId_(aba);

    const novaLinha = [];
    novaLinha[COL.ID - 1] = id;
    novaLinha[COL.STATUS - 1] = v.status;
    novaLinha[COL.TRANSPORTADORA - 1] = v.transportadora;
    novaLinha[COL.DATA - 1] = v.data;
    novaLinha[COL.HORA - 1] = v.hora;
    novaLinha[COL.CODIGO - 1] = v.codigo;
    novaLinha[COL.VALOR - 1] = v.valor;
    novaLinha[COL.RESPONSAVEL - 1] = v.responsavel;
    novaLinha[COL.ENDERECO - 1] = v.endereco;
    novaLinha[COL.CAUSA - 1] = v.causa;
    novaLinha[COL.DATA_DESCONTO - 1] = v.dataDesconto || '';
    novaLinha[COL.DATA_REGISTRO - 1] = agora;
    novaLinha[COL.USUARIO - 1] = usuario;

    const destino = aba.getLastRow() + 1;
    garantirLinhas_(aba, destino);
    aba.getRange(destino, 1, 1, TOTAL_COLUNAS.EXTRAVIOS).setValues([novaLinha]);

    registrarHistorico_(id, ACOES.CRIACAO, '', v.status, '', usuario);

    SpreadsheetApp.flush();
    invalidarCache_(CACHE.PREFIXO_EXTRAVIOS);
    invalidarCache_(CACHE.PREFIXO_HISTORICO);

    return {
      ok: true,
      mensagem: 'Extravio #' + id + ' registrado com sucesso.',
      registro: mapearExtravio_(novaLinha, destino)
    };
  } finally {
    try { trava.releaseLock(); } catch (err) { /* nada a fazer */ }
  }
}

/**
 * Altera o status de um registro existente e grava no histórico.
 *
 * @param {Object} dados {id, status, dataDesconto, observacao}
 * @return {Object}
 */
function dbAtualizarStatus(dados) {
  const trava = LockService.getScriptLock();
  let travou = false;
  try {
    travou = trava.tryLock(25000);
  } catch (err) {
    logErro_('dbAtualizarStatus (tryLock)', err);
    travou = false;
  }

  if (!travou) {
    return {
      ok: false,
      tipo: 'ocupado',
      mensagem: 'O sistema está processando outra alteração. Tente novamente em alguns segundos.'
    };
  }

  try {
    const listas = cfgListas_();
    const validacao = validarAlteracaoStatus_(dados, listas);
    if (!validacao.valido) {
      return {
        ok: false,
        tipo: 'validacao',
        mensagem: 'Confira os campos destacados.',
        erros: validacao.erros
      };
    }

    const v = validacao.valores;
    const aba = getAba_(ABAS.EXTRAVIOS);
    const linha = localizarLinhaPorId_(aba, v.id);
    if (!linha) {
      return { ok: false, tipo: 'nao_encontrado', mensagem: 'Registro não encontrado. Atualize a lista e tente novamente.' };
    }

    const atual = aba.getRange(linha, 1, 1, TOTAL_COLUNAS.EXTRAVIOS).getValues()[0];
    const statusAnterior = texto_(atual[COL.STATUS - 1]);
    const descontoAtual = parseData_(atual[COL.DATA_DESCONTO - 1]);

    const paraDesconto = chaveComparacao_(v.status) === chaveComparacao_(STATUS.PARA_DESCONTO);
    const exigirDesconto = parametroBooleano_(listas.parametros, 'EXIGIR_DATA_DESCONTO', true);
    if (paraDesconto && exigirDesconto && !v.dataDesconto && !descontoAtual) {
      return {
        ok: false,
        tipo: 'validacao',
        mensagem: 'Confira os campos destacados.',
        erros: { dataDesconto: 'Com o status "' + STATUS.PARA_DESCONTO + '", informe a data do desconto.' }
      };
    }

    const mudouStatus = chaveComparacao_(statusAnterior) !== chaveComparacao_(v.status);
    const mudouDesconto = v.dataDesconto !== null &&
      dataParaIso_(v.dataDesconto) !== dataParaIso_(descontoAtual);

    if (!mudouStatus && !mudouDesconto) {
      return { ok: false, tipo: 'sem_mudanca', mensagem: 'Nenhuma alteração a salvar: o registro já está assim.' };
    }

    aba.getRange(linha, COL.STATUS).setValue(v.status);
    if (v.dataDesconto) {
      aba.getRange(linha, COL.DATA_DESCONTO).setValue(v.dataDesconto);
    }

    const usuario = usuarioAtual_();
    registrarHistorico_(v.id, ACOES.ALTERACAO_STATUS, statusAnterior, v.status, v.observacao, usuario);

    SpreadsheetApp.flush();
    invalidarCache_(CACHE.PREFIXO_EXTRAVIOS);
    invalidarCache_(CACHE.PREFIXO_HISTORICO);

    return {
      ok: true,
      mensagem: 'Status do extravio #' + v.id + ' atualizado para "' + v.status + '".'
    };
  } finally {
    try { trava.releaseLock(); } catch (err) { /* nada a fazer */ }
  }
}

/**
 * Procura um código lendo apenas a coluna CÓDIGO direto da planilha.
 * Sempre chamado dentro da trava, para nunca usar dado de cache aqui.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {string} codigoNormalizado
 * @return {?{registro: Object, ocorrencias: number}}
 */
function buscarPorCodigoNaPlanilha_(aba, codigoNormalizado) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return null;

  const codigos = aba.getRange(2, COL.CODIGO, ultimaLinha - 1, 1).getValues();
  let ultimaOcorrencia = 0;
  let ocorrencias = 0;

  for (let i = 0; i < codigos.length; i++) {
    if (normalizarCodigo_(codigos[i][0]) === codigoNormalizado) {
      ocorrencias++;
      ultimaOcorrencia = i + 2;
    }
  }

  if (!ocorrencias) return null;

  const linha = aba.getRange(ultimaOcorrencia, 1, 1, TOTAL_COLUNAS.EXTRAVIOS).getValues()[0];
  return {
    registro: mapearExtravio_(linha, ultimaOcorrencia),
    ocorrencias: ocorrencias
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {number} id
 * @return {number} Número da linha, ou 0 se não existir.
 */
function localizarLinhaPorId_(aba, id) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return 0;

  const ids = aba.getRange(2, COL.ID, ultimaLinha - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (Number(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

/**
 * Próximo ID sequencial. Considera a planilha e o contador de propriedades,
 * usando sempre o maior dos dois (resiste a linhas apagadas manualmente).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @return {number}
 */
function proximoId_(aba) {
  const ultimaLinha = aba.getLastRow();
  let maiorNaPlanilha = 0;
  if (ultimaLinha >= 2) {
    const valor = Number(aba.getRange(ultimaLinha, COL.ID).getValue());
    if (isFinite(valor) && valor > 0) maiorNaPlanilha = Math.floor(valor);
  }

  const propriedades = PropertiesService.getScriptProperties();
  const salvo = Number(propriedades.getProperty(PROP.ULTIMO_ID)) || 0;
  const proximo = Math.max(maiorNaPlanilha, salvo) + 1;
  propriedades.setProperty(PROP.ULTIMO_ID, String(proximo));
  return proximo;
}

/**
 * Grava uma linha na aba HISTORICO.
 *
 * @param {number} idExtravio
 * @param {string} acao
 * @param {string} statusAnterior
 * @param {string} novoStatus
 * @param {string} observacao
 * @param {string} usuario
 */
function registrarHistorico_(idExtravio, acao, statusAnterior, novoStatus, observacao, usuario) {
  try {
    const aba = getAba_(ABAS.HISTORICO);
    const destino = aba.getLastRow() + 1;
    garantirLinhas_(aba, destino);

    const linha = [];
    linha[COL_HIST.ID_EXTRAVIO - 1] = idExtravio;
    linha[COL_HIST.DATA_HORA - 1] = new Date();
    linha[COL_HIST.USUARIO - 1] = usuario;
    linha[COL_HIST.ACAO - 1] = acao;
    linha[COL_HIST.STATUS_ANTERIOR - 1] = statusAnterior || '';
    linha[COL_HIST.NOVO_STATUS - 1] = novoStatus || '';
    linha[COL_HIST.OBSERVACAO - 1] = observacao || '';

    aba.getRange(destino, 1, 1, TOTAL_COLUNAS.HISTORICO).setValues([linha]);
  } catch (err) {
    // O histórico nunca pode derrubar o registro principal.
    logErro_('registrarHistorico_', err);
  }
}
