(function () {
  'use strict';
  const tbody = document.getElementById('usersTableBody');
  const form = document.getElementById('userForm');
  const message = document.getElementById('userMessage');
  const createButton = document.getElementById('createUserBtn');
  const empty = document.getElementById('usersEmpty');
  const passwordForm = document.getElementById('passwordForm');
  const passwordMessage = document.getElementById('passwordMessage');
  const changePasswordButton = document.getElementById('changePasswordBtn');

  function goLogin() {
    window.location.replace('/login.html?next=' + encodeURIComponent(window.location.pathname));
  }

  function showMessage(text, isError) {
    message.textContent = text || '';
    message.classList.toggle('error', Boolean(isError));
  }

  function showPasswordMessage(text, isError) {
    passwordMessage.textContent = text || '';
    passwordMessage.classList.toggle('error', Boolean(isError));
  }

  function render(users) {
    tbody.replaceChildren();
    empty.hidden = users.length > 0;
    users.forEach(function (user) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = user.username;
      const role = document.createElement('td');
      role.textContent = user.role === 'admin' ? 'Administrador' : user.role;
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'user-status' + (user.active ? '' : ' inactive');
      badge.textContent = user.active ? 'Activo' : 'Inactivo';
      status.appendChild(badge);
      const created = document.createElement('td');
      created.textContent = user.created_at || '—';
      const action = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'user-action';
      button.textContent = user.active ? 'Desactivar' : 'Activar';
      button.dataset.userId = user.id;
      button.addEventListener('click', function () { toggleUser(user.id, button); });
      action.appendChild(button);
      [name, role, status, created, action].forEach(function (cell) { row.appendChild(cell); });
      tbody.appendChild(row);
    });
  }

  async function loadUsers() {
    const response = await fetch('/api/users', { headers: { Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) return goLogin();
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No fue posible cargar los usuarios.');
    render(data);
  }

  async function toggleUser(id, button) {
    button.disabled = true;
    try {
      const response = await fetch('/api/users/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: id })
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) return goLogin();
      if (!response.ok) throw new Error(data.error || 'No fue posible actualizar el usuario.');
      await loadUsers();
      showMessage('Estado del usuario actualizado.', false);
    } catch (error) {
      showMessage(error.message, true);
      button.disabled = false;
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    showMessage('', false);
    createButton.disabled = true;
    try {
      const response = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: document.getElementById('newUsername').value.trim(), password: document.getElementById('newPassword').value })
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) return goLogin();
      if (!response.ok) throw new Error(data.error || 'No fue posible crear el usuario.');
      form.reset();
      await loadUsers();
      showMessage('Usuario creado correctamente.', false);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      createButton.disabled = false;
    }
  });

  passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showPasswordMessage('', false);
    changePasswordButton.disabled = true;
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          current_password: document.getElementById('currentPassword').value,
          new_password: document.getElementById('newOwnPassword').value
        })
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) return goLogin();
      if (!response.ok) throw new Error(data.error || 'No fue posible actualizar la contraseña.');
      passwordForm.reset();
      showPasswordMessage('Contraseña actualizada correctamente.', false);
    } catch (error) {
      showPasswordMessage(error.message, true);
    } finally {
      changePasswordButton.disabled = false;
    }
  });

  loadUsers().catch(function (error) { showMessage(error.message, true); });
})();
