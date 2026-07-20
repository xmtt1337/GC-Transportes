// ───── BAIXAS — TOTAL EXPRESS (ENTREGADOR) ─────
let _bteFotoBase64   = null;
let _bteFotoMimeType = null;
let _bteGeo          = null; // { latitude, longitude, precisao, endereco } capturada ao tirar a foto
let _bteGeoPromise    = null; // promise da tentativa de captura em andamento (GPS + endereço)
let _bteGeoEmAndamento = false;
let _bteScanStream   = null;
let _bteScanTimer    = null;
let _bteScanReader   = null;
let _bteScanCanvas   = null;
let _bteScanCanvas2  = null;
let _bteDetector     = null; // BarcodeDetector nativo (Android/Chrome) — muito melhor em 1D que o ZXing
let _bteZbarPromise  = null; // carregamento sob demanda do ZBar (WASM) — reserva pro Safari/iPhone
let _bteCodigoDuplicado = false; // true enquanto o código no campo já tiver sido baixado

function abrirBaixaTotalExpress(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role && role !== "entregador") {
        abrirAdminBaixasTotalExpress();
        return;
    }
    _bteLimparForm();
    mostrarTela("tela-baixa-te");
    _bteCarregarHistorico();
    _bteAtualizarBadgeFila();
    _bteMostrarAvisosFila();
    _bteFilaSincronizar();
    _bteVerificarPermissaoLocalizacao();
}

// ───── EXPLICAÇÃO DA LOCALIZAÇÃO (uma vez, antes do prompt real do navegador) ─────
const _BTE_GEO_FLAG = "bte_geo_explicado";

function _bteVerificarPermissaoLocalizacao() {
    if (localStorage.getItem(_BTE_GEO_FLAG)) return; // já passou por essa tela antes
    _bteMostrarCardLocalizacao();
}

