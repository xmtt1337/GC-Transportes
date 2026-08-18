// ───── EXTRAVIOS — REGISTROS (lista, cadastro e edição) ─────
//
// Grava direto na planilha de extravios pelo backend (/extravios/*), que é o
// único ponto do sistema com permissão de escrita no Google Sheets.
//
// As telas Pesquisar e Dashboard (extravios.js) continuam lendo o CSV público —
// não foram tocadas. Este módulo é só o cadastro/edição.
//
// "Data desconto" e "Para desconto?" não são preenchidas aqui: quem cuida
// disso é o financeiro, direto na planilha. O sistema grava quem salvou e
// quando, nas colunas Ultima atualização e usuario.

const EXTRVREG_CAMPOS_ROTULO = {
    status: "Status", transportadora: "Transportadora", data: "Data", hora: "Hora",
    cidade: "Cidade", codigo: "Código", valor: "Valor", responsavel: "Responsável",
    endereco: "Endereço", causa: "Causa"
};

let _extrvRegOpcoes   = null;
let _extrvRegEstado   = { pagina: 1, busca: "", status: "", transportadora: "", cidade: "", completude: "", origem: "" };
let _extrvRegBuscaTmr = null;
let _extrvRegCodigoTmr = null;
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
    _extrvRegEstado.origem         = document.getElementById("extrvreg-f-origem").value;
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
    ["extrvreg-f-status", "extrvreg-f-transp", "extrvreg-f-cidade", "extrvreg-f-completude", "extrvreg-f-origem"]
        .forEach(id => { document.getElementById(id).value = ""; });
    _extrvRegEstado = { pagina: 1, busca: "", status: "", transportadora: "", cidade: "", completude: "", origem: "" };
    _extrvRegCarregar();
}

function _extrvRegIrPara(pagina) {
    _extrvRegEstado.pagina = pagina;
    _extrvRegCarregar();
    document.getElementById("tela-extravios-registros").scrollTo(0, 0);
}

/* ───────────────────────── Lista ───────────────────────── */

async function _extrvRegCarregar() {
    if (_extrvRegCarregando) return;
    _extrvRegCarregando = true;

    const alvo = document.getElementById("extrvreg-lista");
    alvo.innerHTML = `<div class="extrv-reg-carregando"><span class="extrv-reg-spinner"></span>Carregando registros...</div>`;

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
    const filtrado = dados.encontrados !== r.total;
    document.getElementById("extrvreg-resumo").innerHTML =
        `<span><b>${(filtrado ? dados.encontrados : r.total).toLocaleString("pt-BR")}</b> ` +
        `${filtrado ? "de " + r.total.toLocaleString("pt-BR") + " registros" : "registros"}</span>` +
        `<span class="pendente"><b>${r.incompletos.toLocaleString("pt-BR")}</b> a completar</span>`;

    const alvo = document.getElementById("extrvreg-lista");
    if (!dados.itens.length) {
        alvo.innerHTML = `<div class="extrv-reg-vazio">Nenhum registro encontrado com esses filtros.</div>`;
    } else {
        alvo.innerHTML =
            `<div class="extrv-reg-linha-item extrv-reg-cabecalho">
                <div>Código</div><div>Status</div><div>Origem</div><div>Falta preencher</div><div class="extrv-reg-num">Linha</div>
             </div>` +
            dados.itens.map(_extrvRegItemHtml).join("");
    }

    const nav = document.getElementById("extrvreg-paginacao");
    if (dados.paginas <= 1) {
        nav.innerHTML = "";
    } else {
        nav.innerHTML =
            `<button class="extrv-reg-acao" ${dados.pagina <= 1 ? "disabled" : ""} onclick="_extrvRegIrPara(${dados.pagina - 1})">Anterior</button>` +
            `<button class="extrv-reg-acao" ${dados.pagina >= dados.paginas ? "disabled" : ""} onclick="_extrvRegIrPara(${dados.pagina + 1})">Próxima</button>` +
            `<span>Página ${dados.pagina} de ${dados.paginas}</span>`;
    }
}

