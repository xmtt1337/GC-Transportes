// ───── NAVEGAÇÃO ENTRE TELAS ─────
const _TELA_TITULOS = {
    "tela-shopee-stuck":         "Shopee — Stuck — Planilha Andre",
    "tela-shopee-stuck-backlog": "Shopee — Stuck — Backlog",
    "tela-painel-alimentar":     "Alimentar",
    "tela-fiscal-empresas":      "Empresa emitente",
    "tela-fiscal-ctes":          "CT-e",
    "tela-fiscal-novo-cte":      "Novo CT-e",
    "tela-fiscal-certificado":   "Certificado Digital",
    "tela-fiscal-tributacao":    "Tributação IBS/CBS",
    "tela-home":                 "Painel",
    "tela-ent-performance":      "Performance por dia",
    "tela-admin":                "Alimentar",
    "tela-admin-fechamentos":    "Pesquisar Fechamentos",
    "tela-admin-nfs":            "Notas Fiscais",
    "tela-conf-nfs":             "Conferência NF",
    "tela-admin-pagamentos":     "Pagamentos",
    "tela-faturas":              "Gerador de Faturas",
    "tela-trampay-entregadores": "Entregadores",
    "tela-admin-usuarios":       "Entregadores",
    "tela-admin-motoristas":     "Motoristas",
    "tela-custodia":             "Custódia de pacotes",
    "tela-admin-usuarios-gc":    "Usuários",
    "tela-dashboard":            "Dashboard",
    "tela-ent-dashboard":        "Dashboard",
    "tela-fechamentos":          "Meus Fechamentos",
    "tela-minhas-nfs":           "Notas Fiscais",
    "tela-extravios-dash":       "Extravios",
    "tela-extravios-busca":      "Pesquisar Extravio",
    "tela-conferencias":         "Conferências",
    "tela-solicitar-at":         "Criar AT",
    "tela-shopee-receber":       "Shopee — Recebimento",
    "tela-shopee-romaneiro":     "Shopee — Romaneiro",
    "tela-shopee-at":            "Shopee — AT Exportada",
    "tela-shopee-pedidos":       "Shopee — Pedidos Pesquisados",
    "tela-shopee-linehaul":      "Shopee — LineHaul",
    "tela-shopee-atribuicoes":   "Shopee — Atribuições",
    "tela-shopee-avariado":      "Shopee — Item Avariado",
    "tela-bipagens":             "Separação",
    "tela-pesquisar-pedidos":    "Histórico de pedidos",
    "tela-desempenho-bip":       "Desempenho",
    "tela-alimentar":            "Alimentar",
    "tela-antecipacoes":         "Solicitar Antecipação",
    "tela-minhas-solicitacoes":  "Minhas Solicitações",
    "tela-admin-antecipacoes":   "Antecipações",
    "tela-baixa-te":             "Baixas — Total Express",
    "tela-admin-baixas-te":      "Baixas — Total Express",
    "tela-devolucao-nova":       "Registrar Devolução",
    "tela-devolucao-enviadas":   "Registro",
    "tela-viagem-fechar":        "Fechar Viagem",
    "tela-viagem-minhas":        "Minhas Viagens",
    "tela-devolucao-receber":    "Receber Viagem",
    "tela-devolucao-receber-avulso": "Receber Avulso",
    "tela-devolucao-registro":   "Registro de Devoluções",
    "tela-etiquetas":            "Impressão de Etiquetas",
    "tela-pacotes-faltantes":          "Pacotes Faltantes",
    "tela-pacotes-faltantes-registro": "Meus Pacotes Faltantes",
    "tela-torre-na-rua":            "Na Rua",
    "tela-torre-pacotes-faltantes": "Pacotes Faltantes",
    "tela-torre-transferencias":    "Transferências",
    "tela-transferencia-nova":      "Registrar Entrega",
    "tela-transferencia-historico": "Histórico de Transferências",
    "tela-motorista-buscar":        "Coletar Viagem",
    "tela-motorista-cargas":        "Minhas Cargas",
    "tela-videira-alimentar":    "Alimentar Fechamento",
    "tela-videira-painel":       "Meu Fechamento",
    "tela-videira-dash":         "Dashboard",
    "tela-atendimento":          "Atendimento",
    "tela-em-breve":             "Em Breve",
    "tela-torre-alimentar":      "Alimentar",
    "tela-criar-fechamento":     "Criar Fechamento",
    "tela-resumo-quinzena":      "Resumo da Quinzena",
    "tela-ajustes-fechamento":   "Acréscimos e Descontos",
    "tela-ticketlog-info":       "TicketLog — Informações",
};

