// ───── EXTRAVIOS — REGISTROS (cards, cadastro e edição) ─────
//
// Grava direto na planilha de extravios pelo backend (/extravios/*), que é o
// único ponto do sistema com permissão de escrita no Google Sheets.
//
// As telas Pesquisar e Dashboard (extravios.js) continuam lendo o CSV público —
// não foram tocadas. Este módulo é só o cadastro/edição.

const EXTRVREG_CAMPOS_ROTULO = {
    status: "Status", transportadora: "Transportadora", data: "Data", hora: "Hora",
    cidade: "Cidade", codigo: "Código", valor: "Valor", responsavel: "Responsável",
    endereco: "Endereço", causa: "Causa"
};

const EXTRVREG_CORES_STATUS = {
    "pendente":       "#fbbf24",
    "resolvido":      "#22c55e",
    "para desconto":  "#3a86ff",
    "multa":          "#a78bfa",
    "lost":           "#ef4444",
    "contestado":     "#06b6d4",
    "dmaged":         "#f97316",
    "em análise":     "#8494a9"
};

let _extrvRegOpcoes   = null;
let _extrvRegEstado   = { pagina: 1, busca: "", status: "", transportadora: "", cidade: "", completude: "" };
let _extrvRegBuscaTmr = null;
let _extrvRegCarregando = false;
let _extrvRegEditando = null;   // linha em edição; null = registro novo
let _extrvRegSalvando = false;  // trava contra duplo clique

/* ───────────────────────── Navegação ───────────────────────── */

function abrirExtraviosRegistros(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-extravios-registros");
    _extrvRegIniciar();
}

async function _extrvRegIniciar() {
    if (!_extrvRegOpcoes) {
        try {
            _extrvRegOpcoes = await _extrvRegApi("/extravios/opcoes");
            _extrvRegPreencherFiltros();
        } catch (err) {
            gcAlert(err.message, "Extravios");
            return;
        }
    }
    _extrvRegCarregar();
}

/* ───────────────────────── Backend ───────────────────────── */

async function _extrvRegApi(caminho, opcoes) {
    const cfg = Object.assign({ headers: {} }, opcoes || {});
    cfg.headers = Object.assign({ "Authorization": "Bearer " + token }, cfg.headers);
    if (cfg.body) cfg.headers["Content-Type"] = "application/json";

    const resp = await fetch(API + caminho, cfg);
    let dados = null;
    try { dados = await resp.json(); } catch { dados = null; }

    if (!resp.ok) {
        const erro = new Error((dados && dados.error) || "Não foi possível falar com o servidor.");
        erro.status = resp.status;
        erro.dados = dados;
        throw erro;
    }
    return dados;
}

