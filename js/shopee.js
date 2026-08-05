// ───── SHOPEE → RECEBER ─────
// Bipagem dos pedidos que chegam no hub. O XPT (CFC ou VIA) é escolhido antes e vale
// para toda a sessão, porque a pessoa recebe um lote inteiro no mesmo lugar — pedir o
// XPT a cada bipe seria um clique a mais por pacote, centenas por dia.
// Código Shopee: "BR" + 13 caracteres (ex.: BR266104829025G, BR2661048290259). Barrar
// aqui evita a ida ao servidor e o erro sai no mesmo instante do bipe — mas o servidor
// valida de novo, porque é ele quem decide o que entra no banco.
const SHR_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// O código volta pra tela dentro de innerHTML; se vier torto do leitor, pode trazer
// caractere que o navegador leria como marcação.
function _shrEsc(txt) {
    return String(txt || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Polos e o XPT de cada um. Joaçaba consta porque tem gente lotada lá, mas não recebe
// Shopee — daí xpt null, em vez de um código inventado que criaria uma contagem fantasma.
const SHR_POLOS = [
    { chave: "cacador", label: "Caçador", xpt: "XPT_CFC" },
    { chave: "videira", label: "Videira", xpt: "XPT_VIA" },
    { chave: "joacaba", label: "Joaçaba", xpt: null },
];
const _shrPolo = chave => SHR_POLOS.find(p => p.chave === chave) || null;

let _shrXpt      = null;    // XPT do polo da pessoa; null = sem polo ou polo sem Shopee
let _shrPoloAtual = null;   // { chave, label, xpt }
let _shrDados    = [];      // recebimentos de hoje do XPT da pessoa
let _shrFiltro   = "todos";
let _shrPagina   = 1;
const SHR_POR_PAGINA = 50;

function abrirShopeeReceber(event) {
    if (event) event.preventDefault();
    _shrXpt = null;
    _shrPoloAtual = null;
    _shrFiltro = "todos";
    _shrPagina = 1;
    document.getElementById("shr-codigo").value = "";
    document.getElementById("shr-busca").value = "";
    _shrMsg("", null);
    _shrPintarXpt();
    _shrPintarFiltroTabs();
    mostrarTela("tela-shopee-receber");

    // O XPT vem do polo do cadastro, não de um clique a cada uso: escolher toda vez era
    // justamente o que deixava passar bipe no lugar errado.
    fetch(`${API}/shopee/meu-xpt`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (!d || !d.polo) return _shrPerguntarPolo(); // cadastrado antes do polo existir
            _shrPoloAtual = _shrPolo(d.polo);
            _shrXpt = d.xpt || null;
            _shrPintarXpt();
            if (_shrXpt) _shrCarregarHoje();
        })
        .catch(() => {
            document.getElementById("shr-aviso-xpt").innerText = "Não foi possível carregar o seu polo. Recarregue a página.";
        });
}

// ── Escolha inicial, uma única vez ──
// Só aparece pra quem foi cadastrado antes do polo existir. Quem entra a partir de agora
// já vem com o polo do cadastro e nunca vê isto. O aviso de que fica salvo é o ponto: sem
// ele a pessoa clica em qualquer um pra passar da tela e o erro dura até alguém reparar.
function _shrPerguntarPolo() {
    document.getElementById("shr-aviso-xpt").innerText = "Escolha o seu polo para começar.";

    const overlay = document.createElement("div");
    overlay.id = "shr-escolha-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `
        <div style="${_gcCardStyle}">
            <div style="${_gcTitleStyle}">Qual é o seu polo?</div>
            <div style="${_gcMsgStyle}">Escolha a base em que você trabalha. Ela fica salva no seu cadastro e passa a valer em todos os recebimentos — se errar, só um administrador consegue trocar.</div>
            <div class="shr-escolha-opcoes">
                ${SHR_POLOS.map(p => `
                    <button type="button" class="shr-escolha-btn" data-polo="${p.chave}" data-xpt="${p.xpt || ""}">
                        <span class="shr-escolha-cidade">${p.label}</span>
                        <span class="shr-escolha-cod">${p.xpt || "não recebe Shopee"}</span>
                    </button>`).join("")}
            </div>
            <div id="shr-escolha-erro" style="display:none;font-size:12.5px;color:#ef4444;margin-bottom:12px"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".shr-escolha-btn").forEach(btn => {
        btn.addEventListener("click", () => _shrConfirmarPolo(btn.dataset.polo, overlay));
    });
}