function mostrarTela(id, rota) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    document.getElementById(id).classList.add("active-view");
    const titulo = document.getElementById("titulo-pagina");
    if (titulo && _TELA_TITULOS[id]) titulo.innerText = _TELA_TITULOS[id];
    // Sempre fecha/recolhe a sidebar ao navegar
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.remove("expanded");
    document.getElementById("sidebar-backdrop").classList.remove("active");
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));

    if (typeof _rotaAtualizarUrl === "function") {
        _rotaAtualizarUrl(rota !== undefined ? rota : (typeof _TELA_ROTAS !== "undefined" ? _TELA_ROTAS[id] : undefined));
    }

    // A barra de abas das conferências mora DENTRO de cada tela, não é uma tela.
    // O gancho fica aqui porque toda navegação passa por mostrarTela: assim o
    // destaque acerta também em link direto e no botão voltar, não só no clique
    // da aba. E fica no FIM porque a barra também marca o menu lateral — antes
    // da limpeza acima, a marca seria apagada no mesmo instante.
    if (typeof _chubPintar === "function") _chubPintar(id);
}


// ───── SOM DE FEEDBACK (bipagem, baixas etc.) ─────
// Contexto único compartilhado — precisa nascer dentro de um gesto do usuário pra
// não ficar bloqueado (regra de autoplay do navegador, principalmente no iOS).
let _gcAudioCtx = null;

function _gcInicializarAudio() {
    if (_gcAudioCtx) return;
    try { _gcAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}

function _gcTocarTom(notas, volume) {
    try {
        _gcInicializarAudio();
        const ctx = _gcAudioCtx;
        if (!ctx) return;
        ctx.resume().then(() => {
            const t = ctx.currentTime;
            notas.forEach(([inicio, freq, tipo, dur]) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = tipo;
                osc.frequency.setValueAtTime(freq, t + inicio);
                gain.gain.setValueAtTime(volume, t + inicio);
                gain.gain.exponentialRampToValueAtTime(0.001, t + inicio + dur);
                osc.start(t + inicio);
                osc.stop(t + inicio + dur);
            });
        });
    } catch (_) {}
}

// Ding-dong ascendente — usado em qualquer confirmação de sucesso (bipagem, baixa).
// Onda quadrada (mesma do erro) + faixa de frequência onde alto-falante de celular
// reproduz mais forte — com o ganho já no máximo (1), só isso aumenta o volume percebido.
function _gcBeepSucesso() {
    _gcTocarTom([[0, 880, "square", 0.13], [0.13, 1320, "square", 0.24]], 1);
}

// Onda quadrada (mais "cortante" que seno) + volume bem mais alto que o beep antigo
function _gcBeepErro() {
    _gcTocarTom([[0, 440, "square", 0.22], [0.24, 300, "square", 0.22]], 0.9);
}

// Voz feminina "Cluster errado" — pacote de outra rota na conferência. Som diferente do
// bipe de erro pra quem bipa em rajada saber, sem olhar a tela, que o pacote é de outro
// cluster (e não um pacote sem dados). Toca pelo mesmo AudioContext dos bipes: um <audio>
// solto seria barrado pelo autoplay, já que o som sai na resposta do servidor, fora do
// gesto. Enquanto o arquivo não carregou (ou se falhar), cai no bipe de erro.
let _gcVozClusterBuf = null;
let _gcVozClusterCarregando = null;

