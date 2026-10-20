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

// Falha de disparo: alem do registro local, conta ao sistema. `nivel`: "aviso" quando o macro
// RECUSOU (ja estava rodando - nao e defeito), "erro" quando nao deu nem pra comecar.
async function anotarFalha(qual, motivo, nivel = 'erro') {
  await anotar('não rodou: ' + motivo);
  enviarEvento({ macro: qual, nivel, texto: 'Não rodou: ' + motivo });
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
  // As duas do Colador levam so pra LISTA (Entrada > Recebimento, Entrega >
  // Sorting Task Management) - a tela onde se digita de fato tem um id que
  // muda a cada recebimento/tarefa criado, entao nao da pra navegar direto pra
  // ela. E o colador.js (content script) que continua dai: cria a RT ou a
  // tarefa de separacao e entra nela sozinho.
  recebimento: '#/generalReceiveTaskOps',
  at_cluster: '#/sorting-task/list',
  // Criar AT (entregadores): a mesma lista da AT Exportada - o colador.js volta pra ela a cada código.
  criar_at: '#/delivery-assignment/list',
};

// O "ja estou na tela" do Colador precisa ser mais LARGO que o endereco de
// navegar acima: uma aba que ja esta dentro de uma RT (singleReceiveNew/<id>)
// ou de uma tarefa de separacao (sorting-task/detail?taskId=<id>) tambem conta
// como "ja esta la" - navegar pra lista de novo reiniciaria o trabalho.
const PAGINA_COLADOR = {
  recebimento: 'generalReceiveTaskOps',
  at_cluster: 'sorting-task',
  criar_at: 'assignment',
};

// Abas que estão rodando OUTRO macro agora (pela atividade do painel): nunca servem pra este. A AT
// Exportada e o Criar AT usam a mesma tela - sem isto um pegaria a aba do outro no meio do trabalho.
async function abasOcupadasPorOutro(qual) {
  try {
    const mapa = await carregarAtividade();
    return new Set(Object.entries(mapa)
      .filter(([, a]) => a && a.estado === 'rodando' && a.macro && a.macro !== qual)
      .map(([aba]) => Number(aba)));
  } catch (e) { return new Set(); }
}

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

  const ocupadas = await abasOcupadasPorOutro(qual);
  abas = abas.filter((t) => !ocupadas.has(t.id));

  const tela = TELA_DE[qual] || TELA_DE.alimentacao;
  // Pro Colador a marca e mais larga que o endereco de navegar (ver
  // PAGINA_COLADOR acima); pros outros tres continua sendo o proprio hash.
  const marca = PAGINA_COLADOR[qual] || tela.replace('#/', '');
  const jaNaTela = abas.find((t) => String(t.url || '').includes(marca));
  if (jaNaTela) return jaNaTela;

  // Aba do SPX que nao seja de nenhum macro (ninguem trabalhando nela) pode ser
  // aproveitada; a do outro macro, nao.
  const deMacro = [...Object.values(TELA_DE).map((t) => t.replace('#/', '')), ...Object.values(PAGINA_COLADOR)];
  const livre = abas.find((t) => !deMacro.some((o) => String(t.url || '').includes(o)));
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

// Igual abaDoSpx, mas NUNCA cria/navega uma aba - pra "parar" um comando: se não há aba
// aberta nessa tela, não há nada rodando lá pra parar mesmo.
async function abaExistenteDoSpx(qual) {
  let abas = [];
  try {
    abas = await chrome.tabs.query({ url: `${RAIZ_SPX}*` });
  } catch (e) {
    abas = [];
  }
  const tela = TELA_DE[qual] || TELA_DE.alimentacao;
  const marca = PAGINA_COLADOR[qual] || tela.replace('#/', '');
  return abas.find((t) => String(t.url || '').includes(marca)) || null;
}

