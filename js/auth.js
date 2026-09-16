(function () {
  'use strict';

  function safeNext(value) {
    return value && value.startsWith('/') && !value.startsWith('//') ? value : '/admin.html';
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } finally {
      window.location.replace('/login.html');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const logoutButton = document.getElementById('btnLogout');
    if (logoutButton) logoutButton.addEventListener('click', logout);

    const form = document.getElementById('loginForm');
    if (!form) return;

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const submitButton = document.getElementById('loginSubmit');
    const message = document.getElementById('loginMessage');
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));

    fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.authenticated) window.location.replace(next);
      })
      .catch(function () {});

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      message.textContent = '';
      submitButton.disabled = true;
      submitButton.textContent = 'Verificando…';
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
        window.location.replace(next);
      } catch (error) {
        message.textContent = error.message;
        passwordInput.select();
        submitButton.disabled = false;
        submitButton.textContent = 'Ingresar al sistema';
      }
    });
  });
})();
