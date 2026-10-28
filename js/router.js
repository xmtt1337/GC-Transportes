// ───── ROTEADOR DE URL (abrir uma tela direto por link) ─────
// Ex.: https://xmtt.com.br/Baixas/TotalExpress
// No domínio próprio o site mora na raiz; no github.io antigo, em /GC-Transportes.
// Fora desses hosts (Live Server, preview) o roteador não mexe na URL — a pasta
// servida varia e reescrever o caminho só quebraria os links relativos.
const _ROTA_HOSTS = ["xmtt.com.br", "www.xmtt.com.br", "xmtt1337.github.io"];
const _ROTA_BASE  = location.hostname === "xmtt1337.github.io" ? "/GC-Transportes" : "";

// caminho da URL -> função que abre a tela correspondente
const _ROTAS = {
    "Fiscal/CTes":                   () => abrirCTes(),
    "Fiscal/NovoCTe":                () => abrirNovoCTe(),
    "Fiscal/ImportarShopee":         () => abrirImportarShopee(),
    "Fiscal/Empresas":               () => abrirFiscalEmpresas(),
    "Fiscal/Certificado":            () => abrirFiscalCertificado(),
    "Fiscal/Configuracoes":          () => abrirFiscalConfigTributaria(),
    "Fiscal/Numeracao":              () => abrirFiscalNumeracao(),
    "Fiscal/Perfil":                 () => abrirFiscalPerfil(),
    "Fiscal/Valores":                () => abrirFiscalValores(),
    "SPX/AgencyRouter":              () => abrirAgencyRouter(),
    "Baixas/TotalExpress":           () => abrirBaixaTotalExpress(),
    "Conferencia/Shopee":            () => abrirConfEntregador(),
    "Performance/PorDia":            () => abrirEntPerformance(),
    "CriarAT":                       () => abrirSolicitarAT(),
    // Rota de quando era Atribuições → Solicitar AT: mantida pra link salvo não quebrar.
    "Atribuicoes/SolicitarAT":       () => abrirSolicitarAT(),
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
    "Operacao/DevolucoesReceber":       () => abrirDevolucoesReceber(),
    "Operacao/DevolucoesReceberAvulso": () => abrirDevolucoesReceberAvulso(),
    "Operacao/DevolucoesRegistro":      () => abrirDevolucoesRegistro(),
    "Operacao/Etiquetas":            () => abrirEtiquetas(),
    "Shopee/Recebimento":            () => abrirShopeeReceber(),
    "Shopee/Romaneiro":              () => abrirShopeeRomaneiro(),
    "Shopee/AT":                     () => abrirShopeeAT(),
    "Shopee/Pedidos":                () => abrirShopeePedidos(),
    "Shopee/LineHaul":               () => abrirShopeeLineHaul(),
    "Shopee/Atribuicoes":            () => abrirShopeeAtribuicoes(),
    // Links diretos pra um passo DENTRO da tela (usados no material de treinamento):
    // abrem a tela normal e já executam o clique que a pessoa daria.
    "Shopee/Atribuicoes/VariosClusters": () => { abrirShopeeAtribuicoes(); _scaAlternarSelecao(true); },
    // Exportar espera o polo carregar: o título do modal diz de qual polo/XPT é a planilha.
    "Shopee/Recebimento/Exportar":   () => { abrirShopeeReceber(); gcPoloGarantir(info => { if (info && info.xpt) _shrAbrirExportar(); }); },
    "Shopee/ConfEntregadores":       () => abrirShopeeConfEntregadores(),
    "Shopee/ItemAvariado":           () => abrirShopeeAvariado(),
    "Shopee/Stuck":                  () => abrirShopeeStuck(),
    "Shopee/Stuck/Backlog":          () => abrirShopeeStuckBacklog(),
    // Rotas antigas de quando Shopee era um grupo dentro de Operação. Mantidas só pra
    // link salvo/favorito não quebrar — a tela abre, mas o menu não fica marcado, porque
    // nenhum link tem mais esse data-rota.
    "Operacao/ShopeeRecebimento":       () => abrirShopeeReceber(),
    "Operacao/ShopeeReceber":           () => abrirShopeeReceber(),
    "Operacao/ShopeeRomaneiro":         () => abrirShopeeRomaneiro(),
    "Operacao/ShopeeAT":                () => abrirShopeeAT(),
    "Operacao/ShopeePedidos":           () => abrirShopeePedidos(),
    "Operacao/ShopeeLineHaul":          () => abrirShopeeLineHaul(),
    "Operacao/ShopeeAtribuicoes":       () => abrirShopeeAtribuicoes(),
    "Ocorrencias/PacotesFaltantes":  () => abrirPacotesFaltantes(),
    "TorreControle/NaRua":           () => abrirTorreNaRua(),
    "TorreControle/PacotesFaltantes": () => abrirPacotesFaltantesAdmin(),
    "TorreControle/Transferencias":  () => abrirTransferenciasAdmin(),
    "Custodia/Pacotes":              () => abrirCustodia(),
    "Transferencias/Nova":           () => abrirTransferenciaNova(),
    "Transferencias/Historico":      () => abrirTransferenciaHistorico(),
    "DevolucoesMotorista/Buscar":       () => abrirMotoristaBuscarViagem(),
    "DevolucoesMotorista/MinhasCargas": () => abrirMotoristaMinhasCargas(),
    "Pedidos/Pesquisar":             () => abrirPesquisarPedidos(),
    "Conferencias":                  () => abrirConferenciasHub(),
    "Conferencias/Alimentar":        () => abrirPainelAlimentar(),
    "Conferencias/Loggi":            () => abrirConferencias(null, "loggi"),
    "Conferencias/JT":               () => abrirConferencias(null, "jt"),
    "Conferencias/Anjun":            () => abrirConferencias(null, "anjun"),
    "Conferencias/Imile":            () => abrirConferencias(null, "imile"),
    "Conferencias/Shopee":           () => abrirConferencias(null, "shopee"),
    "Fechamentos/Meus":              () => abrirFechamentos(),
    "Fechamentos/Dashboard":         () => abrirEntDashboard(),
    "Anotacoes/Transportadoras":     () => abrirAnotacoesTransportadoras(),
    "Anotacoes/PorDia":              () => abrirAnotacoesPorDia(),
    "Anotacoes/Quinzenas":           () => abrirAnotacoesQuinzenas(),
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
    "Fechamento/Resumo":             () => abrirResumoQuinzena(),
    "Fechamento/Ajustes":            () => abrirAjustesFechamento(),
    "Fechamento/Deslocamentos":      () => abrirDeslocamentos(),
    "Fechamento/Acareacoes":         () => abrirAcareacoes(),
    "Fechamento/Regras":             () => abrirRegrasFechamento(),
    "Fechamento/Extravios":          () => abrirExtraviosFechamento(),
    "TicketLog/Informacoes":         () => abrirTicketlogInfo(),
    "Planejamento/Cacador":          () => abrirPlanejamentoVideira(null, "cacador"),
    "Planejamento/Videira":          () => abrirPlanejamentoVideira(null, "videira"),
    "Financeiro/NotasFiscais":       () => abrirAdminNFs(),
    "Financeiro/ConferenciaNF":      () => abrirConfNFs(),
    "Financeiro/Antecipacoes":       () => abrirAdminAntecipacoes(),
    "Financeiro/Pagamentos":         () => abrirAdminPagamentos(),
    "Financeiro/Faturas":            () => abrirGeradorFaturas(),
    "Cadastros/Entregadores":        () => abrirAdminUsuarios(),
    "Cadastros/AnotacoesRelatorio":  () => abrirAnotacoesRelatorio(),
    "Cadastros/Motoristas":          () => abrirAdminMotoristas(),
    "Cadastros/Usuarios":            () => abrirAdminUsuariosGC(),
    // "Todos os Usuários" foi removida (o último acesso agora está nas listas de Cadastros);
    // link salvo pra ela cai em Usuários.
    "Cadastros/TodosUsuarios":       () => abrirAdminUsuariosGC(),
    "Cadastros/ConversaoNomes":      () => abrirNomesPadrao(),
    "Cadastros/TelefoneEntregador":  () => abrirEntregadorTelefone(),
    "Macros":                        () => abrirMacros(),
    "Macros/EmExecucao":             () => abrirMacrosExecucao(),
    "Ativos/Disparar":              () => abrirWhatsappTeste(),
    "Ativos/Conversas":             () => abrirWhatsappConversas(),
    "Atendimento/Conversas":        () => abrirAtendimento(),
    "Cadastros/TrampayEntregadores": () => abrirEntregadoresTrampay(),
    "Videira/Dashboard":             () => abrirVideiraDash(),
    "Extravios/Registros":           () => abrirExtraviosRegistros(),
    "Extravios/Pesquisar":           () => abrirExtraviosBusca(),
    "Extravios/Dashboard":           () => abrirExtraviosDash(),
};

