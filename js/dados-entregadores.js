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
    _deCarregar();
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
        const texto = [l.usuarios, l.nome, l.telefone, l.documento, l.cnpj, l.chave_pix, l.email, l.login]
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
const _DE_TIPOS = { cpf: "CPF", telefone: "Telefone", aleatorio: "Aleatória", email: "E-mail", cnpj: "CNPJ" };

function deHtmlLinha(l) {
    const vazio = `<span class="cad-vazio">—</span>`;
    const c = v => (v ? _deEsc(v) : vazio);
    return `
        <tr>
            <td class="cad-nome" data-rotulo="Usuarios">${c(l.usuarios)}</td>
            <td class="cad-num de-nowrap" data-rotulo="Telefone">${c(deFormatar("telefone", l.telefone))}</td>
            <td data-rotulo="Nome">${c(l.nome)}</td>
            <td class="cad-num de-nowrap" data-rotulo="Documento">${c(deFormatar("documento", l.documento))}</td>
            <td class="cad-num de-nowrap" data-rotulo="CNPJ">${c(deFormatar("cnpj", l.cnpj))}</td>
            <td class="cad-pix" data-rotulo="Chave Pix">${l.chave_pix ? _deEsc(l.chave_pix) : `<span class="de-pendente">sem chave</span>`}</td>
            <td data-rotulo="Tipo Chave Pix">${c(_DE_TIPOS[l.tipo_chave_pix] || l.tipo_chave_pix)}</td>
            <td data-rotulo="E-mail">${c(l.email)}</td>
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
            _deCarregar();
        } catch { gcAlert("Erro ao conectar com o servidor."); }
        finally { btn.disabled = false; btn.innerText = "Importar da planilha"; }
    }, "Importar da planilha", "Importar");
}
