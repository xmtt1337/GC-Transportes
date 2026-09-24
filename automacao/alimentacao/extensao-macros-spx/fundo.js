// AGENDADOR - roda a alimentacao sozinha, de tempos em tempos.
//
// Vive no service worker porque o popup fecha assim que a pessoa clica em
// qualquer lugar, e um setTimeout dentro dele morreria junto. chrome.alarms
// sobrevive ao popup fechado, ao service worker dormindo e ao Chrome sendo
// reiniciado - alarme perdido com o navegador fechado dispara logo depois de
// abrir de novo.
//
// Dois modos, porque as duas perguntas sao diferentes:
//   intervalo  "de X em X minutos a partir de agora"
//   horarios   "todo dia as 8, as 12 e as 16" - em horario de Brasilia, e nao
//              no relogio da maquina: maquina com fuso errado rodaria na hora
//              errada e ninguem ligaria uma coisa na outra.
//
// Ele tambem e quem abre o SPX: o content script nao pode, porque morre junto
// com o reload, e o popup fecha antes de a pagina carregar.

// A conta dos horarios mora na logica, junto com o resto do que da pra testar
// sem navegador - agendar pra hora errada e erro que so aparece no dia
// seguinte, olhando o registro.
importScripts('logica.js');
const L = self.XMMacro.logica;

const NOME_ALARME = 'alimentacao';
// O Backlog tem alarme proprio, e MAIS LENTO que o da AT: o card do hub so
// atualiza de tempos em tempos na Shopee, e cada rodada grava o snapshot
// inteiro (1 a 4 mil linhas). De 5 em 5 min seriam ~290 copias quase iguais
// por dia - o banco ja passa de 2 GB. O padrao (60) e o piso (30) moram na
// logica.js, junto com o resto da conta de agenda.
const NOME_ALARME_BACKLOG = 'backlog';
// Pergunta ao vigia, de 30 em 30s, se a tela Macros do sistema pediu alguma
// coisa - e traz junto a agenda vigente. Ver "ponte com o XM Vigia", abaixo.
const NOME_ALARME_COMANDOS = 'comandos';
const CHAVE = 'agenda';
const CHAVE_SITE = 'agendaSite';
const CHAVE_VERSAO_SITE = 'agendaSiteVersao';
const FUSO = 'America/Sao_Paulo';

// `minutos` substituiu `horas`: de hora em hora era grosso demais pra quem quer
// a AT acompanhando o dia. O campo antigo ainda e lido (logica.agendaDoPopup),
// pra quem ja tinha agendamento salvo nao perder ele numa atualizacao.
//
// O piso do intervalo (20 min na AT) tambem mora na logica. Ja aconteceu duas
// vezes o mesmo problema: numero pequeno demais (1, 5 minutos) faz a AT
// Exportada gerar uma exportacao nova antes de Pedidos Pesquisados dar conta
// de buscar a de antes - o pendente vira uma bola de neve que so cresce (12
// mil pedidos pra buscar num dia so, em 23/09/2026).
const PADRAO = { modo: 'off', minutos: 60, horarios: [] };

// O que o popup guardou.
async function lerAgenda() {
  try {
    const guardado = await chrome.storage.local.get(CHAVE);
    return Object.assign({}, PADRAO, guardado[CHAVE] || {});
  } catch (e) {
    return Object.assign({}, PADRAO);
  }
}

// O que o sistema mandou (null se nunca mandou, ou se foi devolvido ao popup).
async function lerAgendaDoSite() {
  try {
    const guardado = await chrome.storage.local.get(CHAVE_SITE);
    return guardado[CHAVE_SITE] || null;
  } catch (e) {
    return null;
  }
}

// A que vale: o sistema manda quando mandou, o popup no resto.
async function agendaAtual() {
  return L.agendaEfetiva(await lerAgenda(), await lerAgendaDoSite());
}