function _bteMostrarCardLocalizacao() {
    if (document.getElementById("bte-geo-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "bte-geo-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:380px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;box-sizing:border-box;text-align:center">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(58,134,255,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#3a86ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:10px">Precisamos da sua localização</div>
            <div style="font-size:13.5px;color:#94a3b8;line-height:1.6;margin-bottom:22px">
                Para o controle das entregas, o app acessa sua localização no momento de cada baixa.
                A seguir, o navegador vai pedir essa permissão — toque em <strong>"Permitir"</strong> quando aparecer.
            </div>
            <div style="display:flex;gap:10px">
                <button id="bte-geo-recusar" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Recusar</button>
                <button id="bte-geo-confirmar" style="flex:1;padding:12px;border-radius:10px;border:none;background:#3a86ff;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Confirmar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#bte-geo-confirmar").addEventListener("click", _bteGeoConfirmar);
    overlay.querySelector("#bte-geo-recusar").addEventListener("click", _bteGeoMostrarBloqueio);
}

function _bteGeoConfirmar() {
    localStorage.setItem(_BTE_GEO_FLAG, "1");
    const overlay = document.getElementById("bte-geo-overlay");
    if (overlay) overlay.remove();
    _bteCapturarLocalizacao(); // dispara o prompt real do navegador agora
}

// Recusou: mostra um segundo card, sem botão de fechar — só sai daqui indo em "Permitir"
function _bteGeoMostrarBloqueio() {
    const overlay = document.getElementById("bte-geo-overlay");
    if (!overlay) return;
    overlay.innerHTML = `
        <div style="max-width:380px;width:100%;background:#111827;border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:24px;box-sizing:border-box;text-align:center">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:10px">Localização necessária</div>
            <div style="font-size:13.5px;color:#94a3b8;line-height:1.6;margin-bottom:22px">
                Para continuar usando as baixas, é necessário aceitar o acesso à localização — ela confirma que a entrega foi feita no local certo.
            </div>
            <button id="bte-geo-permitir" style="width:100%;padding:12px;border-radius:10px;border:none;background:#3a86ff;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Permitir</button>
        </div>`;
    overlay.querySelector("#bte-geo-permitir").addEventListener("click", _bteGeoConfirmar);
}

function _bteLimparForm() {
    _bteFotoBase64 = null;
    _bteFotoMimeType = null;
    _bteGeo = null;
    _bteGeoPromise = null;
    _bteGeoEmAndamento = false;
    _bteCodigoDuplicado = false;
    document.getElementById("bte-cliente").value = "";
    document.getElementById("bte-codigo").value = "";
    document.getElementById("bte-foto-input").value = "";
    document.getElementById("bte-foto-preview").style.display = "none";
    document.getElementById("bte-foto-preview").src = "";
    _bteLimparMsg();
}

function _bteLimparMsg() {
    const el = document.getElementById("bte-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _bteMostrarMsg(msg, tipo) {
    const el = document.getElementById("bte-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _bteMsgJaBaixado(d) {
    return `Este código já foi baixado por <strong>${d.usuario_nome || "outro entregador"}</strong> em <strong>${d.data_hora_brasilia || "data desconhecida"}</strong>.`;
}

// Checa em tempo real (ao sair do campo, ou logo após um scan) se o código já foi
// baixado por alguém, avisando antes do entregador preencher o resto do formulário.
function _bteVerificarCodigo() {
    const codigo = document.getElementById("bte-codigo").value.trim();
    _bteCodigoDuplicado = false;
    if (!codigo) { _bteLimparMsg(); return; }
    if (!/tx/i.test(codigo)) {
        _bteMostrarMsg('O código deve conter "TX".', "erro");
        return;
    }
    fetch(`${API}/baixas/total-express/verificar?codigo=${encodeURIComponent(codigo)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (document.getElementById("bte-codigo").value.trim() !== codigo) return; // campo mudou enquanto checava
        if (d.existe) {
            _bteCodigoDuplicado = true;
            _bteMostrarMsg(_bteMsgJaBaixado(d), "erro");
        } else {
            _bteLimparMsg();
        }
    }).catch(() => {});
}

// Abre a câmera e já dispara a captura da localização em paralelo — o GPS "esquenta"
// enquanto o entregador tira a foto, e o fix chega junto com a imagem.
function _bteTirarFoto() {
    _bteCapturarLocalizacao();
    document.getElementById("bte-foto-input").click();
}

function _bteCapturarLocalizacao() {
    if (!navigator.geolocation) return;
    if (_bteGeoEmAndamento) return;       // já tentando — não duplica a chamada ao GPS
    if (_bteGeo && _bteGeo.endereco) return; // já tem endereço completo, nada a fazer
    _bteGeoEmAndamento = true;
    _bteGeoPromise = new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(pos => {
            _bteGeo = {
                latitude:  pos.coords.latitude,
                longitude: pos.coords.longitude,
                precisao:  Math.round(pos.coords.accuracy || 0),
                endereco:  null
            };
            _bteBuscarEndereco(pos.coords.latitude, pos.coords.longitude)
                .then(end => { if (_bteGeo) _bteGeo.endereco = end; })
                .finally(() => { _bteGeoEmAndamento = false; resolve(); });
        }, () => { _bteGeoEmAndamento = false; resolve(); /* sem permissão/sinal — segue sem localização */ },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    });
}

// Se a foto+código forem preenchidos mais rápido que o GPS/endereço resolvem, espera
// só um pouco (nunca trava o envio) — é o que fazia a baixa sair sem endereço às vezes.
function _bteAguardarLocalizacao() {
    if (!_bteGeoEmAndamento) return Promise.resolve();
    const espera = new Promise(resolve => setTimeout(resolve, 6000));
    return Promise.race([_bteGeoPromise, espera]);
}

// Converte a coordenada em endereço legível (rua, número, bairro, cidade) via
// Nominatim/OpenStreetMap — gratuito, sem chave. Se falhar, a baixa vai só com GPS.
function _bteBuscarEndereco(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=pt-BR`;
    return fetch(url).then(r => r.json()).then(d => {
        const a = d.address || {};
        const rua    = a.road || a.pedestrian || a.residential || "";
        const numero = a.house_number || "";
        const bairro = a.suburb || a.neighbourhood || a.quarter || "";
        const cidade = a.city || a.town || a.village || a.municipality || "";
        const uf     = a.state || "";
        const partes = [];
        if (rua)    partes.push(numero ? `${rua}, ${numero}` : rua);
        if (bairro) partes.push(bairro);
        if (cidade) partes.push(uf ? `${cidade} - ${uf}` : cidade);
        return partes.join(", ") || d.display_name || null;
    }).catch(() => null);
}

function _bteFotoSelecionada(input) {
    const file = input.files[0];
    if (!file) return;
    _bteCapturarLocalizacao(); // segunda chance, caso a primeira ainda não tenha resolvido
    _bteComprimirImagem(file).then(({ dataUrl, base64 }) => {
        _bteFotoBase64   = base64;
        _bteFotoMimeType = "image/jpeg";
        const preview = document.getElementById("bte-foto-preview");
        preview.src = dataUrl;
        preview.style.display = "";
    }).catch(() => {
        gcAlert("Não foi possível processar a foto. Tente novamente.");
    });
}

// Redimensiona e recomprime a foto no navegador antes de enviar — etiqueta de celular
// costuma vir com vários MB, e isso ia direto pro banco em base64 (33% maior ainda).
function _bteComprimirImagem(file, maxDim = 1280, qualidade = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
                    else { width = Math.round(width * maxDim / height); height = maxDim; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width; canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
                resolve({ dataUrl, base64: dataUrl.split(",")[1] });
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function _bteEnviarBaixa() {
    const cliente = document.getElementById("bte-cliente").value.trim();
    const codigo  = document.getElementById("bte-codigo").value.trim();

    if (!codigo) return _bteMostrarMsg("Informe o código (digitando ou escaneando).", "erro");
    if (!/tx/i.test(codigo)) return _bteMostrarMsg('O código deve conter "TX".', "erro");
    if (_bteCodigoDuplicado) return; // mensagem de "já baixado" já está exibida
    if (!_bteFotoBase64) return _bteMostrarMsg("Tire a foto da etiqueta antes de enviar.", "erro");

    const btn = document.getElementById("bte-submit-btn");
    btn.disabled = true; btn.textContent = "Enviando...";
    // Marca a hora da captura já aqui (antes da espera), não depois — é o momento real da baixa
    const capturadaEm = new Date().toISOString();

    _bteAguardarLocalizacao().then(() => {
        btn.textContent = "Enviando...";
        const payload = {
            nome_cliente: cliente || null,
            codigo,
            foto_base64: _bteFotoBase64,
            foto_mime_type: _bteFotoMimeType,
            latitude:        _bteGeo ? _bteGeo.latitude  : null,
            longitude:       _bteGeo ? _bteGeo.longitude : null,
            precisao_metros: _bteGeo ? _bteGeo.precisao  : null,
            endereco:        _bteGeo ? _bteGeo.endereco  : null,
            capturada_em:    capturadaEm,
            foi_offline:     false // só vira true se realmente cair na fila, abaixo
        };

        _bteFilaTemCodigo(codigo).then(naFila => {
            if (naFila) {
                btn.disabled = false; btn.textContent = "Enviar Baixa";
                return _bteMostrarMsg("Este código já está na fila de envio deste celular.", "erro");
            }
            if (!navigator.onLine) { payload.foi_offline = true; return _bteGuardarNaFila(payload, btn); }

            fetch(`${API}/baixas/total-express`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }).then(r => r.json())
            .then(d => {
                btn.disabled = false; btn.textContent = "Enviar Baixa";
                if (d.error) {
                    if (d.ja_baixado) { _bteCodigoDuplicado = true; return _bteMostrarMsg(_bteMsgJaBaixado(d), "erro"); }
                    return _bteMostrarMsg(d.error, "erro");
                }
                _bteLimparForm();
                _bteMostrarMsg("Baixa enviada com sucesso!", "ok");
                _gcBeepSucesso();
                _bteCarregarHistorico();
            })
            .catch(() => {
                // rede caiu no meio do caminho — guarda no celular em vez de perder
                payload.foi_offline = true;
                _bteGuardarNaFila(payload, btn);
            });
        });
    });
}

// ───── FILA OFFLINE (IndexedDB — aguenta as fotos, diferente do localStorage) ─────
let _bteSincronizando = false;

function _bteAbrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("gc-baixas-offline", 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore("fila", { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function _bteFilaStore(modo, fn) {
    return _bteAbrirDB().then(db => new Promise((resolve, reject) => {
        const req = fn(db.transaction("fila", modo).objectStore("fila"));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    }));
}

function _bteFilaAdicionar(payload) { return _bteFilaStore("readwrite", st => st.add({ payload })); }
function _bteFilaListar()           { return _bteFilaStore("readonly",  st => st.getAll()); }
function _bteFilaRemover(id)        { return _bteFilaStore("readwrite", st => st.delete(id)); }

function _bteFilaTemCodigo(codigo) {
    return _bteFilaListar().then(itens =>
        itens.some(i => String(i.payload.codigo).toUpperCase() === String(codigo).toUpperCase())
    ).catch(() => false);
}

function _bteGuardarNaFila(payload, btn) {
    _bteFilaAdicionar(payload).then(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Baixa"; }
        _bteLimparForm();
        _bteMostrarMsg("Sem internet agora — a baixa foi <strong>salva no celular</strong> e será enviada automaticamente quando a conexão voltar.", "ok");
        _bteAtualizarBadgeFila();
    }).catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Baixa"; }
        _bteMostrarMsg("Sem internet e não foi possível salvar no celular. Tente novamente.", "erro");
    });
}

// Envia as baixas guardadas, uma a uma, parando na primeira falha de rede/servidor
// (o que sobrar tenta de novo no próximo gatilho: internet voltou, tela aberta, botão).
async function _bteFilaSincronizar() {
    if (_bteSincronizando || !navigator.onLine) return;
    _bteSincronizando = true;
    let enviadas = 0;
    try {
        const itens = await _bteFilaListar();
        for (const item of itens) {
            let r, d;
            try {
                r = await fetch(`${API}/baixas/total-express`, {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                    body: JSON.stringify(item.payload)
                });
                d = await r.json();
            } catch (e) { break; } // sem rede/servidor fora — tenta na próxima
            if (r.ok) { await _bteFilaRemover(item.id); enviadas++; continue; }
            if (d && d.ja_baixado) {
                await _bteFilaRemover(item.id);
                // se foi baixado por OUTRO entregador enquanto esta estava na fila, avisa;
                // se era duplicata do próprio (reenvio após resposta perdida), segue quieto
                const eu = window._gcUser ? (window._gcUser.name || window._gcUser.username) : null;
                if (d.usuario_nome && d.usuario_nome !== eu) {
                    try {
                        const avisos = JSON.parse(localStorage.getItem("bte_fila_avisos") || "[]");
                        avisos.push({ codigo: item.payload.codigo, usuario_nome: d.usuario_nome, data: d.data_hora_brasilia });
                        localStorage.setItem("bte_fila_avisos", JSON.stringify(avisos));
                    } catch (e) {}
                }
                continue;
            }
            if (r.status === 400) { await _bteFilaRemover(item.id); continue; } // inválida — reenviar não resolve
            break; // 401/403/5xx — token vencido ou servidor com problema, tenta depois
        }
    } finally {
        _bteSincronizando = false;
        _bteAtualizarBadgeFila();
        const tela = document.getElementById("tela-baixa-te");
        if (tela && tela.classList.contains("active-view")) {
            if (enviadas > 0) {
                _bteCarregarHistorico();
                _gcBeepSucesso();
                // substitui a mensagem antiga ("salva no celular...") pela confirmação
                _bteMostrarMsg(
                    enviadas === 1
                        ? "A baixa que estava aguardando foi <strong>enviada com sucesso</strong>!"
                        : `As ${enviadas} baixas que estavam aguardando foram <strong>enviadas com sucesso</strong>!`,
                    "ok");
            }
            _bteMostrarAvisosFila(); // aviso de código já baixado prevalece, se houver
        }
    }
}

function _bteAtualizarBadgeFila() {
    const card = document.getElementById("bte-fila-card");
    if (!card) return;
    _bteFilaListar().then(itens => {
        if (!itens.length) { card.style.display = "none"; card.innerHTML = ""; return; }
        card.style.display = "";
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px;border-radius:12px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.3);margin-bottom:16px">
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                <div style="flex:1;min-width:170px">
                    <div style="font-size:13px;font-weight:700;color:#eab308">${itens.length} baixa${itens.length > 1 ? "s" : ""} aguardando envio</div>
                    <div style="font-size:12px;color:#94a3b8">Ser${itens.length > 1 ? "ão enviadas" : "á enviada"} automaticamente quando a internet voltar.</div>
                </div>
                <button onclick="_bteFilaTentarAgora()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(234,179,8,0.4);background:rgba(234,179,8,0.12);color:#eab308;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Enviar agora</button>
            </div>`;
    }).catch(() => {});
}

function _bteFilaTentarAgora() {
    if (!navigator.onLine) {
        gcAlert("Ainda sem conexão com a internet. As baixas serão enviadas automaticamente assim que o sinal voltar.");
        return;
    }
    _bteFilaSincronizar();
}

// Avisos de baixas descartadas na sincronização (código já baixado por outro entregador)
function _bteMostrarAvisosFila() {
    let avisos = [];
    try { avisos = JSON.parse(localStorage.getItem("bte_fila_avisos") || "[]"); } catch (e) {}
    if (!avisos.length) return;
    localStorage.removeItem("bte_fila_avisos");
    const linhas = avisos.map(a =>
        `A baixa do código <strong>${a.codigo}</strong> que estava na fila não foi enviada: já baixado por <strong>${a.usuario_nome || "outro entregador"}</strong> em <strong>${a.data || "—"}</strong>.`
    ).join("<br><br>");
    _bteMostrarMsg(linhas, "erro");
}

// Gatilhos automáticos: internet voltou / app abriu
window.addEventListener("online", () => { _bteFilaSincronizar(); });
setTimeout(() => { _bteFilaSincronizar(); }, 3000);

function _bteCarregarHistorico() {
    const empty  = document.getElementById("bte-hist-empty");
    const result = document.getElementById("bte-hist-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/baixas/total-express`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
            empty.innerText = "Nenhuma baixa enviada ainda.";
            return;
        }
        empty.style.display = "none";
        result.style.display = "";
        document.getElementById("bte-hist-tbody").innerHTML = rows.map(r => `
            <tr>
                <td data-label="Código">${r.codigo}</td>
                <td data-label="Cliente">${r.nome_cliente || "—"}</td>
                <td data-label="Data/Hora" style="color:#64748b;font-size:12px">${r.data_hora_brasilia || "—"}</td>
            </tr>`).join("");
    }).catch(() => {
        empty.innerText = navigator.onLine
            ? "Erro ao carregar histórico."
            : "Sem internet — o histórico aparece quando a conexão voltar.";
    });
}

// ───── SCANNER DE CÓDIGO (CÂMERA) ─────
// Proporção da área de leitura marcada na tela (relativa ao vídeo) — só essa região
// é recortada e decodificada, ignorando o resto do frame (fundo, mão, mesa etc.).
const _BTE_SCAN_AREA_W = 0.90;
const _BTE_SCAN_AREA_H = 0.20;
// A área analisada é maior que a caixa visual: dá folga pro QR (mais alto que a faixa)
// e pra mira imperfeita. O filtro de centralidade impede de ler código fora da mira.
const _BTE_DETECT_W = 0.96;
const _BTE_DETECT_H = 0.45;

// callback opcional: outras telas (ex.: Devoluções) reusam o mesmo scanner e recebem
// o texto lido, em vez do comportamento padrão (preencher o campo das baixas).
let _bteScanCallback = null;

function _bteAbrirScanner(callback) {
    _bteScanCallback = typeof callback === "function" ? callback : null;
    if (document.getElementById("bte-scan-overlay")) return;
    if (typeof ZXingBrowser === "undefined") {
        gcAlert("Leitor de código indisponível no momento. Digite o código manualmente.");
        return;
    }

    const overlay = document.createElement("div");
    overlay.id = "bte-scan-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="width:100%;max-width:420px;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box">
            <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Alinhe o código dentro da área marcada</div>
            <div style="position:relative;width:100%;border-radius:10px;overflow:hidden">
                <video id="bte-scan-video" style="width:100%;display:block;background:#000" muted playsinline></video>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_BTE_SCAN_AREA_W*100}%;height:${_BTE_SCAN_AREA_H*100}%;border:2px solid #3a86ff;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none"></div>
            </div>
            <div id="bte-scan-erro" style="color:#f87171;font-size:13px;margin-top:10px;display:none"></div>
            <button id="bte-scan-cancelar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#bte-scan-cancelar").addEventListener("click", _bteFecharScanner);
    document.addEventListener("keydown", _bteScanEscKey);
    window.addEventListener("blur", _bteFecharScanner);
    document.addEventListener("visibilitychange", _bteScanVisibilidade);

    const videoEl = overlay.querySelector("#bte-scan-video");

    // ZXing sem hints (configuração que sempre leu QR bem) — ele é só a última reserva;
    // código de barras 1D é trabalho do detector nativo e do ZBar.
    _bteScanReader = new ZXingBrowser.BrowserMultiFormatReader();

    // Detector nativo do navegador (Android/Chrome usa o motor do Google Lens):
    // lê código de barras 1D com folga onde o ZXing falha. Se não existir, fica o ZXing.
    _bteDetector = null;
    if (window.BarcodeDetector) {
        try {
            _bteDetector = new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "itf", "data_matrix"] });
        } catch (e) { _bteDetector = null; }
    }
    // ZBar (WASM) entra na cascata em todos os aparelhos — em alguns Androids o
    // detector nativo existe mas decepciona; o ZBar cobre esses e o Safari/iPhone.
    _bteCarregarZbar().catch(() => {});

    navigator.mediaDevices.getUserMedia({
        // 1080p: código de barras denso precisa de mais pixels por barra que QR code
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, focusMode: "continuous" }
    }).then(stream => {
        _bteScanStream = stream;
        videoEl.srcObject = stream;
        videoEl.play();
        _bteAfinarCamera(stream);
        _bteScanTimer = setTimeout(_bteScanLoop, 300);
    }).catch(() => {
        const erroEl = overlay.querySelector("#bte-scan-erro");
        erroEl.textContent = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
        erroEl.style.display = "";
    });
}