// `origem` so vai pro registro - nao muda nada no que o macro faz. Existe
// porque "disparado: alimentacao" sozinho nao dizia se foi o alarme ou um
// clique no popup, e isso importa: duas rodadas de 35 segundos de distancia
// pareciam alarme mal configurado, quando na verdade era clique manual
// testando. Sem essa marca, cada vez que isso acontecesse de novo seria
// preciso reabrir essa investigacao do zero.
// ── o polo de cada relatório (escolhido na tela Macros do sistema) ─────────
const RELATORIOS = ['alimentacao', 'pedidos', 'backlog'];

async function polosDoSite() {
  try { return (await chrome.storage.local.get('polosSite')).polosSite || {}; } catch (e) { return {}; }
}

// A estação da aba, perguntada a ela. A tela do SPX demora a desenhar a barra da esquerda depois
// de abrir: tenta por alguns segundos antes de desistir.
async function xptDaAba(abaId) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await chrome.tabs.sendMessage(abaId, { xmEstacao: true });
      const xpt = r && L.xptDaEstacao(r.estacao);
      if (xpt) return xpt;
    } catch (e) { /* content script ainda não entrou */ }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return null;
}

// O que a aba contou da estação dela: vai junto quando a extensão pergunta por comandos, pro
// servidor entregar a cada Chrome só o que é do polo dele.
async function xptDoPerfil() {
  try {
    const { estacaoPerfil } = await chrome.storage.local.get('estacaoPerfil');
    // Vale a última que este Chrome viu, por mais antiga que seja: o perfil do Chrome fica logado
    // na mesma estação, e é por ela que o servidor entrega as sessões do Colador DESTE polo
    // (sem polo, nenhuma - antes, depois de 1h sem aba do SPX, o Chrome ficava sem polo e pegava
    // pedido do outro, 20/10/2026). Trocou de estação: spx.js conta de novo em até 1 min.
    if (!estacaoPerfil) return null;
    return estacaoPerfil.xpt || null;
  } catch (e) { return null; }
}

