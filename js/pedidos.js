let _pedDados = [];
let _pedFiltrados = [];
let _pedPagina = 1;
let _pedPorPagina = 25;

const _PED_TRANSP_NOMES = { loggi:'Loggi', anjun:'Anjun', jt:'J&T Express', imile:'Imile', shopee:'Shopee', cep:'CEP' };
const _PED_TRANSP_CORES = { loggi:'#12A5E8', anjun:'#22C55E', imile:'#9333EA', jt:'#EF4444', shopee:'#F97316', cep:'#94a3b8' };

function abrirPesquisarPedidos(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-pesquisar-pedidos');
    document.getElementById('titulo-pagina').innerText = 'Pedidos bipados';
    _pedCarregar();
}

function _pedLimparFiltro() {
    document.getElementById('ped-de').value  = '';
    document.getElementById('ped-ate').value = '';
    document.getElementById('ped-filtro-txt').innerText = 'Todos os períodos';
    _pedCarregar();
}

// Cor por ETAPA, não por transportadora: a lista agora mistura recebimento,
// conferência, devolução e custódia, e é a etapa que diz o que aconteceu.
const _PED_ETAPA_CORES = {
    recebimento:            '#12A5E8',
    conferencia_operacao:   '#3a86ff',
    conferencia_entregador: '#22c55e',
    retido:                 '#ef4444',
    bipagem:                '#8494a9',
    devolucao:              '#f59e0b',
    faltante:               '#ef4444',
    custodia:               '#9333EA',
};

let _pedTruncado = 0;

/**
 * Resposta antiga (só bipagem de separação) no formato novo.
 *
 * COMPATIBILIDADE TEMPORÁRIA: dá pra apagar isto depois que o servidor novo
 * estiver de pé há um tempo. Sem o mapeamento, as linhas antigas apareceriam
 * com Etapa, O que foi e Quem em branco — o que parece tela quebrada, pior do
 * que a lista vazia que já acontecia.
 */
function _pedCompat(r) {
    if (r && r.etapa) return r;
    return {
        codigo:       r.codigo,
        etapa:        'bipagem',
        etapa_rotulo: 'Bipagem de separação',
        detalhe:      [r.transportadora, r.entregador, r.cidade].filter(Boolean).join(' · '),
        usuario:      r.usuario_nome || null,
        quando:       r.bipado_em || null,
        quando_texto: null,
    };
}