// Foco contínuo + zoom 2x quando a câmera suporta: o truque dos apps de bipagem —
// de perto demais a câmera não foca e o código de barras sai borrado; com zoom o
// entregador segura o celular mais longe (onde foca) e o código continua grande.
function _bteAfinarCamera(stream) {
    try {
        const track = stream.getVideoTracks()[0];
        if (!track || !track.getCapabilities) return;
        const caps = track.getCapabilities();
        const adv  = [];
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) adv.push({ focusMode: "continuous" });
        if (caps.zoom && typeof caps.zoom.max === "number") {
            const zoom = Math.min(2, caps.zoom.max);
            if (zoom > (caps.zoom.min || 1)) adv.push({ zoom });
        }
        if (adv.length) track.applyConstraints({ advanced: adv }).catch(() => {});
    } catch (e) { /* câmera sem esses recursos — segue sem ajuste */ }
}

// Recorta a faixa central do vídeo (maior que a caixa visual) e tenta decodificar ali.
function _bteScanLoop() {
    if (!_bteScanReader) return;
    const videoEl = document.getElementById("bte-scan-video");
    if (!videoEl || !videoEl.videoWidth) {
        _bteScanTimer = setTimeout(_bteScanLoop, 150);
        return;
    }
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const sw = Math.round(vw * _BTE_DETECT_W), sh = Math.round(vh * _BTE_DETECT_H);
    const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);

    if (!_bteScanCanvas) _bteScanCanvas = document.createElement("canvas");
    _bteScanCanvas.width = sw; _bteScanCanvas.height = sh;
    _bteScanCanvas.getContext("2d", { willReadFrequently: true }).drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);

    _bteScanDecodificar(_bteScanCanvas).then(texto => {
        if (!_bteScanReader) return; // scanner foi fechado enquanto decodificava
        if (texto) {
            const cb = _bteScanCallback; // guarda antes: fechar o scanner limpa o callback
            _bteFecharScanner();
            if (cb) { cb(texto); return; }
            document.getElementById("bte-codigo").value = texto;
            _bteVerificarCodigo();
            return;
        }
        _bteScanTimer = setTimeout(_bteScanLoop, 120);
    });
}

