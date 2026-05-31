// ───── TELA CONFERÊNCIA NF ─────
let _confNFMes           = new Date().getMonth() + 1;
let _confNFAno           = new Date().getFullYear();
let _confNFQuinzena      = null;
let _confNFFiltrarPend   = false;
let _confNFTodosRows     = [];

function _toggleFiltroConf() {
    _confNFFiltrarPend = !_confNFFiltrarPend;
    const btn = document.getElementById("conf-nf-filtro-btn");
    if (_confNFFiltrarPend) {
        btn.style.background = "rgba(251,146,60,0.15)";
        btn.textContent = "Ver todos";
    } else {
        btn.style.background = "transparent";
        btn.textContent = "Ver apenas pendentes";
    }
    _renderConfNFTabela(_confNFFiltrarPend ? _confNFTodosRows.filter(r => !r.emitiu_nf) : _confNFTodosRows);
}

function abrirConfNFs(event) {
    if (event) event.preventDefault();
    _confNFQuinzena = null;
    document.getElementById("conf-nf-btn-1q").classList.remove("active");
    document.getElementById("conf-nf-btn-2q").classList.remove("active");
    document.getElementById("conf-nf-empty").innerText = "Selecione o período para conferir as notas fiscais.";
    document.getElementById("conf-nf-empty").style.display = "";
    document.getElementById("conf-nf-resultado").style.display = "none";
    _iniciarSelectsConfNF();
    mostrarTela("tela-conf-nfs");
}

function selecionarQuinzenaConf(q) {
    _confNFQuinzena = q;
    document.getElementById("conf-nf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("conf-nf-btn-2q").classList.toggle("active", q === 2);
    buscarConfNFs();
}

function buscarConfNFs() {
    if (!_confNFQuinzena) {
        document.getElementById("conf-nf-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("conf-nf-empty").style.display = "";
        return;
    }
    const mes      = document.getElementById("conf-nf-mes").value;
    const ano      = document.getElementById("conf-nf-ano").value;
    const empty    = document.getElementById("conf-nf-empty");
    const resultado = document.getElementById("conf-nf-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/conferencia?mes=${mes}&ano=${ano}&quinzena=${_confNFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(rows => {
        if (rows.error) { empty.innerText = rows.error; return; }
        if (!rows.length) { empty.innerText = "Nenhum entregador encontrado para este período."; return; }
        empty.style.display = "none";
        resultado.style.display = "";
        _confNFTodosRows = rows;
        _confNFFiltrarPend = false;
        const btn = document.getElementById("conf-nf-filtro-btn");
        if (btn) { btn.style.background = "transparent"; btn.textContent = "Ver apenas pendentes"; }
        const total    = rows.length;
        const emitidas = rows.filter(r => r.emitiu_nf).length;
        const pendentes = total - emitidas;
        const confere  = rows.filter(r => r.status === "confere").length;
        document.getElementById("conf-nf-counter").innerHTML =
            `${total} entregadores &nbsp;·&nbsp; <span style="color:#22c55e">${emitidas} enviaram NF</span> &nbsp;·&nbsp; <span style="color:#fb923c">${pendentes} pendentes</span> &nbsp;·&nbsp; <span style="color:#22c55e">${confere} conferem</span>`;
        _renderConfNFTabela(rows);
    })
    .catch(() => { empty.innerText = "Erro ao carregar dados."; });
}

function _renderConfNFTabela(rows) {
    const MESES_CONF = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const quinzenaLabel = `${_confNFQuinzena}ª quinzena de ${MESES_CONF[parseInt(document.getElementById("conf-nf-mes").value)]}/${document.getElementById("conf-nf-ano").value}`;
    document.getElementById("conf-nf-tbody").innerHTML = rows.map(r => {
        let emitBadge, confBadge;
        if (!r.emitiu_nf) {
            emitBadge = `<span class="adm-nf-badge pendente">Não enviou</span>`;
            confBadge = `<span class="adm-nf-badge pendente">—</span>`;
        } else {
            emitBadge = `<span class="adm-nf-badge confere">✓ Enviou</span>`;
            if (r.status === "confere")
                confBadge = `<span class="adm-nf-badge confere">✓ Confere</span>`;
            else if (r.status === "diverge")
                confBadge = `<span class="adm-nf-badge diverge">⚠ Diverge</span>`;
            else
                confBadge = `<span class="adm-nf-badge pendente">—</span>`;
        }
        let waBtn = "";
        if (!r.emitiu_nf) {
            const phone = (r.telefone || "").replace(/\D/g, "");
            const primeiroNome = r.nome.split(" ")[0];
            const msg = encodeURIComponent(`Olá, ${primeiroNome}! Tudo bem?\nPassando para informar que a NFS-e referente à ${quinzenaLabel} ainda não foi anexada no sistema.\nPor favor, acesse o sistema e realize o envio o quanto antes para que possamos efetuar o pagamento normalmente.\nQualquer dúvida, estamos à disposição. Obrigado!`);
            if (phone) {
                waBtn = `<a class="extr-wa" href="https://wa.me/55${phone}?text=${msg}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                    WhatsApp
                </a>`;
            } else {
                waBtn = `<span class="extr-wa" style="opacity:0.35;cursor:default" title="Sem telefone na planilha TERCEIRIZADOS">Sem telefone</span>`;
            }
        }
        return `<tr>
            <td class="adm-nf-entregador">${r.nome}</td>
            <td class="adm-nf-valor">${r.total_receber || "—"}</td>
            <td>${emitBadge}</td>
            <td>${r.valor_nf || "—"}</td>
            <td>${confBadge}</td>
            <td>${waBtn}</td>
        </tr>`;
    }).join("");
}

function _iniciarSelectsConfNF() {
    const selAno = document.getElementById("conf-nf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _confNFAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("conf-nf-mes").value = _confNFMes;
}
