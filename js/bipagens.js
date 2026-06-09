let _bipTimeout    = null;
let _bipUltCodigo  = '';
let _bipUltTs      = 0;

function abrirBipagens(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-bipagens');
    document.getElementById('titulo-pagina').innerText = 'Bipagens';
    document.getElementById('bip-resultado').innerHTML = '';
    document.getElementById('bip-input').value = '';
    document.getElementById('bip-clear').style.display = 'none';
    setTimeout(() => document.getElementById('bip-input').focus(), 250);
    _bipCarregarStatusCeps();
    _bipSessaoRenderizar();
}

async function _bipCarregarStatusCeps() {
    try {
        const res  = await fetch(API + '/bipagem/cep-status', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        const btn  = document.getElementById('bip-sync-btn');
        if (!btn) return;
        const n = data.total || 0;
        if (n === 0) {
            btn.title = 'Banco vazio — clique para sincronizar';
            btn.style.borderColor = 'rgba(239,68,68,0.5)';
            btn.style.color       = '#ef4444';
            btn.style.background  = 'rgba(239,68,68,0.08)';
        } else {
            btn.title = `${n.toLocaleString('pt-BR')} CEPs no banco`;
        }
    } catch { /* silencioso */ }
}

function _bipAuto(input) {
    _bipInicializarAudio(); // garante AudioContext dentro de gesto do usuário
    document.getElementById('bip-clear').style.display = input.value ? '' : 'none';
    clearTimeout(_bipTimeout);
    if (input.value.trim().length >= 6) {
        _bipTimeout = setTimeout(_bipBuscar, 400);
    }
}

function _bipLimpar() {
    document.getElementById('bip-input').value = '';
    document.getElementById('bip-clear').style.display = 'none';
    document.getElementById('bip-resultado').innerHTML = '';
    document.getElementById('bip-input').focus();
}

function _bipEhCep(v) {
    return /^\d{5}-?\d{3}$/.test(v.trim()) || /^\d{8}$/.test(v.trim());
}

async function _bipBuscar() {
    clearTimeout(_bipTimeout);
    const codigo = document.getElementById('bip-input').value.trim();
    if (!codigo) return;
    const agora = Date.now();
    if (codigo === _bipUltCodigo && agora - _bipUltTs < 1500) return;
    _bipUltCodigo = codigo;
    _bipUltTs     = agora;

    if (_bipEhCep(codigo)) {
        await _bipBuscarCep(codigo);
    } else {
        await _bipBuscarCodigo(codigo);
    }
    _bipSelecionarInput();
}

async function _bipBuscarCep(cep) {
    const el = document.getElementById('bip-resultado');
    el.innerHTML = _bipLoadingHtml();
    try {
        const res  = await fetch(API + '/bipagem/buscar-cep?cep=' + encodeURIComponent(cep), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) { _bipMostrarErro(el, data.error); return; }

        const linhas = Array.isArray(data) ? data : [data];
        el.innerHTML = _bipRenderCepCards(linhas);
        _bipRegistrar(cep.replace(/\D/g,''), { transportadora: 'cep', cidade: (linhas[0] || {}).cidade });
    } catch {
        _bipMostrarErro(el, 'Erro ao conectar ao servidor.');
    }
}

async function _bipBuscarCodigo(codigo) {
    const el = document.getElementById('bip-resultado');
    el.innerHTML = _bipLoadingHtml();
    try {
        const res  = await fetch(API + '/bipagem/buscar?codigo=' + encodeURIComponent(codigo), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) { _bipMostrarErro(el, data.error || 'Código não encontrado'); return; }

        // Backend detectou que era CEP, não barcode
        if (data.tipo === 'cep') {
            el.innerHTML = _bipRenderCepCards(data.resultados);
            _bipRegistrar(codigo, { transportadora: 'cep', cidade: (data.resultados[0] || {}).cidade });
            return;
        }

        const transpNome = _TRANSP_NOMES[data.transportadora] || data.transportadora || '—';
        const cor        = _bipCorTransp(data.transportadora);

        _bipRegistrar(codigo, data);

        const temEnt  = !!data.entregador;
        const entNome = data.entregador || 'Sem entregador atribuído';
        const detalhes = [
            data.cidade                                        ? _bipLinha('Cidade',       data.cidade) : '',
            data.bairro                                        ? _bipLinha('Bairro',       data.bairro) : '',
            data.rua                                           ? _bipLinha('Rua',          data.rua) : '',
            data.cep                                           ? _bipLinha('CEP',          _bipFormatCep(data.cep)) : '',
            data.destinatario && data.transportadora !== 'jt'  ? _bipLinha('Destinatário', data.destinatario) : '',
        ].join('');

        el.innerHTML = `
            <div class="bip-result-card" style="border-color:${cor}35">
                <div class="bip-result-head" style="background:${cor}0d">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span class="bip-result-transp" style="background:${cor}18;color:${cor}">${transpNome}</span>
                </div>
                <div class="bip-result-ent" style="border-color:${cor}20">
                    <div class="bip-result-ent-avatar" style="background:${cor}15;border-color:${cor}30;color:${cor}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div>
                        <div class="bip-result-ent-label">Entregador</div>
                        <div class="bip-result-ent-nome ${temEnt ? '' : 'sem-ent'}">${entNome}</div>
                        ${data.sigla ? `<div class="bip-result-ent-sigla">${data.sigla}</div>` : ''}
                    </div>
                </div>
                ${detalhes ? `<div class="bip-result-rows">${detalhes}</div>` : ''}
            </div>`;
    } catch {
        _bipMostrarErro(el, 'Erro ao conectar ao servidor.');
    }
}

function _bipLoadingHtml() {
    return `<div class="bip-loading">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0 0 20.49 15"/></svg>
        Buscando...
    </div>`;
}

function _bipErroHtml(msg) {
    return `<div class="bip-error-card">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        ${msg}
    </div>`;
}

// AudioContext criado uma vez e desbloqueado na primeira interação do usuário
let _bipAudioCtx = null;

function _bipInicializarAudio() {
    if (_bipAudioCtx) return;
    try {
        _bipAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
}

function _bipMostrarErro(el, msg) {
    el.innerHTML = _bipErroHtml(msg);
    _bipBeepErro();
}

function _bipBeepErro() {
    try {
        _bipInicializarAudio();
        const ctx = _bipAudioCtx;
        if (!ctx) return;

        // resume() desbloqueia caso o contexto ainda esteja suspenso
        ctx.resume().then(() => {
            const t = ctx.currentTime;
            [[0, 440, 0.18], [0.22, 300, 0.18]].forEach(([inicio, freq, dur]) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t + inicio);
                gain.gain.setValueAtTime(0.4, t + inicio);
                gain.gain.exponentialRampToValueAtTime(0.001, t + inicio + dur);
                osc.start(t + inicio);
                osc.stop(t + inicio + dur);
            });
        });
    } catch (_) {}
}