function _shrConfirmarPolo(chave, overlay) {
    const polo = _shrPolo(chave);
    if (!polo) return;
    const detalhe = polo.xpt
        ? `Você vai receber os pacotes da Shopee em ${polo.label} (${polo.xpt}).`
        : `${polo.label} não recebe Shopee — você não vai bipar pacotes nesta tela.`;

    // Confirmação antes de gravar: é escolha de uma vez só, e um clique errado aqui custa
    // uma ida ao administrador.
    gcConfirm(
        `${detalhe}\n\nIsso fica salvo no seu cadastro. Depois, só um administrador pode alterar.`,
        () => {
            const erro = overlay.querySelector("#shr-escolha-erro");
            const botoes = overlay.querySelectorAll(".shr-escolha-btn");
            botoes.forEach(b => b.disabled = true);

            fetch(`${API}/shopee/meu-polo`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ polo: chave })
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                // 409 = já tinha polo (outra aba, ou o admin definiu). Segue com o que vale.
                if (!ok && !d.polo) {
                    botoes.forEach(b => b.disabled = false);
                    erro.style.display = "";
                    erro.innerText = d.error || "Não foi possível salvar. Tente de novo.";
                    return;
                }
                _shrPoloAtual = _shrPolo(d.polo || chave);
                _shrXpt = (_shrPoloAtual && _shrPoloAtual.xpt) || null;
                overlay.remove();
                _shrPintarXpt();
                if (_shrXpt) _shrCarregarHoje();
            })
            .catch(() => {
                botoes.forEach(b => b.disabled = false);
                erro.style.display = "";
                erro.innerText = "Erro de conexão. Tente de novo.";
            });
        },
        "Confirmar polo",
        "Sim, é esse"
    );
}

function _shrPintarXpt() {
    const faixa = document.getElementById("shr-faixa");
    const temPolo = !!_shrPoloAtual;
    faixa.style.display = temPolo ? "" : "none";
    faixa.className = "shr-faixa" + (!_shrXpt ? " sem" : _shrXpt === "XPT_VIA" ? " via" : " cfc");
    if (temPolo) {
        document.getElementById("shr-faixa-xpt").innerText =
            _shrXpt ? `${_shrPoloAtual.label} · ${_shrXpt}` : _shrPoloAtual.label;
        document.getElementById("shr-faixa-obs").innerText =
            _shrXpt ? "Para trocar, fale com um administrador" : "Este polo não recebe Shopee";
    }
    // Sem XPT não há onde registrar, então o campo de código nem aparece — é mais claro
    // que deixá-lo visível e recusar cada bipe depois.
    document.getElementById("shr-campo-codigo").style.display = _shrXpt ? "" : "none";
    document.getElementById("shr-dica-codigo").style.display  = _shrXpt ? "" : "none";

    const aviso = document.getElementById("shr-aviso-xpt");
    if (_shrXpt) { aviso.style.display = "none"; }
    else if (temPolo) {
        aviso.style.display = "";
        aviso.innerText = `O polo ${_shrPoloAtual.label} não recebe Shopee. Se isso estiver errado, fale com um administrador.`;
    }
    // Resumo e lista não fazem sentido sem XPT.
    document.getElementById("shr-resumo").style.display = _shrXpt ? "" : "none";
    document.getElementById("shr-bloco-lista").style.display = _shrXpt ? "" : "none";
    if (_shrXpt) document.getElementById("shr-codigo").focus();
}

