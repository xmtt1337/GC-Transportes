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
const CHAVE = 'agenda';
const FUSO = 'America/Sao_Paulo';

// `minutos` substituiu `horas`: de hora em hora era grosso demais pra quem quer
// a AT acompanhando o dia. O campo antigo ainda e lido, pra quem ja tinha
// agendamento salvo nao perder ele numa atualizacao.
const PADRAO = { modo: 'off', minutos: 60, horarios: [] };
// O Chrome nao dispara alarme mais rapido que isso.
const MINIMO_MINUTOS = 1;

function minutosDaAgenda(agenda) {
  const guardado = Number(agenda.minutos) || (Number(agenda.horas) || 0) * 60;
  return Math.max(MINIMO_MINUTOS, guardado || 60);
}

async function lerAgenda() {
  try {
    const guardado = await chrome.storage.local.get(CHAVE);
    return Object.assign({}, PADRAO, guardado[CHAVE] || {});
  } catch (e) {
    return Object.assign({}, PADRAO);
  }
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

function proximaHoraFixa(horas) {
  const agora = agoraEmBrasilia();
  const minutosAgora = agora.hora * 60 + agora.minuto + agora.segundo / 60;
  const falta = L.minutosAteProximaHora(horas || [], minutosAgora);
  return falta === null ? null : Date.now() + falta * 60000;
}

async function reagendar() {
  await chrome.alarms.clear(NOME_ALARME);
  const agenda = await lerAgenda();

  if (agenda.modo === 'intervalo') {
    const minutos = minutosDaAgenda(agenda);
    chrome.alarms.create(NOME_ALARME, { delayInMinutes: minutos, periodInMinutes: minutos });
  } else if (agenda.modo === 'horarios') {
    const quando = proximaHoraFixa(agenda.horarios);
    // Sem periodInMinutes: cada disparo marca o proximo. Um periodo fixo de 24h
    // iria escorregando, e a lista pode ter horarios de espacos diferentes.
    if (quando) chrome.alarms.create(NOME_ALARME, { when: quando });
  }

  const alarme = await chrome.alarms.get(NOME_ALARME);
  await chrome.storage.local.set({ proxima: alarme ? alarme.scheduledTime : null });
  return alarme ? alarme.scheduledTime : null;
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

async function disparar(qual = 'alimentacao', focar = false) {
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
    await anotar(`disparado: ${qual}`);
    return { ok: true };
  } catch (e) {
    // A aba existe mas a extensao nao entrou nela (foi aberta antes). Recarregar
    // resolve - e como quem manda aqui e o service worker, da pra esperar.
    try {
      await chrome.tabs.reload(aba.id);
      await esperarCarregar(aba.id);
      await chrome.tabs.sendMessage(aba.id, { xmMacro: qual, agendado: true });
      await anotar(`disparado: ${qual} (depois de recarregar a aba)`);
      return { ok: true };
    } catch (e2) {
      const motivo = String(e2.message || e2);
      await anotar('não rodou: ' + motivo);
      return { ok: false, error: motivo };
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name !== NOME_ALARME) return;
  await disparar();
  const agenda = await lerAgenda();
  if (agenda.modo === 'horarios') await reagendar();
  else {
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

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (!msg) return;

  if (msg.xmAgenda === 'reagendar') {
    reagendar().then((quando) => responder({ ok: true, proxima: quando }));
    return true;   // resposta assincrona
  }

  if (msg.xmRodar) {
    disparar(msg.xmRodar, !!msg.focar).then(
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

chrome.runtime.onInstalled.addListener(() => { reagendar(); });
chrome.runtime.onStartup.addListener(() => { reagendar(); });
