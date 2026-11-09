// ───── CADASTROS > DADOS ENTREGADORES ─────
// A planilha "Dados entregadores/CLT's" dentro do banco (tabela dados_entregadores), com as
// colunas nos mesmos nomes dela, junto com o que os entregadores preencheram pelo formulário
// de pagamento (dados-pagamento.js). Daqui sai o telefone dos avisos e a chave Pix do
// pagamento — a planilha virou só a origem da importação.
//
// "Importar da planilha" relê a planilha e grava: linha nova entra, linha só da planilha é
// atualizada, e o que o entregador preencheu pelo sistema não é sobrescrito.

let _deLinhas = [];

function abrirDadosEntregadores(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (!["admin", "finance", "dev"].includes(role)) {
        gcAlert("Só admin, financeiro e dev veem os dados dos entregadores.");
        return;
    }
    mostrarTela("tela-dados-entregadores");
    document.getElementById("de-busca").value = "";
    document.getElementById("de-so-respostas").checked = false;
    document.getElementById("de-so-sem-pix").checked = false;
    _deTrocarAba("todos");
}

// ── Abas: Todos (a tabela) | Novos dados (o histórico: quem mudou o quê e quando) ──
let _deAba = "todos";

function deMostrarAba(event, aba) {
    if (event) event.preventDefault();
    _deTrocarAba(aba);
}

function _deTrocarAba(aba) {
    _deAba = aba;
    const novos = aba === "novos";
    document.getElementById("de-aba-todos").classList.toggle("ativa", !novos);
    document.getElementById("de-aba-novos").classList.toggle("ativa", novos);
    document.querySelector("#tela-dados-entregadores .cad-botoes").style.display = novos ? "none" : "";
    document.getElementById("de-hist-filtros").style.display = novos ? "" : "none";
    ["de-empty", "de-resultado", "de-hist-empty", "de-hist-resultado"].forEach(id => {
        document.getElementById(id).style.display = "none";
    });
    _dePeriodoFechar();
    if (novos) { _deHistCarregar(); _deDiasCarregar(); }
    else _deCarregar();
}

function _deEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const _deData = d => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

