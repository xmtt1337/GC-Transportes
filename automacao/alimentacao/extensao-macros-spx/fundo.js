// AGENDADOR - roda a alimentacao sozinha, de tempos em tempos.
//
// Vive no service worker porque o popup fecha assim que a pessoa clica em
// qualquer lugar, e um setTimeout dentro dele morreria junto. chrome.alarms
// sobrevive ao popup fechado, ao service worker dormindo e ao Chrome sendo
// reiniciado - alarme perdido com o navegador fechado dispara logo depois de
// abrir de novo.
//
// Dois modos, porque as duas perguntas sao diferentes:
//   intervalo  "de X em X horas a partir de agora"
//   horarios   "todo dia as 8, as 12 e as 16" - em horario de Brasilia, e nao
//              no relogio da maquina: maquina com fuso errado rodaria na hora
//              errada e ninguem ligaria uma coisa na outra.

// A conta dos horarios mora na logica, junto com o resto do que da pra testar
// sem navegador - agendar pra hora errada e erro que so aparece no dia
// seguinte, olhando o registro.
importScripts('logica.js');
const L = self.XMMacro.logica;

const NOME_ALARME = 'alimentacao';
const CHAVE = 'agenda';
const FUSO = 'America/Sao_Paulo';

const PADRAO = { modo: 'off', horas: 1, horarios: [] };

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
    const minutos = Math.max(1, Number(agenda.horas) || 1) * 60;
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

async function disparar() {
  let abas = [];
  try {
    abas = await chrome.tabs.query({ url: 'https://spx.shopee.com.br/*' });
  } catch (e) {
    abas = [];
  }
  // A tela certa primeiro; se nao houver, qualquer aba do SPX serve pra tentar.
  const aba = abas.find((t) => String(t.url || '').includes('delivery-assignment')) || abas[0];
  if (!aba) {
    await anotar('não rodou: nenhuma aba do SPX aberta');
    return;
  }
  try {
    await chrome.tabs.sendMessage(aba.id, { xmMacro: 'alimentacao', agendado: true });
    await anotar('disparado na aba do SPX');
  } catch (e) {
    // Sempre a mesma causa: a aba foi aberta antes da extensao entrar.
    await anotar('não rodou: dê F5 na aba do SPX');
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

  if (msg.xmMacro === 'pendentes') {
    pendentesDoVigia(msg.limite).then(
      (d) => responder({ ok: true, ...d }),
      (e) => responder({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => { reagendar(); });
chrome.runtime.onStartup.addListener(() => { reagendar(); });
