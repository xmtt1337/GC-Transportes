// ───── FISCAL: valores do frete pela planilha da Shopee ─────
//
// A Shopee só informa quanto vai pagar depois da entrega. Como o valor é
// obrigatório no CT-e, o rascunho fica esperando — e esta tela preenche todos
// de uma vez quando a planilha de repasse chega.
//
// A planilha é lida no navegador (SheetJS), como o resto do sistema faz. Para
// o servidor vão só as linhas, nunca o arquivo.

let _valPlanilha = null;   // { nome, linhas }
let _valRelatorio = null;

async function abrirFiscalValores(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-valores");
    _valPlanilha = null;
    _valRelatorio = null;
    document.getElementById("fiscal-valores-conteudo").innerHTML = _htmlValores();
}

function _htmlValores() {
    return `
    <div class="cabecalho-tela">
        <h2>Valores do frete (planilha da Shopee)</h2>
        <button onclick="abrirCTes()">← Lista</button>
    </div>

    <div class="aviso-info">
        <strong>Para os CT-e que estão esperando o valor.</strong>
        <p>A planilha é casada pela coluna
           <b>3PL Tracking Number / Número Etiqueta / Ordem (Shopee)</b>, e o valor
           vem de <b>Valor Final à Receber</b>.</p>
        <p>Só entra em rascunho já importado da Shopee. Código sem rascunho aparece
           no relatório — <b>a planilha não cria CT-e</b>. Documento já autorizado
           não é tocado.</p>
    </div>

    <div class="secao-form">
        <h3>1. Escolher a planilha</h3>
        <input type="file" id="val-arquivo" accept=".xlsx,.xls,.csv"
               onchange="_valLerArquivo(this)">
        <div id="val-info-arquivo"></div>
    </div>

    <div id="val-etapas"></div>
    <div id="val-resultado"></div>`;
}

/** Lê a planilha no navegador. O arquivo não sai daqui. */
function _valLerArquivo(input) {
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    const info = document.getElementById("val-info-arquivo");
    info.innerHTML = "<p class='carregando'>Lendo a planilha…</p>";

    const leitor = new FileReader();
    leitor.onload = (e) => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
            _valPlanilha = { nome: arquivo.name, linhas };
            info.innerHTML = `<div class="aviso-sucesso">
                <strong>${_esc(arquivo.name)}</strong>
                <p>${linhas.length - 1} linha(s) além do cabeçalho.</p></div>`;
            _valMostrarEtapas();
        } catch (err) {
            info.innerHTML = `<div class="aviso-bloqueio">
                <strong>Não consegui ler a planilha.</strong><p>${_esc(err.message)}</p></div>`;
        }
    };
    leitor.onerror = () => {
        info.innerHTML = `<div class="aviso-bloqueio">Falha ao abrir o arquivo.</div>`;
    };
    leitor.readAsArrayBuffer(arquivo);
}

function _valMostrarEtapas() {
    const cabecalho = (_valPlanilha.linhas[0] || []).map((c, i) => ({ i, nome: String(c || `(coluna ${i + 1})`) }));
    document.getElementById("val-etapas").innerHTML = `
    <div class="secao-form">
        <h3>2. Conferir antes de aplicar</h3>
        <p class="dica">
            As colunas são reconhecidas pelo nome. Se a planilha vier diferente,
            escolha à mão abaixo.
        </p>
        <div class="linha-form">
            <label>Coluna do código
                <select id="val-col-codigo">
                    <option value="">Reconhecer pelo nome</option>
                    ${cabecalho.map((c) => `<option value="${c.i}">${_esc(c.nome)}</option>`).join("")}
                </select></label>
            <label>Coluna do valor
                <select id="val-col-valor">
                    <option value="">Reconhecer pelo nome</option>
                    ${cabecalho.map((c) => `<option value="${c.i}">${_esc(c.nome)}</option>`).join("")}
                </select></label>
            <label class="check">
                <input type="checkbox" id="val-sobrescrever"> Trocar valores já preenchidos
            </label>
        </div>
        <div class="acoes-rodape">
            <button class="btn-primario" onclick="_valEnviar(true)">Conferir (não grava)</button>
        </div>
    </div>`;
}

async function _valEnviar(simular) {
    if (!_valPlanilha) return;
    const alvo = document.getElementById("val-resultado");
    alvo.innerHTML = `<p class='carregando'>${simular ? "Conferindo" : "Aplicando"}…</p>`;

    const col = (id) => {
        const v = document.getElementById(id);
        return v && v.value !== "" ? Number(v.value) : null;
    };
    try {
        const r = await _cteApi("/fiscal/cte/valores-planilha", {
            method: "POST",
            body: JSON.stringify({
                linhas: _valPlanilha.linhas,
                coluna_codigo: col("val-col-codigo"),
                coluna_valor: col("val-col-valor"),
                sobrescrever: document.getElementById("val-sobrescrever").checked,
                simular,
            }),
        });
        _valRelatorio = r;
        alvo.innerHTML = _htmlRelatorioValores(r);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível processar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlRelatorioValores(r) {
    const bloco = (titulo, itens, extra = () => "") => !itens.length ? "" : `
        <details class="secao-form">
            <summary><b>${_esc(titulo)}</b> — ${itens.length}</summary>
            <table class="tabela">
                <thead><tr><th>Código</th><th>Valor</th><th></th></tr></thead>
                <tbody>${itens.slice(0, 200).map((i) => `<tr>
                    <td class="mono-pequeno">${_esc(i.codigo)}</td>
                    <td>${_fmtBRL(i.valor)}</td>
                    <td>${extra(i)}</td>
                </tr>`).join("")}</tbody>
            </table>
            ${itens.length > 200 ? `<p class="dica">Mostrando 200 de ${itens.length}.</p>` : ""}
        </details>`;

    return `
    <div class="${r.simulado ? "aviso-info" : "aviso-sucesso"}">
        <strong>${r.simulado ? "Conferência — nada foi gravado ainda." : "Valores aplicados."}</strong>
        <p>
            ${r.atualizados.length} ${r.simulado ? "seriam preenchidos" : "preenchidos"} ·
            total ${_fmtBRL(r.soma)}<br>
            ${r.ja_tinham.length} já tinham valor ·
            ${r.nao_encontrados.length} sem rascunho ·
            ${r.nao_editaveis.length} já emitidos ·
            ${r.ignoradas} linha(s) ignorada(s)
        </p>
        <p class="dica">Colunas usadas: <b>${_esc(r.colunas.nomes.codigo)}</b> e
           <b>${_esc(r.colunas.nomes.valor)}</b>.</p>
    </div>

    ${bloco(r.simulado ? "Serão preenchidos" : "Preenchidos", r.atualizados,
            (i) => i.valor_anterior != null ? `antes: ${_fmtBRL(i.valor_anterior)}` : "")}
    ${bloco("Já tinham valor (não alterados)", r.ja_tinham,
            (i) => `atual: ${_fmtBRL(i.valor_atual)}`)}
    ${bloco("Sem rascunho importado", r.nao_encontrados,
            () => "importe o pedido antes")}
    ${bloco("Já emitidos (intocados)", r.nao_editaveis, (i) => _esc(i.status))}

    ${r.simulado && r.atualizados.length ? `
    <div class="acoes-rodape">
        <button class="btn-primario" onclick="_valEnviar(false)">
            Aplicar ${r.atualizados.length} valor(es) →
        </button>
    </div>` : ""}
    ${!r.simulado ? `
    <div class="acoes-rodape">
        <button onclick="abrirCTes()">Ver os CT-e →</button>
    </div>` : ""}`;
}
