// ───── FISCAL: CT-e (listagem + formulário) ─────
//
// A tela só coleta e exibe. Nenhuma regra fiscal roda aqui: CFOP, CST,
// alíquotas, chave de acesso, numeração e XML são responsabilidade do backend.
// Se a validação viesse duplicada no JavaScript, uma hora as duas divergiriam e
// a tela aprovaria um CT-e que a SEFAZ recusa.

const _CTE_ESTADOS = {
    RASCUNHO:            { rotulo: "Rascunho",        cor: "#8fa8c8" },
    VALIDANDO:           { rotulo: "Validando",       cor: "#e8a33d" },
    PRONTO_PARA_EMISSAO: { rotulo: "Pronto",          cor: "#2ecc71" },
    ERRO_VALIDACAO:      { rotulo: "Com pendências",  cor: "#e74c3c" },
    ASSINANDO:           { rotulo: "Assinando",       cor: "#e8a33d" },
    TRANSMITINDO:        { rotulo: "Transmitindo",    cor: "#e8a33d" },
    AUTORIZADO:          { rotulo: "Autorizado",      cor: "#2ecc71" },
    REJEITADO:           { rotulo: "Rejeitado",       cor: "#e74c3c" },
    DENEGADO:            { rotulo: "Denegado",        cor: "#e74c3c" },
    CANCELADO:           { rotulo: "Cancelado",       cor: "#7a8aa0" },
    ERRO_COMUNICACAO:    { rotulo: "Erro de conexão", cor: "#e74c3c" },
};

// Listas do leiaute do CT-e. São códigos fixos do layout (não são regra
// tributária): tipo de CT-e, tipo de serviço e quem é o tomador.
const _CTE_TIPOS = [
    { v: "0", t: "0 — Normal" },
    { v: "1", t: "1 — Complemento de valores" },
    { v: "2", t: "2 — Anulação" },
    { v: "3", t: "3 — Substituto" },
];
const _CTE_SERVICOS = [
    { v: "0", t: "0 — Normal" },
    { v: "1", t: "1 — Subcontratação" },
    { v: "2", t: "2 — Redespacho" },
    { v: "3", t: "3 — Redespacho intermediário" },
    { v: "4", t: "4 — Serviço vinculado a multimodal" },
];
const _CTE_TOMADORES = [
    { v: "0", t: "0 — Remetente" },
    { v: "1", t: "1 — Expedidor" },
    { v: "2", t: "2 — Recebedor" },
    { v: "3", t: "3 — Destinatário" },
    { v: "4", t: "4 — Outros" },
];

let _cteContexto = null;
let _cteAtual = { id: null, dados: {} };
let _cteSecao = 0;

const _CTE_SECOES = [
    "Identificação", "Remetente", "Expedidor", "Recebedor", "Destinatário",
    "Tomador", "Carga", "Valores", "Tributação", "Documentos",
    "Observações", "Conferência",
];

// ─────────────────────────────────────────── helpers de tela
const _fmtBRL = (v) => (v === null || v === undefined || v === "")
    ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const _fmtData = (d) => d ? new Date(d).toLocaleString("pt-BR") : "—";
const _esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function _badgeStatus(st) {
    const e = _CTE_ESTADOS[st] || { rotulo: st, cor: "#7a8aa0" };
    return `<span class="badge-status" style="background:${e.cor}">${e.rotulo}</span>`;
}

async function _cteApi(caminho, opcoes = {}) {
    const r = await fetch(API + caminho, {
        ...opcoes,
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            ...(opcoes.headers || {}),
        },
    });
    const texto = await r.text();
    let corpo;
    try { corpo = texto ? JSON.parse(texto) : {}; } catch { corpo = { raw: texto }; }
    if (!r.ok) throw new Error(corpo.error || `Erro ${r.status}`);
    return corpo;
}

// ══════════════════════════════════════════════ LISTAGEM
async function abrirCTes(event) {
    if (event) event.preventDefault();
    const area = document.getElementById("conteudo");
    area.innerHTML = "<p>Carregando CT-es…</p>";
    try {
        _cteContexto = await _cteApi("/fiscal/cte/contexto");
        area.innerHTML = _htmlListagem();
        await _carregarListaCTe();
    } catch (e) {
        area.innerHTML = _htmlSemAcesso(e.message);
    }
}

