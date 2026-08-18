/**
 * Utils.gs
 * Funções utilitárias: texto, moeda, datas, usuário e logs.
 * Nenhuma delas conhece regras de negócio.
 */

let TZ_MEMO_ = null;

/** @return {string} Fuso horário efetivo da planilha. */
function fusoHorario_() {
  if (TZ_MEMO_) return TZ_MEMO_;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const tz = ss.getSpreadsheetTimeZone();
      if (tz) { TZ_MEMO_ = tz; return tz; }
    }
  } catch (err) { /* segue para o próximo fallback */ }
  try {
    const tz = Session.getScriptTimeZone();
    if (tz) { TZ_MEMO_ = tz; return tz; }
  } catch (err) { /* segue para o próximo fallback */ }
  TZ_MEMO_ = APP.TIMEZONE;
  return TZ_MEMO_;
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

/**
 * Converte para string, remove espaços das pontas e colapsa espaços internos.
 * @param {*} valor
 * @return {string}
 */
function texto_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

/**
 * Igual a texto_, mas preserva quebras de linha (campos longos).
 * @param {*} valor
 * @return {string}
 */
function textoMultilinha_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove acentos (para comparações tolerantes).
 * @param {*} valor
 * @return {string}
 */
function semAcentos_(valor) {
  const s = valor === null || valor === undefined ? '' : String(valor);
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (err) {
    return s;
  }
}

/**
 * Chave canônica de comparação: sem acentos, maiúsculo, sem espaços extras.
 * @param {*} valor
 * @return {string}
 */
function chaveComparacao_(valor) {
  return semAcentos_(texto_(valor)).toUpperCase();
}

/**
 * Normaliza um código de objeto: maiúsculo, sem espaços internos.
 * @param {*} valor
 * @return {string}
 */
function normalizarCodigo_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, '').trim().toUpperCase();
}

/**
 * Procura um valor em uma lista ignorando caixa e acentos.
 * @param {string[]} lista
 * @param {*} valor
 * @return {?string} O valor canônico da lista ou null.
 */
function encontrarNaLista_(lista, valor) {
  const alvo = chaveComparacao_(valor);
  if (!alvo || !lista) return null;
  for (let i = 0; i < lista.length; i++) {
    if (chaveComparacao_(lista[i]) === alvo) return texto_(lista[i]);
  }
  return null;
}

/**
 * Limita um número a um intervalo.
 * @param {number} valor
 * @param {number} minimo
 * @param {number} maximo
 * @return {number}
 */
function limitar_(valor, minimo, maximo) {
  const n = Number(valor);
  if (!isFinite(n)) return minimo;
  return Math.min(maximo, Math.max(minimo, Math.floor(n)));
}

/**
 * JSON.parse que nunca lança exceção.
 * @param {?string} texto
 * @return {*} null em caso de falha.
 */
function parseJsonSeguro_(texto) {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Moeda                                                               */
/* ------------------------------------------------------------------ */

/**
 * Arredonda para 2 casas evitando erros de ponto flutuante.
 * @param {number} valor
 * @return {number}
 */
function arredondar2_(valor) {
  const n = Number(valor);
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Converte texto monetário brasileiro em número.
 *   "R$ 1.234,56" -> 1234.56 | "25,50" -> 25.5 | "1.500" -> 1500 | "12.50" -> 12.5
 * @param {*} entrada
 * @return {?number} null quando não for possível interpretar.
 */
function parseValor_(entrada) {
  if (typeof entrada === 'number') return isFinite(entrada) ? arredondar2_(entrada) : null;
  if (entrada === null || entrada === undefined) return null;

  let s = String(entrada).trim();
  if (!s) return null;

  const negativo = /^\s*-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[Rr]\$/g, '').replace(/[\s ()+-]/g, '');
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  const temVirgula = s.indexOf(',') >= 0;
  const temPonto = s.indexOf('.') >= 0;

  if (temVirgula && temPonto) {
    // O separador decimal é o último que aparece.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (temVirgula) {
    const partes = s.split(',');
    s = partes.length > 2 ? partes.join('') : partes[0] + '.' + partes[1];
  } else if (temPonto) {
    const partes = s.split('.');
    if (partes.length > 2) {
      s = partes.join('');
    } else if (partes[1].length === 3 && partes[0].length > 0 && partes[0].length <= 3) {
      // "1.500" no padrão brasileiro é milhar, não decimal.
      s = partes.join('');
    }
  }

  const numero = Number(s);
  if (!isFinite(numero)) return null;
  return arredondar2_(negativo ? -numero : numero);
}

/**
 * Formata um número como moeda brasileira (usado em mensagens do servidor).
 * @param {number} valor
 * @return {string}
 */
function formatarMoedaBr_(valor) {
  const n = arredondar2_(valor);
  const negativo = n < 0;
  const partes = Math.abs(n).toFixed(2).split('.');
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negativo ? '-R$ ' : 'R$ ') + inteiro + ',' + partes[1];
}

