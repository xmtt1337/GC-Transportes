const API   = "https://sistema-backend-i4uh.onrender.com";
// `let` e não `const`: a sessão se renova enquanto a pessoa trabalha, e todos os arquivos
// leem esta mesma variável na hora de montar o cabeçalho.
let token = localStorage.getItem("token");

if (!token) window.location.href = "login.html";

// ───── SESSÃO EXPIRADA ─────
// O token vale 8 horas. Quando vence no meio do expediente, cada tela mostrava um
// "Token inválido" solto e o sistema seguia como se nada tivesse acontecido — a pessoa
// ficava clicando sem entender por que nada respondia. Aqui a sessão morta derruba pro
// login de uma vez, com o motivo explicado lá.
let _gcSaindo = false;

function _gcForcarSaida(motivo, texto) {
    // Várias telas disparam requisição junto; sem esta trava seriam vários redirects.
    if (_gcSaindo) return;
    _gcSaindo = true;
    try { localStorage.removeItem("token"); } catch {}
    try {
        sessionStorage.setItem("gc_saida", motivo || "expirou");
        // Motivo específico (conta desativada, senha redefinida) vale mais que o genérico.
        if (texto) sessionStorage.setItem("gc_saida_texto", texto);
    } catch {}
    // replace e não href: voltar pra uma tela sem sessão não leva a lugar nenhum.
    window.location.replace("login.html");
}

const _gcFetchOriginal = window.fetch.bind(window);
window.fetch = async function (entrada, opcoes) {
    const alvo = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    // Troca o token do cabeçalho pelo atual. Várias telas montam a requisição com o valor
    // que leram quando carregaram; depois de uma renovação esse valor está velho, e sem
    // esta linha a pessoa seria deslogada justamente por estar trabalhando.
    if (alvo.startsWith(API) && opcoes && opcoes.headers && token) {
        const h = opcoes.headers;
        if (h instanceof Headers) {
            if (h.has("Authorization")) h.set("Authorization", "Bearer " + token);
        } else if (h.Authorization || h.authorization) {
            delete h.authorization;
            h.Authorization = "Bearer " + token;
        }
    }
    const resp = await _gcFetchOriginal(entrada, opcoes);
    if (resp.status === 401 || resp.status === 403) {
        if (alvo.startsWith(API) && !alvo.includes("/renovar-token")) {
            try {
                // clone porque ler o corpo aqui consumiria o que a tela ainda vai ler.
                const { error, sessao_substituida, motivo } = await resp.clone().json();
                if (sessao_substituida) {
                    // Login novo NESTE navegador (outra aba): adota e refaz o pedido, em vez
                    // de expulsar quem só tinha duas abas abertas.
                    if (_gcAdotarTokenDoNavegador()) return window.fetch(entrada, opcoes);
                    _gcForcarSaida("substituida", motivo);
                    return resp;
                }
                // Só sessão derruba. "Acesso negado" é falta de permissão pra aquela tela —
                // a sessão está viva, e deslogar aí seria expulsar quem clicou no lugar errado.
                if (/token/i.test(error || "")) _gcForcarSaida("expirou");
            } catch { /* corpo não-JSON não permite afirmar que é a sessão */ }
        }
    }
    return resp;
};

// A conta só fica aberta num aparelho por vez (servidor). Quando outro aparelho entra, este
// sai — mas antes vê se não foi uma aba deste mesmo navegador que entrou de novo: aí o login
// novo está no localStorage e serve aqui também.
function _gcAdotarTokenDoNavegador() {
    let salvo = null;
    try { salvo = localStorage.getItem("token"); } catch {}
    if (!salvo || salvo === token) return false;
    token = salvo;
    return true;
}

// Pergunta de tempos em tempos se esta ainda é a sessão da conta. É o que derruba o aparelho
// antigo NA HORA, mesmo parado na tela — sem isso ele só sairia no próximo clique. Só com a
// aba visível: aba escondida não está sendo usada, e ao voltar a pergunta sai na hora.
const _GC_PING_MS = 20 * 1000;
function _gcPingSessao() {
    if (_gcSaindo || !token || document.hidden) return;
    fetch(API + "/sessao/ping", { headers: { "Authorization": "Bearer " + token } }).catch(() => {});
}
setInterval(_gcPingSessao, _GC_PING_MS);
document.addEventListener("visibilitychange", _gcPingSessao);

// ───── RENOVAÇÃO DA SESSÃO ─────
// Renova só enquanto a pessoa está de fato usando. Renovar por relógio faria uma aba
// esquecida aberta manter a sessão viva pra sempre — pior que o problema original.
let _gcUltimaAtividade = Date.now();
let _gcRenovando = false;