/**
 * O menu fica visível para dev/finance, mas emitir exige vínculo com uma
 * empresa fiscal (fiscal_empresa_usuarios). Sem isso o backend recusa — e é
 * assim que tem que ser. O que a tela pode fazer é explicar o próximo passo em
 * vez de mostrar um 403 seco.
 */
function _htmlSemAcesso(mensagem) {
    const semVinculo = /não está vinculado|não encontrada/i.test(mensagem || "");
    if (!semVinculo) {
        return `<div class="aviso-bloqueio"><strong>Não foi possível abrir.</strong><p>${_esc(mensagem)}</p></div>`;
    }
    return `
    <h2>CT-e</h2>
    <div class="aviso-bloqueio">
        <strong>O módulo fiscal ainda não está configurado para o seu usuário.</strong>
        <p>${_esc(mensagem)}</p>
    </div>
    <div class="aviso-info">
        <p>Para emitir CT-e, faltam estes passos — nesta ordem:</p>
        <ol>
            <li><b>Cadastrar a empresa fiscal</b> (CNPJ, inscrição estadual, endereço
                com código IBGE do município e UF).</li>
            <li><b>Vincular o usuário à empresa</b>, marcando o que ele pode fazer:
                emitir, cancelar e configurar.</li>
            <li><b>Enviar o certificado digital A1</b> (.pfx e senha) da empresa.</li>
            <li><b>Configurar a tributação IBS/CBS</b> com os valores do contador
                (CST, cClassTrib e alíquotas).</li>
        </ol>
        <p class="dica">
            Esses dados são cadastrais e fiscais reais — o sistema não os preenche
            sozinho de propósito. Enquanto faltarem, a emissão fica bloqueada em vez
            de gerar um CT-e incorreto.
        </p>
    </div>`;
}

function _htmlListagem() {
    const hoje = new Date().toISOString().slice(0, 10);
    const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return `
    <div class="cabecalho-tela">
        <h2>CT-e</h2>
        <button class="btn-primario" onclick="abrirNovoCTe()">+ Novo CT-e</button>
    </div>
    <div class="aviso-info">
        Ambiente: <b>${_esc(_cteContexto.empresa.ambiente)}</b> ·
        Empresa: <b>${_esc(_cteContexto.empresa.razao_social)}</b> ·
        Leiaute ${_esc(_cteContexto.versao_leiaute)}
        <br>A transmissão para a SEFAZ ainda não está habilitada — nesta etapa o
        CT-e é validado e fica pronto para emissão.
    </div>

    <div class="filtros-cte">
        <label>De <input type="date" id="f-de" value="${trintaDias}"></label>
        <label>Até <input type="date" id="f-ate" value="${hoje}"></label>
        <label>Status
            <select id="f-status">
                <option value="">Todos</option>
                ${Object.entries(_CTE_ESTADOS).map(([k, v]) =>
                    `<option value="${k}">${v.rotulo}</option>`).join("")}
            </select>
        </label>
        <label>Número <input type="number" id="f-numero" style="width:100px"></label>
        <label>Série <input type="number" id="f-serie" style="width:80px"></label>
        <label>Busca <input id="f-busca" placeholder="chave, tomador, destinatário"></label>
        <button onclick="_carregarListaCTe()">Filtrar</button>
    </div>

    <div id="lista-cte"><p>Carregando…</p></div>`;
}

async function _carregarListaCTe() {
    const alvo = document.getElementById("lista-cte");
    alvo.innerHTML = "<p>Carregando…</p>";
    const p = new URLSearchParams();
    for (const [id, chave] of [["f-de", "de"], ["f-ate", "ate"], ["f-status", "status"],
                               ["f-numero", "numero"], ["f-serie", "serie"], ["f-busca", "busca"]]) {
        const el = document.getElementById(id);
        if (el && el.value) p.set(chave, el.value);
    }
    try {
        const lista = await _cteApi("/fiscal/cte?" + p.toString());
        if (!lista.length) {
            alvo.innerHTML = `<p class="vazio">Nenhum CT-e encontrado. Clique em "Novo CT-e" para começar.</p>`;
            return;
        }
        alvo.innerHTML = `
        <table class="tabela">
            <thead><tr>
                <th>Nº</th><th>Série</th><th>Status</th><th>Tomador / Destinatário</th>
                <th>Origem → Destino</th><th>Valor</th><th>Criado</th><th>Chave</th><th>Ações</th>
            </tr></thead>
            <tbody>${lista.map(_linhaCTe).join("")}</tbody>
        </table>`;
    } catch (e) {
        alvo.innerHTML = `<p class="erro">${_esc(e.message)}</p>`;
    }
}

