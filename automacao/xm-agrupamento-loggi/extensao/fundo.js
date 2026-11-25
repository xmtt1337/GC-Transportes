// Fundo da XM - Agrupamento Loggi: busca o relatorio Na base da propria Loggi.
//
// O link vem do botao "Baixar relatório" da tela Na base (o mesmo arquivo que o botao baixa) e
// carrega a sessao da conta Loggi: e usado so nesta busca e esquecido, nunca guardado. Da resposta
// saem so codigo, ID, cidade, prazo, "Chegou em" e status (regras.linhasNaBase).

importScripts('regras.js');
const R = self.XMAgrupamento;

async function lerNaBase(url) {
  if (!R.linkDoRelatorio(url)) throw new Error('O link do relatório não é o da Loggi.');
  let texto;
  try {
    const r = await fetch(R.relatorioDaBase(url), { credentials: 'include' });
    if (!r.ok) throw new Error(String(r.status));
    texto = await r.text();
  } catch {
    throw new Error('A Loggi não entregou o relatório Na base. Dê F5 no Arco e tente de novo.');
  }
  return R.linhasNaBase(texto);
}

chrome.runtime.onMessage.addListener((pedido, _quem, responder) => {
  if (pedido && pedido.tipo === 'naBase') {
    lerNaBase(String(pedido.url || ''))
      .then((linhas) => responder({ linhas }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
  return false;
});
