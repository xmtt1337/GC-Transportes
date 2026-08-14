// ───── FISCAL: Certificado Digital A1 ─────
//
// Regra desta tela: o .pfx e a senha existem apenas durante o envio.
// Nada de localStorage, sessionStorage, variável global ou cache — se o
// arquivo ficasse guardado no navegador, qualquer script da página poderia
// lê-lo, e ele assina documento fiscal em nome da empresa.
// Depois de enviado, a tela só mostra dado público.

const _CERT_ESTADOS = {
    NAO_CONFIGURADO:    { rotulo: "Não configurado",      cor: "#8fa8c8" },
    CONFIGURADO:        { rotulo: "Configurado",          cor: "#2ecc71" },
    PROXIMO_VENCIMENTO: { rotulo: "Próximo do vencimento", cor: "#e8a33d" },
    EXPIRADO:           { rotulo: "Expirado",             cor: "#e74c3c" },
    INVALIDO:           { rotulo: "Inválido",             cor: "#e74c3c" },
};

async function abrirFiscalCertificado(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-certificado");
    const area = document.getElementById("fiscal-certificado-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando certificado…</p>";
    try {
        const s = await _cteApi("/fiscal/certificado");
        area.innerHTML = _htmlCertificado(s);
    } catch (e) {
        area.innerHTML = typeof _htmlSemAcesso === "function"
            ? _htmlSemAcesso(e.message)
            : `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
    }
}

function _htmlCertificado(s) {
    const est = _CERT_ESTADOS[s.estado] || _CERT_ESTADOS.NAO_CONFIGURADO;
    const c = s.certificado || {};
    const configurado = s.estado !== "NAO_CONFIGURADO";
    const podeConfigurar = s.pode_configurar !== false;

    return `
    <div class="cabecalho-tela">
        <h2>Certificado Digital A1</h2>
        <span class="badge-status" style="background:${est.cor}">${est.rotulo}</span>
    </div>

    ${!s.cofre_configurado ? `
    <div class="aviso-bloqueio">
        <strong>O servidor não está pronto para guardar certificados.</strong>
        <p>Falta a variável <code>FISCAL_CRYPTO_KEY</code>, que cifra o certificado
           no banco. Sem ela o envio é recusado — de propósito, para o arquivo não
           acabar armazenado sem proteção.</p>
    </div>` : ""}

    ${s.mensagem ? `<div class="aviso-${s.estado === "EXPIRADO" || s.estado === "INVALIDO" ? "bloqueio" : "info"}">
        <strong>${_esc(s.mensagem)}</strong></div>` : ""}

    ${configurado ? `
    <div class="secao-form">
        <h3>Certificado em uso</h3>
        <div class="conf-grade">
            <div class="conf-bloco"><b>Titular</b><br>${_esc(c.titular || "—")}</div>
            <div class="conf-bloco"><b>CNPJ</b><br><span class="mono-pequeno">${_esc(c.cnpj || "—")}</span></div>
            <div class="conf-bloco"><b>Emissor</b><br>${_esc(c.emissor || "—")}</div>
            <div class="conf-bloco"><b>Número de série</b><br><span class="mono-pequeno">${_esc(c.numero_serie || "—")}</span></div>
            <div class="conf-bloco"><b>Início da validade</b><br>${_fmtData(c.valido_de)}</div>
            <div class="conf-bloco"><b>Fim da validade</b><br>${_fmtData(c.valido_ate)}</div>
            <div class="conf-bloco"><b>Dias restantes</b><br>
                ${c.dias_restantes != null
                    ? `<b style="color:${c.dias_restantes <= 30 ? "#e74c3c" : "#2ecc71"}">${c.dias_restantes}</b>`
                    : "—"}</div>
            <div class="conf-bloco"><b>Ambiente</b><br>${_esc(s.ambiente || "homologacao")}</div>
            <div class="conf-bloco"><b>Enviado em</b><br>${_fmtData(s.enviado_em)}</div>
        </div>

        <div class="acoes-rodape">
            <button onclick="validarCertificado()">Validar certificado</button>
            <button onclick="testarConexaoSefaz()">Testar conexão com SEFAZ</button>
            ${podeConfigurar ? `
                <button onclick="_mostrarFormCert()">Substituir certificado</button>
                <button class="btn-perigo" onclick="removerCertificado()">Remover</button>` : ""}
        </div>
        <div id="resultado-cert"></div>
    </div>` : ""}

    ${podeConfigurar ? `
    <div class="secao-form" id="form-cert" ${configurado ? 'style="display:none"' : ""}>
        <h3>${configurado ? "Substituir certificado" : "Enviar certificado"}</h3>
        <div class="aviso-info">
            O arquivo e a senha são usados só durante o envio. O certificado é
            cifrado no servidor e <b>nunca volta para o navegador</b>. A senha não
            é exibida nem armazenada aqui.
        </div>

        <div class="linha-form">
            <label class="largo">Arquivo do certificado (.pfx ou .p12)
                <input type="file" id="cert-arquivo" accept=".pfx,.p12,application/x-pkcs12">
            </label>
        </div>
        <div class="linha-form">
            <label>Senha do certificado
                <input type="password" id="cert-senha" autocomplete="new-password">
            </label>
            <label>Ambiente
                <select id="cert-ambiente">
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção (ainda bloqueado)</option>
                </select>
            </label>
        </div>
        <p class="dica">
            A produção ainda não está liberada: escolher essa opção resulta em recusa
            até a validação completa ser concluída.
        </p>

        <div class="acoes-rodape">
            ${configurado ? '<button onclick="_esconderFormCert()">Cancelar</button>' : ""}
            <button class="btn-primario" id="btn-enviar-cert" onclick="enviarCertificado()">Enviar</button>
        </div>
        <div id="resultado-envio"></div>
    </div>` : `
    <div class="aviso-info">
        Você pode consultar, mas não alterar o certificado desta empresa.
        Alterar exige a permissão <b>configurar</b>.
    </div>`}`;
}

function _mostrarFormCert() {
    const f = document.getElementById("form-cert");
    if (f) { f.style.display = ""; f.scrollIntoView({ behavior: "smooth" }); }
}
function _esconderFormCert() {
    const f = document.getElementById("form-cert");
    if (f) f.style.display = "none";
    _limparCamposCert();
}

/** Zera arquivo e senha da tela assim que deixam de ser necessários. */
function _limparCamposCert() {
    const a = document.getElementById("cert-arquivo");
    const s = document.getElementById("cert-senha");
    if (a) a.value = "";
    if (s) s.value = "";
}

async function enviarCertificado() {
    const inputArquivo = document.getElementById("cert-arquivo");
    const inputSenha = document.getElementById("cert-senha");
    const ambiente = document.getElementById("cert-ambiente").value;
    const alvo = document.getElementById("resultado-envio");
    const botao = document.getElementById("btn-enviar-cert");

    const arquivo = inputArquivo.files && inputArquivo.files[0];
    if (!arquivo) { alvo.innerHTML = _avisoErro("Escolha o arquivo do certificado."); return; }
    if (!inputSenha.value) { alvo.innerHTML = _avisoErro("Informe a senha do certificado."); return; }
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) {
        alvo.innerHTML = _avisoErro("O arquivo precisa ser .pfx ou .p12 (certificado A1).");
        return;
    }

    botao.disabled = true;
    alvo.innerHTML = "<p>Enviando e validando no servidor…</p>";

    // O arquivo vira base64 só para a viagem. A variável sai de escopo ao fim
    // da função e não é guardada em lugar nenhum.
    let base64 = null;
    try {
        base64 = await _arquivoParaBase64(arquivo);
        const r = await _cteApi("/fiscal/certificado", {
            method: "POST",
            body: JSON.stringify({
                arquivo: base64,
                senha: inputSenha.value,
                nome_arquivo: arquivo.name,
                ambiente,
            }),
        });
        alvo.innerHTML = `<div class="aviso-sucesso">
            <strong>Certificado salvo.</strong>
            <p>${_esc(r.certificado.titular || "")} — vence em ${_fmtData(r.certificado.valido_ate)}
               (${r.certificado.dias_restantes} dias).</p>
        </div>`;
        setTimeout(abrirFiscalCertificado, 1200);
    } catch (e) {
        alvo.innerHTML = _avisoErro(e.message);
    } finally {
        botao.disabled = false;
        base64 = null;             // solta a referência
        _limparCamposCert();       // arquivo e senha somem da tela mesmo em erro
    }
}

function _arquivoParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => {
            const r = String(leitor.result);
            resolve(r.includes(",") ? r.split(",")[1] : r);
        };
        leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
        leitor.readAsDataURL(arquivo);
    });
}