["click", "keydown", "scroll", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => { _gcUltimaAtividade = Date.now(); }, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { _gcUltimaAtividade = Date.now(); _gcChecarSessao(); }
});

// Quando o token vence, lido do próprio token. Evita guardar a data em paralelo e ela
// dessincronizar do que o servidor realmente emitiu.
function _gcTokenExpiraEm(t) {
    try {
        const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return (payload.exp || 0) * 1000;
    } catch { return 0; }
}

const _GC_ATIVIDADE_MS = 30 * 60 * 1000;  // "está trabalhando" = mexeu na última meia hora
const _GC_MARGEM_MS    = 2 * 60 * 60 * 1000; // renova faltando 2h, com folga pra falha de rede

async function _gcChecarSessao() {
    if (_gcRenovando || _gcSaindo || !token) return;
    const expira = _gcTokenExpiraEm(token);
    if (!expira) return;
    if (expira - Date.now() > _GC_MARGEM_MS) return;                       // ainda tem prazo
    if (Date.now() - _gcUltimaAtividade > _GC_ATIVIDADE_MS) return;        // parou de usar

    _gcRenovando = true;
    try {
        const resp = await fetch(API + "/renovar-token", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token },
        });
        if (resp.ok) {
            const d = await resp.json();
            if (d.token) { token = d.token; localStorage.setItem("token", d.token); }
        } else if (resp.status === 401) {
            // Teto de 24h, conta desativada, senha resetada ou aberta em outro aparelho: a
            // sessão acabou pra valer (salvo login novo neste mesmo navegador).
            const d = await resp.json().catch(() => ({}));
            if (d.sessao_substituida && _gcAdotarTokenDoNavegador()) return;
            _gcForcarSaida(d.error === "sessao_max" ? "expirou" : "revogada", d.motivo);
        }
        // Outros erros (500, rede) ficam quietos: tenta de novo no próximo ciclo, e ainda
        // sobra prazo justamente por causa da margem de 2h.
    } catch { /* rede caiu; próxima tentativa */ }
    finally { _gcRenovando = false; }
}

setInterval(_gcChecarSessao, 5 * 60 * 1000);
_gcChecarSessao();