// O relogio de Brasilia, independente do fuso da maquina.
function agoraEmBrasilia() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { hora: Number(p.hour) % 24, minuto: Number(p.minute), segundo: Number(p.second) };
}

// Quando e o proximo horario da lista (minutos do dia, em Brasilia), em ms.
function proximoHorario(minutosDoDia) {
  const agora = agoraEmBrasilia();
  const minutosAgora = agora.hora * 60 + agora.minuto + agora.segundo / 60;
  const falta = L.minutosAteProximoHorario(minutosDoDia || [], minutosAgora);
  return falta === null ? null : Date.now() + falta * 60000;
}

// Cria o alarme de um macro conforme a agenda dele: intervalo (periodico) ou
// horarios fixos. 'junto' e 'off' nao criam nada - o primeiro roda dentro do
// alarme da AT, o segundo nao roda.
async function criarAlarmeDe(nome, agenda, minutosAteOPrimeiro) {
  if (agenda.modo === 'intervalo') {
    chrome.alarms.create(nome, {
      delayInMinutes: minutosAteOPrimeiro === undefined ? agenda.minutos : minutosAteOPrimeiro,
      periodInMinutes: agenda.minutos,
    });
  } else if (agenda.modo === 'horarios') {
    const quando = proximoHorario(agenda.horarios);
    // Sem periodInMinutes: cada disparo marca o proximo. Um periodo fixo de 24h
    // iria escorregando, e a lista pode ter horarios de espacos diferentes.
    if (quando) chrome.alarms.create(nome, { when: quando });
  }
}

async function reagendar() {
  await chrome.alarms.clear(NOME_ALARME);
  await chrome.alarms.clear(NOME_ALARME_BACKLOG);
  const { at, backlog } = await agendaAtual();

  await criarAlarmeDe(NOME_ALARME, at);
  // O Backlog conta da ULTIMA vez que rodou (a manual conta). Sem isso, cada
  // reagendar() - abrir o Chrome, mexer no popup - recomecaria a contagem do
  // zero e ele nunca chegaria a rodar.
  const guardado = await chrome.storage.local.get('ultimoBacklog');
  await criarAlarmeDe(NOME_ALARME_BACKLOG, backlog,
    L.minutosParaProximoBacklog(backlog.minutos, guardado.ultimoBacklog, Date.now()));

  const alarme = await chrome.alarms.get(NOME_ALARME);
  await chrome.storage.local.set({ proxima: alarme ? alarme.scheduledTime : null });
  return alarme ? alarme.scheduledTime : null;
}

// Disparo bem-sucedido: alem do registro, o Backlog guarda QUANDO rodou - e o
// que o proximo agendamento usa pra nao repetir cedo demais.
async function anotarDisparo(qual, origem, extra) {
  await anotar(`disparado: ${qual} (${origem})${extra || ''}`);
  if (qual === 'backlog') await chrome.storage.local.set({ ultimoBacklog: Date.now() });
}

async function anotar(texto) {
  await chrome.storage.local.set({
    ultimoDisparo: { quando: new Date().toISOString(), texto },
  });
  console.log('[XM Macros] ' + texto);
}

