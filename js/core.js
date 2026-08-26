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
                const { error } = await resp.clone().json();
                // Só sessão derruba. "Acesso negado" é falta de permissão pra aquela tela —
                // a sessão está viva, e deslogar aí seria expulsar quem clicou no lugar errado.
                if (/token/i.test(error || "")) _gcForcarSaida("expirou");
            } catch { /* corpo não-JSON não permite afirmar que é a sessão */ }
        }
    }
    return resp;
};

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
            // Teto de 24h, conta desativada ou senha resetada: a sessão acabou pra valer.
            const d = await resp.json().catch(() => ({}));
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

    window._gcUser = { name, username, displayName, role };
    document.querySelector(".username").innerText  = displayName;
    document.getElementById("welcome-name").innerText = displayName;

    if (role === "user") {
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
    const _showFinanceiro = () => {
        show("menu-financeiro");
        show("submenu-financeiro");
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
    // Fiscal (CT-e). Ver o menu não é o mesmo que poder emitir: o backend ainda
    // exige vínculo em fiscal_empresa_usuarios com pode_emitir. Aqui só decide
    // quem enxerga a opção.
    const _showFiscal = () => {
        show("menu-fiscal");
        show("submenu-fiscal");
    };

    if (role === "entregador") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-shopee");
        hide("submenu-shopee");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        hide("menu-custodia");
        hide("submenu-custodia");
        show("menu-fechamentos");
        show("submenu-fechamentos");
        show("menu-adiantamentos");
        show("submenu-adiantamentos");
        show("menu-baixas");
        show("submenu-baixas");
        show("menu-devolucoes");
        show("submenu-devolucoes");
        show("menu-conf-entregador");
        show("submenu-conf-entregador");
        // Ocorrências → Pacotes Faltantes: só aparece pro entregador liberado
        // (toggle em Cadastros → Entregadores, "Editar" → Ativar formulário de faltante)
        if (data.usuario.pode_pacote_faltante) {
            show("menu-ocorrencias");
            show("submenu-ocorrencias");
        }
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
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "motorista") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-shopee");
        hide("submenu-shopee");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        hide("menu-custodia");
        hide("submenu-custodia");
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
        _showOperacional();
        _showPlanejamento();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("menu-baixas");
        show("submenu-baixas");
        show("bip-sync-btn");
        // sem: financeiro, fechamento (só dev e finance)
    }

    if (role === "finance" || role === "dev") {
        _showOperacional();
        _showFechamentosAdmin();
        _showPlanejamento();
        _showFinanceiro();
        _showFiscal();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("menu-baixas");
        show("submenu-baixas");
        show("bip-sync-btn");
        if (role === "dev" || role === "finance") {
            show("btn-add-entregador"); // só dev/finance criam entregador/motorista novo
            show("btn-add-motorista");
        }
        if (role === "finance") {
        }
        if (role === "dev") {
            show("menu-item-todos-usuarios"); // visão de todos os usuários do sistema — só dev
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
        hide("menu-shopee");
        hide("submenu-shopee");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        hide("menu-custodia");
        hide("submenu-custodia");
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

// ───── SKELETON DE CARREGAMENTO (uso geral) ─────
// Formatos que imitam o conteúdo real de cada tela:
//   skTabela(n)  — cabeçalho + linhas com colunas (telas de tabela/listagem)
//   skCards(n)   — cards empilhados (históricos, viagens, transferências)
//   skDash()     — faixa de KPIs + gráfico (dashboards)
//   skLinhas(n)  — linhas simples (modais/popovers/containers pequenos)
// skMostrar(el, tipo, n) aplica no placeholder; skFim(el, texto) volta ao normal.
function skLinhas(linhas = 6) {
    return Array(linhas).fill(`
        <div style="display:flex;align-items:center;gap:14px;padding:12px 0">
            <div class="sk" style="width:9px;height:9px;border-radius:50%;flex-shrink:0"></div>
            <div class="sk sk-h8" style="width:26%;max-width:190px"></div>
            <div class="sk sk-h8" style="flex:1"></div>
            <div class="sk sk-h8" style="width:70px"></div>
        </div>`).join("");
}
function skHTML(linhas = 6) {
    return `<div class="sk-card" style="gap:0">${skLinhas(linhas)}</div>`;
}
function skTabela(linhas = 7) {
    const cols = [16, 24, 13, 11, 9];
    const header = `<div style="display:flex;gap:20px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.07)">`
        + cols.map(w => `<div class="sk sk-h8" style="width:${Math.max(6, w - 6)}%"></div>`).join("") + `</div>`;
    const row = `<div style="display:flex;align-items:center;gap:20px;padding:15px 18px;border-bottom:1px solid rgba(255,255,255,0.04)">`
        + cols.map(w => `<div class="sk sk-h8" style="width:${w}%"></div>`).join("") + `</div>`;
    return `<div class="sk-card" style="gap:0;padding:0;overflow:hidden">${header}${Array(linhas).fill(row).join("")}</div>`;
}
function skCards(n = 3) {
    return Array(n).fill(`
        <div class="sk-card" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
                <div class="sk" style="height:13px;width:30%;max-width:220px;border-radius:5px"></div>
                <div class="sk sk-h8" style="width:64px"></div>
            </div>
            <div class="sk sk-h8" style="width:55%;max-width:340px"></div>
            <div class="sk sk-h8" style="width:38%;max-width:240px"></div>
        </div>`).join("");
}
function skDash() {
    const kpi = `
        <div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:10px">
            <div class="sk sk-h8 sk-w60"></div>
            <div class="sk" style="height:26px;width:70px;border-radius:6px"></div>
            <div class="sk sk-h8 sk-w40"></div>
        </div>`;
    return `
        <div class="sk-card" style="margin-bottom:16px"><div style="display:flex;gap:24px;flex-wrap:wrap">${Array(4).fill(kpi).join("")}</div></div>
        <div class="sk-card" style="gap:14px">
            <div class="sk sk-h8" style="width:180px"></div>
            <div class="sk" style="height:240px;border-radius:10px"></div>
        </div>`;
}
function skMostrar(el, tipo = "tabela", n) {
    if (!el) return;
    el.classList.add("sk-mode");
    el.style.display = "";
    el.innerHTML = tipo === "cards" ? skCards(n || 3)
                 : tipo === "dash"  ? skDash()
                 : tipo === "fech"  ? (typeof _skeletonFechamento === "function" ? _skeletonFechamento() : skTabela(n || 7))
                 : tipo === "lista" ? skHTML(n || 6)
                 : skTabela(n || 7);
}
function skFim(el, texto) {
    if (!el) return;
    el.classList.remove("sk-mode");
    if (texto !== undefined) el.innerText = texto;
}
