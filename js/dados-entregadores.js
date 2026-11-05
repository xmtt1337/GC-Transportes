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
    if (novos) _deHistCarregar();
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
    const dias = document.getElementById("de-hist-dias").value;
    fetch(API + "/admin/dados-entregadores/historico?dias=" + encodeURIComponent(dias), { headers: { "Authorization": "Bearer " + token } })
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

/** Registros que passam pelo tipo e pela busca. Exportada pros testes. */
function deFiltrarHistorico(registros, { tipo, busca }) {
    const alvo = String(busca || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return registros.filter(h => {
        if (tipo && h.tipo !== tipo) return false;
        if (!alvo) return true;
        return [h.usuarios, h.quem, h.id_interno].join(" ")
            .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(alvo);
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

function deHtmlHistorico(h, rotulos) {
    const tipo = h.tipo === "novo"
        ? `<span class="de-tipo-novo">Novo</span>`
        : `<span class="de-tipo-atualizado">Atualizado</span>`;
    const origem = { entregador: "pelo formulário", usuario: "copiado do login", sistema: "correção do sistema" }[h.origem] || "importação da planilha";
    const ent = _deEsc(h.usuarios || "—") + (h.id_interno ? ` <span class="de-origem">· ID ${_deEsc(h.id_interno)}</span>` : "");
    return `
        <tr>
            <td class="cad-data de-nowrap" data-rotulo="Quando">${_deEsc(_deData(h.criado_em))}</td>
            <td class="cad-nome de-corta" data-rotulo="Entregador" title="${_deEsc(h.usuarios || "")}">${ent}</td>
            <td data-rotulo="Tipo">${tipo}</td>
            <td data-rotulo="O que mudou">${deHtmlMudancas(h, rotulos)}</td>
            <td data-rotulo="Quem"><div class="de-quem">${_deEsc(h.quem || "—")}</div><div class="de-quem-origem">${origem}</div></td>
        </tr>`;
}

function _deHistFiltrar() {
    const empty = document.getElementById("de-hist-empty");
    const lista = deFiltrarHistorico(_deHist, {
        tipo: document.getElementById("de-hist-tipo").value,
        busca: document.getElementById("de-hist-busca").value,
    });
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
