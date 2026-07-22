// ───── ROTEADOR DE URL (abrir uma tela direto por link) ─────
// Ex.: https://xmtt1337.github.io/GC-Transportes/Baixas/TotalExpress
const _ROTA_BASE = "/GC-Transportes";

// caminho da URL -> função que abre a tela correspondente
const _ROTAS = {
    "Baixas/TotalExpress":           () => abrirBaixaTotalExpress(),
    "Devolucoes/Nova":               () => abrirDevolucaoNova(),
    "Devolucoes/Enviadas":           () => abrirDevolucoesEnviadas(),
    "Devolucoes/MinhasViagens":      () => abrirViagemMinhas(),
    "Operacao/Bipagem":              () => abrirBipagens(),
    "Operacao/AlimentarLoggi":       () => abrirAlimentar(null, "loggi"),
    "Operacao/AlimentarAnjun":       () => abrirAlimentar(null, "anjun"),
    "Operacao/AlimentarJT":          () => abrirAlimentar(null, "jt"),
    "Operacao/AlimentarImile":       () => abrirAlimentar(null, "imile"),
    "Operacao/AlimentarTotalExpress":() => abrirAlimentar(null, "total_express"),
    "Operacao/DesempenhoUsuario":    () => abrirDesempenhoBip(),
    "Operacao/DesempenhoHora":       () => abrirDesempenhoHora(),
    "Operacao/DevolucoesReceber":    () => abrirDevolucoesReceber(),
    "Operacao/DevolucoesRegistro":   () => abrirDevolucoesRegistro(),
    "Operacao/Etiquetas":            () => abrirEtiquetas(),
    "Ocorrencias/PacotesFaltantes":  () => abrirPacotesFaltantes(),
    "TorreControle/PacotesFaltantes": () => abrirPacotesFaltantesAdmin(),
    "Pedidos/Pesquisar":             () => abrirPesquisarPedidos(),
    "Conferencias/Loggi":            () => abrirConferencias(null, "loggi"),
    "Conferencias/JT":               () => abrirConferencias(null, "jt"),
    "Conferencias/Anjun":            () => abrirConferencias(null, "anjun"),
    "Conferencias/Imile":            () => abrirConferencias(null, "imile"),
    "Conferencias/Shopee":           () => abrirConferencias(null, "shopee"),
    "Fechamentos/Meus":              () => abrirFechamentos(),
    "Fechamentos/Dashboard":         () => abrirEntDashboard(),
    "Fechamentos/NotasFiscais":      () => abrirMinhasNFs(),
    "Adiantamentos/Solicitar":       () => abrirAntecipacoes(),
    "Adiantamentos/Minhas":          () => abrirMinhasSolicitacoes(),
    "TorreControle/AlimentarAnjun":  () => abrirTorreAlimentar(null, "anjun"),
    "Fechamento/CacadorAlimentar":   () => abrirAdmin(),
    "Fechamento/CacadorPesquisar":   () => abrirAdminFechamentos(),
    "Fechamento/CacadorDashboard":   () => abrirDashboard(),
    "Videira/AlimentarFechamento":   () => abrirVideiraAlimentar(),
    "Videira/MeuFechamento":         () => abrirVideiraPainel(),
    "Fechamento/Criar":              () => abrirCriarFechamento(),
    "Planejamento/Cacador":          () => abrirPlanejamentoVideira(null, "cacador"),
    "Planejamento/Videira":          () => abrirPlanejamentoVideira(null, "videira"),
    "Financeiro/NotasFiscais":       () => abrirAdminNFs(),
    "Financeiro/ConferenciaNF":      () => abrirConfNFs(),
    "Financeiro/Antecipacoes":       () => abrirAdminAntecipacoes(),
    "Financeiro/Pagamentos":         () => abrirAdminPagamentos(),
    "Cadastros/Entregadores":        () => abrirAdminUsuarios(),
    "Cadastros/Usuarios":            () => abrirAdminUsuariosGC(),
    "Cadastros/TrampayEntregadores": () => abrirEntregadoresTrampay(),
    "Videira/Dashboard":             () => abrirVideiraDash(),
    "Extravios/Pesquisar":           () => abrirExtraviosBusca(),
    "Extravios/Dashboard":           () => abrirExtraviosDash(),
};