const RAIZ_SPX = 'https://spx.shopee.com.br/';
const TELA_DE = {
  alimentacao: '#/delivery-assignment/list',
  pedidos: '#/orderTracking',
  backlog: '#/dashboard/all-mile-hub/lm',
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a aba terminar de carregar, mais uma folga pro SPA se montar. */
async function esperarCarregar(abaId, limite = 60000) {
  // A navegacao nao comeca no mesmo instante: sem esta folga, a primeira olhada
  // pega a pagina ANTERIOR ainda em "complete" e o macro sai clicando nela.
  await dormir(600);
  const fim = Date.now() + limite;
  while (Date.now() < fim) {
    const aba = await chrome.tabs.get(abaId).catch(() => null);
    if (!aba) return false;
    if (aba.status === 'complete') { await dormir(2500); return true; }
    await dormir(400);
  }
  return false;
}

/**
 * A aba onde o macro vai rodar, ja na tela dele.
 *
 * CADA MACRO FICA NA PROPRIA ABA. Antes, quando nao havia aba na tela certa,
 * ele pegava qualquer aba do SPX - e essa era justamente a do outro macro, que
 * era entao arrastado pra outra tela no meio do trabalho. Os dois brigavam
 * pela mesma aba.
 *
 * Se nao houver aba na tela do macro, abre uma nova em vez de sequestrar a do
 * vizinho. No maximo sobra uma aba por macro, reusada nas proximas vezes.
 */
async function abaDoSpx(qual) {
  let abas = [];
  try {
    abas = await chrome.tabs.query({ url: `${RAIZ_SPX}*` });
  } catch (e) {
    abas = [];
  }

  const tela = TELA_DE[qual] || TELA_DE.alimentacao;
  const marca = tela.replace('#/', '');
  const jaNaTela = abas.find((t) => String(t.url || '').includes(marca));
  if (jaNaTela) return jaNaTela;

  // Aba do SPX que nao seja de nenhum macro (ninguem trabalhando nela) pode ser
  // aproveitada; a do outro macro, nao.
  const ocupadas = Object.values(TELA_DE).map((t) => t.replace('#/', ''));
  const livre = abas.find((t) => !ocupadas.some((o) => String(t.url || '').includes(o)));
  if (livre) {
    await chrome.tabs.update(livre.id, { url: RAIZ_SPX + tela });
    await esperarCarregar(livre.id);
    return livre;
  }

  // Em segundo plano pra nao roubar a tela de quem estiver usando o computador.
  const nova = await chrome.tabs.create({ url: RAIZ_SPX + tela, active: false });
  await esperarCarregar(nova.id);
  return nova;
}

// `origem` so vai pro registro - nao muda nada no que o macro faz. Existe
// porque "disparado: alimentacao" sozinho nao dizia se foi o alarme ou um
// clique no popup, e isso importa: duas rodadas de 35 segundos de distancia
// pareciam alarme mal configurado, quando na verdade era clique manual
// testando. Sem essa marca, cada vez que isso acontecesse de novo seria
// preciso reabrir essa investigacao do zero.
async function disparar(qual = 'alimentacao', focar = false, origem = 'agendado') {
  const aba = await abaDoSpx(qual);
  if (!aba) {
    const motivo = 'não consegui abrir o SPX';
    await anotar('não rodou: ' + motivo);
    return { ok: false, error: motivo };
  }
  // Quando foi a pessoa que mandou rodar, traz a aba pra frente - ela quer ver.
  // No disparo agendado, nao: roubar a tela de quem esta trabalhando e pior do
  // que rodar escondido.
  if (focar) {
    await chrome.tabs.update(aba.id, { active: true }).catch(() => {});
    await chrome.windows.update(aba.windowId, { focused: true }).catch(() => {});
  }
  try {
    const r = await chrome.tabs.sendMessage(aba.id, { xmMacro: qual, agendado: true });
    // O macro recusa quando ja esta rodando. Sem olhar a resposta, o popup
    // dizia "rodando" e a pessoa ficava esperando um segundo comeco que nao vem.
    if (r && r.ok === false) {
      const motivo = r.error || 'o macro recusou';
      await anotar('não rodou: ' + motivo);
      return { ok: false, error: motivo };
    }
    await anotarDisparo(qual, origem);
    return { ok: true };
  } catch (e) {
    // A aba existe mas a extensao nao entrou nela (foi aberta antes). Recarregar
    // resolve - e como quem manda aqui e o service worker, da pra esperar.
    try {
      await chrome.tabs.reload(aba.id);
      await esperarCarregar(aba.id);
      await chrome.tabs.sendMessage(aba.id, { xmMacro: qual, agendado: true });
      await anotarDisparo(qual, origem, ' (depois de recarregar a aba)');
      return { ok: true };
    } catch (e2) {
      const motivo = String(e2.message || e2);
      await anotar('não rodou: ' + motivo);
      return { ok: false, error: motivo };
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name === NOME_ALARME_COMANDOS) { await buscarComandos(); return; }

  if (alarme.name === NOME_ALARME_BACKLOG) {
    await disparar('backlog', false, 'agendado');
    // Em horarios fixos o alarme nao tem periodo: cada disparo marca o proximo.
    if ((await agendaAtual()).backlog.modo === 'horarios') await reagendar();
    return;
  }

  if (alarme.name !== NOME_ALARME) return;
  await disparar();
  const { at, backlog } = await agendaAtual();
  if (at.modo === 'horarios') {
    // Com a AT em horarios fixos e o Backlog sem agenda propria, ele roda
    // junto com ela ('junto'). Com agenda propria, tem o alarme dele.
    if (backlog.modo === 'junto') await disparar('backlog');
    await reagendar();
  } else {
    const atual = await chrome.alarms.get(NOME_ALARME);
    await chrome.storage.local.set({ proxima: atual ? atual.scheduledTime : null });
  }
});

// ── ponte com o XM Vigia ────────────────────────────────────────────────────
// A extensao nao alcanca banco nem backend; quem tem o login e o vigia, que
// roda na maquina. O pedido sai DAQUI, e nao do content script, porque pagina
// HTTPS falando com http://127.0.0.1 esbarra no bloqueio de rede privada do
// Chrome - e o erro que chega la e um "failed to fetch" que nao conta nada.
const VIGIA = 'http://127.0.0.1:49732';

async function pendentesDoVigia(limite) {
  const quanto = Math.max(1, Math.min(10000, Number(limite) || 10000));
  const corte = AbortSignal.timeout ? AbortSignal.timeout(120000) : undefined;
  const r = await fetch(`${VIGIA}/pendentes?limite=${quanto}`, { signal: corte });
  if (!r.ok) {
    let motivo = `respondeu ${r.status}`;
    try {
      const corpo = await r.json();
      if (corpo && corpo.error) motivo = corpo.error;
    } catch (e) { /* corpo sem JSON nao muda o que dizer */ }
    throw new Error(motivo);
  }
  return r.json();
}

// ── a tela Macros do sistema ────────────────────────────────────────────────
// De 30 em 30s a extensao pergunta ao vigia (que pergunta ao servidor) se
// alguem clicou em "Rodar" na tela Macros, e traz a agenda que a tela
// configurou. Nada de o servidor chamar a maquina: ela e que puxa.
//
// O custo dessa pergunta constante e por conta do servidor - ele responde da
// memoria, sem tocar no banco (modules/macros-comando).
//
// COMANDO SAI DO SERVIDOR UMA VEZ SO. Por isso, o que chega aqui e executado
// mesmo que o resto da resposta (a agenda) de problema: cada parte protegida
// separada.
let buscandoComandos = false;
const MAX_COMANDOS_LEMBRADOS = 30;

async function garantirAlarmeDeComandos() {
  const existente = await chrome.alarms.get(NOME_ALARME_COMANDOS);
  if (!existente) {
    chrome.alarms.create(NOME_ALARME_COMANDOS, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  }
}

async function comandosDoVigia() {
  // O vigia espera ate 75s pelo servidor (15 de conexao + 60 de resposta).
  const corte = AbortSignal.timeout ? AbortSignal.timeout(90000) : undefined;
  const r = await fetch(`${VIGIA}/comandos`, { signal: corte });
  if (!r.ok) throw new Error(`o vigia respondeu ${r.status}`);
  return r.json();
}

// Conta ao servidor (pelo vigia) se o macro comecou - e o que a tela mostra.
async function contarResultado(id, r) {
  try {
    await fetch(`${VIGIA}/comandos/${encodeURIComponent(id)}/resultado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: !!(r && r.ok), error: r && r.error ? String(r.error) : null }),
    });
  } catch (e) { /* a tela mostra "sem confirmacao" - o macro em si nao depende disto */ }
}

async function executarComando(c) {
  if (!L.comandoValido(c)) return;

  // Um id ja visto nao roda de novo, mesmo que o servidor repita a entrega.
  const { comandosFeitos = [] } = await chrome.storage.local.get('comandosFeitos');
  if (comandosFeitos.includes(c.id)) return;
  await chrome.storage.local.set({
    comandosFeitos: [...comandosFeitos, c.id].slice(-MAX_COMANDOS_LEMBRADOS) });

  // Sem focar: quem clicou no sistema pode estar em qualquer lugar, e puxar o
  // SPX pra frente numa maquina que outra pessoa esta usando atrapalha. O
  // macro mostra o andamento no proprio painel da aba dele.
  //
  // Sem esperar: abrir a aba pode levar um minuto, e a proxima pergunta ao
  // vigia nao pode ficar parada atras disso.
  disparar(c.qual, false, 'site')
    .then((r) => contarResultado(c.id, r))
    .catch((e) => contarResultado(c.id, { ok: false, error: String(e.message || e) }));
}

async function aplicarAgendaDoSite(agenda) {
  const guardado = await chrome.storage.local.get(CHAVE_VERSAO_SITE);
  const acao = L.decidirAgendaDoSite(agenda, guardado[CHAVE_VERSAO_SITE]);
  if (acao === 'manter') return;
  if (acao === 'limpar') {
    await chrome.storage.local.remove([CHAVE_SITE, CHAVE_VERSAO_SITE]);
  } else {
    await chrome.storage.local.set({ [CHAVE_SITE]: agenda, [CHAVE_VERSAO_SITE]: agenda.versao });
  }
  await reagendar();
  console.log('[XM Macros] agenda do sistema: ' + acao);
}

async function buscarComandos() {
  if (buscandoComandos) return;
  buscandoComandos = true;
  try {
    let resposta;
    try {
      resposta = await comandosDoVigia();
    } catch (e) {
      // Vigia fechado, servidor dormindo, sem internet: silencio e tenta de novo
      // daqui a 30s. Anotar cada falha encheria o registro de nada.
      return;
    }
    for (const c of Array.isArray(resposta.comandos) ? resposta.comandos : []) {
      try { await executarComando(c); } catch (e) { console.log('[XM Macros] comando falhou: ' + e); }
    }
    try { await aplicarAgendaDoSite(resposta.agenda); }
    catch (e) { console.log('[XM Macros] agenda do sistema falhou: ' + e); }
  } finally {
    buscandoComandos = false;
  }
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (!msg) return;

  if (msg.xmAgenda === 'reagendar') {
    reagendar().then((quando) => responder({ ok: true, proxima: quando }));
    return true;   // resposta assincrona
  }

  if (msg.xmRodar) {
    // O encadeamento (AT Exportada chamando Pedidos Pesquisados sozinha, 15s
    // depois de terminar) passa por aqui tambem, com `encadeado: true` - sem
    // essa marca, o registro nao teria como diferenciar isso de alguem tendo
    // clicado no popup.
    const origem = msg.encadeado ? 'encadeado' : 'manual';
    disparar(msg.xmRodar, !!msg.focar, origem).then(
      (r) => responder(r),
      (e) => responder({ ok: false, error: String(e.message || e) }));
    return true;
  }

  if (msg.xmMacro === 'pendentes') {
    pendentesDoVigia(msg.limite).then(
      (d) => responder({ ok: true, ...d }),
      (e) => responder({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => { reagendar(); garantirAlarmeDeComandos(); });
chrome.runtime.onStartup.addListener(() => { reagendar(); garantirAlarmeDeComandos(); });
// Alarme sobrevive ao service worker dormindo, mas nao a uma extensao recarregada
// sem onInstalled (ex.: recarregar pela pagina de extensoes em algumas versoes).
garantirAlarmeDeComandos();
