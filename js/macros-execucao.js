// ───── MACROS → EM EXECUÇÃO ─────
// O que os Chromes do galpão estão fazendo AGORA: cada aba com painel de macro conta o andamento
// (extensão -> vigia -> servidor, só em memória lá; modules/macros-comando/atividade.js). Aqui se
// vê qual macro, em que XPT, em que computador, o passo atual e o log ao vivo — e o aviso quando
// o mesmo relatório roda em dois lugares no mesmo XPT.
//
// A pergunta ao servidor (de 4 em 4s) só lê memória; o histórico (que lê o banco) vem a cada 60s.
// Os dois relógios param quando a tela sai de vista.

const _MEX_MACROS = {
    alimentacao: { nome: "AT Exportada", tipo: "relatorio" },
    pedidos:     { nome: "Pedidos pesquisados", tipo: "relatorio" },
    backlog:     { nome: "Backlog", tipo: "relatorio" },
    recebimento: { nome: "Colador · Recebimento", tipo: "colador" },
    at_cluster:  { nome: "Colador · AT Cluster", tipo: "colador" },
    outro:       { nome: "Outro", tipo: "outro" },
};
const _MEX_ORDEM = ["alimentacao", "pedidos", "backlog", "recebimento", "at_cluster"];
const _MEX_XPTS = { XPT_CFC: "Caçador", XPT_VIA: "Videira" };
const _MEX_ESTADOS = {
    rodando:      { rotulo: "Rodando",       classe: "andando" },
    sem_sinal:    { rotulo: "Sem sinal",     classe: "aviso" },
    ok:           { rotulo: "Concluído",     classe: "ok" },
    aviso:        { rotulo: "Terminou com aviso", classe: "aviso" },
    erro:         { rotulo: "Falhou",        classe: "erro" },
    parado:       { rotulo: "Parado por alguém", classe: "aviso" },
    interrompido: { rotulo: "Interrompido",  classe: "erro" },
};
// Versão da extensão que manda o andamento. Computador com vigia mas sem relatório está abaixo.
const _MEX_VERSAO_MINIMA = "3.36";
const _MEX_INTERVALO_MS = 4000;
const _MEX_INTERVALO_HIST_MS = 60000;

let _mexDados = null;        // resposta de /admin/macros/atividade
let _mexRecebidoEm = 0;      // Date.now() de quando _mexDados chegou (os "há X" andam a partir dele)
let _mexHistorico = [];
let _mexHistLimite = 100;
let _mexFiltroMacro = "todos";
let _mexFiltroXpt = "todos";
let _mexAbertos = new Set(); // logs expandidos, por "maquina|aba"
let _mexTimer = null;
let _mexTimerHist = null;
let _mexRelogio = null;
let _mexErro = null;

const _mexEhDev = () => !!(window._gcUser && window._gcUser.role === "dev");
const _mexMacrosVisiveis = () => _mexEhDev() ? _MEX_ORDEM : _MEX_ORDEM.filter(m => _MEX_MACROS[m].tipo === "colador");

function _mexEsc(txt) {
    return String(txt ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function abrirMacrosExecucao(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev" && role !== "admin") {
        gcAlert("Só dev e admin acessam os Macros.");
        return;
    }
    mostrarTela("tela-macros-execucao");
    _mexErro = null;
    _mexDesenhar();
    _mexBuscar();
    _mexBuscarHistorico();
    _mexLigarRelogios();
}

function _mexNaTela() {
    const tela = document.getElementById("tela-macros-execucao");
    return !!tela && tela.classList.contains("active-view");
}

function _mexLigarRelogios() {
    _mexDesligar();
    _mexTimer = setInterval(() => {
        if (!_mexNaTela()) return _mexDesligar();
        if (!document.hidden) _mexBuscar();
    }, _MEX_INTERVALO_MS);
    _mexTimerHist = setInterval(() => {
        if (!_mexNaTela()) return _mexDesligar();
        if (!document.hidden) _mexBuscarHistorico();
    }, _MEX_INTERVALO_HIST_MS);
    // Só os "há X" e os cronômetros: não fala com o servidor.
    _mexRelogio = setInterval(() => {
        if (!_mexNaTela()) return _mexDesligar();
        _mexAtualizarTempos();
    }, 1000);
}

function _mexDesligar() {
    [_mexTimer, _mexTimerHist, _mexRelogio].forEach(t => t && clearInterval(t));
    _mexTimer = _mexTimerHist = _mexRelogio = null;
}

function _mexBuscar() {
    fetch(`${API}/admin/macros/atividade`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) throw new Error(d.error || "erro");
            const mudou = _mexAssinatura(d) !== _mexAssinatura(_mexDados) || _mexErro;
            _mexDados = d;
            _mexRecebidoEm = Date.now();
            _mexErro = null;
            if (mudou) _mexDesenhar(); else _mexAtualizarTempos();
        })
        .catch(e => {
            _mexErro = "Não consegui falar com o servidor agora — tentando de novo.";
            _mexDesenhar();
        });
}

