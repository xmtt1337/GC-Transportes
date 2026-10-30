// Consulta de pacotes da Anjun, no mundo da pagina.
//
// Refaz o que a tela faz ao abrir um pacote e clicar em "Visualizar Informacoes
// Sensiveis": packageInfoLimit traz os campos criptografados e viewPlaintext
// abre so os que forem pedidos. Nome e telefones; e-mail e endereco nao saem.
//
// O token e o que o proprio site usa, lido no momento em que ele chama a API.
// Nao fica guardado em lugar nenhum alem desta pagina.

(() => {
  const CAMPOS = ['receiveName', 'receiveMobile', 'receivePhone'];

  function campoCifrado(v) {
    return v.startsWith('{$') ? v : `{$${v}$}`;
  }

  function criarConsulta(post) {
    return async function consultar(codigo) {
      const p = await post('/admin/package/packageInfoLimit', { waybillNumber: codigo });
      if (!p) return { status: 'nao encontrado', nome: '', telefone: '' };

      const data = {};
      CAMPOS.forEach((campo, n) => {
        const v = p[campo];
        if (typeof v === 'string' && v) data[`field${n}`] = campoCifrado(v);
      });
      const claro = Object.keys(data).length ? await post('/user/sensitive/viewPlaintext', { data }) : {};
      return {
        status: p.packageStatusName || '',
        nome: (claro && claro.field0) || '',
        telefone: (claro && (claro.field1 || claro.field2)) || '',
      };
    };
  }

  function criarPost(lerHeaders, buscar) {
    return async (url, corpo) => {
      const r = await buscar(url, {
        method: 'POST',
        headers: { ...lerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.code !== 200) {
        const motivo = (j && j.msg) || 'sem mensagem';
        throw new Error(`A Anjun recusou (HTTP ${r.status}, code ${j ? j.code : '?'}): ${motivo}`);
      }
      return j.data;
    };
  }

  if (typeof module !== 'undefined') {
    module.exports = { criarConsulta, criarPost };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (n === 'token' || n === 'accept' || n === 'accept-language') headers[n] = valor;
    return original.apply(this, arguments);
  };

  const consultar = criarConsulta(criarPost(() => headers, (...a) => window.fetch(...a)));

  async function atender(pedido) {
    if (pedido.tipo === 'status') return { pronto: !!headers.token };
    if (pedido.tipo === 'consultar') {
      try {
        return { ok: true, dados: await consultar(pedido.codigo) };
      } catch (e) {
        return { ok: false, erro: e.message };
      }
    }
    return { ok: false, erro: 'Pedido desconhecido.' };
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmConsulta !== 'pedido') return;
    const resposta = await atender(e.data.pedido);
    window.postMessage({ xmConsulta: 'resposta', id: e.data.id, resposta }, window.location.origin);
  });
})();
