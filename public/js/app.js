// public/js/app.js
// Main dashboard application logic:
//   - Auth check & logout
//   - SPA navigation between sections (Dashboard, Students, Add Student, Fees, Attendance)
//   - Dashboard stats (Student stats & Fee summary cards)
//   - Student CRUD (list, search, filter, add, edit, delete)
//   - Fee Management (stats, student fee table, filters, set total fee, record payments, payment history modal)
//   - Attendance Management (mark by course/date/class, update existing, calculate %, highlight <75%, summary & date reports, student history modal)
//   - Form validation & pagination

'use strict';

// ================================================================
// 1. GLOBAL STATE
// ================================================================
const state = {
  currentSection: 'dashboard',
  students: [],
  departments: [],
  courses: [],
  editingId: null,
  deleteTargetId: null,
  deleteTargetName: '',
  pagination: { page: 1, limit: 15, total: 0, pages: 1 },
  filters: { search: '', department_id: '', status: '' },
  searchTimer: null,

  // Fees state
  fees: {
    data: [],
    pagination: { page: 1, limit: 15, total: 0, pages: 1 },
    filters: { search: '', status: '', department_id: '' },
    searchTimer: null,
  },

  // Attendance state
  attendance: {
    currentTab: 'mark',
    markingStudents: [],
    courseId: '',
    date: new Date().toISOString().split('T')[0],
    className: 'Regular',
    summarySearchTimer: null,
  },
};

// ================================================================
// 2. UTILITY HELPERS
// ================================================================

/** Centralized fetch wrapper — adds JSON headers, CSRF token, checks auth. */
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // Attach CSRF token for state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && window.getCsrfToken) {
    headers['CSRF-Token'] = window.getCsrfToken();
  }

  const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });

  if (res.status === 401) {
    if (window.location.pathname !== '/login.html') {
      window.location.replace('/login.html');
    }
    return res;
  }

  // If we get a CSRF rejection, refresh the token and retry once
  if (res.status === 403) {
    const clone = res.clone();
    const body = await clone.json().catch(() => ({}));
    if (body.message && body.message.toLowerCase().includes('csrf')) {
      await window.fetchCsrfToken();
      headers['CSRF-Token'] = window.getCsrfToken();
      return fetch(url, { ...options, headers, credentials: 'same-origin' });
    }
  }

  return res;
}

function showGlobalAlert(message, type = 'info', autoDismiss = 4000) {
  const el = document.getElementById('global-alert');
  el.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '⚠️ ' : 'ℹ️ ') + message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  if (autoDismiss) {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), autoDismiss);
  }
}

function showFormAlert(message, type = 'error') {
  const el = document.getElementById('form-alert');
  el.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideFormAlert() {
  document.getElementById('form-alert').classList.add('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  const num = Number(amount || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function setSubmitLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spinner.classList.toggle('hidden', !loading);
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

// ================================================================
// 3. NAVIGATION
// ================================================================
function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const sectionEl = document.getElementById(`section-${section}`);
  if (sectionEl) sectionEl.classList.add('active');

  const navLink = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (navLink) navLink.classList.add('active');

  const titles = {
    dashboard:     'Dashboard',
    students:      'Student Records',
    'add-student': state.editingId ? 'Edit Student' : 'Add New Student',
    fees:          'Fee Management',
    attendance:    'Attendance Management',
  };
  document.getElementById('page-title').textContent = titles[section] || section;
  state.currentSection = section;

  document.querySelector('.sidebar').classList.remove('open');

  if (section === 'dashboard') {
    loadStats();
    loadFeeStats();
  }
  if (section === 'students') {
    loadStudents();
  }
  if (section === 'add-student') {
    if (!state.editingId) resetStudentForm();
    loadDropdowns();
  }
  if (section === 'fees') {
    loadDropdowns();
    loadFeeStats();
    loadFees();
  }
  if (section === 'attendance') {
    loadDropdowns();
    initAttendanceSection();
  }
}

// ================================================================
// 4. AUTH
// ================================================================
async function checkAuth() {
  try {
    const res  = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.replace('/login.html');
      return false;
    } else {
      document.getElementById('sidebar-username').textContent = data.admin.fullName || data.admin.username;
      document.getElementById('topbar-username').textContent  = `Welcome, ${data.admin.fullName || data.admin.username}`;
      return true;
    }
  } catch (_) {
    window.location.replace('/login.html');
    return false;
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
});

// ================================================================
// 5. DASHBOARD STATS
// ================================================================
async function loadStats() {
  try {
    const res  = await apiFetch('/api/students/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('stat-total').textContent   = data.data.total_students;
      document.getElementById('stat-active').textContent  = data.data.active_students;
      document.getElementById('stat-courses').textContent = data.data.total_courses;
      document.getElementById('stat-depts').textContent   = data.data.total_departments;
    }
  } catch (_) { /* handled by apiFetch */ }
}

async function loadFeeStats() {
  try {
    const res = await apiFetch('/api/fees/stats');
    const data = await res.json();
    if (data.success) {
      const s = data.data;
      // Dashboard cards
      const dTotal = document.getElementById('dash-fee-total');
      const dColl = document.getElementById('dash-fee-collected');
      const dPend = document.getElementById('dash-fee-pending');
      const dUnpaid = document.getElementById('dash-fee-unpaid-count');
      if (dTotal) dTotal.textContent = formatCurrency(s.total_fees);
      if (dColl) dColl.textContent = formatCurrency(s.fees_collected);
      if (dPend) dPend.textContent = formatCurrency(s.pending_fees);
      if (dUnpaid) dUnpaid.textContent = s.students_unpaid;

      // Fees section cards
      const fTotal = document.getElementById('fee-stat-total');
      const fColl = document.getElementById('fee-stat-collected');
      const fPend = document.getElementById('fee-stat-pending');
      const fUnpaid = document.getElementById('fee-stat-unpaid');
      if (fTotal) fTotal.textContent = formatCurrency(s.total_fees);
      if (fColl) fColl.textContent = formatCurrency(s.fees_collected);
      if (fPend) fPend.textContent = formatCurrency(s.pending_fees);
      if (fUnpaid) fUnpaid.textContent = s.students_unpaid;
    }
  } catch (_) { /* handled */ }
}

// ================================================================
// 6. DROPDOWNS (departments & courses)
// ================================================================
async function loadDropdowns() {
  try {
    if (state.departments.length === 0) {
      const res  = await apiFetch('/api/students/departments');
      const data = await res.json();
      if (data.success) state.departments = data.data;
    }

    if (state.courses.length === 0) {
      const res  = await apiFetch('/api/students/courses');
      const data = await res.json();
      if (data.success) state.courses = data.data;
    }

    // Populate department selects across views
    ['s-dept', 'filter-dept', 'fee-filter-dept'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      state.departments.forEach(d => sel.add(new Option(d.name, d.id)));
    });

    // Populate course selects for student form, attendance marking, summary and date reports
    populateCourseSelect();

    ['att-select-course', 'att-summary-course', 'att-report-course'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      state.courses.forEach(c => sel.add(new Option(`${c.name} (${c.code})`, c.id)));
      if (cur) sel.value = cur;
    });
  } catch (_) { /* handled */ }
}

