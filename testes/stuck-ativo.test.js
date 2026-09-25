// Testes do botão "Enviar ativo" da tela Shopee > Stuck (js/shopee-stuck.js).
//
// O botão dispara o MESMO modelo de Ativos > Disparar — o texto, o nome do template
// aprovado na Meta e a ordem dos parâmetros moram em whatsapp-teste.js, e o Stuck só
// os reaproveita. O risco aqui não dá exceção nenhuma:
//
//   - a mensagem sair diferente da aprovada (texto copiado pra cá e esquecido lá);
//   - o botão aparecer pra quem o servidor vai recusar ("Acesso negado" em cima de
//     um cliente que a pessoa acabou de preencher);
//   - o código do pedido dentro do onclick: um com aspas quebra a linha inteira;
//   - duplo clique virando duas mensagens iguais no WhatsApp do cliente, que não
//     tem como desfazer.
//
// Os dois arquivos carregam no MESMO contexto, como no navegador (escopo global
// compartilhado), e o DOM é de mentira: só guarda o que a tela escreve nele.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const js = nome => fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");
const fonteWhatsapp = js("whatsapp-teste.js");
const fonteStuck = js("shopee-stuck.js");

// `let` do topo não vira propriedade do contexto: a ponte é anexada ao próprio script.
const ponte = `
;globalThis.__sst = {
    setRegistros: v => { _sstRegistros = v; },
    estado: () => ({ enviando: _sstAtivoEnviando, codigo: _sstAtivoCodigo }),
};`;

const plano = o => JSON.parse(JSON.stringify(o));

const desescapar = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Um "elemento" de mentira. O DOM daqui não interpreta HTML, com UMA exceção que o
 * navegador faria sozinho e o card depende: ao escrever <input value="..."> em
 * innerHTML, o campo passa a ter aquele valor. Sem reproduzir isso o teste teria que
 * digitar o código do pedido à mão e nunca notaria se o atributo deixasse de ser escrito.
 */
function criarElemento(obter) {
    let html = "";
    const el = {
        innerText: "", textContent: "", value: "", style: {}, disabled: false,
        className: "", dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
    };
    Object.defineProperty(el, "innerHTML", {
        get: () => html,
        set: v => {
            html = String(v);
            for (const tag of html.matchAll(/<input\b[^>]*>/g)) {
                const id = /\sid="([^"]+)"/.exec(tag[0]);
                if (!id) continue;
                const valor = /\svalue="([^"]*)"/.exec(tag[0]);
                obter(id[1]).value = valor ? desescapar(valor[1]) : "";
            }
        },
    });
    return el;
}

/**
 * @param {Object} opcoes
 * @param {string} opcoes.role Cargo de quem está logado.
 * @param {Object=} opcoes.resposta { ok, body } que o fetch de mentira devolve.
 */
function carregar({ role = "admin", resposta = { ok: true, body: { ok: true, id: "wamid.TESTE" } } } = {}) {
    const elementos = {};
    const obter = id => (elementos[id] ||= criarElemento(obter));
    const fetches = [];
    const chamadas = { modaisAbertos: [], modaisFechados: [], alertas: [], poloInvalidado: 0, poloGarantido: 0, timers: [] };

    const ctx = vm.createContext({
        console,
        JSON,
        Date,
        API: "http://api.teste",
        token: "tok-teste",
        document: {
            getElementById: obter,
            querySelectorAll: () => [],
            querySelector: () => null,
        },
        fetch: (url, opts) => {
            fetches.push({ url, opts });
            return Promise.resolve({ ok: resposta.ok, json: () => Promise.resolve(resposta.body) });
        },
        gcAlert: msg => chamadas.alertas.push(msg),
        _abrirModal: id => chamadas.modaisAbertos.push(id),
        _fecharModal: id => chamadas.modaisFechados.push(id),
        gcPoloInvalidar: () => { chamadas.poloInvalidado++; },
        gcPoloGarantir: () => { chamadas.poloGarantido++; },
        // Os timers não disparam sozinhos: o teste decide se e quando rodar.
        setTimeout: fn => { chamadas.timers.push(fn); return chamadas.timers.length; },
        window: { _gcUser: { role, name: "Atendente Teste" } },
    });
    ctx.globalThis = ctx;

    vm.runInContext(fonteWhatsapp, ctx, { filename: "whatsapp-teste.js" });
    vm.runInContext(fonteStuck + ponte, ctx, { filename: "shopee-stuck.js" });
    // `const` do topo não vira propriedade do contexto: lê pelo escopo do próprio vm.
    const cfg = vm.runInContext("WA_REC_TEMPLATES.shopee", ctx);
    return { ctx, api: ctx.__sst, cfg, elementos, fetches, chamadas };
}

