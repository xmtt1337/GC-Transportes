// ───── MODAL TELEFONE ─────
let _mtUserId = null;

function _abrirModalTelefone(id, nome, telefone) {
    _mtUserId = id;
    document.getElementById("mt-sub").textContent   = "WhatsApp de " + nome;
    document.getElementById("mt-telefone").value    = telefone || "";
    document.getElementById("mt-erro").textContent  = "";
    _abrirModal("modal-telefone");
    setTimeout(() => document.getElementById("mt-telefone").focus(), 80);
}

function _salvarTelefone() {
    const tok      = localStorage.getItem("token");
    const telefone = document.getElementById("mt-telefone").value.trim();
    const btn      = document.getElementById("mt-btn-salvar");
    const erro     = document.getElementById("mt-erro");
    erro.textContent = "";
    btn.disabled    = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/usuarios/${_mtUserId}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ telefone })
    }).then(r => r.json())
    .then(data => {
        btn.disabled    = false;
        btn.textContent = "Salvar";
        if (data.error) { erro.textContent = data.error; return; }
        _fecharModal("modal-telefone");
        _carregarUsuarios();
    }).catch(() => {
        btn.disabled    = false;
        btn.textContent = "Salvar";
        erro.textContent = "Erro ao salvar telefone.";
    });
}

function _carregarPainelAdmin() {
    const empty = document.getElementById("adm-fech-empty");
    const data  = document.getElementById("adm-fech-data");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    data.style.display = "none";

    fetch(`${API}/admin/painel?entregador=${encodeURIComponent(_admFEntregador)}&mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json().then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            empty.innerText = body.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        const d = body;

        const banner = document.getElementById("adm-pb-banner");
        banner.className = "painel-banner " + (d.total_receber_num < 0 ? "banner-negativo" : "banner-positivo");
        document.getElementById("adm-pb-total-receber").innerText   = d.total_receber;
        document.getElementById("adm-pb-total-entregues").innerText = d.total_entregues;

        document.getElementById("adm-paj-adicional").innerText    = d.adicional;
        document.getElementById("adm-paj-adicional-card").className = "paj-card " + (_parseMoeda(d.adicional) < 0 ? "negativo" : "positivo");
        document.getElementById("adm-paj-deslocamento").innerText = d.deslocamento;
        document.getElementById("adm-paj-grandes").innerText      = d.valor_grandes;
        document.getElementById("adm-paj-descontos").innerText    = d.descontos;
        document.getElementById("adm-paj-ticket").innerText       = d.desconto_ticket;

        document.getElementById("adm-pt-loggi-v").innerText  = d.valor_loggi;
        document.getElementById("adm-pt-loggi-q").innerText  = d.entregues_loggi + " pacotes";
        document.getElementById("adm-pt-jt-v").innerText     = d.valor_jt;
        document.getElementById("adm-pt-jt-q").innerText     = d.entregues_jt + " pacotes";
        document.getElementById("adm-pt-imile-v").innerText  = d.valor_imile;
        document.getElementById("adm-pt-imile-q").innerText  = d.qtd_imile + " pacotes";
        document.getElementById("adm-pt-anjun-v").innerText  = d.valor_anjun;
        document.getElementById("adm-pt-anjun-q").innerText  = d.entregues_anjun + " pacotes";
        document.getElementById("adm-pt-shopee-v").innerText = d.valor_shopee;
        document.getElementById("adm-pt-shopee-q").innerText = d.entregues_shopee + " pacotes";

        _renderExtravios(d.extravios_linhas, "adm-extravios-lista");

        const multTbody = document.getElementById("adm-multas-tbody");
        multTbody.innerHTML = d.multas_linhas.length
            ? d.multas_linhas.map(m => `<tr>
                <td class="mono">${m.transportadora}</td>
                <td class="mono">${m.codigo}</td>
                <td class="${m.tem_valor ? 'val-neg' : ''}">${m.valor}</td>
              </tr>`).join("")
            : `<tr><td colspan="3" class="poc-empty">Nenhuma multa no período</td></tr>`;

        empty.style.display = "none";
        data.style.display  = "";
        data.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch(() => {
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}