function _pedEsc(t) {
    return String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Quando aconteceu. O texto gravado no bipe manda, quando existe: ele já veio
 * no fuso de Brasília, do aparelho de quem bipou. O timestamp é a reserva.
 */
function _pedQuando(r) {
    if (r.quando_texto) return r.quando_texto;
    if (!r.quando) return '—';
    const d = new Date(r.quando);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function _pedCarregar() {
    const de  = document.getElementById('ped-de').value;
    const ate = document.getElementById('ped-ate').value;
    const emptyEl = document.getElementById('ped-empty');
    const listaEl = document.getElementById('ped-lista');

    skMostrar(emptyEl);
    emptyEl.style.display = '';
    listaEl.style.display = 'none';

    try {
        let url = API + '/pedidos/lista';
        if (de && ate) url += `?de=${de}&ate=${ate}`;

        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 20000);

        const res  = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        // A resposta traz o corte junto: sete fontes num mês passam fácil do
        // teto, e cortar em silêncio faria a lista parecer completa.
        //
        // Aceita as duas formas de propósito. O site publica antes do servidor
        // (GitHub Pages é rápido, o Render sobe depois), e nessa janela a tela
        // nova recebia a resposta antiga em forma de array — `data.eventos` dava
        // undefined e a lista nascia VAZIA, como se não houvesse bipagem
        // nenhuma. Página em cache faz o mesmo.
        _pedDados = (Array.isArray(data) ? data : (data.eventos || [])).map(_pedCompat);
        _pedTruncado = (!Array.isArray(data) && data.truncado) ? (data.teto || 0) : 0;
        _pedRenderizar(_pedDados);
    } catch (err) {
        emptyEl.innerText = err.name === 'AbortError'
            ? 'O servidor demorou muito para responder. Tente novamente.'
            : 'Erro ao carregar: ' + err.message;
    }
}

/**
 * @param {Array} rows Registros a mostrar.
 * @param {boolean=} filtrando Veio de um filtro digitado, não do carregamento.
 *
 * A diferença importa: o campo de busca mora DENTRO de #ped-lista. Esconder a
 * lista quando o filtro não acha nada levava o campo junto — e a pessoa ficava
 * sem como apagar o termo ou procurar outro código. Filtro vazio agora mantém
 * a lista de pé e explica dentro da tabela.
 */
function _pedRenderizar(rows, filtrando) {
    const emptyEl = document.getElementById('ped-empty');
    const listaEl = document.getElementById('ped-lista');

    _pedFiltrados = rows;
    _pedPagina = 1;

    if (!rows.length && filtrando) {
        emptyEl.style.display = 'none';
        listaEl.style.display = '';
        document.getElementById('ped-counter').innerText = 'Nenhum registro com esse filtro';
        document.getElementById('ped-tbody').innerHTML =
            `<tr><td colspan="5" style="text-align:center;padding:26px;color:#8494a9">
                Nenhum registro com esse filtro nos carregados.
                Digite o código inteiro para procurar no sistema todo.
                <button type="button" onclick="_pedLimparBusca()"
                        style="margin-left:10px;background:rgba(58,134,255,0.1);border:1px solid rgba(58,134,255,0.35);color:#5d9aff;border-radius:8px;padding:5px 12px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Limpar busca</button>
            </td></tr>`;
        document.getElementById('ped-pagina-info').innerText = '';
        return;
    }

    if (!rows.length) {
        skFim(emptyEl, 'Nenhum pedido bipado no período.');
        emptyEl.style.display = '';
        listaEl.style.display = 'none';
        return;
    }

    document.getElementById('ped-counter').innerText =
        `${rows.length.toLocaleString('pt-BR')} registro${rows.length !== 1 ? 's' : ''}`
        + (_pedTruncado ? ` (teto de ${_pedTruncado.toLocaleString('pt-BR')} — reduza o período)` : '');
    emptyEl.style.display = 'none';
    listaEl.style.display = '';
    _pedRenderizarPagina();
}

function _pedRenderizarPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_pedFiltrados.length / _pedPorPagina));
    _pedPagina = Math.min(Math.max(1, _pedPagina), totalPaginas);

    const inicio = (_pedPagina - 1) * _pedPorPagina;
    const pagina = _pedFiltrados.slice(inicio, inicio + _pedPorPagina);

    const tbody = document.getElementById('ped-tbody');
    tbody.innerHTML = pagina.map(r => `<tr>
            <td style="font-size:12px;color:#94a3b8;font-family:monospace">${_pedEsc(r.codigo) || '—'}</td>
            <td><span style="font-weight:600;color:${_PED_ETAPA_CORES[r.etapa] || '#8494a9'}">${_pedEsc(r.etapa_rotulo)}</span></td>
            <td>${_pedEsc(r.detalhe) || '—'}</td>
            <td style="font-size:12px;white-space:nowrap">${_pedEsc(_pedQuando(r))}</td>
            <td style="font-size:12px;color:#8494a9">${_pedEsc(r.usuario) || '—'}</td>
        </tr>`).join('');

    document.getElementById('ped-pagina-info').innerText = `Página ${_pedPagina} de ${totalPaginas}`;
}

function _pedMudarPorPagina() {
    _pedPorPagina = parseInt(document.getElementById('ped-por-pagina').value, 10);
    _pedPagina = 1;
    _pedRenderizarPagina();
}

function _pedPaginaAnterior() {
    if (_pedPagina <= 1) return;
    _pedPagina--;
    _pedRenderizarPagina();
}

function _pedProximaPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_pedFiltrados.length / _pedPorPagina));
    if (_pedPagina >= totalPaginas) return;
    _pedPagina++;
    _pedRenderizarPagina();
}

// Tamanho mínimo pra valer uma ida ao servidor. Abaixo disso o termo é vago
// demais — "BR2" casaria com meia base — e a busca por código não ajudaria.
const _PED_MIN_BUSCA = 6;