function populateCourseSelect(selectedDeptId = null) {
  const sel = document.getElementById('s-course');
  if (!sel) return;
  const currentVal = sel.value;
  while (sel.options.length > 1) sel.remove(1);

  const deptId = selectedDeptId || document.getElementById('s-dept').value;
  const toShow = deptId
    ? state.courses.filter(c => String(c.department_name) === getDeptNameById(deptId))
    : state.courses;

  (toShow.length ? toShow : state.courses).forEach(c => {
    sel.add(new Option(`${c.name} (${c.code})`, c.id));
  });

  if (currentVal) sel.value = currentVal;
}

function getDeptNameById(id) {
  const d = state.departments.find(d => String(d.id) === String(id));
  return d ? d.name : '';
}

document.getElementById('s-dept').addEventListener('change', () => {
  document.getElementById('s-course').value = '';
  populateCourseSelect();
});

// ================================================================
// 7. STUDENT RECORDS (list, search, pagination)
// ================================================================
async function loadStudents() {
  const tbody = document.getElementById('students-tbody');
  tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Loading students…</td></tr>`;

  const params = new URLSearchParams({
    page:  state.pagination.page,
    limit: state.pagination.limit,
  });
  if (state.filters.search)        params.set('search',        state.filters.search);
  if (state.filters.department_id) params.set('department_id', state.filters.department_id);
  if (state.filters.status)        params.set('status',        state.filters.status);

  try {
    const res  = await apiFetch(`/api/students?${params}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Failed to load students.</td></tr>`;
      return;
    }

    state.pagination = { ...state.pagination, ...data.pagination };
    renderStudentsTable(data.data);
    renderPagination();
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Network error.</td></tr>`;
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('students-tbody');
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-loading">No students found.</td></tr>`;
    return;
  }

  const startIndex = (state.pagination.page - 1) * state.pagination.limit + 1;

  tbody.innerHTML = students.map((s, i) => `
    <tr>
      <td>${startIndex + i}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td><code>${escapeHtml(s.roll_number)}</code></td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone)}</td>
      <td>${escapeHtml(s.course_name)}</td>
      <td>${escapeHtml(s.department_name)}</td>
      <td>${formatDate(s.admission_date)}</td>
      <td>${statusBadge(s.status)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-xs btn-outline" onclick="editStudent(${s.id})" title="Edit">✏️ Edit</button>
          <button class="btn btn-xs btn-outline" onclick="openStudentAccountModal(${s.id}, '${escapeHtml(s.name)}', '${escapeHtml(s.roll_number)}')" title="Portal Account">🔑 Account</button>
          <button class="btn btn-xs btn-danger"  onclick="confirmDelete(${s.id}, '${escapeHtml(s.name)}')" title="Delete">🗑 Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPagination() {
  const bar   = document.getElementById('pagination-bar');
  const { page, pages, total, limit } = state.pagination;

  if (pages <= 1) {
    bar.innerHTML = `<span style="font-size:.8rem;color:var(--gray-500)">${total} record${total !== 1 ? 's' : ''}</span>`;
    return;
  }

  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  let html = `<span style="font-size:.8rem;color:var(--gray-500);margin-right:.5rem">${from}–${to} of ${total}</span>`;
  html += `<button class="page-btn" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>`;

  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  if (start > 1) html += `<button class="page-btn" onclick="goToPage(1)">1</button>${start > 2 ? '<span>…</span>' : ''}`;
  for (let p = start; p <= end; p++) {
    html += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
  }
  if (end < pages) html += `${end < pages - 1 ? '<span>…</span>' : ''}<button class="page-btn" onclick="goToPage(${pages})">${pages}</button>`;

  html += `<button class="page-btn" onclick="goToPage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next ›</button>`;

  bar.innerHTML = html;
}

function goToPage(p) {
  if (p < 1 || p > state.pagination.pages) return;
  state.pagination.page = p;
  loadStudents();
}

document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    state.filters.search = e.target.value.trim();
    state.pagination.page = 1;
    loadStudents();
  }, 350);
});

document.getElementById('filter-dept').addEventListener('change', (e) => {
  state.filters.department_id = e.target.value;
  state.pagination.page = 1;
  loadStudents();
});

document.getElementById('filter-status').addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  state.pagination.page = 1;
  loadStudents();
});

