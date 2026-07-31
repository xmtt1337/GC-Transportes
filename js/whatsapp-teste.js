// ───── WHATSAPP — TELA DE TESTE (SÓ DEV) ─────
// Tela simples pra testar o disparo assim que o número/token entrarem no Render.
// Nada de automação aqui ainda — é só um formulário manual pra validar a integração.
// Formulário de disparo é um só, pra todo mundo. O que muda por cargo: só quem faz
// acareação define prazo — os demais mandam a mesma mensagem, sem vencimento correndo.
const WA_ROLES_COM_PRAZO = ["sac", "dev"];
const WA_ROLES_ATIVOS = ["sac", "dev", "admin"];

function abrirWhatsappTeste(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (!WA_ROLES_ATIVOS.includes(role)) {
        gcAlert("Você não tem acesso ao disparo de ativos.");
        return;
    }
    mostrarTela("tela-whatsapp-teste");

    const comPrazo = WA_ROLES_COM_PRAZO.includes(role);
    const mostrar = (id, sim) => { const el = document.getElementById(id); if (el) el.style.display = sim ? "" : "none"; };
    mostrar("wa-secao-acareacao", true);
    mostrar("wa-campo-prazo", comPrazo);
    // Massa é só pra quem faz outros ativos: acareação é caso a caso, cada uma com o
    // prazo que a transportadora deu — disparar em lote não faz sentido ali.
    mostrar("wa-bulk-bloco", !comPrazo);
    mostrar("wa-secao-status", role === "dev"); // diagnóstico do número: só dev

    if (role === "dev") _waCarregarStatus();
    _waRecRenderCampos();
}

// Mostra qual número o servidor está usando pra enviar — trocamos de número no meio
// do projeto, e vários erros da Meta só fazem sentido sabendo qual está configurado.
function _waCarregarStatus() {
    const el = document.getElementById("wa-status");
    el.innerText = "Consultando...";

    fetch(`${API}/admin/whatsapp/status`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (!d.configurado) { el.innerHTML = `<span style="color:#ef4444">Nenhum número configurado no servidor.</span>`; return; }
        const m = d.meta || {};
        if (m.error) {
            el.innerHTML = `<span style="color:#ef4444">A Meta não reconheceu o ID ${d.phone_number_id}: ${m.error.message || "erro"}</span>`;
            return;
        }
        const coexistencia = m.platform_type && m.platform_type !== "CLOUD_API";
        el.innerHTML = `
            <div><strong style="color:#e2e8f0">${m.display_phone_number || "—"}</strong> · ${m.verified_name || "—"}</div>
            <div style="font-size:12px;margin-top:4px">ID: <span style="font-family:monospace">${d.phone_number_id}</span> · Plataforma: ${m.platform_type || "—"} · Verificação: ${m.code_verification_status || "—"}</div>
            ${coexistencia ? `<div style="color:#fbbf24;font-size:12px;margin-top:6px">⚠ Esse número não é Cloud API puro (${m.platform_type}) — é o caso em que a Meta bloqueia registro e templates.</div>` : ""}`;
    })
    .catch(() => { el.innerHTML = `<span style="color:#ef4444">Erro ao consultar o servidor.</span>`; });
}

// ── Telefone: máscara e validação ──
// Guarda só os dígitos locais (DDD + número). O "55" é sempre nosso, nunca do que
// foi digitado — colar "49 99927-6131" ou "5549999276131" dá no mesmo resultado.
function _waDigitosLocais(valor) {
    // Tira o "+55" que a própria máscara escreve — senão, a cada tecla ele seria lido
    // como se fosse digitado e o número iria acumulando 55 na frente.
    const semPrefixo = String(valor || "").trim().replace(/^\+\s*55\s*/, "");
    let d = semPrefixo.replace(/\D/g, "");
    // Só tira o 55 da frente se o que sobrar tiver cara de número local (10 ou 11 dígitos).
    // Sem isso, um número com DDD 55 (Santa Maria/RS) seria mutilado.
    if (d.startsWith("55") && (d.length - 2 === 10 || d.length - 2 === 11)) d = d.slice(2);
    return d.slice(0, 11);
}

