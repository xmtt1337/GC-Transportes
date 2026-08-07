// ───── SHOPEE → POLO DE QUEM BIPA ─────
// O polo (e o XPT que sai dele) é a primeira coisa que toda tela Shopee precisa saber: é
// ele que decide o que a pessoa enxerga e onde o bipe é gravado.
//
// A escolha morava dentro do Recebimento, então quem entrava por qualquer outra tela batia
// num aviso mandando abrir aquela primeiro. Agora a pergunta vem no primeiro clique em
// "Shopee", venha de onde vier — e a resposta fica guardada aqui, num lugar só, em vez de
// cada tela consultar e adivinhar por conta própria.

// Joaçaba consta porque tem gente lotada lá, mas não recebe Shopee — daí xpt null, em vez
// de um código inventado que criaria uma contagem fantasma.
const SHOPEE_POLOS = [
    { chave: "cacador", label: "Caçador", xpt: "XPT_CFC" },
    { chave: "videira", label: "Videira", xpt: "XPT_VIA" },
    { chave: "joacaba", label: "Joaçaba", xpt: null },
];
const gcPoloPorChave = chave => SHOPEE_POLOS.find(p => p.chave === chave) || null;

// { polo, polo_label, xpt } depois da primeira consulta. Guardado porque toda tela Shopee
// pergunta a mesma coisa e o valor só muda quando a própria pessoa escolhe — e ela só
// escolhe uma vez na vida.
let _gcPolo = null;
let _gcPoloPromessa = null;

const gcPoloAtual = () => _gcPolo;

function gcPoloCarregar(forcar) {
    if (!forcar && _gcPolo) return Promise.resolve(_gcPolo);
    // Dois cliques rápidos no menu não viram duas requisições — e, mais importante, não
    // viram dois overlays de escolha empilhados.
    if (!forcar && _gcPoloPromessa) return _gcPoloPromessa;
    _gcPoloPromessa = fetch(`${API}/shopee/meu-xpt`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { _gcPolo = d || {}; _gcPoloPromessa = null; return _gcPolo; })
        .catch(err => { _gcPoloPromessa = null; throw err; });
    return _gcPoloPromessa;
}

// Garante que a pessoa tenha polo antes de seguir: sem polo abre a escolha, com polo segue
// direto. `onPronto` recebe { polo, polo_label, xpt } nos dois caminhos.
// Erro de rede não abre a escolha — cada tela mostra o próprio aviso, e perguntar o polo
// porque a internet caiu faria a pessoa gravar uma resposta que ela já tinha dado.
function gcPoloGarantir(onPronto) {
    return gcPoloCarregar()
        .then(info => {
            if (info && info.polo) { if (onPronto) onPronto(info); return info; }
            gcPoloPerguntar(onPronto);
            return info;
        })
        .catch(() => null);
}

// Escolha inicial, uma única vez. O aviso de que fica salvo é o ponto: sem ele a pessoa
// clica em qualquer um pra passar da tela e o erro dura até alguém reparar.
function gcPoloPerguntar(onEscolhido) {
    if (document.getElementById("gc-polo-overlay")) return; // já está aberta

    const overlay = document.createElement("div");
    overlay.id = "gc-polo-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `
        <div style="${_gcCardStyle}">
            <div style="${_gcTitleStyle}">Qual é o seu polo?</div>
            <div style="${_gcMsgStyle}">Escolha a base em que você trabalha. Ela fica salva no seu cadastro e passa a valer em tudo da Shopee — se errar, só um administrador consegue trocar.</div>
            <div class="shr-escolha-opcoes">
                ${SHOPEE_POLOS.map(p => `
                    <button type="button" class="shr-escolha-btn" data-polo="${p.chave}">
                        <span class="shr-escolha-cidade">${p.label}</span>
                        <span class="shr-escolha-cod">${p.xpt || "não recebe Shopee"}</span>
                    </button>`).join("")}
            </div>
            <div id="gc-polo-erro" style="display:none;font-size:12.5px;color:#ef4444;margin-bottom:12px"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".shr-escolha-btn").forEach(btn => {
        btn.addEventListener("click", () => _gcPoloConfirmar(btn.dataset.polo, overlay, onEscolhido));
    });
}

function _gcPoloConfirmar(chave, overlay, onEscolhido) {
    const polo = gcPoloPorChave(chave);
    if (!polo) return;
    const detalhe = polo.xpt
        ? `Você vai trabalhar com os pacotes da Shopee em ${polo.label} (${polo.xpt}).`
        : `${polo.label} não recebe Shopee — você não vai bipar pacotes nas telas da Shopee.`;

    // Confirmação antes de gravar: é escolha de uma vez só, e um clique errado aqui custa
    // uma ida ao administrador.
    gcConfirm(
        `${detalhe}\n\nIsso fica salvo no seu cadastro. Depois, só um administrador pode alterar.`,
        () => {
            const erro = overlay.querySelector("#gc-polo-erro");
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
                const escolhido = gcPoloPorChave(d.polo || chave);
                _gcPolo = {
                    polo: escolhido ? escolhido.chave : (d.polo || chave),
                    polo_label: escolhido ? escolhido.label : null,
                    xpt: escolhido ? escolhido.xpt : null,
                };
                overlay.remove();
                if (onEscolhido) onEscolhido(_gcPolo);
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