// O que muda o desenho. Os "há X" ficam de fora: andam sozinhos (_mexAtualizarTempos), e
// redesenhar a cada 4s por causa deles fecharia/rolaria o log que a pessoa está lendo.
function _mexAssinatura(d) {
    if (!d) return "";
    return JSON.stringify([
        (d.abas || []).map(a => [a.maquina, a.aba, a.macro, a.estado, a.passo, a.xpt,
            (a.linhas || []).length, ((a.linhas || []).slice(-1)[0] || {}).em]),
        (d.maquinas || []).map(m => [m.nome, m.online, m.versao]),
        (d.ouvindo || []).map(m => [m.nome, m.online]),
        d.alertas || [],
    ]);
}

function _mexBuscarHistorico() {
    fetch(`${API}/admin/macros/spx/historico?limite=${_mexHistLimite}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { _mexHistorico = d.eventos || []; _mexDesenharHistorico(); })
        .catch(() => {});
}

function _mexMaisHistorico() {
    _mexHistLimite = Math.min(200, _mexHistLimite + 100);
    _mexBuscarHistorico();
}

// ── filtros ──
function _mexFiltrar(macro, xpt) {
    if (macro !== undefined) _mexFiltroMacro = macro;
    if (xpt !== undefined) _mexFiltroXpt = xpt;
    _mexDesenhar();
    _mexDesenharHistorico();
}

const _mexPassaFiltro = (a) =>
    (_mexFiltroMacro === "todos" || a.macro === _mexFiltroMacro) &&
    (_mexFiltroXpt === "todos" || a.xpt === _mexFiltroXpt);

// ── tempos ──
// "há X" a partir do que o servidor disse + o que passou desde que a resposta chegou.
const _mexDecorrido = () => Math.floor((Date.now() - _mexRecebidoEm) / 1000);

function _mexDuracao(s) {
    if (s === null || s === undefined || !isFinite(s)) return "—";
    s = Math.max(0, Math.floor(s));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min ${String(s % 60).padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}min`;
}

function _mexHa(s) {
    if (s === null || s === undefined) return "—";
    if (s < 5) return "agora";
    return "há " + _mexDuracao(s).replace(/ \d+s$/, "");
}

function _mexHora(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}

// Os números que andam sozinhos ficam marcados com data-* e são reescritos a cada segundo, sem
// redesenhar a tela (redesenhar fecharia o log que a pessoa está lendo).
function _mexAtualizarTempos() {
    const passou = _mexDecorrido();
    document.querySelectorAll("#tela-macros-execucao [data-mex-dur]").forEach(el => {
        el.textContent = _mexDuracao(Number(el.dataset.mexDur) + passou);
    });
    document.querySelectorAll("#tela-macros-execucao [data-mex-ha]").forEach(el => {
        el.textContent = _mexHa(Number(el.dataset.mexHa) + passou);
    });
    const vivo = document.getElementById("mex-vivo-texto");
    if (vivo && _mexRecebidoEm) vivo.textContent = `atualizado ${_mexHa(passou)}`;
}

// ── desenho ──
function _mexDesenhar() {
    const corpo = document.getElementById("mex-corpo");
    if (!corpo) return;
    if (!_mexDados) {
        corpo.innerHTML = `<div class="fechamento-empty">${_mexErro ? _mexEsc(_mexErro) : "Carregando..."}</div>`;
        return;
    }
    const abas = (_mexDados.abas || []);
    const rodando = abas.filter(a => a.estado === "rodando" || a.estado === "sem_sinal");
    const terminados = abas.filter(a => a.estado !== "rodando" && a.estado !== "sem_sinal")
        .sort((a, b) => (a.terminou_ha_s ?? 1e9) - (b.terminou_ha_s ?? 1e9));

    corpo.innerHTML = [
        _mexErro ? `<div class="mex-alerta mex-alerta-aviso"><div>${_mexEsc(_mexErro)}</div></div>` : "",
        _mexFiltrosHtml(rodando),
        _mexAlertasHtml(),
        _mexComputadoresHtml(),
        _mexSecaoRodandoHtml(rodando.filter(_mexPassaFiltro)),
        _mexSecaoTerminadosHtml(terminados.filter(_mexPassaFiltro)),
        `<section class="mac-secao mex-secao">
            <div class="mac-secao-cab"><h3 class="mac-secao-titulo">Histórico</h3>
                <div class="mac-secao-acoes"><span class="mex-dica">o desfecho de cada rodada, dos últimos 14 dias</span></div></div>
            <div id="mex-historico"></div>
         </section>`,
    ].join("");
    _mexDesenharHistorico();
    _mexAtualizarTempos();
}

function _mexChip(rotulo, ativo, onclick, contagem) {
    return `<button type="button" class="mex-chip${ativo ? " ativo" : ""}" onclick="${onclick}">`
        + `${_mexEsc(rotulo)}${contagem ? ` <span class="mex-chip-n">${contagem}</span>` : ""}</button>`;
}

function _mexFiltrosHtml(rodando) {
    const conta = m => rodando.filter(a => a.macro === m && (_mexFiltroXpt === "todos" || a.xpt === _mexFiltroXpt)).length;
    const macros = [_mexChip("Todos", _mexFiltroMacro === "todos", "_mexFiltrar('todos')", null)]
        .concat(_mexMacrosVisiveis().map(m =>
            _mexChip(_MEX_MACROS[m].nome, _mexFiltroMacro === m, `_mexFiltrar('${m}')`, conta(m))));
    const xpts = [_mexChip("Todos os XPT", _mexFiltroXpt === "todos", "_mexFiltrar(undefined,'todos')", null)]
        .concat(Object.keys(_MEX_XPTS).map(x =>
            _mexChip(`${x} · ${_MEX_XPTS[x]}`, _mexFiltroXpt === x, `_mexFiltrar(undefined,'${x}')`, null)));
    return `<div class="mex-filtros">
        <div class="mex-filtro-linha" role="group" aria-label="Macro">${macros.join("")}</div>
        <div class="mex-filtro-linha" role="group" aria-label="XPT">${xpts.join("")}</div>
    </div>`;
}

function _mexAlertasHtml() {
    const alertas = (_mexDados.alertas || []).filter(al =>
        (_mexFiltroMacro === "todos" || al.macro === _mexFiltroMacro) &&
        (_mexFiltroXpt === "todos" || !al.xpt || al.xpt === _mexFiltroXpt));
    if (!alertas.length) return "";
    return alertas.map(al => {
        const nome = (_MEX_MACROS[al.macro] || _MEX_MACROS.outro).nome;
        return `<div class="mex-alerta mex-alerta-${al.nivel === "erro" ? "erro" : al.nivel === "aviso" ? "aviso" : "info"}">
            <div><b>${_mexEsc(nome)}${al.xpt ? ` · ${_mexEsc(al.xpt)}` : ""}</b> ${_mexEsc(al.texto)}</div>
            <div class="mex-alerta-onde">${(al.onde || []).map(_mexEsc).join(" · ")}</div>
        </div>`;
    }).join("");
}

// Junta quem manda o andamento (extensão nova) com quem só consulta comandos (vigia ligado).
function _mexComputadores() {
    const porNome = new Map();
    (_mexDados.maquinas || []).forEach(m => porNome.set(m.nome, { nome: m.nome, relata: true, online: m.online,
        visto: m.visto_ha_s, versao: m.versao, rodando: m.abas.filter(a => a.estado === "rodando").length }));
    (_mexDados.ouvindo || []).forEach(v => {
        const atual = porNome.get(v.nome);
        if (atual) { atual.vigiaOnline = v.online; return; }
        porNome.set(v.nome, { nome: v.nome, relata: false, online: v.online, visto: v.visto_ha_s, vigiaOnline: v.online, rodando: 0 });
    });
    return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

function _mexComputadoresHtml() {
    const lista = _mexComputadores();
    const cartoes = lista.length ? lista.map(c => {
        let classe, situacao;
        if (!c.relata) {
            classe = c.online ? "aviso" : "off";
            situacao = c.online
                ? `Vigia ligado, mas a extensão não conta o andamento — atualize pra ${_MEX_VERSAO_MINIMA}`
                : `Sem sinal <span data-mex-ha="${c.visto}">${_mexHa(c.visto)}</span>`;
        } else if (c.online) {
            classe = "ok";
            situacao = `Extensão ativa · <span data-mex-ha="${c.visto}">${_mexHa(c.visto)}</span>`;
        } else {
            classe = "off";
            situacao = `Sem sinal <span data-mex-ha="${c.visto}">${_mexHa(c.visto)}</span> — Chrome ou vigia fechado?`;
        }
        return `<div class="mex-pc">
            <div class="mex-pc-nome"><span class="mex-ponto mex-ponto-${classe}"></span>${_mexEsc(c.nome)}</div>
            <div class="mex-pc-sit">${situacao}</div>
            <div class="mex-pc-meta">${c.rodando ? `<b>${c.rodando}</b> rodando agora` : "nada rodando"}${c.versao ? ` · extensão ${_mexEsc(c.versao)}` : ""}</div>
        </div>`;
    }).join("") : `<div class="mex-vazio">Nenhum computador falou com o servidor desde o último deploy. Em até 30s eles aparecem.</div>`;
    const varios = lista.filter(c => c.online).length > 1
        ? `<span class="mex-dica">${lista.filter(c => c.online).length} computadores ligados</span>` : "";
    return `<section class="mac-secao mex-secao">
        <div class="mac-secao-cab"><h3 class="mac-secao-titulo">Computadores</h3><div class="mac-secao-acoes">${varios}</div></div>
        <div class="mex-pcs">${cartoes}</div>
    </section>`;
}

function _mexChave(a) { return `${a.maquina}|${a.aba}`; }

function _mexAlternarLog(chave) {
    if (_mexAbertos.has(chave)) _mexAbertos.delete(chave); else _mexAbertos.add(chave);
    _mexDesenhar();
}

function _mexLogHtml(a, todas) {
    const linhas = (a.linhas || []);
    const mostrar = todas ? linhas : linhas.slice(-6);
    if (!mostrar.length) return `<div class="mex-log mex-log-vazio">sem linhas ainda</div>`;
    const marca = { passo: "▸", nota: "·", ok: "✔", aviso: "!", erro: "✕" };
    return `<div class="mex-log${todas ? " mex-log-todo" : ""}">${mostrar.map(l =>
        `<div class="mex-log-linha mex-log-${l.tipo}"><span class="mex-log-hora">${_mexHora(l.em)}</span>`
        + `<span class="mex-log-marca">${marca[l.tipo] || "·"}</span><span class="mex-log-texto">${_mexEsc(l.texto)}</span></div>`
    ).join("")}</div>`;
}

function _mexXptHtml(a) {
    if (!a.xpt) return `<span class="mex-xpt mex-xpt-sem">XPT desconhecido</span>`;
    return `<span class="mex-xpt">${_mexEsc(a.xpt)} · ${_mexEsc(_MEX_XPTS[a.xpt] || "")}</span>`;
}

function _mexCartaoHtml(a) {
    const est = _MEX_ESTADOS[a.estado] || _MEX_ESTADOS.rodando;
    const nome = (_MEX_MACROS[a.macro] || _MEX_MACROS.outro).nome;
    const chave = _mexChave(a);
    const aberto = _mexAbertos.has(chave);
    const tempo = a.estado === "sem_sinal"
        ? `última notícia ${_mexHa(a.rodando_ha_s)}`
        : `rodando há <span data-mex-dur="${a.rodando_ha_s ?? 0}">${_mexDuracao(a.rodando_ha_s)}</span>`;
    return `<article class="mex-cartao mex-cartao-${est.classe}">
        <div class="mex-cartao-topo">
            <div class="mex-cartao-nome">${_mexEsc(nome)}</div>
            ${_mexXptHtml(a)}
        </div>
        <div class="mex-cartao-meta"><span class="mex-ponto mex-ponto-${est.classe}"></span>${est.rotulo} · ${_mexEsc(a.maquina)} · aba ${_mexEsc(a.aba)} · ${tempo}</div>
        <div class="mex-cartao-passo">${_mexEsc(a.passo || "começando…")}</div>
        ${_mexLogHtml(a, aberto)}
        <button type="button" class="mac-link mex-log-botao" onclick="_mexAlternarLog('${_mexEsc(chave)}')">${aberto ? "Mostrar menos" : `Log completo (${(a.linhas || []).length} ${(a.linhas || []).length === 1 ? "linha" : "linhas"})`}</button>
    </article>`;
}

function _mexSecaoRodandoHtml(lista) {
    const corpo = lista.length
        ? `<div class="mex-cartoes">${lista.map(_mexCartaoHtml).join("")}</div>`
        : `<div class="mex-vazio">Nada rodando${_mexFiltroMacro !== "todos" || _mexFiltroXpt !== "todos" ? " com esse filtro" : ""} agora.</div>`;
    return `<section class="mac-secao mex-secao">
        <div class="mac-secao-cab"><h3 class="mac-secao-titulo">Rodando agora${lista.length ? ` · ${lista.length}` : ""}</h3></div>
        ${corpo}
    </section>`;
}

function _mexSecaoTerminadosHtml(lista) {
    if (!lista.length) return "";
    const linhas = lista.map(a => {
        const est = _MEX_ESTADOS[a.estado] || _MEX_ESTADOS.ok;
        const nome = (_MEX_MACROS[a.macro] || _MEX_MACROS.outro).nome;
        const chave = _mexChave(a);
        const aberto = _mexAbertos.has(chave);
        return `<div class="mex-fim mex-fim-${est.classe}">
            <div class="mex-fim-linha">
                <span class="mex-ponto mex-ponto-${est.classe}"></span>
                <span class="mex-fim-quando" data-mex-ha="${a.terminou_ha_s ?? 0}">${_mexHa(a.terminou_ha_s)}</span>
                <span class="mex-fim-corpo"><b>${_mexEsc(nome)}</b> ${_mexEsc(a.passo || est.rotulo)}
                    <span class="mex-fim-onde">${est.rotulo} · ${_mexEsc(a.xpt || "XPT desconhecido")} · ${_mexEsc(a.maquina)} · durou ${_mexDuracao(a.rodando_ha_s)}</span></span>
                <button type="button" class="mac-link" onclick="_mexAlternarLog('${_mexEsc(chave)}')">${aberto ? "Fechar log" : "Log"}</button>
            </div>
            ${aberto ? _mexLogHtml(a, true) : ""}
        </div>`;
    }).join("");
    return `<section class="mac-secao mex-secao">
        <div class="mac-secao-cab"><h3 class="mac-secao-titulo">Terminaram há pouco</h3>
            <div class="mac-secao-acoes"><span class="mex-dica">últimos 30 minutos, por aba</span></div></div>
        <div class="mac-painel mex-fins">${linhas}</div>
    </section>`;
}

// "2026-10-19 15:02:08.284" (Brasília, do banco) -> "19/10 · 15:02"
function _mexQuando(q) {
    const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(q || ""));
    return m ? `${m[3]}/${m[2]} · ${m[4]}:${m[5]}` : "";
}

function _mexDesenharHistorico() {
    const el = document.getElementById("mex-historico");
    if (!el) return;
    const visiveis = _mexMacrosVisiveis();
    const lista = _mexHistorico.filter(e =>
        (e.macro === "geral" ? _mexEhDev() && _mexFiltroMacro === "todos" : visiveis.includes(e.macro)) &&
        (_mexFiltroMacro === "todos" || e.macro === _mexFiltroMacro));
    if (!lista.length) {
        el.innerHTML = `<div class="mex-vazio">${_mexHistorico.length ? "Nada no histórico com esse filtro." : "Carregando..."}</div>`;
        return;
    }
    const nomeDe = m => m === "geral" ? "Geral" : (_MEX_MACROS[m] || _MEX_MACROS.outro).nome;
    const origem = o => o === "vigia" ? "XM Vigia" : "extensão";
    el.innerHTML = `<div class="mac-painel mex-hist">${lista.map(e => `
        <div class="mac-hist-linha mac-hist-${_mexEsc(e.nivel)} mex-hist-linha">
            <span class="mac-cmd-ponto"></span>
            <span class="mac-hist-quando">${_mexEsc(_mexQuando(e.quando))}</span>
            <span class="mac-hist-corpo"><b>${_mexEsc(nomeDe(e.macro))}</b>${_mexEsc(e.texto)}
                <span class="mac-hist-onde">${_mexEsc(e.maquina || "computador desconhecido")} · ${origem(e.origem)}${e.arquivo ? " · " + _mexEsc(e.arquivo) : ""}</span></span>
        </div>`).join("")}</div>
        ${_mexHistLimite < 200 && _mexHistorico.length >= _mexHistLimite
            ? `<div class="mex-mais"><button type="button" class="mac-link" onclick="_mexMaisHistorico()">Carregar mais</button></div>` : ""}`;
}
