// ───── XM CONFERÊNCIA ─────
// A conferência do entregador do site (meusite/js/entregador-conferencia.js), sozinha num
// app, com o leitor nativo do ML Kit no lugar da câmera do navegador. Mesmos endpoints e
// mesma sessão (origem='entregador'): o que ele bipa aqui aparece no sistema igual.

const API = "https://sistema-backend-i4uh.onrender.com";

const Cap      = window.Capacitor;
const nativo   = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin   = nome => (nativo && Cap.registerPlugin) ? Cap.registerPlugin(nome) : null;
const Scanner  = plugin("BarcodeScanner");
const Haptics  = plugin("Haptics");
const KeepAwake = plugin("KeepAwake");

const $ = id => document.getElementById(id);
const esc = XM.esc;

// ── Estado ──
let token = lerArmazenado("xm_token");
let usuarioNome = lerArmazenado("xm_nome");
let hojeServidor = null;
let diaAberto = null;
let rota = {};
let sessao = null;
let bipagens = [];
let faltantes = [];
let alvos = [];
let totalGrupo = 0;
let filtro = "todos";
let ats = [];

function lerArmazenado(k) { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } }
function gravar(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (_) {} }

// ───── TELAS ─────
function mostrar(id) {
    document.querySelectorAll(".tela").forEach(t => { t.hidden = t.id !== id; });
    window.scrollTo(0, 0);
}

// ───── API ─────
// Token vencido ou recusado volta pro login com o usuário já preenchido. Engolir o 403 e
// seguir deixava a tela vazia com cara de "não tem rota", que é o oposto do que acontece.
class SessaoCaiu extends Error {}

async function api(caminho, opcoes = {}) {
    const r = await fetch(API + caminho, {
        method: opcoes.method || "GET",
        headers: {
            "Authorization": "Bearer " + token,
            ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        },
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    });
    let d = {};
    try { d = await r.json(); } catch (_) {}
    if (r.status === 401 || r.status === 403) {
        if (/token/i.test(d.error || "") || r.status === 401) {
            sair("Sua sessão venceu. Entre de novo.");
            throw new SessaoCaiu();
        }
    }
    return { ok: r.ok, d };
}