function _waFormatarTelefone(valor) {
    const d = _waDigitosLocais(valor);
    if (!d) return "";
    let out = "+55 " + d.slice(0, 2);
    const resto = d.slice(2);
    if (!resto) return out;
    if (resto.length <= 4)      out += " " + resto;
    else if (resto.length <= 8) out += " " + resto.slice(0, 4) + "-" + resto.slice(4);
    else                        out += " " + resto.slice(0, 1) + " " + resto.slice(1, 5) + "-" + resto.slice(5);
    return out;
}

function _waMascaraTelefone(input) {
    input.value = _waFormatarTelefone(input.value);
}

// Devolve { ok, e164, erro } — e164 é o formato que a API espera (55 + DDD + número).
function _waValidarTelefone(valor) {
    const d = _waDigitosLocais(valor);
    if (!d)               return { ok: false, erro: "Informe o número do cliente." };
    if (d.length < 10)    return { ok: false, erro: "Número incompleto. Use DDD + número, ex: 49 9 9927-6131." };
    const ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return { ok: false, erro: `DDD inválido (${d.slice(0, 2)}).` };
    if (d.length === 11 && d[2] !== "9") return { ok: false, erro: "Celular com 9 dígitos precisa começar com 9 depois do DDD." };
    return { ok: true, e164: "55" + d };
}

// ── Mensagens de reclamação por transportadora ──
// Cada categoria vira um template aprovado na Meta (nome em "template"); os campos
// abaixo viram os parâmetros {{1}}, {{2}}... na mesma ordem em que aparecem no texto.
const WA_REC_TEMPLATES = {
    tiktok: {
        rotulo: "TikTok (J&T)",
        template: "reclamacao_tiktok_jt",
        transportadora: "jt",
        campoPedido: "codigo_pedido",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "codigo_pedido", label: "Código do pedido" },
            { id: "nome_loja", label: "Nome da loja" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"}
Meu nome é ${_waRecNomeAtendente()}, representante da transportadora J&T Express.
Verificamos que você abriu uma reclamação referente ao pedido ${v.codigo_pedido || "___"}, realizado pela ${v.nome_loja || "___"}.
Para que possamos auxiliar, escolha uma das opções abaixo e responda apenas com o número:
1 - Recebi o produto;
2 - Recebi o produto corretamente lacrado/embalado;
3 - Não recebi o produto;
4 - Recebi o produto com itens faltantes;
5 - Recebi o produto com a embalagem externa em más condições;
6 - Recebi um produto diferente do comprado;
7 - Recebi o produto com defeito`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.codigo_pedido, v.nome_loja],
    },
    mercadolivre: {
        rotulo: "Mercado Livre (J&T)",
        template: "reclamacao_ml_jt",
        transportadora: "jt",
        campoPedido: "id_pacote_jms",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "nome_produto", label: "Nome do produto" },
            { id: "id_pacote_jms", label: "ID do pacote e número JMS" },
            { id: "data_entrega", label: "Data e hora da entrega" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"}!
Me chamo ${_waRecNomeAtendente()} e sou da Transportadora J&T Express, parceira de entregas do Mercado Livre.

Verificamos que você abriu uma reclamação referente ao produto ${v.nome_produto || "___"} ID ${v.id_pacote_jms || "___"} entregue dia ${v.data_entrega || "___"}.
Para que possamos auxiliar, escolha uma opção:
1- Recebi o produto
2- Não recebi o produto;
3- Recebi o pacote com produtos faltantes;
4- Recebi o produto com defeito;
5- Recebi um produto diferente do comprado.`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.nome_produto, v.id_pacote_jms, v.data_entrega],
    },
    shopee: {
        rotulo: "Shopee",
        template: "reclamacao_shopee",
        transportadora: "shopee",
        campoPedido: "codigo_pedido",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "codigo_pedido", label: "Código do pedido" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"} !Aqui é da transportadora GCTRANSPORTES, parceira da Shopee e responsável pela entrega do seu pedido ${v.codigo_pedido || "___"}. Por gentileza, pode confirmar a entrega do seu pedido preenchendo os dados abaixo:【1】Nome completo do destinatário:【2】CPF:【3】Seu pedido foi recebido?: SIM ou NÃO【4】 A solicitação de reembolso foi cancelada via app?*: SIM ou NÃO【Nota】*Caso seu pedido tenha sido entregue e a solicitação de reembolso ainda está aberta, pedimos que prossiga com o cancelamento do reembolso via app. Agradecemos pela atenção!`,
        parametros: v => [v.nome_cliente, v.codigo_pedido],
    },
    imile: {
        rotulo: "iMile",
        template: "reclamacao_imile",
        transportadora: "imile",
        campoPedido: "numero_pedido",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "numero_pedido", label: "Número do pedido" },
            { id: "remetente", label: "Remetente" },
            { id: "produto", label: "Produto" },
        ],
        montar: v => `Olá cliente ${v.nome_cliente || "___"}, tudo bem?
Me chamo ${_waRecNomeAtendente()}, sou do time de SAC da Imile Delivery.
Recebemos uma reclamação a respeito do seu pedido número ${v.numero_pedido || "___"}, remetente ${v.remetente || "___"}.
PRODUTO: ${v.produto || "___"}

Poderia me confirmar se você recebeu ele corretamente se estava lacrado?
Observação: não aceitamos áudios, apenas mensagens por escrito

Aguardo seu retorno e agradeço desde já! ☺️`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.numero_pedido, v.remetente, v.produto],
    },
    anjun: {
        rotulo: "Anjun",
        template: "reclamacao_anjun",
        transportadora: "anjun",
        campoPedido: "numero_pedido",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "numero_pedido", label: "Número do pedido" },
            { id: "plataforma", label: "Plataforma (Shopee, Mercado Livre...)" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"} ! Faço parte da equipe de parceiros da Anjun Express, transportadora responsável pela entrega do seu pedido. O motivo do meu contato é para falarmos a respeito do pedido ${v.numero_pedido || "___"}, do qual foi aberto uma reclamação. Plataforma: ${v.plataforma || "___"} Por gentileza, poderia confirmar o recebimento do seu pedido preenchendo os dados abaixo? .CPF: .Seu pedido foi entregue? Responda com SIM ou NÃO.`,
        parametros: v => [v.nome_cliente, v.numero_pedido, v.plataforma],
    },
};