function _deCarregar() {
    const empty = document.getElementById("de-empty");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    document.getElementById("de-resultado").style.display = "none";
    fetch(API + "/admin/dados-entregadores", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) { skFim(empty, d.error || "Erro ao carregar."); return; }
            _deLinhas = d.linhas || [];
            _dePintarResumo(d.ultima_importacao);
            _deFiltrar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _dePintarResumo(ultima) {
    const total = _deLinhas.length;
    const respostas = _deLinhas.filter(l => l.preenchido_em).length;
    const semPix = _deLinhas.filter(l => !l.chave_pix).length;
    document.getElementById("de-resumo").innerText = total
        ? `${total.toLocaleString("pt-BR")} entregador${total !== 1 ? "es" : ""} · ${respostas} preencheram pelo sistema · ${semPix} sem chave Pix` +
          (ultima ? ` · planilha importada em ${_deData(ultima)}` : "")
        : "";
}

/** Linhas que passam pela busca e pelas caixinhas. Exportada pros testes. */
function deFiltrarLinhas(linhas, { busca, soRespostas, soSemPix }) {
    const alvo = String(busca || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return linhas.filter(l => {
        if (soRespostas && !l.preenchido_em) return false;
        if (soSemPix && l.chave_pix) return false;
        if (!alvo) return true;
        const texto = [l.id_interno, l.usuarios, l.nome, l.telefone, l.documento, l.cpf, l.cnpj, l.chave_pix, l.email, l.login]
            .join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        return texto.includes(alvo);
    });
}

/** Coluna Origem: de onde veio e, se o entregador preencheu, quando — e se a planilha ficou sem a cópia. */
function deHtmlOrigem(l) {
    if (!l.preenchido_em) return `<span class="de-origem">Planilha${l.linha_planilha ? ` · linha ${l.linha_planilha}` : ""}</span>`;
    const aviso = l.planilha_erro
        ? `<div class="de-pendente" title="${_deEsc(l.planilha_erro)}">não copiado pra planilha</div>`
        : "";
    return `<span class="de-origem-entregador">Entregador</span> <span class="de-origem">${_deEsc(_deData(l.preenchido_em))}</span>${aviso}`;
}

// O formulário grava só os dígitos; a planilha tem de tudo. Na tela, número puro ganha a
// máscara de sempre — o que já vier formatado (ou fora do padrão) aparece como está.
function deFormatar(campo, v) {
    const s = String(v ?? "").trim();
    if (!/^\d+$/.test(s)) return s;
    if (campo === "telefone" && s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
    if (campo === "telefone" && s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
    if (s.length === 11 && campo === "documento") return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
    if (s.length === 14 && (campo === "documento" || campo === "cnpj")) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
    return s;
}

// Tipo gravado pelo formulário ("email", "aleatorio") aparece como na planilha se escreve.
const _DE_TIPOS = { cpf: "CPF", telefone: "Telefone", aleatorio: "Aleatória", aleatoria: "Aleatória", email: "E-mail", "e-mail": "E-mail", cnpj: "CNPJ" };

function deHtmlLinha(l) {
    const vazio = `<span class="cad-vazio">—</span>`;
    const c = v => (v ? _deEsc(v) : vazio);
    // Coluna de texto comprido: corta em "…" na tela e o title guarda o valor inteiro.
    const t = v => (v ? ` title="${_deEsc(v)}"` : "");
    return `
        <tr>
            <td class="cad-num" data-rotulo="ID">${c(l.id_interno)}</td>
            <td class="cad-nome de-corta" data-rotulo="Usuarios"${t(l.usuarios)}>${c(l.usuarios)}</td>
            <td class="cad-num" data-rotulo="Telefone">${c(deFormatar("telefone", l.telefone))}</td>
            <td class="de-corta" data-rotulo="Nome"${t(l.nome)}>${c(l.nome)}</td>
            <td class="cad-num" data-rotulo="Documento">${c(deFormatar("documento", l.documento))}</td>
            <td class="cad-num" data-rotulo="CPF">${c(deFormatar("documento", l.cpf))}</td>
            <td class="cad-num" data-rotulo="CNPJ">${c(deFormatar("cnpj", l.cnpj))}</td>
            <td class="de-corta" data-rotulo="Chave Pix"${t(l.chave_pix)}>${l.chave_pix ? _deEsc(l.chave_pix) : `<span class="de-pendente">sem chave</span>`}</td>
            <td data-rotulo="Tipo Chave Pix">${c(_DE_TIPOS[String(l.tipo_chave_pix || "").toLowerCase()] || l.tipo_chave_pix)}</td>
            <td class="de-corta" data-rotulo="E-mail"${t(l.email)}>${c(l.email)}</td>
            <td class="cad-data" data-rotulo="Origem">${deHtmlOrigem(l)}</td>
        </tr>`;
}

function _deFiltrar() {
    const empty = document.getElementById("de-empty");
    const linhas = deFiltrarLinhas(_deLinhas, {
        busca: document.getElementById("de-busca").value,
        soRespostas: document.getElementById("de-so-respostas").checked,
        soSemPix: document.getElementById("de-so-sem-pix").checked,
    });
    if (!linhas.length) {
        skFim(empty, _deLinhas.length ? "Ninguém encontrado com esse filtro." : "Nenhum dado ainda. Use Importar da planilha.");
        document.getElementById("de-resultado").style.display = "none";
        return;
    }
    empty.style.display = "none";
    document.getElementById("de-resultado").style.display = "";
    document.getElementById("de-tbody").innerHTML = linhas.map(deHtmlLinha).join("");
}

/** Texto do resultado da importação. Exportada pros testes. */
function deTextoImportacao(r) {
    const partes = [
        `${r.novos} novo${r.novos !== 1 ? "s" : ""}`,
        `${r.atualizados} atualizado${r.atualizados !== 1 ? "s" : ""}`,
        `${r.sem_mudanca} sem mudança`,
    ];
    let txt = `${r.linhas_planilha} linhas lidas da planilha: ${partes.join(", ")}.`;
    if (r.emails_do_login) txt += `\n${r.emails_do_login} e-mail${r.emails_do_login !== 1 ? "s" : ""} copiado${r.emails_do_login !== 1 ? "s" : ""} do login de quem não tinha.`;
    if (r.preservados) txt += `\n${r.preservados} já preenchido${r.preservados !== 1 ? "s" : ""} pelo entregador: o que ele escreveu foi mantido.`;
    if (r.cabecalho && r.cabecalho.length) txt += `\n\nColunas da planilha: ${r.cabecalho.filter(Boolean).join(", ")}.`;
    return txt;
}

function deImportar() {
    gcConfirm("Ler a planilha \"Dados entregadores/CLT's\" agora e atualizar os dados? O que os entregadores preencheram pelo sistema não é sobrescrito.", async () => {
        const btn = document.getElementById("de-importar");
        btn.disabled = true; btn.innerText = "Importando...";
        try {
            const r = await fetch(API + "/admin/dados-entregadores/importar", {
                method: "POST", headers: { "Authorization": "Bearer " + token },
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                let msg = d.error || "Não foi possível importar.";
                if (d.amostra_planilha) msg += "\n\nPrimeiras linhas lidas:\n" + d.amostra_planilha.map(l => JSON.stringify(l)).join("\n");
                gcAlert(_deEsc(msg));
                return;
            }
            gcAlert(_deEsc(deTextoImportacao(d)), "Importação concluída");
            _deTrocarAba(_deAba);
        } catch { gcAlert("Erro ao conectar com o servidor."); }
        finally { btn.disabled = false; btn.innerText = "Importar da planilha"; }
    }, "Importar da planilha", "Importar");
}

// ───── NOVOS DADOS ─────
// Cada cadastro novo ou alteração em dados_entregadores, com quem fez e quando: o
// entregador pelo formulário de pagamento, ou quem clicou em Importar da planilha.

let _deHist = [];
let _deRotulos = {};

function _deHistCarregar() {
    const empty = document.getElementById("de-hist-empty");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    document.getElementById("de-hist-resultado").style.display = "none";
    // Período do calendário da tela; na primeira vez, os últimos 30 dias.
    if (!_deCals.tela.ini) {
        const hoje = _deHoje();
        const ini = new Date(hoje); ini.setDate(ini.getDate() - 29);
        _deCalIniciar("tela", ini, hoje);
    }
    _dePeriodoBotao();
    const de = _deFmtDia(_deCals.tela.ini), ate = _deFmtDia(_deCals.tela.fim || _deCals.tela.ini);
    fetch(`${API}/admin/dados-entregadores/historico?de=${de}&ate=${ate}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) { skFim(empty, d.error || "Erro ao carregar."); return; }
            _deHist = d.registros || [];
            _deRotulos = d.rotulos || {};
            _deHistResumo();
            _deHistFiltrar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _deHistResumo() {
    const novos = _deHist.filter(h => h.tipo === "novo").length;
    const atual = _deHist.length - novos;
    document.getElementById("de-resumo").innerText = _deHist.length
        ? `${novos} dado${novos !== 1 ? "s" : ""} novo${novos !== 1 ? "s" : ""} · ${atual} atualização${atual !== 1 ? "ões" : ""} no período`
        : "";
}

/**
 * Registros que passam pelos filtros. Tela: tipo e busca. Exportação: tipo, entregador
 * (pedaço do nome ou o ID) e quem (exato). Serve tanto pros registros completos quanto
 * pra lista leve de dias. Exportada pros testes.
 */
function deFiltrarHistorico(registros, { tipo, status, busca, entregador, quem } = {}) {
    const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const alvo = norm(busca), ent = norm(entregador);
    return registros.filter(h => {
        if (tipo && h.tipo !== tipo) return false;
        // Status: o que está no histórico já foi gravado (aprovado); pendente e recusado vêm
        // das solicitações dos entregadores.
        if (status && (h.status || "aprovado") !== status) return false;
        if (quem && h.quem !== quem) return false;
        if (ent && !norm([h.usuarios, h.atual_usuarios, h.id_interno].join(" ")).includes(ent)) return false;
        if (!alvo) return true;
        return norm([h.usuarios, h.quem, h.id_interno].join(" ")).includes(alvo);
    });
}

/** Valor como a tela mostra (máscara de telefone/documento, tipo da chave por extenso). */
function _deValor(campo, v) {
    if (v == null || v === "") return "vazio";
    if (campo === "tipo_chave_pix") return _DE_TIPOS[v] || v;
    if (campo === "cpf") return deFormatar("documento", v);
    if (campo === "outras") {
        try { return Object.entries(JSON.parse(v)).map(([k, x]) => `${k}: ${x}`).join(", "); } catch { return v; }
    }
    return deFormatar(campo, v);
}

/** Coluna "O que mudou". Exportada pros testes. */
function deHtmlMudancas(h, rotulos) {
    const campos = h.campos || [];
    if (!campos.length) {
        return `<span class="de-mud-sem">${h.tipo === "novo" ? "Preencheu os dados" : "Atualizou os dados"} (detalhe não guardado — foi antes do histórico existir)</span>`;
    }
    const linhas = campos.map(c => {
        const rot = `<span class="de-mud-campo">${_deEsc((rotulos || {})[c.campo] || c.campo)}:</span>`;
        if (h.tipo === "novo" || c.antes == null) return `${rot} ${_deEsc(_deValor(c.campo, c.depois))}`;
        return `${rot} <span class="de-mud-antes">${_deEsc(_deValor(c.campo, c.antes))}</span> → ${_deEsc(_deValor(c.campo, c.depois))}`;
    });
    return `<div class="de-mudancas">${linhas.join("<br>")}</div>`;
}

/**
 * As colunas do modelo Trampay com os dados de AGORA do entregador — aparecem completas
 * mesmo quando ele só mudou um campo. Obrigatória vazia fica em âmbar ("falta").
 * Exportada pros testes.
 */
function deHtmlTrampay(h) {
    if (!h.dado_id && !h.solicitacao_id) return DE_TRAMPAY_COLUNAS.map(c => `<td data-rotulo="${c}"><span class="cad-vazio">—</span></td>`).join("");
    const l = deTrampayDe(h);
    const falta = new Set(deFaltandoTrampay(l));
    return DE_TRAMPAY_COLUNAS.map(c => {
        const v = l[c];
        const corpo = v ? _deEsc(v) : falta.has(c) ? `<span class="de-pendente">falta</span>` : `<span class="cad-vazio">—</span>`;
        const classe = c === "nome" || c === "email" || c === "chave_pix" ? "de-corta" : "cad-num";
        return `<td class="${classe}" data-rotulo="${c}"${v && classe === "de-corta" ? ` title="${_deEsc(v)}"` : ""}>${corpo}</td>`;
    }).join("");
}

function deHtmlHistorico(h, rotulos) {
    const status = {
        pendente: `<div class="de-status de-status-pendente">Pendente</div>`,
        recusado: `<div class="de-status de-status-recusado"${h.decidido_por ? ` title="Recusado por ${_deEsc(h.decidido_por)}"` : ""}>Recusado</div>`,
        aprovado: h.origem === "entregador" ? `<div class="de-status de-status-aprovado">Aprovado</div>` : "",
    }[h.status || "aprovado"] || "";
    const tipo = (h.tipo === "novo"
        ? `<span class="de-tipo-novo">Novo</span>`
        : `<span class="de-tipo-atualizado">Atualizado</span>`) + status;
    const origem = { entregador: "pelo formulário", usuario: "copiado do login", sistema: "correção do sistema" }[h.origem] || "importação da planilha";
    const ent = _deEsc(h.usuarios || "—") + (h.id_interno ? ` <span class="de-origem">· ID ${_deEsc(h.id_interno)}</span>` : "");
    return `
        <tr>
            <td class="cad-data de-nowrap" data-rotulo="Quando">${_deEsc(_deData(h.criado_em))}</td>
            <td class="cad-nome de-corta" data-rotulo="Entregador" title="${_deEsc(h.usuarios || "")}">${ent}</td>
            <td data-rotulo="Tipo">${tipo}</td>
            <td data-rotulo="O que mudou">${deHtmlMudancas(h, rotulos)}</td>
            <td data-rotulo="Quem"><div class="de-quem">${_deEsc(h.quem || "—")}</div><div class="de-quem-origem">${origem}</div></td>
            ${deHtmlTrampay(h)}
        </tr>`;
}

function _deHistFiltrar() {
    _deCalRender("tela");
    const empty = document.getElementById("de-hist-empty");
    const lista = deFiltrarHistorico(_deHist, _deFiltrosDe("tela"));
    if (!lista.length) {
        skFim(empty, _deHist.length ? "Nada com esse filtro." : "Nenhum dado novo ou atualizado nesse período.");
        empty.style.display = "";
        document.getElementById("de-hist-resultado").style.display = "none";
        return;
    }
    empty.style.display = "none";
    document.getElementById("de-hist-resultado").style.display = "";
    document.getElementById("de-hist-tbody").innerHTML = lista.map(h => deHtmlHistorico(h, _deRotulos)).join("");
}

// ── Exportar Novos dados no MODELO TRAMPAY ──
// Modelo de cadastro de recebedores da Trampay (atualizado em 09/11/2026 — a Trampay mudou
// o formato). Colunas exatamente com estes nomes, nesta ordem:
//   nome | documento | telefone | email | praca | chave_pix_tipo | chave_pix | identificador
// Exemplo deles: Maria da Silva | 123.456.789-09 | (11) 99999-9999 | maria@email.com | Campinas | email | maria@email.com
// - nome no modelo "Nome Sobrenome" (da/de/do/dos/das/e minúsculos);
// - documento COM pontuação, pela regra da Trampay (chave CNPJ → CNPJ; senão o CPF; e a
//   exceção da planilha, que já vem no Documento gravado);
// - telefone com máscara "(11) 99999-9999";
// - praca: sempre "MeioOeste - SC" (pedido do usuário);
// - chave_pix: o tipo em minúsculo; chave numérica (CPF/CNPJ/telefone) só com os dígitos;
// - identificador = o ID dos Dados entregadores;
// - uma linha por entregador que teve dado novo/atualizado no intervalo, com os dados de
//   AGORA (ou os que ele mandou, se a solicitação está pendente/recusada).
// CSV com ";" e BOM (o Excel em português abre em colunas).

const DE_TRAMPAY_COLUNAS = ["nome", "documento", "telefone", "email", "praca", "chave_pix_tipo", "chave_pix", "identificador"];
const DE_TRAMPAY_PRACA = "MeioOeste - SC";
const _DE_CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);

/** "MARIA DA SILVA souza" → "Maria da Silva Souza". Exportada pros testes. */
function deNomeProprio(nome) {
    return String(nome || "").trim().split(/\s+/).filter(Boolean).map((p, i) => {
        const min = p.toLocaleLowerCase("pt-BR");
        if (i > 0 && _DE_CONECTIVOS.has(min)) return min;
        return min.split("'").map(t => t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1)).join("'");
    }).join(" ");
}

const _deDig = v => String(v ?? "").replace(/\D/g, "");

/** Número que perdeu o zero da frente na planilha volta com ele (só se faltar até 3). */
function _deComZeros(d, tam) {
    return d && d.length < tam && d.length >= tam - 3 ? d.padStart(tam, "0") : d;
}

/** "12345678909" → "123.456.789-09"; 14 caracteres → "11.222.333/0001-81". */
function _deMascaraDoc(d) {
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return d;
}

/** "11999999999" → "(11) 99999-9999"; 10 dígitos → "(11) 9999-9999". */
function _deMascaraTel(d) {
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
}

/** Tipo da chave como vier escrito ("Chave CPF", "CELULAR", "E-mail"...) → o do formulário. */
function deTipoTrampay(t) {
    const s = String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (!s) return "";
    if (s.includes("cnpj")) return "cnpj";
    if (s.includes("cpf")) return "cpf";
    if (s.includes("mail")) return "email";
    if (/tel|cel|fone|whats/.test(s)) return "telefone";
    if (/aleat|evp|random/.test(s)) return "aleatorio";
    return s;
}

/** Linha do modelo Trampay com os dados de AGORA de um registro. Exportada pros testes. */
function deTrampayDe(h) {
    const tipo = deTipoTrampay(h.atual_tipo_chave_pix);
    const docGravado = String(h.atual_documento || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const cpf = _deComZeros(_deDig(h.atual_cpf), 11) || (docGravado && /^\d{9,11}$/.test(docGravado) ? _deComZeros(docGravado, 11) : "");
    const cnpjCol = String(h.atual_cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    let chave = String(h.atual_chave_pix || "").trim();
    if (tipo === "cpf") chave = _deComZeros(_deDig(chave), 11);
    else if (tipo === "cnpj") chave = _deComZeros(chave.toUpperCase().replace(/[^0-9A-Z]/g, ""), 14);
    else if (tipo === "telefone") { chave = _deDig(chave); if (chave.length === 13 && chave.startsWith("55")) chave = chave.slice(2); }
    const cnpj = _deComZeros(cnpjCol, 14) || (tipo === "cnpj" ? chave : "");
    // Documento: o gravado (já é a regra da Trampay, com a exceção da planilha); sem ele
    // (solicitação ainda não aprovada), pela regra: chave CNPJ → CNPJ, senão o CPF.
    let doc = "";
    if (docGravado.length >= 12) doc = _deComZeros(docGravado, 14);
    else if (docGravado.length >= 9) doc = _deComZeros(docGravado, 11);
    if (!doc) doc = tipo === "cnpj" ? cnpj : cpf;
    let tel = _deDig(h.atual_telefone);
    if (tel.length === 13 && tel.startsWith("55")) tel = tel.slice(2);
    return {
        nome: deNomeProprio(h.atual_nome || h.atual_usuarios || h.usuarios),
        documento: _deMascaraDoc(doc),
        telefone: _deMascaraTel(tel),
        email: String(h.atual_email || "").trim().toLowerCase(),
        praca: DE_TRAMPAY_PRACA,
        chave_pix_tipo: tipo,
        chave_pix: chave,
        identificador: h.id_interno || "",
    };
}

/**
 * O que falta pra linha poder ir pra Trampay (todas as colunas são obrigatórias). Nome com
 * sobrenome; documento CPF (11) ou CNPJ (14); telefone com DDD; e-mail válido.
 * Exportada pros testes.
 * @return {string[]} Nomes das colunas que faltam (vazio = pode exportar).
 */
function deFaltandoTrampay(l) {
    const falta = [];
    const doc = String(l.documento || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (String(l.nome || "").trim().split(/\s+/).length < 2) falta.push("nome");
    if (doc.length !== 11 && doc.length !== 14) falta.push("documento");
    if (!/^\d{10,11}$/.test(_deDig(l.telefone))) falta.push("telefone");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l.email || "")) falta.push("email");
    if (!String(l.praca || "").trim()) falta.push("praca");
    if (!l.chave_pix_tipo) falta.push("chave_pix_tipo");
    if (!String(l.chave_pix || "").trim()) falta.push("chave_pix");
    if (!String(l.identificador || "").trim()) falta.push("identificador");
    return falta;
}

/** Linhas do modelo Trampay (uma por entregador, a do registro mais recente). Exportada pros testes. */
function deLinhasTrampay(registros) {
    const vistos = new Set();
    const linhas = [];
    for (const h of registros) {
        const quemE = h.dado_id ? "d" + h.dado_id : h.user_id ? "u" + h.user_id : null;
        if (!quemE || vistos.has(quemE)) continue; // o mais recente vem primeiro
        vistos.add(quemE);
        linhas.push({ ...deTrampayDe(h), entregador: h.atual_usuarios || h.usuarios || "" });
    }
    return linhas;
}

/** CSV no modelo Trampay. Exportada pros testes. */
function deCsvTrampay(linhas) {
    const txt = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const corpo = linhas.map(l => DE_TRAMPAY_COLUNAS.map(c => txt(l[c])).join(";"));
    return "﻿" + [DE_TRAMPAY_COLUNAS.join(";"), ...corpo].join("\r\n");
}

// ── Calendários de intervalo (tela e exportação) ──
// O mesmo desenho do de Pedidos/Recebimento (classes ped-cal-*), com uma diferença: dia
// que teve edição fica MARCADO (ponto embaixo + quantas na dica), contando só o que passa
// pelos filtros daquele lugar — na tela, tipo e busca; na exportação, entregador, tipo e
// quem. Assim dá pra ver de cara em que dias há o que exportar.

const _DE_CAL_DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const _DE_CAL_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                       "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const _deFmtDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _deParseDia = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const _deHoje = () => _deParseDia(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));

let _deDias = [];          // GET /historico/dias: {dia, dado_id, tipo, quem, usuarios, id_interno}

const _deCals = {
    tela: { alvo: "de-cal-tela", ini: null, fim: null, mes: null },
    exp:  { alvo: "de-tr-cal",   ini: null, fim: null, mes: null },
};

/** Filtros de cada calendário (os mesmos que a lista/exportação usam). */
function _deFiltrosDe(nome) {
    const v = id => (document.getElementById(id) || {}).value || "";
    return nome === "tela"
        ? { tipo: v("de-hist-tipo"), status: v("de-hist-status"), busca: v("de-hist-busca") }
        : { tipo: v("de-tr-tipo"), status: v("de-tr-status"), entregador: v("de-tr-entregador"), quem: v("de-tr-quem") };
}

/** Dia → quantas edições, só do que passa pelos filtros. Exportada pros testes. */
function deContarDias(dias, filtros) {
    const conta = new Map();
    for (const d of deFiltrarHistorico(dias, filtros)) conta.set(d.dia, (conta.get(d.dia) || 0) + 1);
    return conta;
}

function _deCalIniciar(nome, ini, fim) {
    const c = _deCals[nome];
    c.ini = ini; c.fim = fim;
    c.mes = new Date(fim || ini); c.mes.setDate(1);
}

function _deCalMover(nome, passo) {
    const c = _deCals[nome];
    c.mes.setMonth(c.mes.getMonth() + passo);
    _deCalRender(nome);
}

function _deCalClick(nome, dataStr) {
    const c = _deCals[nome];
    const d = _deParseDia(dataStr);
    // Intervalo fechado começa uma seleção nova; clique antes do início inverte as pontas.
    if (!c.ini || c.fim) { c.ini = d; c.fim = null; }
    else if (d < c.ini)  { c.fim = c.ini; c.ini = d; }
    else                 { c.fim = d; }
    _deCalRender(nome);
    if (nome === "tela" && c.fim) { _dePeriodoFechar(); _dePeriodoBotao(); _deHistCarregar(); }
    if (nome === "exp") { document.getElementById("de-tr-erro").innerText = ""; _deTrOpcoes(); _deTrResumo(); }
}

function _deCalRender(nome) {
    const c = _deCals[nome];
    const el = document.getElementById(c.alvo);
    if (!el || !c.mes) return;
    const marcas = deContarDias(_deDias, _deFiltrosDe(nome));
    const ano = c.mes.getFullYear(), mesIdx = c.mes.getMonth();
    const primeiro = new Date(ano, mesIdx, 1).getDay();
    const diasNoMes = new Date(ano, mesIdx + 1, 0).getDate();
    const celulaIni = new Date(ano, mesIdx, 1 - primeiro);
    const total = Math.ceil((primeiro + diasNoMes) / 7) * 7;
    const ini = c.ini, fim = c.fim;
    let grid = "";
    for (let i = 0; i < total; i++) {
        const dia = new Date(celulaIni);
        dia.setDate(celulaIni.getDate() + i);
        const chave = _deFmtDia(dia);
        let classes = "ped-cal-day" + (dia.getMonth() !== mesIdx ? " outro-mes" : "");
        const t = dia.getTime();
        if (ini && fim) {
            if (t === ini.getTime() && t === fim.getTime()) classes += " intervalo-unico";
            else if (t === ini.getTime()) classes += " intervalo-inicio";
            else if (t === fim.getTime()) classes += " intervalo-fim";
            else if (t > ini.getTime() && t < fim.getTime()) classes += " no-intervalo";
        } else if (ini && t === ini.getTime()) {
            classes += " intervalo-unico";
        }
        const n = marcas.get(chave) || 0;
        if (n) classes += " de-com-edicao";
        const dica = n ? ` title="${n} edição${n !== 1 ? "ões" : ""}"` : "";
        grid += `<div class="${classes}"${dica} onclick="_deCalClick('${nome}','${chave}')">${dia.getDate()}</div>`;
    }
    const texto = !ini ? "Clique na data"
        : !fim ? `${ini.toLocaleDateString("pt-BR")} — clique de novo para fechar o período`
        : ini.getTime() === fim.getTime() ? ini.toLocaleDateString("pt-BR")
        : `${ini.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`;
    el.innerHTML = `
        <div class="ped-cal-header">
            <button type="button" class="ped-cal-nav" onclick="_deCalMover('${nome}',-1)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${_DE_CAL_MESES[mesIdx]} ${ano}</span>
            <button type="button" class="ped-cal-nav" onclick="_deCalMover('${nome}',1)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${_DE_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join("")}${grid}</div>
        <div class="ped-cal-footer"><span class="ped-cal-range-txt">${texto}</span><span class="de-cal-legenda"><span class="de-cal-ponto"></span>teve edição</span></div>`;
}

/** Carrega os dias com edição (leve) e redesenha o que estiver aberto. */
function _deDiasCarregar() {
    return fetch(API + "/admin/dados-entregadores/historico/dias", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { _deDias = d.registros || []; _deCalRender("tela"); _deCalRender("exp"); })
        .catch(() => {});
}

// ── Período da tela ("Quando") ──

function _dePeriodoTexto() {
    const c = _deCals.tela;
    if (!c.ini) return "Escolher período";
    const fim = c.fim || c.ini;
    const br = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    return c.ini.getTime() === fim.getTime() ? br(c.ini) : `${br(c.ini)} — ${br(fim)}`;
}

function _dePeriodoBotao() {
    const t = document.getElementById("de-periodo-txt");
    if (t) t.innerText = _dePeriodoTexto();
}

function _dePeriodoAlternar() {
    const pop = document.getElementById("de-periodo-pop");
    const abrir = pop.style.display === "none";
    pop.style.display = abrir ? "" : "none";
    if (abrir) {
        const btn = document.getElementById("de-periodo-btn").getBoundingClientRect();
        // Fixo na tela: o cabeçalho corta o que passa da borda dele.
        pop.style.top = `${btn.bottom + 6}px`;
        pop.style.left = `${Math.max(8, Math.min(btn.left, window.innerWidth - 300))}px`;
        _deCalRender("tela");
        setTimeout(() => document.addEventListener("click", _dePeriodoForaClick), 0);
    } else {
        document.removeEventListener("click", _dePeriodoForaClick);
    }
}

function _dePeriodoForaClick(e) {
    const pop = document.getElementById("de-periodo-pop");
    const btn = document.getElementById("de-periodo-btn");
    // O clique num dia redesenha a grade: o alvo some do DOM e parece "fora". Ignora.
    if (!e.target.isConnected || pop.contains(e.target) || btn.contains(e.target)) return;
    _dePeriodoFechar();
}

function _dePeriodoFechar() {
    const pop = document.getElementById("de-periodo-pop");
    if (pop) pop.style.display = "none";
    document.removeEventListener("click", _dePeriodoForaClick);
}

/** Atalho: últimos N dias até hoje. */
function _dePeriodoUltimos(n) {
    const hoje = _deHoje();
    const ini = new Date(hoje); ini.setDate(ini.getDate() - (n - 1));
    _deCalIniciar("tela", ini, hoje);
    _dePeriodoFechar();
    _dePeriodoBotao();
    _deHistCarregar();
}

// ── Exportar no modelo Trampay: filtros + calendário ──

function _deTrAbrir() {
    const t = _deCals.tela;
    _deCalIniciar("exp", t.ini || _deHoje(), t.fim || t.ini || _deHoje());
    document.getElementById("de-tr-tipo").value = document.getElementById("de-hist-tipo").value;
    document.getElementById("de-tr-status").value = document.getElementById("de-hist-status").value;
    document.getElementById("de-tr-entregador").value = "";
    _deTrOpcoes();
    document.getElementById("de-tr-quem").value = "";
    document.getElementById("de-tr-erro").innerText = "";
    document.getElementById("de-tr-hora-de").value = "00:00";
    document.getElementById("de-tr-hora-ate").value = "23:59";
    _deCalRender("exp");
    _deTrResumo();
    _abrirModal("modal-de-trampay");
    _deDiasCarregar().then(() => { _deTrOpcoes(); _deTrResumo(); });
}

/** Opções de entregador (lista pra digitar) e de quem (menu), a partir do último ano. */
/**
 * Opções de um filtro a partir do que passa pelos OUTROS filtros e pelo intervalo: escolher
 * "Só dados novos" + "Pendentes" deixa no "Quem" só quem tem registro assim. Exportada pros testes.
 * @param {"quem"|"usuarios"} campo
 */
function deOpcoesFiltro(dias, filtros, campo, de, ate) {
    const sem = { ...filtros, [campo === "quem" ? "quem" : "entregador"]: "" };
    const valores = deFiltrarHistorico(dias, sem)
        .filter(d => (!de || d.dia >= de) && (!ate || d.dia <= ate))
        .map(d => d[campo]).filter(Boolean);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function _deTrOpcoes() {
    const c = _deCals.exp;
    const de = c.ini ? _deFmtDia(c.ini) : "", ate = c.ini ? _deFmtDia(c.fim || c.ini) : "";
    const filtros = _deFiltrosDe("exp");
    const nomes = deOpcoesFiltro(_deDias, filtros, "usuarios", de, ate);
    document.getElementById("de-tr-entregadores").innerHTML = nomes.map(n => `<option value="${_deEsc(n)}"></option>`).join("");
    const sel = document.getElementById("de-tr-quem");
    const atual = sel.value;
    const quens = deOpcoesFiltro(_deDias, filtros, "quem", de, ate);
    if (atual && !quens.includes(atual)) quens.unshift(atual); // o já escolhido não some
    sel.innerHTML = `<option value="">Todos</option>` + quens.map(q => `<option value="${_deEsc(q)}">${_deEsc(q)}</option>`).join("");
    sel.value = atual;
}

/** Mudou um filtro da exportação: redesenha as marcas e o resumo. */
function _deTrFiltrar() {
    _deTrOpcoes();
    _deCalRender("exp");
    _deTrResumo();
}

/** Quantos entregadores entram no arquivo com os filtros e o intervalo de agora. Exportada pros testes. */
function deContarEntregadores(dias, filtros, de, ate) {
    const ids = new Set();
    for (const d of deFiltrarHistorico(dias, filtros)) if (d.dado_id && d.dia >= de && d.dia <= ate) ids.add(d.dado_id);
    return ids.size;
}

/**
 * Separa o que vai pro arquivo: linhas completas e as que ficam de fora (com o que falta).
 * Sai da lista leve de dias, que já traz os dados de agora. Exportada pros testes.
 */
function dePrepararExportacao(dias, filtros, de, ate, horaDe, horaAte) {
    // Data + hora (de Brasília): "das 14:00 do primeiro dia até as 10:30 do último".
    const ini = `${de} ${horaDe || "00:00"}`, fim = `${ate} ${horaAte || "23:59"}`;
    const noIntervalo = deFiltrarHistorico(dias, filtros).filter(d => {
        const quando = `${d.dia} ${d.hora || "00:00"}`;
        return quando >= ini && quando <= fim;
    });
    const completas = [], incompletas = [];
    for (const l of deLinhasTrampay(noIntervalo)) {
        const falta = deFaltandoTrampay(l);
        if (falta.length) incompletas.push({ ...l, falta });
        else completas.push(l);
    }
    return { completas, incompletas };
}

function _deTrPreparo() {
    const c = _deCals.exp;
    if (!c.ini) return null;
    return dePrepararExportacao(_deDias, _deFiltrosDe("exp"), _deFmtDia(c.ini), _deFmtDia(c.fim || c.ini),
        document.getElementById("de-tr-hora-de").value, document.getElementById("de-tr-hora-ate").value);
}

function _deTrResumo() {
    const el = document.getElementById("de-tr-resumo");
    const btn = document.getElementById("de-tr-btn");
    if (!el) return;
    const p = _deTrPreparo();
    if (!p) { el.innerHTML = ""; return; }
    const { completas, incompletas } = p;
    btn.disabled = !completas.length;
    if (!completas.length && !incompletas.length) { el.innerHTML = "Nenhum entregador com edição nesse intervalo e filtros."; return; }
    let html = `<strong>${completas.length}</strong> entregador${completas.length !== 1 ? "es" : ""} no arquivo.`;
    if (incompletas.length) {
        // Lista recolhida: com centenas de linhas ela empurrava os botões pra fora da tela.
        html += `<details class="de-tr-fora"><summary>${incompletas.length} fora do arquivo por falta de dados (tudo é obrigatório, menos o CNPJ) — ver quem</summary>`
            + `<div class="de-tr-fora-lista">`
            + incompletas.map(l => `<div>· ${_deEsc(l.entregador || l.nome_recebedor || "—")} — falta ${_deEsc(l.falta.join(", "))}</div>`).join("")
            + `</div></details>`;
    }
    el.innerHTML = html;
}

async function _deTrExportar() {
    const erro = document.getElementById("de-tr-erro");
    const btn = document.getElementById("de-tr-btn");
    const c = _deCals.exp;
    erro.innerText = "";
    if (!c.ini) { erro.innerText = "Clique numa data no calendário."; return; }
    const de = _deFmtDia(c.ini), ate = _deFmtDia(c.fim || c.ini);
    btn.disabled = true; btn.textContent = "Gerando...";
    try {
        // Lista de dias fresca (alguém pode ter editado com o modal aberto).
        await _deDiasCarregar();
        const { completas } = _deTrPreparo();
        if (!completas.length) { erro.innerText = "Nenhum entregador com todos os dados nesse intervalo e filtros."; _deTrResumo(); return; }
        const url = URL.createObjectURL(new Blob([deCsvTrampay(completas)], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `trampay_recebedores_${de}${ate !== de ? "_a_" + ate : ""}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        _fecharModal("modal-de-trampay");
    } catch { erro.innerText = "Erro ao conectar com o servidor."; }
    finally { btn.textContent = "Baixar .csv"; _deTrResumo(); }
}