function _gcCarregarVozCluster() {
    if (_gcVozClusterBuf || _gcVozClusterCarregando) return _gcVozClusterCarregando;
    _gcInicializarAudio();
    const ctx = _gcAudioCtx;
    if (!ctx) return null;
    _gcVozClusterCarregando = fetch("sons/cluster-errado.mp3?v=20261001b")
        .then(r => r.arrayBuffer())
        .then(b => new Promise((ok, falha) => ctx.decodeAudioData(b, ok, falha)))
        .then(buf => { _gcVozClusterBuf = buf; })
        .catch(() => { _gcVozClusterCarregando = null; });
    return _gcVozClusterCarregando;
}

function _gcVozClusterErrado() {
    try {
        _gcInicializarAudio();
        const ctx = _gcAudioCtx;
        if (!ctx || !_gcVozClusterBuf) { _gcCarregarVozCluster(); return _gcBeepErro(); }
        ctx.resume().then(() => {
            const src = ctx.createBufferSource();
            src.buffer = _gcVozClusterBuf;
            src.connect(ctx.destination);
            src.start();
        });
    } catch (_) { _gcBeepErro(); }
}

// ───── FALA (texto que muda a cada bipe, ex. rota + entregador na separação) ─────
// Nome de entregador não dá pra pré-gravar, então o servidor gera (GET /fala) na MESMA
// Francisca do "Clãster errado" — igual em qualquer navegador. Toca pelo AudioContext dos
// bipes (um <audio> solto seria barrado pelo autoplay: o som sai na resposta, fora do gesto).
// Só se o servidor falhar cai na voz do navegador, que é melhor que silêncio.
const _gcFalaCache = new Map(); // texto → AudioBuffer: frase repetida sai na hora
let _gcFalaSeq = 0;             // só a fala do último bipe toca
let _gcFalaFonte = null;        // o que está tocando agora, pra cortar no bipe seguinte

function _gcFalar(texto) {
    if (!texto) return;
    const seq = ++_gcFalaSeq;
    // Bipe novo corta a fala anterior: em rajada, fila de nomes atrasados confunde
    // mais do que ajuda — vale o pacote que está na mão agora.
    _gcPararFala();
    try {
        _gcInicializarAudio();
        const ctx = _gcAudioCtx;
        if (!ctx) return _gcFalarNavegador(texto);
        const chave = texto.toLowerCase();
        const pronto = _gcFalaCache.get(chave);
        const buf = pronto ? Promise.resolve(pronto)
            : fetch(`${API}/fala?texto=${encodeURIComponent(texto)}`, {
                headers: { "Authorization": "Bearer " + token },
            }).then(r => { if (!r.ok) throw new Error("fala " + r.status); return r.arrayBuffer(); })
              .then(b => new Promise((ok, falha) => ctx.decodeAudioData(b, ok, falha)))
              .then(b => { _gcFalaCache.set(chave, b); return b; });
        buf.then(b => {
            if (seq !== _gcFalaSeq) return; // já bipou outro pacote
            return ctx.resume().then(() => {
                if (seq !== _gcFalaSeq) return;
                const src = ctx.createBufferSource();
                src.buffer = b;
                src.connect(ctx.destination);
                src.start();
                _gcFalaFonte = src;
            });
        }).catch(() => { if (seq === _gcFalaSeq) _gcFalarNavegador(texto); });
    } catch (_) { _gcFalarNavegador(texto); }
}

function _gcPararFala() {
    try { if (_gcFalaFonte) _gcFalaFonte.stop(); } catch (_) {}
    _gcFalaFonte = null;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
}

// Reserva: voz do navegador, a feminina pt-BR mais natural que houver. A "Maria" local
// do Windows é robótica e só entra se não houver outra.
const _GC_VOZES_PREFERIDAS = [/francisca.*natural/i, /thalita.*natural/i, /francisca/i, /thalita/i,
    /google.*portugu/i, /luciana/i];

function _gcEscolherVoz(vozes) {
    const ptbr = (vozes || []).filter(v => /^pt[-_]BR$/i.test(v.lang));
    for (const re of _GC_VOZES_PREFERIDAS) {
        const v = ptbr.find(x => re.test(x.name));
        if (v) return v;
    }
    return ptbr.find(v => !/maria|daniel|antonio/i.test(v.name)) || ptbr[0] || null;
}