fetch(API + "/perfil", { headers: { "Authorization": "Bearer " + token } })
.then(res => { if (!res.ok) throw new Error(); return res.json(); })
.then(data => {
    const username    = data.usuario.username;
    const name        = data.usuario.name;
    const displayName = name || username;
    const role        = data.usuario.role;

    // antecipa_fora_prazo: liberação do dev pra pedir antecipação depois da data limite.
    window._gcUser = { name, username, displayName, role, antecipaForaPrazo: !!data.usuario.antecipa_fora_prazo };
    const chipNome = document.getElementById("perfil-chip-nome");
    if (chipNome) chipNome.innerText = displayName;
    // perfil-conta.js carrega depois deste arquivo; o perfil chega por fetch, então na
    // prática já existe — o typeof é só pra não derrubar o resto se faltar.
    if (typeof gcPerfilChipAvatar === "function") { gcPerfilChipAvatar(null); gcPerfilChipCarregarFoto(); }
    document.getElementById("welcome-name").innerText = displayName;

    // Todo cargo abre o card: foto, senha e e-mail são de todo mundo (o que muda por cargo
    // fica dentro do card, em nav.js).
    {
        const trigger = document.getElementById("username-trigger");
        if (trigger) {
            trigger.classList.add("perfil-trigger");
            trigger.onclick = (e) => abrirPerfilCard(e);
        }
    }

    const show = (id) => { const el = document.getElementById(id); if (el) el.style.display = ""; };
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };
    // Troca o rótulo de um menu (e o tooltip da barra recolhida). Serve pros casos em que
    // dois menus só convivem na tela de alguém — aí um deles precisa de outro nome.
    const _renomearMenu = (id, texto) => {
        const el = document.getElementById(id);
        if (!el) return;
        const label = el.querySelector(".label");
        const tip   = el.querySelector(".menu-tooltip");
        if (label) label.innerText = texto;
        if (tip)   tip.innerText = texto;
    };

    // ── Menus comuns para roles com acesso operacional ──
    const _showOperacional = () => {
        show("menu-desempenho-bip");
    };
    const _showFechamentosAdmin = () => {
        show("menu-fechamento");
        show("submenu-fechamento");
    };
    const _showPlanejamento = () => {
        show("menu-planejamento");
        show("submenu-planejamento");
    };
    const _showFinanceiroFiscal = () => {
        show("menu-financeiro");
        show("submenu-financeiro");
    };
    // Sistema só aparece junto de um item dele: o menu em si não diz nada.
    const _showSistema = (item) => {
        show("menu-sistema");
        show("submenu-sistema");
        show(item);
    };
    const _showCadastros = () => {
        show("menu-cadastros");
        show("submenu-cadastros");
    };
    const _showExtravios = () => {
        show("menu-extravios");
        show("submenu-extravios");
    };
    const _showTorreControle = () => {
        show("menu-torrecontrole");
        show("submenu-torrecontrole");
    };

    if (role === "entregador") {
        hide("menu-operacao");
        hide("submenu-operacao");
        show("menu-ent-rota");
        show("submenu-ent-rota");
        show("menu-ent-desempenho");
        show("submenu-ent-desempenho");
        show("menu-ent-pagamentos");
        show("submenu-ent-pagamentos");
        // Pacotes Faltantes: só aparece pro entregador liberado
        // (toggle em Cadastros → Entregadores, "Editar" → Ativar formulário de faltante)
        if (data.usuario.pode_pacote_faltante) show("menu-ocorrencias");
        // Anotações de Quantidade: só aparece pro entregador liberado
        // (toggle em Cadastros → Entregadores, "Editar" → Ativar Anotações de Quantidade).
        if (data.usuario.pode_anotar_quantidade) show("menu-anotacoes");
        // "Na rua hoje" na tela inicial: só pro entregador liberado
        // (toggle em Cadastros → Entregadores, "Editar" → Ativar Na rua hoje).
        if (data.usuario.pode_ver_na_rua && typeof _enrCarregar === "function") _enrCarregar();
        // Mesma liberação abre a Performance (o registro por dia).
        if (data.usuario.pode_ver_na_rua) show("menu-ent-performance");
        // POD Shopee: todo entregador; a tela inicial mostra a semana mais recente dele.
        show("menu-pod-shopee");
        if (typeof _pdsCarregarHome === "function") _pdsCarregarHome();
        // Quem leva rota e também roda transferência ganha as duas telas do motorista
        // (toggle em Cadastros → Entregadores, "Editar" → Liberar telas de motorista).
        // Continua sendo entregador: fechamento, NF e conferência de rota seguem iguais.
        if (data.usuario.faz_motorista) {
            show("menu-transferencias");
            show("submenu-transferencias");
            show("menu-devolucoes-motorista");
            show("submenu-devolucoes-motorista");
            // Os dois menus se chamam "Devoluções" e têm o mesmo ícone, mas são coisas
            // opostas: no do entregador ele REGISTRA o pacote que não entregou; no do
            // motorista ele RECOLHE as devoluções que os outros registraram. Lado a lado
            // viravam dois itens idênticos, e a pessoa escolheria no chute.
            _renomearMenu("menu-devolucoes-motorista", "Coleta de devoluções");
        }
        // Enquete do planejamento (00:00–14:00, só entregador fixo): o quadro abre sozinho
        // e só sai quando ele responde. Quem não tem enquete pendente não vê nada.
        if (typeof _peVerificar === "function") _peVerificar();
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "motorista") {
        hide("menu-operacao");
        hide("submenu-operacao");
        show("menu-transferencias");
        show("submenu-transferencias");
        show("menu-devolucoes-motorista");
        show("submenu-devolucoes-motorista");
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "user") {
        _showOperacional();
        _showCadastros();
        show("bip-sync-btn");
        // sem: fechamentos admin, financeiro, extravios
    }

    if (role === "admin") {
        show("btn-add-entregador"); // admin cria entregador e motorista
        show("btn-add-motorista");
        _showOperacional();
        _showPlanejamento();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("bip-sync-btn");
        _showSistema("menu-macros"); // só a seção Colador aparece pra admin (macros.js filtra o resto)
        // Consulta de NFs é leitura — aberta pra admin, diferente do resto do Financeiro e Fiscal.
        _showFinanceiroFiscal();
        document.querySelectorAll("#submenu-financeiro .fin-restrito").forEach(el => { el.style.display = "none"; });
        // sem: financeiro, fechamento (só dev e finance)
    }

    if (role === "finance" || role === "dev") {
        _showOperacional();
        _showFechamentosAdmin();
        _showPlanejamento();
        _showFinanceiroFiscal();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("bip-sync-btn");
        _showSistema("menu-item-agency-router");
        if (role === "dev" || role === "finance") {
            show("btn-add-entregador"); // dev/finance criam entregador e motorista
            show("btn-add-motorista");
        }
        if (role === "finance") {
        }
        if (role === "dev") {
            show("menu-item-anotacoes-relatorio"); // relatório consolidado de Anotações de Quantidade — só dev
            show("menu-macros"); // liga/desliga e configura tarefas automáticas — só dev
            show("menu-item-ticketlog"); // cartões Ticketlog e valor de cada um — só dev
        }
    }

    if (role === "sac") {
        _showExtravios();
        _showCadastros(); // sac fica acima do admin na gestão de entregadores
        _showTorreControle(); // pacotes faltantes/transferências: admin, dev, sac e finance veem
        hide("menu-item-etiquetas"); // etiquetas é só do pessoal operacional (user até dev)
    }

    if (role === "ADM Videira") {
        hide("menu-operacao");
        hide("submenu-operacao");
        show("menu-videira");
        show("submenu-videira");
        // Alimentar só para dev
    }

    // Registro de Pacotes Faltantes: entregador usa o menu Ocorrências, com toggle liberado
    // (acima). Os demais cargos (user, admin, finance, dev, sac, motorista, ADM Videira) já têm
    // acesso direto, como item dentro de Operação — entra na mesma lista/tabela compartilhada.
    if (role !== "entregador") {
        show("menu-item-pacotes-faltantes-op");
    }

    // Ativos (disparo e conversas): sac e dev fazem acareação, com prazo e funil;
    // admin vê só os demais ativos. A própria tela decide o que mostrar por cargo.
    if (["sac", "dev", "admin"].includes(role)) {
        show("menu-ativos");
        show("submenu-ativos");
    }

    // Central de Atendimento: o balãozinho do canto, pra todo cargo. Quem decide
    // se esta conta o vê ou vê o menu do suporte é o servidor — ver js/atendimento.js.
    if (typeof atdIniciar === "function") atdIniciar();

    // Item de menu limitado a alguns cargos. É só o que aparece: quem manda é o servidor.
    document.querySelectorAll("#sidebar [data-roles]").forEach(el => {
        if (!el.dataset.roles.split(" ").includes(role)) el.style.display = "none";
    });

    renderHomeActions(role);

    const badgeLabels = {
        dev: "Dev", admin: "Administrador", finance: "Financeiro",
        user: "Usuário", entregador: "Entregador", sac: "SAC", motorista: "Motorista"
    };
    const badgeColors = {
        dev: "#a78bfa", admin: "#fb923c", finance: "#34d399",
        user: "#3a86ff", entregador: "#22c55e", sac: "#06b6d4", "ADM Videira": "#e879f9", motorista: "#f59e0b"
    };
    const badge = document.getElementById("home-role-badge");
    if (badge) {
        const cor = badgeColors[role] || "#3a86ff";
        badge.innerHTML = `<span class="role-dot" style="background:${cor}"></span>${badgeLabels[role] || role}`;
        badge.style.color       = cor;
        badge.style.borderColor = cor + "3d";
        badge.style.background  = cor + "14";
    }

    // Abre direto a tela indicada na URL (ex.: /GC-Transportes/Baixas/TotalExpress),
    // se houver uma — feito só depois dos menus do cargo estarem prontos.
    if (typeof _rotaAbrirAtual === "function") _rotaAbrirAtual();

})
.catch(() => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});

