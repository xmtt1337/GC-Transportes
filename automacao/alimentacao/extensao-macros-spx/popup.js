'use strict';

const estado = document.getElementById('estado');

function dizer(texto, ruim) {
  estado.textContent = texto;
  estado.classList.toggle('ruim', !!ruim);
}

async function abaDoSpx() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !/^https:\/\/spx\.shopee\.com\.br\//.test(aba.url || '')) return null;
  return aba;
}

async function mandar(xmMacro) {
  const aba = await abaDoSpx();
  if (!aba) { dizer('abra a aba do SPX primeiro', true); return null; }
  try {
    return await chrome.tabs.sendMessage(aba.id, { xmMacro });
  } catch (e) {
    // Erro sempre igual: a aba estava aberta antes da extensao entrar.
    dizer('dê F5 na aba do SPX e tente de novo', true);
    return null;
  }
}

// Passa pelo service worker, e nao direto pra aba: e ele que sabe abrir o SPX
// quando nao ha aba nenhuma, e recarregar a que foi aberta antes da extensao.
// O popup nao pode fazer isso - ele fecha antes de a pagina carregar.
async function rodarMacro(qual) {
  dizer('abrindo o SPX…');
  const r = await chrome.runtime.sendMessage({ xmRodar: qual, focar: true });
  if (r && r.ok) {
    dizer('rodando — veja na tela do SPX');
    setTimeout(() => window.close(), 900);
  } else {
    dizer((r && r.error) || 'não consegui iniciar', true);
  }
}

document.getElementById('rodar').addEventListener('click', () => rodarMacro('alimentacao'));
document.getElementById('rodar-pedidos').addEventListener('click', () => rodarMacro('pedidos'));

// ── agenda ──────────────────────────────────────────────────────────────
const campos = {
  off: document.getElementById('modo-off'),
  intervalo: document.getElementById('modo-intervalo'),
  horarios: document.getElementById('modo-horarios'),
  minutos: document.getElementById('minutos'),
  lista: document.getElementById('horarios'),
  proxima: document.getElementById('proxima'),
};

const modoEscolhido = () =>
  ['off', 'intervalo', 'horarios'].find((m) => campos[m].checked) || 'off';

const lerHorarios = window.XMMacro.logica.lerHorarios;

function mostrarProxima(quando) {
  if (!quando) { campos.proxima.textContent = ''; return; }
  const data = new Date(quando);
  const hora = data.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === data.toDateString();
  campos.proxima.innerHTML = `Próxima: <b>${hoje ? 'hoje' : 'amanhã'} às ${hora}</b>` +
                             ' <span style="opacity:.7">(horário de Brasília)</span>';
}

function ajustarCampos() {
  const modo = modoEscolhido();
  campos.minutos.disabled = modo !== 'intervalo';
  campos.lista.disabled = modo !== 'horarios';
}

async function salvarAgenda() {
  ajustarCampos();
  const modo = modoEscolhido();
  const agenda = {
    modo,
    minutos: Math.min(1440, Math.max(1, Number(campos.minutos.value) || 60)),
    horarios: lerHorarios(campos.lista.value),
  };
  if (modo === 'horarios' && !agenda.horarios.length) {
    campos.proxima.textContent = 'Escreva ao menos uma hora, como 8, 12, 16.';
    return;
  }
  await chrome.storage.local.set({ agenda });
  const r = await chrome.runtime.sendMessage({ xmAgenda: 'reagendar' });
  if (modo === 'off') { campos.proxima.textContent = ''; return; }
  mostrarProxima(r && r.proxima);
}

async function carregarAgenda() {
  const guardado = await chrome.storage.local.get(['agenda', 'proxima', 'ultimoDisparo']);
  const agenda = guardado.agenda || { modo: 'off', minutos: 60, horarios: [] };
  campos[agenda.modo] ? (campos[agenda.modo].checked = true) : (campos.off.checked = true);
  // horas: formato antigo, de quando o intervalo era em horas
  campos.minutos.value = agenda.minutos || (agenda.horas || 0) * 60 || 60;
  campos.lista.value = (agenda.horarios || []).join(', ');
  ajustarCampos();
  if (agenda.modo !== 'off') mostrarProxima(guardado.proxima);
  // O ultimo disparo automatico e o unico jeito de saber que ele rodou de
  // madrugada - e, principalmente, que NAO rodou porque a aba estava fechada.
  if (guardado.ultimoDisparo && guardado.ultimoDisparo.texto.startsWith('não rodou')) {
    dizer(guardado.ultimoDisparo.texto, true);
  }
}

for (const el of [campos.off, campos.intervalo, campos.horarios]) {
  el.addEventListener('change', salvarAgenda);
}
campos.minutos.addEventListener('change', salvarAgenda);
campos.lista.addEventListener('change', salvarAgenda);
carregarAgenda();

document.getElementById('ensinar').addEventListener('click', async () => {
  dizer('');
  const r = await mandar('ensinar');
  // O popup precisa sair da frente: o proximo clique da pessoa e o que vale.
  if (r && r.ok) window.close();
});

document.getElementById('diagnostico').addEventListener('click', async () => {
  dizer('');
  const r = await mandar('diagnostico');
  if (!r || !r.texto) return;
  await navigator.clipboard.writeText(r.texto);
  dizer('copiado — é só colar');
});
