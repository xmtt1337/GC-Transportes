// ───── DADOS DE PAGAMENTO DO ENTREGADOR ─────
// Substitui o Google Forms: o entregador preenche nome completo, CPF, CNPJ (opcional),
// WhatsApp, e-mail e chave Pix aqui mesmo. O servidor (modules/dados-pagamento) valida,
// grava na tabela que o pagamento da quinzena lê e copia pra planilha.
//
// Pontos de entrada:
//   - o aviso na tela inicial, pra quem ainda não tem os dados completos (core.js chama
//     dpgCarregarAviso() só pro entregador);
//   - a tela "Configurações de pagamento" (menu Pagamentos, e o atalho no card do perfil):
//     mostra os dados, o status da solicitação de alteração e o botão pra pedir mudança.
//
// Preencher o que está vazio grava na hora. MUDAR um dado que já existe vira solicitação:
// só vale quando o suporte aprova no Atendimento — até lá a tela mostra "aguardando".
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

let _dpgEstado = null; // { aplica, completo, dados, solicitacao } — última resposta do servidor

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
    _dpgAtualizarBloqueio();
}

// ── Bloqueio: sem chave Pix, nada mais funciona ──
// Pedido do usuário (05/11/2026): quem não tem chave Pix registrada não usa o sistema sem
// preencher. A tela fica coberta por um cartão sem fechar (sem X, sem Esc, sem clique fora);
// o formulário e os alertas abrem POR CIMA dele (entram depois no body, mesmo z-index).
// Solicitação pendente libera: a pessoa já mandou a chave, só falta a aprovação.

/** Precisa bloquear? Exportada pros testes. */
function dpgPrecisaBloquear(estado) {
    if (!estado || !estado.aplica) return false;
    if (estado.dados && String(estado.dados.chave_pix || "").trim()) return false;
    return !(estado.solicitacao && estado.solicitacao.status === "pendente");
}

/** Cartão do bloqueio. Exportada pros testes. */
function dpgHtmlBloqueio() {
    return `
        <div class="dpg-bloqueio-card" role="alertdialog" aria-modal="true" aria-labelledby="dpg-bloqueio-titulo">
            <div class="dpg-aviso-titulo" id="dpg-bloqueio-titulo">Cadastre sua chave Pix para continuar</div>
            <div class="dpg-aviso-texto">Ainda não temos a sua chave Pix registrada, e sem ela não conseguimos pagar a sua quinzena. Preencha seus dados de pagamento para continuar usando o sistema — leva menos de um minuto.</div>
            <div class="dpg-bloqueio-acoes">
                <button type="button" style="${_gcBtnOkStyle}" data-dpg="preencher">Preencher meus dados</button>
                <button type="button" class="dpg-bloqueio-sair" data-dpg="sair">Sair</button>
            </div>
        </div>`;
}