// Pisca a borda do campo em verde ou vermelho. Quem bipa em rajada não lê a mensagem —
// a cor no canto do olho é o que diz se o pacote entrou.
let _shrFlashTimer = null;
function _shrFlash(tipo) {
    const wrap = document.getElementById("shr-campo-codigo");
    if (!wrap) return;
    clearTimeout(_shrFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth; // força reflow pra reiniciar a transição
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _shrFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

// ── Bipagem ──
function _shrCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _shrReceber(); }
}

function _shrScanCodigo() {
    if (!_shrXpt) return _shrMsg("Escolha o XPT antes de bipar.", "aviso");
    _bteAbrirScanner(texto => {
        document.getElementById("shr-codigo").value = texto;
        _shrReceber();
    });
}

function _shrReceber() {
    const campo  = document.getElementById("shr-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco na hora: o leitor dispara o próximo bipe antes da resposta
    // do servidor chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_shrXpt) { _gcBeepErro(); return _shrMsg("Escolha o XPT antes de bipar.", "aviso"); }
    if (!SHR_CODIGO_RE.test(codigo)) {
        _gcBeepErro(); _shrFlash("err");
        return _shrMsg(`<strong>${_shrEsc(codigo)}</strong> não é um código válido — precisa ser BR seguido de 13 caracteres.`, "erro");
    }

    // O XPT não vai no corpo: quem manda é o perfil, decidido no servidor.
    fetch(`${API}/shopee/receber`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _shrFlash("err");
            if (d.ja_recebido) {
                return _shrMsg(
                    `<strong>${_shrEsc(codigo)}</strong> já foi recebido hoje em <strong>${_shrEsc(d.xpt) || "—"}</strong>` +
                    `${d.usuario_nome ? " por " + _shrEsc(d.usuario_nome) : ""}${d.data_hora_brasilia ? " · " + _shrEsc(d.data_hora_brasilia) : ""}.`,
                    "aviso");
            }
            // Cadastro sem polo (admin limpou, ou a tela estava aberta desde antes):
            // pergunta de novo em vez de deixar a pessoa bipando contra um erro fixo.
            if (d.sem_polo) { _shrXpt = null; _shrPoloAtual = null; _shrPintarXpt(); _shrPerguntarPolo(); }
            // Polo mudou pra um que não recebe: tira o campo do caminho.
            if (d.polo_sem_xpt) { _shrXpt = null; _shrPintarXpt(); }
            return _shrMsg(_shrEsc(d.error) || "Erro ao registrar.", "erro");
        }
        _gcBeepSucesso(); _shrFlash("ok");
        _shrMsg(`✓ <strong>${_shrEsc(d.codigo)}</strong> recebido em <strong>${_shrEsc(d.xpt)}</strong>.`, "ok");
        // Insere na lista local em vez de recarregar: a cada bipe uma ida ao servidor
        // deixaria a bipagem em rajada lenta e acordaria o banco à toa.
        _shrDados.unshift({
            id: d.id, codigo: d.codigo, xpt: d.xpt, meu: true,
            usuario_nome: (window._gcUser && window._gcUser.displayName) || "—",
            data_hora_brasilia: d.data_hora_brasilia,
        });
        _shrRenderizar();
    })
    .catch(() => { _gcBeepErro(); _shrMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _shrMsg(msg, tipo) {
    const el = document.getElementById("shr-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// ── Registro do dia ──
function _shrCarregarHoje() {
    const empty  = document.getElementById("shr-empty");
    const result = document.getElementById("shr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    document.getElementById("shr-resumo").innerHTML = "";

    fetch(`${API}/shopee/recebimentos-hoje`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            _shrDados = Array.isArray(rows) ? rows : [];
            empty.style.display = "none";
            result.style.display = "";
            _shrRenderizar();
        })
        .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); });
}

function _shrTrocarFiltro(filtro) {
    _shrFiltro = filtro;
    _shrPagina = 1; // trocar de filtro na página 7 cairia numa lista de 3 páginas
    _shrPintarFiltroTabs();
    _shrRenderizar();
}

function _shrBuscar() {
    _shrPagina = 1;
    _shrRenderizar();
}

function _shrTrocarPagina(passo) {
    _shrPagina += passo;
    _shrRenderizar();
    document.getElementById("shr-lista-titulo").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function _shrPintarFiltroTabs() {
    document.querySelectorAll("#shr-filtro-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.filtro === _shrFiltro));
}

// Quem bipou vem marcado pelo servidor — ele é quem sabe o id de quem pediu.
function _shrEhMeu(r) {
    return r.meu === true;
}

// Só dev remove: é correção de erro, não parte da operação. Quem bipa avisa.
function _shrPodeRemover() {
    return (window._gcUser && window._gcUser.role) === "dev";
}

function _shrRenderizar() {
    // A lista já vem só do XPT da pessoa — o servidor filtra, então aqui não há o que
    // separar. O total é o do XPT dela, e o percentual é a fatia que ela bipou.
    const meus = _shrDados.filter(_shrEhMeu).length;
    const pct  = gcPct(meus, _shrDados.length);
    const cidade = (_shrPoloAtual && _shrPoloAtual.label) || "";

    const card = (rotulo, valor, sub) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value">${valor}</div>
        </div>`;
    document.getElementById("shr-resumo").innerHTML =
        card("Recebidos hoje", _shrDados.length, cidade) +
        card("Você recebeu", `${meus}${pct !== null ? ` <span class="shr-pct">${gcPctTexto(pct)}</span>` : ""}`, "do total de hoje");

    document.getElementById("shr-lista-titulo").innerText =
        _shrXpt ? `Recebidos hoje · ${cidade}` : "Recebidos hoje";

    // Aba e busca se somam; a busca pega código e quem recebeu, que é o que se procura
    // quando alguém pergunta "esse pacote entrou?" ou "quanto o fulano bipou?".
    const termo = (document.getElementById("shr-busca")?.value || "").trim().toLowerCase();
    let rows = _shrFiltro === "meus" ? _shrDados.filter(_shrEhMeu) : _shrDados;
    if (termo) rows = rows.filter(r =>
        String(r.codigo || "").toLowerCase().includes(termo) ||
        String(r.usuario_nome || "").toLowerCase().includes(termo));

    const podeRemover = _shrPodeRemover();
    const colunas = podeRemover ? 5 : 4;
    document.getElementById("shr-th-acao").style.display = podeRemover ? "" : "none";

    // Paginação: num dia cheio a tabela passa de mil linhas, e desenhar tudo trava a tela.
    const paginas = Math.max(1, Math.ceil(rows.length / SHR_POR_PAGINA));
    _shrPagina = Math.min(Math.max(1, _shrPagina), paginas);
    const inicio = (_shrPagina - 1) * SHR_POR_PAGINA;
    const pagina = rows.slice(inicio, inicio + SHR_POR_PAGINA);

    const pag = document.getElementById("shr-paginacao");
    pag.style.display = rows.length > SHR_POR_PAGINA ? "" : "none";
    if (rows.length > SHR_POR_PAGINA) {
        document.getElementById("shr-pag-info").innerText =
            `${inicio + 1}–${Math.min(inicio + SHR_POR_PAGINA, rows.length)} de ${rows.length}`;
        document.getElementById("shr-pag-ant").disabled  = _shrPagina <= 1;
        document.getElementById("shr-pag-prox").disabled = _shrPagina >= paginas;
    }

    document.getElementById("shr-tbody").innerHTML = pagina.length ? pagina.map(r => `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_shrEsc(r.codigo)}</td>
            <td data-label="XPT"><span class="shr-xpt-tag ${r.xpt === "XPT_CFC" ? "cfc" : "via"}">${_shrEsc(r.xpt)}</span></td>
            <td data-label="Recebido por">${_shrEsc(r.usuario_nome) || "—"}</td>
            <td data-label="Data / hora" style="color:#94a3b8">${_shrEsc(r.data_hora_brasilia) || "—"}</td>
            ${podeRemover ? `<td data-label="" style="text-align:right">
                <button class="shr-del-btn" onclick="_shrRemover(${r.id},'${_shrEsc(r.codigo)}')" title="Remover este recebimento">Remover</button>
            </td>` : ""}
        </tr>`).join("")
        : `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:26px 10px">${
            termo ? "Nenhum código encontrado." : "Nenhum recebimento nesse filtro."}</td></tr>`;
}

// ── Exportação em .xlsx ──
// Os dados vêm do servidor (dia ou período, e opcionalmente de uma pessoa só); a planilha
// é montada aqui, com a biblioteca que a página já carrega.
// ── Calendário de intervalo ──
// Mesmo desenho do de Pedidos. Não há "um dia" separado de "período": clicar numa data só
// e baixar já é um dia — de e até saem iguais.
const SHR_CAL_DOW   = ["D", "S", "T", "Q", "Q", "S", "S"];
const SHR_CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                       "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let _shrCalInicio = null, _shrCalFim = null, _shrCalMes = null;

const _shrFmtData   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _shrParseData = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };

function _shrCalMesAnterior() { _shrCalMes.setMonth(_shrCalMes.getMonth() - 1); _shrCalRender(); }
function _shrCalMesProximo()  { _shrCalMes.setMonth(_shrCalMes.getMonth() + 1); _shrCalRender(); }

function _shrCalClick(dataStr) {
    const d = _shrParseData(dataStr);
    // Intervalo fechado começa uma seleção nova; clique anterior ao início inverte as pontas.
    if (!_shrCalInicio || _shrCalFim) { _shrCalInicio = d; _shrCalFim = null; }
    else if (d < _shrCalInicio)       { _shrCalFim = _shrCalInicio; _shrCalInicio = d; }
    else                              { _shrCalFim = d; }
    _shrCalRender();
    document.getElementById("shr-exp-erro").innerText = "";
}

function _shrCalRender() {
    const ano = _shrCalMes.getFullYear(), mesIdx = _shrCalMes.getMonth();
    const primeiroDiaSemana = new Date(ano, mesIdx, 1).getDay();
    const diasNoMes  = new Date(ano, mesIdx + 1, 0).getDate();
    const celulaIni  = new Date(ano, mesIdx, 1 - primeiroDiaSemana);
    const total      = Math.ceil((primeiroDiaSemana + diasNoMes) / 7) * 7;
    const ini = _shrCalInicio, fim = _shrCalFim;

    let grid = "";
    for (let i = 0; i < total; i++) {
        const dia = new Date(celulaIni);
        dia.setDate(celulaIni.getDate() + i);
        let classes = "ped-cal-day" + (dia.getMonth() !== mesIdx ? " outro-mes" : "");
        if (ini && fim) {
            const t = dia.getTime();
            if (t === ini.getTime() && t === fim.getTime()) classes += " intervalo-unico";
            else if (t === ini.getTime()) classes += " intervalo-inicio";
            else if (t === fim.getTime()) classes += " intervalo-fim";
            else if (t > ini.getTime() && t < fim.getTime()) classes += " no-intervalo";
        } else if (ini && dia.getTime() === ini.getTime()) {
            classes += " intervalo-unico";
        }
        grid += `<div class="${classes}" onclick="_shrCalClick('${_shrFmtData(dia)}')">${dia.getDate()}</div>`;
    }

    const texto = !ini ? "Clique na data"
        : !fim ? `${ini.toLocaleDateString("pt-BR")} — clique de novo para um período`
        : ini.getTime() === fim.getTime() ? ini.toLocaleDateString("pt-BR")
        : `${ini.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`;

    document.getElementById("shr-cal").innerHTML = `
        <div class="ped-cal-header">
            <button type="button" class="ped-cal-nav" onclick="_shrCalMesAnterior()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${SHR_CAL_MESES[mesIdx]} ${ano}</span>
            <button type="button" class="ped-cal-nav" onclick="_shrCalMesProximo()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${SHR_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join("")}${grid}</div>
        <div class="ped-cal-footer"><span class="ped-cal-range-txt">${texto}</span></div>`;
}

function _shrAbrirExportar() {
    const hoje = _shrParseData(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    _shrCalInicio = hoje;
    _shrCalFim    = hoje;
    _shrCalMes    = new Date(hoje);
    _shrCalMes.setDate(1);
    _shrCalRender();

    document.getElementById("shr-exp-erro").innerText = "";
    document.getElementById("shr-exp-sub").innerText =
        `Pacotes recebidos em ${(_shrPoloAtual && _shrPoloAtual.label) || "—"} (${_shrXpt || "—"}).`;

    // Lista de quem já recebeu neste XPT — só quem tem registro, pra não oferecer nome
    // que nunca vai devolver linha.
    const sel = document.getElementById("shr-exp-usuario");
    sel.innerHTML = `<option value="">Todos</option>`;
    fetch(`${API}/shopee/usuarios`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(us => {
            if (!Array.isArray(us)) return;
            sel.innerHTML = `<option value="">Todos</option>` + us.map(u =>
                `<option value="${u.usuario_id}">${_shrEsc(u.usuario_nome) || "—"}</option>`).join("");
        })
        .catch(() => {});

    _abrirModal("modal-shr-exportar");
}

function _shrExportar() {
    const erro = document.getElementById("shr-exp-erro");
    const btn  = document.getElementById("shr-exp-btn");
    erro.innerText = "";
    if (!_shrCalInicio) { erro.innerText = "Clique numa data no calendário."; return; }

    // Fim vazio = intervalo de um dia só. Não existe modo separado pra isso.
    const de  = _shrFmtData(_shrCalInicio);
    const ate = _shrFmtData(_shrCalFim || _shrCalInicio);

    const usuarioId = document.getElementById("shr-exp-usuario").value;
    const nomeUsuario = usuarioId
        ? document.getElementById("shr-exp-usuario").selectedOptions[0].text
        : "";

    btn.disabled = true;
    btn.textContent = "Gerando...";

    const qs = new URLSearchParams({ de, ate });
    if (usuarioId) qs.set("usuario_id", usuarioId);

    fetch(`${API}/shopee/exportar?${qs}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Baixar .xlsx";
            if (!ok) { erro.innerText = d.error || "Não foi possível exportar."; return; }
            const linhas = d.linhas || [];
            if (!linhas.length) { erro.innerText = "Nenhum recebimento nesse período."; return; }

            const dados = linhas.map(r => ({
                "Código":       r.codigo || "",
                "XPT":          r.xpt || "",
                "Recebido por": r.usuario_nome || "",
                "Data":         r.dia ? r.dia.split("-").reverse().join("/") : "",
                "Data / hora":  r.data_hora_brasilia || "",
            }));
            const ws = XLSX.utils.json_to_sheet(dados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Recebimento");
            const sufixo = de === ate ? de : `${de}_a_${ate}`;
            const quem = nomeUsuario ? "_" + nomeUsuario.replace(/[^\wÀ-ÿ]+/g, "-") : "";
            XLSX.writeFile(wb, `recebimento_shopee_${_shrXpt || "xpt"}_${sufixo}${quem}.xlsx`);

            _fecharModal("modal-shr-exportar");
            if (d.truncado) {
                gcAlert(`A planilha saiu com as primeiras ${d.limite.toLocaleString("pt-BR")} linhas — o período escolhido tem mais que isso. Exporte em partes menores para não faltar nada.`);
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Baixar .xlsx";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

// Remoção de bipe errado. Sem isso, o único conserto era mexer no banco na mão.
function _shrRemover(id, codigo) {
    gcConfirm(
        `Remover ${codigo} do recebimento de hoje?\n\nEle sai da contagem e pode ser bipado de novo.`,
        () => {
            fetch(`${API}/shopee/recebimento/${id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível remover.");
                _shrDados = _shrDados.filter(r => r.id !== id);
                _shrRenderizar();
                _shrMsg(`<strong>${_shrEsc(codigo)}</strong> removido do recebimento de hoje.`, "aviso");
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Remover recebimento",
        "Remover"
    );
}
