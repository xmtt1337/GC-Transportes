// ───── FISCAL: Consulta de NFs (código BR → chave da NF-e) ─────
//
// Cola uma lista de códigos BR e mostra na tela a chave da NF-e vinculada a
// cada um, com opção de copiar a chave ou exportar CSV. Olha primeiro no CT-e
// já importado (sem gastar cota da API da Shopee); se não achar, busca de novo
// na API.
//
// NÃO traz o item/produto da nota: a autorização da SEFAZ (NFeDistribuicaoDFe)
// trava quase toda consulta pra quem não é parte na NF-e — amostra real
// (02/11): 0 de 11 autorizadas. Ver modules/fiscal/sefaz/distribuicao-dfe.js.

const _CNFS_LIMITE = 300; // o servidor recusa acima disso (modules/fiscal/shopee/consulta-nfs.js)
let _cnfsResultados = [];

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

    <div class="cnfs">
        <label class="cft-rotulo" for="cnfs-codigos">Códigos BR</label>
        <textarea id="cnfs-codigos" class="cft-input cnfs-codigos" rows="9" spellcheck="false"
                  oninput="_cnfsContar()"
                  placeholder="BR000000000000A&#10;BR000000000000B&#10;BR000000000000C"></textarea>
        <div class="cnfs-barra">
            <span id="cnfs-contagem" class="cft-ajuda">Até ${_CNFS_LIMITE} códigos por vez</span>
            <button id="cnfs-btn" class="cft-btn primario" onclick="_cnfsGerar()">Consultar</button>
        </div>

        <div id="cnfs-erro"></div>
        <div id="cnfs-resultado"></div>
    </div>`;
}

function _cnfsLerCodigos(texto) {
    return [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}

function _cnfsContar() {
    const qtd = _cnfsLerCodigos(document.getElementById("cnfs-codigos").value).length;
    const el = document.getElementById("cnfs-contagem");
    el.textContent = qtd ? `${qtd} de ${_CNFS_LIMITE}` : `Até ${_CNFS_LIMITE} códigos por vez`;
    el.classList.toggle("cft-neg", qtd > _CNFS_LIMITE);
}

function _cnfsHtmlResultado(resultados) {
    const comNf = resultados.filter((r) => r.nfs.length).length;
    const semNf = resultados.length - comNf;
    const linhaNf = (n) => `
        <div class="cnfs-nf-linha">
            <span>${_esc(n)}</span>
            <button type="button" class="cnfs-copiar" data-nf="${_esc(n)}" onclick="_cnfsCopiar(this)">Copiar</button>
        </div>`;
    const linhas = resultados.map((r) => `
        <tr>
            <td class="cnfs-mono">${_esc(r.codigo)}</td>
            ${r.nfs.length
                ? `<td class="cnfs-mono">${r.nfs.map(linhaNf).join("")}</td>`
                : `<td class="cft-neg">${_esc(r.erro || "Nenhuma NF-e encontrada.")}</td>`}
        </tr>`).join("");
    return `
    <div class="cft-kpis cnfs-kpis">
        <div class="cft-kpi"><span class="cft-kpi-valor">${resultados.length}</span><span class="cft-kpi-rotulo">Códigos</span></div>
        <div class="cft-kpi"><span class="cft-kpi-valor cft-pos">${comNf}</span><span class="cft-kpi-rotulo">Com NF-e</span></div>
        <div class="cft-kpi"><span class="cft-kpi-valor${semNf ? " cft-neg" : ""}">${semNf}</span><span class="cft-kpi-rotulo">Sem NF-e</span></div>
        <button class="cft-btn cnfs-baixar" onclick="_cnfsBaixar()">Exportar CSV</button>
    </div>
    <div class="cft-tabela-wrap">
        <table class="cft-tabela cnfs-tabela">
            <thead><tr><th>Código BR</th><th>Chave da NF-e</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>
    </div>`;
}

async function _cnfsGerar() {
    const area = document.getElementById("cnfs-codigos");
    const erroEl = document.getElementById("cnfs-erro");
    const resultEl = document.getElementById("cnfs-resultado");
    const btn = document.getElementById("cnfs-btn");
    erroEl.innerHTML = "";
    resultEl.innerHTML = "";

    const codigos = _cnfsLerCodigos(area.value);
    if (!codigos.length) { erroEl.innerHTML = `<p class="aviso-bloqueio">Cole ao menos um código BR.</p>`; return; }

    btn.disabled = true;
    btn.textContent = "Consultando…";
    let dados;
    try {
        dados = await _cteApi("/fiscal/consulta-nfs", { method: "POST", body: JSON.stringify({ codigos }) });
    } catch (e) {
        erroEl.innerHTML = `<p class="aviso-bloqueio">Não consegui consultar: ${_esc(e.message)}</p>`;
        btn.disabled = false;
        btn.textContent = "Consultar";
        return;
    }
    btn.disabled = false;
    btn.textContent = "Consultar";

    _cnfsResultados = dados.resultados || [];
    resultEl.innerHTML = _cnfsHtmlResultado(_cnfsResultados);
}

// Copia o texto e mostra no próprio botão se deu certo — mesmo padrão de
// entregador-conferencia.js. gcCopiar() (nav.js) já cobre o fallback sem
// navigator.clipboard (HTTP).
function _cnfsCopiar(btn) {
    const rotulo = btn.innerText;
    gcCopiar(btn.dataset.nf).then(() => {
        btn.innerText = "Copiado!";
        btn.classList.add("copiado");
        setTimeout(() => { btn.innerText = rotulo; btn.classList.remove("copiado"); }, 1800);
    }).catch(() => {
        btn.innerText = "Não consegui copiar";
        setTimeout(() => { btn.innerText = rotulo; }, 2200);
    });
}

function _cnfsMontarCsv(resultados) {
    const campo = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
    // A chave da NF-e tem 44 dígitos — puro número, o Excel vira notação
    // científica (3,52E+43) e perde o valor de verdade. O truque =" " força
    // o Excel a tratar como texto, igual já seria preciso pra CNPJ/CPF/chave
    // em qualquer CSV deste sistema.
    const campoTexto = (c) => `="${String(c ?? "").replace(/"/g, '""')}"`;
    const linhaCsv = (campos) => campos.join(";");
    return [
        linhaCsv([campo("Código BR"), campo("NFs"), campo("Erro")]),
        ...resultados.map((r) => linhaCsv([campo(r.codigo), campoTexto(r.nfs.join("; ")), campo(r.erro || "")])),
    ].join("\r\n");
}

function _cnfsBaixar() {
    const csv = _cnfsMontarCsv(_cnfsResultados);
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
