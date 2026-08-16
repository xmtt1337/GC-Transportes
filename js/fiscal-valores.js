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
        <p>Códigos que ainda não têm rascunho são buscados na Shopee e criados na
           hora — <b>como rascunho</b>, que ainda passa por validação e emissão.
           Documento já emitido não é tocado, e reenviar a mesma planilha não
           duplica nada.</p>
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
            <button onclick="_valEnviar(true)">Conferir (não grava)</button>
            <button class="btn-primario" onclick="_valImportarLote()">
                Importar e preencher tudo →
            </button>
        </div>
        <p class="dica">
            <b>Conferir</b> só olha os rascunhos que já existem.
            <b>Importar e preencher tudo</b> busca na Shopee os códigos que ainda
            não têm rascunho, cria cada um e já põe o valor. Cria rascunho —
            nada é enviado à SEFAZ.
        </p>
    </div>`;
}

async function _valEnviar(simular) {
    if (!_valPlanilha) return;
    const alvo = document.getElementById("val-resultado");
    alvo.innerHTML = `<p class='carregando'>${simular ? "Conferindo" : "Aplicando"}…</p>`;

    try {
        const r = await _cteApi("/fiscal/cte/valores-planilha", {
            method: "POST",
            body: JSON.stringify({
                linhas: _valPlanilha.linhas,
                coluna_codigo: _valCol("val-col-codigo"),
                coluna_valor: _valCol("val-col-valor"),
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

// ── importação em lote: a planilha inteira, em pedaços de 25 códigos
//
// Cada código é uma chamada à API da Shopee. Mandar mil de uma vez estouraria
// o tempo limite do request e não daria como mostrar progresso — então a tela
// fatia, acumula o resultado e deixa parar no meio.
const _VAL_TAMANHO_LOTE = 25;
let _valCancelar = false;

async function _valImportarLote() {
    if (!_valPlanilha) return;
    const alvo = document.getElementById("val-resultado");

    // Reaproveita a leitura do backend para achar as colunas e normalizar valores.
    let itens;
    try {
        const previa = await _cteApi("/fiscal/cte/valores-planilha", {
            method: "POST",
            body: JSON.stringify({
                linhas: _valPlanilha.linhas,
                coluna_codigo: _valCol("val-col-codigo"),
                coluna_valor: _valCol("val-col-valor"),
                simular: true,
            }),
        });
        itens = [...previa.atualizados, ...previa.ja_tinham,
                 ...previa.nao_encontrados, ...previa.nao_editaveis]
            .map((i) => ({ codigo: i.codigo, valor: i.valor }));
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não consegui ler a planilha.</strong><p>${_esc(e.message)}</p></div>`;
        return;
    }

    if (!itens.length) {
        alvo.innerHTML = `<div class="aviso-bloqueio">Nenhuma linha utilizável.</div>`;
        return;
    }

    _valCancelar = false;
    const sobrescrever = document.getElementById("val-sobrescrever").checked;
    const total = itens.length;
    const acumulado = { criado: 0, valor_atualizado: 0, ja_existia: 0,
                        nao_editavel: 0, nao_encontrado: 0, erro: 0, invalido: 0, soma: 0 };
    const problemas = [];
    let feitos = 0;

    const pintar = () => {
        const pct = Math.round((feitos / total) * 100);
        alvo.innerHTML = `
        <div class="aviso-info">
            <strong>${feitos === total ? "Concluído" : "Processando…"} ${feitos} de ${total} (${pct}%)</strong>
            <div style="background:#1e2a3d;border-radius:6px;height:10px;margin:10px 0;overflow:hidden">
                <div style="background:#3b82f6;height:100%;width:${pct}%;transition:width .2s"></div>
            </div>
            <p>
                ${acumulado.criado} rascunho(s) criado(s) ·
                ${acumulado.valor_atualizado} valor(es) atualizado(s) ·
                total ${_fmtBRL(acumulado.soma)}<br>
                ${acumulado.ja_existia} já estavam prontos ·
                ${acumulado.nao_encontrado} não achados na Shopee ·
                ${acumulado.nao_editavel} já emitidos ·
                ${acumulado.erro + acumulado.invalido} com erro
            </p>
            ${feitos < total ? `<button onclick="_valCancelar=true">Parar</button>` : ""}
        </div>
        ${problemas.length ? `
        <details class="secao-form" ${feitos === total ? "open" : ""}>
            <summary><b>Códigos com problema</b> — ${problemas.length}</summary>
            <table class="tabela">
                <thead><tr><th>Código</th><th>Situação</th><th>Detalhe</th></tr></thead>
                <tbody>${problemas.slice(0, 200).map((p) => `<tr>
                    <td class="mono-pequeno">${_esc(p.codigo)}</td>
                    <td>${_esc(p.situacao)}</td>
                    <td>${_esc(p.detalhe || "")}</td>
                </tr>`).join("")}</tbody>
            </table>
            ${problemas.length > 200 ? `<p class="dica">Mostrando 200 de ${problemas.length}.</p>` : ""}
        </details>` : ""}
        ${feitos === total ? `
        <div class="acoes-rodape"><button onclick="abrirCTes()">Ver os CT-e →</button></div>` : ""}`;
    };

    pintar();

    for (let i = 0; i < itens.length; i += _VAL_TAMANHO_LOTE) {
        if (_valCancelar) break;
        const pedaco = itens.slice(i, i + _VAL_TAMANHO_LOTE);
        try {
            const r = await _cteApi("/fiscal/cte/importar-lote", {
                method: "POST",
                body: JSON.stringify({ itens: pedaco, sobrescrever }),
            });
            for (const [k, v] of Object.entries(r.resumo)) {
                if (acumulado[k] !== undefined) acumulado[k] += v;
            }
            for (const res of r.resultados) {
                if (["nao_encontrado", "erro", "invalido", "nao_editavel"].includes(res.situacao)) {
                    problemas.push(res);
                }
            }
        } catch (e) {
            // Um pedaço que falha não interrompe o resto.
            pedaco.forEach((it) => problemas.push({
                codigo: it.codigo, situacao: "erro", detalhe: e.message }));
            acumulado.erro += pedaco.length;
        }
        feitos += pedaco.length;
        pintar();
    }
}

function _valCol(id) {
    const el = document.getElementById(id);
    return el && el.value !== "" ? Number(el.value) : null;
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