// tela-id -> rota "padrão", usada por mostrarTela(id) quando a tela não é parametrizada
// por transportadora/unidade (essas passam a rota explícita direto pro mostrarTela)
const _TELA_ROTAS = {
    "tela-home":                 "",
    "tela-baixa-te":             "Baixas/TotalExpress",
    "tela-admin-baixas-te":      "Baixas/TotalExpress",
    "tela-devolucao-nova":       "Devolucoes/Nova",
    "tela-devolucao-enviadas":   "Devolucoes/Enviadas",
    "tela-viagem-minhas":        "Devolucoes/MinhasViagens",
    "tela-devolucao-receber":    "Operacao/DevolucoesReceber",
    "tela-devolucao-registro":   "Operacao/DevolucoesRegistro",
    "tela-etiquetas":            "Operacao/Etiquetas",
    "tela-pacotes-faltantes":    "Ocorrencias/PacotesFaltantes",
    "tela-torre-pacotes-faltantes": "TorreControle/PacotesFaltantes",
    "tela-bipagens":             "Operacao/Bipagem",
    "tela-desempenho-bip":       "Operacao/DesempenhoUsuario",
    "tela-desempenho-hora":      "Operacao/DesempenhoHora",
    "tela-pesquisar-pedidos":    "Pedidos/Pesquisar",
    "tela-fechamentos":          "Fechamentos/Meus",
    "tela-ent-dashboard":        "Fechamentos/Dashboard",
    "tela-minhas-nfs":           "Fechamentos/NotasFiscais",
    "tela-antecipacoes":         "Adiantamentos/Solicitar",
    "tela-minhas-solicitacoes":  "Adiantamentos/Minhas",
    "tela-admin":                "Fechamento/CacadorAlimentar",
    "tela-admin-fechamentos":    "Fechamento/CacadorPesquisar",
    "tela-dashboard":            "Fechamento/CacadorDashboard",
    "tela-videira-alimentar":    "Videira/AlimentarFechamento",
    "tela-videira-painel":       "Videira/MeuFechamento",
    "tela-videira-dash":         "Videira/Dashboard",
    "tela-criar-fechamento":     "Fechamento/Criar",
    "tela-admin-nfs":            "Financeiro/NotasFiscais",
    "tela-conf-nfs":             "Financeiro/ConferenciaNF",
    "tela-admin-antecipacoes":   "Financeiro/Antecipacoes",
    "tela-admin-pagamentos":     "Financeiro/Pagamentos",
    "tela-admin-usuarios":       "Cadastros/Entregadores",
    "tela-admin-usuarios-gc":    "Cadastros/Usuarios",
    "tela-trampay-entregadores": "Cadastros/TrampayEntregadores",
    "tela-extravios-busca":      "Extravios/Pesquisar",
    "tela-extravios-dash":       "Extravios/Dashboard",
};

// Atualiza a URL sem recarregar a página. rota=undefined (tela sem entrada no mapa,
// ex. telas internas/modais) não mexe na URL atual. Só roda no GitHub Pages de
// verdade — local (Live Server etc.) o site não mora em /GC-Transportes/, então
// reescrever a URL aqui só quebraria os caminhos relativos (sem o <base> compensando).
function _rotaAtualizarUrl(rota) {
    if (location.hostname !== "xmtt1337.github.io") return;
    if (rota === undefined || rota === null) return;
    const destino = rota ? `${_ROTA_BASE}/${rota}` : `${_ROTA_BASE}/`;
    if (location.pathname !== destino) history.pushState({ rota }, "", destino);
}

// Lê a URL atual e abre a tela correspondente — chamado uma vez após o login carregar
// (core.js) e a cada voltar/avançar do navegador.
function _rotaAbrirAtual() {
    let caminho = location.pathname;
    if (caminho.indexOf(_ROTA_BASE) === 0) caminho = caminho.slice(_ROTA_BASE.length);
    caminho = caminho.replace(/^\/+|\/+$/g, "");
    if (caminho === "index.html") caminho = "";
    if (!caminho) return; // raiz — fica na home, que já é a tela padrão
    const abrir = _ROTAS[caminho];
    if (!abrir) return;
    abrir();
    _marcarSubmenuAtivo(caminho);
}

// Destaca no menu lateral o link correspondente à rota aberta (o mesmo efeito que já
// acontece ao clicar direto no menu — só que aqui a tela foi aberta por código, sem
// clique, então precisa ser feito manualmente).
function _marcarSubmenuAtivo(caminho) {
    document.querySelectorAll(".submenu a").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
    const candidatos = document.querySelectorAll(`.submenu a[data-rota="${caminho}"]`);
    let alvo = null;
    candidatos.forEach(el => { if (!alvo && el.offsetParent !== null) alvo = el; });
    if (!alvo) return; // link não existe pro cargo atual (ex.: sem permissão) — nada pra marcar
    alvo.classList.add("active");
    const menuItem = alvo.closest(".submenu").previousElementSibling;
    if (menuItem) menuItem.classList.add("active");
}

window.addEventListener("popstate", _rotaAbrirAtual);
