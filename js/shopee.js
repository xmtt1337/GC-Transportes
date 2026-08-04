// ───── SHOPEE → RECEBER ─────
// Bipagem dos pedidos que chegam no hub. O XPT (CFC ou VIA) é escolhido antes e vale
// para toda a sessão, porque a pessoa recebe um lote inteiro no mesmo lugar — pedir o
// XPT a cada bipe seria um clique a mais por pacote, centenas por dia.
const SHR_XPTS = ["XPT_CFC", "XPT_VIA"];

let _shrXpt      = null;    // null = ainda não escolheu, campo de código fica escondido
let _shrDados    = [];      // recebimentos de hoje, do time inteiro
let _shrFiltro   = "todos";

function abrirShopeeReceber(event) {
    if (event) event.preventDefault();
    _shrXpt = null;
    _shrFiltro = "todos";
    document.getElementById("shr-codigo").value = "";
    _shrMsg("", null);
    _shrPintarXptTabs();
    _shrPintarFiltroTabs();
    mostrarTela("tela-shopee-receber");
    _shrCarregarHoje();
}

// ── Escolha do XPT ──
function _shrEscolherXpt(xpt) {
    if (!SHR_XPTS.includes(xpt)) return;
    _shrXpt = xpt;
    _shrPintarXptTabs();
    _shrMsg("", null);
    const campo = document.getElementById("shr-codigo");
    campo.focus();
    campo.select();
}

function _shrPintarXptTabs() {
    document.querySelectorAll("#shr-xpt-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.xpt === _shrXpt));
    // Sem XPT não há onde registrar, então o campo de código nem aparece — é mais claro
    // que deixá-lo visível e recusar cada bipe depois.
    document.getElementById("shr-campo-codigo").style.display = _shrXpt ? "" : "none";
    document.getElementById("shr-aviso-xpt").style.display    = _shrXpt ? "none" : "";
}

// ── Bipagem ──
function _shrCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _shrReceber(); }
}

function _shrScanCodigo() {
    if (!_shrXpt) return _shrMsg("Escolha o XPT antes de bipar.", "aviso");
    _bteAbrirScanner(texto => {
        document.getElementById("shr-codigo").value = texto;
        _shrReceber();
    });
}

function _shrReceber() {
    const campo  = document.getElementById("shr-codigo");
    const codigo = campo.value.trim();
    // Limpa e devolve o foco na hora: o leitor dispara o próximo bipe antes da resposta
    // do servidor chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_shrXpt) { _gcBeepErro(); return _shrMsg("Escolha o XPT antes de bipar.", "aviso"); }

    const xptDoBipe = _shrXpt; // guarda: a pessoa pode trocar de XPT enquanto a resposta vem

    fetch(`${API}/shopee/receber`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, xpt: xptDoBipe })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro();
            if (d.ja_recebido) {
                return _shrMsg(
                    `<strong>${codigo}</strong> já foi recebido hoje em <strong>${d.xpt || "—"}</strong>` +
                    `${d.usuario_nome ? " por " + d.usuario_nome : ""}${d.data_hora_brasilia ? " · " + d.data_hora_brasilia : ""}.`,
                    "aviso");
            }
            return _shrMsg(d.error || "Erro ao registrar.", "erro");
        }
        _gcBeepSucesso();
        _shrMsg(`✓ <strong>${d.codigo}</strong> recebido em <strong>${d.xpt}</strong>.`, "ok");
        // Insere na lista local em vez de recarregar: a cada bipe uma ida ao servidor
        // deixaria a bipagem em rajada lenta e acordaria o banco à toa.
        _shrDados.unshift({
            id: d.id, codigo: d.codigo, xpt: d.xpt, meu: true,
            usuario_nome: (window._gcUser && window._gcUser.displayName) || "—",
            data_hora_brasilia: d.data_hora_brasilia,
        });
        _shrRenderizar();
    })
    .catch(() => { _gcBeepErro(); _shrMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _shrMsg(msg, tipo) {
    const el = document.getElementById("shr-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// ── Registro do dia ──
function _shrCarregarHoje() {
    const empty  = document.getElementById("shr-empty");
    const result = document.getElementById("shr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    document.getElementById("shr-resumo").innerHTML = "";

    fetch(`${API}/shopee/recebimentos-hoje`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            _shrDados = Array.isArray(rows) ? rows : [];
            empty.style.display = "none";
            result.style.display = "";
            _shrRenderizar();
        })
        .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); });
}

function _shrTrocarFiltro(filtro) {
    _shrFiltro = filtro;
    _shrPintarFiltroTabs();
    _shrRenderizar();
}

function _shrPintarFiltroTabs() {
    document.querySelectorAll("#shr-filtro-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.filtro === _shrFiltro));
}

// Quem bipou vem marcado pelo servidor — ele é quem sabe o id de quem pediu.
function _shrEhMeu(r) {
    return r.meu === true;
}

function _shrRenderizar() {
    const meus = _shrDados.filter(_shrEhMeu).length;
    const cfc  = _shrDados.filter(r => r.xpt === "XPT_CFC").length;
    const via  = _shrDados.filter(r => r.xpt === "XPT_VIA").length;

    const card = (rotulo, valor, sub) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value">${valor}</div>
        </div>`;
    document.getElementById("shr-resumo").innerHTML =
        card("Recebidos hoje", _shrDados.length) +
        card("Você recebeu", meus, (window._gcUser && window._gcUser.displayName) || "") +
        card("XPT_CFC", cfc) +
        card("XPT_VIA", via);

    let rows = _shrDados;
    if (_shrFiltro === "meus") rows = rows.filter(_shrEhMeu);
    else if (SHR_XPTS.includes(_shrFiltro)) rows = rows.filter(r => r.xpt === _shrFiltro);

    document.getElementById("shr-tbody").innerHTML = rows.length ? rows.map(r => `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${r.codigo}</td>
            <td data-label="XPT"><span class="shr-xpt-tag ${r.xpt === "XPT_CFC" ? "cfc" : "via"}">${r.xpt}</span></td>
            <td data-label="Recebido por">${r.usuario_nome || "—"}</td>
            <td data-label="Data / hora" style="color:#94a3b8">${r.data_hora_brasilia || "—"}</td>
        </tr>`).join("")
        : `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:26px 10px">Nenhum recebimento nesse filtro.</td></tr>`;
}
