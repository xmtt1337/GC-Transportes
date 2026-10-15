function abrirDesempenhoBip(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-desempenho-bip');
    document.getElementById('titulo-pagina').innerText = 'Desempenho';
    _desempInicializarAnos();
    _desempCarregar();
}

function _desempInicializarAnos() {
    const sel = document.getElementById('desemp-ano');
    if (sel.options.length > 1) return;
    const ano = new Date().getFullYear();
    sel.innerHTML = '<option value="">Todos os anos</option>';
    for (let a = ano; a >= ano - 3; a--) {
        sel.innerHTML += `<option value="${a}"${a === ano ? ' selected' : ''}>${a}</option>`;
    }
    // Pré-seleciona mês atual
    document.getElementById('desemp-mes').value = String(new Date().getMonth() + 1);
}

async function _desempCarregar() {
    const mes = document.getElementById('desemp-mes').value;
    const ano = document.getElementById('desemp-ano').value;
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');

    skMostrar(emptyEl);
    emptyEl.style.display = '';
    contentEl.style.display = 'none';

    const transp = document.getElementById('desemp-transp').value;
    const transpNomeFiltro = { todas:'Todas', loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };

    try {
        const params = new URLSearchParams();
        if (mes && ano) { params.set('mes', mes); params.set('ano', ano); }
        if (transp && transp !== 'todas') params.set('transportadora', transp);
        const url  = API + '/bipagem/desempenho' + (params.toString() ? '?' + params.toString() : '');
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const meses = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const periodoMes   = mes && ano ? `${meses[parseInt(mes)]} ${ano}` : 'Todos os meses';
        const periodoTransp = transp !== 'todas' ? ` · ${transpNomeFiltro[transp]}` : '';
        const periodo = periodoMes + periodoTransp;

        const vazio = !(data.recebimento || []).length && !(data.conferencia || []).length && !(data.bipagens || []).length;
        if (vazio) {
            skFim(emptyEl, `Nenhuma bipagem em ${periodo}.`);
            return;
        }
        _desempRenderizar(data, periodo);
    } catch (err) {
        skFim(emptyEl, 'Erro: ' + err.message);
    }
}

// Três fontes, cada uma com o seu ranking: o recebimento e as conferências da
// Shopee e as bipagens feitas em Operação > Bipagens. Somar tudo num número só
// escondia quem passou o dia no recebimento.
const _DESEMP_FONTES = [
    { chave: 'recebimento', titulo: 'Recebimento · Shopee',  cor: '#F97316', unidade: 'recebidos' },
    { chave: 'conferencia', titulo: 'Conferências · Shopee', cor: '#F97316', unidade: 'conferidos' },
    { chave: 'bipagens',    titulo: 'Operação · Bipagens',   cor: null,      unidade: 'bipagens' },
];

function _desempRenderizar(data, periodo) {
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');
    const rankEl    = document.getElementById('desemp-ranking');

    rankEl.innerHTML = _DESEMP_FONTES
        .filter(f => (data[f.chave] || []).length)
        .map(f => `<div class="desemp-secao">${_desempSecao(data[f.chave], f, periodo)}</div>`)
        .join('');

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}

function _desempSecao(rows, fonte, periodo) {
    const maximo = rows[0].total;
    const cores  = { loggi:'#12A5E8', anjun:'#22C55E', jt:'#EF4444', imile:'#9333EA', shopee:'#F97316' };
    const nomes  = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };
    const transp = ['loggi','anjun','jt','imile','shopee'];
    const posMedal   = ['🥇','🥈','🥉'];
    const posAccent  = ['#eab308','#94a3b8','#b45309'];
    const posBg      = ['rgba(234,179,8,0.09)','rgba(148,163,184,0.07)','rgba(180,83,9,0.08)','rgba(58,134,255,0.03)'];
    const totalGeral = rows.reduce((s, u) => s + u.total, 0);
    const transpFiltro = document.getElementById('desemp-transp').value;
    // Recebimento e conferência são só Shopee: a quebra por transportadora não diz nada lá.
    const comQuebra = fonte.chave === 'bipagens';

    return `
        <div class="rank-summary">${fonte.cor ? `<span class="desemp-secao-dot" style="background:${fonte.cor}"></span>` : ''}${fonte.titulo} · ${periodo} · ${totalGeral.toLocaleString('pt-BR')} ${fonte.unidade} · ${rows.length} operador${rows.length !== 1 ? 'es' : ''}</div>
        ${rows.map((u, i) => {
            const pct      = maximo > 0 ? (u.total / maximo * 100).toFixed(1) : 0;
            const pctTotal = totalGeral > 0 ? (u.total / totalGeral * 100).toFixed(0) : 0;
            const accent   = posAccent[i] || 'rgba(255,255,255,0.08)';
            const rkBg     = posBg[Math.min(i, 3)];
            const posEl    = i < 3
                ? `<div class="rank-pos">${posMedal[i]}</div>`
                : `<div class="rank-pos"><span class="rank-pos-num">${i+1}º</span></div>`;

            const carriers = !comQuebra ? '' : transp
                .filter(t => u[t] > 0 && (transpFiltro === 'todas' || transpFiltro === t))
                .map(t => {
                    const barPct = u.total > 0 ? (u[t] / u.total * 100).toFixed(1) : 0;
                    return `<div class="rank-carrier">
                        <span class="rank-c-dot" style="background:${cores[t]}"></span>
                        <span class="rank-c-name">${nomes[t]}</span>
                        <div class="rank-c-track"><div class="rank-c-fill" style="width:${barPct}%;background:${cores[t]}"></div></div>
                        <span class="rank-c-val" style="color:${cores[t]}">${u[t].toLocaleString('pt-BR')}</span>
                    </div>`;
                }).join('');

            const partes = (u.usuario_nome || '').trim().split(/\s+/);
            const ini = partes.length > 1 ? partes[0][0] + partes[partes.length-1][0] : (partes[0]||'?').slice(0,2);

            return `
            <div class="rank-card" style="--rk-accent:${accent};--rk-bg:${rkBg}">
                <div class="rank-head">
                    ${posEl}
                    <div class="rank-avatar">${ini.toUpperCase()}</div>
                    <div class="rank-info">
                        <div class="rank-name">${u.usuario_nome}</div>
                        <div class="rank-pct-lbl">${pctTotal}% do total · ${u.total.toLocaleString('pt-BR')} de ${totalGeral.toLocaleString('pt-BR')}</div>
                    </div>
                    <div class="rank-total">
                        <div class="rank-num">${u.total.toLocaleString('pt-BR')}</div>
                        <div class="rank-lbl">${fonte.unidade}</div>
                    </div>
                </div>
                <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
                ${carriers ? `<div class="rank-carriers">${carriers}</div>` : ''}
            </div>`;
        }).join('')}`;
}
