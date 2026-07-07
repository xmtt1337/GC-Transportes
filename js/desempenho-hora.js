function abrirDesempenhoHora(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-desempenho-hora');
    document.getElementById('titulo-pagina').innerText = 'Desempenho';
    const dataInput = document.getElementById('desemp-hora-data');
    if (!dataInput.value) {
        const hoje = new Date();
        const tz   = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000);
        dataInput.value = tz.toISOString().slice(0, 10);
    }
    _desempHoraCarregar();
}

async function _desempHoraCarregar() {
    const data = document.getElementById('desemp-hora-data').value;
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');

    emptyEl.innerText = 'Carregando...';
    emptyEl.style.display = '';
    contentEl.style.display = 'none';

    if (!data) { emptyEl.innerText = 'Selecione uma data.'; return; }

    try {
        const transp = document.getElementById('desemp-hora-transp').value;
        const params = new URLSearchParams({ data });
        if (transp && transp !== 'todas') params.set('transportadora', transp);
        const url  = API + '/bipagem/desempenho-hora?' + params.toString();
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);

        if (!body.horas || !body.horas.length) {
            emptyEl.innerText = 'Nenhuma bipagem nesta data.';
            return;
        }
        _desempHoraRenderizar(body.horas, body.comparativo || [], body.transp || [], data);
    } catch (err) {
        emptyEl.innerText = 'Erro: ' + err.message;
    }
}

// Compara um valor atual com uma base (última bipagem anterior ou média histórica): verde se avançou, vermelho se não
function _desempHoraComparar(atual, base) {
    if (!base) return { texto: '-', classe: 'neutral' };
    const pct    = ((atual - base) / base) * 100;
    const classe = pct >= 0 ? 'up' : 'down';
    const seta   = pct >= 0 ? '▲' : '▼';
    return { texto: `${seta} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, classe };
}

function _desempHoraIniciais(nome) {
    const partes = nome.trim().split(/\s+/);
    const ini = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
    return ini.toUpperCase();
}

function _desempHoraDonut(segmentos, totalDia) {
    const cores = { loggi:'#12A5E8', anjun:'#22C55E', jt:'#EF4444', imile:'#9333EA', shopee:'#F97316' };
    const nomes = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };
    if (!segmentos || !segmentos.length) return '';
    const r = 41; const cx = 56; const cy = 56; const espessura = 19;
    const circum = 2 * Math.PI * r;
    let acum = 0;
    const svgSegs = segmentos.map(s => {
        const pct  = s.total / totalDia;
        const dash = pct * circum;
        const off  = -acum;
        acum += dash;
        const cor = cores[s.transportadora] || '#4a6a8a';
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cor}" stroke-width="${espessura}"
            stroke-dasharray="${dash.toFixed(2)} ${circum.toFixed(2)}"
            stroke-dashoffset="${off.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>`;
    }).join('');
    const legend = segmentos.map(s => {
        const cor  = cores[s.transportadora] || '#4a6a8a';
        const pct  = ((s.total / totalDia) * 100).toFixed(0);
        const nome = nomes[s.transportadora] || s.transportadora;
        return `<div class="dh-donut-item">
            <span class="dh-donut-dot" style="background:${cor}"></span>
            <span class="dh-donut-lbl">${nome}</span>
            <span class="dh-donut-val">${s.total}</span>
            <span class="dh-donut-pct">${pct}%</span>
        </div>`;
    }).join('');
    return `<div class="dh-donut-area">
        <svg width="112" height="112" viewBox="0 0 112 112" style="flex-shrink:0">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${espessura}"/>
            ${svgSegs}
        </svg>
        <div class="dh-donut-legend">${legend}</div>
    </div>`;
}