function _bteCarregarZbar() {
    if (window.zbarWasm) return Promise.resolve(window.zbarWasm);
    if (_bteZbarPromise) return _bteZbarPromise;
    _bteZbarPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/index.js";
        s.onload  = () => resolve(window.zbarWasm || null);
        s.onerror = () => { _bteZbarPromise = null; reject(new Error("zbar load")); };
        document.head.appendChild(s);
    });
    return _bteZbarPromise;
}

// Entre os códigos achados no frame, vale o mais próximo do centro da mira; código
// fora da faixa central é descartado (ex.: o QR no topo da etiqueta da transportadora).
function _bteMaisCentral(candidatos, canvas) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    let melhor = null, melhorDist = Infinity;
    for (const c of candidatos) {
        if (!c.texto) continue;
        const x = (c.x == null) ? cx : c.x;
        const y = (c.y == null) ? cy : c.y;
        if (Math.abs(y - cy) > canvas.height * 0.35) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < melhorDist) { melhorDist = d; melhor = c.texto; }
    }
    return melhor;
}

// Ordem de tentativa: BarcodeDetector nativo → ZBar (WASM) → ZXing → ZXing ampliado 2x
// (código denso filmado de perto fica com ~3px por barra, pouco pro binarizador do ZXing).
async function _bteScanDecodificar(canvas) {
    if (_bteDetector) {
        try {
            const codigos = await _bteDetector.detect(canvas) || [];
            const texto = _bteMaisCentral(codigos.map(c => ({
                texto: c.rawValue,
                x: c.boundingBox ? c.boundingBox.x + c.boundingBox.width / 2 : null,
                y: c.boundingBox ? c.boundingBox.y + c.boundingBox.height / 2 : null
            })), canvas);
            if (texto) return texto;
        } catch (e) {
            _bteDetector = null; // detector nativo indisponível de verdade — segue pros outros
            _bteCarregarZbar().catch(() => {});
        }
    }
    if (window.zbarWasm) {
        try {
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            const simbolos = await zbarWasm.scanImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)) || [];
            const candidatos = [];
            for (const s of simbolos) {
                let texto = "";
                try { texto = s.decode(); } catch (e) { continue; }
                const pts = s.points || [];
                const cand = { texto, x: null, y: null };
                if (pts.length) {
                    cand.x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
                    cand.y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
                }
                candidatos.push(cand);
            }
            const texto = _bteMaisCentral(candidatos, canvas);
            if (texto) return texto;
        } catch (e) { /* segue pro ZXing */ }
    }
    try {
        return _bteScanReader.decodeFromCanvas(canvas).getText();
    } catch (e) { /* nenhum código nesse frame — tenta ampliado */ }
    try {
        if (!_bteScanCanvas2) _bteScanCanvas2 = document.createElement("canvas");
        _bteScanCanvas2.width = canvas.width * 2; _bteScanCanvas2.height = canvas.height * 2;
        const ctx = _bteScanCanvas2.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, _bteScanCanvas2.width, _bteScanCanvas2.height);
        return _bteScanReader.decodeFromCanvas(_bteScanCanvas2).getText();
    } catch (e) { return null; }
}

