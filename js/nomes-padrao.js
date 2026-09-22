// ───── CONVERSÃO DE NOMES (SÓ DEV) ─────
// De → para entre o nome que a transportadora manda e o nome padrão do sistema. Antes só
// dava mexendo direto no banco (apagar nomes_padrao e recarregar o seed); agora é aqui.
//
// Chega por Cadastros > Usuários > "Conversão de nomes" — o botão só aparece pra dev
// (abrirAdminUsuariosGC decide isso, em usuarios-gc.js). Ainda assim o acesso à tela é
// travado de novo aqui: entrar direto pela URL sem ser dev não pode funcionar, e o
// servidor recusa as escritas de qualquer forma — a checagem aqui é só pra não abrir uma
// tela que ia dar erro em tudo que clicasse.

let _cnpBuscaTimeout = null;
let _cnpEditando = null; // { id, nome_origem, nome_sistema } | null = criando um novo
let _cnpImportArquivo = null; // { nome, pares } lido e aguardando confirmação

function abrirNomesPadrao(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev edita a Conversão de nomes.");
        return;
    }
    mostrarTela("tela-nomes-padrao");
    document.getElementById("cnp-busca").value = "";
    _cnpCarregar();
}

function _cnpEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Espera a pessoa parar de digitar: cada tecla dispararia uma busca no servidor (a lista
// não vem inteira pro navegador — passa de mil pares — só os 300 primeiros do filtro atual).
function _cnpBuscar() {
    clearTimeout(_cnpBuscaTimeout);
    _cnpBuscaTimeout = setTimeout(_cnpCarregar, 300);
}

function _cnpCarregar() {
    const empty = document.getElementById("cnp-empty");
    const result = document.getElementById("cnp-resultado");
    document.getElementById("cnp-ambiguos-wrap").style.display = "none";
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const q = document.getElementById("cnp-busca").value.trim();
    fetch(`${API}/nomes-padrao${q ? "?q=" + encodeURIComponent(q) : ""}`, {
        headers: { "Authorization": "Bearer " + token }
    })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            if (!d.linhas || !d.linhas.length) {
                skFim(empty, q ? "Nenhum nome encontrado." : "Nenhum par cadastrado ainda.");
                _cnpPintarResumo(d);
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("cnp-truncado").style.display = d.truncado ? "" : "none";
            document.getElementById("cnp-tbody").innerHTML = d.linhas.map(l => `
                <tr>
                    <td data-label="Como a transportadora escreve">${_cnpEsc(l.nome_origem)}</td>
                    <td style="color:#4a5568">→</td>
                    <td data-label="Nome no sistema">${_cnpEsc(l.nome_sistema)}</td>
                    <td data-label="Ações">
                        <div style="display:flex;gap:6px">
                            <button class="adm-usr-action senha" onclick="_cnpAbrirEditar(${l.id},'${_cnpJs(l.nome_origem)}','${_cnpJs(l.nome_sistema)}')">Editar</button>
                            <button class="adm-usr-action deletar" onclick="_cnpExcluir(${l.id},'${_cnpJs(l.nome_origem)}')">Excluir</button>
                        </div>
                    </td>
                </tr>`).join("");
            _cnpPintarResumo(d);
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Escapa pra dentro de um atributo onclick="...('...')" — apóstrofo é o único caractere que
// quebraria a chamada (nome de gente vem com muito apóstrofo: "Maria D'Ávila").
function _cnpJs(txt) {
    return String(txt ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function _cnpPintarResumo(d) {
    const el = document.getElementById("cnp-resumo");
    if (!d || !d.total) { el.innerText = ""; return; }
    el.innerHTML = `${d.total.toLocaleString("pt-BR")} par${d.total !== 1 ? "es" : ""} · ${d.nomes_sistema.toLocaleString("pt-BR")} nome${d.nomes_sistema !== 1 ? "s" : ""} de sistema`;
    // A contagem de ambíguos é uma segunda consulta — não trava a lista principal por causa
    // dela, e sem pares cadastrados nem faz sentido perguntar.
    fetch(`${API}/nomes-padrao/ambiguos`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(a => {
            if (!a || !a.total) return;
            el.innerHTML += ` · <a href="#" onclick="_cnpAbrirAmbiguos(event)" style="color:#eab308;text-decoration:none">${a.total} ambíguo${a.total !== 1 ? "s" : ""}</a>`;
        })
        .catch(() => {});
}

// ── Ambíguos: quem aponta pra mais de um destino ──
function _cnpAbrirAmbiguos(event) {
    if (event) event.preventDefault();
    const wrap = document.getElementById("cnp-ambiguos-wrap");
    const lista = document.getElementById("cnp-ambiguos-lista");
    document.getElementById("cnp-resultado").style.display = "none";
    document.getElementById("cnp-empty").style.display = "none";
    wrap.style.display = "";
    lista.innerHTML = `<div class="fechamento-empty">Carregando...</div>`;

    fetch(`${API}/nomes-padrao/ambiguos`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (!d.linhas || !d.linhas.length) { lista.innerHTML = `<div class="fechamento-empty">Nenhum ambíguo — já está tudo certo.</div>`; return; }
            lista.innerHTML = d.linhas.map(l => `
                <div style="background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.2);border-radius:12px;padding:12px 16px;margin-bottom:8px">
                    <div style="font-weight:600;color:#e2e8f0;margin-bottom:6px">${_cnpEsc(l.nome_origem)}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        ${l.destinos.map(dest => `<span style="background:rgba(255,255,255,0.06);border-radius:20px;padding:3px 11px;font-size:12.5px;color:#94a3b8">${_cnpEsc(dest)}</span>`).join("")}
                    </div>
                </div>`).join("");
        })
        .catch(() => { lista.innerHTML = `<div class="fechamento-empty">Erro ao conectar com o servidor.</div>`; });
}

function _cnpFecharAmbiguos() {
    document.getElementById("cnp-ambiguos-wrap").style.display = "none";
    _cnpCarregar();
}

// ── Adicionar / editar um par ──
function _cnpAbrirNovo() {
    _cnpEditando = null;
    document.getElementById("cnp-editar-titulo").innerText = "Novo par";
    document.getElementById("cnp-editar-origem").value = "";
    document.getElementById("cnp-editar-sistema").value = "";
    document.getElementById("cnp-editar-erro").innerText = "";
    _abrirModal("modal-cnp-editar");
    setTimeout(() => document.getElementById("cnp-editar-origem").focus(), 80);
}

function _cnpAbrirEditar(id, nome_origem, nome_sistema) {
    _cnpEditando = { id };
    document.getElementById("cnp-editar-titulo").innerText = "Editar par";
    document.getElementById("cnp-editar-origem").value = nome_origem;
    document.getElementById("cnp-editar-sistema").value = nome_sistema;
    document.getElementById("cnp-editar-erro").innerText = "";
    _abrirModal("modal-cnp-editar");
}

function _cnpSalvar() {
    const origem = document.getElementById("cnp-editar-origem").value.trim();
    const sistema = document.getElementById("cnp-editar-sistema").value.trim();
    const erro = document.getElementById("cnp-editar-erro");
    erro.innerText = "";
    if (!origem || !sistema) { erro.innerText = "Preencha os dois nomes."; return; }

    const btn = document.getElementById("cnp-editar-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    const editando = _cnpEditando;
    const url = editando ? `${API}/admin/nomes-padrao/${editando.id}` : `${API}/admin/nomes-padrao`;
    fetch(url, {
        method: editando ? "PUT" : "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ nome_origem: origem, nome_sistema: sistema })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-cnp-editar");
            _cnpCarregar();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

function _cnpExcluir(id, nome_origem) {
    gcConfirm(`Excluir a conversão de "${nome_origem}"?`, () => {
        fetch(`${API}/admin/nomes-padrao/${id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível excluir.");
                _cnpCarregar();
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
    }, null, "Excluir");
}

// ── Importar planilha (substitui a lista inteira) ──
function _cnpAbrirImportar() {
    _cnpImportArquivo = null;
    document.getElementById("cnp-import-erro").style.display = "none";
    document.getElementById("cnp-import-previa").innerHTML = "";
    document.getElementById("cnp-import-btn").style.display = "none";

    const area = document.getElementById("cnp-upload-area");
    area.ondragover = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) _cnpLerArquivo(e.dataTransfer.files[0]);
    };
    _abrirModal("modal-cnp-importar");
}

function _cnpEscolherArquivo(input) {
    if (input.files && input.files.length) _cnpLerArquivo(input.files[0]);
    input.value = ""; // permite reenviar o mesmo arquivo sem recarregar a tela
}

function _cnpMsgImportar(msg, tipo) {
    const el = document.getElementById("cnp-import-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin:12px 0;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// Cabeçalho tolerante: "Usuario Transportadora"/"Nome Sistema" é o que a planilha de hoje
// usa, mas quem exportar de novo daqui a um ano pode escrever diferente — mesma ideia das
// outras telas que leem arquivo de fora (torre-na-rua.js, NR_COLUNAS).
const CNP_COLUNAS = [
    { id: "de", nomes: ["usuario transportadora", "nome transportadora", "como a transportadora escreve", "de", "nome origem"] },
    { id: "para", nomes: ["nome sistema", "nome do sistema", "nome padrao", "para"] },
];
const _cnpNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _cnpMapear(grid) {
    let cabIdx = -1, indices = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_cnpNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of CNP_COLUNAS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        if (achou === CNP_COLUNAS.length) { cabIdx = i; indices = tentativa; break; }
    }
    if (cabIdx < 0) {
        return { erro: 'Não encontrei as colunas "Usuário Transportadora" e "Nome Sistema" no arquivo.' };
    }

    const pares = [];
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const de = String(linha[indices.de] ?? "").trim();
        const para = String(linha[indices.para] ?? "").trim();
        if (!de && !para) continue; // linha vazia no fim do arquivo
        pares.push({ de, para });
    }
    return { pares };
}

function _cnpLerArquivo(file) {
    _cnpMsgImportar("", null);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const nome = file.name.toLowerCase();
            let grid;
            if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
                const wb = XLSX.read(new TextDecoder("utf-8").decode(new Uint8Array(e.target.result)), { type: "string" });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            } else {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", raw: false });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            }
            const lido = _cnpMapear(grid);
            if (lido.erro) return _cnpMsgImportar(_cnpEsc(lido.erro), "erro");
            const validos = lido.pares.filter(p => p.de && p.para);
            if (!validos.length) return _cnpMsgImportar("O arquivo não tem nenhuma linha com os dois nomes preenchidos.", "erro");
            _cnpImportArquivo = { nome: file.name, pares: lido.pares };
            const ignoradas = lido.pares.length - validos.length;
            if (ignoradas) {
                _cnpMsgImportar(`${ignoradas} linha${ignoradas !== 1 ? "s" : ""} sem um dos dois nomes — não ${ignoradas !== 1 ? "entram" : "entra"} na importação.`, "aviso");
            }
            _cnpPintarPreviaImportar(validos);
        } catch (err) {
            _cnpMsgImportar(`Não consegui ler o arquivo: ${_cnpEsc(err.message)}`, "erro");
        }
    };
    reader.onerror = () => _cnpMsgImportar("Falha ao abrir o arquivo.", "erro");
    reader.readAsArrayBuffer(file);
}

function _cnpPintarPreviaImportar(validos) {
    const el = document.getElementById("cnp-import-previa");
    const btn = document.getElementById("cnp-import-btn");
    const amostra = validos.slice(0, 8);
    el.innerHTML = `
        <div style="font-size:13px;color:#94a3b8;margin:10px 0">
            ${validos.length.toLocaleString("pt-BR")} par${validos.length !== 1 ? "es" : ""} em <strong>${_cnpEsc(_cnpImportArquivo.nome)}</strong>
        </div>
        <table class="ant-hist-table">
            <thead><tr><th>Como a transportadora escreve</th><th>Nome no sistema</th></tr></thead>
            <tbody>
                ${amostra.map(p => `<tr><td data-label="Origem">${_cnpEsc(p.de)}</td><td data-label="Sistema">${_cnpEsc(p.para)}</td></tr>`).join("")}
                ${validos.length > amostra.length ? `<tr><td colspan="2" style="text-align:center;color:#8494a9;padding:12px">+ ${(validos.length - amostra.length).toLocaleString("pt-BR")} linhas que não cabem na prévia</td></tr>` : ""}
            </tbody>
        </table>`;
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = "Substituir tudo";
}

function _cnpImportarEnviar() {
    if (!_cnpImportArquivo) return;
    const n = _cnpImportArquivo.pares.filter(p => p.de && p.para).length;
    gcConfirm(
        `Substituir a lista inteira pelos ${n.toLocaleString("pt-BR")} pares de "${_cnpImportArquivo.nome}"?\n\nTodo par que não estiver nesse arquivo é apagado. Não pode ser desfeito.`,
        () => {
            const btn = document.getElementById("cnp-import-btn");
            btn.disabled = true;
            btn.textContent = "Importando...";

            fetch(`${API}/admin/nomes-padrao/importar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ linhas: _cnpImportArquivo.pares })
            })
                .then(r => r.json().then(d => ({ ok: r.ok, d })))
                .then(({ ok, d }) => {
                    btn.disabled = false;
                    btn.textContent = "Substituir tudo";
                    if (!ok) return _cnpMsgImportar(_cnpEsc(d.error) || "Não foi possível importar.", "erro");
                    _fecharModal("modal-cnp-importar");
                    _cnpCarregar();
                    gcAlert(`${d.gravados.toLocaleString("pt-BR")} pares gravados` +
                        (d.ignoradas ? `, ${d.ignoradas} linha${d.ignoradas !== 1 ? "s" : ""} ignorada${d.ignoradas !== 1 ? "s" : ""}` : "") +
                        (d.ambiguos ? `.\n\n${d.ambiguos} apontam pra mais de um destino — dá pra ver clicando em "ambíguos" na lista.` : "."),
                        "Importação concluída");
                })
                .catch(() => {
                    btn.disabled = false;
                    btn.textContent = "Substituir tudo";
                    _cnpMsgImportar("Erro ao conectar com o servidor.", "erro");
                });
        },
        "Substituir lista inteira",
        "Sim, substituir"
    );
}