let _pedBuscaTimer = null;
let _pedBuscaAtual = 0;   // corrida: só a resposta da última digitação vale

/**
 * Filtra o que está na tela e, se não achar nada, pergunta ao servidor.
 *
 * O filtro local sozinho MENTIA: ele só enxerga os registros carregados, que
 * têm teto de 5.000. Um código real, mas mais antigo que os 5.000 últimos,
 * aparecia como "nenhum registro" — e "não achei aqui" virava "não existe",
 * que é a pior resposta possível numa tela de investigação.
 *
 * A busca no servidor não tem teto nem período: vai na view inteira.
 */
function _pedFiltrarLocal() {
    const bruto = document.getElementById('ped-filtro-input').value.trim();
    const termo = bruto.toLowerCase();

    clearTimeout(_pedBuscaTimer);
    _pedBuscaAtual++;

    if (!termo) { _pedRenderizar(_pedDados); return; }

    const filtrado = _pedDados.filter(r =>
        (r.codigo       || '').toLowerCase().includes(termo) ||
        (r.etapa_rotulo || '').toLowerCase().includes(termo) ||
        (r.detalhe      || '').toLowerCase().includes(termo) ||
        (r.usuario      || '').toLowerCase().includes(termo)
    );
    if (filtrado.length) { _pedRenderizar(filtrado, true); return; }

    if (bruto.length < _PED_MIN_BUSCA) { _pedRenderizar([], true); return; }

    // Nada na página: pode ser código antigo. Pergunta ao servidor, com uma
    // pausa pra não disparar uma consulta por tecla digitada.
    _pedRenderizarBuscando(bruto);
    const meu = _pedBuscaAtual;
    _pedBuscaTimer = setTimeout(() => _pedBuscarNoServidor(bruto, meu), 400);
}