// No Chrome a lista de vozes chega vazia na 1ª chamada e só enche depois do evento;
// pedir já no carregamento faz a 1ª fala sair com a voz certa e não a padrão.
try {
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
} catch (_) {}

function _gcFalarNavegador(texto) {
    try {
        const s = window.speechSynthesis;
        if (!s || !texto) return;
        s.cancel();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = "pt-BR";
        const voz = _gcEscolherVoz(s.getVoices());
        if (voz) u.voice = voz;
        s.speak(u);
    } catch (_) {}
}

// "VID-15" → "15". Sem número no fim, nada (fala só o nome).
function _gcNumeroDaSigla(sigla) {
    const m = String(sigla || "").match(/(\d+)\s*$/);
    return m ? String(Number(m[1])) : "";
}

// ── Porcentagem ──
// Sempre com duas casas, menos quando fecha em 100% (ou 0%), que não precisa de decimal.
// Arredondar para inteiro escondia progresso real: 2 de 455 vira "0%" e parece que nada
// foi feito; 453 de 455 vira "100%" e parece que acabou.
function gcPct(parte, total) {
    if (!total) return null;
    return (Number(parte) / Number(total)) * 100;
}

function gcPctTexto(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return "—";
    // Só as pontas exatas dispensam as casas; 99,996% continua mostrando que falta algo.
    if (pct >= 100) return "100%";
    if (pct <= 0)   return "0%";
    return pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function _emBreve(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-em-breve");
}

// ───── COPIAR PARA A ÁREA DE TRANSFERÊNCIA ─────
// navigator.clipboard só existe em contexto seguro (HTTPS ou localhost). Este
// site é servido em HTTP, então lá ele nem aparece — e quem chamou direto caía
// no catch com "não consegui copiar", que era o botão simplesmente não
// funcionando no celular do entregador.
//
// O caminho antigo (execCommand) não tem essa exigência e funciona em HTTP. Ele
// está obsoleto, mas obsoleto que copia vale mais que moderno que não roda.
// Quando o domínio ganhar certificado, o de cima passa a ser usado sozinho.
function gcCopiar(texto) {
    const valor = String(texto == null ? "" : texto);
    if (!valor) return Promise.reject(new Error("nada pra copiar"));

    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(valor).catch(() => _gcCopiarAntigo(valor));
    }
    return _gcCopiarAntigo(valor);
}

function _gcCopiarAntigo(valor) {
    return new Promise((resolve, reject) => {
        const campo = document.createElement("textarea");
        campo.value = valor;
        // readonly pra não abrir o teclado no celular; fora da tela pra não
        // piscar nem empurrar o layout.
        campo.setAttribute("readonly", "");
        campo.style.position = "fixed";
        campo.style.top = "-1000px";
        campo.style.opacity = "0";
        document.body.appendChild(campo);
        try {
            campo.select();
            // O Safari do iPhone ignora select() sozinho: sem isto o botão não
            // copia nada em metade dos celulares da rua.
            campo.setSelectionRange(0, valor.length);
            const deu = document.execCommand("copy");
            deu ? resolve() : reject(new Error("o navegador recusou"));
        } catch (e) {
            reject(e);
        } finally {
            document.body.removeChild(campo);
        }
    });
}

// ───── EXTRAVIOS CARDS ─────
function _renderExtravios(lista, containerId, showWa) {
    const el = document.getElementById(containerId);
    if (!lista.length) {
        el.innerHTML = `<div class="extr-vazio">Nenhum extravio no período</div>`;
        return;
    }
    el.innerHTML = lista.map(e => {
        const wa = showWa ? (() => {
            const msg = encodeURIComponent(`Olá! Eu gostaria de contestar um pedido da ${e.transportadora}.\nCódigo: ${e.codigo}`);
            return `<a class="extr-wa" href="https://wa.me/554991984179?text=${msg}" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                Contestar
            </a>`;
        })() : "";
        return `<div class="extr-card">
            <div class="extr-top">
                <span class="extr-transp">${e.transportadora}</span>
                <span class="extr-codigo">${e.codigo}</span>
            </div>
            <div class="extr-endereco">${e.endereco}</div>
            <div class="extr-bottom">
                <span class="extr-valor${e.tem_valor ? ' val-neg' : ''}">${e.valor}</span>
                ${wa}
            </div>
        </div>`;
    }).join("");
}