function _desempHoraRenderizar(rows, comparativo, transpRows, data) {
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');
    const listaEl   = document.getElementById('desemp-hora-lista');

    const compMap = {};
    comparativo.forEach(c => { compMap[c.usuario_nome] = c; });

    const transpMap = {};
    transpRows.forEach(t => {
        if (!transpMap[t.usuario_nome]) transpMap[t.usuario_nome] = [];
        transpMap[t.usuario_nome].push(t);
    });

    // Agrupa por usuário -> { hora: total }
    const usuarios = {};
    rows.forEach(r => {
        if (!usuarios[r.usuario_nome]) usuarios[r.usuario_nome] = {};
        usuarios[r.usuario_nome][r.hora] = r.total;
    });

    // Ordena por total descrescente (melhor operador primeiro)
    const totaisPorNome = {};
    Object.keys(usuarios).forEach(n => {
        totaisPorNome[n] = Object.values(usuarios[n]).reduce((a, b) => a + b, 0);
    });
    const nomes = Object.keys(usuarios).sort((a, b) => totaisPorNome[b] - totaisPorNome[a]);

    const totalEquipe  = nomes.reduce((s, n) => s + totaisPorNome[n], 0);
    const mediaEquipe  = nomes.length > 0 ? (totalEquipe / nomes.length).toFixed(0) : 0;
    const totalHorasEquipe = nomes.reduce((s, n) => s + ((compMap[n] || {}).hoje_horas || 0), 0);
    const mediaHoraEquipe  = totalHorasEquipe > 0 ? (totalEquipe / totalHorasEquipe).toFixed(1) : '—';
    const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const rankClasse   = ['dh-rank-1', 'dh-rank-2', 'dh-rank-3'];

    listaEl.innerHTML = `
        <div class="dh-equipe">
            <div class="dh-equipe-kpi">
                <div class="dh-equipe-kpi-val">${totalEquipe.toLocaleString('pt-BR')}</div>
                <div class="dh-equipe-kpi-label">Total da equipe</div>
            </div>
            <div class="dh-equipe-kpi">
                <div class="dh-equipe-kpi-val">${mediaEquipe}</div>
                <div class="dh-equipe-kpi-label">Média por operador</div>
            </div>
            <div class="dh-equipe-kpi">
                <div class="dh-equipe-kpi-val">${mediaHoraEquipe}</div>
                <div class="dh-equipe-kpi-label">Média/h da equipe</div>
            </div>
            <div class="dh-equipe-kpi">
                <div class="dh-equipe-kpi-val">${nomes.length}</div>
                <div class="dh-equipe-kpi-label">Operador${nomes.length !== 1 ? 'es' : ''}</div>
            </div>
        </div>
        <div class="dh-summary">${dataFmt}</div>
        ${nomes.map((nome, idx) => {
            const horas    = usuarios[nome];
            const horasOrd = Object.keys(horas).map(Number).sort((a, b) => a - b);
            const totalDia = totaisPorNome[nome];
            const maxHora  = Math.max(...Object.values(horas), 1);

            const c = compMap[nome] || {};
            const mediaHora       = c.hoje_horas   > 0 ? totalDia       / c.hoje_horas   : 0;
            const ultimaMediaHora = c.ultimo_horas > 0 ? c.ultimo_total / c.ultimo_horas : null;
            const histMediaDia    = c.hist_dias    > 0 ? c.hist_total   / c.hist_dias    : null;
            const histMediaHora   = c.hist_horas   > 0 ? c.hist_total   / c.hist_horas   : null;

            const cmpUltimaQtd   = _desempHoraComparar(totalDia,  c.ultimo_total);
            const cmpUltimaMedia = _desempHoraComparar(mediaHora, ultimaMediaHora);
            const cmpHistQtd     = _desempHoraComparar(totalDia,  histMediaDia);
            const cmpHistMedia   = _desempHoraComparar(mediaHora, histMediaHora);

            // Tendência: compara média da primeira metade do turno vs segunda metade
            let tendenciaHtml = '';
            if (horasOrd.length >= 3) {
                const meio      = Math.floor(horasOrd.length / 2);
                const mediaIni  = horasOrd.slice(0, meio).reduce((s, h) => s + horas[h], 0) / meio;
                const mediaFim  = horasOrd.slice(-meio).reduce((s, h) => s + horas[h], 0) / meio;
                const diffPct   = ((mediaFim - mediaIni) / mediaIni) * 100;
                if (diffPct > 5)       tendenciaHtml = `<span class="dh-trend up">▲ acelerando ${diffPct.toFixed(0)}%</span>`;
                else if (diffPct < -5) tendenciaHtml = `<span class="dh-trend down">▼ desacelerando ${Math.abs(diffPct).toFixed(0)}%</span>`;
                else                   tendenciaHtml = `<span class="dh-trend flat">→ ritmo estável</span>`;
            }

            const peakHora = horasOrd.reduce((best, h) => horas[h] > horas[best] ? h : best, horasOrd[0]);
            const horasHtml = horasOrd.map(h => {
                const qtd    = horas[h];
                const pct    = Math.max((qtd / maxHora * 100), 8);
                const isPeak = h === peakHora;
                return `
                <div class="dh-bar-col">
                    <div class="dh-bar-val">${qtd}</div>
                    <div class="dh-bar-track">
                        <div class="dh-bar-fill${isPeak ? ' dh-bar-peak' : ''}" style="height:${pct}%"></div>
                    </div>
                    <div class="dh-bar-hour">${String(h).padStart(2, '0')}h</div>
                </div>`;
            }).join('');

            const accentColor = cmpHistQtd.classe === 'up' ? '#22c55e' : cmpHistQtd.classe === 'down' ? '#ef4444' : 'rgba(58,134,255,0.4)';
            const bgColor     = cmpHistQtd.classe === 'up' ? 'rgba(34,197,94,0.07)' : cmpHistQtd.classe === 'down' ? 'rgba(239,68,68,0.07)' : 'rgba(58,134,255,0.05)';
            const rankLabel   = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;

            return `
            <div class="dh-card" style="--dh-accent:${accentColor};--dh-bg:${bgColor}">
                <div class="dh-head">
                    <div class="dh-user">
                        <span class="dh-rank ${rankClasse[idx] || ''}">${rankLabel}</span>
                        <div class="dh-avatar">${_desempHoraIniciais(nome)}</div>
                        <div style="min-width:0">
                            <div class="dh-name">${nome}</div>
                            <div class="dh-sub">
                                ${c.hoje_horas ? c.hoje_horas + 'h ativas' : '—'}
                                <span class="dh-peak-pill">⚡ pico ${String(peakHora).padStart(2,'0')}h</span>
                            </div>
                        </div>
                    </div>
                    <div class="dh-stats">
                        <div class="dh-stat">
                            <div class="dh-stat-value">${totalDia.toLocaleString('pt-BR')}</div>
                            <div class="dh-stat-label">no dia</div>
                        </div>
                        <div class="dh-stat">
                            <div class="dh-stat-value">${mediaHora.toFixed(1)}</div>
                            <div class="dh-stat-label">média/h</div>
                        </div>
                    </div>
                </div>
                <div class="dh-body">
                    <div class="dh-left">
                        <div class="dh-compare">
                            <div class="dh-compare-row">
                                <span class="dh-compare-label">vs última bipagem</span>
                                <span class="dh-badge ${cmpUltimaQtd.classe}">${cmpUltimaQtd.texto} qtd</span>
                                <span class="dh-badge ${cmpUltimaMedia.classe}">${cmpUltimaMedia.texto} méd</span>
                            </div>
                            <div class="dh-compare-row">
                                <span class="dh-compare-label">vs histórico</span>
                                <span class="dh-badge ${cmpHistQtd.classe}">${cmpHistQtd.texto} qtd</span>
                                <span class="dh-badge ${cmpHistMedia.classe}">${cmpHistMedia.texto} méd</span>
                            </div>
                        </div>
                        <div class="dh-bars-wrap">
                            <div class="dh-bars">${horasHtml}</div>
                            ${tendenciaHtml}
                        </div>
                    </div>
                    ${_desempHoraDonut(transpMap[nome] || [], totalDia)}
                </div>
            </div>`;
        }).join('')}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
