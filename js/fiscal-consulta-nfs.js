// ───── FISCAL: Consulta de NFs (código BR → chave da NF-e) ─────
//
// Cola uma lista de códigos BR e gera um CSV com a chave da NF-e vinculada a
// cada um. Olha primeiro no CT-e já importado (sem gastar cota da API da
// Shopee); se não achar, busca de novo na API.
//
// NÃO traz o item/produto da nota: a autorização da SEFAZ (NFeDistribuicaoDFe)
// trava quase toda consulta pra quem não é parte na NF-e — amostra real
// (02/11): 0 de 11 autorizadas. Ver modules/fiscal/sefaz/distribuicao-dfe.js.

async function abrirConsultaNfs(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-consulta-nfs");
    document.getElementById("fiscal-consulta-nfs-conteudo").innerHTML = _htmlConsultaNfs();
}

function _htmlConsultaNfs() {
    return `
    <div class="cabecalho-tela">
        <h2>Consulta de NFs</h2>
    </div>

    <div class="aviso-info">
        <strong>Código BR (rastreio do pedido) → chave da NF-e vinculada.</strong>
        <p>Olha primeiro no CT-e já importado; se não achar, busca de novo na API da Shopee.</p>
        <p>Não traz os itens/produto da nota — a SEFAZ só libera o conteúdo completo pra
           quem é parte na NF-e (emitente, destinatário, ou quem estiver no <code>autXML</code>),
           e isso quase nunca é a GC. Fica só na chave.</p>
    </div>

    <div class="secao-form">
        <h3>Códigos BR</h3>
        <label class="largo">Um por linha (ou separados por espaço, vírgula ou ponto e vírgula)
            <textarea id="cnfs-codigos" rows="10"
                      placeholder="BR263633071963K&#10;BR2611517717666&#10;BR261357501853P"></textarea>
        </label>
        <button id="cnfs-btn" onclick="_cnfsGerar()">Gerar CSV</button>
        <p class="dica">Até 300 códigos por vez.</p>
    </div>

    <div id="cnfs-erro"></div>
    <div id="cnfs-resultado"></div>`;
}

async function _cnfsGerar() {
    const area = document.getElementById("cnfs-codigos");
    const erroEl = document.getElementById("cnfs-erro");
    const resultEl = document.getElementById("cnfs-resultado");
    const btn = document.getElementById("cnfs-btn");
    erroEl.innerHTML = "";
    resultEl.innerHTML = "";

    const codigos = [...new Set(area.value.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
    if (!codigos.length) { erroEl.innerHTML = `<p class="erro">Cole ao menos um código BR.</p>`; return; }

    btn.disabled = true;
    btn.textContent = "Consultando…";
    let dados;
    try {
        dados = await _cteApi("/fiscal/consulta-nfs", { method: "POST", body: JSON.stringify({ codigos }) });
    } catch (e) {
        erroEl.innerHTML = `<p class="erro">Não consegui consultar: ${_esc(e.message)}</p>`;
        btn.disabled = false;
        btn.textContent = "Gerar CSV";
        return;
    }
    btn.disabled = false;
    btn.textContent = "Gerar CSV";

    const resultados = dados.resultados || [];
    const comNf = resultados.filter((r) => r.nfs.length).length;
    resultEl.innerHTML = `<p>${comNf} de ${resultados.length} código(s) com NF-e encontrada — baixando o CSV…</p>`;

    const nomeOrigem = (o) => (o === "cte_importado" ? "CT-e já importado"
        : o === "api_shopee" ? "API da Shopee" : "");
    const linhaCsv = (campos) => campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
    const csv = [
        linhaCsv(["Código BR", "NFs", "Origem", "Erro"]),
        ...resultados.map((r) => linhaCsv([r.codigo, r.nfs.join("; "), nomeOrigem(r.origem), r.erro || ""])),
    ].join("\r\n");

    const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consulta-nfs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
