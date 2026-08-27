// ───── SPX Agency Router: acompanhamento do webhook ─────
//
// Esta tela existe para os testes com a Shopee. Durante a integração a
// pergunta é sempre a mesma — "chegou alguma coisa?" — e a resposta estava só
// no console do navegador ou no banco.
//
// Mostra três coisas, nessa ordem de importância:
//   1. se o webhook está configurado (sem o secret ele recusa tudo)
//   2. o que chegou
//   3. o que foi RECUSADO, que é onde aparece problema de verdade

const _AR_MOTIVOS = {
    sem_token:        "Requisição sem JWT",
    assinatura:       "Assinatura não confere",
    algoritmo:        "Algoritmo não aceito",
    expirado:         "Timestamp fora da janela",
    claims:           "Token sem os campos esperados",
    formato:          "Token malformado",
    agencia_errada:   "agency_id de outra agência",
    ip_nao_permitido: "Origem fora da lista de IPs",
};

const _AR_TIPOS = { 1: "FM — primeira milha", 2: "LH — linha-tronco", 3: "LM — última milha" };

async function abrirAgencyRouter(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-agency-router");
    const area = document.getElementById("agency-router-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando…</p>";
    try {
        const [situacao, recebidos] = await Promise.all([
            _cteApi("/api/agency-router/situacao"),
            _cteApi("/api/agency-router/recebidos?limite=30"),
        ]);
        area.innerHTML = _htmlAgencyRouter(situacao, recebidos);
    } catch (e) {
        area.innerHTML = `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlAgencyRouter(s, recebidos) {
    const pronto = s.segredo_configurado && s.agency_id;

    return `
    <div class="cabecalho-tela">
        <h2>SPX Agency Router</h2>
        <span class="badge-status" style="background:${pronto ? "#2ecc71" : "#e8a33d"}">
            ${pronto ? "Pronto para receber" : "Falta configurar"}</span>
    </div>

    ${!pronto ? `
    <div class="aviso-bloqueio">
        <strong>O webhook ainda não está pronto.</strong>
        <p>Sem o secret ele recusa tudo — de propósito, para não aceitar dado
           que não consegue conferir. Configure no Render (Environment):</p>
        <p><code>SPX_AGENCY_SECRET</code> ${s.segredo_configurado ? "✓ configurado" : "— faltando"}<br>
           <code>SPX_AGENCY_ID</code> ${s.agency_id ? "✓ " + _esc(s.agency_id) : "— faltando"}</p>
    </div>` : ""}

    <div class="secao-form">
        <h3>Endereço para a Shopee</h3>
        <p class="mono-pequeno">${_esc(API)}${_esc(s.endpoint)}</p>
        <div class="conf-grade">
            <div class="conf-bloco"><b>Agency ID</b><br>${_esc(s.agency_id || "—")}</div>
            <div class="conf-bloco"><b>Secret</b><br>
                ${s.segredo_configurado ? "configurado" : "<b style='color:#e74c3c'>faltando</b>"}</div>
            <div class="conf-bloco"><b>IPs permitidos</b><br>
                ${s.ips_permitidos && s.ips_permitidos.length
                    ? s.ips_permitidos.map(_esc).join("<br>")
                    : "<span class='dica'>todos (lista vazia)</span>"}</div>
            <div class="conf-bloco"><b>Recebidos</b><br><b>${s.recebidos}</b></div>
        </div>
        ${!(s.ips_permitidos && s.ips_permitidos.length) ? `
        <p class="dica">
            O secret desta integração é compartilhado com outras agências e
            constava de um documento que circulou — assinatura válida, sozinha,
            prova pouco. Quando a Shopee informar os IPs de origem, configure
            <code>SPX_IPS_PERMITIDOS</code> no Render.
        </p>` : ""}
    </div>

    ${s.recusas_7_dias && s.recusas_7_dias.length ? `
    <div class="secao-form">
        <h3>Recusadas nos últimos 7 dias</h3>
        <table class="tabela">
            <thead><tr><th>Motivo</th><th>Quantidade</th></tr></thead>
            <tbody>${s.recusas_7_dias.map((r) => `<tr>
                <td>${_esc(_AR_MOTIVOS[r.motivo] || r.motivo)}</td>
                <td>${r.total}</td></tr>`).join("")}</tbody>
        </table>
        <p class="dica">
            <b>Assinatura não confere</b> costuma ser secret diferente dos dois lados.
            <b>agency_id de outra agência</b> significa que chegou dado que não é
            da GC — vale mandar para a Shopee, é prova de erro de roteamento.
        </p>
    </div>` : ""}

    <div class="secao-form">
        <h3>Últimos recebidos</h3>
        ${!recebidos.length
            ? `<p class="dica">Nada ainda. Assim que o robô da Shopee disparar,
                 aparece aqui.</p>`
            : `<table class="tabela">
            <thead><tr>
                <th>Quando</th><th>Tipo</th><th>Serviço</th><th>Viagem</th>
                <th>Agência</th><th></th>
            </tr></thead>
            <tbody>${recebidos.map((r) => `<tr>
                <td>${_fmtData(r.recebido_em)}</td>
                <td>${_esc(_AR_TIPOS[r.data_type] || r.data_type || "—")}</td>
                <td>${_esc(r.business_type || "—")}</td>
                <td class="mono-pequeno">${_esc(r.trip_number || "—")}</td>
                <td>${_esc(r.agency_id || "—")}</td>
                <td><button onclick="_arVerCorpo(${r.id})">Ver</button></td>
            </tr>`).join("")}</tbody>
        </table>`}
        <div id="ar-corpo"></div>
    </div>

    <div class="acoes-rodape">
        <button onclick="abrirAgencyRouter()">Atualizar</button>
    </div>`;
}

/**
 * Mostra o payload cru.
 *
 * Cru de propósito: enquanto o formato da Shopee não estiver confirmado, é
 * olhando o que chegou de verdade que se descobre o que interpretar.
 */
async function _arVerCorpo(id) {
    const alvo = document.getElementById("ar-corpo");
    alvo.innerHTML = "<p class='carregando'>Carregando…</p>";
    try {
        const lista = await _cteApi("/api/agency-router/recebidos?limite=200");
        const linha = lista.find((x) => x.id === id);
        if (!linha) { alvo.innerHTML = "<p class='dica'>Não encontrado.</p>"; return; }
        alvo.innerHTML = `
        <details class="secao-form" open>
            <summary><b>Recebimento #${linha.id}</b> — ${_esc(linha.trace_id || "sem trace_id")}</summary>
            <pre class="mono-pequeno" style="white-space:pre-wrap;word-break:break-word">${
                _esc(JSON.stringify(linha.corpo, null, 2))}</pre>
        </details>`;
    } catch (e) {
        alvo.innerHTML = `<p class="erro">${_esc(e.message)}</p>`;
    }
}