document.getElementById('clear-filter-btn').addEventListener('click', () => {
  state.filters = { search: '', department_id: '', status: '' };
  state.pagination.page = 1;
  document.getElementById('search-input').value  = '';
  document.getElementById('filter-dept').value   = '';
  document.getElementById('filter-status').value = '';
  loadStudents();
});

// ================================================================
// 8. STUDENT FORM VALIDATION & SUBMIT
// ================================================================
function setFieldError(inputId, errorId, message) {
  const inp = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  if (!inp || !err) return;
  if (message) {
    inp.classList.add('error');
    err.textContent = message;
  } else {
    inp.classList.remove('error');
    err.textContent = '';
  }
}

function clearFormErrors() {
  [
    ['s-name', 'e-name'], ['s-roll', 'e-roll'], ['s-email', 'e-email'],
    ['s-phone', 'e-phone'], ['s-dept', 'e-dept'], ['s-course', 'e-course'],
    ['s-admission', 'e-admission'],
  ].forEach(([inp, err]) => setFieldError(inp, err, ''));
}

function validateStudentForm() {
  let valid = true;

  const name  = document.getElementById('s-name').value.trim();
  const roll  = document.getElementById('s-roll').value.trim();
  const email = document.getElementById('s-email').value.trim();
  const phone = document.getElementById('s-phone').value.trim();
  const dept  = document.getElementById('s-dept').value;
  const course= document.getElementById('s-course').value;
  const date  = document.getElementById('s-admission').value;

  if (!name)                                   { setFieldError('s-name', 'e-name', 'Full name is required.'); valid = false; }
  else if (!/^[A-Za-z\s.'-]+$/.test(name))    { setFieldError('s-name', 'e-name', 'Name contains invalid characters.'); valid = false; }
  else                                          setFieldError('s-name', 'e-name', '');

  if (!roll)                                   { setFieldError('s-roll', 'e-roll', 'Roll number is required.'); valid = false; }
  else if (!/^[A-Za-z0-9/_-]+$/.test(roll))   { setFieldError('s-roll', 'e-roll', 'Roll number can only contain letters, numbers, hyphens, slashes, or underscores.'); valid = false; }
  else                                          setFieldError('s-roll', 'e-roll', '');

  if (!email)                                  { setFieldError('s-email', 'e-email', 'Email is required.'); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('s-email', 'e-email', 'Invalid email address.'); valid = false; }
  else                                          setFieldError('s-email', 'e-email', '');

  if (!phone)                                  { setFieldError('s-phone', 'e-phone', 'Phone number is required.'); valid = false; }
  else if (!/^\+?[\d\s\-().]{7,15}$/.test(phone)) { setFieldError('s-phone', 'e-phone', 'Invalid phone number.'); valid = false; }
  else                                          setFieldError('s-phone', 'e-phone', '');

  if (!dept)                                   { setFieldError('s-dept', 'e-dept', 'Please select a department.'); valid = false; }
  else                                          setFieldError('s-dept', 'e-dept', '');

  if (!course)                                 { setFieldError('s-course', 'e-course', 'Please select a course.'); valid = false; }
  else                                          setFieldError('s-course', 'e-course', '');

  if (!date)                                   { setFieldError('s-admission', 'e-admission', 'Admission date is required.'); valid = false; }
  else                                          setFieldError('s-admission', 'e-admission', '');

  return valid;
}

document.getElementById('student-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFormAlert();
  clearFormErrors();

  if (!validateStudentForm()) return;

  const payload = {
    name:           document.getElementById('s-name').value.trim(),
    roll_number:    document.getElementById('s-roll').value.trim(),
    email:          document.getElementById('s-email').value.trim(),
    phone:          document.getElementById('s-phone').value.trim(),
    department_id:  parseInt(document.getElementById('s-dept').value, 10),
    course_id:      parseInt(document.getElementById('s-course').value, 10),
    admission_date: document.getElementById('s-admission').value,
    status:         document.getElementById('s-status').value,
  };

  const isEdit  = !!state.editingId;
  const url     = isEdit ? `/api/students/${state.editingId}` : '/api/students';
  const method  = isEdit ? 'PUT' : 'POST';

  setSubmitLoading(true);

  try {
    const res  = await apiFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();

    if (res.ok && data.success) {
      showGlobalAlert(data.message, 'success');
      state.editingId = null;
      resetStudentForm();
      state.courses = [];
      navigate('students');
    } else {
      const msg = data.message || (data.errors && data.errors.map(e => e.msg).join(', ')) || 'Operation failed.';
      showFormAlert(msg, 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showFormAlert('Network error. Please try again.', 'error');
    }
  } finally {
    setSubmitLoading(false);
  }
});

function resetStudentForm() {
  state.editingId = null;
  document.getElementById('student-id').value = '';
  document.getElementById('student-form').reset();
  document.getElementById('form-section-title').textContent = 'Add New Student';
  document.getElementById('submit-btn').querySelector('.btn-text').textContent = 'Save Student';
  clearFormErrors();
  hideFormAlert();
}

async function editStudent(id) {
  state.editingId = id;
  navigate('add-student');

  try {
    const res  = await apiFetch(`/api/students/${id}`);
    const data = await res.json();

    if (!data.success) {
      showFormAlert('Failed to load student data.', 'error');
      return;
    }

    const s = data.data;
    document.getElementById('student-id').value   = s.id;
    document.getElementById('s-name').value        = s.name;
    document.getElementById('s-roll').value        = s.roll_number;
    document.getElementById('s-email').value       = s.email;
    document.getElementById('s-phone').value       = s.phone;
    document.getElementById('s-status').value      = s.status;
    document.getElementById('s-admission').value   = s.admission_date
      ? new Date(s.admission_date).toISOString().split('T')[0]
      : '';

    await loadDropdowns();
    document.getElementById('s-dept').value = s.department_id;
    populateCourseSelect();
    document.getElementById('s-course').value = s.course_id;

    document.getElementById('form-section-title').textContent = 'Edit Student';
    document.getElementById('submit-btn').querySelector('.btn-text').textContent = 'Update Student';
  } catch (_) {
    showFormAlert('Network error loading student.', 'error');
  }
}

// ================================================================
// 9. STUDENT DELETE
// ================================================================
function confirmDelete(id, name) {
  state.deleteTargetId   = id;
  state.deleteTargetName = name;
  document.getElementById('delete-modal-msg').textContent =
    `Are you sure you want to delete "${name}"? This action cannot be undone.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  state.deleteTargetId   = null;
  state.deleteTargetName = '';
}

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (!state.deleteTargetId) return;
  const id = state.deleteTargetId;
  closeModal();

  try {
    const res  = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (res.ok && data.success) {
      showGlobalAlert(data.message, 'success');
      loadStudents();
    } else {
      showGlobalAlert(data.message || 'Delete failed.', 'error');
    }
  } catch (_) {
    showGlobalAlert('Network error.', 'error');
  }
});

document.getElementById('delete-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ================================================================
// 10. MODULE 1: FEE MANAGEMENT
// ================================================================
async function loadFees() {
  const tbody = document.getElementById('fees-tbody');
  tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Loading fee records…</td></tr>`;

  const params = new URLSearchParams({
    page:  state.fees.pagination.page,
    limit: state.fees.pagination.limit,
  });
  if (state.fees.filters.search)        params.set('search',        state.fees.filters.search);
  if (state.fees.filters.status)        params.set('status',        state.fees.filters.status);
  if (state.fees.filters.department_id) params.set('department_id', state.fees.filters.department_id);

  try {
    const res = await apiFetch(`/api/fees?${params}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Failed to load fee records.</td></tr>`;
      return;
    }

    state.fees.data = data.data;
    state.fees.pagination = { ...state.fees.pagination, ...data.pagination };
    renderFeesTable(data.data);
    renderFeePagination();
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Network error loading fees.</td></tr>`;
  }
}

function renderFeesTable(feesList) {
  const tbody = document.getElementById('fees-tbody');
  if (!feesList.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-loading">No fee records found.</td></tr>`;
    return;
  }

  const startIndex = (state.fees.pagination.page - 1) * state.fees.pagination.limit + 1;

  tbody.innerHTML = feesList.map((f, i) => `
    <tr>
      <td>${startIndex + i}</td>
      <td><strong>${escapeHtml(f.name)}</strong></td>
      <td><code>${escapeHtml(f.roll_number)}</code></td>
      <td>${escapeHtml(f.course_name)}</td>
      <td><strong>${formatCurrency(f.total_fee)}</strong></td>
      <td style="color: var(--success); font-weight: 600;">${formatCurrency(f.paid_amount)}</td>
      <td style="color: ${Number(f.remaining_balance) > 0 ? 'var(--danger)' : 'var(--gray-600)'}; font-weight: 600;">
        ${formatCurrency(f.remaining_balance)}
      </td>
      <td>${statusBadge(f.fee_status)}</td>
      <td>
        <small style="color: var(--gray-500); display: block;">${formatDate(f.last_payment_date)}</small>
        ${f.last_payment_method ? `<span style="font-size: 0.75rem; background: var(--gray-100); padding: 1px 5px; border-radius: 4px;">${f.last_payment_method}</span>` : ''}
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-xs btn-primary" onclick="openPaymentModal(${f.student_id}, '${escapeHtml(f.name)}', '${escapeHtml(f.roll_number)}', ${f.remaining_balance})" title="Pay Fee">💵 Pay</button>
          <button class="btn btn-xs btn-outline" onclick="openSetTotalFeeModal(${f.student_id}, '${escapeHtml(f.name)}', ${f.total_fee})" title="Set Total Fee">⚙️ Fee</button>
          <button class="btn btn-xs btn-secondary" onclick="openFeeHistoryModal(${f.student_id}, '${escapeHtml(f.name)}')" title="History">📜 History</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderFeePagination() {
  const bar = document.getElementById('fee-pagination-bar');
  const { page, pages, total, limit } = state.fees.pagination;

  if (pages <= 1) {
    bar.innerHTML = `<span style="font-size:.8rem;color:var(--gray-500)">${total} record${total !== 1 ? 's' : ''}</span>`;
    return;
  }

  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  let html = `<span style="font-size:.8rem;color:var(--gray-500);margin-right:.5rem">${from}–${to} of ${total}</span>`;
  html += `<button class="page-btn" onclick="goToFeePage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>`;

  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  if (start > 1) html += `<button class="page-btn" onclick="goToFeePage(1)">1</button>${start > 2 ? '<span>…</span>' : ''}`;
  for (let p = start; p <= end; p++) {
    html += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goToFeePage(${p})">${p}</button>`;
  }
  if (end < pages) html += `${end < pages - 1 ? '<span>…</span>' : ''}<button class="page-btn" onclick="goToFeePage(${pages})">${pages}</button>`;

  html += `<button class="page-btn" onclick="goToFeePage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next ›</button>`;

  bar.innerHTML = html;
}

function goToFeePage(p) {
  if (p < 1 || p > state.fees.pagination.pages) return;
  state.fees.pagination.page = p;
  loadFees();
}

// Fee filters
document.getElementById('fee-search-input').addEventListener('input', (e) => {
  clearTimeout(state.fees.searchTimer);
  state.fees.searchTimer = setTimeout(() => {
    state.fees.filters.search = e.target.value.trim();
    state.fees.pagination.page = 1;
    loadFees();
  }, 350);
});

document.getElementById('fee-filter-status').addEventListener('change', (e) => {
  state.fees.filters.status = e.target.value;
  state.fees.pagination.page = 1;
  loadFees();
});

document.getElementById('fee-filter-dept').addEventListener('change', (e) => {
  state.fees.filters.department_id = e.target.value;
  state.fees.pagination.page = 1;
  loadFees();
});

document.getElementById('fee-clear-filter-btn').addEventListener('click', () => {
  state.fees.filters = { search: '', status: '', department_id: '' };
  state.fees.pagination.page = 1;
  document.getElementById('fee-search-input').value = '';
  document.getElementById('fee-filter-status').value = '';
  document.getElementById('fee-filter-dept').value = '';
  loadFees();
});

// Set Total Fee Modal
function openSetTotalFeeModal(studentId, name, currentTotal) {
  document.getElementById('fee-total-student-id').value = studentId;
  document.getElementById('fee-total-amount').value = currentTotal || '';
  document.getElementById('fee-total-modal-desc').textContent = `Set or update total course fee for ${name}.`;
  document.getElementById('e-fee-total').textContent = '';
  document.getElementById('fee-total-modal').classList.remove('hidden');
}

function closeFeeTotalModal() {
  document.getElementById('fee-total-modal').classList.add('hidden');
}

document.getElementById('fee-total-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = parseInt(document.getElementById('fee-total-student-id').value, 10);
  const totalAmount = parseFloat(document.getElementById('fee-total-amount').value);

  if (isNaN(totalAmount) || totalAmount < 0) {
    document.getElementById('e-fee-total').textContent = 'Please enter a valid amount (≥ 0).';
    return;
  }

  try {
    const res = await apiFetch('/api/fees/set-total', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, total_fee: totalAmount }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showGlobalAlert(data.message, 'success');
      closeFeeTotalModal();
      loadFeeStats();
      loadFees();
    } else {
      document.getElementById('e-fee-total').textContent = data.message || 'Error updating fee.';
    }
  } catch (_) {
    document.getElementById('e-fee-total').textContent = 'Network error.';
  }
});

// Record Payment Modal
function openPaymentModal(studentId, name, rollNumber, remainingBalance) {
  document.getElementById('pay-student-id').value = studentId;
  document.getElementById('pay-amount').value = remainingBalance > 0 ? remainingBalance : '';
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('pay-method').value = 'Cash';
  document.getElementById('pay-remarks').value = '';
  document.getElementById('e-pay-amount').textContent = '';
  document.getElementById('e-pay-date').textContent = '';
  document.getElementById('fee-payment-modal-desc').textContent =
    `Recording payment for ${name} (${rollNumber}). Current Remaining: ${formatCurrency(remainingBalance)}`;
  document.getElementById('fee-payment-modal').classList.remove('hidden');
}

function closePaymentModal() {
  document.getElementById('fee-payment-modal').classList.add('hidden');
}

document.getElementById('fee-payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = parseInt(document.getElementById('pay-student-id').value, 10);
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const paymentDate = document.getElementById('pay-date').value;
  const paymentMethod = document.getElementById('pay-method').value;
  const remarks = document.getElementById('pay-remarks').value.trim();

  let valid = true;
  if (isNaN(amount) || amount <= 0) {
    document.getElementById('e-pay-amount').textContent = 'Amount must be greater than 0.';
    valid = false;
  } else {
    document.getElementById('e-pay-amount').textContent = '';
  }

  if (!paymentDate) {
    document.getElementById('e-pay-date').textContent = 'Date is required.';
    valid = false;
  } else {
    document.getElementById('e-pay-date').textContent = '';
  }

  if (!valid) return;

  try {
    const res = await apiFetch('/api/fees/payment', {
      method: 'POST',
      body: JSON.stringify({
        student_id: studentId,
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        remarks,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showGlobalAlert(data.message, 'success');
      closePaymentModal();
      loadFeeStats();
      loadFees();
    } else {
      document.getElementById('e-pay-amount').textContent = data.message || 'Payment failed.';
    }
  } catch (_) {
    document.getElementById('e-pay-amount').textContent = 'Network error.';
  }
});

// Payment History Modal
async function openFeeHistoryModal(studentId, name) {
  document.getElementById('fee-history-modal-title').textContent = `Payment History — ${name}`;
  const tbody = document.getElementById('fee-history-tbody');
  const summaryBox = document.getElementById('fee-history-summary');
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Loading history…</td></tr>`;
  summaryBox.innerHTML = 'Loading student details…';
  document.getElementById('fee-history-modal').classList.remove('hidden');

  try {
    const res = await apiFetch(`/api/fees/history/${studentId}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Failed to load history.</td></tr>`;
      return;
    }

    const s = data.student;
    summaryBox.innerHTML = `
      <strong>Roll No:</strong> ${escapeHtml(s.roll_number)} &nbsp;|&nbsp;
      <strong>Total Fee:</strong> ${formatCurrency(s.total_fee)} &nbsp;|&nbsp;
      <strong>Paid:</strong> <span style="color: var(--success); font-weight:600;">${formatCurrency(s.paid_amount)}</span> &nbsp;|&nbsp;
      <strong>Balance:</strong> <span style="color: var(--danger); font-weight:600;">${formatCurrency(s.remaining_balance)}</span> &nbsp;|&nbsp;
      <strong>Status:</strong> ${statusBadge(s.fee_status)}
    `;

    if (!data.payments.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No payment records found for this student.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.payments.map((p, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatDate(p.payment_date)}</td>
        <td style="color: var(--success); font-weight: 600;">${formatCurrency(p.amount)}</td>
        <td><span style="font-size: 0.8rem; background: var(--gray-100); padding: 2px 6px; border-radius: 4px;">${p.payment_method}</span></td>
        <td>${p.remarks ? escapeHtml(p.remarks) : '<span style="color: var(--gray-400)">—</span>'}</td>
      </tr>
    `).join('');
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Network error.</td></tr>`;
  }
}

function closeFeeHistoryModal() {
  document.getElementById('fee-history-modal').classList.add('hidden');
}

// Close modals when clicking outside
['fee-total-modal', 'fee-payment-modal', 'fee-history-modal', 'att-history-modal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) el.classList.add('hidden');
    });
  }
});

// ================================================================
// 11. MODULE 2: ATTENDANCE MANAGEMENT
// ================================================================
function initAttendanceSection() {
  const dateInput = document.getElementById('att-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const reportDateInput = document.getElementById('att-report-date');
  if (reportDateInput && !reportDateInput.value) {
    reportDateInput.value = new Date().toISOString().split('T')[0];
  }
}

function switchAttendanceTab(tab) {
  state.attendance.currentTab = tab;
  ['mark', 'summary', 'report'].forEach(t => {
    const tabEl = document.getElementById(`att-tab-${t}`);
    const btnEl = document.getElementById(`tab-btn-${t}`);
    if (t === tab) {
      tabEl.classList.remove('hidden');
      btnEl.classList.remove('btn-secondary');
      btnEl.classList.add('btn-primary');
    } else {
      tabEl.classList.add('hidden');
      btnEl.classList.remove('btn-primary');
      btnEl.classList.add('btn-secondary');
    }
  });

  if (tab === 'summary') loadAttendanceSummary();
  if (tab === 'report') loadAttendanceDateReport();
}

// Sub-Tab 1: Mark Attendance
document.getElementById('att-load-students-btn').addEventListener('click', async () => {
  const courseId = document.getElementById('att-select-course').value;
  const date = document.getElementById('att-date').value;
  const className = document.getElementById('att-class-name').value.trim() || 'Regular';

  if (!courseId) {
    showGlobalAlert('Please select a course.', 'error');
    return;
  }
  if (!date) {
    showGlobalAlert('Please select a date.', 'error');
    return;
  }

  state.attendance.courseId = courseId;
  state.attendance.date = date;
  state.attendance.className = className;

  const tbody = document.getElementById('att-marking-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Fetching students…</td></tr>`;

  try {
    const res = await apiFetch(`/api/attendance/students-for-marking?course_id=${courseId}&date=${date}&class_name=${encodeURIComponent(className)}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Failed to fetch students.</td></tr>`;
      return;
    }

    state.attendance.markingStudents = data.data;
    renderAttendanceMarkingTable(data.data, date);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Network error.</td></tr>`;
  }
});

function renderAttendanceMarkingTable(students, date) {
  const tbody = document.getElementById('att-marking-tbody');
  const indicator = document.getElementById('att-status-indicator');
  const batchActions = document.getElementById('att-batch-actions');
  const saveBar = document.getElementById('att-save-bar');

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">No active students enrolled in this course.</td></tr>`;
    indicator.textContent = 'No active students found.';
    batchActions.classList.add('hidden');
    saveBar.classList.add('hidden');
    return;
  }

  const alreadyMarked = students.some(s => s.is_marked === 1);
  indicator.innerHTML = alreadyMarked
    ? `⚠️ Attendance for <strong>${date}</strong> was previously recorded. You can update and re-save.`
    : `📝 Marking new attendance for <strong>${date}</strong> (${students.length} students).`;

  batchActions.classList.remove('hidden');
  saveBar.classList.remove('hidden');

  tbody.innerHTML = students.map((s, idx) => `
    <tr id="att-row-${s.student_id}">
      <td>${idx + 1}</td>
      <td><code>${escapeHtml(s.roll_number)}</code></td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.course_name)}</td>
      <td id="att-badge-${s.student_id}">
        ${statusBadge(s.current_status)}
      </td>
      <td>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 500; color: var(--success);">
            <input type="radio" name="att-radio-${s.student_id}" value="Present" ${s.current_status === 'Present' ? 'checked' : ''} onchange="onAttendanceStatusChange(${s.student_id}, 'Present')" /> Present
          </label>
          <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 500; color: var(--danger);">
            <input type="radio" name="att-radio-${s.student_id}" value="Absent" ${s.current_status === 'Absent' ? 'checked' : ''} onchange="onAttendanceStatusChange(${s.student_id}, 'Absent')" /> Absent
          </label>
        </div>
      </td>
    </tr>
  `).join('');
}

function onAttendanceStatusChange(studentId, status) {
  const st = state.attendance.markingStudents.find(s => s.student_id === studentId);
  if (st) st.current_status = status;
  const badgeCell = document.getElementById(`att-badge-${studentId}`);
  if (badgeCell) badgeCell.innerHTML = statusBadge(status);
}

function setAllAttendance(status) {
  state.attendance.markingStudents.forEach(s => {
    s.current_status = status;
    const radios = document.getElementsByName(`att-radio-${s.student_id}`);
    radios.forEach(r => { if (r.value === status) r.checked = true; });
    const badgeCell = document.getElementById(`att-badge-${s.student_id}`);
    if (badgeCell) badgeCell.innerHTML = statusBadge(status);
  });
}

// Save attendance batch
document.getElementById('att-save-btn').addEventListener('click', async () => {
  const { courseId, date, className, markingStudents } = state.attendance;

  if (!markingStudents.length) return;

  const btn = document.getElementById('att-save-btn');
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = true;
  text.classList.add('hidden');
  spinner.classList.remove('hidden');

  const records = markingStudents.map(s => ({
    student_id: s.student_id,
    status: s.current_status || 'Present',
  }));

  try {
    const res = await apiFetch('/api/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        course_id: parseInt(courseId, 10),
        class_name: className,
        date,
        records,
      }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showGlobalAlert(data.message, 'success');
      document.getElementById('att-status-indicator').innerHTML =
        `✅ Attendance saved successfully for <strong>${date}</strong>.`;
    } else {
      showGlobalAlert(data.message || 'Failed to save attendance.', 'error');
    }
  } catch (_) {
    showGlobalAlert('Network error saving attendance.', 'error');
  } finally {
    btn.disabled = false;
    text.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});

// Sub-Tab 2: Attendance Summary & Low Attendance (<75%)
async function loadAttendanceSummary() {
  const tbody = document.getElementById('att-summary-tbody');
  tbody.innerHTML = `<tr><td colspan="9" class="table-loading">Loading summary…</td></tr>`;

  const courseId = document.getElementById('att-summary-course').value;
  const search = document.getElementById('att-summary-search').value.trim();

  const params = new URLSearchParams();
  if (courseId) params.set('course_id', courseId);
  if (search)   params.set('search', search);

  try {
    const res = await apiFetch(`/api/attendance/summary?${params}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-loading">Failed to load summary.</td></tr>`;
      return;
    }

    renderAttendanceSummaryTable(data.data);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-loading">Network error.</td></tr>`;
  }
}

function renderAttendanceSummaryTable(summary) {
  const tbody = document.getElementById('att-summary-tbody');
  if (!summary.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-loading">No attendance records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = summary.map((s, idx) => {
    const pct = parseFloat(s.attendance_percentage || 0);
    const isLow = s.total_classes > 0 && pct < 75.0;

    return `
      <tr class="${isLow ? 'row-low-attendance' : ''}">
        <td>${idx + 1}</td>
        <td><code>${escapeHtml(s.roll_number)}</code></td>
        <td>
          <strong>${escapeHtml(s.name)}</strong>
          ${isLow ? '<span class="badge badge-danger-alert" style="margin-left: 6px;">⚠️ Below 75%</span>' : ''}
        </td>
        <td>${escapeHtml(s.course_name)}</td>
        <td>${s.total_classes}</td>
        <td style="color: var(--success); font-weight: 600;">${s.present_days}</td>
        <td style="color: var(--danger); font-weight: 600;">${s.absent_days}</td>
        <td>
          <span style="font-weight: 700; color: ${isLow ? 'var(--danger)' : 'var(--success)'};">
            ${pct.toFixed(2)}%
          </span>
        </td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="openAttHistoryModal(${s.student_id}, '${escapeHtml(s.name)}')">📜 View History</button>
        </td>
      </tr>
    `;
  }).join('');
}

document.getElementById('att-summary-course').addEventListener('change', loadAttendanceSummary);
document.getElementById('att-summary-search').addEventListener('input', () => {
  clearTimeout(state.attendance.summarySearchTimer);
  state.attendance.summarySearchTimer = setTimeout(loadAttendanceSummary, 350);
});
document.getElementById('att-summary-clear-btn').addEventListener('click', () => {
  document.getElementById('att-summary-search').value = '';
  document.getElementById('att-summary-course').value = '';
  loadAttendanceSummary();
});

// Student Attendance History Modal
async function openAttHistoryModal(studentId, name) {
  document.getElementById('att-history-modal-title').textContent = `Attendance History — ${name}`;
  const tbody = document.getElementById('att-history-tbody');
  const summaryBox = document.getElementById('att-history-summary');
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Loading history…</td></tr>`;
  summaryBox.innerHTML = 'Loading stats…';
  document.getElementById('att-history-modal').classList.remove('hidden');

  try {
    const res = await apiFetch(`/api/attendance/history/${studentId}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Failed to load history.</td></tr>`;
      return;
    }

    const st = data.stats;
    const isLow = st.is_low_attendance;

    summaryBox.innerHTML = `
      <strong>Roll No:</strong> ${escapeHtml(data.student.roll_number)} &nbsp;|&nbsp;
      <strong>Total Classes:</strong> ${st.total_classes} &nbsp;|&nbsp;
      <strong>Present:</strong> <span style="color: var(--success); font-weight:600;">${st.present_days}</span> &nbsp;|&nbsp;
      <strong>Absent:</strong> <span style="color: var(--danger); font-weight:600;">${st.absent_days}</span> &nbsp;|&nbsp;
      <strong>Percentage:</strong> 
      <span style="font-weight: 700; color: ${isLow ? 'var(--danger)' : 'var(--success)'};">
        ${st.attendance_percentage}%
      </span>
      ${isLow ? '&nbsp;<span class="badge badge-danger-alert">⚠️ Low Attendance (&lt;75%)</span>' : ''}
    `;

    if (!data.history.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No attendance records found for this student.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.history.map((h, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${formatDate(h.date)}</td>
        <td>${escapeHtml(h.class_name)}</td>
        <td>${escapeHtml(h.course_name)}</td>
        <td>${statusBadge(h.status)}</td>
      </tr>
    `).join('');
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Network error.</td></tr>`;
  }
}

function closeAttHistoryModal() {
  document.getElementById('att-history-modal').classList.add('hidden');
}

// Sub-Tab 3: Date-wise Report
async function loadAttendanceDateReport() {
  const date = document.getElementById('att-report-date').value;
  const courseId = document.getElementById('att-report-course').value;

  if (!date) return;

  const tbody = document.getElementById('att-report-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Generating report for ${date}…</td></tr>`;

  const params = new URLSearchParams({ date });
  if (courseId) params.set('course_id', courseId);

  try {
    const res = await apiFetch(`/api/attendance/report-by-date?${params}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Failed to generate report.</td></tr>`;
      return;
    }

    const s = data.summary;
    document.getElementById('rep-total').textContent = s.total;
    document.getElementById('rep-present').textContent = s.present;
    document.getElementById('rep-absent').textContent = s.absent;
    document.getElementById('rep-percentage').textContent = `${s.present_percentage}%`;
    document.getElementById('att-report-stats-grid').classList.remove('hidden');

    if (!data.records.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No attendance recorded on ${date}.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.records.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><code>${escapeHtml(r.roll_number)}</code></td>
        <td><strong>${escapeHtml(r.student_name)}</strong></td>
        <td>${escapeHtml(r.course_name)}</td>
        <td>${escapeHtml(r.class_name)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join('');
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Network error.</td></tr>`;
  }
}

document.getElementById('att-report-btn').addEventListener('click', loadAttendanceDateReport);

// ================================================================
// 12. STUDENT ACCOUNT MANAGEMENT MODAL (ADMIN)
// ================================================================
let currentAccountStudentId = null;
let currentAccountActive = false;

function showSamAlert(msg, type = 'error') {
  const el = document.getElementById('sam-alert');
  if (!el) return;
  el.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function hideSamAlert() {
  const el = document.getElementById('sam-alert');
  if (el) el.classList.add('hidden');
}

async function openStudentAccountModal(id, name, roll) {
  currentAccountStudentId = id;
  hideSamAlert();
  document.getElementById('sam-student-title').textContent = `Account: ${name} (${roll})`;
  document.getElementById('student-account-modal').classList.remove('hidden');

  document.getElementById('sam-status-badge').innerHTML = '<span class="badge badge-inactive">Loading…</span>';
  document.getElementById('sam-email').textContent = '—';
  document.getElementById('sam-last-login').textContent = '—';
  document.getElementById('sam-toggle-box').classList.add('hidden');
  document.getElementById('sam-reset-box').classList.add('hidden');
  document.getElementById('sam-create-box').classList.add('hidden');

  try {
    const res = await apiFetch(`/api/students/${id}/account`);
    const data = await res.json();
    if (!data.success) {
      showSamAlert(data.message || 'Failed to load account details.', 'error');
      return;
    }

    if (!data.account) {
      document.getElementById('sam-status-badge').innerHTML = '<span class="badge badge-inactive">No Account</span>';
      document.getElementById('sam-create-box').classList.remove('hidden');
      return;
    }

    const acc = data.account;
    currentAccountActive = Boolean(acc.is_active);
    document.getElementById('sam-status-badge').innerHTML = acc.is_active
      ? '<span class="badge badge-active">Active</span>'
      : '<span class="badge badge-inactive">Deactivated</span>';
    document.getElementById('sam-email').textContent = acc.email || '—';
    document.getElementById('sam-last-login').textContent = acc.last_login
      ? new Date(acc.last_login).toLocaleString('en-IN')
      : 'Never logged in';

    const toggleBtn = document.getElementById('sam-toggle-btn');
    if (acc.is_active) {
      toggleBtn.className = 'btn btn-sm btn-danger';
      toggleBtn.textContent = 'Deactivate Account';
    } else {
      toggleBtn.className = 'btn btn-sm btn-primary';
      toggleBtn.textContent = 'Activate Account';
    }

    document.getElementById('sam-toggle-box').classList.remove('hidden');
    document.getElementById('sam-reset-box').classList.remove('hidden');
  } catch (err) {
    showSamAlert('Failed to communicate with the server.', 'error');
  }
}

function closeStudentAccountModal() {
  document.getElementById('student-account-modal').classList.add('hidden');
  currentAccountStudentId = null;
}

document.getElementById('sam-toggle-btn')?.addEventListener('click', async () => {
  if (!currentAccountStudentId) return;
  const newStatus = !currentAccountActive;
  try {
    const res = await apiFetch(`/api/students/${currentAccountStudentId}/account/toggle-status`, {
      method: 'POST',
      body: JSON.stringify({ is_active: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      showSamAlert(data.message, 'success');
      currentAccountActive = newStatus;
      document.getElementById('sam-status-badge').innerHTML = newStatus
        ? '<span class="badge badge-active">Active</span>'
        : '<span class="badge badge-inactive">Deactivated</span>';
      const toggleBtn = document.getElementById('sam-toggle-btn');
      toggleBtn.className = newStatus ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
      toggleBtn.textContent = newStatus ? 'Deactivate Account' : 'Activate Account';
    } else {
      showSamAlert(data.message || 'Failed to update account status.', 'error');
    }
  } catch (_) {
    showSamAlert('Network error updating status.', 'error');
  }
});

document.getElementById('sam-reset-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentAccountStudentId) return;
  const newPass = document.getElementById('sam-new-password').value.trim();
  if (newPass.length < 6) {
    showSamAlert('Password must be at least 6 characters.', 'error');
    return;
  }
  const btn = document.getElementById('sam-reset-btn');
  btn.disabled = true;
  btn.textContent = 'Resetting…';
  try {
    const res = await apiFetch(`/api/students/${currentAccountStudentId}/account/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPass }),
    });
    const data = await res.json();
    if (data.success) {
      showSamAlert(data.message, 'success');
      document.getElementById('sam-new-password').value = '';
    } else {
      showSamAlert(data.message || 'Failed to reset password.', 'error');
    }
  } catch (_) {
    showSamAlert('Network error resetting password.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reset Password';
  }
});

document.getElementById('sam-create-btn')?.addEventListener('click', async () => {
  if (!currentAccountStudentId) return;
  const btn = document.getElementById('sam-create-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const res = await apiFetch(`/api/students/${currentAccountStudentId}/account/create`, {
      method: 'POST',
      body: JSON.stringify({ initial_password: 'Student@123' }),
    });
    const data = await res.json();
    if (data.success) {
      showSamAlert(data.message, 'success');
      const title = document.getElementById('sam-student-title').textContent.replace('Account: ', '');
      openStudentAccountModal(currentAccountStudentId, title, '');
    } else {
      showSamAlert(data.message || 'Failed to create account.', 'error');
    }
  } catch (_) {
    showSamAlert('Network error creating account.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Portal Account (Default: Student@123)';
  }
});

// ================================================================
// 13. SIDEBAR TOGGLE (mobile)
// ================================================================
document.getElementById('hamburger-btn').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
});

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.section);
  });
});

// ================================================================
// 14. INITIALISE
// ================================================================
(async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;
  await loadDropdowns();
  initAttendanceSection();
  navigate('dashboard');
})();
