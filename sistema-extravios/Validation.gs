/**
 * Validation.gs
 * Regras de validação de negócio. Tudo aqui roda no servidor: o front-end
 * repete parte destas regras apenas para dar retorno imediato ao usuário.
 */

/** Limites de tamanho dos campos. */
const LIMITES = {
  CODIGO_MIN: 3,
  CODIGO_MAX: 60,
  ENDERECO_MIN: 5,
  ENDERECO_MAX: 250,
  CAUSA_MIN: 3,
  CAUSA_MAX: 500,
  OBSERVACAO_MAX: 500,
  ANO_MINIMO: 2015
};

const REGEX_CODIGO = /^[A-Z0-9._\-\/#+]+$/;

/**
 * Valida os dados de um extravio vindos do formulário.
 *
 * @param {Object} dados Campos crus enviados pelo cliente.
 * @param {Object} listas Resultado de cfgListas_().
 * @return {{valido: boolean, erros: Object<string,string>, valores: Object}}
 */
function validarExtravio_(dados, listas) {
  const entrada = dados || {};
  const erros = {};
  const valores = {};
  const parametros = listas.parametros || {};

  /* --- STATUS ------------------------------------------------------ */
  const statusPadrao = encontrarNaLista_(listas.status, STATUS.PADRAO) ||
    (listas.status.length ? listas.status[0] : STATUS.PADRAO);

  const statusEnviado = texto_(entrada.status);
  if (!statusEnviado) {
    valores.status = statusPadrao;
  } else {
    const statusCanonico = encontrarNaLista_(listas.status, statusEnviado);
    if (!statusCanonico) {
      erros.status = 'Selecione um status válido.';
    } else {
      valores.status = statusCanonico;
    }
  }

  /* --- TRANSPORTADORA ---------------------------------------------- */
  const transportadora = texto_(entrada.transportadora);
  if (!transportadora) {
    erros.transportadora = 'Selecione a transportadora.';
  } else {
    const canonica = encontrarNaLista_(listas.transportadoras, transportadora);
    if (!canonica) {
      erros.transportadora = 'Transportadora não cadastrada na aba CONFIG.';
    } else {
      valores.transportadora = canonica;
    }
  }

  /* --- DATA --------------------------------------------------------- */
  const data = parseData_(entrada.data);
  if (!texto_(entrada.data)) {
    erros.data = 'Informe a data do extravio.';
  } else if (!data) {
    erros.data = 'Data inválida. Use o formato DD/MM/AAAA.';
  } else if (data.getFullYear() < LIMITES.ANO_MINIMO) {
    erros.data = 'Data muito antiga. Confira o ano informado.';
  } else if (dataParaIso_(data) > proximoDiaIso_()) {
    erros.data = 'A data não pode ser futura.';
  } else {
    valores.data = data;
  }

  /* --- HORA --------------------------------------------------------- */
  if (!texto_(entrada.hora)) {
    erros.hora = 'Informe a hora do extravio.';
  } else {
    const hora = parseHora_(entrada.hora);
    if (!hora) {
      erros.hora = 'Hora inválida. Use o formato HH:MM.';
    } else {
      valores.hora = hora;
    }
  }

  /* --- CODIGO ------------------------------------------------------- */
  const codigo = normalizarCodigo_(entrada.codigo);
  if (!codigo) {
    erros.codigo = 'Informe o código do objeto.';
  } else if (codigo.length < LIMITES.CODIGO_MIN) {
    erros.codigo = 'O código deve ter pelo menos ' + LIMITES.CODIGO_MIN + ' caracteres.';
  } else if (codigo.length > LIMITES.CODIGO_MAX) {
    erros.codigo = 'O código deve ter no máximo ' + LIMITES.CODIGO_MAX + ' caracteres.';
  } else if (!REGEX_CODIGO.test(codigo)) {
    erros.codigo = 'Código inválido: use apenas letras, números e os sinais - _ . / #';
  } else {
    valores.codigo = codigo;
  }

  /* --- VALOR -------------------------------------------------------- */
  const valorMaximo = parametroNumero_(parametros, 'VALOR_MAXIMO', 100000);
  if (texto_(entrada.valor) === '') {
    erros.valor = 'Informe o valor do objeto.';
  } else {
    const valor = parseValor_(entrada.valor);
    if (valor === null) {
      erros.valor = 'Valor inválido. Exemplo: R$ 25,50.';
    } else if (valor < 0) {
      erros.valor = 'O valor não pode ser negativo.';
    } else if (valor > valorMaximo) {
      erros.valor = 'Valor acima do limite permitido (' + formatarMoedaBr_(valorMaximo) + ').';
    } else {
      valores.valor = valor;
    }
  }

  /* --- RESPONSAVEL --------------------------------------------------- */
  const responsavel = texto_(entrada.responsavel);
  if (!responsavel) {
    erros.responsavel = 'Selecione o responsável.';
  } else {
    let canonico = encontrarNaLista_(listas.responsaveis, responsavel);
    if (!canonico) {
      // Aceita também quem está na aba ENTREGADORES marcado como inativo.
      canonico = encontrarNaLista_(cfgTodosEntregadores_(), responsavel);
    }
    if (!canonico) {
      erros.responsavel = 'Responsável não encontrado na aba ENTREGADORES.';
    } else {
      valores.responsavel = canonico;
    }
  }

  /* --- ENDERECO ------------------------------------------------------ */
  const endereco = texto_(entrada.endereco);
  if (!endereco) {
    erros.endereco = 'Informe o endereço.';
  } else if (endereco.length < LIMITES.ENDERECO_MIN) {
    erros.endereco = 'Endereço muito curto.';
  } else if (endereco.length > LIMITES.ENDERECO_MAX) {
    erros.endereco = 'Endereço muito longo (máximo ' + LIMITES.ENDERECO_MAX + ' caracteres).';
  } else {
    valores.endereco = endereco;
  }

  /* --- CAUSA DO PROBLEMA ---------------------------------------------- */
  const causa = textoMultilinha_(entrada.causa);
  if (!causa) {
    erros.causa = 'Descreva a causa do problema.';
  } else if (causa.length < LIMITES.CAUSA_MIN) {
    erros.causa = 'Descrição muito curta.';
  } else if (causa.length > LIMITES.CAUSA_MAX) {
    erros.causa = 'Descrição muito longa (máximo ' + LIMITES.CAUSA_MAX + ' caracteres).';
  } else {
    valores.causa = causa;
  }

  /* --- DATA DE DESCONTO ------------------------------------------------ */
  const exigirDesconto = parametroBooleano_(parametros, 'EXIGIR_DATA_DESCONTO', true);
  const dataDescontoTexto = texto_(entrada.dataDesconto);
  const paraDesconto = chaveComparacao_(valores.status) === chaveComparacao_(STATUS.PARA_DESCONTO);

  if (!dataDescontoTexto) {
    if (paraDesconto && exigirDesconto) {
      erros.dataDesconto = 'Com o status "' + STATUS.PARA_DESCONTO + '", informe a data do desconto.';
    } else {
      valores.dataDesconto = '';
    }
  } else {
    const dataDesconto = parseData_(dataDescontoTexto);
    if (!dataDesconto) {
      erros.dataDesconto = 'Data de desconto inválida. Use DD/MM/AAAA.';
    } else if (dataDesconto.getFullYear() < LIMITES.ANO_MINIMO) {
      erros.dataDesconto = 'Data de desconto muito antiga. Confira o ano informado.';
    } else {
      valores.dataDesconto = dataDesconto;
    }
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros: erros,
    valores: valores
  };
}

/**
 * Valida uma solicitação de alteração de status.
 *
 * @param {Object} dados {id, status, dataDesconto, observacao}
 * @param {Object} listas Resultado de cfgListas_().
 * @return {{valido: boolean, erros: Object<string,string>, valores: Object}}
 */
function validarAlteracaoStatus_(dados, listas) {
  const entrada = dados || {};
  const erros = {};
  const valores = {};

  const id = Number(entrada.id);
  if (!isFinite(id) || id <= 0) {
    erros.id = 'Registro inválido.';
  } else {
    valores.id = Math.floor(id);
  }

  const status = encontrarNaLista_(listas.status, entrada.status);
  if (!status) {
    erros.status = 'Selecione um status válido.';
  } else {
    valores.status = status;
  }

  const dataDescontoTexto = texto_(entrada.dataDesconto);
  if (dataDescontoTexto) {
    const dataDesconto = parseData_(dataDescontoTexto);
    if (!dataDesconto) {
      erros.dataDesconto = 'Data de desconto inválida. Use DD/MM/AAAA.';
    } else {
      valores.dataDesconto = dataDesconto;
    }
  } else {
    valores.dataDesconto = null;
  }

  const observacao = textoMultilinha_(entrada.observacao);
  if (observacao.length > LIMITES.OBSERVACAO_MAX) {
    erros.observacao = 'Observação muito longa (máximo ' + LIMITES.OBSERVACAO_MAX + ' caracteres).';
  } else {
    valores.observacao = observacao;
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros: erros,
    valores: valores
  };
}

/** @return {string} Amanhã em "yyyy-MM-dd" (tolerância para o fuso do cliente). */
function proximoDiaIso_() {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  return Utilities.formatDate(amanha, fusoHorario_(), 'yyyy-MM-dd');
}
