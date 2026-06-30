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
    _pedCarregar();
}

async function _pedCarregar() {
    const de  = document.getElementById('ped-de').value;
    const ate = document.getElementById('ped-ate').value;
    const emptyEl = document.getElementById('ped-empty');
    const listaEl = document.getElementById('ped-lista');

    emptyEl.innerText = 'Carregando...';
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
        _pedDados = data;
        _pedRenderizar(data);
    } catch (err) {
        emptyEl.innerText = err.name === 'AbortError'
            ? 'O servidor demorou muito para responder. Tente novamente.'
            : 'Erro ao carregar: ' + err.message;
    }
}

function _pedRenderizar(rows) {
    const emptyEl = document.getElementById('ped-empty');
    const listaEl = document.getElementById('ped-lista');

    _pedFiltrados = rows;
    _pedPagina = 1;

    if (!rows.length) {
        emptyEl.innerText = 'Nenhum pedido bipado no período.';
        emptyEl.style.display = '';
        listaEl.style.display = 'none';
        return;
    }

    document.getElementById('ped-counter').innerText = `${rows.length.toLocaleString('pt-BR')} registro${rows.length !== 1 ? 's' : ''}`;
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
    tbody.innerHTML = pagina.map(r => {
        const cor   = _PED_TRANSP_CORES[r.transportadora] || '#64748b';
        const nome  = _PED_TRANSP_NOMES[r.transportadora] || r.transportadora || '—';
        const data  = r.bipado_em ? new Date(r.bipado_em).toLocaleString('pt-BR') : '—';
        const cep   = r.cep ? r.cep.slice(0,5) + '-' + r.cep.slice(5) : '—';
        return `<tr>
            <td style="font-size:12px;color:#94a3b8;font-family:monospace">${r.codigo || '—'}</td>
            <td><span style="font-weight:600;color:${cor}">${nome}</span></td>
            <td>${r.entregador || '—'}</td>
            <td>${r.cidade || '—'}</td>
            <td style="font-family:monospace;font-size:12px">${cep}</td>
            <td style="font-size:12px;white-space:nowrap">${data}</td>
            <td style="font-size:12px;color:#64748b">${r.usuario_nome || '—'}</td>
        </tr>`;
    }).join('');

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

function _pedFiltrarLocal() {
    const termo = document.getElementById('ped-filtro-input').value.trim().toLowerCase();
    if (!termo) { _pedRenderizar(_pedDados); return; }
    const filtrado = _pedDados.filter(r =>
        (r.codigo       || '').toLowerCase().includes(termo) ||
        (r.entregador   || '').toLowerCase().includes(termo) ||
        (r.cidade       || '').toLowerCase().includes(termo) ||
        (r.usuario_nome || '').toLowerCase().includes(termo)
    );
    _pedRenderizar(filtrado);
}

async function _pedExportarComDatas(de, ate) {
    const btn = document.getElementById('ped-exportar-btn');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerText = 'Exportando...';

    try {
        let url = API + '/pedidos/lista?exportar=1';
        if (de && ate) url += `&de=${de}&ate=${ate}`;

        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.error);
        if (!dados.length) { alert('Nenhum pedido bipado nesse período.'); btn.disabled = false; btn.innerHTML = txtOriginal; return; }

        const rows = dados.map(r => ({
            'Código':         r.codigo        || '',
            'Transportadora': _PED_TRANSP_NOMES[r.transportadora] || r.transportadora || '',
            'Entregador':     r.entregador    || '',
            'Cidade':         r.cidade        || '',
            'CEP':            r.cep ? r.cep.slice(0,5) + '-' + r.cep.slice(5) : '',
            'Bipado em':      r.bipado_em ? new Date(r.bipado_em).toLocaleString('pt-BR') : '',
            'Bipado por':     r.usuario_nome  || '',
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

// ───── POPOVER DE EXPORTAÇÃO — CALENDÁRIO DE INTERVALO (clique e arraste) ─────
const _PED_CAL_DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
let _pedCalMes       = new Date();
let _pedCalInicio    = null;
let _pedCalFim       = null;
let _pedCalArrastando = false;

function _pedFmtData(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _pedParseData(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function _pedAbrirExportarPop(event) {
    event.stopPropagation();
    const pop = document.getElementById('ped-export-pop');
    if (pop.style.display !== 'none') { _pedFecharExportarPop(); return; }

    if (pop.parentElement !== document.body) document.body.appendChild(pop);

    const de  = document.getElementById('ped-de').value;
    const ate = document.getElementById('ped-ate').value;
    _pedCalInicio = de ? _pedParseData(de) : null;
    _pedCalFim    = ate ? _pedParseData(ate) : (_pedCalInicio || null);
    _pedCalMes    = new Date(_pedCalInicio || new Date());
    _pedCalMes.setDate(1);

    const btn = document.getElementById('ped-exportar-btn');
    const rect = btn.getBoundingClientRect();
    pop.style.top   = (rect.bottom + 8) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
    pop.style.left  = 'auto';
    pop.style.display = 'block';
    pop.onclick = ev => ev.stopPropagation();

    _pedCalRender();
    document.addEventListener('click', _pedFecharExportarPop);
    document.addEventListener('mouseup', _pedCalMouseUp);
}

function _pedFecharExportarPop() {
    const pop = document.getElementById('ped-export-pop');
    pop.style.display = 'none';
    _pedCalArrastando = false;
    document.removeEventListener('click', _pedFecharExportarPop);
    document.removeEventListener('mouseup', _pedCalMouseUp);
}

function _pedCalMouseUp() {
    _pedCalArrastando = false;
}

function _pedCalMesAnterior() {
    _pedCalMes.setMonth(_pedCalMes.getMonth() - 1);
    _pedCalRender();
}
function _pedCalMesProximo() {
    _pedCalMes.setMonth(_pedCalMes.getMonth() + 1);
    _pedCalRender();
}

function _pedCalDown(dataStr) {
    _pedCalInicio = _pedParseData(dataStr);
    _pedCalFim    = _pedCalInicio;
    _pedCalArrastando = true;
    _pedCalRender();
}
function _pedCalEnter(dataStr) {
    if (!_pedCalArrastando) return;
    _pedCalFim = _pedParseData(dataStr);
    _pedCalRender();
}

function _pedCalCancelar() {
    _pedFecharExportarPop();
}

function _pedCalConfirmar() {
    if (!_pedCalInicio) return;
    let inicio = _pedCalInicio, fim = _pedCalFim || _pedCalInicio;
    if (fim < inicio) { [inicio, fim] = [fim, inicio]; }
    const de  = _pedFmtData(inicio);
    const ate = _pedFmtData(fim);
    _pedFecharExportarPop();
    _pedExportarComDatas(de, ate);
}

function _pedCalRender() {
    const pop = document.getElementById('ped-export-pop');
    const mes = _pedCalMes;
    const ano = mes.getFullYear();
    const mesIdx = mes.getMonth();

    let inicio = _pedCalInicio, fim = _pedCalFim;
    if (inicio && fim && fim < inicio) { [inicio, fim] = [fim, inicio]; }

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
        }

        gridHtml += `<div class="${classes}" onmousedown="_pedCalDown('${dataStr}')" onmouseenter="_pedCalEnter('${dataStr}')">${dia.getDate()}</div>`;
    }

    const dowHtml = _PED_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join('');

    let rangeTxt = 'Clique e arraste para selecionar o período';
    if (inicio && fim) {
        rangeTxt = inicio.getTime() === fim.getTime()
            ? inicio.toLocaleDateString('pt-BR')
            : `${inicio.toLocaleDateString('pt-BR')} — ${fim.toLocaleDateString('pt-BR')}`;
    }

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
        <div class="ped-cal-footer">
            <span class="ped-cal-range-txt">${rangeTxt}</span>
            <div class="ped-cal-btns">
                <button class="ped-cal-btn-cancelar" onclick="_pedCalCancelar()">Cancelar</button>
                <button class="ped-cal-btn-confirmar" onclick="_pedCalConfirmar()" ${inicio ? '' : 'disabled'}>Exportar</button>
            </div>
        </div>`;
}
