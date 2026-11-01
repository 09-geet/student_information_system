// public/js/student-app.js
// Client controller for the authenticated Student Information Portal:
// - Profile view
// - Attendance tracker & < 75% warning indicator
// - Fee balance & payment receipts
// - Announcements board
// - Exam results empty state
// - Self-service password change
// - Session management & logout

'use strict';

const studentState = {
  currentSection: 'overview',
  profile: null,
  attendance: { summary: null, history: [], filteredHistory: [] },
  fees: { ledger: null, payments: [] },
  notifications: [],
};

// ================================================================
// 1. HELPERS & UTILITIES
// ================================================================

async function studentApiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // Attach CSRF token for state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && window.getCsrfToken) {
    headers['CSRF-Token'] = window.getCsrfToken();
  }

  const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });

  if (res.status === 401 || res.status === 403) {
    const data = await res.json().catch(() => ({}));

    // If it's a CSRF error, refresh the token and retry once
    if (res.status === 403 && data.message && data.message.toLowerCase().includes('csrf')) {
      await window.fetchCsrfToken();
      headers['CSRF-Token'] = window.getCsrfToken();
      return fetch(url, { ...options, headers, credentials: 'same-origin' });
    }

    if (res.status === 403 && data.message && data.message.includes('deactivated')) {
      alert(data.message);
    }
    window.location.replace('/student-login.html');
    throw new Error('Unauthorized');
  }

  return res;
}

function showStudentAlert(message, type = 'info', autoDismiss = 4000) {
  const el = document.getElementById('global-alert');
  if (!el) return;
  el.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '⚠️ ' : 'ℹ️ ') + message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  if (autoDismiss) {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), autoDismiss);
  }
}

function formatCurrency(amount) {
  const num = Number(amount || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  const cls = {
    active: 'badge-active',
    inactive: 'badge-inactive',
    graduated: 'badge-graduated',
    Paid: 'badge-paid',
    Partial: 'badge-partial',
    Unpaid: 'badge-unpaid',
    Present: 'badge-present',
    Absent: 'badge-absent',
  };
  return `<span class="badge ${cls[status] || 'badge-inactive'}">${status}</span>`;
}

// ================================================================
// 2. NAVIGATION
// ================================================================

function navigateStudent(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));

  const targetSection = document.getElementById(`section-${section}`);
  if (targetSection) targetSection.classList.add('active');

  const navLink = document.querySelector(`.sidebar .nav-link[data-section="${section}"]`);
  if (navLink) navLink.classList.add('active');

  const titles = {
    overview:    'Dashboard Overview',
    profile:     'My Academic Profile',
    attendance:  'Attendance Records',
    fees:        'Fee Details & Receipts',
    notices:     'Notice Board & Announcements',
    results:     'Examination Results',
    security:    'Account Security & Password',
  };
  document.getElementById('student-page-title').textContent = titles[section] || 'Student Portal';
  studentState.currentSection = section;

  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');
}

// ================================================================
// 3. AUTHENTICATION & SESSION
// ================================================================

async function checkStudentAuth() {
  try {
    const res = await fetch('/api/auth/student/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.replace('/student-login.html');
      return false;
    }
    return true;
  } catch (_) {
    window.location.replace('/student-login.html');
    return false;
  }
}

async function handleStudentLogout() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (window.getCsrfToken) headers['CSRF-Token'] = window.getCsrfToken();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
    });
  } finally {
    window.location.replace('/student-login.html');
  }
}

document.getElementById('student-logout-btn')?.addEventListener('click', handleStudentLogout);
document.getElementById('topbar-logout-btn')?.addEventListener('click', handleStudentLogout);

// ================================================================
// 4. DATA LOADERS
// ================================================================