function _bteScanEscKey(e) {
    if (e.key === "Escape") _bteFecharScanner();
}

function _bteScanVisibilidade() {
    if (document.hidden) _bteFecharScanner();
}

function _bteFecharScanner() {
    if (_bteScanTimer) { clearTimeout(_bteScanTimer); _bteScanTimer = null; }
    if (_bteScanStream) { _bteScanStream.getTracks().forEach(t => t.stop()); _bteScanStream = null; }
    _bteScanReader   = null;
    _bteDetector     = null;
    _bteScanCallback = null;
    const overlay = document.getElementById("bte-scan-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", _bteScanEscKey);
    window.removeEventListener("blur", _bteFecharScanner);
    document.removeEventListener("visibilitychange", _bteScanVisibilidade);
}

// ───── BAIXAS — TOTAL EXPRESS (ADMIN/FINANCE/DEV) ─────
let _abteDados     = [];
let _abteFiltrados = [];
let _abtePagina    = 1;
let _abtePorPagina = 25;

function abrirAdminBaixasTotalExpress(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-baixas-te");
    _abteCarregar();
}

function _abteCarregar() {
    const empty = document.getElementById("abte-empty");
    const lista = document.getElementById("abte-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/admin/baixas/total-express`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows)) { empty.innerText = rows.error || "Erro ao carregar baixas."; return; }
        _abteDados = rows;
        const filtro = document.getElementById("abte-filtro-input");
        if (filtro) filtro.value = "";
        _abteRenderizar(rows);
    }).catch(() => {
        empty.innerText = "Erro ao carregar baixas.";
    });
}

