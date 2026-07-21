// ───── IMPRESSÃO DE ETIQUETAS (identificação de sacas por entregador) ─────
// O pessoal interno seleciona transportadora + entregador (da planilha de cadastro,
// col A = ID / col B = nome), quantidade e data, e imprime etiquetas grandes (2 por
// folha A4) com as logos, nome, ID, volume X/N e código de barras do ID.
const _ETQ_TRANSPORTADORAS = [
    { valor: "loggi",         label: "Loggi",         logo: "img/Transportadoras/loggi.preta.png" },
    { valor: "anjun",         label: "Anjun",         logo: "img/Transportadoras/Anjun.preto.png" },
    { valor: "imile",         label: "iMile",         logo: "img/Transportadoras/iMile.preto.png" },
    { valor: "jt",            label: "J&T Express",   logo: "img/Transportadoras/JET.pretajpg.png" },
    { valor: "shopee",        label: "Shopee",        logo: "img/Transportadoras/SPX.preta.png" },
    { valor: "total_express", label: "Total Express", logo: "img/Transportadoras/Total Express Preta.png" },
];
const _ETQ_LOGO_GC = "img/Transportadoras/GC preto sem fundo.png";

let _etqEntregadores = [];  // [{id, nome}] — cache da planilha
let _etqTransp = null;

function abrirEtiquetas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-etiquetas");
    _etqRenderChips();
    _etqDataHoje();
    _etqCarregarEntregadores();
}

function _etqRenderChips() {
    const wrap = document.getElementById("etq-transp-chips");
    if (wrap.childElementCount) return; // já renderizado
    wrap.innerHTML = _ETQ_TRANSPORTADORAS.map(t =>
        `<button type="button" class="dev-chip" data-transp="${t.valor}" onclick="_etqSelecionarTransp('${t.valor}')">${t.label}</button>`
    ).join("");
}

function _etqSelecionarTransp(valor) {
    _etqTransp = valor;
    document.querySelectorAll("#etq-transp-chips .dev-chip").forEach(c =>
        c.classList.toggle("active", c.dataset.transp === valor));
}

function _etqDataHoje() {
    const hoje = new Date();
    document.getElementById("etq-data").value =
        `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

function _etqCarregarEntregadores() {
    if (_etqEntregadores.length) return;
    fetch(`${API}/etiquetas/entregadores`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows)) return;
            _etqEntregadores = rows;
            document.getElementById("etq-ent-datalist").innerHTML =
                rows.map(e => `<option value="${e.nome.replace(/"/g, "&quot;")}">`).join("");
        })
        .catch(() => _etqMsg("Erro ao carregar a lista de entregadores.", "erro"));
}

function _etqEntregadorAtual() {
    const nome = document.getElementById("etq-entregador").value.trim().toLowerCase();
    return _etqEntregadores.find(e => e.nome.toLowerCase() === nome) || null;
}

function _etqEntregadorMudou() {
    const ent = _etqEntregadorAtual();
    const row = document.getElementById("etq-ent-id-row");
    if (ent) {
        row.style.display = "";
        document.getElementById("etq-ent-id").innerText = ent.id;
    } else {
        row.style.display = "none";
    }
}

function _etqQtdDelta(d) {
    const campo = document.getElementById("etq-qtd");
    const v = Math.min(60, Math.max(1, (parseInt(campo.value) || 1) + d));
    campo.value = v;
}

function _etqMsg(msg, tipo) {
    const el = document.getElementById("etq-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px;margin-bottom:14px`;
    el.innerHTML = msg;
}

function _etqImprimir() {
    _etqMsg("", null);
    const transp = _ETQ_TRANSPORTADORAS.find(t => t.valor === _etqTransp);
    if (!transp) return _etqMsg("Selecione a transportadora.", "erro");
    const ent = _etqEntregadorAtual();
    if (!ent) return _etqMsg("Selecione um entregador da lista (digite e escolha uma das opções).", "erro");
    const qtd = parseInt(document.getElementById("etq-qtd").value) || 0;
    if (qtd < 1 || qtd > 60) return _etqMsg("Quantidade de etiquetas deve ser entre 1 e 60.", "erro");
    const pacotes = parseInt(document.getElementById("etq-pacotes").value) || 0;
    if (pacotes < 1) return _etqMsg("Informe a quantidade de pacotes.", "erro");
    const dataVal = document.getElementById("etq-data").value;
    if (!dataVal) return _etqMsg("Selecione a data.", "erro");
    const [ano, mes, dia] = dataVal.split("-");
    const dataFmt = `${dia}/${mes}/${ano}`;

    // O ID da carga (GC + ano + 7 dígitos) vem do servidor — sequencial e único por impressão
    const btn = document.getElementById("etq-btn");
    btn.disabled = true;
    fetch(`${API}/etiquetas/carga`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            transportadora: transp.valor, entregador_id: ent.id, entregador_nome: ent.nome,
            qtd_sacas: qtd, qtd_pacotes: pacotes, data: dataFmt
        })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false;
        if (!d.numero) return _etqMsg(d.error || "Erro ao gerar o ID da carga.", "erro");
        _etqAbrirImpressao(transp, ent, qtd, pacotes, dataFmt, d.numero);
    })
    .catch(() => { btn.disabled = false; _etqMsg("Erro de conexão ao gerar o ID da carga.", "erro"); });
}