const pedido = (codigo = "BR2600000001TESTE") => ({
    codigo, station_name: "XPT_SC_Caçador", buyer_city: "Caçador", tracking_status: "Parado",
    ageing_last_status: "5", driver_name: "Ana Teste", cogs: "10,00", Justificativa: "", justificativa_curta: "",
});

/** Deixa as promessas do fetch de mentira assentarem. */
const assentar = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };

/**
 * Preenche o que a pessoa digitaria depois de abrir o card. O código do pedido NÃO
 * entra aqui: ele tem que já estar no campo, vindo da linha.
 */
function preencher(elementos, { numero = "49999276131", nome = "Maria Teste", prazo = "48" } = {}) {
    elementos["sst-ativo-numero"].value = numero;
    elementos["sst-ativo-campo-nome_cliente"].value = nome;
    elementos["sst-ativo-prazo"].value = prazo;
}

const botaoDaLinha = codigo => ({ closest: sel => (sel === "tr" ? { dataset: { codigo } } : null) });

// ── montagem do envio (compartilhada com Ativos > Disparar) ──────────────

test("envio: telefone incompleto barra antes de qualquer coisa", () => {
    const { ctx, cfg } = carregar();
    const r = plano(ctx._waRecMontarEnvio({
        cfg, valores: { nome_cliente: "Maria", codigo_pedido: "BR1" },
        numero: "4999", prazo: 48, role: "admin",
    }));
    assert.match(r.erro, /Número incompleto/);
    assert.strictEqual(r.corpo, undefined);
});

test("envio: prazo é obrigatório só pra quem faz acareação (sac e dev)", () => {
    const { ctx, cfg } = carregar();
    const base = { cfg, valores: { nome_cliente: "Maria", codigo_pedido: "BR1" }, numero: "49999276131" };

    assert.strictEqual(plano(ctx._waRecMontarEnvio({ ...base, prazo: NaN, role: "sac" })).erro, "Informe o prazo em horas.");
    assert.strictEqual(plano(ctx._waRecMontarEnvio({ ...base, prazo: 0, role: "dev" })).erro, "Informe o prazo em horas.");
    // admin nem vê o campo: sem prazo não é erro, e o corpo leva null (não vence nada no funil)
    const admin = plano(ctx._waRecMontarEnvio({ ...base, prazo: NaN, role: "admin" }));
    assert.strictEqual(admin.erro, undefined);
    assert.strictEqual(admin.corpo.prazo_horas, null);
});

test("envio: prazo de sac/dev vai no corpo", () => {
    const { ctx, cfg } = carregar();
    const r = plano(ctx._waRecMontarEnvio({
        cfg, valores: { nome_cliente: "Maria", codigo_pedido: "BR1" },
        numero: "49999276131", prazo: 72, role: "sac",
    }));
    assert.strictEqual(r.corpo.prazo_horas, 72);
});

test("envio: campo em branco é apontado pelo rótulo", () => {
    const { ctx, cfg } = carregar();
    const r = plano(ctx._waRecMontarEnvio({
        cfg, valores: { nome_cliente: "", codigo_pedido: "BR1" },
        numero: "49999276131", prazo: 48, role: "admin",
    }));
    assert.strictEqual(r.erro, "Preencha: Nome do cliente");
});

test("envio: corpo usa o template aprovado da Shopee, com o pedido e a transportadora", () => {
    const { ctx, cfg } = carregar();
    const r = plano(ctx._waRecMontarEnvio({
        cfg, valores: { nome_cliente: "Maria Teste", codigo_pedido: "BR2600000001TESTE" },
        numero: "+55 49 9 9927-6131", prazo: 48, role: "admin",
    }));
    assert.strictEqual(r.corpo.numero, "5549999276131");
    assert.strictEqual(r.corpo.template, "confirmacao_entrega");
    assert.deepStrictEqual(r.corpo.parametros, ["Maria Teste", "BR2600000001TESTE"]);
    assert.strictEqual(r.corpo.pedido, "BR2600000001TESTE");
    assert.strictEqual(r.corpo.nome_cliente, "Maria Teste");
    // é ela que separa a conversa no funil de Ativos
    assert.strictEqual(r.corpo.transportadora, "shopee");
    assert.ok(r.corpo.texto.includes("BR2600000001TESTE") && r.corpo.texto.includes("Maria Teste"));
});

// ── botão na linha ───────────────────────────────────────────────────────

test("linha: quem enxerga os Ativos (sac, dev, admin) vê o botão e o cabeçalho da coluna", () => {
    for (const role of ["sac", "dev", "admin"]) {
        const { api, ctx, elementos } = carregar({ role });
        api.setRegistros([pedido("BR1TESTE"), pedido("BR2TESTE")]);
        ctx._sstRenderizar();
        const html = elementos["sst-tbody"].innerHTML;
        assert.strictEqual((html.match(/class="sst-ativo-btn"/g) || []).length, 2, role);
        assert.strictEqual(elementos["sst-th-ativo"].style.display, "", role);
    }
});