function _dpgAtualizarBloqueio() {
    const atual = document.getElementById("dpg-bloqueio");
    if (!dpgPrecisaBloquear(_dpgEstado)) { if (atual) atual.remove(); return; }
    if (atual) return;
    const overlay = document.createElement("div");
    overlay.id = "dpg-bloqueio";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = dpgHtmlBloqueio();
    overlay.querySelector("[data-dpg=preencher]").addEventListener("click", () => dpgAbrirFormulario());
    overlay.querySelector("[data-dpg=sair]").addEventListener("click", () => { overlay.remove(); logout(); });
    document.body.appendChild(overlay);
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

function dpgHtmlFormulario(d, temDados) {
    d = d || {};
    const intro = temDados
        ? "Mudanças em dados que já temos (chave Pix, CPF, telefone...) passam por aprovação: seus dados só mudam depois que forem confirmados. Campo vazio que você preencher vale na hora."
        : "Usamos estes dados para pagar sua quinzena. Confira com atenção: o Pix vai para a chave informada aqui.";
    return `
        <div class="dpg-intro">${intro}</div>
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
    // Sem chave Pix é preenchimento (vale na hora), mesmo com nome/telefone vindos da planilha.
    const temDados = !!atual.chave_pix;
    const titulo = temDados ? "Solicitar alteração dos dados de pagamento" : "Preencha seus dados de pagamento";
    _pcDialogo(titulo, dpgHtmlFormulario(atual, temDados), dlg => {
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
                dlg.fechar();
                if (r.d.solicitado) {
                    // Nada mudou ainda: os dados seguem os de antes até a aprovação.
                    _dpgEstado = { ..._dpgEstado, aplica: true, solicitacao: r.d.solicitacao };
                    gcAlert("Sua solicitação foi enviada. Os dados só mudam depois que forem aprovados — até lá o pagamento usa os dados atuais. Acompanhe o status em Pagamentos › Configurações de pagamento.", "Solicitação enviada");
                } else {
                    _dpgEstado = { ..._dpgEstado, aplica: true, completo: true, dados: r.d.dados };
                    gcAlert("Seus dados de pagamento foram salvos. Para mudar depois, vá em Pagamentos › Configurações de pagamento.", "Dados salvos");
                }
                _dpgDesenharAviso();
                _dpgDesenharConfig();
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, "Salvar"); }
        };
        dlg.ok.addEventListener("click", enviar);
        dlg.overlay.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); }));
    });
}

// ── Tela "Configurações de pagamento" ──

const _dpgData = d => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

function abrirConfigPagamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-config-pagamento");
    const el = document.getElementById("cpg-conteudo");
    if (_dpgEstado) _dpgDesenharConfig();
    dpgCarregar()
        .then(() => { _dpgDesenharConfig(); _dpgDesenharAviso(); })
        .catch(() => { if (el && !_dpgEstado) el.innerHTML = `<div class="cpg-erro">Não foi possível carregar seus dados. Tente de novo.</div>`; });
}

function _dpgDesenharConfig() {
    const el = document.getElementById("cpg-conteudo");
    if (!el || !_dpgEstado) return;
    el.innerHTML = dpgHtmlConfig(_dpgEstado);
    const btn = el.querySelector("[data-cpg='alterar']");
    if (btn) btn.addEventListener("click", () => dpgAbrirFormulario());
}

/**
 * Lista "Campo: antes → depois" de uma solicitação, com a máscara de cada campo. A chave
 * usa o tipo do mesmo lado (o de antes no "antes", o novo no "depois"); se o tipo não
 * mudou, o tipo atual.
 */
function _dpgHtmlMudancas(mudancas, tipoAtual) {
    const mudouTipo = (mudancas || []).find(m => m.campo === "tipo_pix");
    const tipoDe = lado => (mudouTipo ? mudouTipo[lado] : tipoAtual);
    return (mudancas || []).map(m => {
        const fmt = (v, lado) => {
            if (!v) return v;
            if (m.campo === "tipo_pix") return dpgRotuloTipo(v) || v;
            if (m.campo === "cpf") return dpgMascaraCpf(v);
            if (m.campo === "cnpj") return dpgMascaraCnpj(v);
            if (m.campo === "whatsapp") return dpgMascaraTelefone(v);
            if (m.campo === "chave_pix") return dpgChaveLegivel(tipoDe(lado), v);
            return v;
        };
        const antes = m.antes ? `<span class="cpg-antes">${_gcEsc(fmt(m.antes, "antes"))}</span> → ` : "";
        return `<div><span class="cpg-mud-campo">${_gcEsc(m.rotulo || m.campo)}:</span> ${antes}${_gcEsc(fmt(m.depois, "depois") || "vazio")}</div>`;
    }).join("");
}

/** Cartão do status da última solicitação. Exportada pros testes. */
function dpgHtmlStatusSolicitacao(s, tipoAtual) {
    if (!s) return "";
    const cfg = {
        pendente:  { cls: "pendente",  titulo: "Alteração solicitada — aguardando aprovação",
                     texto: `Enviada em ${_dpgData(s.criado_em)}. Seus dados só mudam depois de aprovados; até lá o pagamento usa os dados abaixo.` },
        aprovado:  { cls: "aprovado",  titulo: "Alteração aprovada",
                     texto: `Aprovada em ${_dpgData(s.decidido_em)}. Os dados abaixo já são os novos.` },
        recusado:  { cls: "recusado",  titulo: "Alteração recusada",
                     texto: `Recusada em ${_dpgData(s.decidido_em)}. Seus dados continuam como estavam. Se precisar, fale com o suporte pelo atendimento.` },
    }[s.status];
    if (!cfg) return "";
    return `
        <div class="cpg-status cpg-status-${cfg.cls}" role="status">
            <div class="cpg-status-titulo">${cfg.titulo}</div>
            <div class="cpg-status-texto">${_gcEsc(cfg.texto)}</div>
            <div class="cpg-mudancas">${_dpgHtmlMudancas(s.mudancas, tipoAtual)}</div>
        </div>`;
}

/** Conteúdo da tela. Exportada pros testes. */
function dpgHtmlConfig(estado) {
    if (!estado || !estado.aplica) return `<div class="cpg-erro">Seu cargo não usa dados de pagamento.</div>`;
    const d = estado.dados || {};
    const temDados = !!d.chave_pix;
    const vazio = `<span class="cpg-vazio">não informado</span>`;
    // Opcional vazio (CNPJ) fica neutro; obrigatório vazio fica em âmbar.
    const linha = (rotulo, valor, opcional) => `
        <div class="cpg-linha"><div class="cpg-rotulo">${rotulo}</div><div class="cpg-valor">${valor ? _gcEsc(valor) : opcional ? `<span class="cad-vazio">—</span>` : vazio}</div></div>`;
    const pendente = estado.solicitacao && estado.solicitacao.status === "pendente";
    const botao = !temDados ? "Preencher meus dados" : pendente ? "Mudar a solicitação" : "Solicitar alteração";
    return `
        ${dpgHtmlStatusSolicitacao(estado.solicitacao, d.tipo_pix)}
        <div class="cpg-card">
            <div class="cpg-card-hd">Dados atuais</div>
            ${linha("Nome completo", d.nome)}
            ${linha("CPF", dpgMascaraCpf(d.cpf))}
            ${linha("CNPJ (opcional)", d.cnpj ? dpgMascaraCnpj(d.cnpj) : "", true)}
            ${linha("WhatsApp", dpgMascaraTelefone(d.whatsapp))}
            ${linha("E-mail", d.email)}
            ${linha("Tipo da chave", dpgRotuloTipo(d.tipo_pix))}
            ${linha("Chave Pix", dpgChaveLegivel(d.tipo_pix, d.chave_pix))}
            ${temDados && !estado.completo ? `<div class="dpg-falta cpg-falta">${_gcEsc(dpgTextoFaltando(d))}</div>` : ""}
        </div>
        <button type="button" class="cpg-btn" data-cpg="alterar">${botao}</button>`;
}

// ── Atalho no card do perfil (nav.js) ──

function dpgSecaoPerfil(estado) {
    if (!estado || !estado.aplica) return "";
    const d = estado.dados || {};
    // A chave aparece mesmo com o cadastro incompleto ("Pendente" ali parecia dizer que a
    // chave não existia); o que falta e a solicitação em análise vêm embaixo, em âmbar.
    const chave = dpgChaveLegivel(d.tipo_pix, d.chave_pix);
    const tipo = dpgRotuloTipo(d.tipo_pix);
    const valor = chave
        ? `<div class="pc-conta-valor" title="${_gcEsc(chave)}">${tipo ? _gcEsc(tipo) + " · " : ""}${_gcEsc(chave)}</div>`
        : `<div class="pc-conta-valor dpg-pendente">Pendente</div>`;
    const s = estado.solicitacao;
    const extra = s && s.status === "pendente"
        ? `<div class="dpg-falta">Alteração aguardando aprovação</div>`
        : chave && !estado.completo ? `<div class="dpg-falta">${_gcEsc(dpgTextoFaltando(d))}</div>` : "";
    return `
        <div class="pc-section">
            <div class="pc-section-hd">Pagamento</div>
            <button type="button" class="dpg-perfil-link" data-pc="pagamento">
                <div style="min-width:0">
                    <div class="pc-conta-rotulo">Configurações de pagamento</div>
                    ${valor}
                    ${extra}
                </div>
                <span class="dpg-perfil-seta" aria-hidden="true">›</span>
            </button>
        </div>`;
}
