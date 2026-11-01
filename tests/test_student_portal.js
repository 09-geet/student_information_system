const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {}
        const setCookie = res.headers['set-cookie'];
        let cookie = null;
        if (setCookie) {
          const sidCookie = setCookie.find((c) => c.startsWith('sis.sid='));
          if (sidCookie) {
            cookie = sidCookie.split(';')[0];
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie,
          data: json || body,
        });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? '- ' + details : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING STUDENT INFORMATION SYSTEM TEST SUITE');
  console.log('======================================================\n');

  let studentCookie = null;
  let adminCookie = null;

  // ------------------------------------------------------------------
  // TEST 1: Unauthenticated access to protected routes
  // ------------------------------------------------------------------
  console.log('--- 1. Testing Unauthenticated Access Protection ---');
  {
    const res1 = await request({ path: '/api/student/me', method: 'GET' });
    assert(res1.status === 401, 'GET /api/student/me returns 401 when not logged in');

    const res2 = await request({ path: '/api/students', method: 'GET' });
    assert(res2.status === 401, 'GET /api/students returns 401 for admin route when not logged in');
  }

  // ------------------------------------------------------------------
  // TEST 2: Student Login with invalid credentials
  // ------------------------------------------------------------------
  console.log('\n--- 2. Testing Invalid Student Login ---');
  {
    const res = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'nonexistent@test.edu', password: 'WrongPassword' }
    );
    assert(res.status === 401, 'Invalid email returns 401 Unauthorized');
    assert(
      res.data && res.data.message.includes('Invalid credentials'),
      'Generic error message returned (anti-enumeration)'
    );

    const res2 = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'CS2024102', password: 'WrongPassword' }
    );
    assert(res2.status === 401, 'Invalid password returns 401 Unauthorized');
  }

  // ------------------------------------------------------------------
  // TEST 3: Student Login with Email
  // ------------------------------------------------------------------
  console.log('\n--- 3. Testing Student Login via Email ---');
  {
    const res = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'priya@test.edu', password: 'Student@123' }
    );
    assert(res.status === 200, 'Student login via email returns 200 OK');
    assert(res.data && res.data.success === true, 'Response indicates success');
    assert(res.data.student && res.data.student.rollNumber === 'CS2024102', 'Correct student returned (Priya Patel)');
    assert(!res.data.student.password_hash, 'Password hash is NOT exposed in response');
    assert(Boolean(res.cookie), 'Session cookie sis.sid received');
    studentCookie = res.cookie;
  }

  // ------------------------------------------------------------------
  // TEST 4: Student Login with Roll Number
  // ------------------------------------------------------------------
  console.log('\n--- 4. Testing Student Login via Roll Number ---');
  {
    const res = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'CS2024102', password: 'Student@123' }
    );
    assert(res.status === 200, 'Student login via Roll Number returns 200 OK');
    assert(res.data && res.data.student.name === 'Priya Patel', 'Returns Priya Patel');
  }

  // ------------------------------------------------------------------
  // TEST 5: Verify Student Session & Auth me
  // ------------------------------------------------------------------
  console.log('\n--- 5. Testing Student Session Verification (/api/auth/me) ---');
  {
    const res = await request({
      path: '/api/auth/me',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(res.status === 200, 'GET /api/auth/me returns 200');
    assert(res.data && res.data.role === 'student', 'Session role is correctly identified as "student"');
    assert(res.data.student && res.data.student.rollNumber === 'CS2024102', 'Student identity matches');
  }

  // ------------------------------------------------------------------
  // TEST 6: Student Portal Endpoints (Scoped to Priya)
  // ------------------------------------------------------------------
  console.log('\n--- 6. Testing Student Portal Endpoints ---');
  {
    // Profile
    const meRes = await request({
      path: '/api/student/me',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(meRes.status === 200, 'GET /api/student/me returns 200');
    assert(meRes.data.data.roll_number === 'CS2024102', 'Profile has correct roll number');
    assert(!meRes.data.data.password_hash, 'No password hash in profile');

    // Attendance
    const attRes = await request({
      path: '/api/student/attendance',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(attRes.status === 200, 'GET /api/student/attendance returns 200');
    assert('attendance_percentage' in attRes.data.data.summary, 'Attendance summary contains percentage');
    assert('is_low_attendance' in attRes.data.data.summary, 'Attendance summary flags <75% (is_low_attendance)');
    assert(Array.isArray(attRes.data.data.history), 'Attendance records array returned');

    // Fees
    const feeRes = await request({
      path: '/api/student/fees',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(feeRes.status === 200, 'GET /api/student/fees returns 200');
    assert(feeRes.data.data.ledger !== undefined, 'Fee ledger object present');
    assert(Array.isArray(feeRes.data.data.payments), 'Fee payments array present');

    // Notifications / Announcements
    const notifRes = await request({
      path: '/api/student/notifications',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(notifRes.status === 200, 'GET /api/student/notifications returns 200');
    assert(Array.isArray(notifRes.data.data), 'Announcements list returned');
    assert(notifRes.data.data.length > 0, 'Seed announcements present');

    // Results (Graceful empty state)
    const resRes = await request({
      path: '/api/student/results',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(resRes.status === 200, 'GET /api/student/results returns 200');
    assert(resRes.data.data.length === 0, 'Results empty state handled gracefully');
    assert(resRes.data.hasResults === false, 'Results marked as not yet published');
  }

  // ------------------------------------------------------------------
  // TEST 7: Cross-Student Authorization & Privacy (Strict Session Scoping)
  // ------------------------------------------------------------------
  console.log('\n--- 7. Testing Cross-Student Privacy & Injection Resistance ---');
  {
    // Try passing another student's ID (e.g. ID 1) in query params
    const injectRes = await request({
      path: '/api/student/me?student_id=1&id=1',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(injectRes.status === 200, 'Query executed');
    assert(
      injectRes.data.data.id === 5 && injectRes.data.data.roll_number === 'CS2024102',
      'Server strictly derives student ID from session, completely ignoring client-supplied IDs'
    );
  }

  // ------------------------------------------------------------------
  // TEST 8: Role-Based Access Control (Student cannot access Admin APIs)
  // ------------------------------------------------------------------
  console.log('\n--- 8. Testing RBAC Protection (Student Accessing Admin APIs) ---');
  {
    const res1 = await request({
      path: '/api/students',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(res1.status === 403, 'Student blocked from GET /api/students with 403 Forbidden');

    const res2 = await request(
      {
        path: '/api/students',
        method: 'POST',
        headers: { Cookie: studentCookie },
      },
      { name: 'Hacker', roll_number: 'HACK99', email: 'hack@test.com' }
    );
    assert(res2.status === 403, 'Student blocked from POST /api/students with 403 Forbidden');

    const res3 = await request({
      path: '/api/fees',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(res3.status === 403, 'Student blocked from GET /api/fees with 403 Forbidden');

    const res4 = await request({
      path: '/api/attendance/summary',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(res4.status === 403, 'Student blocked from GET /api/attendance/summary with 403 Forbidden');
  }

  // ------------------------------------------------------------------
  // TEST 9: Admin Login & Account Management Flow
  // ------------------------------------------------------------------
  console.log('\n--- 9. Testing Admin Authentication & Student Account Controls ---');
  {
    const adminLogin = await request(
      { path: '/api/auth/login', method: 'POST' },
      { username: 'admin', password: 'Admin@123' }
    );
    assert(adminLogin.status === 200, 'Admin login succeeds with 200 OK');
    adminCookie = adminLogin.cookie;
    assert(Boolean(adminCookie), 'Admin session cookie received');

    // Get Priya's account details (ID 5)
    const accRes = await request({
      path: '/api/students/5/account',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert(accRes.status === 200, 'Admin GET /api/students/5/account returns 200');
    assert(accRes.data.account.is_active === 1, 'Priya account is initially active');

    // Deactivate Priya's account
    const deactRes = await request(
      {
        path: '/api/students/5/account/toggle-status',
        method: 'POST',
        headers: { Cookie: adminCookie },
      },
      { is_active: false }
    );
    assert(deactRes.status === 200, 'Admin deactivates Priya account');

    // Priya tries to access portal while session is active -> Real-time DB check should reject!
    const deactAccess = await request({
      path: '/api/student/me',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(
      deactAccess.status === 403,
      'Deactivated student immediate session access blocked with 403 Forbidden'
    );

    // Priya tries to log in again -> Rejected
    const deactLogin = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'priya@test.edu', password: 'Student@123' }
    );
    assert(deactLogin.status === 403, 'Deactivated student login rejected with 403 Forbidden');
    assert(
      deactLogin.data.message && deactLogin.data.message.includes('deactivated'),
      'Clear deactivated account message'
    );

    // Admin re-activates Priya's account
    const reactRes = await request(
      {
        path: '/api/students/5/account/toggle-status',
        method: 'POST',
        headers: { Cookie: adminCookie },
      },
      { is_active: true }
    );
    assert(reactRes.status === 200, 'Admin re-activates Priya account');

    // Re-login student to obtain fresh session
    const relogin = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'priya@test.edu', password: 'Student@123' }
    );
    assert(relogin.status === 200, 'Re-activated student login succeeds with 200 OK');
    studentCookie = relogin.cookie;
  }

  // ------------------------------------------------------------------
  // TEST 10: Student Password Change Flow
  // ------------------------------------------------------------------
  console.log('\n--- 10. Testing Student Password Change Flow ---');
  {
    // Incorrect current password
    const failRes = await request(
      {
        path: '/api/student/change-password',
        method: 'POST',
        headers: { Cookie: studentCookie },
      },
      { current_password: 'WrongCurrentPassword', new_password: 'NewPassword@456' }
    );
    assert(failRes.status === 400, 'Change password with incorrect current password returns 400');

    // Too short new password
    const shortRes = await request(
      {
        path: '/api/student/change-password',
        method: 'POST',
        headers: { Cookie: studentCookie },
      },
      { current_password: 'Student@123', new_password: '123' }
    );
    assert(shortRes.status === 400, 'Short password rejected with 400');

    // Valid password change
    const successRes = await request(
      {
        path: '/api/student/change-password',
        method: 'POST',
        headers: { Cookie: studentCookie },
      },
      { current_password: 'Student@123', new_password: 'Priya@SecurePass99' }
    );
    assert(successRes.status === 200, 'Valid password change returns 200 OK');

    // Verify login with new password
    const newLogin = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'priya@test.edu', password: 'Priya@SecurePass99' }
    );
    if (newLogin.status !== 200) {
      console.log('    [DEBUG newLogin]', newLogin.status, newLogin.data);
    }
    assert(newLogin.status === 200, 'Login with newly changed password succeeds');
    studentCookie = newLogin.cookie;

    // Admin resets password back to Student@123 for test reproducibility
    const resetRes = await request(
      {
        path: '/api/students/5/account/reset-password',
        method: 'POST',
        headers: { Cookie: adminCookie },
      },
      { new_password: 'Student@123' }
    );
    assert(resetRes.status === 200, 'Admin resets password back to Student@123');

    // Verify login with reset password
    const resetLogin = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: 'priya@test.edu', password: 'Student@123' }
    );
    if (resetLogin.status !== 200) {
      console.log('    [DEBUG resetLogin]', resetLogin.status, resetLogin.data);
    }
    assert(resetLogin.status === 200, 'Login with reset password succeeds');
    studentCookie = resetLogin.cookie;
  }

  // ------------------------------------------------------------------
  // TEST 11: Logout Flow
  // ------------------------------------------------------------------
  console.log('\n--- 11. Testing Logout ---');
  {
    const logoutRes = await request({
      path: '/api/auth/logout',
      method: 'POST',
      headers: { Cookie: studentCookie },
    });
    assert(logoutRes.status === 200, 'Logout returns 200 OK');

    // Session is now invalidated
    const checkRes = await request({
      path: '/api/student/me',
      method: 'GET',
      headers: { Cookie: studentCookie },
    });
    assert(checkRes.status === 401, 'Logged out session returns 401 Unauthorized');
  }

  // ------------------------------------------------------------------
  // TEST 12: Admin Regression Testing (CRUD, Fees, Attendance)
  // ------------------------------------------------------------------
  console.log('\n--- 12. Testing Admin Regression (Existing Features) ---');
  {
    // Admin stats
    const statsRes = await request({
      path: '/api/students/stats',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert(statsRes.status === 200, 'Admin GET /api/students/stats returns 200');
    assert('total_students' in statsRes.data.data, 'Dashboard stats has total_students');

    // Admin students list
    const listRes = await request({
      path: '/api/students',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert(listRes.status === 200, 'Admin GET /api/students returns 200');
    assert(Array.isArray(listRes.data.data), 'Students list returned');

    // Admin fee stats & list
    const feeStats = await request({
      path: '/api/fees/stats',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert(feeStats.status === 200, 'Admin GET /api/fees/stats returns 200');

    // Admin attendance date report
    const attReport = await request({
      path: '/api/attendance/report-by-date?date=2024-10-24',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    assert(attReport.status === 200, 'Admin GET /api/attendance/report-by-date returns 200');
  }

  // ------------------------------------------------------------------
  // TEST 13: End-to-End Lifecycle & Cascade Cleanup
  // ------------------------------------------------------------------
  console.log('\n--- 13. Testing End-to-End Student Creation & Account Auto-Provisioning ---');
  {
    const roll = `TEST${Date.now().toString().slice(-6)}`;
    const email = `test.${roll.toLowerCase()}@example.com`;

    // Admin creates new student
    const createRes = await request(
      {
        path: '/api/students',
        method: 'POST',
        headers: { Cookie: adminCookie },
      },
      {
        name: 'Rohan Verma',
        roll_number: roll,
        email: email,
        phone: '9876543210',
        course_id: 1,
        department_id: 1,
        admission_date: '2024-08-01',
        status: 'active',
      }
    );
    assert(createRes.status === 201, `Admin creates student ${roll} with 201 Created`);
    const newStudentId = createRes.data.data.id;

    // Student can immediately log in with default credentials (Student@123)
    const newStudentLogin = await request(
      { path: '/api/auth/student/login', method: 'POST' },
      { identifier: roll, password: 'Student@123' }
    );
    assert(newStudentLogin.status === 200, 'Newly created student can log in with default password');
    assert(newStudentLogin.data.student.mustChangePassword === true, 'mustChangePassword flag is true');

    // Check newly created student's fee ledger
    const newStudentFee = await request({
      path: '/api/student/fees',
      method: 'GET',
      headers: { Cookie: newStudentLogin.cookie },
    });
    assert(newStudentFee.status === 200, 'New student fee ledger initialized');
    assert(newStudentFee.data.data.ledger.fee_status === 'Unpaid', 'Default fee status is Unpaid');

    // Admin cleans up created test student
    const delRes = await request({
      path: `/api/students/${newStudentId}`,
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert(delRes.status === 200, 'Admin deletes test student with cascade cleanup');
  }

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
