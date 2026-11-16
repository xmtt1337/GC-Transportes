// Ouve o bipe da Loggi, no mundo da pagina.
//
// Ao bipar, a propria tela pergunta pelo pacote (retrieve_and_validate_packages_by_barcode)
// e recebe a cidade de destino. Aqui so se le essa resposta: nenhuma chamada nova a Loggi,
// e so codigo e cidade saem desta pagina (para o menu.js, no mesmo computador).

(() => {
  const ROTA = /\/group_packages\/retrieve_and_validate_packages_by_barcode/;

  function extrairBipes(resposta) {
    if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) return [];
    const itens = [];
    for (const [codigo, p] of Object.entries(resposta)) {
      if (!p || typeof p !== 'object') continue;
      const end = p.loggiAddress || {};
      const cidade = (p.destination && p.destination.city)
        || (end.correiosAddress && end.correiosAddress.cidade)
        || (end.postalAddress && end.postalAddress.locality)
        || '';
      if (cidade) itens.push({ codigo, cidade: String(cidade) });
    }
    return itens;
  }

  if (typeof module !== 'undefined') {
    module.exports = { extrairBipes, ROTA };
    return;
  }

  function avisar(texto) {
    let itens;
    try {
      itens = extrairBipes(JSON.parse(texto));
    } catch {
      return;
    }
    if (itens.length) window.postMessage({ xmBipagem: 'bipe', itens }, window.location.origin);
  }

  const X = XMLHttpRequest.prototype;
  const abrir = X.open;
  X.open = function (metodo, url) {
    if (ROTA.test(String(url))) {
      this.addEventListener('load', () => {
        try {
          avisar(typeof this.response === 'string' ? this.response : JSON.stringify(this.response));
        } catch { /* resposta em outro formato: nao e o bipe */ }
      });
    }
    return abrir.apply(this, arguments);
  };

  const buscar = window.fetch;
  window.fetch = async function (u) {
    const r = await buscar.apply(this, arguments);
    if (ROTA.test(String(u && u.url ? u.url : u))) r.clone().text().then(avisar).catch(() => {});
    return r;
  };
})();