// Transportadora de cada template — é por ela que as conversas se separam no funil.
// Mesmas cores do resto do sistema (bipagens, conferências, planejamento).
const WA_TRANSPORTADORAS = {
    jt:     { rotulo: "J&T",    cor: "#EF4444" },
    shopee: { rotulo: "Shopee", cor: "#F97316" },
    imile:  { rotulo: "iMile",  cor: "#9333EA" },
    anjun:  { rotulo: "Anjun",  cor: "#22C55E" },
};

// Nome do template gravado no disparo → transportadora. Sai do próprio WA_REC_TEMPLATES,
// então cadastrar transportadora nova continua sendo mexer num lugar só. Como deriva do
// template, vale também pros disparos feitos antes desta separação existir.
const WA_TEMPLATE_TRANSPORTADORA = Object.fromEntries(
    Object.values(WA_REC_TEMPLATES).map(c => [c.template, c.transportadora])
);

function _waTransportadoraDe(template) {
    return WA_TEMPLATE_TRANSPORTADORA[template] || null;
}

// Ordem fixa das transportadoras que o disparo atende, na sequência em que aparecem no
// formulário. Fixa de propósito: a barra de filtro não troca de posição conforme entra
// ou sai conversa, então clicar no mesmo lugar sempre cai na mesma transportadora.
const WA_TRANSPORTADORAS_ORDEM = [...new Set(Object.values(WA_REC_TEMPLATES).map(c => c.transportadora))];

let _waRecCategoria = "tiktok";

// Nome de quem está atendendo (Matheus/Amanda/"seu nome" nos scripts originais) vira
// o nome de quem está logado no sistema, em vez de fixo ou de precisar digitar toda hora.
function _waRecNomeAtendente() {
    return (window._gcUser && window._gcUser.name) || "___";
}

function _waRecEscolher(cat) {
    _waRecCategoria = cat;
    document.querySelectorAll("#wa-rec-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.cat === cat));
    _waRecRenderCampos();
    // Trocar de transportadora muda as colunas do CSV — o arquivo anterior não serve mais.
    _waBulkLimpar();
}

function _waBulkLimpar() {
    _waBulkLinhas = [];
    const arq = document.getElementById("wa-bulk-arquivo");
    if (arq) arq.value = "";
    const prev = document.getElementById("wa-bulk-preview");
    if (prev) prev.style.display = "none";
    const prog = document.getElementById("wa-bulk-progresso");
    if (prog) prog.innerText = "";
    const falhas = document.getElementById("wa-bulk-falhas");
    if (falhas) { falhas.style.display = "none"; falhas.innerHTML = ""; }
}

function _waRecRenderCampos() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    document.getElementById("wa-rec-campos").innerHTML = cfg.campos.map(c => `
        <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;display:block;margin-bottom:6px">${c.label}</label>
            <input type="text" id="wa-rec-campo-${c.id}" class="fech-select" style="width:100%" oninput="_waRecAtualizarPreview()">
        </div>`).join("");
    _waRecAtualizarPreview();
}