function _extrvRegItemHtml(r) {
    // Registro completo deixa a coluna vazia: silêncio já diz que não falta nada.
    const pendencia = r.faltando.length
        ? _extrvRegEsc(r.faltando.map(c => (EXTRVREG_CAMPOS_ROTULO[c] || c).toLowerCase()).join(", "))
        : "";

    const dup = String(r.duplicado || "").toUpperCase() === "DUPLICADO"
        ? `<span class="extrv-reg-dup">duplicado</span>` : "";

    return `
    <div class="extrv-reg-linha-item" data-linha="${r.linha}" onclick="_extrvRegAbrirModal(${r.linha})">
        <div class="extrv-reg-cod">${_extrvRegEsc(r.codigo || "sem código")}${dup}</div>
        <div class="extrv-reg-status">${_extrvRegEsc(r.status || "—")}</div>
        <div class="extrv-reg-origem">${r.origem === "sistema" ? "sistema" : "planilha"}</div>
        <div class="extrv-reg-pend">${pendencia}</div>
        <div class="extrv-reg-num">${r.linha}</div>
    </div>`;
}

/* ───────────────────────── Modal ───────────────────────── */

function _extrvRegRemoverOverlay() {
    const o = document.getElementById("extrvreg-overlay");
    if (o) o.remove();
}

/** Feedback imediato: o registro vem do servidor e pode demorar. */
function _extrvRegOverlayCarregando() {
    _extrvRegRemoverOverlay();
    const overlay = document.createElement("div");
    overlay.className = "extrv-reg-overlay";
    overlay.id = "extrvreg-overlay";
    overlay.innerHTML = `
        <div class="extrv-reg-modal extrv-reg-modal-carregando">
            <span class="extrv-reg-spinner"></span>
            <span>Carregando registro...</span>
        </div>`;
    document.body.appendChild(overlay);
}

async function _extrvRegAbrirModal(linha) {
    _extrvRegEditando = linha || null;

    if (!linha) {
        _extrvRegMontarModal(null);
        return;
    }

    const item = document.querySelector(`.extrv-reg-linha-item[data-linha="${linha}"]`);
    if (item) item.classList.add("abrindo");
    _extrvRegOverlayCarregando();

    try {
        const registro = await _extrvRegApi("/extravios/registros/" + linha);
        _extrvRegMontarModal(registro);
    } catch (err) {
        _extrvRegRemoverOverlay();
        _extrvRegEditando = null;
        gcAlert(err.message, "Extravios");
    } finally {
        if (item) item.classList.remove("abrindo");
    }
}