// 4a. Load Student Profile
async function loadStudentProfile() {
  try {
    const res = await studentApiFetch('/api/student/me');
    const data = await res.json();
    if (!data.success) return;

    const s = data.data;
    studentState.profile = s;

    // Header & Sidebar
    document.getElementById('sidebar-student-name').textContent = s.name;
    document.getElementById('sidebar-student-roll').textContent = s.roll_number;
    document.getElementById('topbar-student-name').textContent  = s.name;
    document.getElementById('topbar-student-course').textContent= s.course_name;
    document.getElementById('hero-student-name').textContent    = s.name;
    document.getElementById('hero-course').textContent          = s.course_name;
    document.getElementById('hero-dept').textContent            = s.department_name;
    document.getElementById('hero-status').innerHTML            = statusBadge(s.status);
    document.getElementById('sidebar-status-tag').innerHTML     = statusBadge(s.status);

    // Profile Page
    document.getElementById('p-name').textContent        = s.name;
    document.getElementById('p-roll').textContent        = s.roll_number;
    document.getElementById('p-email').textContent       = s.email;
    document.getElementById('p-phone').textContent       = s.phone;
    document.getElementById('p-admission').textContent   = formatDate(s.admission_date);
    document.getElementById('p-status').innerHTML        = statusBadge(s.status);

    document.getElementById('p-course').textContent      = s.course_name;
    document.getElementById('p-course-code').textContent = s.course_code;
    document.getElementById('p-duration').textContent    = `${s.duration_years} Years`;
    document.getElementById('p-dept').textContent        = s.department_name;
    document.getElementById('p-dept-code').textContent   = s.department_code;
    document.getElementById('p-last-login').textContent   = formatDate(s.last_login);
  } catch (_) {
    // Handled
  }
}

// 4b. Load Student Attendance
async function loadStudentAttendance() {
  try {
    const res = await studentApiFetch('/api/student/attendance');
    const data = await res.json();
    if (!data.success) return;

    const { summary, history } = data.data;
    studentState.attendance.summary = summary;
    studentState.attendance.history = history;
    studentState.attendance.filteredHistory = history;

    const pct = summary.attendance_percentage.toFixed(2);
    const isLow = summary.is_low_attendance;

    // Overview cards
    const dashPct = document.getElementById('dash-att-pct');
    dashPct.textContent = `${pct}%`;
    dashPct.style.color = isLow ? 'var(--danger)' : 'var(--success)';

    document.getElementById('meter-pct-text').textContent = `${pct}%`;
    const bar = document.getElementById('meter-progress-bar');
    bar.style.width = `${Math.min(100, Math.max(0, summary.attendance_percentage))}%`;
    bar.style.backgroundColor = isLow ? 'var(--danger)' : 'var(--success)';

    const note = document.getElementById('attendance-threshold-note');
    if (isLow) {
      note.innerHTML = `<span style="color: var(--danger); font-weight: 600;">⚠️ Alert: Attendance is below 75%! Regularize immediately.</span>`;
    } else {
      note.innerHTML = `<span style="color: var(--success); font-weight: 500;">✅ Good: Your attendance meets the 75% minimum academic requirement.</span>`;
    }

    document.getElementById('dash-att-total').textContent   = summary.total_classes;
    document.getElementById('dash-att-present').textContent = summary.present_days;
    document.getElementById('dash-att-absent').textContent  = summary.absent_days;

    // Attendance section cards
    document.getElementById('att-stat-total').textContent   = summary.total_classes;
    document.getElementById('att-stat-present').textContent = summary.present_days;
    document.getElementById('att-stat-absent').textContent  = summary.absent_days;
    const attPct = document.getElementById('att-stat-pct');
    attPct.textContent = `${pct}%`;
    attPct.style.color = isLow ? 'var(--danger)' : 'var(--success)';

    const banner = document.getElementById('att-warning-banner');
    if (isLow) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    renderAttendanceHistoryTable();
  } catch (_) {
    // Handled
  }
}