// ───── CARREGANDO (uso geral) ─────
// Logo XM quicando sobre um fundo fosco, no lugar do skeleton cinza. A imagem vem do CSS
// (.xm-carregando::before), não de um <img>: o caminho no CSS conta a partir do style.css,
// e um "img/..." no HTML quebraria nas URLs fundas (/Operacao/Shopee/...).
//   skLogo()        — bloco de tela (tabelas, cards, dashboards)
//   skLogo(true)    — compacto, pra modal/popover/linha de tabela
//   skLogo(c, "Transmitindo para a SEFAZ") — texto do passo no lugar de "Carregando".
//     O texto entra como HTML: quem passa dado do usuário escapa antes.
// Os nomes antigos (skTabela, skCards, skDash, skHTML, skLinhas) continuam, pra quem já
// chamava; o "n" de linhas não importa mais.
function skLogo(compacto = false, texto = "Carregando") {
    return `<div class="xm-carregando${compacto ? " xm-carregando-p" : ""}" role="status"><span>${texto}</span></div>`;
}
function skLinhas() { return skLogo(true); }
function skHTML()   { return skLogo(); }
function skTabela() { return skLogo(); }
function skCards()  { return skLogo(); }
function skDash()   { return skLogo(); }
function skMostrar(el) {
    if (!el) return;
    el.classList.add("sk-mode");
    el.style.display = "";
    el.innerHTML = skLogo();
}
function skFim(el, texto) {
    if (!el) return;
    el.classList.remove("sk-mode");
    if (texto !== undefined) el.innerText = texto;
}