function _etqAbrirImpressao(transp, ent, qtd, pacotes, dataFmt, numeroCarga) {
    // window.open é about:blank — caminhos relativos não resolvem; monta URLs absolutas
    const urlGc     = new URL(_ETQ_LOGO_GC, document.baseURI).href;
    const urlTransp = new URL(transp.logo, document.baseURI).href;

    const paginas = [];
    for (let i = 1; i <= qtd; i++) {
        paginas.push(`
            <div class="label">
                <div class="lbl-top">
                    <img class="gc" src="${urlGc}" alt="GC Transportes">
                    <img class="transp" src="${urlTransp}" alt="${transp.label}">
                </div>
                <div class="lbl-divider"></div>
                <div class="lbl-sec">ID DA CARGA</div>
                <div class="lbl-carga">${numeroCarga}</div>
                <svg class="lbl-barcode" data-code="${numeroCarga}"></svg>
                <div class="lbl-divider"></div>
                <div class="lbl-sec">ENTREGADOR</div>
                <div class="lbl-nome">${ent.nome}</div>
                <div class="lbl-meta">
                    <div><b>ID</b><span class="v">${ent.id}</span></div>
                    <div><b>DATA</b><span class="v">${dataFmt}</span></div>
                    <div><b>PACOTES</b><span class="v">${pacotes}</span></div>
                </div>
                <div class="lbl-vol">SACA ${i}/${qtd}</div>
            </div>`);
    }

    const w = window.open("", "_blank");
    if (!w) return _etqMsg("Permita pop-ups para imprimir.", "erro");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <title>Etiquetas ${numeroCarga} — ${ent.nome} — ${dataFmt}</title>
        <style>
            * { margin: 0; box-sizing: border-box }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff }
            @page { size: 100mm 150mm; margin: 0 }
            .label {
                width: 100mm; height: 149.5mm; padding: 6mm 7mm;
                display: flex; flex-direction: column; overflow: hidden;
                page-break-after: always;
            }
            .lbl-top { display: flex; justify-content: space-between; align-items: center; gap: 6mm }
            .lbl-top img.gc     { height: 11mm; object-fit: contain }
            .lbl-top img.transp { height: 10mm; max-width: 40mm; object-fit: contain }
            .lbl-divider { border-top: 0.5mm solid #000; margin: 3mm 0 }
            .lbl-sec { font-size: 8pt; letter-spacing: 2px; font-weight: bold; color: #333 }
            .lbl-carga {
                font-size: 17pt; font-weight: 800; font-family: 'Courier New', monospace;
                letter-spacing: 0.5px; margin: 1mm 0 2mm;
            }
            .lbl-barcode { width: 100%; height: 16mm }
            .lbl-nome {
                font-size: 15pt; font-weight: 800; line-height: 1.15;
                text-transform: uppercase; margin: 1mm 0 3mm; word-break: break-word;
            }
            .lbl-meta { display: flex; gap: 8mm; flex-wrap: wrap }
            .lbl-meta b { display: block; font-size: 7.5pt; letter-spacing: 1.5px; color: #444; margin-bottom: 0.5mm }
            .lbl-meta .v { font-size: 12.5pt; font-weight: bold; font-family: 'Courier New', monospace }
            .lbl-vol {
                margin-top: auto; align-self: center;
                font-size: 21pt; font-weight: 800; white-space: nowrap;
                border: 0.8mm solid #000; border-radius: 3mm; padding: 2.5mm 8mm;
            }
        </style></head><body>
        ${paginas.join("")}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <script>
            // window.onload espera as logos carregarem — sem isso sai etiqueta sem imagem
            window.onload = function () {
                try {
                    document.querySelectorAll(".lbl-barcode").forEach(function (el) {
                        JsBarcode(el, el.dataset.code, { format: "CODE128", width: 1.6, height: 44, displayValue: false, margin: 0 });
                    });
                } catch (e) {}
                window.print();
            };
        <\/script>
        </body></html>`);
    w.document.close();
}
