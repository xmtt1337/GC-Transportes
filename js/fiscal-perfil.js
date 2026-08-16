// ───── FISCAL: Perfil de operação ─────
//
// Os valores que se repetem em todo CT-e da empresa. Preenchidos aqui uma vez,
// entram sozinhos em cada documento novo — e continuam editáveis lá.
//
// A tela não decide nada de fiscal: ela guarda o que o contador definiu.
// Nenhum valor é gravado sem alguém clicar em Salvar.

// Grupos só para organizar a tela; a lista real de campos vem do backend.
const _PERFIL_GRUPOS = [
    { titulo: "Identificação da prestação", campos: [
        "ide.CFOP", "ide.natOp", "ide.tpCTe", "ide.tpServ", "ide.toma",
        "ide.modal", "ide.serie"] },
    { titulo: "Origem da prestação", campos: [
        "ide.xMunIni", "ide.cMunIni", "ide.UFIni"] },
    { titulo: "Tomador do serviço (quando toma = 4 \"Outros\")", botao: "cnpj-tomador", campos: [
        "tomador.nome", "tomador.cnpj", "tomador.ie",
        "tomador.endereco.logradouro", "tomador.endereco.numero",
        "tomador.endereco.bairro", "tomador.endereco.municipio",
        "tomador.endereco.codigo_municipio", "tomador.endereco.uf",
        "tomador.endereco.cep"] },
    { titulo: "Valores (só se o frete for fixo por pacote)", campos: [
        "vPrest.vTPrest", "vPrest.vRec"] },
    { titulo: "ICMS", campos: [
        "imposto_regime", "imposto_cst", "imposto_aliquota"] },
    { titulo: "Modal rodoviário", campos: ["modal.rntrc"] },
    { titulo: "Carga", campos: [
        "carga.produto_predominante", "carga.tipo_medida", "carga.unidade"] },
    { titulo: "Emitente do CT-e anterior (redespacho)", campos: [
        "docAnt.nome", "docAnt.cnpj", "docAnt.ie", "docAnt.uf"] },
];

let _perfilAtual = null;