function _linhaCTe(c) {
    const editavel = ["RASCUNHO", "ERRO_VALIDACAO", "PRONTO_PARA_EMISSAO"].includes(c.status);
    const nome = c.tomador_nome || c.destinatario_nome || c.remetente_nome || "—";
    const rota = [c.municipio_inicio, c.municipio_fim].filter(Boolean).join(" → ") || "—";
    return `<tr>
        <td>${c.numero ?? "—"}</td>
        <td>${c.serie ?? "—"}</td>
        <td>${_badgeStatus(c.status)}</td>
        <td>${_esc(nome)}</td>
        <td>${_esc(rota)}</td>
        <td>${_fmtBRL(c.valor_total)}</td>
        <td>${_fmtData(c.criado_em)}</td>
        <td class="mono-pequeno">${c.chave_acesso ? _esc(c.chave_acesso) : "—"}</td>
        <td>
            ${editavel
                ? `<button onclick="abrirNovoCTe(${c.id})">Editar</button>`
                : `<button onclick="verCTe(${c.id})">Visualizar</button>`}
        </td>
    </tr>`;
}

async function verCTe(id) {
    const area = document.getElementById("conteudo");
    area.innerHTML = "<p>Carregando…</p>";
    try {
        const c = await _cteApi(`/fiscal/cte/${id}`);
        area.innerHTML = `
        <div class="cabecalho-tela">
            <h2>CT-e ${c.numero ?? "(sem número)"} — série ${c.serie ?? "—"}</h2>
            <button onclick="abrirCTes()">← Voltar</button>
        </div>
        <p>${_badgeStatus(c.status)} ${c.chave_acesso ? `<span class="mono-pequeno">${_esc(c.chave_acesso)}</span>` : ""}</p>
        ${c.motivo_rejeicao ? `<div class="aviso-bloqueio"><strong>Pendências:</strong><p>${_esc(c.motivo_rejeicao)}</p></div>` : ""}
        ${_htmlConferencia(c.dados || {}, c)}
        ${c.xml ? "" : `<p class="dica">O XML aparece aqui depois da validação.</p>`}
        <div class="acoes-rodape">
            ${c.status === "PRONTO_PARA_EMISSAO"
                ? `<button onclick="baixarXmlCTe(${c.id})">Ver XML gerado</button>` : ""}
        </div>`;
    } catch (e) {
        area.innerHTML = `<p class="erro">${_esc(e.message)}</p>`;
    }
}

async function baixarXmlCTe(id) {
    const r = await fetch(`${API}/fiscal/cte/${id}/xml`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) { alert("XML indisponível. Valide o CT-e primeiro."); return; }
    const xml = await r.text();
    const janela = window.open("", "_blank");
    janela.document.write(`<pre>${_esc(xml)}</pre>`);
}

// ══════════════════════════════════════════════ FORMULÁRIO
async function abrirNovoCTe(id = null) {
    const area = document.getElementById("conteudo");
    area.innerHTML = "<p>Carregando…</p>";
    try {
        if (!_cteContexto) _cteContexto = await _cteApi("/fiscal/cte/contexto");
        if (id) {
            const c = await _cteApi(`/fiscal/cte/${id}`);
            _cteAtual = { id: c.id, dados: c.dados || {}, status: c.status };
            if (c.documentos && c.documentos.length && !(_cteAtual.dados.documentos || []).length) {
                _cteAtual.dados.documentos = c.documentos.map((d) => ({
                    chave: d.chave_nfe, numero: d.numero, serie: d.serie,
                    valor: d.valor, tipo: d.tipo_documento,
                }));
            }
        } else {
            _cteAtual = { id: null, dados: { documentos: [] }, status: "RASCUNHO" };
        }
        _cteSecao = 0;
        _renderFormulario();
    } catch (e) {
        area.innerHTML = `<p class="erro">${_esc(e.message)}</p>`;
    }
}