function _waRecValores() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const v = {};
    cfg.campos.forEach(c => {
        const el = document.getElementById(`wa-rec-campo-${c.id}`);
        v[c.id] = el ? el.value.trim() : "";
    });
    return v;
}

function _waRecAtualizarPreview() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    document.getElementById("wa-rec-preview").innerText = cfg.montar(_waRecValores());
}

function _waRecEnviar() {
    const cfg    = WA_REC_TEMPLATES[_waRecCategoria];
    const prazo  = parseInt(document.getElementById("wa-rec-prazo").value, 10);
    const msgEl  = document.getElementById("wa-rec-msg");
    const v      = _waRecValores();

    const tel = _waValidarTelefone(document.getElementById("wa-rec-numero").value);
    if (!tel.ok) { msgEl.style.color = "#ef4444"; msgEl.innerText = tel.erro; return; }
    const numero = tel.e164;
    // Só cobra prazo de quem faz acareação — pros demais o campo nem aparece.
    const comPrazo = WA_ROLES_COM_PRAZO.includes(window._gcUser && window._gcUser.role);
    if (comPrazo && (!prazo || prazo < 1)) { msgEl.style.color = "#ef4444"; msgEl.innerText = "Informe o prazo em horas."; return; }
    const faltando = cfg.campos.filter(c => !v[c.id]);
    if (faltando.length) {
        msgEl.style.color = "#ef4444";
        msgEl.innerText = "Preencha: " + faltando.map(c => c.label).join(", ");
        return;
    }

    msgEl.style.color = "#64748b";
    msgEl.innerText = "Enviando...";

    fetch(`${API}/admin/whatsapp/enviar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            numero, template: cfg.template, parametros: cfg.parametros(v),
            texto: cfg.montar(v), nome_cliente: v.nome_cliente || null,
            pedido: v[cfg.campoPedido] || null, prazo_horas: comPrazo ? prazo : null
        })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            if (body.detalhe) console.error("[whatsapp] recusa da Meta:", body.detalhe);
            msgEl.style.color = "#ef4444";
            msgEl.innerText = body.error || "Erro ao enviar.";
            return;
        }
        msgEl.style.color = "#22c55e";
        msgEl.innerText = "Enviado! ID: " + (body.id || "—");
    })
    .catch(() => { msgEl.style.color = "#ef4444"; msgEl.innerText = "Erro ao conectar com o servidor."; });
}

// ── Disparo em massa por CSV ──
// O arquivo segue a transportadora selecionada: as colunas são exatamente os campos
// daquele template, então não tem como preencher um campo que a mensagem não usa.
let _waBulkLinhas   = [];
let _waBulkEnviando = false;

function _waBulkAlternar() {
    const area = document.getElementById("wa-bulk-area");
    const btn  = document.getElementById("wa-bulk-toggle");
    const abrir = area.style.display === "none";
    area.style.display = abrir ? "" : "none";
    btn.textContent = abrir ? "Disparar em massa ▴" : "Disparar em massa ▾";
    btn.classList.toggle("active", abrir);
}

// Colunas do arquivo: número + os campos do template escolhido.
function _waBulkColunas() {
    return ["Numero", ...WA_REC_TEMPLATES[_waRecCategoria].campos.map(c => c.label)];
}

function _waBulkCsvEscapar(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function _waBulkBaixarModelo() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const colunas = _waBulkColunas();
    const exemplo = ["+55 49 9 9927-6131", ...cfg.campos.map(c => "exemplo " + c.label.toLowerCase())];
    // BOM na frente pro Excel abrir os acentos corretamente.
    const csv = "﻿" + [colunas, exemplo].map(l => l.map(_waBulkCsvEscapar).join(",")).join("\r\n") + "\r\n";

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_" + cfg.template + ".csv";
    a.click();
    URL.revokeObjectURL(url);
}

function _waBulkSplitLinha(linha) {
    const vals = []; let cur = ""; let inQ = false;
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            if (inQ && linha[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === "," && !inQ) { vals.push(cur); cur = ""; }
        else cur += c;
    }
    vals.push(cur);
    return vals.map(v => v.trim().replace(/^"|"$/g, ""));
}

const _waNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function _waBulkParseCSV(texto) {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) return [];

    const cabecalho = _waBulkSplitLinha(linhas[0]).map(_waNorm);
    // Casa pelo nome da coluna; se o cabeçalho foi mexido, cai na ordem do modelo.
    const idxDe = (rotulo, posicao) => {
        const i = cabecalho.indexOf(_waNorm(rotulo));
        return i !== -1 ? i : posicao;
    };
    const idxNumero = idxDe("Numero", 0);
    const idxCampos = cfg.campos.map((c, i) => idxDe(c.label, i + 1));

    return linhas.slice(1).map(linha => {
        const vals = _waBulkSplitLinha(linha);
        const valores = {};
        cfg.campos.forEach((c, i) => { valores[c.id] = (vals[idxCampos[i]] || "").trim(); });
        return { numero: (vals[idxNumero] || "").trim(), valores, status: "aguardando" };
    }).filter(l => l.numero || Object.values(l.valores).some(v => v));
}

function _waBulkArquivoSelecionado(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        _waBulkLinhas = _waBulkParseCSV(reader.result);
        _waBulkRenderizar();
        document.getElementById("wa-bulk-preview").style.display = _waBulkLinhas.length ? "" : "none";
        document.getElementById("wa-bulk-contagem").innerText = _waBulkLinhas.length
            ? _waBulkLinhas.length + " destinatário" + (_waBulkLinhas.length !== 1 ? "s" : "") + " · modelo " + WA_REC_TEMPLATES[_waRecCategoria].rotulo
            : "Nenhuma linha válida. Confira se o arquivo é o modelo desta transportadora.";
        document.getElementById("wa-bulk-progresso").innerText = "";
        const falhas = document.getElementById("wa-bulk-falhas");
        falhas.style.display = "none"; falhas.innerHTML = ""; // resultado do arquivo anterior
        const btn = document.getElementById("wa-bulk-btn-enviar");
        btn.disabled = false;
        btn.textContent = "Enviar em massa";
    };
    reader.readAsText(file, "utf-8");
}

function _waBulkStatusCor(s) {
    return s === "ok" ? "#22c55e" : s === "erro" ? "#ef4444" : s === "enviando" ? "#fbbf24" : "#64748b";
}
function _waBulkStatusTexto(l) {
    return l.status === "ok" ? "Enviado"
         : l.status === "erro" ? (l.erro || "Falhou")
         : l.status === "enviando" ? "Enviando..." : "Aguardando";
}

function _waBulkRenderizar() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    document.getElementById("wa-bulk-thead").innerHTML = `
        <tr style="text-align:left;color:#64748b">
            <th style="padding:8px 10px">Número</th>
            ${cfg.campos.map(c => `<th style="padding:8px 10px;white-space:nowrap">${c.label}</th>`).join("")}
            <th style="padding:8px 10px">Status</th>
        </tr>`;
    document.getElementById("wa-bulk-tbody").innerHTML = _waBulkLinhas.map(l => `
        <tr style="border-top:1px solid rgba(255,255,255,0.04)">
            <td style="padding:7px 10px;font-family:monospace;white-space:nowrap">${l.numero || "—"}</td>
            ${cfg.campos.map(c => `<td style="padding:7px 10px;color:#94a3b8;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.valores[c.id] || "—"}</td>`).join("")}
            <td style="padding:7px 10px;color:${_waBulkStatusCor(l.status)};font-weight:600;white-space:nowrap">${_waBulkStatusTexto(l)}</td>
        </tr>`).join("");
}

async function _waBulkEnviar() {
    if (_waBulkEnviando || !_waBulkLinhas.length) return;
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const progresso = document.getElementById("wa-bulk-progresso");
    const comPrazo = WA_ROLES_COM_PRAZO.includes(window._gcUser && window._gcUser.role);
    const prazo = parseInt(document.getElementById("wa-rec-prazo").value, 10);

    _waBulkEnviando = true;
    const btn = document.getElementById("wa-bulk-btn-enviar");
    btn.disabled = true;

    let ok = 0, falha = 0;
    for (let i = 0; i < _waBulkLinhas.length; i++) {
        const linha = _waBulkLinhas[i];
        progresso.style.color = "#64748b";
        progresso.innerText = `Enviando ${i + 1} de ${_waBulkLinhas.length}... (${ok} ok, ${falha} falhas)`;

        // Valida antes de gastar mensagem: número torto ou campo vazio nem chega na Meta.
        const tel = _waValidarTelefone(linha.numero);
        const faltando = cfg.campos.filter(c => !linha.valores[c.id]);
        if (!tel.ok || faltando.length) {
            linha.status = "erro";
            linha.erro = !tel.ok ? tel.erro : "Faltou: " + faltando.map(c => c.label).join(", ");
            falha++;
            _waBulkRenderizar();
            continue;
        }

        linha.status = "enviando";
        _waBulkRenderizar();

        try {
            const resp = await fetch(`${API}/admin/whatsapp/enviar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({
                    numero: tel.e164, template: cfg.template,
                    parametros: cfg.parametros(linha.valores), texto: cfg.montar(linha.valores),
                    nome_cliente: linha.valores.nome_cliente || null,
                    pedido: linha.valores[cfg.campoPedido] || null,
                    prazo_horas: comPrazo ? prazo : null
                })
            });
            const body = await resp.json();
            if (resp.ok) { linha.status = "ok"; ok++; }
            else { linha.status = "erro"; linha.erro = body.error || "Falhou"; falha++; }
        } catch {
            linha.status = "erro"; linha.erro = "Erro de conexão"; falha++;
        }
        _waBulkRenderizar();

        // Espaçamento entre envios: evita rajada e protege a reputação do número.
        if (i < _waBulkLinhas.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    _waBulkEnviando = false;
    progresso.style.color = falha ? "#fbbf24" : "#22c55e";
    progresso.innerText = `Concluído: ${ok} enviado${ok !== 1 ? "s" : ""}, ${falha} falha${falha !== 1 ? "s" : ""}.`;
    btn.textContent = "Escolha outro arquivo pra reenviar";
    _waBulkRenderizarFalhas();
}

