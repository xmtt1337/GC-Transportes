/**
 * Meus pagamentos › Repasse para a equipe.
 *
 * O dono de uma empresa (configurado no servidor) divide o líquido da quinzena dele entre as
 * contas da equipe. Tudo que importa é conferido no servidor (quem é dono, quem pode receber,
 * saldo, valor); a tela só mostra e manda o pedido. Backend: modules/repasses.
 */

let _rpMes = new Date().getMonth() + 1;
let _rpAno = new Date().getFullYear();
let _rpQuinzena = null;
let _rpDados = null;
let _rpReqId = 0;
let _rpEnviando = false;

const _rpEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _rpR = (v) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _rpData = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

/** Mostra o menu só pro dono (o servidor decide). */
function rpCarregarMenu() {
    fetch(`${API}/repasses/permissao`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { const li = document.getElementById("menu-ent-repasse"); if (li) li.style.display = d && d.pode ? "" : "none"; })
        .catch(() => {});
}

function abrirRepasses(event) {
    if (event) event.preventDefault();
    _rpQuinzena = null;
    _rpDados = null;
    _rpReqId++;
    const selAno = document.getElementById("rp-ano");
    selAno.innerHTML = "";
    const anoAtual = new Date().getFullYear();
    for (let a = anoAtual - 1; a <= anoAtual; a++) selAno.insertAdjacentHTML("beforeend", `<option value="${a}"${a === _rpAno ? " selected" : ""}>${a}</option>`);
    document.getElementById("rp-mes").value = _rpMes;
    document.getElementById("rp-btn-1q").classList.remove("active");
    document.getElementById("rp-btn-2q").classList.remove("active");
    document.getElementById("rp-conteudo").innerHTML = `<div class="fechamento-empty">Selecione o mês, ano e quinzena.</div>`;
    mostrarTela("tela-repasses");
}