function renderAttendanceHistoryTable() {
  const tbody = document.getElementById('att-history-tbody');
  const records = studentState.attendance.filteredHistory;

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No attendance entries recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${formatDate(r.date)}</strong></td>
      <td>${escapeHtml(r.class_name)}</td>
      <td>${escapeHtml(r.course_name)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
  `).join('');
}

// Attendance filter listeners
document.getElementById('att-search-input')?.addEventListener('input', applyAttendanceFilters);
document.getElementById('att-filter-status')?.addEventListener('change', applyAttendanceFilters);
document.getElementById('att-clear-filter-btn')?.addEventListener('click', () => {
  document.getElementById('att-search-input').value = '';
  document.getElementById('att-filter-status').value = '';
  applyAttendanceFilters();
});

function applyAttendanceFilters() {
  const q = document.getElementById('att-search-input').value.trim().toLowerCase();
  const status = document.getElementById('att-filter-status').value;

  studentState.attendance.filteredHistory = studentState.attendance.history.filter(r => {
    const matchesQuery = !q || (r.date && r.date.toLowerCase().includes(q)) || (r.class_name && r.class_name.toLowerCase().includes(q));
    const matchesStatus = !status || r.status === status;
    return matchesQuery && matchesStatus;
  });

  renderAttendanceHistoryTable();
}

// 4c. Load Student Fees
async function loadStudentFees() {
  try {
    const res = await studentApiFetch('/api/student/fees');
    const data = await res.json();
    if (!data.success) return;

    const { ledger, payments } = data.data;
    studentState.fees.ledger   = ledger;
    studentState.fees.payments = payments;

    // Overview cards
    document.getElementById('dash-fee-total').textContent   = formatCurrency(ledger.total_fee);
    document.getElementById('dash-fee-paid').textContent    = formatCurrency(ledger.paid_amount);
    document.getElementById('dash-fee-balance').textContent = formatCurrency(ledger.remaining_balance);

    // Fees Section
    document.getElementById('fee-stat-total').textContent   = formatCurrency(ledger.total_fee);
    document.getElementById('fee-stat-paid').textContent    = formatCurrency(ledger.paid_amount);
    document.getElementById('fee-stat-balance').textContent = formatCurrency(ledger.remaining_balance);
    document.getElementById('fee-stat-status').innerHTML    = statusBadge(ledger.fee_status);

    document.getElementById('fee-receipts-count').textContent =
      `${payments.length} payment transaction${payments.length === 1 ? '' : 's'}`;

    // Render payments table
    const tbody = document.getElementById('fee-payments-tbody');
    if (!payments.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No fee payments recorded on your ledger yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map((p, i) => `
      <tr>
        <td>#${p.id}</td>
        <td><strong>${formatDate(p.payment_date)}</strong></td>
        <td style="color: var(--success); font-weight: 700;">${formatCurrency(p.amount)}</td>
        <td><span style="font-size: 0.8rem; background: var(--gray-100); padding: 3px 8px; border-radius: 4px; font-weight: 600;">${p.payment_method}</span></td>
        <td>${p.remarks ? escapeHtml(p.remarks) : '<span style="color: var(--gray-400)">—</span>'}</td>
      </tr>
    `).join('');
  } catch (_) {
    // Handled
  }
}

// 4d. Load Announcements
async function loadStudentNotifications() {
  try {
    const res = await studentApiFetch('/api/student/notifications');
    const data = await res.json();
    if (!data.success) return;

    studentState.notifications = data.data;

    // Overview snippet (max 3 notices)
    const snippetContainer = document.getElementById('dash-notices-container');
    if (!data.data.length) {
      snippetContainer.innerHTML = `<p class="text-muted" style="font-size: 0.9rem;">No active announcements at this time.</p>`;
    } else {
      snippetContainer.innerHTML = data.data.slice(0, 3).map(n => `
        <div class="notice-snippet-item">
          <div class="notice-snippet-header">
            <strong class="notice-title">${escapeHtml(n.title)}</strong>
            <small class="notice-date">${formatDate(n.created_at)}</small>
          </div>
          <p class="notice-body-preview">${escapeHtml(n.message)}</p>
        </div>
      `).join('');
    }

    // Full Notices Feed
    const feedContainer = document.getElementById('notices-container');
    if (!data.data.length) {
      feedContainer.innerHTML = `
        <div class="card empty-state-card">
          <div class="empty-state-icon">📢</div>
          <h3 class="empty-state-title">No Notices Available</h3>
          <p class="empty-state-text">There are currently no active notifications or announcements for your department or class.</p>
        </div>
      `;
      return;
    }

    feedContainer.innerHTML = data.data.map(n => `
      <div class="card notice-card" style="margin-bottom: 1rem; padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.5rem;">
          <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--gray-900);">${escapeHtml(n.title)}</h3>
          <span style="font-size: 0.8rem; color: var(--gray-500); white-space: nowrap;">📅 ${formatDate(n.created_at)}</span>
        </div>
        <p style="font-size: 0.925rem; color: var(--gray-700); line-height: 1.5; margin-bottom: 0.75rem;">
          ${escapeHtml(n.message)}
        </p>
        <div style="display: flex; gap: 0.5rem;">
          ${n.department_name ? `<span class="badge badge-inactive">🏛 Dept: ${escapeHtml(n.department_name)}</span>` : '<span class="badge badge-active">📢 All Departments</span>'}
          ${n.course_name ? `<span class="badge badge-inactive">📚 Course: ${escapeHtml(n.course_name)}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (_) {
    // Handled
  }
}

// ================================================================
// 5. CHANGE PASSWORD
// ================================================================

document.getElementById('change-pwd-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const alertEl = document.getElementById('pwd-form-alert');
  alertEl.classList.add('hidden');

  const currentPassword = document.getElementById('current-pwd').value;
  const newPassword     = document.getElementById('new-pwd').value;
  const confirmPassword = document.getElementById('confirm-pwd').value;

  const eCurr = document.getElementById('e-current-pwd');
  const eNew  = document.getElementById('e-new-pwd');
  const eConf = document.getElementById('e-confirm-pwd');
  eCurr.textContent = '';
  eNew.textContent = '';
  eConf.textContent = '';

  let valid = true;
  if (!currentPassword) {
    eCurr.textContent = 'Current password is required.';
    valid = false;
  }

  if (!newPassword || newPassword.length < 8) {
    eNew.textContent = 'New password must be at least 8 characters long.';
    valid = false;
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
    eNew.textContent = 'Must include at least one uppercase letter, one lowercase letter, and one number.';
    valid = false;
  }

  if (newPassword !== confirmPassword) {
    eConf.textContent = 'Passwords do not match.';
    valid = false;
  }

  if (!valid) return;

  const btn = document.getElementById('change-pwd-btn');
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = true;
  text.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const res = await studentApiFetch('/api/student/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password:     newPassword,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alertEl.textContent = '✅ ' + data.message;
      alertEl.className = 'alert alert-success';
      alertEl.classList.remove('hidden');
      document.getElementById('change-pwd-form').reset();
      document.getElementById('must-change-pwd-banner')?.classList.add('hidden');
    } else {
      alertEl.textContent = '⚠️ ' + (data.message || 'Failed to change password.');
      alertEl.className = 'alert alert-error';
      alertEl.classList.remove('hidden');
    }
  } catch (_) {
    alertEl.textContent = '⚠️ Network error. Please try again.';
    alertEl.className = 'alert alert-error';
    alertEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    text.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});

// ================================================================
// 6. SIDEBAR & NAV EVENT LISTENERS
// ================================================================

document.getElementById('hamburger-btn')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

document.querySelectorAll('.sidebar .nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    navigateStudent(section);
  });
});

// ================================================================
// 7. INITIALIZATION
// ================================================================

(async () => {
  const isAuthed = await checkStudentAuth();
  if (!isAuthed) return;

  await loadStudentProfile();
  await Promise.all([
    loadStudentAttendance(),
    loadStudentFees(),
    loadStudentNotifications(),
  ]);

  navigateStudent('overview');
})();