function _avisoErro(msg) {
    return `<div class="aviso-bloqueio"><strong>Não foi possível salvar.</strong><p>${_esc(msg)}</p></div>`;
}

async function validarCertificado() {
    const alvo = document.getElementById("resultado-cert");
    alvo.innerHTML = "<p>Validando…</p>";
    try {
        const r = await _cteApi("/fiscal/certificado/validar", { method: "POST" });
        alvo.innerHTML = r.ok
            ? `<div class="aviso-sucesso"><strong>${_esc(r.mensagem)}</strong>
                 <p>Vence em ${_fmtData(r.certificado.valido_ate)} (${r.certificado.dias_restantes} dias).</p></div>`
            : `<div class="aviso-bloqueio"><strong>${_esc(r.mensagem)}</strong></div>`;
    } catch (e) {
        alvo.innerHTML = _avisoErro(e.message);
    }
}

async function testarConexaoSefaz() {
    const alvo = document.getElementById("resultado-cert");
    alvo.innerHTML = "<p>Consultando a SEFAZ (homologação)…</p>";
    try {
        const r = await _cteApi("/fiscal/cte/status-servico", { method: "POST", body: "{}" });
        alvo.innerHTML = `<div class="aviso-${r.operante ? "sucesso" : "info"}">
            <strong>${_esc(r.resumo || `Retorno ${r.cStat}`)}</strong>
            <p>Código ${_esc(r.cStat)} — ${_esc(r.xMotivo || "")}</p>
            <p>Ambiente ${_esc(r.ambiente)} · UF ${_esc(r.uf)} ·
               resposta em ${r.duracao_ms} ms${r.tMed ? ` · tempo médio ${_esc(r.tMed)}s` : ""}</p>
            <p class="dica">Consulta em ${_fmtData(r.dhRecbto || r.consultado_em)}
               ${r.verAplic ? `· versão ${_esc(r.verAplic)}` : ""}</p>
        </div>`;
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível falar com a SEFAZ.</strong>
            <p>${_esc(e.message)}</p>
            <p class="dica">Erro de certificado costuma aparecer aqui como falha de TLS.
               Se for indisponibilidade da SEFAZ, tente mais tarde.</p>
        </div>`;
    }
}

async function removerCertificado() {
    if (!confirm("Remover o certificado desta empresa? A emissão fica bloqueada até enviar outro.")) return;
    try {
        await _cteApi("/fiscal/certificado", { method: "DELETE" });
        abrirFiscalCertificado();
    } catch (e) {
        alert("Não foi possível remover: " + e.message);
    }
}
