/**
 * Config.gs
 * Constantes do sistema e leitura das listas configuráveis (aba CONFIG / ENTREGADORES).
 *
 * Nada aqui executa código no carregamento: apenas declarações e funções.
 */

/** Identificação do aplicativo. */
const APP = {
  NOME: 'Controle de Extravios',
  VERSAO: '1.0.0',
  TIMEZONE: 'America/Sao_Paulo',
  LOCALE: 'pt_BR'
};

/** Nomes das abas usadas como banco de dados. */
const ABAS = {
  EXTRAVIOS: 'EXTRAVIOS',
  ENTREGADORES: 'ENTREGADORES',
  CONFIG: 'CONFIG',
  HISTORICO: 'HISTORICO'
};

/** Índice (1-based) de cada coluna da aba EXTRAVIOS. */
const COL = {
  ID: 1,
  STATUS: 2,
  TRANSPORTADORA: 3,
  DATA: 4,
  HORA: 5,
  CODIGO: 6,
  VALOR: 7,
  RESPONSAVEL: 8,
  ENDERECO: 9,
  CAUSA: 10,
  DATA_DESCONTO: 11,
  DATA_REGISTRO: 12,
  USUARIO: 13
};

/** Índice (1-based) de cada coluna da aba HISTORICO. */
const COL_HIST = {
  ID_EXTRAVIO: 1,
  DATA_HORA: 2,
  USUARIO: 3,
  ACAO: 4,
  STATUS_ANTERIOR: 5,
  NOVO_STATUS: 6,
  OBSERVACAO: 7
};

const TOTAL_COLUNAS = {
  EXTRAVIOS: 13,
  HISTORICO: 7,
  ENTREGADORES: 3,
  CONFIG: 6
};

const CABECALHOS = {
  EXTRAVIOS: [
    'ID', 'STATUS', 'TRANSPORTADORA', 'DATA', 'HORA', 'CÓDIGO', 'VALOR',
    'RESPONSÁVEL', 'ENDEREÇO', 'CAUSA DO PROBLEMA', 'DATA DESCONTO',
    'DATA REGISTRO', 'USUÁRIO QUE REGISTROU'
  ],
  HISTORICO: [
    'ID EXTRAVIO', 'DATA/HORA', 'USUÁRIO', 'AÇÃO',
    'STATUS ANTERIOR', 'NOVO STATUS', 'OBSERVAÇÃO'
  ],
  ENTREGADORES: ['NOME', 'ATIVO', 'OBSERVAÇÃO'],
  CONFIG: ['STATUS', 'TRANSPORTADORAS', 'CAUSAS FREQUENTES', '', 'PARÂMETRO', 'VALOR']
};

/** Colunas da aba CONFIG que guardam listas (1-based). */
const CONFIG_COL = {
  STATUS: 1,
  TRANSPORTADORAS: 2,
  CAUSAS: 3,
  PARAMETRO: 5,
  VALOR_PARAMETRO: 6
};

/** Status com tratamento especial nas regras de negócio. */
const STATUS = {
  PADRAO: 'Pendente',
  MULTA: 'Multa',
  PARA_DESCONTO: 'Para desconto'
};

/** Ações registradas na aba HISTORICO. */
const ACOES = {
  CRIACAO: 'CRIAÇÃO',
  ALTERACAO_STATUS: 'ALTERAÇÃO DE STATUS'
};

/** Valores usados apenas quando a aba CONFIG é criada pela primeira vez. */
const PADROES = {
  STATUS: ['Pendente', 'Resolvido', 'Para desconto', 'Multa', 'Lost', 'Contestado', 'Danificado'],
  TRANSPORTADORAS: ['Loggi', 'Shopee', 'JET', 'Anjun', 'Imile'],
  CAUSAS: [
    'Endereço não localizado',
    'Extraviado no CD',
    'Avaria no transporte',
    'Entregue em endereço errado',
    'Não retornou ao CD',
    'Bipado e não entregue',
    'Roubo / furto de carga',
    'Cliente não recebeu'
  ],
  PARAMETROS: [
    ['ITENS_POR_PAGINA', '25'],
    ['EXIGIR_DATA_DESCONTO', 'SIM'],
    ['VALOR_MAXIMO', '100000']
  ]
};

/** Cores dos status (usadas na planilha e na interface). */
const CORES_STATUS = {
  'Pendente': '#F59E0B',
  'Resolvido': '#16A34A',
  'Para desconto': '#2563EB',
  'Multa': '#9333EA',
  'Lost': '#DC2626',
  'Contestado': '#0891B2',
  'Danificado': '#EA580C'
};

/** Cores oficiais das transportadoras. */
const CORES_TRANSPORTADORA = {
  'Loggi': '#12A5E8',
  'Shopee': '#F97316',
  'JET': '#EF4444',
  'J&T': '#EF4444',
  'Anjun': '#22C55E',
  'Imile': '#9333EA'
};

/** Chaves de cache e limites de fatiamento. */
const CACHE = {
  VERSAO: 3,
  PREFIXO_EXTRAVIOS: 'ext3_',
  PREFIXO_HISTORICO: 'his3_',
  CHAVE_LISTAS: 'listas3',
  TTL_DADOS: 300,
  TTL_LISTAS: 60,
  TAMANHO_PARTE: 40000,
  MAX_PARTES: 40
};

/** Propriedades de script. */
const PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ULTIMO_ID: 'ULTIMO_ID'
};

/** Campos aceitos na ordenação da listagem. */
const CAMPOS_ORDENACAO = ['id', 'status', 'transportadora', 'data', 'codigo', 'valor', 'responsavel'];

