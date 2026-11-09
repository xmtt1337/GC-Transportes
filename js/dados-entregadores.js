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

// ── Exportar Novos dados no MODELO TRAMPAY ──
// Pedido do usuário (09/11/2026): o arquivo sai no modelo de cadastro de recebedores da
// Trampay, com as colunas exatamente com estes nomes:
//   nome_recebedor | cpf | cnpj | telefone | identificador_unico | chave_pix | chave_pix_tipo
// - nome no modelo "Nome Sobrenome" (só a primeira letra maiúscula; da/de/do/dos/das/e minúsculos);
// - cpf, cnpj, telefone e chave numérica SEM pontuação (e com o zero da frente que a
//   planilha perde: CPF 11 dígitos, CNPJ 14);
// - identificador_unico = o ID dos Dados entregadores (coluna ID da planilha);
// - uma linha por entregador que teve dado novo/atualizado no intervalo escolhido no
//   calendário, com os dados de AGORA.
// O CSV segue o mesmo formato do CSV de pagamento da Trampay que o sistema já gera
// (/admin/pagamentos/csv): separador ";", BOM e ="..." nos números pro Excel não comer zero.

const DE_TRAMPAY_COLUNAS = ["nome_recebedor", "cpf", "cnpj", "telefone", "identificador_unico", "chave_pix", "chave_pix_tipo"];
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

/** Linhas do modelo Trampay (uma por entregador). Exportada pros testes. */
function deLinhasTrampay(registros) {
    const vistos = new Set();
    const linhas = [];
    for (const h of registros) {
        if (!h.dado_id || vistos.has(h.dado_id)) continue; // o mais recente vem primeiro
        vistos.add(h.dado_id);
        const doc = _deDig(h.atual_documento);
        const cpf = _deComZeros(_deDig(h.atual_cpf), 11) || (doc && doc.length <= 11 ? _deComZeros(doc, 11) : "");
        const cnpjCol = String(h.atual_cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
        const cnpj = _deComZeros(cnpjCol, 14) || (doc.length >= 12 ? _deComZeros(doc, 14) : "");
        let tel = _deDig(h.atual_telefone);
        if (tel.length === 13 && tel.startsWith("55")) tel = tel.slice(2);
        const tipo = deTipoTrampay(h.atual_tipo_chave_pix);
        let chave = String(h.atual_chave_pix || "").trim();
        if (tipo === "cpf") chave = _deComZeros(_deDig(chave), 11);
        else if (tipo === "cnpj") chave = _deComZeros(chave.toUpperCase().replace(/[^0-9A-Z]/g, ""), 14);
        else if (tipo === "telefone") { chave = _deDig(chave); if (chave.length === 13 && chave.startsWith("55")) chave = chave.slice(2); }
        linhas.push({
            nome_recebedor: deNomeProprio(h.atual_nome || h.usuarios),
            cpf, cnpj, telefone: tel,
            identificador_unico: h.id_interno || "",
            chave_pix: chave,
            chave_pix_tipo: tipo,
        });
    }
    return linhas;
}

/** CSV no modelo Trampay. Exportada pros testes. */
function deCsvTrampay(linhas) {
    const txt = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const num = v => (v ? `="${String(v).replace(/"/g, '""')}"` : `""`);
    const corpo = linhas.map(l => [
        txt(l.nome_recebedor), num(l.cpf), num(l.cnpj), num(l.telefone),
        num(l.identificador_unico), num(l.chave_pix), txt(l.chave_pix_tipo),
    ].join(";"));
    return "﻿" + [DE_TRAMPAY_COLUNAS.join(";"), ...corpo].join("\r\n");
}

// Calendário de intervalo: o mesmo desenho do de Pedidos/Recebimento (classes ped-cal-*).
const _DE_CAL_DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const _DE_CAL_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                       "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let _deCalIni = null, _deCalFim = null, _deCalMes = null;
const _deFmtDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _deParseDia = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };

