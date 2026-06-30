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
        const url  = API + '/bipagem/desempenho-hora?data=' + data;
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);

        if (!body.horas || !body.horas.length) {
            emptyEl.innerText = 'Nenhuma bipagem nesta data.';
            return;
        }
        _desempHoraRenderizar(body.horas, body.comparativo || [], data);
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

function _desempHoraRenderizar(rows, comparativo, data) {
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');
    const listaEl   = document.getElementById('desemp-hora-lista');

    const compMap = {};
    comparativo.forEach(c => { compMap[c.usuario_nome] = c; });

    // Agrupa por usuário -> { hora: total }
    const usuarios = {};
    rows.forEach(r => {
        if (!usuarios[r.usuario_nome]) usuarios[r.usuario_nome] = {};
        usuarios[r.usuario_nome][r.hora] = r.total;
    });

    const nomes = Object.keys(usuarios).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

    listaEl.innerHTML = `
        <div class="dh-summary">${dataFmt} · ${nomes.length} operador${nomes.length !== 1 ? 'es' : ''}</div>
        ${nomes.map(nome => {
            const horas    = usuarios[nome];
            // Só mostra as horas que de fato tiveram bipagem, sem preencher horas vazias
            const horasOrd = Object.keys(horas).map(Number).sort((a, b) => a - b);
            const totalDia = Object.values(horas).reduce((a, b) => a + b, 0);
            const maxHora  = Math.max(...Object.values(horas), 1);

            const c = compMap[nome] || {};
            // Média por hora considera apenas o intervalo entre a primeira e a última bipagem do dia
            const mediaHora       = c.hoje_horas   > 0 ? totalDia       / c.hoje_horas   : 0;
            const ultimaMediaHora = c.ultimo_horas > 0 ? c.ultimo_total / c.ultimo_horas : null;
            const histMediaDia    = c.hist_dias    > 0 ? c.hist_total   / c.hist_dias    : null;
            const histMediaHora   = c.hist_horas   > 0 ? c.hist_total   / c.hist_horas   : null;

            const cmpUltimaQtd   = _desempHoraComparar(totalDia,  c.ultimo_total);
            const cmpUltimaMedia = _desempHoraComparar(mediaHora, ultimaMediaHora);
            const cmpHistQtd     = _desempHoraComparar(totalDia,  histMediaDia);
            const cmpHistMedia   = _desempHoraComparar(mediaHora, histMediaHora);

            const horasHtml = horasOrd.map(h => {
                const qtd = horas[h];
                const pct = Math.max((qtd / maxHora * 100), 8);
                return `
                <div class="dh-bar-col">
                    <div class="dh-bar-val">${qtd}</div>
                    <div class="dh-bar-track">
                        <div class="dh-bar-fill" style="height:${pct}%"></div>
                    </div>
                    <div class="dh-bar-hour">${String(h).padStart(2, '0')}h</div>
                </div>`;
            }).join('');

            return `
            <div class="dh-card">
                <div class="dh-head">
                    <div class="dh-user">
                        <div class="dh-avatar">${_desempHoraIniciais(nome)}</div>
                        <div style="min-width:0">
                            <div class="dh-name">${nome}</div>
                            <div class="dh-sub">${c.hoje_horas ? c.hoje_horas + 'h ativas' : '—'}</div>
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
                <div class="dh-bars">${horasHtml}</div>
            </div>`;
        }).join('')}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
