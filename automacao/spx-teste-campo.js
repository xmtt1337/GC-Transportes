// TESTE: o SPX aceita codigo digitado por script?
//
// Responde a unica pergunta que decide se da pra trocar o macro por um
// script na pagina, ou se o caminho tem que ser a VM.
//
// COMO USAR
//   1. Abra a tela do SPX onde voce bipa os codigos
//   2. F12 > aba Console
//   3. Cole este arquivo inteiro e de Enter
//      (se o Chrome pedir, digite  allow pasting  e Enter antes)
//   4. Ele da 5 SEGUNDOS: clique no campo do codigo nesse tempo
//   5. Me mande o que aparecer no console
//
// Ele NAO envia nada: so escreve um codigo de teste no campo e conta o que
// o SPX fez. Se o codigo aparecer escrito na tela, ja e meio caminho.

(() => {
  const CODIGO_TESTE = 'BR00TESTE12345';
  const ESPERA = 5;

  console.log('%c=== TESTE DE CAMPO - SPX ===', 'font-size:14px;font-weight:bold;color:#2c7be5');
  console.log(`%cCLIQUE NO CAMPO DO CODIGO AGORA - ${ESPERA} segundos`,
              'font-size:13px;font-weight:bold;color:#e67e22');

  let resta = ESPERA;
  const relogio = setInterval(() => {
    resta--;
    if (resta > 0) console.log(`  ${resta}...`);
  }, 1000);

  setTimeout(() => {
    clearInterval(relogio);
    testar();
  }, ESPERA * 1000);

  function testar() {
  const campo = document.activeElement;

  if (!campo || !['INPUT', 'TEXTAREA'].includes(campo.tagName)) {
    console.error('Nenhum campo de texto ficou focado.');
    console.log('Rode de novo e clique DENTRO do campo do codigo durante a contagem.');
    return;
  }

  // --- o que e esse campo ---------------------------------------------
  console.log('Campo encontrado:', campo);
  console.table({
    tag: campo.tagName,
    type: campo.type || '(sem type)',
    id: campo.id || '(sem id)',
    name: campo.name || '(sem name)',
    classe: campo.className || '(sem classe)',
    placeholder: campo.placeholder || '(sem placeholder)',
    maxlength: campo.maxLength > 0 ? campo.maxLength : '(livre)',
    dentroDeIframe: window.top !== window.self,
  });

  // React/Vue guardam o valor por fora do DOM: mexer no .value direto passa
  // despercebido. O setter nativo + evento 'input' e o jeito que eles notam.
  const reagePorFramework = Object.keys(campo).some(k =>
    k.startsWith('__react') || k.startsWith('__vue') || k.startsWith('_v'));
  console.log('Framework detectado no campo:', reagePorFramework ? 'SIM (React/Vue)' : 'nao aparenta');

  // --- tentativa 1: atribuicao simples --------------------------------
  campo.value = CODIGO_TESTE;
  const simplesPegou = campo.value === CODIGO_TESTE;
  campo.value = '';

  // --- tentativa 2: setter nativo + eventos ---------------------------
  const proto = campo.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;

  setter.call(campo, CODIGO_TESTE);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));

  const nativoPegou = campo.value === CODIGO_TESTE;

  // --- o Enter e aceito? ----------------------------------------------
  let enterAceito = null;
  const marcar = () => { enterAceito = true; };
  campo.addEventListener('keydown', marcar, { once: true });
  campo.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
  }));
  campo.removeEventListener('keydown', marcar);

  // --- veredito --------------------------------------------------------
  console.log('%c--- RESULTADO ---', 'font-weight:bold');
  console.log('1) valor simples aceito :', simplesPegou);
  console.log('2) setter nativo aceito :', nativoPegou);
  console.log('3) evento Enter chegou  :', enterAceito === true);
  console.log('4) valor agora no campo :', JSON.stringify(campo.value));

  if (nativoPegou) {
    console.log('%cO campo ACEITA escrita por script.', 'color:green;font-weight:bold');
    console.log('OLHE A TELA: o codigo BR00TESTE12345 apareceu escrito no campo?');
    console.log('  - apareceu  -> da pra fazer o script e aposentar o macro');
    console.log('  - nao apareceu -> a tela ignora, o caminho e a VM');
  } else {
    console.log('%cO campo RECUSA escrita por script.', 'color:red;font-weight:bold');
    console.log('Caminho aqui e a VM mesmo.');
  }

  console.log('Me mande um print deste console inteiro.');
  }
})();
