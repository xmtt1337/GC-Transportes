// ───── DADOS DE PAGAMENTO DO ENTREGADOR ─────
// Substitui o Google Forms: o entregador preenche nome completo, CPF, CNPJ (opcional),
// WhatsApp, e-mail e chave Pix aqui mesmo. O servidor (modules/dados-pagamento) valida,
// grava na tabela que o pagamento da quinzena lê e copia pra planilha.
//
// Dois pontos de entrada:
//   - o aviso na tela inicial, pra quem ainda não tem os dados completos (core.js chama
//     dpgCarregarAviso() só pro entregador);
//   - a seção "Pagamento" do card do perfil (nav.js), pra conferir e editar depois.
//
// A validação de verdade é a do servidor: ele devolve a frase e o `campo` que errou, e o
// formulário só marca esse campo. Aqui só formata enquanto digita.

const DPG_TIPOS = [
    { valor: "cpf",       rotulo: "CPF" },
    { valor: "telefone",  rotulo: "Telefone" },
    { valor: "aleatorio", rotulo: "Aleatória" },
    { valor: "email",     rotulo: "E-mail" },
    { valor: "cnpj",      rotulo: "CNPJ" },
];

let _dpgEstado = null; // { aplica, completo, dados } — última resposta do servidor

const _dpgDigitos = v => String(v || "").replace(/\D/g, "");