function _abteRenderizar(rows) {
    const empty = document.getElementById("abte-empty");
    const lista = document.getElementById("abte-lista");
    _abteFiltrados = rows;
    _abtePagina = 1;

    if (!rows.length) {
        empty.innerText = "Nenhuma baixa encontrada.";
        empty.style.display = "";
        lista.style.display = "none";
        return;
    }
    document.getElementById("abte-counter").innerText = `${rows.length.toLocaleString("pt-BR")} baixa${rows.length !== 1 ? "s" : ""}`;
    empty.style.display = "none";
    lista.style.display = "";
    _abteRenderizarPagina();
}

function _abteRenderizarPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_abteFiltrados.length / _abtePorPagina));
    _abtePagina = Math.min(Math.max(1, _abtePagina), totalPaginas);
    const inicio = (_abtePagina - 1) * _abtePorPagina;
    const pagina = _abteFiltrados.slice(inicio, inicio + _abtePorPagina);

    document.getElementById("abte-tbody").innerHTML = pagina.map(r => {
        const suspeita = (r.mesmo_local_hora || 0) > 5;
        let endereco = r.endereco || "—";
        if (r.latitude != null && r.longitude != null) {
            endereco += ` <a href="https://maps.google.com/?q=${r.latitude},${r.longitude}" target="_blank" rel="noopener noreferrer" style="color:#5d9aff;font-size:11px;white-space:nowrap;text-decoration:none">ver mapa</a>`;
        }
        if (suspeita) {
            endereco += `<br><span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#f87171;background:rgba(239,68,68,0.12)">⚠ ${r.mesmo_local_hora} baixas neste local nesta hora</span>`;
        }
        let tipoBaixa;
        if (r.foi_offline === true) {
            tipoBaixa = `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:#eab308;background:rgba(234,179,8,0.1)">Offline</span>`;
        } else if (r.foi_offline === false) {
            tipoBaixa = `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.1)">Online</span>`;
        } else {
            tipoBaixa = `<span style="color:#64748b;font-size:12px">—</span>`;
        }
        return `<tr${suspeita ? ' style="background:rgba(239,68,68,0.06)"' : ""}>
            <td style="font-family:monospace;font-size:12px">${suspeita ? "⚠ " : ""}${r.codigo}</td>
            <td>${r.nome_cliente || "—"}</td>
            <td>${r.usuario_nome || "—"}</td>
            <td style="font-size:12px;white-space:nowrap;color:#94a3b8">${r.data_hora_brasilia || "—"}</td>
            <td style="font-size:12px;color:#94a3b8">${endereco}</td>
            <td>${tipoBaixa}</td>
            <td>
                <button class="abte-foto-btn" onclick="_abteVerFoto(${r.id})">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Ver foto
                </button>
            </td>
        </tr>`;
    }).join("");

    document.getElementById("abte-pagina-info").innerText = `Página ${_abtePagina} de ${totalPaginas}`;
}