function _extrvRegEsc(v) {
    return String(v === null || v === undefined ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _extrvRegCorStatus(status) {
    return EXTRVREG_CORES_STATUS[String(status || "").trim().toLowerCase()] || "#8494a9";
}

/* ───────────────────────── Filtros ───────────────────────── */

function _extrvRegPreencherFiltros() {
    const encher = (id, itens, rotuloVazio) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = `<option value="">${rotuloVazio}</option>` +
            itens.map(i => `<option value="${_extrvRegEsc(i)}">${_extrvRegEsc(i)}</option>`).join("");
    };
    encher("extrvreg-f-status", _extrvRegOpcoes.status, "Todos os status");
    encher("extrvreg-f-transp", _extrvRegOpcoes.transportadoras, "Todas as transportadoras");
    encher("extrvreg-f-cidade", _extrvRegOpcoes.cidades, "Todas as cidades");
}

function _extrvRegFiltrar() {
    _extrvRegEstado.status         = document.getElementById("extrvreg-f-status").value;
    _extrvRegEstado.transportadora = document.getElementById("extrvreg-f-transp").value;
    _extrvRegEstado.cidade         = document.getElementById("extrvreg-f-cidade").value;
    _extrvRegEstado.completude     = document.getElementById("extrvreg-f-completude").value;
    _extrvRegEstado.pagina = 1;
    _extrvRegCarregar();
}

function _extrvRegBuscar() {
    clearTimeout(_extrvRegBuscaTmr);
    _extrvRegBuscaTmr = setTimeout(() => {
        _extrvRegEstado.busca = document.getElementById("extrvreg-busca").value.trim();
        _extrvRegEstado.pagina = 1;
        _extrvRegCarregar();
    }, 350);
}

function _extrvRegLimparFiltros() {
    document.getElementById("extrvreg-busca").value = "";
    ["extrvreg-f-status", "extrvreg-f-transp", "extrvreg-f-cidade", "extrvreg-f-completude"]
        .forEach(id => { document.getElementById(id).value = ""; });
    _extrvRegEstado = { pagina: 1, busca: "", status: "", transportadora: "", cidade: "", completude: "" };
    _extrvRegCarregar();
}

function _extrvRegIrPara(pagina) {
    _extrvRegEstado.pagina = pagina;
    _extrvRegCarregar();
    document.getElementById("tela-extravios-registros").scrollTo({ top: 0, behavior: "smooth" });
}

/* ───────────────────────── Cards ───────────────────────── */

async function _extrvRegCarregar() {
    if (_extrvRegCarregando) return;
    _extrvRegCarregando = true;

    const alvo = document.getElementById("extrvreg-lista");
    alvo.innerHTML = `<div class="extrv-reg-vazio">Carregando registros da planilha...</div>`;

    const q = new URLSearchParams();
    Object.keys(_extrvRegEstado).forEach(k => { if (_extrvRegEstado[k]) q.set(k, _extrvRegEstado[k]); });

    try {
        const dados = await _extrvRegApi("/extravios/registros?" + q.toString());
        _extrvRegRender(dados);
    } catch (err) {
        alvo.innerHTML = `<div class="extrv-reg-vazio">${_extrvRegEsc(err.message)}</div>`;
    } finally {
        _extrvRegCarregando = false;
    }
}

function _extrvRegRender(dados) {
    const r = dados.resumo;
    document.getElementById("extrvreg-resumo").innerHTML =
        `<span><b>${r.total.toLocaleString("pt-BR")}</b> registros</span>` +
        `<span class="extrv-reg-ok"><b>${r.completos.toLocaleString("pt-BR")}</b> completos</span>` +
        `<span class="extrv-reg-alerta"><b>${r.incompletos.toLocaleString("pt-BR")}</b> incompletos</span>` +
        `<span>${dados.encontrados.toLocaleString("pt-BR")} no filtro atual</span>`;

    const alvo = document.getElementById("extrvreg-lista");
    if (!dados.itens.length) {
        alvo.innerHTML = `<div class="extrv-reg-vazio">Nenhum registro encontrado com esses filtros.</div>`;
    } else {
        alvo.innerHTML = dados.itens.map(_extrvRegCardHtml).join("");
    }

    const nav = document.getElementById("extrvreg-paginacao");
    if (dados.paginas <= 1) {
        nav.innerHTML = "";
    } else {
        nav.innerHTML =
            `<button class="extrv-reg-btn" ${dados.pagina <= 1 ? "disabled" : ""} onclick="_extrvRegIrPara(${dados.pagina - 1})">Anterior</button>` +
            `<span class="extrv-reg-pag-info">Página ${dados.pagina} de ${dados.paginas}</span>` +
            `<button class="extrv-reg-btn" ${dados.pagina >= dados.paginas ? "disabled" : ""} onclick="_extrvRegIrPara(${dados.pagina + 1})">Próxima</button>`;
    }
}

function _extrvRegCardHtml(r) {
    const cor = _extrvRegCorStatus(r.status);

    const faltando = r.faltando.length
        ? `<div class="extrv-reg-faltando">Falta preencher: ${r.faltando.map(c => _extrvRegEsc(EXTRVREG_CAMPOS_ROTULO[c] || c)).join(", ")}</div>`
        : "";

    const dup = String(r.duplicado || "").toUpperCase() === "DUPLICADO"
        ? `<span class="extrv-reg-badge extrv-reg-badge-dup">DUPLICADO</span>` : "";

    const linhaInfo = (rotulo, valor) =>
        `<div class="extrv-reg-linha"><span>${rotulo}</span><b>${_extrvRegEsc(valor || "—")}</b></div>`;

    return `
    <div class="extrv-reg-card ${r.completo ? "" : "incompleto"}" onclick="_extrvRegAbrirModal(${r.linha})">
        <div class="extrv-reg-card-topo">
            <span class="extrv-reg-codigo">${_extrvRegEsc(r.codigo || "(sem código)")}</span>
            <div class="extrv-reg-badges">
                ${dup}
                <span class="extrv-reg-badge" style="color:${cor};border-color:${cor}44;background:${cor}18">${_extrvRegEsc(r.status || "—")}</span>
            </div>
        </div>
        <div class="extrv-reg-card-corpo">
            ${linhaInfo("Transportadora", r.transportadora)}
            ${linhaInfo("Data", (r.data || "") + (r.hora ? " " + r.hora : ""))}
            ${linhaInfo("Cidade", r.cidade)}
            ${linhaInfo("Valor", r.valor)}
            ${linhaInfo("Responsável", r.responsavel)}
            ${r.dataDesconto ? linhaInfo("Desconto", r.dataDesconto) : ""}
        </div>
        ${faltando}
        <div class="extrv-reg-card-rodape">linha ${r.linha} da planilha</div>
    </div>`;
}

/* ───────────────────────── Modal de cadastro/edição ───────────────────────── */

async function _extrvRegAbrirModal(linha) {
    _extrvRegEditando = linha || null;
    let registro = null;

    if (linha) {
        try {
            registro = await _extrvRegApi("/extravios/registros/" + linha);
        } catch (err) {
            _extrvRegEditando = null;
            gcAlert(err.message, "Extravios");
            return;
        }
    }

    _extrvRegMontarModal(registro);
}

function _extrvRegMontarModal(r) {
    const existente = r || {};
    const novo = !_extrvRegEditando;

    const opcao = (lista, atual) =>
        ["<option value=\"\">Selecione...</option>"].concat(
            (lista || []).map(i => `<option value="${_extrvRegEsc(i)}"${String(i) === String(atual || "") ? " selected" : ""}>${_extrvRegEsc(i)}</option>`)
        ).join("");

    const dataIso = existente.dataIso || "";
    const desconto = existente.dataDesconto || "";
    const ehQuinzena = /^Q[12]/i.test(desconto);

    const overlay = document.createElement("div");
    overlay.className = "extrv-reg-overlay";
    overlay.id = "extrvreg-overlay";
    overlay.innerHTML = `
    <div class="extrv-reg-modal" onclick="event.stopPropagation()">
        <div class="extrv-reg-modal-topo">
            <div>
                <div class="extrv-reg-modal-titulo">${novo ? "Novo extravio" : "Editar extravio"}</div>
                <div class="extrv-reg-modal-sub">${novo ? "Vai para a primeira linha vazia da planilha" : "Linha " + _extrvRegEditando + " da planilha"}</div>
            </div>
            <button class="extrv-reg-fechar" onclick="_extrvRegFecharModal()">×</button>
        </div>

        <div class="extrv-reg-aviso" id="extrvreg-aviso"></div>

        <div class="extrv-reg-form">
            <div class="extrv-reg-campo c6">
                <label>Código ${novo ? "<i>*</i>" : ""}</label>
                <input type="text" id="extrvreg-codigo" value="${_extrvRegEsc(existente.codigo || "")}"
                       oninput="this.value=this.value.toUpperCase().replace(/\\s+/g,'');_extrvRegChecarCodigo()">
                <span class="extrv-reg-erro" data-erro="codigo"></span>
                <span class="extrv-reg-dica" id="extrvreg-dica-codigo"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Status ${novo ? "<i>*</i>" : ""}</label>
                <select id="extrvreg-status" onchange="_extrvRegChecarCodigo()">${opcao(_extrvRegOpcoes.status, existente.status)}</select>
                <span class="extrv-reg-erro" data-erro="status"></span>
            </div>

            <div class="extrv-reg-campo c6">
                <label>Transportadora ${novo ? "<i>*</i>" : ""}</label>
                <select id="extrvreg-transportadora">${opcao(_extrvRegOpcoes.transportadoras, existente.transportadora)}</select>
                <span class="extrv-reg-erro" data-erro="transportadora"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Cidade ${novo ? "<i>*</i>" : ""}</label>
                <input type="text" id="extrvreg-cidade" list="extrvreg-cidades" value="${_extrvRegEsc(existente.cidade || "")}" placeholder="Caçador, Videira...">
                <datalist id="extrvreg-cidades">${(_extrvRegOpcoes.cidades || []).map(c => `<option value="${_extrvRegEsc(c)}">`).join("")}</datalist>
                <span class="extrv-reg-erro" data-erro="cidade"></span>
            </div>

            <div class="extrv-reg-campo c3">
                <label>Data ${novo ? "<i>*</i>" : ""}</label>
                <input type="date" id="extrvreg-data" value="${_extrvRegEsc(dataIso)}">
                <span class="extrv-reg-erro" data-erro="data"></span>
            </div>
            <div class="extrv-reg-campo c3">
                <label>Hora ${novo ? "<i>*</i>" : ""}</label>
                <input type="time" id="extrvreg-hora" value="${_extrvRegEsc(existente.horaIso || "")}">
                <span class="extrv-reg-erro" data-erro="hora"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Valor ${novo ? "<i>*</i>" : ""}</label>
                <input type="text" id="extrvreg-valor" value="${_extrvRegEsc(existente.valor || "")}" placeholder="R$ 0,00" oninput="_extrvRegMascaraValor(this)">
                <span class="extrv-reg-erro" data-erro="valor"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Responsável ${novo ? "<i>*</i>" : ""}</label>
                <input type="text" id="extrvreg-responsavel" list="extrvreg-responsaveis" value="${_extrvRegEsc(existente.responsavel || "")}" placeholder="Nome - Cidade">
                <datalist id="extrvreg-responsaveis">${(_extrvRegOpcoes.responsaveis || []).map(c => `<option value="${_extrvRegEsc(c)}">`).join("")}</datalist>
                <span class="extrv-reg-erro" data-erro="responsavel"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Endereço ${novo ? "<i>*</i>" : ""}</label>
                <input type="text" id="extrvreg-endereco" value="${_extrvRegEsc(existente.endereco || "")}" maxlength="250">
                <span class="extrv-reg-erro" data-erro="endereco"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Causa do problema ${novo ? "<i>*</i>" : ""}</label>
                <textarea id="extrvreg-causa" rows="2" maxlength="500">${_extrvRegEsc(existente.causa || "")}</textarea>
                <span class="extrv-reg-erro" data-erro="causa"></span>
            </div>

            <div class="extrv-reg-campo c6">
                <label>Desconto <i class="opc">(opcional)</i></label>
                <select id="extrvreg-desconto-tipo" onchange="_extrvRegTrocarDesconto()">
                    <option value=""${!desconto ? " selected" : ""}>Sem desconto</option>
                    <option value="quinzena"${ehQuinzena ? " selected" : ""}>Quinzena</option>
                    <option value="data"${desconto && !ehQuinzena ? " selected" : ""}>Data específica</option>
                </select>
            </div>
            <div class="extrv-reg-campo c6">
                <label>&nbsp;</label>
                <select id="extrvreg-desconto-quinzena" style="display:${ehQuinzena ? "block" : "none"}">
                    ${(_extrvRegOpcoes.quinzenas || []).map(q => `<option value="${q}"${q === desconto ? " selected" : ""}>${q}</option>`).join("")}
                </select>
                <input type="date" id="extrvreg-desconto-data" style="display:${desconto && !ehQuinzena ? "block" : "none"}"
                       value="${_extrvRegEsc(desconto && !ehQuinzena ? _extrvRegParaIso(desconto) : "")}">
                <span class="extrv-reg-erro" data-erro="dataDesconto"></span>
            </div>
        </div>

        <div class="extrv-reg-modal-rodape">
            <button class="extrv-reg-btn" onclick="_extrvRegFecharModal()">Cancelar</button>
            <button class="extrv-reg-btn primario" id="extrvreg-salvar" onclick="_extrvRegSalvar()">
                ${novo ? "Registrar extravio" : "Salvar alterações"}
            </button>
        </div>
    </div>`;

    overlay.addEventListener("click", e => { if (e.target === overlay) _extrvRegFecharModal(); });
    document.body.appendChild(overlay);
    setTimeout(() => { const c = document.getElementById("extrvreg-codigo"); if (c && !_extrvRegEditando) c.focus(); }, 60);
}

function _extrvRegFecharModal() {
    const o = document.getElementById("extrvreg-overlay");
    if (o) o.remove();
    _extrvRegEditando = null;
    _extrvRegSalvando = false;
}

function _extrvRegTrocarDesconto() {
    const tipo = document.getElementById("extrvreg-desconto-tipo").value;
    document.getElementById("extrvreg-desconto-quinzena").style.display = tipo === "quinzena" ? "block" : "none";
    document.getElementById("extrvreg-desconto-data").style.display     = tipo === "data" ? "block" : "none";
}

function _extrvRegParaIso(br) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || "").trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function _extrvRegMascaraValor(input) {
    const digitos = input.value.replace(/\D/g, "").replace(/^0+/, "");
    if (!digitos) { input.value = ""; return; }
    const centavos = digitos.padStart(3, "0");
    const inteiro = centavos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    input.value = "R$ " + inteiro + "," + centavos.slice(-2);
}