function _renderMultas(lista, elId, showWa = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!lista || !lista.length) { el.innerHTML = `<div class="extr-vazio">Nenhuma multa no período</div>`; return; }
    const waIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>`;
    el.innerHTML = lista.map(m => {
        const wa = showWa ? (() => {
            const msg = encodeURIComponent(`Olá! Eu gostaria de contestar uma multa da ${m.transportadora}.\nCódigo: ${m.codigo}`);
            return `<a class="extr-wa" href="https://wa.me/554991984179?text=${msg}" target="_blank" rel="noopener noreferrer">${waIcon} Contestar</a>`;
        })() : "";
        return `<div class="extr-card">
            <div class="extr-top">
                <span class="extr-transp">${m.transportadora}</span>
                <span class="extr-codigo">${m.codigo}</span>
            </div>
            <div class="extr-bottom">
                <span class="extr-valor${m.tem_valor ? ' val-neg' : ''}">${m.valor}</span>
                ${wa}
            </div>
        </div>`;
    }).join("");
}

// ───── CARD DE PERFIL ─────
// Linhas do mês no card de perfil. As duas primeiras são da Shopee fora de
// Operação > Bipagens; "Shopee" sozinho é a bipagem feita lá.
const _TRANSP = [
    { key: "recebimento", label: "Recebimento Shopee",  cor: "#F97316" },
    { key: "conferencia", label: "Conferências Shopee", cor: "#F97316" },
    { key: "loggi",  label: "Loggi",  cor: "#12A5E8" },
    { key: "anjun",  label: "Anjun",  cor: "#22C55E" },
    { key: "jt",     label: "J&T",    cor: "#EF4444" },
    { key: "imile",  label: "iMile",  cor: "#9333EA" },
    { key: "shopee", label: "Shopee", cor: "#F97316" },
];
const _MES_NOMES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function abrirPerfilCard(e) {
    if (e) e.stopPropagation();
    const card = document.getElementById("perfil-card");
    if (!card) return;
    if (card.style.display !== "none") { fecharPerfilCard(); return; }

    // Move para <body> para escapar de qualquer stacking context pai
    if (card.parentElement !== document.body) document.body.appendChild(card);

    // Posiciona abaixo do trigger
    const trigger = document.getElementById("username-trigger");
    if (trigger) {
        const rect = trigger.getBoundingClientRect();
        card.style.top   = (rect.bottom + 10) + "px";
        card.style.right = (window.innerWidth - rect.right) + "px";
        card.style.left  = "auto";
    }

    card.style.display = "block";
    card.onclick = ev => ev.stopPropagation();
    card.innerHTML = `<div style="padding:14px 16px">${skLinhas(2)}</div>`;

    document.addEventListener("click", _pcClickFora);

    // Conta (foto, e-mail, polo) é de todo mundo. Nível e bipagens só o role user tem; o
    // dev troca o próprio polo ali mesmo, então precisa do polo carregado em shopee-polo.js.
    const role = (window._gcUser || {}).role;
    const tok = localStorage.getItem("token");
    const json = url => fetch(API + url, { headers: { "Authorization": "Bearer " + tok } })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
    Promise.all([
        json("/meus-dados"),
        role === "user" ? json("/meu-perfil") : null,
        role === "dev" ? gcPoloCarregar(true) : null,
    ])
    .then(([conta, desempenho, polo]) => _renderPerfilCard(card, { conta, desempenho, polo }))
    .catch(() => { card.innerHTML = `<div style="padding:16px;color:#f87171;font-size:12px">Erro ao carregar</div>`; });
}

function fecharPerfilCard() {
    const card = document.getElementById("perfil-card");
    if (card) card.style.display = "none";
    document.removeEventListener("click", _pcClickFora);
}

function _pcClickFora(e) {
    const card = document.getElementById("perfil-card");
    const trigger = document.getElementById("username-trigger");
    if (card && !card.contains(e.target) && !(trigger && trigger.contains(e.target))) fecharPerfilCard();
}

const _PC_ROLE_LABELS = { user: "Usuário", admin: "Administrador", dev: "Dev", finance: "Financeiro", sac: "SAC", entregador: "Entregador", motorista: "Motorista" };

const _PC_SVG = {
    key:  `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    star: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    scan: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    pin:  `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    cam:  `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
};