async function _bipSincronizarCeps() {
    const btn = document.getElementById('bip-sync-btn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0 0 20.49 15"/></svg> Sincronizando...`;
    try {
        const res  = await fetch(API + '/admin/sincronizar-ceps', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        const porTransp = data.por_transportadora || {};
        const nomes = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };
        const resumo = Object.entries(porTransp)
            .map(([k,v]) => `${nomes[k]||k}: ${v.toLocaleString('pt-BR')}`)
            .join(' · ');
        const temErro = data.erros && data.erros.length > 0;
        btn.innerHTML = `${temErro ? '⚠' : '✓'} ${data.total.toLocaleString('pt-BR')} CEPs — ${resumo}`;
        btn.style.borderColor = temErro ? 'rgba(251,146,60,0.5)'  : 'rgba(34,197,94,0.35)';
        btn.style.color       = temErro ? '#fb923c'               : '#22c55e';
        btn.style.background  = temErro ? 'rgba(251,146,60,0.08)' : 'rgba(34,197,94,0.08)';
        if (temErro) {
            btn.title = 'Erros:\n' + data.erros.join('\n');
            console.warn('Erros no sync de CEPs:', data.erros);
        }
        setTimeout(() => { btn.innerHTML = orig; btn.style.borderColor=''; btn.style.color=''; btn.style.background=''; btn.title=''; btn.disabled=false; }, 8000);
    } catch (err) {
        btn.innerHTML = `✗ ${err.message}`;
        btn.style.color = '#ef4444';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color=''; btn.disabled=false; }, 3000);
    }
}