/* ───────────────────────── Duplicidade ───────────────────────── */

async function _extrvRegChecarCodigo() {
    const dica = document.getElementById("extrvreg-dica-codigo");
    if (!dica) return;

    const codigo = document.getElementById("extrvreg-codigo").value.trim();
    if (codigo.length < 3) { dica.textContent = ""; dica.className = "extrv-reg-dica"; return; }

    clearTimeout(_extrvRegBuscaTmr);
    _extrvRegBuscaTmr = setTimeout(async () => {
        try {
            const q = new URLSearchParams({ status: document.getElementById("extrvreg-status").value });
            if (_extrvRegEditando) q.set("ignorarLinha", _extrvRegEditando);
            const r = await _extrvRegApi("/extravios/codigo/" + encodeURIComponent(codigo) + "?" + q.toString());

            if (!r.existe) {
                dica.textContent = "Código inédito.";
                dica.className = "extrv-reg-dica ok";
            } else if (r.permitido) {
                dica.textContent = `Já existe ${r.ocorrencias}x — será gravado como DUPLICADO (liberado pela Multa).`;
                dica.className = "extrv-reg-dica alerta";
            } else {
                dica.textContent = r.mensagem;
                dica.className = "extrv-reg-dica erro";
            }
        } catch { dica.textContent = ""; }
    }, 400);
}

