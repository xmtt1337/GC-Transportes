// ───── FISCAL: Empresa emitente e usuários ─────
//
// Cadastro da empresa que emite o CT-e. É o primeiro passo do módulo fiscal:
// sem empresa não há certificado, numeração nem documento.
//
// Administrar este cadastro é permissão do papel do sistema (dev/finance);
// operar na empresa (emitir, cancelar, configurar) é o vínculo definido aqui.

let _empresaAtual = null;

async function abrirFiscalEmpresas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-empresas");
    const area = document.getElementById("fiscal-empresas-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando empresas…</p>";
    try {
        const lista = await _cteApi("/fiscal/admin/empresas");
        area.innerHTML = _htmlListaEmpresas(lista);
    } catch (e) {
        area.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível abrir.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlListaEmpresas(lista) {
    return `
    <div class="cabecalho-tela">
        <h2>Empresas emitentes</h2>
        <button class="btn-primario" onclick="abrirFormEmpresa()">+ Nova empresa</button>
    </div>

    ${!lista.length ? `
    <div class="aviso-info">
        <strong>Nenhuma empresa cadastrada ainda.</strong>
        <p>Este é o primeiro passo do módulo fiscal. Depois de cadastrar a empresa
           você poderá enviar o certificado A1 e configurar a tributação.</p>
    </div>` : `
    <table class="tabela">
        <thead><tr>
            <th>Razão social</th><th>CNPJ</th><th>IE</th><th>UF</th>
            <th>Município</th><th>Ambiente</th><th>Ações</th>
        </tr></thead>
        <tbody>${lista.map((e) => `<tr>
            <td>${_esc(e.razao_social)}</td>
            <td class="mono-pequeno">${_esc(_fmtCnpj(e.cnpj))}</td>
            <td>${_esc(e.ie)}</td>
            <td>${_esc(e.uf)}</td>
            <td>${_esc(e.municipio || "—")}</td>
            <td>${_esc(e.ambiente)}</td>
            <td>
                <button onclick="abrirFormEmpresa(${e.id})">Editar</button>
                <button onclick="abrirUsuariosEmpresa(${e.id})">Usuários</button>
            </td>
        </tr>`).join("")}</tbody>
    </table>`}`;
}

function _fmtCnpj(v) {
    const d = String(v || "").replace(/\D/g, "");
    return d.length === 14
        ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
        : v;
}

async function abrirFormEmpresa(id = null) {
    mostrarTela("tela-fiscal-empresas");
    const area = document.getElementById("fiscal-empresas-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando…</p>";
    let e = {};
    if (id) {
        try { e = await _cteApi(`/fiscal/admin/empresas/${id}`); }
        catch (err) { area.innerHTML = `<p class="erro">${_esc(err.message)}</p>`; return; }
    }
    _empresaAtual = id;
    area.innerHTML = `
    <div class="cabecalho-tela">
        <h2>${id ? "Editar empresa" : "Nova empresa emitente"}</h2>
        <button onclick="abrirFiscalEmpresas()">← Voltar</button>
    </div>

    <div class="aviso-info">
        Estes dados vão direto para o XML do CT-e. O <b>código IBGE do município</b>
        precisa ser o oficial (7 dígitos) — é ele que a SEFAZ valida, não o nome.
        O ambiente começa em <b>homologação</b> e não é escolhido aqui.
    </div>

    <div class="secao-form">
        <h3>Identificação</h3>
        <div class="linha-form">
            <label class="largo">Razão social *
                <input id="emp-razao" value="${_esc(e.razao_social || "")}"></label>
            <label>Nome fantasia
                <input id="emp-fantasia" value="${_esc(e.nome_fantasia || "")}"></label>
        </div>
        <div class="linha-form">
            <label>CNPJ *
                <input id="emp-cnpj" maxlength="18" placeholder="só números"
                       value="${_esc(e.cnpj || "")}"></label>
            <label>Inscrição estadual *
                <input id="emp-ie" value="${_esc(e.ie || "")}"></label>
            <label>CRT (regime tributário)
                <select id="emp-crt">
                    <option value="">Selecione…</option>
                    <option value="1" ${String(e.crt) === "1" ? "selected" : ""}>1 — Simples Nacional</option>
                    <option value="2" ${String(e.crt) === "2" ? "selected" : ""}>2 — Simples Nacional, excesso de sublimite</option>
                    <option value="3" ${String(e.crt) === "3" ? "selected" : ""}>3 — Regime Normal</option>
                </select></label>
            <label>Telefone
                <input id="emp-telefone" value="${_esc(e.telefone || "")}"></label>
        </div>
    </div>

    <div class="secao-form">
        <h3>Endereço</h3>
        <div class="linha-form">
            <label class="largo">Logradouro *
                <input id="emp-logradouro" value="${_esc(e.logradouro || "")}"></label>
            <label>Número *
                <input id="emp-numero" value="${_esc(e.numero || "")}"></label>
            <label>Complemento
                <input id="emp-complemento" value="${_esc(e.complemento || "")}"></label>
        </div>
        <div class="linha-form">
            <label>Bairro *
                <input id="emp-bairro" value="${_esc(e.bairro || "")}"></label>
            <label>Município *
                <input id="emp-municipio" value="${_esc(e.municipio || "")}"></label>
            <label>Código IBGE *
                <input id="emp-cmun" maxlength="7" placeholder="7 dígitos"
                       value="${_esc(e.codigo_municipio || "")}"></label>
            <label>UF *
                <input id="emp-uf" maxlength="2" placeholder="SC"
                       value="${_esc(e.uf || "")}"></label>
            <label>CEP *
                <input id="emp-cep" maxlength="9" value="${_esc(e.cep || "")}"></label>
        </div>
        <p class="dica">
            Consulte o código IBGE em
            <a href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php"
               target="_blank" rel="noopener">ibge.gov.br</a>.
            Caçador/SC é 4203006.
        </p>
    </div>

    <div class="acoes-rodape">
        <button onclick="abrirFiscalEmpresas()">Cancelar</button>
        <button class="btn-primario" onclick="salvarEmpresa()">Salvar</button>
    </div>
    <div id="resultado-empresa"></div>`;
}

async function salvarEmpresa() {
    const v = (id) => (document.getElementById(id) || {}).value || "";
    const corpo = {
        razao_social: v("emp-razao"), nome_fantasia: v("emp-fantasia"),
        cnpj: v("emp-cnpj"), ie: v("emp-ie"), crt: v("emp-crt") || null,
        telefone: v("emp-telefone"), logradouro: v("emp-logradouro"),
        numero: v("emp-numero"), complemento: v("emp-complemento"),
        bairro: v("emp-bairro"), municipio: v("emp-municipio"),
        codigo_municipio: v("emp-cmun"), uf: v("emp-uf"), cep: v("emp-cep"),
    };
    const alvo = document.getElementById("resultado-empresa");
    alvo.innerHTML = "<p class='carregando'>Salvando…</p>";
    try {
        const r = _empresaAtual
            ? await _cteApi(`/fiscal/admin/empresas/${_empresaAtual}`,
                            { method: "PUT", body: JSON.stringify(corpo) })
            : await _cteApi("/fiscal/admin/empresas",
                            { method: "POST", body: JSON.stringify(corpo) });
        alvo.innerHTML = `<div class="aviso-sucesso">
            <strong>Empresa salva.</strong>
            <p>${_esc(r.razao_social)} — próximo passo: enviar o certificado A1 em
               <b>Fiscal → Configurações → Certificado Digital</b>.</p>
        </div>`;
        setTimeout(abrirFiscalEmpresas, 1500);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível salvar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

// ─────────────────────────────────────────── vínculo de usuários
async function abrirUsuariosEmpresa(id) {
    mostrarTela("tela-fiscal-empresas");
    const area = document.getElementById("fiscal-empresas-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando usuários…</p>";
    try {
        const [empresa, vinculos] = await Promise.all([
            _cteApi(`/fiscal/admin/empresas/${id}`),
            _cteApi(`/fiscal/admin/empresas/${id}/usuarios`),
        ]);
        _empresaAtual = id;
        area.innerHTML = `
        <div class="cabecalho-tela">
            <h2>Usuários — ${_esc(empresa.razao_social)}</h2>
            <button onclick="abrirFiscalEmpresas()">← Voltar</button>
        </div>

        <div class="aviso-info">
            Só quem está nesta lista opera nesta empresa. Ver o menu Fiscal não
            basta: cada permissão abaixo é conferida no servidor a cada operação.
        </div>

        <table class="tabela">
            <thead><tr><th>Usuário</th><th>Papel</th><th>Emitir</th><th>Cancelar</th>
                       <th>Configurar</th><th></th></tr></thead>
            <tbody>${vinculos.map((v) => `<tr>
                <td>${_esc(v.nome || v.username || `#${v.user_id}`)}</td>
                <td>${_esc(v.role || "—")}</td>
                <td>${v.pode_emitir ? "✓" : "—"}</td>
                <td>${v.pode_cancelar ? "✓" : "—"}</td>
                <td>${v.pode_configurar ? "✓" : "—"}</td>
                <td><button onclick="removerVinculoEmpresa(${v.user_id})">Remover</button></td>
            </tr>`).join("")}</tbody>
        </table>

        <div class="secao-form">
            <h3>Adicionar / alterar usuário</h3>
            <div class="linha-form">
                <label>ID do usuário
                    <input id="vinc-user" type="number" placeholder="ex: 12"></label>
                <label class="check"><input type="checkbox" id="vinc-emitir" checked> Emitir</label>
                <label class="check"><input type="checkbox" id="vinc-cancelar"> Cancelar</label>
                <label class="check"><input type="checkbox" id="vinc-configurar"> Configurar</label>
            </div>
            <div class="acoes-rodape">
                <button class="btn-primario" onclick="salvarVinculoEmpresa()">Salvar vínculo</button>
            </div>
            <div id="resultado-vinculo"></div>
        </div>`;
    } catch (e) {
        area.innerHTML = `<p class="erro">${_esc(e.message)}</p>`;
    }
}

async function salvarVinculoEmpresa() {
    const alvo = document.getElementById("resultado-vinculo");
    const corpo = {
        user_id: document.getElementById("vinc-user").value,
        pode_emitir: document.getElementById("vinc-emitir").checked,
        pode_cancelar: document.getElementById("vinc-cancelar").checked,
        pode_configurar: document.getElementById("vinc-configurar").checked,
    };
    if (!corpo.user_id) { alvo.innerHTML = `<div class="aviso-bloqueio">Informe o ID do usuário.</div>`; return; }
    try {
        await _cteApi(`/fiscal/admin/empresas/${_empresaAtual}/usuarios`,
                      { method: "POST", body: JSON.stringify(corpo) });
        abrirUsuariosEmpresa(_empresaAtual);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">${_esc(e.message)}</div>`;
    }
}

async function removerVinculoEmpresa(userId) {
    if (!confirm("Remover o acesso deste usuário à empresa?")) return;
    try {
        await _cteApi(`/fiscal/admin/empresas/${_empresaAtual}/usuarios/${userId}`,
                      { method: "DELETE" });
        abrirUsuariosEmpresa(_empresaAtual);
    } catch (e) {
        alert(e.message);
    }
}
