// ───── FISCAL: Numeração do CT-e ─────
//
// Existe para o caso de a empresa JÁ ter emitido CT-e por outro sistema.
// A sequência precisa continuar de onde parou: recomeçar do 1 gera documentos
// com número já usado, e a SEFAZ rejeita um a um.
//
// Homologação e produção são sequências separadas — testar não gasta número
// de produção.

async function abrirFiscalNumeracao(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-numeracao");
    const area = document.getElementById("fiscal-numeracao-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando numeração…</p>";
    try {
        const r = await _cteApi("/fiscal/numeracao");
        area.innerHTML = _htmlNumeracao(r);
    } catch (e) {
        area.innerHTML = typeof _htmlSemAcesso === "function"
            ? _htmlSemAcesso(e.message)
            : `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlNumeracao(r) {
    const series = r.series || [];
    const pode = r.pode_configurar !== false;

    return `
    <div class="cabecalho-tela">
        <h2>Numeração do CT-e</h2>
    </div>

    <div class="aviso-info">
        <strong>O número é atribuído pelo sistema, não digitado no CT-e.</strong>
        <p>Esta tela existe para o caso de a empresa já ter emitido CT-e por outro
           sistema: aí a sequência precisa continuar de onde parou. Se nunca emitiu,
           não precisa mexer — a série começa no 1 sozinha.</p>
        <p><b>Homologação e produção são independentes.</b> Os testes em homologação
           não consomem números de produção.</p>
    </div>

    ${!series.length ? `
    <div class="aviso-info">
        <strong>Nenhuma série em uso ainda.</strong>
        <p>A série aparece aqui depois da primeira validação de CT-e, ou quando
           você definir o número inicial abaixo.</p>
    </div>` : `
    <table class="tabela">
        <thead><tr>
            <th>Ambiente</th><th>Modelo</th><th>Série</th>
            <th>Próximo número</th><th>Maior emitido aqui</th><th>Atualizado</th>
        </tr></thead>
        <tbody>${series.map((s) => `<tr>
            <td>${_esc(s.ambiente)}</td>
            <td>${_esc(s.modelo)}</td>
            <td>${_esc(s.serie)}</td>
            <td><b>${_esc(s.proximo_numero)}</b></td>
            <td>${s.maior_emitido_aqui != null ? _esc(s.maior_emitido_aqui) : "—"}</td>
            <td>${_fmtData(s.atualizado_em)}</td>
        </tr>`).join("")}</tbody>
    </table>
    <p class="dica">
        "Maior emitido aqui" conta só o que passou por este sistema. Documentos
        emitidos antes, em outro sistema, não aparecem — quem informa o número
        responde por ele, e a alteração fica registrada na auditoria.
    </p>`}

    ${!pode ? `
    <div class="aviso-bloqueio">
        <strong>Somente leitura.</strong>
        <p>Alterar a numeração exige a permissão "Configurar" nesta empresa.</p>
    </div>` : `
    <div class="secao-form">
        <h3>Definir o próximo número</h3>
        <p class="dica">
            Informe o número que o <b>próximo</b> CT-e vai receber. Se o último
            emitido foi 260, aqui vai <b>261</b>.
        </p>
        <div class="linha-form">
            <label>Ambiente
                <select id="num-ambiente">
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção</option>
                </select></label>
            <label>Série
                <input id="num-serie" type="number" min="0" max="999" placeholder="ex: 4"></label>
            <label>Próximo número
                <input id="num-proximo" type="number" min="1" placeholder="ex: 261"></label>
        </div>
        <div class="linha-form">
            <label class="largo">Observação
                <input id="num-obs" placeholder="de onde veio o número (ex: último CT-e do sistema anterior)"></label>
        </div>
        <div class="acoes-rodape">
            <button class="btn-primario" onclick="salvarNumeracao()">Salvar</button>
        </div>
        <div id="resultado-numeracao"></div>
    </div>`}`;
}

async function salvarNumeracao() {
    const alvo = document.getElementById("resultado-numeracao");
    const corpo = {
        ambiente: document.getElementById("num-ambiente").value,
        serie: document.getElementById("num-serie").value,
        proximo_numero: document.getElementById("num-proximo").value,
        observacao: document.getElementById("num-obs").value,
    };
    if (corpo.serie === "" || corpo.proximo_numero === "") {
        alvo.innerHTML = `<div class="aviso-bloqueio">Informe a série e o próximo número.</div>`;
        return;
    }
    alvo.innerHTML = "<p class='carregando'>Salvando…</p>";
    try {
        const r = await _cteApi("/fiscal/numeracao",
                                { method: "POST", body: JSON.stringify(corpo) });
        alvo.innerHTML = `<div class="aviso-sucesso">
            <strong>Numeração definida.</strong>
            <p>Série ${_esc(r.serie)} em ${_esc(r.ambiente)}: o próximo CT-e será o
               <b>${_esc(r.proximo_numero)}</b>.</p>
        </div>`;
        setTimeout(abrirFiscalNumeracao, 1200);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível salvar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}