// Rota de um passo dentro da tela -> rota da tela, que é a que tem link no menu lateral.
// Sem isso a tela abria certa mas com o menu sem nada destacado.
const _ROTAS_MENU = {
    "Shopee/Atribuicoes/VariosClusters": "Shopee/Atribuicoes",
    "Shopee/Recebimento/Exportar":       "Shopee/Recebimento",
    "Atribuicoes/SolicitarAT":           "CriarAT",
};

// Rotas com PARÂMETRO no caminho. O mapa acima é de correspondência exata, e essas não
// podem ser: o fim do caminho é conteúdo (o código do pedido), não o nome de uma tela.
//
// `base` é a rota curta correspondente — é ela que fica marcada no menu lateral, já que o
// link do menu aponta pra lista e não pra uma conversa específica.
const _ROTAS_PADRAO = [
    {
        // Ativos/Conversas/<Tipo>[/<Transportadora>[/<Código>]]
        //
        // Os dois últimos são opcionais porque a URL acompanha CADA passo da tela, e não só
        // o destino final: clicar na aba já muda o caminho, escolher a transportadora
        // acrescenta um pedaço, e abrir a conversa acrescenta o último. Assim o "voltar" do
        // navegador desfaz um clique por vez, em vez de pular da conversa pra fora da tela.
        //
        //   Ativos/Conversas/Ativos
        //   Ativos/Conversas/Ativos/Shopee
        //   Ativos/Conversas/Ativos/Shopee/BR252525256454
        base: "Ativos/Conversas",
        re: /^Ativos\/Conversas\/([^/]+)(?:\/([^/]+))?(?:\/(.+))?$/,
        abrir: (tipo, transp, codigo) => abrirWhatsappConversas(null, {
            tipo, transp, codigo: codigo ? decodeURIComponent(codigo) : null,
        }),
    },
];