function dpgMascaraCpf(v) {
    const d = _dpgDigitos(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function dpgMascaraTelefone(v) {
    let d = _dpgDigitos(v);
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// CNPJ pode ter letra (formato novo da Receita), então a máscara não joga letra fora.
function dpgMascaraCnpj(v) {
    const c = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
    if (c.length <= 2) return c;
    if (c.length <= 5) return `${c.slice(0, 2)}.${c.slice(2)}`;
    if (c.length <= 8) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
    if (c.length <= 12) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** A chave como a pessoa reconhece: CPF/telefone/CNPJ com máscara, o resto como está. */
function dpgChaveLegivel(tipo, chave) {
    if (!chave) return "";
    if (tipo === "cpf") return dpgMascaraCpf(chave);
    if (tipo === "telefone") return dpgMascaraTelefone(chave);
    if (tipo === "cnpj") return dpgMascaraCnpj(chave);
    return chave;
}

const dpgRotuloTipo = tipo => (DPG_TIPOS.find(t => t.valor === tipo) || {}).rotulo || "";

/**
 * Quais campos obrigatórios estão vazios, com o nome que o formulário usa. Lista vazia com
 * cadastro incompleto = tudo preenchido, mas algo inválido (CPF, nome sem sobrenome...).
 */
function dpgFaltando(d) {
    d = d || {};
    const campos = [
        ["nome", "nome completo"], ["cpf", "CPF"], ["whatsapp", "WhatsApp"],
        ["email", "e-mail"], ["tipo_pix", "tipo da chave"], ["chave_pix", "chave Pix"],
    ];
    return campos.filter(([k]) => !String(d[k] || "").trim()).map(([, rotulo]) => rotulo);
}

/** "Falta o e-mail." / "Faltam CPF e e-mail." / "Confira seus dados." */
function dpgTextoFaltando(d) {
    const f = dpgFaltando(d);
    if (!f.length) return "Confira seus dados.";
    if (f.length === 1) return `Falta ${f[0] === "chave Pix" ? "a" : "o"} ${f[0]}.`;
    return `Faltam ${f.slice(0, -1).join(", ")} e ${f[f.length - 1]}.`;
}

// ── Aviso na tela inicial ──

/** HTML do aviso. Vazio quando não precisa (outro cargo ou dados completos). */
function dpgHtmlAviso(estado) {
    if (!estado || !estado.aplica || estado.completo) return "";
    const temChave = !!(estado.dados && estado.dados.chave_pix);
    const texto = temChave
        ? `Sua chave Pix já está com a gente, mas o cadastro de pagamento está incompleto. ${dpgTextoFaltando(estado.dados)} Complete para receber a quinzena sem atraso.`
        : "Notamos que ainda não temos seus dados de pagamento em nosso registro. Preencha o formulário para receber a quinzena sem atraso.";
    return `
        <div class="dpg-aviso" role="status">
            <div class="dpg-aviso-titulo">${temChave ? "Complete seus dados de pagamento" : "Dados de pagamento pendentes"}</div>
            <div class="dpg-aviso-texto">${texto}</div>
            <button type="button" class="dpg-aviso-btn" onclick="dpgAbrirFormulario()">${temChave ? "Conferir e completar" : "Preencher meus dados"}</button>
        </div>`;
}

function _dpgDesenharAviso() {
    const el = document.getElementById("home-dados-pagamento");
    if (el) el.innerHTML = dpgHtmlAviso(_dpgEstado);
}

async function dpgCarregar() {
    const r = await fetch(API + "/meus-dados-pagamento", { headers: { "Authorization": "Bearer " + token } });
    if (!r.ok) throw new Error(r.status);
    _dpgEstado = await r.json();
    return _dpgEstado;
}

// Falhar aqui não pode quebrar a entrada do entregador: sem resposta, o aviso só não aparece.
function dpgCarregarAviso() {
    dpgCarregar().then(_dpgDesenharAviso).catch(() => {});
}

// ── Formulário ──

function _dpgCampo(id, rotulo, valor, extra) {
    return `
        <div class="dpg-campo" data-campo="${id}">
            <label class="pc-dlg-label" for="dpg-${id}">${rotulo}</label>
            <input id="dpg-${id}" class="pc-dlg-input" value="${_gcEsc(valor || "")}" ${extra || ""}>
        </div>`;
}

function dpgHtmlFormulario(d) {
    d = d || {};
    return `
        <div class="dpg-intro">Usamos estes dados para pagar sua quinzena. Confira com atenção: o Pix vai para a chave informada aqui.</div>
        ${_dpgCampo("nome", "Nome completo", d.nome, `autocomplete="name" maxlength="120" placeholder="Nome e sobrenome"`)}
        <div class="dpg-linha">
            ${_dpgCampo("cpf", "CPF", dpgMascaraCpf(d.cpf), `inputmode="numeric" maxlength="14" placeholder="000.000.000-00"`)}
            ${_dpgCampo("cnpj", "CNPJ (opcional)", dpgMascaraCnpj(d.cnpj), `maxlength="18" placeholder="00.000.000/0000-00"`)}
        </div>
        <div class="dpg-linha">
            ${_dpgCampo("whatsapp", "WhatsApp", dpgMascaraTelefone(d.whatsapp), `inputmode="tel" autocomplete="tel" maxlength="16" placeholder="(00) 00000-0000"`)}
            ${_dpgCampo("email", "E-mail", d.email, `type="email" autocomplete="email" maxlength="150" placeholder="voce@exemplo.com"`)}
        </div>
        <div class="dpg-campo" data-campo="tipo_pix">
            <label class="pc-dlg-label" for="dpg-tipo_pix">Tipo da chave Pix</label>
            <select id="dpg-tipo_pix" class="pc-dlg-input">
                <option value="">Escolha...</option>
                ${DPG_TIPOS.map(t => `<option value="${t.valor}"${t.valor === d.tipo_pix ? " selected" : ""}>${t.rotulo}</option>`).join("")}
            </select>
        </div>
        ${_dpgCampo("chave_pix", "Chave Pix", dpgChaveLegivel(d.tipo_pix, d.chave_pix), `maxlength="150" autocomplete="off"`)}`;
}

/** Chave sugerida quando o tipo muda: o mesmo dado que a pessoa já digitou acima. */
function dpgSugestaoChave(tipo, valores) {
    if (tipo === "cpf") return valores.cpf || "";
    if (tipo === "cnpj") return valores.cnpj || "";
    if (tipo === "telefone") return valores.whatsapp || "";
    if (tipo === "email") return valores.email || "";
    return "";
}

function dpgAbrirFormulario() {
    const atual = (_dpgEstado && _dpgEstado.dados) || {};
    const editando = !!(_dpgEstado && _dpgEstado.completo);
    _pcDialogo(editando ? "Dados de pagamento" : "Preencha seus dados de pagamento", dpgHtmlFormulario(atual), dlg => {
        // O card padrão do diálogo tem 420px; com 7 campos precisa de mais largura e rolar
        // dentro da tela no celular.
        const card = dlg.overlay.firstElementChild;
        card.classList.add("dpg-dialogo");
        const $ = id => dlg.overlay.querySelector("#dpg-" + id);
        const mascaras = { cpf: dpgMascaraCpf, cnpj: dpgMascaraCnpj, whatsapp: dpgMascaraTelefone };
        Object.entries(mascaras).forEach(([id, fn]) => $(id).addEventListener("input", () => { $(id).value = fn($(id).value); }));

        const valores = () => ({
            nome: $("nome").value, cpf: $("cpf").value, cnpj: $("cnpj").value, whatsapp: $("whatsapp").value,
            email: $("email").value, tipo_pix: $("tipo_pix").value, chave_pix: $("chave_pix").value,
        });
        const placeholderChave = {
            cpf: "000.000.000-00", telefone: "(00) 00000-0000", email: "voce@exemplo.com",
            cnpj: "00.000.000/0000-00", aleatorio: "Cole a chave inteira, com os tracinhos",
        };
        let tipoAnterior = $("tipo_pix").value;
        $("tipo_pix").addEventListener("change", () => {
            const tipo = $("tipo_pix").value;
            $("chave_pix").placeholder = placeholderChave[tipo] || "";
            // Só troca a chave se ela estava vazia ou era a sugestão do tipo anterior —
            // nunca apaga uma chave digitada à mão.
            const v = valores();
            const eraSugestao = $("chave_pix").value === dpgSugestaoChave(tipoAnterior, v);
            if (!$("chave_pix").value || eraSugestao) $("chave_pix").value = dpgSugestaoChave(tipo, v);
            tipoAnterior = tipo;
        });
        $("chave_pix").placeholder = placeholderChave[tipoAnterior] || "";
        $("chave_pix").addEventListener("input", () => {
            const tipo = $("tipo_pix").value;
            if (mascaras[tipo === "telefone" ? "whatsapp" : tipo]) {
                $("chave_pix").value = mascaras[tipo === "telefone" ? "whatsapp" : tipo]($("chave_pix").value);
            }
        });

        const marcar = campo => {
            dlg.overlay.querySelectorAll(".dpg-campo").forEach(el => el.classList.toggle("dpg-erro", el.dataset.campo === campo));
            if (campo && $(campo)) $(campo).focus();
        };

        dlg.ocupado(false, "Salvar");
        const enviar = async () => {
            dlg.erro(""); marcar(null); dlg.ocupado(true, "Salvando...");
            try {
                const r = await _pcPost("/meus-dados-pagamento", valores(), "PUT");
                if (!r.ok) { dlg.erro(r.d.error || "Não foi possível salvar."); marcar(r.d.campo); return; }
                _dpgEstado = { aplica: true, completo: true, dados: r.d.dados };
                _dpgDesenharAviso();
                dlg.fechar();
                gcAlert("Seus dados de pagamento foram salvos. Para mudar depois, clique no seu nome no topo da tela.", "Dados salvos");
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, "Salvar"); }
        };
        dlg.ok.addEventListener("click", enviar);
        dlg.overlay.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); }));
    });
}

