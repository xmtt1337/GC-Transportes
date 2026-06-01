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

function _baixarPainelAdminPDF() {
    const btn = document.getElementById("adm-pdf-btn");
    const MESES_PDF = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Gerando...`;

    const nome     = _admFEntregador;
    const mes      = MESES_PDF[_admFMes] || _admFMes;
    const quinzena = _admFQuinzena;
    const ano      = _admFAno;

    // Monta wrapper isolado no body (sem overflow do fech-body)
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:absolute;left:-9999px;top:0;width:794px;background:#0f0f14;padding:28px 24px;font-family:Inter,sans-serif;color:#f1f5f9;box-sizing:border-box;";

    // Cabeçalho do PDF
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(58,134,255,0.2);";
    header.innerHTML = `
        <div style="font-size:10px;font-weight:700;color:#3a86ff;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">GC TRANSPORTES · FECHAMENTO</div>
        <div style="font-size:20px;font-weight:700;color:#f1f5f9;margin-bottom:4px">${nome}</div>
        <div style="font-size:13px;color:#7a8599">${quinzena}ª Quinzena &nbsp;·&nbsp; ${mes} / ${ano}</div>`;
    wrapper.appendChild(header);

    // Clona o painel sem os botões de ação
    const clone = document.getElementById("adm-fech-data").cloneNode(true);
    const topbar = clone.querySelector("#adm-fech-topbar");
    if (topbar) topbar.remove();
    const pdfHeader = clone.querySelector("#adm-pdf-header");
    if (pdfHeader) pdfHeader.remove();
    clone.style.cssText = "display:block;";
    wrapper.appendChild(clone);

    document.body.appendChild(wrapper);

    // Sanitiza o nome para usar no arquivo
    const nomeArq = nome.replace(/[<>:"/\\|?*]/g, "").trim();
    const filename = `${nomeArq}_${quinzena}Q ${mes} ${ano}.pdf`;

    const resetBtn = () => {
        if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Baixar PDF`;
    };

    html2pdf().set({
        margin:     [8, 6, 8, 6],
        filename:   filename,
        image:      { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#0f0f14", logging: false, scrollY: 0 },
        jsPDF:      { unit: "mm", format: "a4", orientation: "portrait" }
    }).from(wrapper).save().then(resetBtn).catch(resetBtn);
}