test("linha: quem o servidor recusaria não vê botão nem coluna", () => {
    for (const role of ["user", "finance", "entregador", null]) {
        const { api, ctx, elementos } = carregar({ role });
        api.setRegistros([pedido("BR1TESTE")]);
        ctx._sstRenderizar();
        assert.ok(!elementos["sst-tbody"].innerHTML.includes("sst-ativo-btn"), String(role));
        assert.strictEqual(elementos["sst-th-ativo"].style.display, "none", String(role));
    }
});

test("linha: o código não viaja dentro do onclick do botão (código com aspas não quebra a linha)", () => {
    const { api, ctx, elementos } = carregar();
    api.setRegistros([pedido('BR"1\'TESTE')]);
    ctx._sstRenderizar();
    const html = elementos["sst-tbody"].innerHTML;
    assert.ok(html.includes('data-codigo="BR&quot;1\'TESTE"'), html);
    const onclickDoAtivo = html.match(/<button[^>]*sst-ativo-btn[^>]*>/)[0];
    assert.ok(!onclickDoAtivo.includes("BR"), onclickDoAtivo);
});

// ── card de envio ────────────────────────────────────────────────────────

test("card: abre com o pedido da linha já preenchido e travado, e o resto em branco", () => {
    const { ctx, elementos, chamadas } = carregar({ role: "admin" });
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));

    assert.deepStrictEqual(chamadas.modaisAbertos, ["modal-sst-ativo"]);
    assert.strictEqual(elementos["sst-ativo-codigo"].innerText, "BR2600000001TESTE");
    const campos = elementos["sst-ativo-campos"].innerHTML;
    // os mesmos campos que Ativos > Disparar pede pra Shopee
    assert.ok(campos.includes("Nome do cliente") && campos.includes("Código do pedido"), campos);
    assert.ok(/id="sst-ativo-campo-codigo_pedido"[^>]*value="BR2600000001TESTE" readonly/.test(campos), campos);
    assert.ok(!/id="sst-ativo-campo-nome_cliente"[^>]*value=/.test(campos), campos);
    // a prévia já mostra o pedido, com o nome ainda no espaço em branco
    assert.ok(elementos["sst-ativo-preview"].innerText.includes("BR2600000001TESTE"));
    assert.ok(elementos["sst-ativo-preview"].innerText.includes("___"));
});

test("card: prazo aparece só pra sac e dev, igual ao formulário de Ativos", () => {
    const admin = carregar({ role: "admin" });
    admin.ctx._sstAbrirAtivo(botaoDaLinha("BR1TESTE"));
    assert.strictEqual(admin.elementos["sst-ativo-prazo-wrap"].style.display, "none");

    for (const role of ["sac", "dev"]) {
        const c = carregar({ role });
        c.ctx._sstAbrirAtivo(botaoDaLinha("BR1TESTE"));
        assert.strictEqual(c.elementos["sst-ativo-prazo-wrap"].style.display, "", role);
        assert.strictEqual(String(c.elementos["sst-ativo-prazo"].value), "48", role);
    }
});

test("card: linha sem código não abre nada", () => {
    const { ctx, chamadas } = carregar();
    ctx._sstAbrirAtivo({ closest: () => null });
    assert.deepStrictEqual(chamadas.modaisAbertos, []);
    assert.strictEqual(chamadas.alertas.length, 1);
});

test("card: reabrir limpa o número, a mensagem e destrava o botão", () => {
    const { ctx, elementos } = carregar();
    ctx._sstAbrirAtivo(botaoDaLinha("BR1TESTE"));
    elementos["sst-ativo-numero"].value = "49999276131";
    elementos["sst-ativo-btn-enviar"].disabled = true;
    elementos["sst-ativo-msg"].innerText = "Enviado!";

    ctx._sstAbrirAtivo(botaoDaLinha("BR2TESTE"));
    assert.strictEqual(elementos["sst-ativo-numero"].value, "");
    assert.strictEqual(elementos["sst-ativo-msg"].innerText, "");
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, false);
});

// ── envio ────────────────────────────────────────────────────────────────

test("enviar: manda o corpo certo pra /admin/whatsapp/enviar, com o token", async () => {
    const { ctx, elementos, fetches } = carregar({ role: "admin" });
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();

    assert.strictEqual(fetches.length, 1);
    assert.strictEqual(fetches[0].url, "http://api.teste/admin/whatsapp/enviar");
    assert.strictEqual(fetches[0].opts.method, "POST");
    assert.strictEqual(fetches[0].opts.headers.Authorization, "Bearer tok-teste");
    const corpo = JSON.parse(fetches[0].opts.body);
    assert.strictEqual(corpo.numero, "5549999276131");
    assert.strictEqual(corpo.template, "confirmacao_entrega");
    assert.deepStrictEqual(corpo.parametros, ["Maria Teste", "BR2600000001TESTE"]);
    assert.strictEqual(corpo.pedido, "BR2600000001TESTE");
    assert.strictEqual(corpo.transportadora, "shopee");
    assert.strictEqual(corpo.prazo_horas, null, "admin não define prazo");
});

