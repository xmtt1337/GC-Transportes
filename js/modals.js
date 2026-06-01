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

    const g = id => (document.getElementById(id) || {innerText:"—"}).innerText;

    const bannerNeg  = document.getElementById("adm-pb-banner").className.includes("negativo");
    const mainColor  = bannerNeg ? "#ef4444" : "#22c55e";
    const adicNeg    = document.getElementById("adm-paj-adicional-card").className.includes("negativo");

    // Extravios
    const extEls    = Array.from(document.querySelectorAll("#adm-extravios-lista .extr-card"));
    const extVazio  = !!document.querySelector("#adm-extravios-lista .extr-vazio") || !extEls.length;

    // Multas
    const multasRows = Array.from(document.querySelectorAll("#adm-multas-tbody tr")).map(tr => {
        const tds = tr.querySelectorAll("td");
        return tds.length ? {
            transp: tds[0]?.innerText || "—",
            codigo: tds[1]?.innerText || "—",
            valor:  tds[2]?.innerText || "—",
            isNeg:  tds[2]?.className?.includes("val-neg") || false
        } : null;
    }).filter(Boolean);
    const multasVazio = !multasRows.length || (multasRows[0].transp.length > 10 && !multasRows[0].codigo.trim());

    const pCard = (label, val, neg) =>
        `<div style="flex:1;min-width:120px;background:#1b263b;border:1px solid rgba(58,134,255,0.13);border-radius:8px;padding:10px 12px">
            <div style="font-size:10px;color:#7a8599;margin-bottom:5px">${label}</div>
            <div style="font-size:14px;font-weight:700;color:${neg?"#f87171":"#4ade80"}">${val}</div>
        </div>`;

    const transpDefs = [
        ["Loggi","adm-pt-loggi-v","adm-pt-loggi-q"],
        ["J&T","adm-pt-jt-v","adm-pt-jt-q"],
        ["iMile","adm-pt-imile-v","adm-pt-imile-q"],
        ["Anjun","adm-pt-anjun-v","adm-pt-anjun-q"],
        ["Shopee","adm-pt-shopee-v","adm-pt-shopee-q"],
    ];

    const htmlStr = `
    <div style="background:#0f0f14;color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:22px;width:760px;box-sizing:border-box">

        <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid rgba(58,134,255,0.25)">
            <div style="font-size:9px;font-weight:700;color:#3a86ff;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">GC TRANSPORTES · FECHAMENTO</div>
            <div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:3px">${nome}</div>
            <div style="font-size:12px;color:#7a8599">${quinzena}ª Quinzena &nbsp;·&nbsp; ${mes} / ${ano}</div>
        </div>

        <div style="background:${bannerNeg?"rgba(239,68,68,0.09)":"rgba(34,197,94,0.09)"};border:1px solid ${mainColor};border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;gap:20px;align-items:center">
            <div>
                <div style="font-size:9px;font-weight:700;color:${mainColor};text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Valor líquido a receber</div>
                <div style="font-size:26px;font-weight:700;color:${mainColor}">${g("adm-pb-total-receber")}</div>
                <div style="font-size:10px;color:#7a8599;margin-top:3px">Resultado final após todos os descontos e acréscimos</div>
            </div>
            <div style="width:1px;background:rgba(58,134,255,0.2);height:48px"></div>
            <div>
                <div style="font-size:10px;color:#7a8599;margin-bottom:2px">Total entregues</div>
                <div style="font-size:22px;font-weight:700;color:#f1f5f9">${g("adm-pb-total-entregues")}</div>
                <div style="font-size:9px;color:#7a8599;margin-top:2px">pacotes finalizados</div>
            </div>
        </div>

        <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">
            ${pCard("Adicional / Desconto", g("adm-paj-adicional"), adicNeg)}
            ${pCard("Deslocamento", g("adm-paj-deslocamento"), false)}
            ${pCard("Pacotes Grandes", g("adm-paj-grandes"), false)}
            ${pCard("Extravios + Multas", g("adm-paj-descontos"), true)}
            ${pCard("Ticket Log", g("adm-paj-ticket"), true)}
        </div>

        <div style="font-size:10px;font-weight:700;color:#aab4c8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Transportadoras</div>
        <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">
            ${transpDefs.map(([label,vId,qId]) =>
                `<div style="flex:1;min-width:110px;background:#1b263b;border:1px solid rgba(58,134,255,0.13);border-radius:8px;padding:10px 12px">
                    <div style="font-size:11px;font-weight:700;color:#f1f5f9;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid rgba(58,134,255,0.1)">${label}</div>
                    <div style="font-size:9px;color:#7a8599;margin-bottom:2px">Valor</div>
                    <div style="font-size:13px;font-weight:700;color:#4ade80;margin-bottom:5px">${g(vId)}</div>
                    <div style="font-size:9px;color:#7a8599">${g(qId)}</div>
                </div>`).join("")}
        </div>

        <div style="font-size:10px;font-weight:700;color:#aab4c8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Ocorrências</div>
        <div style="display:flex;gap:10px">
            <div style="flex:1;background:#1b263b;border:1px solid rgba(58,134,255,0.13);border-radius:8px;padding:12px">
                <div style="font-size:11px;font-weight:700;color:#f1f5f9;margin-bottom:8px">Extravios</div>
                ${extVazio
                    ? `<div style="font-size:11px;color:#4a6a8a;padding:6px 0">Nenhum extravio no período</div>`
                    : extEls.map(el => {
                        const tr   = el.querySelector(".extr-transp")?.innerText || "—";
                        const cod  = el.querySelector(".extr-codigo")?.innerText || "—";
                        const end  = el.querySelector(".extr-endereco")?.innerText || "—";
                        const vEl  = el.querySelector(".extr-valor");
                        const val  = vEl?.innerText || "—";
                        const neg  = vEl?.className?.includes("val-neg");
                        return `<div style="background:rgba(15,15,20,0.55);border-radius:6px;padding:7px 9px;margin-bottom:5px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                                <span style="font-size:10px;font-weight:700;color:#94a3b8">${tr}</span>
                                <span style="font-size:9px;font-family:monospace;color:#64748b">${cod}</span>
                            </div>
                            <div style="font-size:10px;color:#7a8599;margin-bottom:2px">${end}</div>
                            <div style="font-size:11px;font-weight:700;color:${neg?"#f87171":"#94a3b8"}">${val}</div>
                        </div>`;
                    }).join("")}
            </div>
            <div style="flex:1;background:#1b263b;border:1px solid rgba(58,134,255,0.13);border-radius:8px;padding:12px">
                <div style="font-size:11px;font-weight:700;color:#f1f5f9;margin-bottom:8px">Multas</div>
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="border-bottom:1px solid rgba(58,134,255,0.15)">
                        <th style="text-align:left;font-size:9px;color:#4a6a8a;padding:3px 5px;font-weight:600">Transportadora</th>
                        <th style="text-align:left;font-size:9px;color:#4a6a8a;padding:3px 5px;font-weight:600">Código</th>
                        <th style="text-align:right;font-size:9px;color:#4a6a8a;padding:3px 5px;font-weight:600">Valor</th>
                    </tr></thead>
                    <tbody>
                        ${multasVazio
                            ? `<tr><td colspan="3" style="font-size:10px;color:#4a6a8a;padding:6px 5px">Nenhuma multa no período</td></tr>`
                            : multasRows.map(m =>
                                `<tr style="border-bottom:1px solid rgba(58,134,255,0.08)">
                                    <td style="font-size:10px;font-family:monospace;color:#94a3b8;padding:4px 5px">${m.transp}</td>
                                    <td style="font-size:10px;font-family:monospace;color:#94a3b8;padding:4px 5px">${m.codigo}</td>
                                    <td style="font-size:10px;text-align:right;font-weight:700;color:${m.isNeg?"#f87171":"#94a3b8"};padding:4px 5px">${m.valor}</td>
                                </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;

    // Overlay de loading
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(7,9,14,0.88);display:flex;align-items:center;justify-content:center;z-index:9998;font-family:Inter,sans-serif";
    overlay.innerHTML = `<div style="text-align:center;color:#f1f5f9"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><div style="font-size:14px;font-weight:600">Gerando PDF...</div></div>`;
    document.body.appendChild(overlay);

    // Conteúdo posicionado no viewport (z-index 1, atrás do overlay)
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:0;left:0;z-index:1;";
    container.innerHTML = htmlStr;
    document.body.appendChild(container);

    const nomeArq  = nome.replace(/[<>:"/\\|?*]/g, "").trim();
    const filename = `${nomeArq}_${quinzena}Q ${mes} ${ano}.pdf`;

    const cleanup = () => {
        [overlay, container].forEach(el => { if (document.body.contains(el)) document.body.removeChild(el); });
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Baixar PDF`;
    };

    setTimeout(() => {
        html2pdf().set({
            margin:      [6, 6, 6, 6],
            filename:    filename,
            image:       { type: "jpeg", quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#0f0f14", logging: false },
            jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" }
        }).from(container.firstElementChild).save().then(cleanup).catch(cleanup);
    }, 400);
}