function rpSelecionarQuinzena(q) {
    _rpQuinzena = q;
    document.getElementById("rp-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("rp-btn-2q").classList.toggle("active", q === 2);
    rpCarregar();
}

function rpCarregar() {
    _rpMes = parseInt(document.getElementById("rp-mes").value, 10);
    _rpAno = parseInt(document.getElementById("rp-ano").value, 10);
    if (!_rpQuinzena) return;
    const el = document.getElementById("rp-conteudo");
    el.innerHTML = `<div class="xm-carregando xm-carregando-p" role="status"><span>Carregando</span></div>`;
    const id = ++_rpReqId;
    fetch(`${API}/repasses?mes=${_rpMes}&ano=${_rpAno}&quinzena=${_rpQuinzena}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (id !== _rpReqId) return;
            if (!ok) { _rpDados = null; el.innerHTML = `<div class="fechamento-empty">${_rpEsc(d.error || "Erro ao carregar.")}</div>`; return; }
            _rpDados = d;
            _rpDesenhar();
        })
        .catch(() => { if (id === _rpReqId) el.innerHTML = `<div class="fechamento-empty">Erro ao carregar.</div>`; });
}

function _rpDesenhar() {
    const d = _rpDados;
    const el = document.getElementById("rp-conteudo");
    const ativos = d.repasses.filter(r => !r.cancelado_em);
    const pagamento = d.pagamento ? d.pagamento.split("-").reverse().join("/") : "";
    const form = d.fechada
        ? `<div class="ant-form-msg" style="display:block">Esta quinzena já foi paga (${_rpEsc(pagamento)}): não dá mais pra repassar.</div>`
        : !d.equipe.length
            ? `<div class="ant-form-msg" style="display:block">Nenhuma conta da equipe cadastrada.</div>`
            : `<div class="ant-form-grid">
                <div class="ant-field">
                    <label class="ant-label" for="rp-para">Conta da equipe</label>
                    <select id="rp-para" class="ant-input"><option value="">Escolha…</option>${d.equipe.map(n => `<option value="${_rpEsc(n)}">${_rpEsc(n)}</option>`).join("")}</select>
                </div>
                <div class="ant-field">
                    <label class="ant-label" for="rp-valor">Valor</label>
                    <input type="text" id="rp-valor" class="ant-input" inputmode="decimal" maxlength="13" placeholder="0,00" autocomplete="off">
                </div>
            </div>
            <div id="rp-msg" class="ant-form-msg" style="display:none"></div>
            <button id="rp-enviar" onclick="rpEnviar()" class="ant-submit-btn">Repassar</button>`;
    el.innerHTML = `
        <div class="ant-nf-card">
            <div class="ant-nf-label">Sua quinzena</div>
            <div class="ant-nf-info">
                Líquido ${_rpR(d.liquido)}${d.antecipado ? ` · antecipação pedida ${_rpR(d.antecipado)}` : ""} · já repassado ${_rpR(d.repassado)}<br>
                <strong>Disponível pra repassar: ${_rpR(d.saldo)}</strong>
            </div>
        </div>
        <div class="ant-form-wrap">
            <div class="ant-form-title">Repassar para a equipe</div>
            ${form}
        </div>
        <div class="ant-form-wrap">
            <div class="ant-form-title">Repasses desta quinzena</div>
            ${d.repasses.length ? `<table class="ant-hist-table"><thead><tr><th>Para</th><th>Valor</th><th>Quando</th><th></th></tr></thead><tbody>
                ${d.repasses.map(r => `<tr${r.cancelado_em ? ' style="opacity:.55"' : ""}>
                    <td>${_rpEsc(r.para_driver)}</td><td>${_rpR(r.valor)}</td><td>${_rpEsc(_rpData(r.criado_em))}</td>
                    <td>${r.cancelado_em ? "cancelado" : d.fechada ? "" : `<a href="#" class="rp-link" onclick="event.preventDefault();rpCancelar(${Number(r.id)})">cancelar</a>`}</td></tr>`).join("")}
            </tbody></table>` : `<div class="fechamento-empty" style="padding:12px 0">Nenhum repasse nesta quinzena.</div>`}
            ${ativos.length ? `<div class="ant-label" style="margin-top:8px">Total repassado: ${_rpR(d.repassado)}</div>` : ""}
        </div>`;
}

function _rpMsg(texto) {
    const m = document.getElementById("rp-msg");
    if (!m) return;
    m.textContent = texto || "";
    m.style.display = texto ? "block" : "none";
}

function rpEnviar() {
    if (_rpEnviando || !_rpDados) return;
    const para = document.getElementById("rp-para").value;
    const valor = document.getElementById("rp-valor").value.trim();
    if (!para) return _rpMsg("Escolha a conta da equipe.");
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(valor.replace(/^R\$\s*/i, ""))) return _rpMsg("Valor inválido. Ex.: 150,00");
    _rpMsg("");
    gcConfirm(`Repassar ${_rpEsc(valor.startsWith("R$") ? valor : "R$ " + valor)} para ${_rpEsc(para)}? Sai do seu fechamento desta quinzena e entra no dele.`, () => {
        _rpEnviando = true;
        const btn = document.getElementById("rp-enviar");
        if (btn) btn.disabled = true;
        fetch(`${API}/repasses`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ mes: _rpMes, ano: _rpAno, quinzena: _rpQuinzena, para, valor }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { _rpMsg(d.error || "Erro ao repassar."); return; }
                rpCarregar();
            })
            .catch(() => _rpMsg("Erro ao repassar."))
            .finally(() => { _rpEnviando = false; const b = document.getElementById("rp-enviar"); if (b) b.disabled = false; });
    }, "Confirmar repasse", "Repassar");
}

function rpCancelar(id) {
    const r = _rpDados && _rpDados.repasses.find(x => x.id === id);
    if (!r) return;
    gcConfirm(`Cancelar o repasse de ${_rpR(r.valor)} para ${_rpEsc(r.para_driver)}? O valor volta pro seu fechamento.`, () => {
        fetch(`${API}/repasses/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } })
            .then(x => x.json().then(d => ({ ok: x.ok, d })))
            .then(({ ok, d }) => { if (!ok) gcAlert(_rpEsc(d.error || "Erro ao cancelar.")); rpCarregar(); })
            .catch(() => gcAlert("Erro ao cancelar."));
    }, "Cancelar repasse", "Sim, cancelar");
}
