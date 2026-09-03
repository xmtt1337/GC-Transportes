// ───── ATRIBUIÇÕES → SOLICITAR AT ─────
// O entregador bipa, na rua, o pacote que chegou na mão dele sem ter passado pelo
// recebimento nem pela atribuição no SPX. O código entra na MESMA fila do galpão, e
// quem cola no SPX é o colador que já roda lá — um pro Recebimento, outro pra AT.
// Por isso a tela não confirma "pronto": ela mostra o ANDAMENTO de cada pedido, que
// só avança quando o colador do galpão passa por ele.
//
// Sem seletor de XPT de propósito: o entregador não tem polo no cadastro, e o XPT sai
// da rota que ele já tem hoje. Deixar escolher seria deixar errar.

const SOLAT_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// Dois estados, não três: pra quem está na rua, "recebido no SPX mas ainda sem AT"
// e "nem recebido" são a mesma espera. O que muda a vida dele é ter a AT ou não.
const SOLAT_STATUS = {
    criando: { rotulo: "Criando", cor: "#eab308" },
    criada:  { rotulo: "Criada",  cor: "#22c55e" },
};

let _solatXpt = null;      // XPT da rota de hoje; null = sem rota hoje
let _solatItens = [];

function _solatEsc(txt) {
    return String(txt || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirSolicitarAT(event) {
    if (event) event.preventDefault();
    _solatXpt = null;
    _solatItens = [];
    document.getElementById("solat-codigo").value = "";
    _solatMsg("", null);
    document.getElementById("solat-empty").innerText = "Carregando...";
    document.getElementById("solat-resultado").style.display = "none";
    mostrarTela("tela-solicitar-at");
    _solatCarregarHoje();
}

// O mesmo GET responde as duas perguntas: se ele tem rota hoje (daí sai o XPT) e o que
// ele já pediu. Uma ida só ao servidor — quem abre isso está na rua, com rede ruim.
function _solatCarregarHoje() {
    fetch(`${API}/entregador/solicitar-at/hoje`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        _solatXpt = d.xpt || null;
        _solatItens = d.itens || [];
        _solatPintarXpt();
        _solatRenderizar();
    })
    .catch(() => {
        document.getElementById("solat-empty").innerText = "Erro ao carregar. Puxe a tela pra recarregar.";
    });
}

function _solatPintarXpt() {
    const faixa = document.getElementById("solat-faixa");
    faixa.style.display = _solatXpt ? "" : "none";
    faixa.className = "shr-faixa" + (_solatXpt === "XPT_VIA" ? " via" : " cfc");
    if (_solatXpt) document.getElementById("solat-faixa-xpt").innerText = _solatXpt;

    // Sem rota hoje não há XPT, e sem XPT não há onde lançar: o campo sai do caminho em
    // vez de aceitar o bipe e recusar cada um depois.
    document.getElementById("solat-campo-codigo").style.display = _solatXpt ? "" : "none";

    const aviso = document.getElementById("solat-aviso");
    if (_solatXpt) {
        aviso.style.display = "none";
        document.getElementById("solat-codigo").focus();
    } else {
        aviso.style.display = "";
        aviso.innerText = "Você não tem rota hoje. Sem rota não dá pra saber em qual XPT lançar o pedido — "
                        + "fale com a operação.";
    }
}

// Pisca a borda do campo. Quem bipa em rajada não lê a mensagem — a cor no canto do
// olho é o que diz se entrou.
let _solatFlashTimer = null;
function _solatFlash(tipo) {
    const wrap = document.getElementById("solat-campo-codigo");
    if (!wrap) return;
    clearTimeout(_solatFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth;
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _solatFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

function _solatCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _solatEnviar(); }
}

function _solatScanCodigo() {
    if (!_solatXpt) return;
    _bteAbrirScanner(texto => {
        document.getElementById("solat-codigo").value = texto;
        _solatEnviar();
    });
}

function _solatEnviar() {
    const campo  = document.getElementById("solat-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco antes da resposta: o leitor dispara o próximo bipe antes de
    // ela chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_solatXpt) { _gcBeepErro(); return; }
    if (!SOLAT_CODIGO_RE.test(codigo)) {
        _gcBeepErro(); _solatFlash("err");
        return _solatMsg(`<strong>${_solatEsc(codigo)}</strong> não é um código válido — precisa ser BR seguido de 13 caracteres.`, "erro");
    }

    fetch(`${API}/entregador/solicitar-at`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _solatFlash("err");
            // A rota pode ter mudado com a tela aberta (ele saiu da rota, virou o dia):
            // repinta em vez de deixar bipando contra um erro fixo.
            if (d.sem_rota) { _solatXpt = null; _solatPintarXpt(); }
            if (d.ja_pedido) {
                return _solatMsg(
                    `<strong>${_solatEsc(codigo)}</strong> ${_solatEsc(d.error)}` +
                    `${d.usuario_nome ? " (" + _solatEsc(d.usuario_nome) + ")" : ""}`,
                    "aviso");
            }
            return _solatMsg(_solatEsc(d.error) || "Erro ao pedir.", "erro");
        }
        _gcBeepSucesso(); _solatFlash("ok");
        _solatMsg(`✓ <strong>${_solatEsc(d.codigo)}</strong> na fila do galpão.`, "ok");
        // Entra na lista local em vez de recarregar: uma ida ao servidor por bipe deixaria
        // a rajada lenta. O andamento real chega no próximo "Atualizar".
        _solatItens.unshift({ id: d.id, codigo: d.codigo, status: "criando", at: null });
        _solatRenderizar();
    })
    .catch(() => { _gcBeepErro(); _solatMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _solatMsg(msg, tipo) {
    const el = document.getElementById("solat-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { ok: "#22c55e", erro: "#f87171", aviso: "#eab308" };
    el.style.display = "";
    el.style.color = cores[tipo] || "#cbd5e1";
    el.style.fontSize = "13px";
    el.innerHTML = msg;
}

function _solatRenderizar() {
    const empty  = document.getElementById("solat-empty");
    const result = document.getElementById("solat-resultado");

    if (!_solatItens.length) {
        empty.style.display = "";
        empty.innerText = _solatXpt
            ? "Nenhum pedido hoje. Bipe um código acima."
            : "Nenhum pedido hoje.";
        result.style.display = "none";
        return;
    }
    empty.style.display = "none";
    result.style.display = "";

    const criando = _solatItens.filter(i => i.status === "criando").length;
    document.getElementById("solat-lista-titulo").innerText =
        `Pedidos de hoje · ${_solatItens.length}` + (criando ? ` · ${criando} criando` : "");

    document.getElementById("solat-tbody").innerHTML = _solatItens.map(i => {
        const s = SOLAT_STATUS[i.status] || { rotulo: i.status, cor: "#8494a9" };
        return `<tr>
            <td data-label="Código"><strong>${_solatEsc(i.codigo)}</strong></td>
            <td data-label="Andamento">
                <span style="display:inline-flex;align-items:center;gap:6px;color:${s.cor}">
                    <span style="width:7px;height:7px;border-radius:50%;background:${s.cor}"></span>
                    ${s.rotulo}
                </span>
            </td>
            <td data-label="AT">${i.at ? `<strong>${_solatEsc(i.at)}</strong>` : "—"}</td>
        </tr>`;
    }).join("");
}