async function abrirFiscalPerfil(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-perfil");
    const area = document.getElementById("fiscal-perfil-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando perfil…</p>";
    try {
        const r = await _cteApi("/fiscal/perfil-operacao");
        _perfilAtual = (r.perfis || [])[0] || null;
        area.innerHTML = _htmlPerfil(r);
    } catch (e) {
        area.innerHTML = typeof _htmlSemAcesso === "function"
            ? _htmlSemAcesso(e.message)
            : `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlPerfil(r) {
    const campos = r.campos || {};
    const dados = (_perfilAtual && _perfilAtual.dados) || {};
    const pode = r.pode_configurar !== false;

    const input = (caminho) => {
        const meta = campos[caminho];
        if (!meta) return "";
        const v = dados[caminho];
        return `<label>${_esc(meta.rotulo)}
            <input id="perfil-${caminho.replace(/\./g, "_")}"
                   data-caminho="${caminho}"
                   value="${_esc(v === undefined || v === null ? "" : v)}"
                   ${pode ? "" : "disabled"}></label>`;
    };

    return `
    <div class="cabecalho-tela">
        <h2>Perfil de operação</h2>
        ${_perfilAtual ? `<span class="badge-status" style="background:#2ecc71">Configurado</span>`
                       : `<span class="badge-status" style="background:#8fa8c8">Não configurado</span>`}
    </div>

    <div class="aviso-info">
        <strong>Cada CT-e novo já abre com estes valores preenchidos.</strong>
        <p>Só entram onde o campo está vazio — o que você digitar no documento
           sempre vence. E tudo continua visível e editável no formulário: não
           existe valor invisível indo para o XML.</p>
        <p class="dica">Deixe em branco o que varia de um CT-e para outro — o
           valor do frete, por exemplo, só vale aqui se for sempre o mesmo.</p>
    </div>

    ${!_perfilAtual ? `
    <div class="aviso-info">
        <strong>Sugestão a partir do que já foi confirmado.</strong>
        <p>Os valores abaixo saíram das nossas conversas com o contador e do CT-e
           autorizado que você enviou. <b>Confira antes de salvar</b> — nada é
           gravado sem você clicar em Salvar.</p>
        <button onclick="_preencherSugestaoPerfil()">Preencher com a operação da GC</button>
    </div>` : ""}

    ${_PERFIL_GRUPOS.map((g) => `
    <div class="secao-form">
        <h3>${_esc(g.titulo)}</h3>
        ${g.botao === "cnpj-tomador" && pode ? `
        <div class="aviso-info">
            <strong>Não precisa digitar tudo.</strong>
            <p>Informe o CNPJ do tomador e clique em buscar — razão social,
               endereço e código IBGE vêm da Receita. Confira antes de salvar.</p>
            <div class="linha-form">
                <label>CNPJ para buscar
                    <input id="busca-cnpj-tomador" maxlength="18" placeholder="só números"
                           onkeydown="if(event.key==='Enter')buscarCnpjTomador()"></label>
                <button onclick="buscarCnpjTomador()">Buscar na Receita</button>
            </div>
            <div id="resultado-cnpj-tomador"></div>
        </div>` : ""}
        <div class="linha-form">${g.campos.map(input).join("")}</div>
    </div>`).join("")}

    ${pode ? `
    <div class="acoes-rodape">
        <button class="btn-primario" onclick="salvarPerfilOperacao()">Salvar perfil</button>
    </div>` : `
    <div class="aviso-bloqueio">
        <strong>Somente leitura.</strong>
        <p>Alterar o perfil exige a permissão "Configurar" nesta empresa.</p>
    </div>`}
    <div id="resultado-perfil"></div>`;
}

/**
 * Sugestão para a GC, com a origem de cada valor.
 *
 * Só preenche os campos da tela — não grava. A pessoa confere e salva.
 * Estes valores vieram do contador (CFOP, CST, 17%), do FAQ da Shopee
 * (redespacho) e do CT-e autorizado que o usuário enviou.
 */
function _preencherSugestaoPerfil() {
    const sugestao = {
        "ide.CFOP": "5351",
        "ide.natOp": "PRESTACAO DE SERVICO DE TRANSPORTE",
        "ide.tpCTe": "0",
        "ide.tpServ": "2",
        "ide.modal": "01",
        "ide.serie": "4",
        "ide.xMunIni": "CACADOR",
        "ide.cMunIni": "4203006",
        "ide.UFIni": "SC",
        "ide.toma": "4",
        "imposto_regime": "3",
        "imposto_cst": "00",
        "imposto_aliquota": "17",
        "modal.rntrc": "55913900",
        "carga.tipo_medida": "PESO BRUTO",
        "carga.unidade": "01",
    };
    for (const [caminho, valor] of Object.entries(sugestao)) {
        const el = document.getElementById("perfil-" + caminho.replace(/\./g, "_"));
        if (el && !el.value) el.value = valor;
    }
    document.getElementById("resultado-perfil").innerHTML = `
        <div class="aviso-info">
            Campos preenchidos. <b>Confira</b> — em especial CFOP, CST e alíquota,
            que são decisão do contador — e clique em Salvar perfil.
        </div>`;
}

/**
 * Preenche os campos do tomador a partir do CNPJ.
 *
 * Só escreve na tela — nada é gravado sem alguém conferir e clicar em Salvar.
 * O cadastro da Receita pode estar desatualizado, e a inscrição estadual não
 * vem nele.
 */
async function buscarCnpjTomador() {
    const cnpj = (document.getElementById("busca-cnpj-tomador").value || "").replace(/\D/g, "");
    const alvo = document.getElementById("resultado-cnpj-tomador");
    if (cnpj.length !== 14) {
        alvo.innerHTML = `<div class="aviso-bloqueio">CNPJ precisa ter 14 dígitos.</div>`;
        return;
    }
    alvo.innerHTML = "<p class='carregando'>Consultando a Receita…</p>";
    try {
        const d = await _cteApi(`/fiscal/cnpj/${cnpj}`);
        const por = {
            "tomador.cnpj": d.cnpj,
            "tomador.nome": d.razao_social,
            "tomador.endereco.logradouro": d.logradouro,
            "tomador.endereco.numero": d.numero,
            "tomador.endereco.bairro": d.bairro,
            "tomador.endereco.municipio": d.municipio,
            "tomador.endereco.codigo_municipio": d.codigo_municipio,
            "tomador.endereco.uf": d.uf,
            "tomador.endereco.cep": d.cep,
        };
        let preenchidos = 0;
        for (const [caminho, valor] of Object.entries(por)) {
            if (!valor) continue;
            const el = document.getElementById("perfil-" + caminho.replace(/\./g, "_"));
            if (el) { el.value = valor; preenchidos++; }
        }
        alvo.innerHTML = `<div class="aviso-sucesso">
            <strong>${_esc(d.razao_social || cnpj)}</strong>
            <p>${preenchidos} campo(s) preenchidos · situação ${_esc(d.situacao || "—")}</p>
            ${(d.avisos || []).length ? `<ul>${d.avisos.map((a) => `<li>${_esc(a)}</li>`).join("")}</ul>` : ""}
            <p class="dica">Confira e clique em <b>Salvar perfil</b>.</p>
        </div>`;
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível consultar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

async function salvarPerfilOperacao() {
    const alvo = document.getElementById("resultado-perfil");
    const dados = {};
    document.querySelectorAll("#fiscal-perfil-conteudo input[data-caminho]").forEach((el) => {
        if (el.value !== "") dados[el.dataset.caminho] = el.value;
    });
    if (!Object.keys(dados).length) {
        alvo.innerHTML = `<div class="aviso-bloqueio">Preencha ao menos um campo.</div>`;
        return;
    }
    alvo.innerHTML = "<p class='carregando'>Salvando…</p>";
    try {
        await _cteApi("/fiscal/perfil-operacao", {
            method: "POST",
            body: JSON.stringify({
                id: _perfilAtual ? _perfilAtual.id : null,
                nome: "Operação padrão",
                dados,
            }),
        });
        alvo.innerHTML = `<div class="aviso-sucesso">
            <strong>Perfil salvo.</strong>
            <p>${Object.keys(dados).length} campo(s). O próximo CT-e já abre preenchido.</p>
        </div>`;
        setTimeout(abrirFiscalPerfil, 1200);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível salvar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}