// O token vale 8h e o turno passa disso. Renovar enquanto o app está aberto é o que o site
// faz também; o servidor recusa depois de 24h desde o login, e aí é entrar de novo.
let renovarTimer = null;
function agendarRenovacao() {
    clearInterval(renovarTimer);
    renovarTimer = setInterval(renovarToken, 60 * 60 * 1000);
}
async function renovarToken() {
    if (!token) return;
    try {
        const r = await fetch(API + "/renovar-token", { method: "POST", headers: { "Authorization": "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.token) { token = d.token; gravar("xm_token", token); return; }
        if (r.status === 401 || r.status === 403) sair(d.motivo || "Sua sessão venceu. Entre de novo.");
    } catch (_) { /* sem internet: tenta na próxima */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) renovarToken(); });

// ───── LOGIN ─────
$("login-usuario").value = lerArmazenado("xm_usuario");

$("login-ver-senha").addEventListener("click", () => {
    const c = $("login-senha");
    const ver = c.type === "password";
    c.type = ver ? "text" : "password";
    $("login-ver-senha").textContent = ver ? "Ocultar" : "Mostrar";
});

$("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    iniciarAudio();   // nasce no toque: é o gesto que destrava o som dos bipes
    const username = $("login-usuario").value.trim();
    const password = $("login-senha").value;
    const erro = $("login-erro"), btn = $("login-btn"), espera = $("login-espera");
    erro.hidden = true;
    if (!username || !password) return mostrarErroLogin("Preencha o usuário e a senha.");

    btn.disabled = true;
    btn.textContent = "Entrando...";
    // O servidor dorme quando ninguém usa e leva até ~1 min pra acordar. Sem esse aviso a
    // pessoa acha que travou e fecha o app no meio.
    const t = setTimeout(() => { espera.hidden = false; }, 4000);
    try {
        const r = await fetch(API + "/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const d = await r.json();
        if (!d.success) {
            return mostrarErroLogin(d.inativo ? "Conta inativa. Fale com o responsável." : "Usuário ou senha inválidos.");
        }
        gravar("xm_usuario", username);   // o usuário, nunca a senha
        // Senha temporária não vem com token e e-mail é cobrado antes de abrir a sessão — as
        // duas coisas o site resolve, e duplicar esses fluxos aqui é o que faria eles divergirem.
        if (d.require_password_change) {
            return mostrarErroLogin("Sua senha é temporária. Troque a senha no site (xmtt.com.br) e depois entre aqui.");
        }
        if (d.tem_email === false) {
            return mostrarErroLogin("Antes de usar o app, entre uma vez no site (xmtt.com.br) e cadastre seu e-mail.");
        }
        token = d.token;
        usuarioNome = d.name || username;
        gravar("xm_token", token);
        gravar("xm_nome", usuarioNome);
        $("login-senha").value = "";
        agendarRenovacao();
        abrirDias();
    } catch (_) {
        mostrarErroLogin("Erro ao conectar com o servidor. Confira a internet.");
    } finally {
        clearTimeout(t);
        espera.hidden = true;
        btn.disabled = false;
        btn.textContent = "Entrar";
    }
});

function mostrarErroLogin(msg) {
    const erro = $("login-erro");
    erro.textContent = msg;
    erro.hidden = false;
}

function sair(motivo) {
    token = "";
    gravar("xm_token", "");
    clearInterval(renovarTimer);
    fecharScanner();
    sessao = null;
    mostrar("tela-login");
    if (motivo) mostrarErroLogin(motivo);
}

$("btn-sair").addEventListener("click", () => {
    confirmar("Sair do app?", "Na próxima vez você entra com sua senha de novo.", "Sair", () => sair());
});

// ───── PASSO 1: OS DIAS ─────
function abrirDias() {
    diaAberto = null;
    sessao = null;
    $("usuario-nome").textContent = usuarioNome || "";
    mostrar("tela-dias");
    carregarDias();
}

async function carregarDias() {
    const vazio = $("dias-vazio"), lista = $("dias-lista");
    vazio.hidden = false;
    vazio.textContent = "Carregando...";
    lista.innerHTML = "";
    try {
        const { d } = await api("/entregador/conferencia/dias");
        if (d.error) { vazio.textContent = d.error; return; }
        const dias = d.dias || [];
        hojeServidor = d.hoje;
        if (!dias.length) { vazio.textContent = "Nenhuma rota atribuída a você. Fale com a operação."; return; }
        vazio.hidden = true;
        lista.innerHTML = dias.map(x => {
            const pct = x.pacotes ? (x.conferidos / x.pacotes) * 100 : 0;
            const cor = x.pacotes && x.conferidos >= x.pacotes ? "var(--verde)" : x.conferidos ? "var(--ambar)" : "var(--fraco)";
            // null = a AT do dia foi substituída sem a conferência ter sido encerrada: "—"
            // em vez de 0, que pareceria rota vazia.
            const qtd = x.pacotes == null ? "— pacotes" : XM.plural(x.pacotes, "pacote", "pacotes");
            const marca = x.encerrada ? `<span class="tag ok">Encerrada</span>`
                        : x.sessao_id ? `<span class="tag andamento">Em andamento</span>` : "";
            return `
            <button type="button" class="cartao dia-card" data-dia="${esc(x.dia)}">
                <div class="cartao-topo">
                    <span class="cluster-nome">${esc(XM.diaTexto(x.dia, hojeServidor))}</span>
                    <span class="cluster-num" style="color:${cor}">${x.pacotes ? XM.pctTexto(pct) : ""}</span>
                </div>
                <div class="obs">${XM.plural(x.clusters, "cluster", "clusters")} · ${qtd}${marca}</div>
                <div class="barra"><div class="barra-fill" style="width:${XM.larguraBarra(x.conferidos, pct)}%;background:${cor}"></div></div>
            </button>`;
        }).join("");
    } catch (e) {
        if (!(e instanceof SessaoCaiu)) vazio.textContent = "Erro ao conectar com o servidor. Toque aqui pra tentar de novo.";
    }
}
$("dias-vazio").addEventListener("click", () => { if (/Erro/.test($("dias-vazio").textContent)) carregarDias(); });
$("dias-lista").addEventListener("click", e => {
    const card = e.target.closest(".dia-card");
    if (card) abrirDia(card.dataset.dia);
});

// ── Busca de pacote no histórico dele: "esse pedido era meu, e eu bipei?" ──
$("busca").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });
$("busca-scan").addEventListener("click", () => {
    // Uma leitura só: aqui ele quer conferir UM pacote, não bipar em série.
    abrirScanner({
        titulo: "Procurar pacote",
        continuo: false,
        aoLer: codigo => { $("busca").value = codigo; buscar(); },
    });
});