/* ───────────────────────── Salvar ───────────────────────── */

function _extrvRegColetar() {
    const tipo = document.getElementById("extrvreg-desconto-tipo").value;
    let dataDesconto = "";
    if (tipo === "quinzena") dataDesconto = document.getElementById("extrvreg-desconto-quinzena").value;
    else if (tipo === "data") dataDesconto = document.getElementById("extrvreg-desconto-data").value;

    return {
        status:         document.getElementById("extrvreg-status").value,
        transportadora: document.getElementById("extrvreg-transportadora").value,
        data:           document.getElementById("extrvreg-data").value,
        hora:           document.getElementById("extrvreg-hora").value,
        cidade:         document.getElementById("extrvreg-cidade").value.trim(),
        codigo:         document.getElementById("extrvreg-codigo").value.trim(),
        valor:          document.getElementById("extrvreg-valor").value.trim(),
        responsavel:    document.getElementById("extrvreg-responsavel").value.trim(),
        endereco:       document.getElementById("extrvreg-endereco").value.trim(),
        causa:          document.getElementById("extrvreg-causa").value.trim(),
        dataDesconto:   dataDesconto
    };
}

function _extrvRegLimparErros() {
    document.querySelectorAll("#extrvreg-overlay .extrv-reg-erro").forEach(e => { e.textContent = ""; });
    document.querySelectorAll("#extrvreg-overlay .extrv-reg-campo").forEach(e => e.classList.remove("com-erro"));
    const aviso = document.getElementById("extrvreg-aviso");
    aviso.style.display = "none";
    aviso.innerHTML = "";
}

