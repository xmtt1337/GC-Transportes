// "Na rua hoje" na tela inicial do entregador (GET /entregador/na-rua).
//
// O mesmo dado de Torre de Controle > Na Rua, do lado de quem está na rua: ele
// toca na transportadora, vê os entregadores que rodam no nome dele (os nomes
// unificados na Conversão de nomes) e, em cada um, o que ainda falta entregar,
// com o endereço. Quem recorta de quem é cada pedido é o servidor — esta tela
// só desenha o que chegou.
//
// Por enquanto só a Shopee vem na resposta; a tela já desenha uma lista de
// transportadoras pra as outras entrarem sem mudar nada aqui.

const ENR_CORES = { shopee: "#F97316", loggi: "#12A5E8", anjun: "#22C55E", imile: "#9333EA", jt: "#EF4444" };
const ENR_SITUACOES = {
    na_rua:     { rotulo: "Na rua",        classe: "rua" },
    insucesso:  { rotulo: "Insucesso",     classe: "ins" },
    aguardando: { rotulo: "Ainda não saiu", classe: "agu" },
};

let _enrDados = null;
let _enrTransp = "";            // chave da transportadora aberta ("" = nenhuma)
let _enrAbertos = new Set();    // nomes dos entregadores com a lista aberta
let _enrCarregando = false;

function _enrEsc(v) {
    return String(v === null || v === undefined ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// importado_em chega como TEXTO ("2026-10-05 14:30:00.000") em horário de
// Brasília, e o "há quanto tempo" já vem pronto do servidor. Passar isso por
// `new Date` reinterpretaria a hora no fuso do aparelho — mesmo cuidado de
// _snrDataHora em shopee-na-rua.js.
function _enrHora(texto) {
    const m = /^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})/.exec(String(texto || ""));
    return m ? `${m[1]}:${m[2]}` : "";
}

function _enrRelativo(seg) {
    if (seg === null || seg === undefined || !isFinite(seg)) return "";
    const min = Math.floor(Math.max(seg, 0) / 60);
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `há ${h}h` : "há mais de um dia";
}

const _enrPlural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// O ENDEREÇO COMPLETO da AT quase sempre já traz o complemento junto; repetir
// embaixo só dobraria a altura da linha no celular.
function _enrComplemento(p) {
    const comp = String(p.complemento || "").trim();
    if (!comp) return "";
    return String(p.endereco || "").toLowerCase().includes(comp.toLowerCase()) ? "" : comp;
}

function _enrPedidoHtml(p) {
    const sit = ENR_SITUACOES[p.situacao] || { rotulo: p.status || "Pendente", classe: "agu" };
    const onde = [p.bairro, p.cidade].filter(Boolean).join(" · ");
    const comp = _enrComplemento(p);
    return `
        <li class="enr-ped">
            <div class="enr-ped-end">${_enrEsc(p.endereco || "Endereço não informado")}</div>
            ${comp ? `<div class="enr-ped-comp">${_enrEsc(comp)}</div>` : ""}
            <div class="enr-ped-rodape">
                <span class="enr-sit ${sit.classe}">${_enrEsc(sit.rotulo)}</span>
                ${onde ? `<span class="enr-ped-onde">${_enrEsc(onde)}</span>` : ""}
                <span class="enr-ped-cod">${_enrEsc(p.codigo)}</span>
            </div>
        </li>`;
}

function _enrEntregadorHtml(e) {
    const aberto = _enrAbertos.has(e.nome);
    const pct = e.total ? Math.round(e.entregues / e.total * 100) : 0;
    const resumo = e.pendentes
        ? _enrPlural(e.pendentes, "pendente", "pendentes")
        : "Tudo entregue";
    const lista = !aberto ? "" : e.pedidos.length
        ? `<ul class="enr-peds">${e.pedidos.map(_enrPedidoHtml).join("")}</ul>`
        : `<div class="enr-vazio">Nenhum pedido pendente.</div>`;
    return `
        <div class="enr-ent${aberto ? " aberto" : ""}">
            <button type="button" class="enr-ent-topo" aria-expanded="${aberto}"
                    data-nome="${_enrEsc(e.nome)}" onclick="_enrAlternarEntregador(this.dataset.nome)">
                <span class="enr-ent-nome">${_enrEsc(e.nome)}</span>
                <span class="enr-ent-num${e.pendentes ? "" : " ok"}">${resumo}</span>
                <span class="enr-ent-sub">${e.entregues} de ${e.total} entregues</span>
                <span class="enr-barra"><span style="width:${pct}%"></span></span>
            </button>
            ${lista}
        </div>`;
}