/* ------------------------------------------------------------------ */
/* Datas e horas                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cria uma data "de dia" ancorada ao meio-dia, imune a deslocamentos de fuso.
 * @param {number} ano
 * @param {number} mes 1-12
 * @param {number} dia
 * @return {?Date}
 */
function criarData_(ano, mes, dia) {
  if (!isFinite(ano) || !isFinite(mes) || !isFinite(dia)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  return data;
}

/**
 * Interpreta uma data vinda do formulário ou da planilha.
 * Aceita Date, "yyyy-MM-dd", "dd/MM/yyyy" e "dd/MM/yy".
 * @param {*} entrada
 * @return {?Date}
 */
function parseData_(entrada) {
  if (entrada instanceof Date) {
    if (isNaN(entrada.getTime())) return null;
    return criarData_(entrada.getFullYear(), entrada.getMonth() + 1, entrada.getDate());
  }

  const s = texto_(entrada);
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return criarData_(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return criarData_(Number(m[3]), Number(m[2]), Number(m[1]));

  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/.exec(s);
  if (m) return criarData_(2000 + Number(m[3]), Number(m[2]), Number(m[1]));

  return null;
}

/**
 * Converte qualquer representação de data em "yyyy-MM-dd" (ou string vazia).
 * @param {*} entrada
 * @return {string}
 */
function dataParaIso_(entrada) {
  const data = parseData_(entrada);
  if (!data) return '';
  return Utilities.formatDate(data, fusoHorario_(), 'yyyy-MM-dd');
}

/**
 * @param {*} valor
 * @return {boolean} true quando for "yyyy-MM-dd" válido.
 */
function isoValido_(valor) {
  const s = texto_(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return parseData_(s) !== null;
}

/**
 * Interpreta uma hora e devolve "HH:mm".
 * @param {*} entrada
 * @return {?string}
 */
function parseHora_(entrada) {
  if (entrada instanceof Date) {
    if (isNaN(entrada.getTime())) return null;
    return Utilities.formatDate(entrada, fusoHorario_(), 'HH:mm');
  }

  const s = texto_(entrada).replace(/\s/g, '');
  if (!s) return null;

  let horas = null;
  let minutos = null;

  let m = /^(\d{1,2})[:hH.](\d{1,2})(?::\d{1,2})?$/.exec(s);
  if (m) {
    horas = Number(m[1]);
    minutos = Number(m[2]);
  } else {
    m = /^(\d{3,4})$/.exec(s);
    if (m) {
      const bruto = m[1].padStart(4, '0');
      horas = Number(bruto.substring(0, 2));
      minutos = Number(bruto.substring(2, 4));
    }
  }

  if (horas === null || minutos === null) return null;
  if (!isFinite(horas) || !isFinite(minutos)) return null;
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;

  return String(horas).padStart(2, '0') + ':' + String(minutos).padStart(2, '0');
}

/**
 * Converte um carimbo de data/hora em "dd/MM/yyyy HH:mm".
 * @param {*} entrada
 * @return {string}
 */
function dataHoraParaTexto_(entrada) {
  if (entrada instanceof Date) {
    if (isNaN(entrada.getTime())) return '';
    return Utilities.formatDate(entrada, fusoHorario_(), 'dd/MM/yyyy HH:mm');
  }
  return texto_(entrada);
}

/** @return {string} Data de hoje em "yyyy-MM-dd". */
function hojeIso_() {
  return Utilities.formatDate(new Date(), fusoHorario_(), 'yyyy-MM-dd');
}

/* ------------------------------------------------------------------ */
/* Usuário e logs                                                      */
/* ------------------------------------------------------------------ */

/**
 * E-mail de quem está usando o sistema.
 * Depende de como o Web App foi publicado; nunca lança exceção.
 * @return {string}
 */
function usuarioAtual_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (err) { /* sem permissão para identificar o usuário */ }
  try {
    const email = Session.getEffectiveUser().getEmail();
    if (email) return email;
  } catch (err) { /* idem */ }
  return 'não identificado';
}

/**
 * Registra o erro técnico apenas no log do Apps Script.
 * @param {string} contexto
 * @param {*} erro
 */
function logErro_(contexto, erro) {
  const detalhe = erro && erro.stack ? erro.stack : String(erro);
  console.error('[' + APP.NOME + '] ' + contexto + ' :: ' + detalhe);
}