// Avatar é o botão da foto: clicar escolhe/troca. A foto só entra se o servidor validou
// como data URL de imagem (modules/perfil), então pode ir direto no src.
function _pcCabecalho(u, foto) {
    const inicial = (u.displayName || u.name || u.username || "?")[0].toUpperCase();
    return `
        <div class="pc-header">
            <button type="button" class="pc-avatar pc-avatar-btn" data-pc="foto" title="${foto ? "Trocar foto" : "Adicionar foto"}">
                ${foto ? `<img src="${foto}" alt="">` : inicial}
                <span class="pc-avatar-cam">${_PC_SVG.cam}</span>
            </button>
            <div>
                <div class="pc-name">${_gcEsc(u.displayName || u.name || u.username || "—")}</div>
                <div class="pc-meta">@${_gcEsc(u.username)} · ${_PC_ROLE_LABELS[u.role] || u.role || ""}</div>
            </div>
        </div>`;
}

function _pcSecaoDesempenho(d) {
    const max = Math.max(..._TRANSP.map(t => d.mensal?.[t.key] || 0), 1);
    const transpRows = _TRANSP.map(t => {
        const val = d.mensal?.[t.key] || 0;
        const pct = Math.round((val / max) * 100);
        return `<div class="pc-transp-row">
            <div class="pc-transp-dot" style="background:${t.cor}"></div>
            <span class="pc-transp-label">${t.label}</span>
            <div class="pc-transp-bar-wrap">
                <div class="pc-transp-bar-fill" style="width:${pct}%;background:${t.cor}20;outline:1px solid ${t.cor}40">
                    <div style="height:100%;width:100%;background:${t.cor};opacity:0.7;border-radius:999px"></div>
                </div>
            </div>
            <span class="pc-transp-val">${val}</span>
        </div>`;
    }).join("");

    const subNivel = d.proxNivel
        ? `Faltam ${(d.faltam||0).toLocaleString("pt-BR")} bipagens para Nv ${d.proxNivel}`
        : `Nv 100 — nível máximo`;

    return `
        <div class="pc-section">
            <div class="pc-section-hd">${_PC_SVG.star} Nível</div>
            <div class="pc-nivel-row">
                <span class="pc-nivel-num">Nv ${d.nivel}</span>
                <span class="pc-nivel-total">${(d.totalBipagens||0).toLocaleString("pt-BR")} no total</span>
            </div>
            <div class="pc-bar"><div class="pc-bar-fill" style="width:${d.progresso}%"></div></div>
            <div class="pc-nivel-sub">${subNivel}</div>
        </div>

        <div class="pc-section${_pcMesAberto() ? " pc-aberto" : ""}" id="pc-secao-mes">
            <button type="button" class="pc-section-hd pc-dobra" data-pc="mes" aria-expanded="${_pcMesAberto()}">
                ${_PC_SVG.scan} ${_MES_NOMES[d.mes]} · ${(d.mensal?.total||0).toLocaleString("pt-BR")} bipagens
                <svg class="pc-dobra-seta" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="pc-transp-list">${transpRows}</div>
        </div>`;
}

// A quebra do mês por transportadora começa fechada (o card ficava poluído); quem abre,
// encontra aberta da próxima vez. Só conveniência: sem localStorage, fica fechada.
function _pcMesAberto() {
    try { return localStorage.getItem("pc_mes_aberto") === "1"; } catch { return false; }
}

function _pcAlternarMes() {
    const sec = document.getElementById("pc-secao-mes");
    if (!sec) return;
    const aberto = sec.classList.toggle("pc-aberto");
    sec.querySelector(".pc-dobra").setAttribute("aria-expanded", String(aberto));
    try { localStorage.setItem("pc_mes_aberto", aberto ? "1" : "0"); } catch {}
}

