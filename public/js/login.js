// public/js/login.js
// Handles the login form: client-side validation, API call, and redirect.

'use strict';

// ---------------------------------------------------------------
// Toggle password visibility
// ---------------------------------------------------------------
function togglePassword() {
  const pwd = document.getElementById('password');
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
}

// ---------------------------------------------------------------
// Show / hide the alert banner
// ---------------------------------------------------------------
function showAlert(message, type = 'error') {
  const el = document.getElementById('auth-alert');
  el.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function clearAlert() {
  const el = document.getElementById('auth-alert');
  el.classList.add('hidden');
  el.textContent = '';
}

// ---------------------------------------------------------------
// Field-level validation helpers
// ---------------------------------------------------------------
function setError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const err   = document.getElementById(errorId);
  if (message) {
    field.classList.add('error');
    err.textContent = message;
  } else {
    field.classList.remove('error');
    err.textContent = '';
  }
}

function validateLoginForm(username, password) {
  let valid = true;
  if (!username.trim()) {
    setError('username', 'username-error', 'Username is required.');
    valid = false;
  } else {
    setError('username', 'username-error', '');
  }
  if (!password) {
    setError('password', 'password-error', 'Password is required.');
    valid = false;
  } else if (password.length < 4) {
    setError('password', 'password-error', 'Password is too short.');
    valid = false;
  } else {
    setError('password', 'password-error', '');
  }
  return valid;
}

// ---------------------------------------------------------------
// Set loading state on the button
// ---------------------------------------------------------------
function setLoading(loading) {
  const btn     = document.getElementById('login-btn');
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spinner.classList.toggle('hidden', !loading);
}

// ---------------------------------------------------------------
// Check if user is already logged in — redirect to dashboard
// ---------------------------------------------------------------
async function checkExistingSession() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.loggedIn) {
      window.location.href = '/dashboard';
    }
  } catch (_) {
    // Ignore — just show the login page
  }
}

// ---------------------------------------------------------------
// Form submit handler
// ---------------------------------------------------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!validateLoginForm(username, password)) return;

  setLoading(true);

  try {
    const response = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: username.trim(), password }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAlert('Login successful! Redirecting…', 'success');
      setTimeout(() => { window.location.href = '/dashboard'; }, 800);
    } else {
      const msg = data.message || (data.errors && data.errors[0]?.msg) || 'Login failed.';
      showAlert(msg, 'error');
      setLoading(false);
    }
  } catch (err) {
    showAlert('Network error. Is the server running?', 'error');
    setLoading(false);
  }
});

// Run on page load
checkExistingSession();