const _bipSessao = [];

function _bipSessaoAdicionar(codigo, dados) {
    _bipSessao.unshift({
        codigo,
        entregador:     dados.entregador     || null,
        transportadora: dados.transportadora || null,
        cidade:         dados.cidade         || null,
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    _bipSessaoRenderizar();
}

function _bipSessaoRenderizar() {
    const el      = document.getElementById('bip-sessao-lista');
    const countEl = document.getElementById('bip-sessao-count');
    if (!el) return;
    const lista = _bipSessao;
    if (countEl) countEl.textContent = lista.length;
    if (!lista.length) {
        el.innerHTML = '<div class="bip-empty-msg">Nenhuma bipagem ainda.</div>';
        return;
    }
    const transpNomes = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee', cep:'CEP' };
    const transpCores = { loggi:'#12A5E8', anjun:'#22C55E', imile:'#9333EA', jt:'#EF4444', shopee:'#F97316', cep:'#94a3b8' };
    el.innerHTML = lista.map(item => {
        const cor  = transpCores[item.transportadora] || '#64748b';
        const nome = transpNomes[item.transportadora] || item.transportadora || '—';
        return `
        <div class="bip-item">
            <span class="bip-item-badge" style="background:${cor}1a;color:${cor};border:1px solid ${cor}35">${nome}</span>
            <div class="bip-item-body">
                <div class="bip-item-ent">${item.entregador || '—'}</div>
                <div class="bip-item-code">${item.codigo}</div>
            </div>
            <div class="bip-item-right">
                <div class="bip-item-city">${item.cidade || '—'}</div>
                <div class="bip-item-hora">${item.hora}</div>
            </div>
        </div>`;
    }).join('');
}

function _bipRegistrar(codigo, dados) {
    _bipSessaoAdicionar(codigo, dados);
    fetch(API + '/bipagem/registrar', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            codigo,
            entregador:     dados.entregador     || null,
            transportadora: dados.transportadora || null,
            cidade:         dados.cidade         || null,
            cep:            dados.cep            || null,
        })
    }).catch(() => {});
}

function _bipSelecionarInput() {
    const input = document.getElementById('bip-input');
    if (!input) return;
    input.focus();
    input.select();
}

const _TRANSP_NOMES  = { loggi: 'Loggi', anjun: 'Anjun', jt: 'J&T Express', imile: 'Imile', shopee: 'Shopee' };
const _TRANSP_CORES  = { loggi: '#12A5E8', anjun: '#22C55E', imile: '#9333EA', jt: '#EF4444', shopee: '#F97316' };

function _bipCorTransp(t) { return _TRANSP_CORES[t] || '#3a86ff'; }

function _bipRenderCepCards(linhas) {
    return linhas.map(d => {
        const cor        = _bipCorTransp(d.transportadora);
        const transpNome = _TRANSP_NOMES[d.transportadora] || d.transportadora || '—';
        return `
        <div class="bip-result-card" style="border-left:3px solid ${cor};margin-bottom:10px">
            <div class="bip-result-head" style="background:${cor}0e">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span class="bip-result-transp" style="background:${cor}1a;color:${cor}">${transpNome}</span>
            </div>
            <div class="bip-result-rows">
                ${_bipLinha('Entregador', d.entregador || '⚠ Sem entregador atribuído', !d.entregador)}
                ${_bipLinha('Cidade', d.cidade || '—')}
                ${d.bairro ? _bipLinha('Bairro', d.bairro) : ''}
                ${d.rua    ? _bipLinha('Rua', d.rua) : ''}
                ${d.sigla  ? _bipLinha('Sigla / Rota', d.sigla, true) : ''}
            </div>
        </div>`;
    }).join('');
}

function _bipLinha(label, valor, warn = false) {
    return `
        <div class="bip-result-row">
            <span class="bip-result-lbl">${label}</span>
            <span class="bip-result-val${warn ? ' warn' : ''}">${valor}</span>
        </div>`;
}

function _bipFormatCep(cep) {
    const c = String(cep).replace(/\D/g, '');
    return c.length === 8 ? c.slice(0,5) + '-' + c.slice(5) : cep;
}