/* ------------------------------------------------------------------ */
/* Listas configuráveis                                                */
/* ------------------------------------------------------------------ */

/**
 * Lê (com cache curto) as listas configuráveis do sistema.
 * @return {{status: string[], transportadoras: string[], causas: string[],
 *           responsaveis: string[], parametros: Object}}
 */
function cfgListas_() {
  const cache = CacheService.getScriptCache();
  const bruto = cache.get(CACHE.CHAVE_LISTAS);
  if (bruto) {
    const salvo = parseJsonSeguro_(bruto);
    if (salvo && salvo.status && salvo.status.length) return salvo;
  }

  const listas = {
    status: lerColunaLista_(ABAS.CONFIG, CONFIG_COL.STATUS, PADROES.STATUS),
    transportadoras: lerColunaLista_(ABAS.CONFIG, CONFIG_COL.TRANSPORTADORAS, PADROES.TRANSPORTADORAS),
    causas: lerColunaLista_(ABAS.CONFIG, CONFIG_COL.CAUSAS, PADROES.CAUSAS),
    responsaveis: cfgResponsaveis_(),
    parametros: lerParametros_()
  };

  try {
    cache.put(CACHE.CHAVE_LISTAS, JSON.stringify(listas), CACHE.TTL_LISTAS);
  } catch (err) {
    logErro_('cfgListas_ (cache)', err);
  }
  return listas;
}

/**
 * Nomes ativos da aba ENTREGADORES (coluna A). Coluna B ("ATIVO") com "NÃO"
 * remove o nome do dropdown sem apagar o histórico.
 * @return {string[]}
 */
function cfgResponsaveis_() {
  const aba = getAba_(ABAS.ENTREGADORES);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const valores = aba.getRange(2, 1, ultimaLinha - 1, 2).getValues();
  const nomes = [];
  const vistos = {};
  for (let i = 0; i < valores.length; i++) {
    const nome = texto_(valores[i][0]);
    if (!nome) continue;
    const ativo = semAcentos_(texto_(valores[i][1])).toUpperCase();
    if (ativo === 'NAO' || ativo === 'N' || ativo === 'FALSE' || ativo === 'INATIVO') continue;
    const chave = semAcentos_(nome).toUpperCase();
    if (vistos[chave]) continue;
    vistos[chave] = true;
    nomes.push(nome);
  }
  nomes.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  return nomes;
}

/**
 * Todos os nomes da aba ENTREGADORES, inclusive inativos (usado na validação
 * para não invalidar registros antigos).
 * @return {string[]}
 */
function cfgTodosEntregadores_() {
  const aba = getAba_(ABAS.ENTREGADORES);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  const valores = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues();
  const nomes = [];
  for (let i = 0; i < valores.length; i++) {
    const nome = texto_(valores[i][0]);
    if (nome) nomes.push(nome);
  }
  return nomes;
}

/**
 * Lê uma coluna da aba CONFIG como lista, ignorando vazios e duplicados.
 * @param {string} nomeAba
 * @param {number} coluna
 * @param {string[]} padrao
 * @return {string[]}
 */
function lerColunaLista_(nomeAba, coluna, padrao) {
  const aba = getAba_(nomeAba);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return padrao.slice();

  const valores = aba.getRange(2, coluna, ultimaLinha - 1, 1).getValues();
  const lista = [];
  const vistos = {};
  for (let i = 0; i < valores.length; i++) {
    const item = texto_(valores[i][0]);
    if (!item) continue;
    const chave = semAcentos_(item).toUpperCase();
    if (vistos[chave]) continue;
    vistos[chave] = true;
    lista.push(item);
  }
  return lista.length ? lista : padrao.slice();
}

/**
 * Lê os parâmetros (colunas E/F da aba CONFIG).
 * @return {Object<string,string>}
 */
function lerParametros_() {
  const parametros = {};
  for (let i = 0; i < PADROES.PARAMETROS.length; i++) {
    parametros[PADROES.PARAMETROS[i][0]] = PADROES.PARAMETROS[i][1];
  }

  const aba = getAba_(ABAS.CONFIG);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return parametros;

  const valores = aba.getRange(2, CONFIG_COL.PARAMETRO, ultimaLinha - 1, 2).getValues();
  for (let i = 0; i < valores.length; i++) {
    const chave = texto_(valores[i][0]).toUpperCase().replace(/\s+/g, '_');
    if (!chave) continue;
    parametros[chave] = texto_(valores[i][1]);
  }
  return parametros;
}

/**
 * @param {Object} parametros
 * @param {string} chave
 * @param {number} padrao
 * @return {number}
 */
function parametroNumero_(parametros, chave, padrao) {
  const valor = Number(String(parametros[chave] || '').replace(',', '.'));
  return isFinite(valor) && valor > 0 ? valor : padrao;
}

/**
 * @param {Object} parametros
 * @param {string} chave
 * @param {boolean} padrao
 * @return {boolean}
 */
function parametroBooleano_(parametros, chave, padrao) {
  const valor = semAcentos_(texto_(parametros[chave])).toUpperCase();
  if (!valor) return padrao;
  return valor === 'SIM' || valor === 'S' || valor === 'TRUE' || valor === '1';
}

/** Limpa o cache de listas e de dados. */
function limparCaches_() {
  const cache = CacheService.getScriptCache();
  try {
    cache.remove(CACHE.CHAVE_LISTAS);
    cache.remove(CACHE.PREFIXO_EXTRAVIOS + 'meta');
    cache.remove(CACHE.PREFIXO_HISTORICO + 'meta');
  } catch (err) {
    logErro_('limparCaches_', err);
  }
}
