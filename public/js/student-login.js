// public/js/student-login.js
// Handles student portal authentication, input validation, and redirection.

'use strict';

// Toggle password input visibility
function toggleStudentPassword() {
  const pwd = document.getElementById('password');
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
}

function showAlert(message, type = 'error') {
  const el = document.getElementById('student-auth-alert');
  el.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function clearAlert() {
  const el = document.getElementById('student-auth-alert');
  el.classList.add('hidden');
  el.textContent = '';
}

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

function validateStudentForm(identifier, password) {
  let valid = true;
  if (!identifier.trim()) {
    setError('identifier', 'identifier-error', 'Registered email or roll number is required.');
    valid = false;
  } else {
    setError('identifier', 'identifier-error', '');
  }

  if (!password) {
    setError('password', 'password-error', 'Password is required.');
    valid = false;
  } else if (password.length < 4) {
    setError('password', 'password-error', 'Password must be at least 4 characters.');
    valid = false;
  } else {
    setError('password', 'password-error', '');
  }
  return valid;
}

function setLoading(loading) {
  const btn     = document.getElementById('student-login-btn');
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spinner.classList.toggle('hidden', !loading);
}

// Check if student session is already active
async function checkExistingStudentSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.loggedIn && data.role === 'student') {
      window.location.replace('/student-dashboard.html');
    }
  } catch (_) {
    // Ignore error
  }
}

document.getElementById('student-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const identifier = document.getElementById('identifier').value;
  const password   = document.getElementById('password').value;

  if (!validateStudentForm(identifier, password)) return;

  setLoading(true);

  try {
    // Ensure we have a fresh CSRF token before POSTing
    if (window.fetchCsrfToken) await window.fetchCsrfToken();

    const response = await fetch('/api/auth/student/login', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token':   window.getCsrfToken ? window.getCsrfToken() : '',
      },
      credentials: 'same-origin',
      body:    JSON.stringify({ identifier: identifier.trim(), password }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAlert('Login successful! Redirecting to dashboard…', 'success');
      setTimeout(() => {
        window.location.replace('/student-dashboard.html');
      }, 700);
    } else {
      const msg = data.message || (data.errors && data.errors[0]?.msg) || 'Invalid credentials.';
      showAlert(msg, 'error');
      setLoading(false);
    }
  } catch (err) {
    showAlert('Network error. Is the server running?', 'error');
    setLoading(false);
  }
});

checkExistingStudentSession();