async function buscar() {
    const q = $("busca").value.trim();
    const el = $("busca-res");
    if (!q) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="obs" style="margin-top:12px">Procurando...</div>`;
    try {
        const { d } = await api(`/entregador/conferencia/buscar?q=${encodeURIComponent(q)}`);
        if (d.error) return buscaAviso(d.error);
        if (d.curto) return buscaAviso("Digite pelo menos 3 caracteres do código.");
        const lista = d.resultados || [];
        if (!lista.length) return buscaAviso(`Nenhum pacote com "${q}" nas suas rotas. Ele não foi atribuído a você nem bipado por você.`);
        el.innerHTML = lista.map(cartaoBusca).join("");
    } catch (e) {
        if (!(e instanceof SessaoCaiu)) buscaAviso("Erro ao conectar com o servidor.");
    }
}
function buscaAviso(msg) { $("busca-res").innerHTML = `<div class="obs" style="margin-top:12px">${esc(msg)}</div>`; }

function cartaoBusca(r) {
    const info = !r.bipado
        ? { cor: "var(--ambar)", titulo: "Não bipado", obs: r.na_rota ? "Estava na sua rota e não foi bipado." : "Não é da sua rota." }
        : r.resultado === "ok"
            ? { cor: "var(--verde)", titulo: "Você bipou · confere", obs: "Pacote da sua rota, conferido." }
            : r.resultado === "divergente"
                ? { cor: "var(--vermelho)", titulo: "Você bipou · outra rota", obs: `Esse pacote é do ${r.encontrado || "outro cluster"}.` }
                : { cor: "var(--ambar)", titulo: "Você bipou · sem cadastro", obs: (XM.RESULTADOS[r.resultado] || {}).rotulo || "" };
    const par = (rot, val) => `<div class="par"><span>${rot}</span><span>${esc(val || "—")}</span></div>`;
    return `
    <div class="cartao tarja" style="border-left-color:${info.cor};margin:12px 0 0">
        <div class="mono" style="font-size:13px">${esc(r.codigo)}</div>
        <div style="font-weight:700;color:${info.cor};margin-top:3px">${info.titulo}</div>
        <div class="obs" style="margin-bottom:8px">${esc(info.obs)}</div>
        ${par("Dia da rota", XM.dataBr(r.dia))}
        ${par("Cluster", r.cluster)}
        ${par("Atribuído em", r.atribuido_em)}
        ${par("Bipado em", r.bipado_em)}
        ${r.cidade ? par("Cidade / bairro", r.cidade) : ""}
    </div>`;
}

// ───── PASSO 2: OS CLUSTERS DO DIA ─────
function abrirDia(dia) {
    diaAberto = dia;
    sessao = null;
    $("dia-titulo").textContent = XM.diaTexto(dia, hojeServidor);
    mostrar("tela-dia");
    carregarClusters();
}
$("dia-voltar").addEventListener("click", abrirDias);

async function carregarClusters() {
    const vazio = $("dia-vazio"), conteudo = $("dia-conteudo");
    vazio.hidden = false;
    vazio.textContent = "Carregando...";
    conteudo.hidden = true;
    try {
        const qs = diaAberto ? `?dia=${encodeURIComponent(diaAberto)}` : "";
        const { d } = await api(`/entregador/conferencia/clusters${qs}`);
        if (d.error) { vazio.textContent = d.error; return; }
        const lista = d.clusters || [];
        if (!lista.length) { vazio.textContent = "Nenhum cluster atribuído a você nesse dia. Fale com a operação."; return; }
        vazio.hidden = true;
        conteudo.hidden = false;
        pintarRota(d.rota || {}, lista.length);
        // O servidor só manda as ATs com a rota encerrada; o aviso aqui é só a explicação.
        $("ats-aviso").hidden = !!(d.rota && d.rota.encerrada);

        ats = [];
        $("clusters").innerHTML = lista.map(c => {
            const semTotal = c.total == null;
            const pct = !semTotal && c.total ? (c.conferidos / c.total) * 100 : 0;
            const falta = semTotal ? 0 : Math.max(0, c.total - c.conferidos);
            const cor = semTotal ? "var(--fraco)" : falta === 0 && c.total ? "var(--verde)" : c.conferidos ? "var(--ambar)" : "var(--fraco)";
            const numero = semTotal ? XM.plural(c.conferidos, "conferido", "conferidos") : `${c.conferidos} / ${c.total}`;
            return `
            <div class="cartao">
                <div class="cartao-topo">
                    <span class="cluster-nome">${esc(c.cluster)}</span>
                    <span class="cluster-num" style="color:${cor}">${numero}</span>
                </div>
                <div class="barra"><div class="barra-fill" style="width:${semTotal ? 0 : XM.larguraBarra(c.conferidos, pct)}%;background:${cor}"></div></div>
                ${(c.ats || []).map(at => {
                    const i = ats.push(at) - 1;
                    return `
                    <div class="at">
                        <span class="at-rot">AT</span>
                        <span class="at-id">${esc(at.task_id)}</span>
                        <button type="button" class="link" data-copiar-at="${i}">Copiar</button>
                        ${at.qr ? `<button type="button" class="link" data-qr="${i}">QR</button>` : ""}
                    </div>`;
                }).join("")}
            </div>`;
        }).join("");
    } catch (e) {
        if (!(e instanceof SessaoCaiu)) vazio.textContent = "Erro ao conectar com o servidor.";
    }
}

$("clusters").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.copiarAt != null) { const at = ats[+b.dataset.copiarAt]; if (at) copiar(b, at.task_id); }
    if (b.dataset.qr != null) {
        const at = ats[+b.dataset.qr];
        if (!at) return;
        // O QR vem pronto do servidor (SVG): o celular na rua não depende de biblioteca nenhuma.
        janela({ titulo: `AT ${at.task_id}`, html: at.qr, sim: "Copiar AT", nao: "Fechar",
                 aoSim: () => copiar(null, at.task_id) });
    }
});

function pintarRota(r, qtdClusters) {
    rota = r;
    // null = "não dá mais pra saber", que é diferente de zero.
    const semTotal = r.total == null;
    const total = semTotal ? 0 : (r.total || 0);
    const feitos = r.conferidos || 0;
    const falta = semTotal ? 0 : Math.max(0, total - feitos);
    const pct = !semTotal && total ? (feitos / total) * 100 : 0;
    const cor = semTotal ? "var(--fraco)" : falta === 0 && total ? "var(--verde)" : feitos ? "var(--ambar)" : "var(--fraco)";

    $("rota-pct").textContent = semTotal ? "—" : XM.pctTexto(pct);
    $("rota-pct").style.color = cor;
    $("rota-obs").textContent = semTotal
        ? `${XM.plural(qtdClusters, "cluster", "clusters")} · ${XM.plural(feitos, "conferido", "conferidos")} · a carga desse dia não está mais no sistema`
        : `${XM.plural(qtdClusters, "cluster", "clusters")} · ${XM.plural(total, "pacote", "pacotes")}` + (falta ? ` · faltam ${falta}` : total ? " · tudo conferido" : "");
    $("rota-barra").style.width = (semTotal ? 0 : XM.larguraBarra(feitos, pct)) + "%";
    $("rota-barra").style.background = cor;

    const novos = (r.clusters_novos || []).length;
    $("rota-btn").textContent = novos ? `Conferir ${XM.plural(novos, "cluster que chegou", "clusters que chegaram")} depois`
        : r.encerrada ? "Ver conferência"
        : r.sessao_id ? "Continuar conferência" : "Começar conferência";
}

$("rota-btn").addEventListener("click", async () => {
    // Rota encerrada abre só pra consulta, pelo id. O POST aqui abriria outra conferência do
    // mesmo dia — a não ser que tenha chegado cluster depois: aí o servidor reabre a mesma.
    const chegouCluster = (rota.clusters_novos || []).length > 0;
    if (rota.encerrada && rota.sessao_id && !chegouCluster) {
        sessao = { id: rota.sessao_id, alvo: rota.alvo, encerrada_em: true };
        return abrirSessao();
    }
    const btn = $("rota-btn"), rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Abrindo...";
    try {
        const { ok, d } = await api("/entregador/conferencia/sessao", { method: "POST", body: { dia: diaAberto } });
        if (!ok) return alerta(d.error || "Não foi possível abrir a conferência.");
        sessao = d;
        abrirSessao();
    } catch (e) {
        if (!(e instanceof SessaoCaiu)) alerta("Erro ao conectar com o servidor.");
    } finally {
        btn.disabled = false;
        btn.textContent = rotulo;
    }
});

// ───── PASSO 3: A CONFERÊNCIA ─────
function abrirSessao() {
    // Zerado junto com a sessão: sobra de outra conferência mostraria faltante de outra rota.
    bipagens = []; faltantes = []; alvos = []; totalGrupo = 0; filtro = "todos";
    mostrar("tela-conf");
    $("conf-alvo").textContent = sessao.alvo || "—";
    $("conf-msg").hidden = true;
    // Conferência fechada é só consulta: sem campo de bipar e sem encerrar.
    const fechada = !!sessao.encerrada_em;
    $("conf-bipar").hidden = fechada;
    $("conf-encerrar").hidden = fechada;
    $("conf-codigo").value = "";
    renderizar();
    carregarSessao();
    carregarFaltantes();
}

$("conf-voltar").addEventListener("click", () => { sessao = null; abrirDia(diaAberto); });

async function carregarSessao() {
    if (!sessao) return;
    const id = sessao.id;
    try {
        const { d } = await api(`/shopee/conferencia/atribuicoes/sessao/${id}`);
        if (!sessao || sessao.id !== id) return;
        if (d.error) return msgConf(d.error, "erro");
        bipagens = d.bipagens || [];
        renderizar();
    } catch (e) { if (!(e instanceof SessaoCaiu)) msgConf("Erro ao carregar o que já foi bipado.", "erro"); }
}

async function carregarFaltantes() {
    if (!sessao) return;
    const id = sessao.id;
    try {
        const { d } = await api(`/shopee/conferencia/atribuicoes/sessao/${id}/faltantes`);
        if (!sessao || sessao.id !== id) return;
        if (d.error) return msgConf(d.error, "erro");
        faltantes = d.faltantes || [];
        totalGrupo = d.total_grupo || 0;
        alvos = Array.isArray(d.alvos) ? d.alvos : [];
        renderizar();
    } catch (e) { if (!(e instanceof SessaoCaiu)) msgConf("Erro ao carregar os faltantes.", "erro"); }
}

// Os recarregamentos depois do bipe se juntam: em rajada, 10 bipes em 5 segundos não
// precisam de 20 leituras da lista — uma no fim da rajada já mostra tudo.
let recarregarTimer = null;
function recarregarDepoisDoBipe() {
    clearTimeout(recarregarTimer);
    recarregarTimer = setTimeout(() => { carregarSessao(); carregarFaltantes(); }, 700);
}

$("conf-camera").addEventListener("click", () => {
    iniciarAudio();
    carregarVozCluster();
    abrirScanner({ titulo: "Bipando a rota", continuo: true, aoLer: codigo => bipar(codigo) });
});
$("conf-enviar").addEventListener("click", () => biparDigitado());
$("conf-codigo").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); biparDigitado(); } });

function biparDigitado() {
    iniciarAudio();
    carregarVozCluster();
    const campo = $("conf-codigo");
    const codigo = campo.value;
    campo.value = "";
    campo.focus();
    bipar(codigo);
}

async function bipar(codigoLido) {
    const codigo = String(codigoLido || "").trim().toUpperCase();
    if (!codigo || !sessao) return;
    try {
        const { ok, d } = await api("/shopee/conferencia/atribuicoes/bipar", {
            method: "POST", body: { codigo, sessao_id: sessao.id },
        });
        if (!ok) {
            // Já bipado é aviso, não erro: o pacote está na rota, só passou duas vezes.
            return resposta(d.error || "Não foi possível bipar.", d.ja_bipado ? "aviso" : "erro", codigo);
        }
        resposta(XM.textoResultado(d), XM.tipoResposta(d), codigo);
        recarregarDepoisDoBipe();
    } catch (e) {
        if (!(e instanceof SessaoCaiu)) resposta("Erro ao conectar com o servidor. Bipe de novo.", "erro", codigo);
    }
}

// Som, vibração, cor e texto. O som é o que importa: com o pacote na mão ninguém olha a tela.
function resposta(msg, tipo, codigo) {
    if (tipo === "ok") { beepSucesso(); vibrar("ok"); }
    else if (tipo === "outra_rota") { vozClusterErrado(); vibrar("erro"); }
    else if (tipo === "aviso") { beepErro(); vibrar("aviso"); }
    else { beepErro(); vibrar("erro"); }

    const cls = tipo === "ok" ? "ok" : tipo === "aviso" ? "aviso" : "erro";
    msgConf(msg, cls);
    piscarCampo(cls);
    if (scannerAberto) statusScanner(msg, cls, codigo);
}

let msgTimer = null;
function msgConf(msg, tipo) {
    const el = $("conf-msg");
    el.className = "aviso " + (tipo === "ok" ? "ok" : tipo === "aviso" ? "alerta" : "erro");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

let piscaTimer = null;
function piscarCampo(tipo) {
    const w = $("conf-campo-wrap");
    clearTimeout(piscaTimer);
    w.classList.remove("flash-ok", "flash-err");
    void w.offsetWidth;
    w.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    piscaTimer = setTimeout(() => w.classList.remove("flash-ok", "flash-err"), 900);
}

// ── Resumo e lista ──
$("abas").addEventListener("click", e => {
    const b = e.target.closest(".aba");
    if (b) { filtro = b.dataset.f; renderizar(); }
});

function renderizar() {
    const r = XM.resumo(bipagens, faltantes);
    $("r-ok").textContent = r.ok;
    $("r-faltam").textContent = r.faltam;
    $("r-faltam").style.color = r.faltam ? "var(--ambar)" : "var(--fraco)";
    // "A mais" é o que entrou sem pertencer à rota: o que ele precisa devolver.
    $("r-amais").textContent = r.aMais;
    $("r-amais").style.color = r.aMais ? "var(--vermelho)" : "var(--fraco)";

    const pct = totalGrupo ? (r.ok / totalGrupo) * 100 : 0;
    const cor = !totalGrupo ? "var(--fraco)" : r.faltam === 0 ? "var(--verde)" : "var(--ambar)";
    $("prog-pct").textContent = XM.pctTexto(pct);
    $("prog-pct").style.color = cor;
    // Sem pacote no grupo não dá pra dizer "tudo conferido": foi assim que rota vazia passou
    // dias parecendo rota concluída. Os alvos entre colchetes mostram como o servidor leu.
    const textoAlvos = alvos.length ? alvos.map(a => `[${a}]`).join(" ") : (sessao && sessao.alvo) || "da sua rota";
    $("prog-obs").textContent = totalGrupo
        ? `${r.ok} de ${totalGrupo} conferidos` + (r.faltam ? ` · faltam ${r.faltam}` : " · tudo conferido")
        : `A AT de hoje não tem pacote nos clusters ${textoAlvos} — avise a operação.`;
    $("prog-barra").style.width = XM.larguraBarra(r.ok, pct) + "%";
    $("prog-barra").style.background = cor;

    document.querySelectorAll("#abas .aba").forEach(b => b.classList.toggle("ativa", b.dataset.f === filtro));

    const mostrarCopiar = filtro === "faltam" && faltantes.length > 0;
    $("copiar-faltam").hidden = !mostrarCopiar;
    if (mostrarCopiar && !$("copiar-faltam-btn").dataset.copiado) {
        $("copiar-faltam-btn").textContent = `Copiar os ${faltantes.length} faltantes`;
    }

    let linhas;
    if (filtro === "faltam") {
        linhas = faltantes.map((f, i) => `
            <div class="item">
                <div class="item-cod">${esc(f.codigo)}</div>
                <div class="item-info"><b style="color:var(--ambar)">Não bipado</b><span>${esc(f.cidade || f.bairro || "")}</span></div>
                <button type="button" class="link" data-copiar-faltante="${i}">Copiar</button>
            </div>`);
    } else {
        const filtradas = bipagens.filter(b =>
            filtro === "divergente" ? b.resultado === "divergente"
            : filtro === "amais" ? !["ok", "divergente"].includes(b.resultado)
            : true);
        linhas = filtradas.map(b => {
            const res = XM.RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#8494a9" };
            const hora = (b.data_hora_brasilia || "").split(" ")[1] || "";
            return `
            <div class="item">
                <div class="item-cod">${esc(b.codigo)}</div>
                <div class="item-info"><b style="color:${res.cor}">${esc(res.rotulo)}</b><span>${esc(b.encontrado || "")}${b.encontrado && hora ? " · " : ""}${esc(hora)}</span></div>
            </div>`;
        });
    }
    $("conf-lista").innerHTML = linhas.length ? linhas.join("") : `<div class="vazio">Nada aqui.</div>`;
}

$("copiar-faltam-btn").addEventListener("click", e => {
    if (faltantes.length) copiar(e.currentTarget, XM.textoFaltantes(faltantes));
});
$("conf-lista").addEventListener("click", e => {
    const b = e.target.closest("[data-copiar-faltante]");
    if (b) { const f = faltantes[+b.dataset.copiarFaltante]; if (f) copiar(b, f.codigo); }
});

$("conf-encerrar").addEventListener("click", () => {
    if (!sessao) return;
    const n = faltantes.length;
    const texto = n
        ? `Ainda ${n === 1 ? "falta 1 pacote" : `faltam ${n} pacotes`} sem bipar. Depois de encerrar não dá pra bipar mais nessa conferência.`
        : "Todos os pacotes foram conferidos.";
    confirmar("Encerrar a conferência da sua rota?", texto, "Encerrar", async () => {
        try {
            const { ok, d } = await api("/shopee/conferencia/atribuicoes/encerrar", { method: "POST", body: { sessao_id: sessao.id } });
            if (!ok) return alerta(d.error || "Não foi possível encerrar.");
            sessao = null;
            abrirDia(diaAberto);
        } catch (e) { if (!(e instanceof SessaoCaiu)) alerta("Erro ao conectar com o servidor."); }
    });
});

// ───── LEITOR (ML KIT NATIVO) ─────
// A câmera nativa roda ATRÁS do WebView: a página fica transparente e só os controles
// ficam por cima. É isso que dá foco, resolução cheia e 30 quadros por segundo — o que a
// câmera do navegador, recortando frame em canvas, nunca conseguiu.
const FORMATOS = ["QR_CODE", "CODE_128", "CODE_39", "EAN_13", "ITF", "DATA_MATRIX"];
const REPETE_MS = 2500;
let scannerAberto = false;
let scanOpcoes = null;
let scanListener = null;
let scanLidos = 0;
let aceitarCodigo = XM.criarFiltroRepeticao(REPETE_MS);
let zoomMax = 1;
let zoomLigado = false;
let luzLigada = false;

async function abrirScanner(opcoes) {
    if (scannerAberto) return;
    if (!Scanner) return alerta("O leitor só funciona no app instalado. Digite o código.");
    try {
        const perm = await Scanner.requestPermissions();
        if (perm.camera !== "granted" && perm.camera !== "limited") {
            return alerta("O app precisa da câmera pra bipar. Libere em Configurações > Apps > XM Conferência > Permissões.");
        }
    } catch (_) {
        return alerta("Não consegui pedir acesso à câmera.");
    }

    scanOpcoes = opcoes;
    scanLidos = 0;
    aceitarCodigo = XM.criarFiltroRepeticao(REPETE_MS);
    scannerAberto = true;
    $("scan-titulo").textContent = opcoes.titulo || "Aponte para o código";
    $("scan-sub").textContent = "Aponte a mira para o código";
    $("scan-status").hidden = true;
    document.documentElement.classList.add("escaneando");
    document.body.classList.add("escaneando");
    $("scanner").hidden = false;

    try {
        scanListener = await Scanner.addListener("barcodesScanned", ev => aoLerFrame(ev.barcodes || []));
        // 1080p: código de barras denso precisa de mais pixel por barra que QR.
        await Scanner.startScan({ formats: FORMATOS, lensFacing: "BACK", resolution: 2 });
        if (KeepAwake) KeepAwake.keepAwake().catch(() => {});
        prepararBotoesCamera();
    } catch (e) {
        fecharScanner();
        alerta("Não foi possível abrir a câmera: " + ((e && e.message) || "erro desconhecido"));
    }
}

function aoLerFrame(barcodes) {
    if (!scannerAberto) return;
    const dpr = window.devicePixelRatio || 1;
    const codigo = XM.maisCentral(barcodes, window.innerWidth * dpr, window.innerHeight * dpr);
    if (!codigo || !aceitarCodigo(codigo, Date.now())) return;
    scanLidos++;
    const cb = scanOpcoes && scanOpcoes.aoLer;
    if (!scanOpcoes.continuo) { fecharScanner(); if (cb) cb(codigo); return; }
    $("scan-sub").textContent = `${XM.plural(scanLidos, "bipado", "bipados")} agora · lendo ${codigo}`;
    if (cb) cb(codigo);
}

// Lanterna e zoom só aparecem se a câmera tiver. Zoom 2x é o truque dos apps de bipagem:
// de perto demais a câmera não foca; com zoom ele segura mais longe e o código segue grande.
async function prepararBotoesCamera() {
    luzLigada = false;
    zoomLigado = false;
    $("scan-luz").classList.remove("ligado");
    $("scan-zoom").classList.remove("ligado");
    try { $("scan-luz").hidden = !(await Scanner.isTorchAvailable()).available; } catch (_) { $("scan-luz").hidden = true; }
    try { zoomMax = (await Scanner.getMaxZoomRatio()).zoomRatio || 1; } catch (_) { zoomMax = 1; }
    $("scan-zoom").hidden = zoomMax < 1.5;
}

$("scan-luz").addEventListener("click", async () => {
    try { await Scanner.toggleTorch(); luzLigada = !luzLigada; $("scan-luz").classList.toggle("ligado", luzLigada); } catch (_) {}
});
$("scan-zoom").addEventListener("click", async () => {
    zoomLigado = !zoomLigado;
    try { await Scanner.setZoomRatio({ zoomRatio: zoomLigado ? Math.min(2, zoomMax) : 1 }); } catch (_) { zoomLigado = false; }
    $("scan-zoom").classList.toggle("ligado", zoomLigado);
});
$("scan-fechar").addEventListener("click", () => fecharScanner());

async function fecharScanner() {
    if (!scannerAberto) return;
    scannerAberto = false;
    $("scanner").hidden = true;
    document.documentElement.classList.remove("escaneando");
    document.body.classList.remove("escaneando");
    try { if (luzLigada) await Scanner.disableTorch(); } catch (_) {}
    try { if (scanListener) await scanListener.remove(); } catch (_) {}
    scanListener = null;
    try { await Scanner.stopScan(); } catch (_) {}
    if (KeepAwake) KeepAwake.allowSleep().catch(() => {});
}

// Botão voltar do Android fecha a câmera em vez de sair do app no meio da conferência.
if (nativo) {
    const App = Cap.registerPlugin("App");
    App.addListener && App.addListener("backButton", () => {
        if (scannerAberto) return fecharScanner();
        if (!$("modal").hidden) return fecharJanela();
        if (!$("tela-conf").hidden) return $("conf-voltar").click();
        if (!$("tela-dia").hidden) return abrirDias();
        App.minimizeApp && App.minimizeApp();
    });
    // App foi pro fundo (ligação, WhatsApp): solta a câmera, senão ela fica presa.
    App.addListener && App.addListener("pause", () => fecharScanner());
    App.addListener && App.addListener("resume", () => renovarToken());
}

let piscaScanTimer = null;
function statusScanner(msg, tipo, codigo) {
    const el = $("scan-status");
    const cor = tipo === "ok" ? "var(--verde)" : tipo === "aviso" ? "var(--ambar)" : "var(--vermelho)";
    el.hidden = false;
    el.style.color = cor;
    el.style.border = `1px solid ${cor}`;
    el.innerHTML = `${esc(msg)}${codigo ? `<div class="mono" style="font-size:12px;color:#cbd5e1;font-weight:500;margin-top:4px">${esc(codigo)}</div>` : ""}`;
    const s = $("scanner");
    clearTimeout(piscaScanTimer);
    s.classList.remove("pisca-ok", "pisca-erro", "pisca-aviso");
    void s.offsetWidth;
    s.classList.add("pisca-" + tipo);
    piscaScanTimer = setTimeout(() => s.classList.remove("pisca-ok", "pisca-erro", "pisca-aviso"), 700);
}

// ───── SOM E VIBRAÇÃO ─────
// Mesmos tons do site (onda quadrada, faixa onde alto-falante de celular é mais forte).
let audioCtx = null;
function iniciarAudio() {
    if (audioCtx) { audioCtx.resume().catch(() => {}); return; }
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}
function tocarTom(notas, volume) {
    try {
        iniciarAudio();
        if (!audioCtx) return;
        audioCtx.resume().then(() => {
            const t = audioCtx.currentTime;
            notas.forEach(([inicio, freq, tipo, dur]) => {
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = tipo;
                osc.frequency.setValueAtTime(freq, t + inicio);
                gain.gain.setValueAtTime(volume, t + inicio);
                gain.gain.exponentialRampToValueAtTime(0.001, t + inicio + dur);
                osc.start(t + inicio);
                osc.stop(t + inicio + dur);
            });
        });
    } catch (_) {}
}
function beepSucesso() { tocarTom([[0, 880, "square", 0.13], [0.13, 1320, "square", 0.24]], 1); }
function beepErro()    { tocarTom([[0, 440, "square", 0.22], [0.24, 300, "square", 0.22]], 0.9); }

// Voz "Clãster errado" — a mesma Francisca do site. Enquanto não carregou, cai no bipe de erro.
let vozBuf = null, vozCarregando = null;
function carregarVozCluster() {
    if (vozBuf || vozCarregando) return;
    iniciarAudio();
    if (!audioCtx) return;
    vozCarregando = fetch("sons/cluster-errado.mp3")
        .then(r => r.arrayBuffer())
        .then(b => new Promise((ok, falha) => audioCtx.decodeAudioData(b, ok, falha)))
        .then(buf => { vozBuf = buf; })
        .catch(() => { vozCarregando = null; });
}
function vozClusterErrado() {
    try {
        if (!audioCtx || !vozBuf) { carregarVozCluster(); return beepErro(); }
        audioCtx.resume().then(() => {
            const src = audioCtx.createBufferSource();
            src.buffer = vozBuf;
            src.connect(audioCtx.destination);
            src.start();
        });
    } catch (_) { beepErro(); }
}

// Vibração diferente pra cada resultado: no bolso ou com barulho de galpão é o que chega.
function vibrar(tipo) {
    if (!Haptics) return;
    if (tipo === "ok") Haptics.impact({ style: "MEDIUM" }).catch(() => {});
    else if (tipo === "aviso") Haptics.notification({ type: "WARNING" }).catch(() => {});
    else Haptics.vibrate({ duration: 450 }).catch(() => {});
}

// ───── UTILIDADES ─────
async function copiar(btn, texto) {
    const rotulo = btn ? btn.textContent : "";
    const marcar = (t, ms) => {
        if (!btn) return;
        btn.textContent = t;
        btn.dataset.copiado = "1";
        setTimeout(() => { btn.textContent = rotulo; delete btn.dataset.copiado; }, ms);
    };
    try {
        await navigator.clipboard.writeText(texto);
        marcar("Copiado!", 1800);
    } catch (_) {
        try {
            const ta = document.createElement("textarea");
            ta.value = texto;
            ta.style.cssText = "position:fixed;left:-9999px;top:0";
            document.body.appendChild(ta);
            ta.select();
            const deu = document.execCommand("copy");
            ta.remove();
            marcar(deu ? "Copiado!" : "Não consegui copiar", 2000);
        } catch (_) { marcar("Não consegui copiar", 2000); }
    }
}

let janelaSim = null;
function janela({ titulo, texto, html, sim = "OK", nao = null, aoSim = null }) {
    $("modal-titulo").textContent = titulo || "";
    if (html != null) $("modal-corpo").innerHTML = html;
    else $("modal-corpo").textContent = texto || "";
    $("modal-sim").textContent = sim;
    $("modal-nao").textContent = nao || "Cancelar";
    $("modal-nao").hidden = !nao;
    janelaSim = aoSim;
    $("modal").hidden = false;
}
function fecharJanela() { $("modal").hidden = true; janelaSim = null; }
$("modal-sim").addEventListener("click", () => { const f = janelaSim; fecharJanela(); if (f) f(); });
$("modal-nao").addEventListener("click", fecharJanela);

function alerta(texto) { janela({ titulo: "Atenção", texto }); }
function confirmar(titulo, texto, sim, aoSim) { janela({ titulo, texto, sim, nao: "Cancelar", aoSim }); }

// ───── INÍCIO ─────
if (token) {
    agendarRenovacao();
    renovarToken();
    abrirDias();
} else {
    mostrar("tela-login");
}
