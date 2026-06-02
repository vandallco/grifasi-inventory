// PIN login UI
(() => {
  let _digits = [];

  function _getDots() {
    return document.querySelector('#view-login .pin-dots');
  }
  function _getWrapper() {
    return document.querySelector('#view-login [data-pin-shake]');
  }

  function _render() {
    const dots = _getDots();
    if (!dots) return;
    dots.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < _digits.length);
    });
  }

  function _reset(state = 'state-idle') {
    _digits = [];
    const dots = _getDots();
    if (!dots) return;
    dots.className = 'pin-dots ' + state;
    _render();
  }

  async function _submit() {
    const pin = _digits.join('');
    const ok = await window.Auth.validatePin(pin);
    if (ok) {
      const dots = _getDots();
      if (dots) dots.className = 'pin-dots state-success';
      window.Router.navigate('dashboard');
    } else {
      const dots = _getDots();
      const wrapper = _getWrapper();
      if (dots) dots.className = 'pin-dots state-error';
      if (wrapper) {
        wrapper.classList.add('shake');
        setTimeout(() => wrapper.classList.remove('shake'), 600);
      }
      setTimeout(() => _reset('state-idle'), 600);
    }
  }

  function init() {
    _reset('state-idle');
  }

  // Delegación de clicks en el view de login
  document.addEventListener('click', e => {
    const view = document.getElementById('view-login');
    if (!view || view.style.display === 'none') return;

    const digitEl = e.target.closest('[data-digit]');
    if (digitEl) {
      if (_digits.length >= 4) return;
      _digits.push(digitEl.dataset.digit);
      _render();
      if (_digits.length === 4) _submit();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const act = actionEl.dataset.action;
    if (act === 'backspace' || act === 'pin-back') {
      _digits.pop();
      _render();
    } else if (act === 'pin-clear') {
      _reset('state-idle');
    } else if (act === 'forgot') {
      window.alert(
        'El PIN lo administra el encargado del local.\n\n' +
        'Si ya estás dentro, podés cambiarlo en Configuración → Cambiar PIN.'
      );
    }
  });

  document.addEventListener('auth:logout', () => _reset('state-idle'));

  Router.onRoute('login', init);

  window.PinApp = Object.freeze({ init });
})();