// Dev troca o próprio polo ali mesmo (gcPoloTrocar, em shopee-polo.js).
function _pcSecaoPoloDev(info) {
    const atual = info && info.polo;
    return `
        <div class="pc-section">
            <div class="pc-section-hd">${_PC_SVG.pin} Polo</div>
            <div class="pc-polo-opcoes">
                ${SHOPEE_POLOS.map(p => `
                    <button type="button" class="pc-polo-btn${p.chave === atual ? " ativo" : ""}" data-polo="${p.chave}">
                        <span class="pc-polo-nome">${p.label}</span>
                        <span class="pc-polo-cod">${p.xpt || "sem Shopee"}</span>
                    </button>`).join("")}
            </div>
            <div class="pc-nivel-sub">${atual ? "Clique em outro polo para trocar." : "Você ainda não tem polo — escolha um."}</div>
        </div>`;
}

// Role user pede, o suporte troca (o pedido cai na Central de Atendimento).
function _pcSecaoPoloPedido(conta) {
    return `
        <div class="pc-section">
            <div class="pc-section-hd">${_PC_SVG.pin} Polo</div>
            <div class="pc-conta-row">
                <span class="pc-conta-valor">${conta.polo_label || "Nenhum definido"}</span>
                <button type="button" class="pc-conta-link" data-pc="polo">Pedir troca</button>
            </div>
        </div>`;
}

function _pcSecaoConta(conta) {
    return `
        <div class="pc-section">
            <div class="pc-section-hd">${_PC_SVG.key} Conta</div>
            <div class="pc-conta-row">
                <div style="min-width:0">
                    <div class="pc-conta-rotulo">E-mail</div>
                    <div class="pc-conta-valor" title="${_gcEsc(conta.email || "")}">${conta.email ? _gcEsc(conta.email) : `<span style="color:#7b98b5">Nenhum cadastrado</span>`}</div>
                </div>
                <button type="button" class="pc-conta-link" data-pc="email">${conta.email ? "Alterar" : "Cadastrar"}</button>
            </div>
            <div class="pc-conta-row">
                <div>
                    <div class="pc-conta-rotulo">Senha</div>
                    <div class="pc-conta-valor">••••••••</div>
                </div>
                <button type="button" class="pc-conta-link" data-pc="senha">Alterar</button>
            </div>
            ${conta.foto ? `
            <div class="pc-conta-row">
                <div class="pc-conta-rotulo" style="margin:0">Foto de perfil</div>
                <button type="button" class="pc-conta-link pc-conta-link-perigo" data-pc="remover-foto">Remover</button>
            </div>` : ""}
        </div>`;
}

function _renderPerfilCard(card, { conta, desempenho, polo }) {
    const u = window._gcUser || {};
    conta = conta || {};
    card.innerHTML = `
        ${_pcCabecalho(u, conta.foto)}
        ${desempenho ? _pcSecaoDesempenho(desempenho) : ""}
        ${u.role === "dev" ? _pcSecaoPoloDev(polo) : ""}
        ${conta.pode_solicitar_polo ? _pcSecaoPoloPedido(conta) : ""}
        ${_pcSecaoConta(conta)}
        <button type="button" class="pc-sair" data-pc="sair">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sair
        </button>`;

    const acoes = {
        "sair":         () => { fecharPerfilCard(); logout(); },
        "foto":         () => pcEscolherFoto(),
        "remover-foto": () => pcRemoverFoto(),
        "email":        () => pcAlterarEmail(conta.email),
        "senha":        () => pcAlterarSenha(),
        "polo":         () => pcSolicitarPolo(conta.polo),
        "mes":          () => _pcAlternarMes(),
    };
    card.querySelectorAll("[data-pc]").forEach(el =>
        el.addEventListener("click", () => acoes[el.dataset.pc]()));
    // Erro vai em alerta: o clique na confirmação conta como clique fora e fecha o card.
    card.querySelectorAll(".pc-polo-btn").forEach(btn => {
        btn.addEventListener("click", () => gcPoloTrocar(btn.dataset.polo, erro => gcAlert(erro)));
    });
}