// tela-id -> rota "padrão", usada por mostrarTela(id) quando a tela não é parametrizada
// por transportadora/unidade (essas passam a rota explícita direto pro mostrarTela)
const _TELA_ROTAS = {
    "tela-home":                 "",
    // Telas fiscais. Sem estas linhas a URL nao acompanhava a navegacao: ficava
    // a rota da tela anterior, o menu marcava o item errado e recarregar levava
    // para outro lugar.
    "tela-fiscal-ctes":          "Fiscal/CTes",
    "tela-fiscal-novo-cte":      "Fiscal/NovoCTe",
    "tela-fiscal-empresas":      "Fiscal/Empresas",
    "tela-fiscal-certificado":   "Fiscal/Certificado",
    "tela-fiscal-tributacao":    "Fiscal/Configuracoes",
    "tela-fiscal-numeracao":     "Fiscal/Numeracao",
    "tela-fiscal-perfil":        "Fiscal/Perfil",
    "tela-fiscal-valores":       "Fiscal/Valores",
    "tela-agency-router":        "SPX/AgencyRouter",
    "tela-baixa-te":             "Baixas/TotalExpress",
    "tela-conf-entregador":      "Conferencia/Shopee",
    "tela-ent-performance":      "Performance/PorDia",
    "tela-solicitar-at":         "CriarAT",
    "tela-admin-baixas-te":      "Baixas/TotalExpress",
    "tela-devolucao-nova":       "Devolucoes/Nova",
    "tela-devolucao-enviadas":   "Devolucoes/Enviadas",
    "tela-viagem-minhas":        "Devolucoes/MinhasViagens",
    "tela-devolucao-receber":         "Operacao/DevolucoesReceber",
    "tela-devolucao-receber-avulso":  "Operacao/DevolucoesReceberAvulso",
    "tela-devolucao-registro":        "Operacao/DevolucoesRegistro",
    "tela-custodia":             "Custodia/Pacotes",
    "tela-etiquetas":            "Operacao/Etiquetas",
    "tela-pacotes-faltantes":    "Ocorrencias/PacotesFaltantes",
    "tela-torre-na-rua":            "TorreControle/NaRua",
    "tela-torre-pacotes-faltantes": "TorreControle/PacotesFaltantes",
    "tela-torre-transferencias":    "TorreControle/Transferencias",
    "tela-transferencia-nova":      "Transferencias/Nova",
    "tela-transferencia-historico": "Transferencias/Historico",
    "tela-motorista-buscar":        "DevolucoesMotorista/Buscar",
    "tela-motorista-cargas":        "DevolucoesMotorista/MinhasCargas",
    "tela-painel-alimentar":     "Conferencias/Alimentar",
    "tela-shopee-receber":       "Shopee/Recebimento",
    "tela-shopee-romaneiro":     "Shopee/Romaneiro",
    "tela-shopee-at":            "Shopee/AT",
    "tela-shopee-pedidos":       "Shopee/Pedidos",
    "tela-shopee-linehaul":      "Shopee/LineHaul",
    "tela-shopee-atribuicoes":   "Shopee/Atribuicoes",
    "tela-shopee-conf-entregadores": "Shopee/ConfEntregadores",
    "tela-shopee-avariado":      "Shopee/ItemAvariado",
    "tela-shopee-stuck":         "Shopee/Stuck",
    "tela-shopee-stuck-backlog": "Shopee/Stuck/Backlog",
    "tela-bipagens":             "Operacao/Bipagem",
    "tela-desempenho-bip":       "Operacao/DesempenhoUsuario",
    "tela-desempenho-hora":      "Operacao/DesempenhoHora",
    "tela-pesquisar-pedidos":    "Pedidos/Pesquisar",
    "tela-fechamentos":          "Fechamentos/Meus",
    "tela-ent-dashboard":        "Fechamentos/Dashboard",
    "tela-aq-transportadoras":   "Anotacoes/Transportadoras",
    "tela-aq-por-dia":           "Anotacoes/PorDia",
    "tela-aq-quinzenas":         "Anotacoes/Quinzenas",
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
    "tela-resumo-quinzena":      "Fechamento/Resumo",
    "tela-ajustes-fechamento":   "Fechamento/Ajustes",
    "tela-deslocamentos":        "Fechamento/Deslocamentos",
    "tela-acareacoes":           "Fechamento/Acareacoes",
    "tela-regras-fechamento":    "Fechamento/Regras",
    "tela-extravios-fechamento": "Fechamento/Extravios",
    "tela-ticketlog-info":       "TicketLog/Informacoes",
    "tela-admin-nfs":            "Financeiro/NotasFiscais",
    "tela-conf-nfs":             "Financeiro/ConferenciaNF",
    "tela-admin-antecipacoes":   "Financeiro/Antecipacoes",
    "tela-admin-pagamentos":     "Financeiro/Pagamentos",
    "tela-admin-usuarios":       "Cadastros/Entregadores",
    "tela-anotacoes-relatorio":  "Cadastros/AnotacoesRelatorio",
    "tela-admin-motoristas":     "Cadastros/Motoristas",
    "tela-admin-usuarios-gc":    "Cadastros/Usuarios",
    "tela-nomes-padrao":         "Cadastros/ConversaoNomes",
    "tela-entregador-telefone":  "Cadastros/TelefoneEntregador",
    "tela-macros":               "Macros",
    "tela-macros-execucao":      "Macros/EmExecucao",
    "tela-whatsapp-teste":       "Ativos/Disparar",
    "tela-whatsapp-conversas":   "Ativos/Conversas",
    "tela-atendimento":          "Atendimento/Conversas",
    "tela-trampay-entregadores": "Cadastros/TrampayEntregadores",
    "tela-extravios-registros":  "Extravios/Registros",
    "tela-extravios-busca":      "Extravios/Pesquisar",
    "tela-extravios-dash":       "Extravios/Dashboard",
};