function _pedRenderizarBuscando(termo) {
    document.getElementById('ped-empty').style.display = 'none';
    document.getElementById('ped-lista').style.display = '';
    document.getElementById('ped-counter').innerText = 'Procurando no sistema inteiro...';
    document.getElementById('ped-tbody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;padding:26px;color:#8494a9">Procurando ${_pedEsc(termo)} fora do período carregado...</td></tr>`;
    document.getElementById('ped-pagina-info').innerText = '';
}

function _pedBuscarNoServidor(termo, meu) {
    fetch(API + '/pedidos/buscar?codigo=' + encodeURIComponent(termo), {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        // Chegou depois de a pessoa continuar digitando: a resposta é de outro
        // termo e mostrá-la seria pior do que não mostrar nada.
        if (meu !== _pedBuscaAtual) return;
        if (!ok || !Array.isArray(b) || !b.length) {
            _pedRenderizarNadaNoSistema(termo);
            return;
        }
        _pedRenderizar(b.map(_pedCompat), true);
        document.getElementById('ped-counter').innerText =
            `${b.length} registro${b.length !== 1 ? 's' : ''} de ${termo} — busca no sistema inteiro`;
    })
    .catch(() => {
        if (meu !== _pedBuscaAtual) return;
        document.getElementById('ped-tbody').innerHTML =
            `<tr><td colspan="5" style="text-align:center;padding:26px;color:#8494a9">Erro ao conectar com o servidor.</td></tr>`;
    });
}

function _pedRenderizarNadaNoSistema(termo) {
    document.getElementById('ped-counter').innerText = 'Nada encontrado';
    document.getElementById('ped-tbody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;padding:26px;color:#8494a9">
            <strong style="color:#cbd5e1">${_pedEsc(termo)}</strong> nunca foi bipado no sistema —
            nem no recebimento, nem em conferência nenhuma.
            <button type="button" onclick="_pedLimparBusca()"
                    style="margin-left:10px;background:rgba(58,134,255,0.1);border:1px solid rgba(58,134,255,0.35);color:#5d9aff;border-radius:8px;padding:5px 12px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Limpar busca</button>
        </td></tr>`;
    document.getElementById('ped-pagina-info').innerText = '';
}

function _pedLimparBusca() {
    document.getElementById('ped-filtro-input').value = '';
    clearTimeout(_pedBuscaTimer);
    _pedBuscaAtual++;
    _pedRenderizar(_pedDados);
}

async function _pedExportarComDatas(de, ate) {
    const btn = document.getElementById('ped-exportar-btn');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerText = 'Exportando...';

    try {
        let url = API + '/pedidos/lista';
        if (de && ate) url += `?de=${de}&ate=${ate}`;

        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const corpo = await res.json();
        if (!res.ok) throw new Error(corpo.error);
        const dados = corpo.eventos || [];
        if (!dados.length) { alert('Nenhum registro nesse período.'); btn.disabled = false; btn.innerHTML = txtOriginal; return; }
        // O teto da consulta vale pro Excel também: exportar 5.000 achando que
        // são todos é pior do que saber que foi cortado.
        if (corpo.truncado) alert(`A exportação traz os ${corpo.teto.toLocaleString('pt-BR')} mais recentes. Reduza o período para levar tudo.`);

        const rows = dados.map(r => ({
            'Código':     r.codigo       || '',
            'Etapa':      r.etapa_rotulo || '',
            'O que foi':  r.detalhe      || '',
            'Quando':     _pedQuando(r),
            'Quem':       r.usuario      || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bipagens');
        const nome = de && ate ? `bipagens_${de}_${ate}.xlsx` : 'bipagens_todos.xlsx';
        XLSX.writeFile(wb, nome);
    } catch (err) {
        alert('Erro ao exportar: ' + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = txtOriginal;
}

// ───── CALENDÁRIO DE INTERVALO (1 clique = data inicial, 1 clique = data final) ─────
// Usado tanto pelo filtro de período (topo) quanto pelo "Exportar Pedidos".
const _PED_CAL_DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
let _pedCalModo    = 'filtro'; // 'filtro' | 'export'
let _pedCalMes     = new Date();
let _pedCalInicio  = null;
let _pedCalFim     = null;

function _pedFmtData(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _pedParseData(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function _pedAbrirCalendario(event, modo) {
    event.stopPropagation();
    const pop = document.getElementById('ped-export-pop');
    const jaAberto = pop.style.display !== 'none' && _pedCalModo === modo;
    if (jaAberto) { _pedFecharCalendario(); return; }

    if (pop.parentElement !== document.body) document.body.appendChild(pop);

    _pedCalModo = modo;
    const de  = document.getElementById('ped-de').value;
    const ate = document.getElementById('ped-ate').value;
    _pedCalInicio = de ? _pedParseData(de) : null;
    _pedCalFim    = ate ? _pedParseData(ate) : null;
    _pedCalMes    = new Date(_pedCalInicio || new Date());
    _pedCalMes.setDate(1);

    const btn = document.getElementById(modo === 'export' ? 'ped-exportar-btn' : 'ped-filtro-btn');
    const rect = btn.getBoundingClientRect();
    pop.style.top   = (rect.bottom + 8) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
    pop.style.left  = 'auto';
    pop.style.display = 'block';
    pop.onclick = ev => ev.stopPropagation();

    _pedCalRender();
    document.addEventListener('click', _pedFecharCalendario);
}

function _pedFecharCalendario() {
    const pop = document.getElementById('ped-export-pop');
    pop.style.display = 'none';
    document.removeEventListener('click', _pedFecharCalendario);
}

function _pedCalMesAnterior() {
    _pedCalMes.setMonth(_pedCalMes.getMonth() - 1);
    _pedCalRender();
}
function _pedCalMesProximo() {
    _pedCalMes.setMonth(_pedCalMes.getMonth() + 1);
    _pedCalRender();
}

function _pedCalClick(dataStr) {
    const d = _pedParseData(dataStr);
    if (!_pedCalInicio || _pedCalFim) {
        // comeca uma nova selecao
        _pedCalInicio = d;
        _pedCalFim    = null;
    } else if (d < _pedCalInicio) {
        _pedCalFim    = _pedCalInicio;
        _pedCalInicio = d;
    } else {
        _pedCalFim = d;
    }
    _pedCalRender();

    if (_pedCalInicio && _pedCalFim && _pedCalModo === 'filtro') {
        _pedAplicarFiltro();
    }
}

function _pedAplicarFiltro() {
    const de  = _pedFmtData(_pedCalInicio);
    const ate = _pedFmtData(_pedCalFim);
    document.getElementById('ped-de').value  = de;
    document.getElementById('ped-ate').value = ate;
    document.getElementById('ped-filtro-txt').innerText =
        `${_pedCalInicio.toLocaleDateString('pt-BR')} — ${_pedCalFim.toLocaleDateString('pt-BR')}`;
    _pedFecharCalendario();
    _pedCarregar();
}

function _pedCalCancelar() {
    _pedFecharCalendario();
}

function _pedCalConfirmar() {
    if (!_pedCalInicio) return;
    const fim = _pedCalFim || _pedCalInicio;
    const de  = _pedFmtData(_pedCalInicio);
    const ate = _pedFmtData(fim);
    _pedFecharCalendario();
    _pedExportarComDatas(de, ate);
}

function _pedCalRender() {
    const pop = document.getElementById('ped-export-pop');
    const mes = _pedCalMes;
    const ano = mes.getFullYear();
    const mesIdx = mes.getMonth();

    const inicio = _pedCalInicio;
    const fim    = _pedCalFim;

    const primeiroDiaSemana = new Date(ano, mesIdx, 1).getDay();
    const diasNoMes = new Date(ano, mesIdx + 1, 0).getDate();
    const celulaInicio = new Date(ano, mesIdx, 1 - primeiroDiaSemana);

    const totalCelulas = Math.ceil((primeiroDiaSemana + diasNoMes) / 7) * 7;
    let gridHtml = '';
    for (let i = 0; i < totalCelulas; i++) {
        const dia = new Date(celulaInicio);
        dia.setDate(celulaInicio.getDate() + i);
        const dataStr = _pedFmtData(dia);
        const foraDoMes = dia.getMonth() !== mesIdx;

        let classes = 'ped-cal-day' + (foraDoMes ? ' outro-mes' : '');
        if (inicio && fim) {
            const t = dia.getTime();
            if (t === inicio.getTime() && t === fim.getTime()) classes += ' intervalo-unico';
            else if (t === inicio.getTime()) classes += ' intervalo-inicio';
            else if (t === fim.getTime()) classes += ' intervalo-fim';
            else if (t > inicio.getTime() && t < fim.getTime()) classes += ' no-intervalo';
        } else if (inicio && dia.getTime() === inicio.getTime()) {
            classes += ' intervalo-unico';
        }

        gridHtml += `<div class="${classes}" onclick="_pedCalClick('${dataStr}')">${dia.getDate()}</div>`;
    }

    const dowHtml = _PED_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join('');

    let rangeTxt = !_pedCalInicio
        ? 'Clique na data inicial'
        : !_pedCalFim
            ? 'Agora clique na data final'
            : `${_pedCalInicio.toLocaleDateString('pt-BR')} — ${_pedCalFim.toLocaleDateString('pt-BR')}`;

    const footer = _pedCalModo === 'export'
        ? `<div class="ped-cal-footer">
            <span class="ped-cal-range-txt">${rangeTxt}</span>
            <div class="ped-cal-btns">
                <button class="ped-cal-btn-cancelar" onclick="_pedCalCancelar()">Cancelar</button>
                <button class="ped-cal-btn-confirmar" onclick="_pedCalConfirmar()" ${inicio ? '' : 'disabled'}>Exportar</button>
            </div>
        </div>`
        : `<div class="ped-cal-footer">
            <span class="ped-cal-range-txt">${rangeTxt}</span>
        </div>`;

    pop.innerHTML = `
        <div class="ped-cal-header">
            <button class="ped-cal-nav" onclick="_pedCalMesAnterior()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${_MES_NOMES[mesIdx + 1]} ${ano}</span>
            <button class="ped-cal-nav" onclick="_pedCalMesProximo()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${dowHtml}${gridHtml}</div>
        ${footer}`;
}