// ── Seção do card do perfil (nav.js) ──

function dpgSecaoPerfil(estado) {
    if (!estado || !estado.aplica) return "";
    const d = estado.dados || {};
    // Com chave, a chave aparece mesmo com o cadastro incompleto ("Pendente" ali parecia
    // dizer que a chave não existia); o que falta vem embaixo, em âmbar.
    const chave = dpgChaveLegivel(d.tipo_pix, d.chave_pix);
    const tipo = dpgRotuloTipo(d.tipo_pix);
    const valor = chave
        ? `<div class="pc-conta-valor" title="${_gcEsc(chave)}">${tipo ? _gcEsc(tipo) + " · " : ""}${_gcEsc(chave)}</div>` +
          (estado.completo ? "" : `<div class="dpg-falta">${_gcEsc(dpgTextoFaltando(d))}</div>`)
        : `<div class="pc-conta-valor dpg-pendente">Pendente</div>`;
    return `
        <div class="pc-section">
            <div class="pc-section-hd">Pagamento</div>
            <div class="pc-conta-row">
                <div style="min-width:0">
                    <div class="pc-conta-rotulo">Chave Pix</div>
                    ${valor}
                </div>
                <button type="button" class="pc-conta-link" data-pc="pagamento">${estado.completo ? "Editar" : chave ? "Completar" : "Preencher"}</button>
            </div>
        </div>`;
}