function _deCalMesAnterior() { _deCalMes.setMonth(_deCalMes.getMonth() - 1); _deCalRender(); }
function _deCalMesProximo()  { _deCalMes.setMonth(_deCalMes.getMonth() + 1); _deCalRender(); }

function _deCalClick(dataStr) {
    const d = _deParseDia(dataStr);
    if (!_deCalIni || _deCalFim) { _deCalIni = d; _deCalFim = null; }
    else if (d < _deCalIni)      { _deCalFim = _deCalIni; _deCalIni = d; }
    else                         { _deCalFim = d; }
    _deCalRender();
    document.getElementById("de-tr-erro").innerText = "";
}

function _deCalRender() {
    const ano = _deCalMes.getFullYear(), mesIdx = _deCalMes.getMonth();
    const primeiro = new Date(ano, mesIdx, 1).getDay();
    const diasNoMes = new Date(ano, mesIdx + 1, 0).getDate();
    const celulaIni = new Date(ano, mesIdx, 1 - primeiro);
    const total = Math.ceil((primeiro + diasNoMes) / 7) * 7;
    const ini = _deCalIni, fim = _deCalFim;
    let grid = "";
    for (let i = 0; i < total; i++) {
        const dia = new Date(celulaIni);
        dia.setDate(celulaIni.getDate() + i);
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
        grid += `<div class="${classes}" onclick="_deCalClick('${_deFmtDia(dia)}')">${dia.getDate()}</div>`;
    }
    const texto = !ini ? "Clique na data"
        : !fim ? `${ini.toLocaleDateString("pt-BR")} — clique de novo para um período`
        : ini.getTime() === fim.getTime() ? ini.toLocaleDateString("pt-BR")
        : `${ini.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`;
    document.getElementById("de-tr-cal").innerHTML = `
        <div class="ped-cal-header">
            <button type="button" class="ped-cal-nav" onclick="_deCalMesAnterior()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${_DE_CAL_MESES[mesIdx]} ${ano}</span>
            <button type="button" class="ped-cal-nav" onclick="_deCalMesProximo()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${_DE_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join("")}${grid}</div>
        <div class="ped-cal-footer"><span class="ped-cal-range-txt">${texto}</span></div>`;
}

function _deTrAbrir() {
    const hoje = _deParseDia(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    _deCalIni = hoje; _deCalFim = hoje;
    _deCalMes = new Date(hoje); _deCalMes.setDate(1);
    _deCalRender();
    document.getElementById("de-tr-erro").innerText = "";
    _abrirModal("modal-de-trampay");
}

async function _deTrExportar() {
    const erro = document.getElementById("de-tr-erro");
    const btn = document.getElementById("de-tr-btn");
    erro.innerText = "";
    if (!_deCalIni) { erro.innerText = "Clique numa data no calendário."; return; }
    const de = _deFmtDia(_deCalIni), ate = _deFmtDia(_deCalFim || _deCalIni);
    btn.disabled = true; btn.textContent = "Gerando...";
    try {
        const r = await fetch(`${API}/admin/dados-entregadores/historico?de=${de}&ate=${ate}`, { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { erro.innerText = d.error || "Não foi possível gerar."; return; }
        // Mesmo filtro de tipo e busca que estiver na tela.
        const filtrados = deFiltrarHistorico(d.registros || [], {
            tipo: document.getElementById("de-hist-tipo").value,
            busca: document.getElementById("de-hist-busca").value,
        });
        const linhas = deLinhasTrampay(filtrados);
        if (!linhas.length) { erro.innerText = "Nenhum entregador com dado novo ou atualizado nesse intervalo."; return; }
        const url = URL.createObjectURL(new Blob([deCsvTrampay(linhas)], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `trampay_recebedores_${de}${ate !== de ? "_a_" + ate : ""}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        _fecharModal("modal-de-trampay");
    } catch { erro.innerText = "Erro ao conectar com o servidor."; }
    finally { btn.disabled = false; btn.textContent = "Baixar .csv"; }
}