// Resumo do que não saiu: a tabela acima fica longa e mistura sucesso com erro,
// então as falhas ganham um bloco próprio, com o motivo de cada uma.
function _waBulkRenderizarFalhas() {
    const el = document.getElementById("wa-bulk-falhas");
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const falhas = _waBulkLinhas.filter(l => l.status === "erro");

    if (!falhas.length) { el.style.display = "none"; el.innerHTML = ""; return; }

    el.style.display = "";
    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#ef4444">
                ${falhas.length} não enviada${falhas.length !== 1 ? "s" : ""}
            </div>
            <button class="filtro-tab" onclick="_waBulkBaixarFalhas()">Baixar só as falhas (CSV)</button>
        </div>
        <div style="border:1px solid rgba(239,68,68,0.25);border-radius:10px;overflow:hidden">
            ${falhas.map(l => `
                <div style="display:flex;gap:12px;padding:9px 12px;border-top:1px solid rgba(255,255,255,0.04);font-size:12.5px">
                    <span style="font-family:monospace;color:#e2e8f0;white-space:nowrap">${l.numero || "—"}</span>
                    <span style="color:#94a3b8;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.valores[cfg.campoPedido] || l.valores.nome_cliente || ""}</span>
                    <span style="color:#ef4444;text-align:right">${l.erro || "Falhou"}</span>
                </div>`).join("")}
        </div>`;
}

// Devolve as falhas no mesmo formato do modelo: é só corrigir e subir de novo.
function _waBulkBaixarFalhas() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const falhas = _waBulkLinhas.filter(l => l.status === "erro");
    if (!falhas.length) return;

    const linhas = [
        [..._waBulkColunas(), "Motivo da falha"],
        ...falhas.map(l => [l.numero, ...cfg.campos.map(c => l.valores[c.id] || ""), l.erro || "Falhou"]),
    ];
    const csv = "﻿" + linhas.map(l => l.map(_waBulkCsvEscapar).join(",")).join("\r\n") + "\r\n";

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `falhas_${cfg.template}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