// Atualiza a URL sem recarregar a página. rota=undefined (tela sem entrada no mapa,
// ex. telas internas/modais) não mexe na URL atual. Só roda nos hosts de produção —
// local (Live Server etc.) o site não mora num caminho fixo, então reescrever a URL
// aqui só quebraria os caminhos relativos (sem o <base> compensando).
// `substituir` troca a entrada atual em vez de empilhar uma nova. Serve pro que a tela
// decide sozinha (ex.: a transportadora que ela escolhe quando ninguém pediu nenhuma):
// isso ajusta a URL sem virar um passo pra trás que o usuário nunca deu.
function _rotaAtualizarUrl(rota, substituir) {
    if (!_ROTA_HOSTS.includes(location.hostname)) return;
    if (rota === undefined || rota === null) return;
    const destino = rota ? `${_ROTA_BASE}/${rota}` : `${_ROTA_BASE}/`;
    if (location.pathname === destino) return;
    if (substituir) history.replaceState({ rota }, "", destino);
    else history.pushState({ rota }, "", destino);
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
    if (abrir) { abrir(); _marcarSubmenuAtivo(_ROTAS_MENU[caminho] || caminho); return; }

    // Correspondência exata falhou: tenta as rotas com parâmetro. Marca a rota BASE no menu,
    // porque o link do menu é o da lista — procurar por um data-rota com o código do pedido
    // dentro nunca acharia nada, e a conversa abriria com o menu sem destaque nenhum.
    for (const p of _ROTAS_PADRAO) {
        const m = caminho.match(p.re);
        if (!m) continue;
        p.abrir(...m.slice(1));
        _marcarSubmenuAtivo(p.base);
        return;
    }
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
    if (!alvo) {
        // Item de menu sem submenu (ex.: Criar AT): a rota mora no próprio item. Sem ele
        // também, o link não existe pro cargo atual (ex.: sem permissão) — nada pra marcar.
        const item = document.querySelector(`.menu-item[data-rota="${caminho}"]`);
        if (item) item.classList.add("active");
        return;
    }
    alvo.classList.add("active");
    const menuItem = alvo.closest(".submenu").previousElementSibling;
    if (menuItem) menuItem.classList.add("active");
}

window.addEventListener("popstate", _rotaAbrirAtual);