async function disparar(qual = 'alimentacao', focar = false, origem = 'agendado', config, idComando) {
  const aba = await abaDoSpx(qual);
  if (!aba) {
    const motivo = 'não consegui abrir o SPX';
    await anotarFalha(qual, motivo);
    return { ok: false, error: motivo };
  }
  // Polo escolhido no sistema: só roda se a aba estiver nele. Quem clica no popup decide na hora
  // (manual não passa por aqui); o agendado de outro polo é do OUTRO Chrome, então só anota.
  if (RELATORIOS.includes(qual) && origem !== 'manual') {
    const exigido = (config && config.xpt) || (await polosDoSite())[qual] || null;
    if (exigido) {
      // A aba não respondeu a estação a tempo (carregando, janela escondida): vale a última que
      // este Chrome contou. Sem isso o Chrome do OUTRO polo reclamava em vez de só pular.
      const d = L.decidirPolo(exigido, (await xptDaAba(aba.id)) || (await xptDoPerfil()));
      if (!d.rodar) {
        if (d.outroPolo && origem !== 'site') {
          await anotar(`pulado: ${qual} — ${d.motivo}`);
          return { ok: false, error: d.motivo, pulado: true };
        }
        await anotarFalha(qual, d.motivo, 'aviso');
        return { ok: false, error: d.motivo };
      }
    }
  }
  // Quando foi a pessoa que mandou rodar, traz a aba pra frente - ela quer ver.
  // No disparo agendado, nao: roubar a tela de quem esta trabalhando e pior do
  // que rodar escondido.
  // A ABA vem pra frente SEMPRE (dentro da janela dela); a JANELA so quando foi a pessoa que
  // mandou. Aba escondida atras de outra tem timer estrangulado e menu de hover que nao abre -
  // o Pedidos so exportava com alguem olhando (05/10/2026). Trocar a aba ativa nao rouba o
  // teclado de quem esta em outro programa; trazer a janela pra frente roubaria.
  await chrome.tabs.update(aba.id, { active: true }).catch(() => {});
  if (focar) {
    await chrome.windows.update(aba.windowId, { focused: true }).catch(() => {});
  }
  const msg = { xmMacro: qual, agendado: true };
  if (config !== undefined) msg.config = config;
  // O Pedidos encadeado na AT espera a carga chegar no banco em vez de falhar
  // no primeiro "0 codigos" (ver pedidos.js, pedirCodigos).
  if (origem === 'encadeado') msg.encadeado = true;
  // Só o Colador usa isso - deixa um "parar" remoto mirar o comando CERTO, não só o qual (ver
  // pararSeNecessario): sem o id, um pedido de parar atrasado podia derrubar uma rodada nova que
  // nem tem a ver com ele, só por ser do mesmo qual na mesma máquina (bug real, 01/10/2026).
  if (idComando !== undefined) msg.idComando = idComando;
  try {
    const r = await chrome.tabs.sendMessage(aba.id, msg);
    // O macro recusa quando ja esta rodando. Sem olhar a resposta, o popup
    // dizia "rodando" e a pessoa ficava esperando um segundo comeco que nao vem.
    if (r && r.ok === false) {
      const motivo = r.error || 'o macro recusou';
      await anotarFalha(qual, motivo, 'aviso');
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
      await chrome.tabs.sendMessage(aba.id, msg);
      await anotarDisparo(qual, origem, ' (depois de recarregar a aba)');
      return { ok: true };
    } catch (e2) {
      const motivo = String(e2.message || e2);
      await anotarFalha(qual, motivo);
      return { ok: false, error: motivo };
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name === NOME_ALARME_COMANDOS) { await buscarComandos(); await retomarColadores(); return; }

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

async function pendentesDoVigia(limite, estacao) {
  const quanto = Math.max(1, Math.min(10000, Number(limite) || 10000));
  const params = new URLSearchParams({ limite: String(quanto) });
  if (estacao) params.set('estacao', estacao);
  const corte = AbortSignal.timeout ? AbortSignal.timeout(120000) : undefined;
  const r = await fetch(`${VIGIA}/pendentes?${params}`, { signal: corte });
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

// ── ponte com o vigia pro Colador ───────────────────────────────────────────
// Mesmo motivo do pendentesDoVigia acima: o content script (mundo HTTPS do SPX) esbarra no
// bloqueio de rede privada do Chrome ao falar com 127.0.0.1 - quem pergunta ao vigia e o
// service worker, que repassa a resposta pela mensagem que o content script mandou.
async function pedirAoVigia(caminho, opcoes) {
  const o = opcoes || {};
  const corte = AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined;
  const r = await fetch(`${VIGIA}${caminho}`, {
    method: o.corpo ? 'POST' : 'GET',
    headers: o.corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: o.corpo ? JSON.stringify(o.corpo) : undefined,
    signal: corte,
  });
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

function coladorLote({ modo, tam, carencia, dia, xpt }) {
  const params = new URLSearchParams({ modo: String(modo), tam: String(tam), carencia: String(carencia) });
  if (dia) params.set('dia', dia);
  if (xpt) params.set('xpt', xpt);
  return pedirAoVigia(`/colador/lote?${params}`);
}

const coladorConfirmar = ({ modo, tabela, ids }) =>
  pedirAoVigia('/colador/confirmar', { corpo: { modo, tabela, ids } });
const coladorLiberar = ({ modo, tabela, ids }) =>
  pedirAoVigia('/colador/liberar', { corpo: { modo, tabela, ids } });
const coladorAt = ({ codigo, dia, at }) =>
  pedirAoVigia('/colador/at', { corpo: { codigo, dia, at } });
// Criar AT: o SPX recusou o código - o pedido fica com o motivo (o entregador vê) e sai da fila.
const coladorFalhou = ({ modo, tabela, id, erro }) =>
  pedirAoVigia('/colador/falhou', { corpo: { modo, tabela, id, erro } });

// ── contar ao sistema o que aconteceu ───────────────────────────────────────
// O painel do macro (na aba do SPX) e o disparo avisam aqui; a extensao leva ao vigia, que
// carimba o nome do computador e manda ao sistema. Se o vigia estiver fechado (justamente o
// tipo de problema que vale contar), o evento espera guardado - com a hora de quando
// aconteceu - e sai na primeira consulta que der certo.
const MAX_EVENTOS_GUARDADOS = 20;

async function mandarEventoAoVigia(ev) {
  const corte = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
  const r = await fetch(`${VIGIA}/eventos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev), signal: corte,
  });
  if (!r.ok) throw new Error(`o vigia respondeu ${r.status}`);
}

async function enviarEvento(ev) {
  if (!ev || !ev.macro || !ev.nivel || !ev.texto) return false;
  try {
    await mandarEventoAoVigia(ev);
    return true;
  } catch (e) {
    try {
      const { eventosGuardados = [] } = await chrome.storage.local.get('eventosGuardados');
      await chrome.storage.local.set({
        eventosGuardados: [...eventosGuardados, { ...ev, quando: new Date().toISOString() }]
          .slice(-MAX_EVENTOS_GUARDADOS) });
    } catch (e2) { /* sem onde guardar: perde este, o macro segue */ }
    return false;
  }
}

// O vigia acabou de responder: entrega o que ficou esperando.
async function entregarEventosGuardados() {
  const { eventosGuardados = [] } = await chrome.storage.local.get('eventosGuardados');
  if (!eventosGuardados.length) return;
  const faltam = [];
  for (const ev of eventosGuardados) {
    try { await mandarEventoAoVigia(ev); } catch (e) { faltam.push(ev); }
  }
  await chrome.storage.local.set({ eventosGuardados: faltam });
}

// ── o que está rodando agora (tela "Em execução" do sistema) ────────────────
// Cada aba com painel de macro manda a foto do andamento (painel.js). Aqui se junta a de todas
// as abas e manda ao vigia, que carimba o computador e repassa ao sistema - que guarda SÓ EM
// MEMÓRIA (nada disso toca o banco). Vai na mudança (juntando 2s) e a cada 30s junto da
// consulta de comandos, que serve de sinal de vida: lista vazia = extensão viva sem nada rodando.
// Guardado em storage.session porque o service worker dorme e perderia o que estava rodando.
const CHAVE_ATIVIDADE = 'atividadeAbas';
const GUARDAR_TERMINADO_MS = 30 * 60 * 1000;
let atividadeAbas = null;
let fotoMarcada = null;
let filaAtividade = Promise.resolve();

async function carregarAtividade() {
  if (atividadeAbas) return atividadeAbas;
  try {
    const o = await chrome.storage.session.get(CHAVE_ATIVIDADE);
    atividadeAbas = o[CHAVE_ATIVIDADE] || {};
  } catch (e) { atividadeAbas = {}; }
  return atividadeAbas;
}

function podarAtividade(mapa) {
  const corte = Date.now() - GUARDAR_TERMINADO_MS;
  for (const [aba, a] of Object.entries(mapa)) {
    if (a.terminou_em && a.terminou_em < corte) delete mapa[aba];
  }
}

// Serializado: duas abas contando ao mesmo tempo não podem apagar uma a mudança da outra.
function mudarAtividade(mudar) {
  filaAtividade = filaAtividade.then(async () => {
    const mapa = await carregarAtividade();
    mudar(mapa);
    podarAtividade(mapa);
    try { await chrome.storage.session.set({ [CHAVE_ATIVIDADE]: mapa }); } catch (e) { /* fica só na memória */ }
    if (!fotoMarcada) fotoMarcada = setTimeout(() => { fotoMarcada = null; mandarAtividade(); }, 2000);
  }).catch(() => {});
  return filaAtividade;
}

// O último desfecho de cada macro, guardado no storage.local: a aba some da foto 30 min depois de
// terminar, mas "a AT das 15:00 deu certo" tem que continuar aparecendo até a próxima rodada.
async function guardarUltimo(ativ) {
  const u = L.ultimoDoMacro(ativ);
  if (!u) return;
  try {
    const { ultimosMacros = {} } = await chrome.storage.local.get('ultimosMacros');
    ultimosMacros[ativ.macro] = u;
    await chrome.storage.local.set({ ultimosMacros });
  } catch (e) { /* acessorio */ }
}

// Quem é ESTE Chrome. Dois perfis no mesmo computador (um logado em Caçador, outro em Videira)
// falam com o mesmo vigia e têm o mesmo nome de máquina: sem isto, um apagaria o outro na tela.
async function perfilId() {
  try {
    const { perfilId: guardado } = await chrome.storage.local.get('perfilId');
    if (guardado) return guardado;
    const novo = (self.crypto && self.crypto.randomUUID ? self.crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 12);
    await chrome.storage.local.set({ perfilId: novo });
    return novo;
  } catch (e) { return ''; }
}

async function mandarAtividade() {
  try {
    const mapa = await carregarAtividade();
    podarAtividade(mapa);
    const abas = Object.entries(mapa).map(([aba, a]) => ({ aba, ...a }));
    // Os alarmes que vão disparar de verdade nesta máquina - é daí que sai "próxima às 15:31".
    let agendados = [];
    try { agendados = L.agendadosDosAlarmes(await chrome.alarms.getAll(), await agendaAtual()); } catch (e) { /* sem agenda */ }
    let ultimos = {};
    try { ultimos = (await chrome.storage.local.get('ultimosMacros')).ultimosMacros || {}; } catch (e) { /* sem storage */ }
    const corte = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
    await fetch(`${VIGIA}/atividade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // xpt: a estação que as abas do SPX deste Chrome mostram (spx.js conta de minuto em minuto).
      // Sem ela, um Chrome parado - sem macro rodando nem rodada guardada - não diria o polo.
      body: JSON.stringify({ agora: Date.now(), versao: chrome.runtime.getManifest().version, perfil: await perfilId(),
        xpt: await xptDoPerfil(), abas, agendados, ultimos }),
      signal: corte,
    });
  } catch (e) { /* vigia fechado: a tela mostra "sem sinal" */ }
}

chrome.tabs.onRemoved.addListener((abaId) => {
  mudarAtividade((mapa) => { delete mapa[String(abaId)]; });
});

// Aba recarregada no meio do macro: o content script morreu junto, e sem isto a tela
// mostraria "rodando" pra sempre.
chrome.tabs.onUpdated.addListener((abaId, mudanca) => {
  if (!mudanca || mudanca.status !== 'loading') return;
  mudarAtividade((mapa) => {
    const a = mapa[String(abaId)];
    if (a && a.estado === 'rodando') {
      a.estado = 'interrompido';
      a.terminou_em = Date.now();
      a.passo = 'a aba recarregou no meio do macro';
    }
  });
});

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
  const xpt = await xptDoPerfil();
  const r = await fetch(`${VIGIA}/comandos${xpt ? `?xpt=${encodeURIComponent(xpt)}` : ''}`, { signal: corte });
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

// ── sessões do Colador que voltam sozinhas ──────────────────────────────────
// Guardadas no storage.local (sobrevivem a F5, extensão atualizada e Chrome reaberto). Saem só
// quando a pessoa para (tela ou painel), quando a sessão termina por conta própria (sem modo
// contínuo) ou quando cai demais (ver L.decidirRetomarColador).
const CHAVE_SESSOES_COLADOR = 'sessoesColador';
let retomandoColador = false;

async function mudarSessoesColador(mudar) {
  try {
    const o = await chrome.storage.local.get(CHAVE_SESSOES_COLADOR);
    const sessoes = o[CHAVE_SESSOES_COLADOR] || {};
    mudar(sessoes);
    await chrome.storage.local.set({ [CHAVE_SESSOES_COLADOR]: sessoes });
  } catch (e) { /* sem storage: só não volta sozinha */ }
}

const lembrarSessaoColador = (qual, config) =>
  mudarSessoesColador((s) => { s[qual] = { qual, config, desde: Date.now(), tentativas: [], ultimaTentativa: Date.now() }; });
const esquecerSessaoColador = (qual) => mudarSessoesColador((s) => { delete s[qual]; });

// As sessões ligadas no servidor pra ESTE Chrome (computador + polo) passam a ser as daqui: as
// novas entram, as desligadas pela tela saem. Guarda as tentativas das que continuam.
async function sincronizarSessoesColador(doServidor) {
  if (!Array.isArray(doServidor)) return;   // servidor antigo / banco fora: mantém como está
  await mudarSessoesColador((s) => {
    const quais = new Set();
    for (const x of doServidor) {
      if (!x || !L.QUAIS_COLADOR.includes(x.qual) || !x.config || typeof x.config !== 'object') continue;
      quais.add(x.qual);
      s[x.qual] = s[x.qual]
        ? { ...s[x.qual], config: x.config }
        : { qual: x.qual, config: x.config, desde: Date.now(), tentativas: [], ultimaTentativa: 0 };
    }
    for (const qual of Object.keys(s)) if (!quais.has(qual)) delete s[qual];
  });
}

async function retomarColadores() {
  if (retomandoColador) return;
  retomandoColador = true;
  try {
    const sessoes = (await chrome.storage.local.get(CHAVE_SESSOES_COLADOR))[CHAVE_SESSOES_COLADOR] || {};
    const atividades = Object.values(await carregarAtividade());
    for (const sessao of Object.values(sessoes)) {
      const d = L.decidirRetomarColador(sessao, atividades, Date.now());
      if (d.acao !== 'retomar') continue;
      await mudarSessoesColador((s) => {
        if (s[sessao.qual]) Object.assign(s[sessao.qual], { tentativas: d.tentativas, ultimaTentativa: Date.now() });
      });
      await anotar(`retomando ${sessao.qual}: a sessão tinha caído sem ninguém mandar parar`);
      await disparar(sessao.qual, false, 'retomar', sessao.config).catch(() => {});
    }
  } catch (e) { /* tenta de novo no próximo alarme */ } finally {
    retomandoColador = false;
  }
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
  if (L.QUAIS_COLADOR.includes(c.qual)) await lembrarSessaoColador(c.qual, c.config);
  disparar(c.qual, false, 'site', c.config, c.id)
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

// O Colador pediu "Parar" pela tela num comando que já está "iniciado" - avisa SÓ a aba que
// estiver de fato naquela tela agora (se não tiver nenhuma, não há o que fazer: quem estava
// rodando já fechou ou nunca chegou a abrir). O content script decide se isso é ELE que está
// rodando (rodando === qual) antes de parar - um "parar" que chegou atrasado, depois de outra
// coisa já ter começado a rodar na mesma aba, não pode derrubar o comando errado.
async function pararSeNecessario(paradas) {
  for (const p of Array.isArray(paradas) ? paradas : []) {
    if (!p || !p.qual) continue;
    // Parada pedida pela tela pra ESTE Chrome (Pausar, Cancelar, Reiniciar, Parar), venha o
    // macro de um comando ou do horário: para o que estiver rodando na aba dele.
    // Parar pela tela encerra a sessão de vez: não volta sozinha.
    if (L.QUAIS_COLADOR.includes(p.qual)) await esquecerSessaoColador(p.qual);
    if (p.avulsa) {
      try {
        const aba = await abaExistenteDoSpx(p.qual);
        if (aba) await chrome.tabs.sendMessage(aba.id, { xmPararMacro: p.qual }).catch(() => {});
      } catch (e) { /* aba sumiu - nada rodando */ }
      continue;
    }
    try {
      const aba = await abaExistenteDoSpx(p.qual);
      if (aba) await chrome.tabs.sendMessage(aba.id, { xmColadorParar: p.qual, idComando: p.id }).catch(() => {});
    } catch (e) { /* aba sumiu entre o query e o sendMessage - nada rodando mesmo */ }
  }
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
    try { await pararSeNecessario(resposta.paradas); } catch (e) { /* tenta na proxima */ }
    try { await sincronizarSessoesColador(resposta.sessoes); } catch (e) { /* tenta na proxima */ }
    try { await entregarEventosGuardados(); } catch (e) { /* tenta na proxima */ }
    try { await mandarAtividade(); } catch (e) { /* tenta na proxima */ }
    // O polo de cada relatório, escolhido na tela Macros (ausente = servidor antigo: mantém).
    if (resposta.polos !== undefined) {
      try { await chrome.storage.local.set({ polosSite: resposta.polos || {} }); } catch (e) { /* tenta na proxima */ }
    }
    try { await aplicarAgendaDoSite(resposta.agenda); }
    catch (e) { console.log('[XM Macros] agenda do sistema falhou: ' + e); }
  } finally {
    buscandoComandos = false;
  }
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (!msg) return;

  // Relogio pra aba escondida: o setTimeout DELA e estrangulado pelo Chrome, o daqui nao (ver
  // dormir() em spx.js). Teto de 25s: acima disso o proprio service worker pode ser suspenso.
  if (msg.xmDormir !== undefined) {
    setTimeout(() => responder({ ok: true }), Math.max(0, Math.min(25000, Number(msg.xmDormir) || 0)));
    return true;
  }

  // A aba conta em qual estação este Chrome está (spx.js).
  if (msg.xmEstacaoPerfil) {
    const xpt = L.xptDaEstacao(msg.xmEstacaoPerfil);
    if (xpt) chrome.storage.local.set({ estacaoPerfil: { estacao: msg.xmEstacaoPerfil, xpt, em: Date.now() } }).catch(() => {});
    responder({ ok: true });
    return;
  }

  // O painel do macro conta o andamento (tela "Em execução").
  if (msg.xmAtividade) {
    const aba = remetente && remetente.tab ? String(remetente.tab.id) : null;
    if (aba) mudarAtividade((mapa) => { mapa[aba] = msg.xmAtividade; });
    guardarUltimo(msg.xmAtividade);
    responder({ ok: true });
    return;
  }

  // O painel do macro (content script) conta como ele terminou.
  if (msg.xmEvento) {
    enviarEvento(msg.xmEvento).then((ok) => responder({ ok }), () => responder({ ok: false }));
    return true;
  }

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
    pendentesDoVigia(msg.limite, msg.estacao).then(
      (d) => responder({ ok: true, ...d }),
      (e) => responder({ ok: false, error: String(e.message || e) }));
    return true;
  }

  // O content script do Colador nao alcanca 127.0.0.1 direto (mesmo bloqueio de
  // rede privada do pendentes acima) - pede aqui, e a resposta volta pela mensagem.
  // A sessão do Colador acabou de propósito (Parar no painel/tela, ou terminou sem modo contínuo).
  if (msg.xmColadorFim) {
    esquecerSessaoColador(String(msg.xmColadorFim)).then(() => responder({ ok: true }));
    return true;
  }

  if (msg.xmColador) {
    const FUNCAO = { lote: coladorLote, confirmar: coladorConfirmar, liberar: coladorLiberar, at: coladorAt, falhou: coladorFalhou };
    const fn = FUNCAO[msg.xmColador];
    if (!fn) { responder({ ok: false, error: `xmColador desconhecido: ${msg.xmColador}` }); return; }
    fn(msg).then(
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