test("enviar: sac manda o prazo junto", async () => {
    const { ctx, elementos, fetches } = carregar({ role: "sac" });
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos, { prazo: "72" });
    ctx._sstEnviarAtivo();
    await assentar();
    assert.strictEqual(JSON.parse(fetches[0].opts.body).prazo_horas, 72);
});

test("enviar: dado faltando mostra o erro, não chama o servidor e não trava o botão", async () => {
    const { ctx, elementos, fetches } = carregar();
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos, { numero: "" });
    ctx._sstEnviarAtivo();
    await assentar();

    assert.strictEqual(fetches.length, 0);
    assert.match(elementos["sst-ativo-msg"].innerText, /Informe o número/);
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, false);

    // corrigido o dado, o mesmo card envia normalmente
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();
    assert.strictEqual(fetches.length, 1);
});

test("enviar: duplo clique vira UMA mensagem só", async () => {
    const { ctx, elementos, fetches } = carregar();
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    ctx._sstEnviarAtivo(); // segundo clique antes da resposta chegar
    await assentar();
    assert.strictEqual(fetches.length, 1);
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, true);
});

test("enviar: depois de enviado continua travado e o card fecha sozinho", async () => {
    const { ctx, elementos, fetches, chamadas } = carregar();
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();

    assert.strictEqual(elementos["sst-ativo-msg"].innerText, "Enviado!");
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, true);
    ctx._sstEnviarAtivo(); // mandar de novo o mesmo ativo não tem volta
    await assentar();
    assert.strictEqual(fetches.length, 1);

    assert.strictEqual(chamadas.timers.length, 1);
    chamadas.timers[0]();
    assert.deepStrictEqual(chamadas.modaisFechados, ["modal-sst-ativo"]);
});

test("enviar: se a pessoa já abriu OUTRO pedido, o fechamento automático não derruba o card novo", async () => {
    const { ctx, elementos, chamadas } = carregar();
    ctx._sstAbrirAtivo(botaoDaLinha("BR1TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();

    ctx._sstAbrirAtivo(botaoDaLinha("BR2TESTE")); // abriu o próximo antes do timer
    chamadas.timers[0]();
    assert.deepStrictEqual(chamadas.modaisFechados, []);
});

test("enviar: recusa da Meta mostra o motivo, destrava o botão e deixa tentar de novo", async () => {
    const { ctx, elementos, fetches } = carregar({
        resposta: { ok: false, body: { error: "A Meta recusou o envio: número inválido" } },
    });
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();

    assert.strictEqual(elementos["sst-ativo-msg"].innerText, "A Meta recusou o envio: número inválido");
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, false);
    ctx._sstEnviarAtivo();
    await assentar();
    assert.strictEqual(fetches.length, 2);
});

test("enviar: polo pendente reabre a escolha de polo, como no formulário de Ativos", async () => {
    const { ctx, elementos, chamadas } = carregar({
        resposta: { ok: false, body: { error: "Escolha o seu polo antes de usar os Ativos.", polo_pendente: true } },
    });
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();
    assert.strictEqual(chamadas.poloInvalidado, 1);
    assert.strictEqual(chamadas.poloGarantido, 1);
});

test("enviar: sem servidor mostra o erro de conexão e destrava o botão", async () => {
    const { ctx, elementos } = carregar();
    ctx.fetch = () => Promise.reject(new Error("offline"));
    ctx._sstAbrirAtivo(botaoDaLinha("BR2600000001TESTE"));
    preencher(elementos);
    ctx._sstEnviarAtivo();
    await assentar();
    assert.strictEqual(elementos["sst-ativo-msg"].innerText, "Erro ao conectar com o servidor.");
    assert.strictEqual(elementos["sst-ativo-btn-enviar"].disabled, false);
});

// ── index.html ───────────────────────────────────────────────────────────

test("index.html tem todos os ids que o JS do card pede (senão o card abre em branco)", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const ids = [
        "modal-sst-ativo", "sst-ativo-codigo", "sst-ativo-numero", "sst-ativo-prazo-wrap", "sst-ativo-prazo",
        "sst-ativo-campos", "sst-ativo-preview", "sst-ativo-msg", "sst-ativo-btn-enviar", "sst-th-ativo",
    ];
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `falta id="${id}" no index.html`);
});