function _renderFormulario() {
    const area = document.getElementById("conteudo");
    area.innerHTML = `
    <div class="cabecalho-tela">
        <h2>${_cteAtual.id ? `Editar CT-e #${_cteAtual.id}` : "Novo CT-e"}</h2>
        <div>
            <button onclick="salvarRascunhoCTe()">Salvar rascunho</button>
            <button onclick="abrirCTes()">← Lista</button>
        </div>
    </div>

    <div class="passos-cte">
        ${_CTE_SECOES.map((s, i) =>
            `<button class="passo ${i === _cteSecao ? "ativo" : ""}"
                     onclick="irParaSecaoCTe(${i})">${i + 1}. ${s}</button>`).join("")}
    </div>

    <div id="secao-atual">${_htmlSecao(_cteSecao)}</div>

    <div class="acoes-rodape">
        <button onclick="irParaSecaoCTe(${Math.max(0, _cteSecao - 1)})"
                ${_cteSecao === 0 ? "disabled" : ""}>← Anterior</button>
        ${_cteSecao < _CTE_SECOES.length - 1
            ? `<button class="btn-primario" onclick="irParaSecaoCTe(${_cteSecao + 1})">Próximo →</button>`
            : `<button class="btn-primario" onclick="validarCTe()">Validar e preparar para emissão</button>`}
    </div>
    <div id="resultado-validacao"></div>`;
}

function irParaSecaoCTe(i) {
    _coletarSecao();       // não perde o que foi digitado ao trocar de aba
    _cteSecao = Math.max(0, Math.min(_CTE_SECOES.length - 1, i));
    _renderFormulario();
}

/** Campo de texto simples ligado a um caminho dentro de _cteAtual.dados. */
function _campo(caminho, rotulo, opcoes = {}) {
    const valor = _lerCaminho(_cteAtual.dados, caminho) ?? "";
    const attrs = [
        `id="c-${caminho.replace(/\./g, "-")}"`,
        `data-caminho="${caminho}"`,
        opcoes.tipo ? `type="${opcoes.tipo}"` : 'type="text"',
        opcoes.maxlength ? `maxlength="${opcoes.maxlength}"` : "",
        opcoes.step ? `step="${opcoes.step}"` : "",
        opcoes.placeholder ? `placeholder="${_esc(opcoes.placeholder)}"` : "",
    ].filter(Boolean).join(" ");
    return `<label class="${opcoes.largura || ""}">${_esc(rotulo)}
        <input ${attrs} value="${_esc(valor)}"></label>`;
}

function _select(caminho, rotulo, itens, opcoes = {}) {
    const valor = String(_lerCaminho(_cteAtual.dados, caminho) ?? "");
    return `<label>${_esc(rotulo)}
        <select id="c-${caminho.replace(/\./g, "-")}" data-caminho="${caminho}">
            <option value="">${opcoes.vazio || "Selecione…"}</option>
            ${itens.map((i) => `<option value="${i.v}" ${valor === i.v ? "selected" : ""}>${_esc(i.t)}</option>`).join("")}
        </select></label>`;
}

function _lerCaminho(obj, caminho) {
    return caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function _escreverCaminho(obj, caminho, valor) {
    const partes = caminho.split(".");
    let atual = obj;
    for (let i = 0; i < partes.length - 1; i++) {
        if (typeof atual[partes[i]] !== "object" || atual[partes[i]] === null) atual[partes[i]] = {};
        atual = atual[partes[i]];
    }
    atual[partes[partes.length - 1]] = valor;
}

/** Lê os inputs da seção visível de volta para o objeto de dados. */
function _coletarSecao() {
    document.querySelectorAll("#secao-atual [data-caminho]").forEach((el) => {
        const v = el.value;
        _escreverCaminho(_cteAtual.dados, el.dataset.caminho, v === "" ? null : v);
    });
    // Documentos e componentes têm estrutura de lista, tratados à parte.
    const linhasDoc = document.querySelectorAll("#tabela-docs tbody tr");
    if (linhasDoc.length) {
        _cteAtual.dados.documentos = [...linhasDoc].map((tr) => ({
            chave: tr.querySelector(".doc-chave")?.value || null,
            numero: tr.querySelector(".doc-numero")?.value || null,
            serie: tr.querySelector(".doc-serie")?.value || null,
            valor: tr.querySelector(".doc-valor")?.value || null,
            tipo: "NFe",
        })).filter((d) => d.chave || d.numero);
    }
    const linhasComp = document.querySelectorAll("#tabela-comp tbody tr");
    if (linhasComp.length) {
        _escreverCaminho(_cteAtual.dados, "vPrest.componentes", [...linhasComp].map((tr) => ({
            nome: tr.querySelector(".comp-nome")?.value || "",
            valor: tr.querySelector(".comp-valor")?.value || "",
        })).filter((c) => c.nome));
    }
}

/** Bloco de endereço/identificação de um participante. */
function _blocoParticipante(prefixo, titulo, opcional = false) {
    return `
    <div class="secao-form">
        <h3>${_esc(titulo)}${opcional ? ' <small class="opcional">(opcional)</small>' : ""}</h3>
        <div class="linha-form">
            ${_campo(`${prefixo}.cnpj`, "CNPJ", { maxlength: 18, placeholder: "só números" })}
            ${_campo(`${prefixo}.cpf`, "CPF", { maxlength: 14, placeholder: "se for pessoa física" })}
            ${_campo(`${prefixo}.ie`, "Inscrição estadual")}
        </div>
        <div class="linha-form">
            ${_campo(`${prefixo}.nome`, "Razão social / Nome", { largura: "largo" })}
            ${_campo(`${prefixo}.nome_fantasia`, "Nome fantasia")}
        </div>
        <div class="linha-form">
            ${_campo(`${prefixo}.endereco.logradouro`, "Logradouro", { largura: "largo" })}
            ${_campo(`${prefixo}.endereco.numero`, "Número")}
            ${_campo(`${prefixo}.endereco.complemento`, "Complemento")}
        </div>
        <div class="linha-form">
            ${_campo(`${prefixo}.endereco.bairro`, "Bairro")}
            ${_campo(`${prefixo}.endereco.municipio`, "Município")}
            ${_campo(`${prefixo}.endereco.codigo_municipio`, "Código IBGE", { maxlength: 7, placeholder: "7 dígitos" })}
            ${_campo(`${prefixo}.endereco.uf`, "UF", { maxlength: 2 })}
            ${_campo(`${prefixo}.endereco.cep`, "CEP", { maxlength: 9 })}
        </div>
        <div class="linha-form">
            ${_campo(`${prefixo}.telefone`, "Telefone")}
            ${_campo(`${prefixo}.email`, "E-mail", { tipo: "email" })}
        </div>
    </div>`;
}

function _htmlSecao(i) {
    const d = _cteAtual.dados;
    switch (i) {
        case 0: return `
        <div class="secao-form">
            <h3>Identificação do CT-e</h3>
            <div class="aviso-info">
                Ambiente, modelo e numeração são definidos pelo sistema.
                O número é reservado na validação, não agora.
            </div>
            <div class="linha-form">
                <label>Ambiente <input value="${_esc(_cteContexto.empresa.ambiente)}" disabled></label>
                <label>Modelo <input value="57" disabled></label>
                ${_campo("ide.serie", "Série", { tipo: "number", placeholder: "1" })}
                <label>Número <input value="${_cteAtual.id && _cteAtual.numero ? _cteAtual.numero : "definido na validação"}" disabled></label>
            </div>
            <div class="linha-form">
                ${_select("ide.tpCTe", "Tipo de CT-e (tpCTe)", _CTE_TIPOS)}
                ${_select("ide.tpServ", "Tipo de serviço (tpServ)", _CTE_SERVICOS)}
                ${_campo("ide.CFOP", "CFOP", { maxlength: 4, placeholder: "ex: 5353" })}
            </div>
            <div class="linha-form">
                ${_campo("ide.natOp", "Natureza da operação", { largura: "largo" })}
            </div>
            <div class="linha-form">
                ${_campo("ide.xMunIni", "Município de início")}
                ${_campo("ide.cMunIni", "Código IBGE início", { maxlength: 7 })}
                ${_campo("ide.UFIni", "UF início", { maxlength: 2 })}
            </div>
            <div class="linha-form">
                ${_campo("ide.xMunFim", "Município de término")}
                ${_campo("ide.cMunFim", "Código IBGE término", { maxlength: 7 })}
                ${_campo("ide.UFFim", "UF término", { maxlength: 2 })}
            </div>
            <p class="dica">
                CFOP, tipo de CT-e e tipo de serviço dependem da operação e devem
                ser confirmados com o contador. O sistema não escolhe por você.
            </p>
        </div>`;

        case 1: return _blocoParticipante("remetente", "Remetente");
        case 2: return _blocoParticipante("expedidor", "Expedidor", true);
        case 3: return _blocoParticipante("recebedor", "Recebedor", true);
        case 4: return _blocoParticipante("destinatario", "Destinatário");

        case 5: return `
        <div class="secao-form">
            <h3>Tomador do serviço</h3>
            <div class="linha-form">${_select("ide.toma", "Quem é o tomador", _CTE_TOMADORES)}</div>
            <p class="dica">
                Escolhendo "Outros", os dados abaixo passam a ser obrigatórios —
                nos demais casos o tomador é um dos participantes já informados.
            </p>
            ${_blocoParticipante("tomador", "Dados do tomador (quando 'Outros')", true)}
        </div>`;

        case 6: return `
        <div class="secao-form">
            <h3>Carga</h3>
            <div class="linha-form">
                ${_campo("carga.produto_predominante", "Produto predominante", { largura: "largo" })}
                ${_campo("carga.valor_carga", "Valor da carga", { tipo: "number", step: "0.01" })}
            </div>
            <div class="linha-form">
                ${_campo("carga.quantidade", "Quantidade", { tipo: "number", step: "0.0001" })}
                ${_campo("carga.unidade", "Unidade", { placeholder: "KG, UN, M3…" })}
                ${_campo("carga.tipo_medida", "Tipo de medida", { placeholder: "PESO BRUTO, CUBAGEM…" })}
                ${_campo("carga.peso", "Peso", { tipo: "number", step: "0.0001" })}
            </div>
        </div>`;

        case 7: {
            const comps = (d.vPrest && d.vPrest.componentes) || [];
            return `
            <div class="secao-form">
                <h3>Valores da prestação</h3>
                <div class="linha-form">
                    ${_campo("vPrest.vTPrest", "Valor total da prestação", { tipo: "number", step: "0.01" })}
                    ${_campo("vPrest.vRec", "Valor a receber", { tipo: "number", step: "0.01" })}
                </div>
                <h4>Componentes</h4>
                <table class="tabela" id="tabela-comp">
                    <thead><tr><th>Nome</th><th>Valor</th><th></th></tr></thead>
                    <tbody>
                        ${comps.map((c) => `<tr>
                            <td><input class="comp-nome" value="${_esc(c.nome)}"></td>
                            <td><input class="comp-valor" type="number" step="0.01" value="${_esc(c.valor)}"></td>
                            <td><button onclick="this.closest('tr').remove()">×</button></td>
                        </tr>`).join("")}
                    </tbody>
                </table>
                <button onclick="_addLinhaComp()">+ Componente</button>
            </div>`;
        }

        case 8: {
            const trib = _cteContexto.tributacao || {};
            return `
            <div class="secao-form">
                <h3>Tributação — ICMS</h3>
                <div class="aviso-info">
                    O grupo de ICMS depende do regime tributário da empresa.
                    Confirme CST/CSOSN e alíquota com o contador.
                </div>
                <div class="linha-form">
                    ${_select("imposto_regime", "Regime", [
                        { v: "normal", t: "Normal (CST)" },
                        { v: "simples", t: "Simples Nacional (CSOSN)" },
                    ])}
                    ${_campo("imposto_cst", "CST / CSOSN", { maxlength: 4 })}
                </div>
                <div class="linha-form">
                    ${_campo("imposto_vbc", "Base de cálculo", { tipo: "number", step: "0.01" })}
                    ${_campo("imposto_aliquota", "Alíquota (%)", { tipo: "number", step: "0.01" })}
                    ${_campo("imposto_valor", "Valor do ICMS", { tipo: "number", step: "0.01" })}
                </div>
            </div>
            ${typeof fiscalSecaoTributacao === "function"
                ? fiscalSecaoTributacao(trib, _cteAtual.dados)
                : '<div class="aviso-bloqueio">Módulo de tributação IBS/CBS não carregado.</div>'}`;
        }

        case 9: {
            const docs = d.documentos || [];
            return `
            <div class="secao-form">
                <h3>Documentos fiscais transportados</h3>
                <p class="dica">Informe as NF-e vinculadas a este CT-e.</p>
                <table class="tabela" id="tabela-docs">
                    <thead><tr><th>Chave de acesso (44)</th><th>Número</th><th>Série</th><th>Valor</th><th></th></tr></thead>
                    <tbody>
                        ${docs.map((x) => `<tr>
                            <td><input class="doc-chave mono-pequeno" maxlength="44" value="${_esc(x.chave)}"></td>
                            <td><input class="doc-numero" value="${_esc(x.numero)}"></td>
                            <td><input class="doc-serie" value="${_esc(x.serie)}"></td>
                            <td><input class="doc-valor" type="number" step="0.01" value="${_esc(x.valor)}"></td>
                            <td><button onclick="this.closest('tr').remove()">×</button></td>
                        </tr>`).join("")}
                    </tbody>
                </table>
                <button onclick="_addLinhaDoc()">+ NF-e</button>
            </div>`;
        }

        case 10: return `
        <div class="secao-form">
            <h3>Observações e informações adicionais</h3>
            <label>Observações gerais
                <textarea id="c-compl-xObs" data-caminho="compl.xObs" rows="4">${_esc(_lerCaminho(d, "compl.xObs") ?? "")}</textarea>
            </label>
            <label>Informações de interesse do fisco
                <textarea id="c-compl-xCaracAd" data-caminho="compl.xCaracAd" rows="3">${_esc(_lerCaminho(d, "compl.xCaracAd") ?? "")}</textarea>
            </label>
        </div>`;

        case 11: return _htmlConferencia(d, _cteAtual);
        default: return "";
    }
}

function _addLinhaComp() {
    _coletarSecao();
    const l = (_cteAtual.dados.vPrest && _cteAtual.dados.vPrest.componentes) || [];
    _escreverCaminho(_cteAtual.dados, "vPrest.componentes", [...l, { nome: "", valor: "" }]);
    _renderFormulario();
}
function _addLinhaDoc() {
    _coletarSecao();
    _cteAtual.dados.documentos = [...(_cteAtual.dados.documentos || []), { chave: "", numero: "" }];
    _renderFormulario();
}

// ─────────────────────────────────────────── conferência
function _htmlConferencia(d, cte = {}) {
    const parte = (p, titulo) => {
        const x = d[p];
        if (!x || (!x.nome && !x.cnpj && !x.cpf)) return "";
        return `<div class="conf-bloco"><b>${titulo}</b><br>
            ${_esc(x.nome || "—")}<br>
            <span class="mono-pequeno">${_esc(x.cnpj || x.cpf || "")}</span><br>
            ${_esc([x.endereco?.municipio, x.endereco?.uf].filter(Boolean).join(" / "))}</div>`;
    };
    const ide = d.ide || {};
    const v = d.vPrest || {};
    const pendencias = _pendenciasLocais(d);

    return `
    <div class="secao-form">
        <h3>Conferência</h3>
        ${pendencias.length ? `
        <div class="aviso-bloqueio">
            <strong>Faltam dados antes de validar:</strong>
            <ul>${pendencias.map((p) => `<li>${_esc(p)}</li>`).join("")}</ul>
            <p class="dica">Esta é uma conferência rápida da tela. A validação
            completa (leiaute, tributação e schema) é feita pelo backend.</p>
        </div>` : `<div class="aviso-info">Os campos básicos estão preenchidos. A validação final é do backend.</div>`}

        <div class="conf-grade">
            <div class="conf-bloco"><b>Identificação</b><br>
                CFOP ${_esc(ide.CFOP || "—")} · Série ${_esc(ide.serie || "—")}<br>
                ${_esc(ide.natOp || "—")}<br>
                ${_esc(ide.xMunIni || "?")} → ${_esc(ide.xMunFim || "?")}
            </div>
            ${parte("remetente", "Remetente")}
            ${parte("expedidor", "Expedidor")}
            ${parte("recebedor", "Recebedor")}
            ${parte("destinatario", "Destinatário")}
            ${parte("tomador", "Tomador (Outros)")}
            <div class="conf-bloco"><b>Valores</b><br>
                Prestação: ${_fmtBRL(v.vTPrest)}<br>
                A receber: ${_fmtBRL(v.vRec)}<br>
                Componentes: ${(v.componentes || []).length}
            </div>
            <div class="conf-bloco"><b>Carga</b><br>
                ${_esc((d.carga && d.carga.produto_predominante) || "—")}<br>
                ${_esc((d.carga && d.carga.peso) || "—")} ${_esc((d.carga && d.carga.unidade) || "")}
            </div>
            <div class="conf-bloco"><b>Documentos</b><br>
                ${(d.documentos || []).length} NF-e vinculada(s)
            </div>
            <div class="conf-bloco"><b>Tributação</b><br>
                ICMS CST ${_esc(d.imposto_cst || "—")}<br>
                ${cte.valor_ibs != null ? `IBS ${_fmtBRL(cte.valor_ibs)} · CBS ${_fmtBRL(cte.valor_cbs)}`
                                        : "IBS/CBS calculado na validação"}
            </div>
        </div>
    </div>`;
}

/**
 * Conferência rápida só para a pessoa não clicar em validar com o formulário
 * vazio. NÃO é validação fiscal — quem valida é o backend.
 */
function _pendenciasLocais(d) {
    const faltando = [];
    const ide = d.ide || {};
    if (!ide.CFOP) faltando.push("CFOP");
    if (!ide.natOp) faltando.push("Natureza da operação");
    if (ide.tpCTe === undefined || ide.tpCTe === null || ide.tpCTe === "") faltando.push("Tipo de CT-e");
    if (ide.toma === undefined || ide.toma === null || ide.toma === "") faltando.push("Tomador");
    if (!ide.cMunIni || !ide.UFIni) faltando.push("Município/UF de início");
    if (!ide.cMunFim || !ide.UFFim) faltando.push("Município/UF de término");
    if (!(d.vPrest && d.vPrest.vTPrest)) faltando.push("Valor da prestação");
    if (!(d.vPrest && d.vPrest.vRec)) faltando.push("Valor a receber");
    if (!(d.remetente && (d.remetente.cnpj || d.remetente.cpf))) faltando.push("Remetente");
    if (!(d.destinatario && (d.destinatario.cnpj || d.destinatario.cpf))) faltando.push("Destinatário");
    return faltando;
}

// ─────────────────────────────────────────── ações
async function salvarRascunhoCTe() {
    _coletarSecao();
    try {
        // Rascunho salva incompleto de propósito: o preenchimento acontece em
        // várias sessões.
        const corpo = JSON.stringify({ dados: _cteAtual.dados });
        const r = _cteAtual.id
            ? await _cteApi(`/fiscal/cte/${_cteAtual.id}`, { method: "PUT", body: corpo })
            : await _cteApi("/fiscal/cte", { method: "POST", body: corpo });
        _cteAtual.id = r.id;
        _cteAtual.status = r.status;
        alert(`Rascunho salvo (CT-e #${r.id}).`);
        _renderFormulario();
    } catch (e) {
        alert("Não foi possível salvar: " + e.message);
    }
}

