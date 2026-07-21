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
    if (qtd < 1 || qtd > 60) return _etqMsg("Quantidade deve ser entre 1 e 60 etiquetas.", "erro");
    const dataVal = document.getElementById("etq-data").value;
    if (!dataVal) return _etqMsg("Selecione a data.", "erro");
    const [ano, mes, dia] = dataVal.split("-");
    const dataFmt = `${dia}/${mes}/${ano}`;

    // window.open é about:blank — caminhos relativos não resolvem; monta URLs absolutas
    const urlGc     = new URL(_ETQ_LOGO_GC, document.baseURI).href;
    const urlTransp = new URL(transp.logo, document.baseURI).href;

    const etiquetas = [];
    for (let i = 1; i <= qtd; i++) {
        etiquetas.push(`
            <div class="label">
                <div class="lbl-top">
                    <img class="gc" src="${urlGc}" alt="GC Transportes">
                    <img class="transp" src="${urlTransp}" alt="${transp.label}">
                </div>
                <div class="lbl-divider"></div>
                <div class="lbl-ent-label">ENTREGADOR</div>
                <div class="lbl-nome">${ent.nome}</div>
                <div class="lbl-meta">
                    <div><b>ID ENTREGADOR</b><span class="v">${ent.id}</span></div>
                    <div><b>DATA</b><span class="v">${dataFmt}</span></div>
                    <div><b>TRANSPORTADORA</b><span class="v" style="font-family:Arial">${transp.label}</span></div>
                </div>
                <div class="lbl-bottom">
                    <svg class="lbl-barcode" data-code="${ent.id}"></svg>
                    <div class="lbl-vol">SACA ${i}/${qtd}</div>
                </div>
            </div>`);
    }

    // 2 etiquetas por folha A4
    const paginas = [];
    for (let i = 0; i < etiquetas.length; i += 2) {
        paginas.push(`<div class="page">${etiquetas.slice(i, i + 2).join("")}</div>`);
    }

    const w = window.open("", "_blank");
    if (!w) return _etqMsg("Permita pop-ups para imprimir.", "erro");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <title>Etiquetas ${transp.label} — ${ent.nome} — ${dataFmt}</title>
        <style>
            * { margin: 0; box-sizing: border-box }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff }
            @page { size: A4 portrait; margin: 0 }
            .page {
                width: 210mm; height: 296mm; padding: 8mm;
                display: flex; flex-direction: column; gap: 6mm;
                page-break-after: always;
            }
            .label {
                flex: 1; min-height: 0; overflow: hidden;
                border: 1.2mm solid #000; border-radius: 5mm;
                padding: 9mm 10mm; display: flex; flex-direction: column;
            }
            .lbl-top { display: flex; justify-content: space-between; align-items: center; gap: 10mm }
            .lbl-top img.gc     { height: 16mm; object-fit: contain }
            .lbl-top img.transp { height: 14mm; max-width: 62mm; object-fit: contain }
            .lbl-divider { border-top: 0.6mm solid #000; margin: 5mm 0 6mm }
            .lbl-ent-label { font-size: 10pt; letter-spacing: 2.5px; font-weight: bold; color: #333 }
            .lbl-nome {
                font-size: 27pt; font-weight: 800; line-height: 1.12;
                text-transform: uppercase; margin: 2mm 0 6mm; word-break: break-word;
            }
            .lbl-meta { display: flex; gap: 13mm; flex-wrap: wrap }
            .lbl-meta b { display: block; font-size: 8.5pt; letter-spacing: 1.5px; color: #444; margin-bottom: 1mm }
            .lbl-meta .v { font-size: 15pt; font-weight: bold; font-family: 'Courier New', monospace }
            .lbl-bottom { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm }
            .lbl-vol {
                font-size: 20pt; font-weight: 800; white-space: nowrap;
                border: 0.8mm solid #000; border-radius: 3mm; padding: 2.5mm 5mm;
            }
        </style></head><body>
        ${paginas.join("")}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <script>
            // window.onload espera as logos carregarem — sem isso sai etiqueta sem imagem
            window.onload = function () {
                try {
                    document.querySelectorAll(".lbl-barcode").forEach(function (el) {
                        JsBarcode(el, el.dataset.code, { format: "CODE128", width: 2, height: 42, fontSize: 12, margin: 0 });
                    });
                } catch (e) {}
                window.print();
            };
        <\/script>
        </body></html>`);
    w.document.close();
}
