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
    criar_at:    { nome: "Colador · Criar AT (entregadores)", tipo: "colador" },
    outro:       { nome: "Outro", tipo: "outro" },
};
const _MEX_ORDEM = ["alimentacao", "pedidos", "backlog", "recebimento", "at_cluster", "criar_at"];
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
let _mexAvisos = [];         // avisos de rota (rodam no servidor): [{ chave, nome, ativo, resumo }]

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
        (d.ativos || []).map(a => [a.macro, a.maquina, a.rodando, a.online, a.proxima_em, a.ultimo && a.ultimo.terminou_em]),
        d.alertas || [],
    ]);
}

function _mexBuscarHistorico() {
    fetch(`${API}/admin/macros/spx/historico?limite=${_mexHistLimite}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { _mexHistorico = d.eventos || []; _mexDesenharHistorico(); })
        .catch(() => {});
    // O aviso de rota roda no servidor, sem aba nem computador: o horário dele vem da config.
    if (_mexEhDev()) {
        fetch(`${API}/admin/macros`, { headers: { "Authorization": "Bearer " + token } })
            .then(r => r.json())
            .then(d => { _mexAvisos = (d && d.macros) || []; if (_mexDados) _mexDesenhar(); })
            .catch(() => {});
    }
}

// "19:05 Abaixo de 90% · 22:05 Mais de 1..." -> segundos até o próximo desses horários, em Brasília.
function _mexProximoHorario(resumo, agoraMs) {
    const horas = [...String(resumo || "").matchAll(/\b(\d{2}):(\d{2})\b/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
    if (!horas.length) return null;
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", hour12: false,
        hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(agoraMs || Date.now())).map(x => [x.type, x.value]));
    const agoraS = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
    const proximos = horas.map(h => { let d = h * 60 - agoraS; if (d <= 0) d += 86400; return d; });
    return Math.min(...proximos);
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
    document.querySelectorAll("#tela-macros-execucao [data-mex-falta]").forEach(el => {
        el.textContent = _mexFalta(Number(el.dataset.mexFalta) - passou);
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
    const ativos = _mexAtivos(abas);
    const terminados = abas.filter(a => a.estado !== "rodando" && a.estado !== "sem_sinal")
        .sort((a, b) => (a.terminou_ha_s ?? 1e9) - (b.terminou_ha_s ?? 1e9));

    corpo.innerHTML = [
        _mexErro ? `<div class="mex-alerta mex-alerta-aviso"><div>${_mexEsc(_mexErro)}</div></div>` : "",
        _mexFiltrosHtml(ativos),
        _mexAlertasHtml(),
        _mexComputadoresHtml(),
        _mexSecaoAtivosHtml(ativos.filter(_mexPassaFiltro)),
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

function _mexFiltrosHtml(ativos) {
    const conta = m => ativos.filter(a => a.macro === m && (_mexFiltroXpt === "todos" || a.xpt === _mexFiltroXpt)).length;
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
    // Um cartão por Chrome (computador + perfil): dois perfis no mesmo notebook, um por XPT, são dois.
    const lista = (_mexDados.maquinas || []).map(m => ({ chave: m.chave || m.nome, nome: m.nome, xpt: m.xpt || null, relata: true,
        online: m.online, visto: m.visto_ha_s, versao: m.versao, rodando: m.abas.filter(a => a.estado === "rodando").length }));
    (_mexDados.ouvindo || []).forEach(v => {
        if (lista.some(c => c.nome === v.nome)) return;
        lista.push({ chave: v.nome, nome: v.nome, relata: false, online: v.online, visto: v.visto_ha_s, rodando: 0 });
    });
    const porNome = {};
    lista.forEach(c => { porNome[c.nome] = (porNome[c.nome] || 0) + 1; });
    lista.forEach(c => { c.varios = porNome[c.nome] > 1; });
    return lista.sort((a, b) => a.nome.localeCompare(b.nome) || String(a.xpt || "").localeCompare(String(b.xpt || "")));
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
            <div class="mex-pc-nome"><span class="mex-ponto mex-ponto-${classe}"></span>${_mexEsc(c.nome)}${c.xpt
                ? `<span class="mex-pc-xpt">${_mexEsc(c.xpt)} · ${_mexEsc(_MEX_XPTS[c.xpt] || "")}</span>` : ""}</div>
            ${c.varios ? `<div class="mex-pc-meta">um dos Chromes deste computador</div>` : ""}
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

function _mexChave(a) { return `${a.maquina}|${a.perfil || ""}|${a.aba}`; }

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

// Todo macro ATIVO: o que está executando agora (cartão com o log) e o que está esperando a
// próxima rodada (AT a cada 30 min, Backlog nos horários, aviso de rota no servidor...). Vem de
// _mexDados.ativos (o que cada máquina agendou) + o que roda sem agenda + os avisos do servidor.
function _mexAtivos(abas) {
    const lista = (_mexDados.ativos || []).map(a => Object.assign({ tipo: "maquina" }, a));
    // Extensão antiga não manda `ativos`: o que está rodando continua aparecendo.
    for (const a of abas) {
        if ((a.estado !== "rodando" && a.estado !== "sem_sinal") || a.macro === "outro") continue;
        if (lista.some(x => x.maquina === a.maquina && (x.perfil || "") === (a.perfil || "") && x.macro === a.macro)) continue;
        lista.push({ tipo: "maquina", macro: a.macro, maquina: a.maquina, aba: a.aba, xpt: a.xpt, rodando: true, online: a.estado !== "sem_sinal" });
    }
    const passou = _mexDecorrido();
    for (const av of _mexAvisos) {
        if (!av.ativo) continue;
        lista.push({ tipo: "servidor", macro: "aviso", chave: av.chave, nome: av.nome, xpt: av.chave === "avisos_entregador" ? "XPT_CFC" : null,
            rodando: false, online: true, resumo: av.resumo, ...(() => {
                const falta = _mexProximoHorario(av.resumo);
                return falta === null ? { proxima_em_s: null, proxima_em: null }
                    : { proxima_em_s: falta + passou, proxima_em: Date.now() + falta * 1000 };
            })() });
    }
    return lista.sort((a, b) => (a.rodando === b.rodando ? (a.proxima_em_s ?? 1e12) - (b.proxima_em_s ?? 1e12) : a.rodando ? -1 : 1));
}

function _mexCadencia(a) {
    if (a.tipo === "servidor") return "nos horários das rodadas";
    if (a.modo === "intervalo" && a.minutos) return `a cada ${a.minutos} min`;
    if (a.modo === "horarios") return a.horarios ? `em ${a.horarios} horário(s) por dia` : "em horários fixos";
    if (a.modo === "encadeado") return "logo depois de cada AT Exportada";
    if (a.modo === "junto") return "junto com a AT Exportada";
    return "sessão aberta (sem horário)";
}

function _mexUltimoHtml(u) {
    if (!u) return `<div class="mex-ultimo mex-ultimo-nada">Nenhuma rodada registrada ainda neste computador.</div>`;
    const est = _MEX_ESTADOS[u.estado] || _MEX_ESTADOS.ok;
    return `<div class="mex-ultimo mex-ultimo-${est.classe}"><span class="mex-ponto mex-ponto-${est.classe}"></span>`
        + `Última: <b>${est.rotulo}</b>${u.terminou_ha_s !== null && u.terminou_ha_s !== undefined
            ? ` <span data-mex-ha="${u.terminou_ha_s}">${_mexHa(u.terminou_ha_s)}</span>` : ""}`
        + `${u.passo ? ` — ${_mexEsc(u.passo)}` : ""}</div>`;
}

// O cartão de quem está ativo mas esperando: quando roda de novo (contando), de quanto em
// quanto tempo, e como foi a última.
function _mexAguardandoHtml(a) {
    const nome = a.tipo === "servidor" ? `Aviso de rota · ${a.nome || ""}` : (_MEX_MACROS[a.macro] || _MEX_MACROS.outro).nome;
    const onde = a.tipo === "servidor" ? "no servidor" : _mexEsc(a.maquina);
    const semSinal = a.tipo !== "servidor" && a.online === false;
    const proxima = a.proxima_em_s === null || a.proxima_em_s === undefined
        ? `<span class="mex-espera-quando">sem próxima rodada marcada</span>`
        : `Próxima rodada em <b data-mex-falta="${a.proxima_em_s}">${_mexFalta(a.proxima_em_s)}</b>`
          + `<span class="mex-espera-quando">${a.proxima_em ? ` · às ${_mexHora(a.proxima_em).slice(0, 5)}` : ""}</span>`;
    return `<article class="mex-cartao mex-cartao-${semSinal ? "aviso" : "espera"}">
        <div class="mex-cartao-topo">
            <div class="mex-cartao-nome">${_mexEsc(nome)}</div>
            ${a.xpt ? `<span class="mex-xpt">${_mexEsc(a.xpt)} · ${_mexEsc(_MEX_XPTS[a.xpt] || "")}</span>` : `<span class="mex-xpt mex-xpt-sem">XPT desconhecido</span>`}
        </div>
        <div class="mex-cartao-meta"><span class="mex-ponto mex-ponto-${semSinal ? "aviso" : "ok"}"></span>${semSinal ? "Sem sinal" : "Ativo, aguardando"} · ${onde} · ${_mexEsc(_mexCadencia(a))}</div>
        <div class="mex-cartao-passo mex-espera">${proxima}</div>
        ${a.tipo === "servidor" ? "" : _mexUltimoHtml(a.ultimo)}
    </article>`;
}

// Quanto falta. Passou da hora (o Chrome atrasa alarme de aba dormindo): "a qualquer momento".
function _mexFalta(s) {
    return s > 0 ? _mexDuracao(s) : "instantes — deve começar a qualquer momento";
}

function _mexSecaoAtivosHtml(lista) {
    const abas = _mexDados.abas || [];
    const cartoes = lista.map(a => {
        if (a.rodando) {
            const mesmo = x => x.maquina === a.maquina && (x.perfil || "") === (a.perfil || "");
            const aba = abas.find(x => mesmo(x) && x.aba === a.aba)
                || abas.find(x => mesmo(x) && x.macro === a.macro && (x.estado === "rodando" || x.estado === "sem_sinal"));
            if (aba) return _mexCartaoHtml(aba);
        }
        return _mexAguardandoHtml(a);
    });
    const rodando = lista.filter(a => a.rodando).length;
    const corpo = lista.length
        ? `<div class="mex-cartoes">${cartoes.join("")}</div>`
        : `<div class="mex-vazio">Nenhum macro ativo${_mexFiltroMacro !== "todos" || _mexFiltroXpt !== "todos" ? " com esse filtro" : ""}. Ligue o horário em Configurar, ou rode um Colador.</div>`;
    return `<section class="mac-secao mex-secao">
        <div class="mac-secao-cab"><h3 class="mac-secao-titulo">Ativos agora${lista.length ? ` · ${lista.length}` : ""}</h3>
            <div class="mac-secao-acoes"><span class="mex-dica">${rodando ? `${rodando} executando agora, ` : ""}${lista.length - rodando} esperando a próxima rodada</span></div></div>
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