function _enrTranspHtml(t) {
    const aberta = t.chave === _enrTransp;
    const cor = ENR_CORES[t.chave] || "#94a3b8";
    const numero = !t.total ? "Nada na rua hoje"
        : t.pendentes ? _enrPlural(t.pendentes, "pendente", "pendentes")
        : "Tudo entregue";
    const sub = t.total
        ? `${t.entregues} de ${t.total} entregues · ${_enrPlural(t.entregadores.length, "entregador", "entregadores")}`
        : "Nenhum pedido no seu nome até agora.";
    return `
        <button type="button" class="enr-transp${aberta ? " aberta" : ""}" style="--tc:${cor}"
                aria-expanded="${aberta}" ${t.total ? "" : "disabled"}
                data-chave="${_enrEsc(t.chave)}" onclick="_enrAlternarTransp(this.dataset.chave)">
            <span class="enr-transp-nome">${_enrEsc(t.rotulo)}</span>
            <span class="enr-transp-num">${numero}</span>
            <span class="enr-transp-sub">${sub}</span>
        </button>`;
}

function _enrAtualizadoHtml(atualizado) {
    if (!atualizado || !atualizado.importado_em) return `<span class="enr-atual">Sem atualização ainda</span>`;
    const rel = _enrRelativo(atualizado.segundos_atras);
    return `<span class="enr-atual">Atualizado às <b>${_enrHora(atualizado.importado_em)}</b>${rel ? ` · ${rel}` : ""}</span>`;
}

function _enrRender() {
    const el = document.getElementById("home-na-rua");
    if (!el) return;
    const d = _enrDados;
    if (!d) { el.innerHTML = ""; return; }

    const transps = d.transportadoras || [];
    const aberta = transps.find(t => t.chave === _enrTransp);
    el.innerHTML = `
        <section class="enr">
            <div class="enr-topo">
                <span class="enr-titulo">Na rua hoje</span>
                ${_enrAtualizadoHtml(d.atualizado)}
                <button type="button" class="enr-recarregar" onclick="_enrCarregar()"
                        ${_enrCarregando ? "disabled" : ""}>${_enrCarregando ? "Atualizando…" : "Atualizar"}</button>
            </div>
            <div class="enr-transps">${transps.map(_enrTranspHtml).join("")}</div>
            ${aberta ? `<div class="enr-ents">${aberta.entregadores.map(_enrEntregadorHtml).join("")}</div>` : ""}
        </section>`;
}

function _enrAlternarTransp(chave) {
    _enrTransp = _enrTransp === chave ? "" : chave;
    const t = _enrDados && (_enrDados.transportadoras || []).find(x => x.chave === _enrTransp);
    // Um entregador só: abrir a transportadora já é pedir a lista dele.
    if (t && t.entregadores.length === 1) _enrAbertos.add(t.entregadores[0].nome);
    _enrRender();
}

function _enrAlternarEntregador(nome) {
    if (_enrAbertos.has(nome)) _enrAbertos.delete(nome);
    else _enrAbertos.add(nome);
    _enrRender();
}

// Chamado pela home do entregador (renderHomeActions) e pelo botão Atualizar.
// O que estava aberto continua aberto depois de atualizar: ele está no meio da
// rota, conferindo a lista — fechar tudo a cada toque faria perder o lugar.
function _enrCarregar() {
    const el = document.getElementById("home-na-rua");
    if (!el || _enrCarregando) return;
    _enrCarregando = true;
    if (_enrDados) _enrRender();

    fetch(`${API}/entregador/na-rua`, { headers: { "Authorization": "Bearer " + localStorage.getItem("token") } })
        .then(r => r.json())
        .then(d => {
            _enrCarregando = false;
            if (!d || d.error || !Array.isArray(d.transportadoras)) { _enrFalhou(); return; }
            _enrDados = d;
            _enrRender();
        })
        .catch(() => { _enrCarregando = false; _enrFalhou(); });
}

// Falhou com dado na tela: fica o que já estava (melhor a lista de 5 minutos
// atrás do que nenhuma). Falhou sem nada: o bloco some, não ocupa a home com erro.
function _enrFalhou() {
    if (_enrDados) { _enrRender(); return; }
    const el = document.getElementById("home-na-rua");
    if (el) el.innerHTML = "";
}