function _extrvRegMontarModal(r) {
    _extrvRegRemoverOverlay();

    const existente = r || {};
    const novo = !_extrvRegEditando;

    const obrigatorio = novo ? ' <i>(obrigatório)</i>' : "";
    const opcao = (lista, atual) =>
        ["<option value=\"\">Selecione...</option>"].concat(
            (lista || []).map(i => `<option value="${_extrvRegEsc(i)}"${String(i) === String(atual || "") ? " selected" : ""}>${_extrvRegEsc(i)}</option>`)
        ).join("");

    const autoria = existente.atualizadoEm || existente.usuario
        ? `<div class="extrv-reg-autoria">Última alteração: ${_extrvRegEsc(existente.atualizadoEm || "—")}${existente.usuario ? " por " + _extrvRegEsc(existente.usuario) : ""}</div>`
        : "";

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
            <button class="extrv-reg-fechar" onclick="_extrvRegFecharModal()">&times;</button>
        </div>

        <div class="extrv-reg-aviso" id="extrvreg-aviso"></div>

        <div class="extrv-reg-form">
            <div class="extrv-reg-campo c6">
                <label>Código ${obrigatorio}</label>
                <input type="text" id="extrvreg-codigo" value="${_extrvRegEsc(existente.codigo || "")}"
                       oninput="this.value=this.value.toUpperCase().replace(/\\s+/g,'');_extrvRegChecarCodigo()">
                <span class="extrv-reg-erro" data-erro="codigo"></span>
                <span class="extrv-reg-dica" id="extrvreg-dica-codigo"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Status ${obrigatorio}</label>
                <select id="extrvreg-status" onchange="_extrvRegChecarCodigo()">${opcao(_extrvRegOpcoes.status, existente.status)}</select>
                <span class="extrv-reg-erro" data-erro="status"></span>
            </div>

            <div class="extrv-reg-campo c6">
                <label>Transportadora ${obrigatorio}</label>
                <select id="extrvreg-transportadora">${opcao(_extrvRegOpcoes.transportadoras, existente.transportadora)}</select>
                <span class="extrv-reg-erro" data-erro="transportadora"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Cidade ${obrigatorio}</label>
                <input type="text" id="extrvreg-cidade" list="extrvreg-cidades" value="${_extrvRegEsc(existente.cidade || "")}" placeholder="Caçador, Videira...">
                <datalist id="extrvreg-cidades">${(_extrvRegOpcoes.cidades || []).map(c => `<option value="${_extrvRegEsc(c)}">`).join("")}</datalist>
                <span class="extrv-reg-erro" data-erro="cidade"></span>
            </div>

            <div class="extrv-reg-campo c3">
                <label>Data ${obrigatorio}</label>
                <input type="date" id="extrvreg-data" value="${_extrvRegEsc(existente.dataIso || "")}">
                <span class="extrv-reg-erro" data-erro="data"></span>
            </div>
            <div class="extrv-reg-campo c3">
                <label>Hora ${obrigatorio}</label>
                <input type="time" id="extrvreg-hora" value="${_extrvRegEsc(existente.horaIso || "")}">
                <span class="extrv-reg-erro" data-erro="hora"></span>
            </div>
            <div class="extrv-reg-campo c6">
                <label>Valor ${obrigatorio}</label>
                <input type="text" id="extrvreg-valor" value="${_extrvRegEsc(existente.valor || "")}" placeholder="R$ 0,00" oninput="_extrvRegMascaraValor(this)">
                <span class="extrv-reg-erro" data-erro="valor"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Responsável ${obrigatorio}</label>
                <input type="text" id="extrvreg-responsavel" list="extrvreg-responsaveis" value="${_extrvRegEsc(existente.responsavel || "")}" placeholder="Nome - Cidade">
                <datalist id="extrvreg-responsaveis">${(_extrvRegOpcoes.responsaveis || []).map(c => `<option value="${_extrvRegEsc(c)}">`).join("")}</datalist>
                <span class="extrv-reg-erro" data-erro="responsavel"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Endereço ${obrigatorio}</label>
                <input type="text" id="extrvreg-endereco" value="${_extrvRegEsc(existente.endereco || "")}" maxlength="250">
                <span class="extrv-reg-erro" data-erro="endereco"></span>
            </div>

            <div class="extrv-reg-campo c12">
                <label>Causa do problema ${obrigatorio}</label>
                <textarea id="extrvreg-causa" rows="2" maxlength="500">${_extrvRegEsc(existente.causa || "")}</textarea>
                <span class="extrv-reg-erro" data-erro="causa"></span>
            </div>
        </div>

        <div class="extrv-reg-modal-rodape">
            ${autoria}
            <button class="extrv-reg-acao" onclick="_extrvRegFecharModal()">Cancelar</button>
            <button class="extrv-reg-btn" id="extrvreg-salvar" onclick="_extrvRegSalvar()">
                ${novo ? "Registrar extravio" : "Salvar alterações"}
            </button>
        </div>
    </div>`;

    overlay.addEventListener("click", e => { if (e.target === overlay) _extrvRegFecharModal(); });
    document.body.appendChild(overlay);
    setTimeout(() => { const c = document.getElementById("extrvreg-codigo"); if (c && !_extrvRegEditando) c.focus(); }, 60);
}

function _extrvRegFecharModal() {
    _extrvRegRemoverOverlay();
    _extrvRegEditando = null;
    _extrvRegSalvando = false;
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

    clearTimeout(_extrvRegCodigoTmr);
    _extrvRegCodigoTmr = setTimeout(async () => {
        try {
            const q = new URLSearchParams({ status: document.getElementById("extrvreg-status").value });
            if (_extrvRegEditando) q.set("ignorarLinha", _extrvRegEditando);
            const r = await _extrvRegApi("/extravios/codigo/" + encodeURIComponent(codigo) + "?" + q.toString());

            if (!r.existe) {
                dica.textContent = "";
                dica.className = "extrv-reg-dica";
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
        causa:          document.getElementById("extrvreg-causa").value.trim()
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
    aviso.scrollIntoView({ block: "nearest" });
}

async function _extrvRegSalvar() {
    if (_extrvRegSalvando) return;

    const botao = document.getElementById("extrvreg-salvar");
    const rotuloOriginal = botao.textContent.trim();
    _extrvRegSalvando = true;
    botao.disabled = true;
    botao.innerHTML = `<span class="extrv-reg-spinner"></span>Salvando...`;

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

/* ───────────────────────── Exportar ───────────────────────── */

/**
 * Baixa em XLSX o conjunto inteiro do filtro atual — não só a página aberta.
 * Usa o SheetJS que o site já carrega, igual aos outros módulos.
 */
async function _extrvRegExportar() {
    const acao = document.getElementById("extrvreg-exportar");
    if (acao.disabled) return;

    const rotulo = acao.textContent;
    acao.disabled = true;
    acao.textContent = "Exportando...";

    try {
        const q = new URLSearchParams();
        Object.keys(_extrvRegEstado).forEach(k => {
            if (_extrvRegEstado[k] && k !== "pagina") q.set(k, _extrvRegEstado[k]);
        });
        q.set("todos", "1");

        const dados = await _extrvRegApi("/extravios/registros?" + q.toString());
        if (!dados.itens.length) {
            gcAlert("Nenhum registro para exportar com esses filtros.", "Extravios");
            return;
        }

        const linhas = dados.itens.map(r => ({
            "Código": r.codigo,
            "Status": r.status,
            "Transportadora": r.transportadora,
            "Data": r.data,
            "Hora": r.hora,
            "Cidade": r.cidade,
            "Duplicado?": r.duplicado,
            "Valor": r.valor,
            "Responsável": r.responsavel,
            "Endereço": r.endereco,
            "Causa do problema": r.causa,
            "Data desconto": r.dataDesconto,
            "Para desconto?": r.paraDesconto,
            "Última atualização": r.atualizadoEm,
            "Usuário": r.usuario,
            "Origem": r.origem === "sistema" ? "Sistema" : "Planilha",
            "Falta preencher": r.faltando.map(c => (EXTRVREG_CAMPOS_ROTULO[c] || c).toLowerCase()).join(", "),
            "Linha": r.linha
        }));

        const planilha = XLSX.utils.json_to_sheet(linhas);
        const arquivo = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(arquivo, planilha, "Extravios");

        const hoje = new Date();
        const carimbo = hoje.getFullYear() + "-" +
            String(hoje.getMonth() + 1).padStart(2, "0") + "-" +
            String(hoje.getDate()).padStart(2, "0");
        XLSX.writeFile(arquivo, "extravios_" + carimbo + ".xlsx");
    } catch (err) {
        gcAlert(err.message, "Extravios");
    } finally {
        acao.disabled = false;
        acao.textContent = rotulo;
    }
}
