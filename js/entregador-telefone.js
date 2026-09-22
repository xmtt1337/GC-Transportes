// ───── TELEFONES DOS ENTREGADORES (SÓ DEV) ─────
// Um telefone por NOME PADRÃO DO SISTEMA (o mesmo nome já corrigido pela Conversão de
// nomes) — não por login/usuário. Assim um entregador com 5 grafias diferentes espalhadas
// pelos relatórios das transportadoras tem um número só, e é pra ele que qualquer aviso
// automático (ex.: rota da Shopee incompleta) vai ser mandado.
//
// A lista mostra TODO nome que já existe na Conversão de nomes, com ou sem telefone — é
// como fica visível quem ainda falta preencher, em vez de só quem já tem.

let _etfBuscaTimeout = null;
let _etfEditando = null; // nome_sistema do que está aberto no modal

function abrirEntregadorTelefone(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev edita os telefones dos entregadores.");
        return;
    }
    mostrarTela("tela-entregador-telefone");
    document.getElementById("etf-busca").value = "";
    document.getElementById("etf-so-falta").checked = false;
    _etfCarregar();
}

function _etfEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _etfJs(txt) {
    return String(txt ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function _etfBuscar() {
    clearTimeout(_etfBuscaTimeout);
    _etfBuscaTimeout = setTimeout(_etfCarregar, 300);
}

// 5549999276131 → +55 49 9 9927-6131
function _etfFormatarNumero(numero) {
    const n = String(numero || "").replace(/\D/g, "");
    const m11 = n.match(/^55(\d{2})9(\d{4})(\d{4})$/);
    if (m11) return `+55 ${m11[1]} 9 ${m11[2]}-${m11[3]}`;
    const m10 = n.match(/^55(\d{2})(\d{4})(\d{4})$/);
    if (m10) return `+55 ${m10[1]} ${m10[2]}-${m10[3]}`;
    return numero ? `+${n}` : "—";
}

function _etfCarregar() {
    const empty = document.getElementById("etf-empty");
    const result = document.getElementById("etf-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const q = document.getElementById("etf-busca").value.trim();
    const soFalta = document.getElementById("etf-so-falta").checked;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (soFalta) params.set("falta", "1");

    fetch(`${API}/admin/entregadores-telefone?${params}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            if (!d.linhas || !d.linhas.length) {
                skFim(empty, q || soFalta ? "Nenhum nome encontrado." : "Nenhum entregador na Conversão de nomes ainda.");
                _etfPintarResumo(d);
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("etf-truncado").style.display = d.truncado ? "" : "none";
            document.getElementById("etf-tbody").innerHTML = d.linhas.map(l => `
                <tr>
                    <td data-label="Entregador">${_etfEsc(l.nome_sistema)}</td>
                    <td data-label="Telefone">${l.telefone
                        ? _etfEsc(_etfFormatarNumero(l.telefone))
                        : '<span style="color:#66829c">sem telefone</span>'}</td>
                    <td data-label="Ações">
                        <button class="adm-usr-action senha" onclick="_etfAbrirEditar('${_etfJs(l.nome_sistema)}','${_etfJs(l.telefone || "")}')">${l.telefone ? "Editar" : "Adicionar"}</button>
                    </td>
                </tr>`).join("");
            _etfPintarResumo(d);
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _etfPintarResumo(d) {
    const el = document.getElementById("etf-resumo");
    if (!d || !d.total) { el.innerText = ""; return; }
    el.innerText = `${d.total.toLocaleString("pt-BR")} entregador${d.total !== 1 ? "es" : ""} · ${d.com_telefone.toLocaleString("pt-BR")} com telefone · ${d.sem_telefone.toLocaleString("pt-BR")} faltando`;
}

// ── Editar / adicionar ──
function _etfAbrirEditar(nome_sistema, telefoneAtual) {
    _etfEditando = nome_sistema;
    document.getElementById("etf-editar-nome").innerText = nome_sistema;
    document.getElementById("etf-editar-telefone").value = telefoneAtual ? _etfFormatarNumero(telefoneAtual) : "";
    document.getElementById("etf-editar-erro").innerText = "";
    document.getElementById("etf-editar-remover").style.display = telefoneAtual ? "" : "none";
    _abrirModal("modal-etf-editar");
    setTimeout(() => document.getElementById("etf-editar-telefone").focus(), 80);
}

// ── Telefone: máscara, mesma regra de js/whatsapp-teste.js (_waValidarTelefone) ──
function _etfDigitosLocais(valor) {
    const semPrefixo = String(valor || "").trim().replace(/^\+\s*55\s*/, "");
    let d = semPrefixo.replace(/\D/g, "");
    if (d.startsWith("55") && (d.length - 2 === 10 || d.length - 2 === 11)) d = d.slice(2);
    return d.slice(0, 11);
}

function _etfFormatarDigitando(valor) {
    const d = _etfDigitosLocais(valor);
    if (!d) return "";
    let out = "+55 " + d.slice(0, 2);
    const resto = d.slice(2);
    if (!resto) return out;
    if (resto.length <= 4)      out += " " + resto;
    else if (resto.length <= 8) out += " " + resto.slice(0, 4) + "-" + resto.slice(4);
    else                        out += " " + resto.slice(0, 1) + " " + resto.slice(1, 5) + "-" + resto.slice(5);
    return out;
}

function _etfMascaraTelefone(input) {
    input.value = _etfFormatarDigitando(input.value);
}

function _etfSalvar() {
    const telefone = document.getElementById("etf-editar-telefone").value.trim();
    const erro = document.getElementById("etf-editar-erro");
    erro.innerText = "";
    if (!telefone) { erro.innerText = "Informe o telefone."; return; }

    const btn = document.getElementById("etf-editar-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/entregadores-telefone`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ nome_sistema: _etfEditando, telefone })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-etf-editar");
            _etfCarregar();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

function _etfRemover() {
    const nome_sistema = _etfEditando;
    gcConfirm(`Remover o telefone de "${nome_sistema}"?`, () => {
        fetch(`${API}/admin/entregadores-telefone`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ nome_sistema })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível remover.");
                _fecharModal("modal-etf-editar");
                _etfCarregar();
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
    }, null, "Remover");
}