function _abteMudarPorPagina() {
    _abtePorPagina = parseInt(document.getElementById("abte-por-pagina").value, 10);
    _abtePagina = 1;
    _abteRenderizarPagina();
}

function _abtePaginaAnterior() {
    if (_abtePagina <= 1) return;
    _abtePagina--;
    _abteRenderizarPagina();
}

function _abteProximaPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_abteFiltrados.length / _abtePorPagina));
    if (_abtePagina >= totalPaginas) return;
    _abtePagina++;
    _abteRenderizarPagina();
}

function _abteFiltrarLocal() {
    const termo = document.getElementById("abte-filtro-input").value.trim().toLowerCase();
    if (!termo) { _abteRenderizar(_abteDados); return; }
    const filtrado = _abteDados.filter(r =>
        (r.codigo       || "").toLowerCase().includes(termo) ||
        (r.nome_cliente || "").toLowerCase().includes(termo) ||
        (r.usuario_nome || "").toLowerCase().includes(termo) ||
        (r.endereco     || "").toLowerCase().includes(termo)
    );
    _abteRenderizar(filtrado);
}

// ── SELETOR DE INTERVALO DE DATAS (calendário com o período inteiro destacado) ──
let _abteDrpMesRef = new Date();
let _abteDrpInicio = null;
let _abteDrpFim    = null;

function _abteDrpDiaChave(d) { // "yyyy-mm-dd" local (sem passar por UTC)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function _abteDrpFormatarBR(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function _abteDrpToggle() {
    const painel = document.getElementById("abte-drp-panel");
    const vaiAbrir = painel.style.display === "none";
    painel.style.display = vaiAbrir ? "" : "none";
    if (vaiAbrir) _abteDrpRenderGrid();
}

function _abteDrpMudarMes(delta) {
    _abteDrpMesRef.setMonth(_abteDrpMesRef.getMonth() + delta);
    _abteDrpRenderGrid();
}

// Primeiro clique começa um intervalo novo; segundo clique fecha o intervalo
// (invertendo início/fim se o segundo clique for numa data anterior à primeira).
function _abteDrpClicarDia(chave) {
    const [y, m, d] = chave.split("-").map(Number);
    const dia = new Date(y, m - 1, d);
    if (!_abteDrpInicio || _abteDrpFim) {
        _abteDrpInicio = dia; _abteDrpFim = null;
    } else if (dia < _abteDrpInicio) {
        _abteDrpFim = _abteDrpInicio; _abteDrpInicio = dia;
    } else {
        _abteDrpFim = dia;
    }
    _abteDrpRenderGrid();
}

function _abteDrpRenderGrid() {
    const ref = _abteDrpMesRef;
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById("abte-drp-mes-label").innerText = `${MESES[mes]} ${ano}`;

    const inicioGrid = new Date(ano, mes, 1);
    inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay()); // volta até o domingo da 1ª semana

    const hojeChave   = _abteDrpDiaChave(new Date());
    const inicioChave = _abteDrpInicio ? _abteDrpDiaChave(_abteDrpInicio) : null;
    const fimChave    = _abteDrpFim    ? _abteDrpDiaChave(_abteDrpFim)    : null;

    let html = "";
    const cursor = new Date(inicioGrid);
    for (let i = 0; i < 42; i++) { // 6 semanas fixas — mantém a grade com altura estável em todo mês
        const chave     = _abteDrpDiaChave(cursor);
        const dow       = cursor.getDay();
        const foraDoMes = cursor.getMonth() !== mes;
        const emRange   = inicioChave && fimChave && chave >= inicioChave && chave <= fimChave;
        const ehInicio  = chave === inicioChave;
        const ehFim     = chave === fimChave;
        const unico     = inicioChave && !fimChave && ehInicio;

        let classes = "drp-day";
        if (foraDoMes) classes += " fora-mes";
        if (chave === hojeChave) classes += " hoje";
        if (emRange) classes += " in-range";
        if (emRange && (dow === 0 || ehInicio)) classes += " range-l";
        if (emRange && (dow === 6 || ehFim))    classes += " range-r";
        if (ehInicio || ehFim || unico) classes += " selecionado";

        html += `<button type="button" class="${classes}" onclick="_abteDrpClicarDia('${chave}')">${cursor.getDate()}</button>`;
        cursor.setDate(cursor.getDate() + 1);
    }
    document.getElementById("abte-drp-grid").innerHTML = html;
}

function _abteDrpLimpar() {
    _abteDrpInicio = null; _abteDrpFim = null;
    document.getElementById("abte-exp-de").value  = "";
    document.getElementById("abte-exp-ate").value = "";
    document.getElementById("abte-drp-label").innerText = "Todo o período";
    document.getElementById("abte-drp-panel").style.display = "none";
}

function _abteDrpAplicar() {
    const inicio = _abteDrpInicio;
    const fim    = _abteDrpFim || _abteDrpInicio; // só clicou um dia — trata como intervalo de 1 dia
    document.getElementById("abte-exp-de").value  = inicio ? _abteDrpDiaChave(inicio) : "";
    document.getElementById("abte-exp-ate").value = fim    ? _abteDrpDiaChave(fim)    : "";
    document.getElementById("abte-drp-label").innerText = !inicio
        ? "Todo o período"
        : (_abteDrpDiaChave(inicio) === _abteDrpDiaChave(fim)
            ? _abteDrpFormatarBR(inicio)
            : `${_abteDrpFormatarBR(inicio)} – ${_abteDrpFormatarBR(fim)}`);
    document.getElementById("abte-drp-panel").style.display = "none";
}

