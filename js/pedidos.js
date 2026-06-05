let _pedDados = [];

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

    if (!rows.length) {
        emptyEl.innerText = 'Nenhum pedido bipado no período.';
        emptyEl.style.display = '';
        listaEl.style.display = 'none';
        return;
    }

    document.getElementById('ped-counter').innerText = `${rows.length.toLocaleString('pt-BR')} registro${rows.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('ped-tbody');
    tbody.innerHTML = rows.map(r => {
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

    emptyEl.style.display = 'none';
    listaEl.style.display = '';
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

function _pedExportar() {
    if (!_pedDados.length) return;
    const de  = document.getElementById('ped-de').value;
    const ate = document.getElementById('ped-ate').value;

    const rows = _pedDados.map(r => ({
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
}