async function validarCTe() {
    _coletarSecao();
    const alvo = document.getElementById("resultado-validacao");
    alvo.innerHTML = "<p>Validando no servidor…</p>";
    try {
        if (!_cteAtual.id) await salvarRascunhoCTe();
        else await _cteApi(`/fiscal/cte/${_cteAtual.id}`, {
            method: "PUT", body: JSON.stringify({ dados: _cteAtual.dados }),
        });

        const r = await _cteApi(`/fiscal/cte/${_cteAtual.id}/validar`, { method: "POST" });
        _cteAtual.status = r.status;

        if (r.ok) {
            alvo.innerHTML = `
            <div class="aviso-sucesso">
                <strong>CT-e pronto para emissão.</strong>
                <p>Número ${r.numero} · chave <span class="mono-pequeno">${_esc(r.chave)}</span></p>
                <p>XML gerado e validado no schema oficial ${_esc(r.versao_leiaute)}
                   (pacote ${_esc(r.pacote_schemas)}).</p>
                ${r.tributos ? `<p>IBS ${_fmtBRL(r.tributos.v_ibs)} · CBS ${_fmtBRL(r.tributos.v_cbs)}</p>` : ""}
                <p class="dica">A transmissão para a SEFAZ ainda não está habilitada.</p>
                <button onclick="baixarXmlCTe(${_cteAtual.id})">Ver XML</button>
            </div>`;
        } else {
            alvo.innerHTML = `
            <div class="aviso-bloqueio">
                <strong>${r.problemas.length} pendência(s) impedem a emissão:</strong>
                <ul>${r.problemas.map((p) =>
                    `<li>${p.origem === "schema" ? "<b>[schema]</b> " : p.origem === "tributacao" ? "<b>[tributação]</b> " : ""}${_esc(p.mensagem)}</li>`).join("")}</ul>
            </div>`;
        }
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio"><strong>Erro:</strong><p>${_esc(e.message)}</p></div>`;
    }
}