function _extrvRegMostrarErros(erros) {
    Object.keys(erros || {}).forEach(campo => {
        const alvo = document.querySelector(`#extrvreg-overlay [data-erro="${campo}"]`);
        if (!alvo) return;
        alvo.textContent = erros[campo];
        alvo.closest(".extrv-reg-campo").classList.add("com-erro");
    });
}

function _extrvRegMostrarDuplicidade(dados) {
    const aviso = document.getElementById("extrvreg-aviso");
    const linhas = (dados.existentes || []).map(e => `
        <div class="extrv-reg-dup-item">
            <b>${_extrvRegEsc(e.codigo)}</b>
            <span>${_extrvRegEsc(e.status || "—")}</span>
            <span>${_extrvRegEsc(e.transportadora || "—")}</span>
            <span>${_extrvRegEsc(e.data || "—")}</span>
            <span>${_extrvRegEsc(e.responsavel || "—")}</span>
            <span class="extrv-reg-dup-linha">linha ${e.linha}</span>
        </div>`).join("");

    aviso.innerHTML = `<div class="extrv-reg-aviso-titulo">${_extrvRegEsc(dados.error)}</div>${linhas}`;
    aviso.style.display = "block";
    aviso.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function _extrvRegSalvar() {
    if (_extrvRegSalvando) return;

    const botao = document.getElementById("extrvreg-salvar");
    const rotuloOriginal = botao.textContent;
    _extrvRegSalvando = true;
    botao.disabled = true;
    botao.textContent = "Salvando...";

    _extrvRegLimparErros();

    try {
        const corpo = JSON.stringify(_extrvRegColetar());
        const resposta = _extrvRegEditando
            ? await _extrvRegApi("/extravios/registros/" + _extrvRegEditando, { method: "PUT", body: corpo })
            : await _extrvRegApi("/extravios/registros", { method: "POST", body: corpo });

        _extrvRegFecharModal();
        await gcAlert(resposta.mensagem, "Extravios");
        _extrvRegCarregar();
    } catch (err) {
        const dados = err.dados || {};
        if (dados.tipo === "duplicado") {
            _extrvRegMostrarDuplicidade(dados);
        } else if (dados.erros) {
            _extrvRegMostrarErros(dados.erros);
        } else {
            gcAlert(err.message, "Extravios");
        }
    } finally {
        _extrvRegSalvando = false;
        const b = document.getElementById("extrvreg-salvar");
        if (b) { b.disabled = false; b.textContent = rotuloOriginal; }
    }
}