// Fecha o painel se o clique foi fora dele (mas não interfere no clique que o abre,
// já que esse clique nasce dentro do próprio "wrap")
document.addEventListener("click", e => {
    const wrap = document.getElementById("abte-drp-wrap");
    if (!wrap || wrap.contains(e.target)) return;
    const painel = document.getElementById("abte-drp-panel");
    if (painel) painel.style.display = "none";
});

// ── EXPORTAR (filtro por data / entregador / cidade — cidade vem do texto do Endereço) ──

// endereco vem no formato "Rua, Numero, Bairro, Cidade - UF" (montado em
// _buscarEnderecoReverso, no backend) — a cidade é sempre o pedaço antes do " - " no
// último trecho separado por vírgula.
function _abteExtrairCidade(endereco) {
    if (!endereco) return null;
    const partes = String(endereco).split(",").map(p => p.trim()).filter(Boolean);
    if (!partes.length) return null;
    const cidade = partes[partes.length - 1].split(" - ")[0].trim();
    return cidade || null;
}

// data_hora_brasilia é sempre "dd/mm/yyyy ..." (gerado no backend com toLocaleString
// pt-BR) — vira "yyyy-mm-dd" pra comparar direto com o valor de <input type="date">.
function _abteDataISO(dataHoraBrasilia) {
    const m = String(dataHoraBrasilia || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function _abteAbrirExportar() {
    const entregadores = [...new Set(_abteDados.map(r => r.usuario_nome).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const cidades = [...new Set(_abteDados.map(r => _abteExtrairCidade(r.endereco)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));

    document.getElementById("abte-exp-entregador").innerHTML =
        `<option value="">Todos os entregadores</option>` + entregadores.map(e => `<option value="${e}">${e}</option>`).join("");
    document.getElementById("abte-exp-cidade").innerHTML =
        `<option value="">Todas as cidades</option>` + cidades.map(c => `<option value="${c}">${c}</option>`).join("");
    document.getElementById("abte-exp-de").value  = "";
    document.getElementById("abte-exp-ate").value = "";
    document.getElementById("abte-exp-erro").textContent = "";
    document.getElementById("abte-drp-label").innerText = "Todo o período";
    document.getElementById("abte-drp-panel").style.display = "none";
    _abteDrpMesRef = new Date();
    _abteDrpInicio = null;
    _abteDrpFim    = null;
    _abrirModal("modal-abte-exportar");
}

function _abteExportar() {
    const de  = document.getElementById("abte-exp-de").value;
    const ate = document.getElementById("abte-exp-ate").value;
    const ent = document.getElementById("abte-exp-entregador").value;
    const cid = document.getElementById("abte-exp-cidade").value;
    const erroEl = document.getElementById("abte-exp-erro");
    erroEl.textContent = "";

    const filtrados = _abteDados.filter(r => {
        if (ent && r.usuario_nome !== ent) return false;
        if (cid && _abteExtrairCidade(r.endereco) !== cid) return false;
        if (de || ate) {
            const iso = _abteDataISO(r.data_hora_brasilia);
            if (!iso) return false;
            if (de && iso < de) return false;
            if (ate && iso > ate) return false;
        }
        return true;
    });

    if (!filtrados.length) {
        erroEl.textContent = "Nenhuma baixa encontrada com esses filtros.";
        return;
    }

    const linhas = filtrados.map(r => ({
        "Código":     r.codigo,
        "Cliente":    r.nome_cliente || "",
        "Entregador": r.usuario_nome || "",
        "Data/Hora":  r.data_hora_brasilia || "",
        "Cidade":     _abteExtrairCidade(r.endereco) || "",
        "Endereço":   r.endereco || "",
        "Tipo":       r.foi_offline === true ? "Offline" : r.foi_offline === false ? "Online" : "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Baixas");

    const nomeArquivo = ["Baixas_TotalExpress"];
    if (ent) nomeArquivo.push(ent.replace(/[\\/:*?"<>|]/g, ""));
    if (cid) nomeArquivo.push(cid.replace(/[\\/:*?"<>|]/g, ""));
    if (de || ate) nomeArquivo.push(`${de || "inicio"}_a_${ate || "fim"}`);
    XLSX.writeFile(wb, nomeArquivo.join("_") + ".xlsx");

    _fecharModal("modal-abte-exportar");
}

function _abteVerFoto(id) {
    if (document.getElementById("abte-foto-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "abte-foto-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Foto da etiqueta</div>
            <div id="abte-foto-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando foto...</div>
            <img id="abte-foto-img" style="display:none;max-width:100%;max-height:65vh;border-radius:10px">
            <button id="abte-foto-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#abte-foto-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/admin/baixas/total-express/${id}/foto`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d.error || !d.foto_base64) {
            document.getElementById("abte-foto-loading").textContent = "Foto não encontrada.";
            return;
        }
        const img = document.getElementById("abte-foto-img");
        img.src = `data:${d.foto_mime_type || "image/jpeg"};base64,${d.foto_base64}`;
        img.onload = () => {
            img.style.display = "";
            document.getElementById("abte-foto-loading").style.display = "none";
        };
    }).catch(() => {
        document.getElementById("abte-foto-loading").textContent = "Erro ao carregar a foto.";
    });
}
