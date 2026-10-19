// F19 E2E: 账户注销级联删除
const base = 'http://localhost:3000';
const { execSync } = require('child_process');

const testEmail = 'f19-victim-' + Date.now() + '@example.com';
const testPassword = 'victimpass123';

(async () => {
  // 1. 注册测试用户
  const regRes = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword, name: 'F19Victim' }),
  });
  console.log('Register:', regRes.status);
  if (regRes.status !== 201) {
    console.log(await regRes.text());
    process.exit(1);
  }

  // 2. 登录拿 cookie
  const loginRes = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  console.log('Login:', loginRes.status);

  // 3. 创建一份简历
  const createRes = await fetch(base + '/api/resumes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'victim resume', template: 'classic' }),
  });
  const created = (await createRes.json()).resume;
  console.log('Created resume:', created.id);

  // 4. 验证数据库中存在
  const dbPath = 'D:\\code\\coding\\dl-resume\\apps\\web\\prisma\\dev.db';
  let out = execSync(`sqlite3.exe "${dbPath}" "SELECT id, email FROM users WHERE email='${testEmail}'"`, { encoding: 'utf8' }).trim();
  console.log('Before delete, user:', out);
  out = execSync(`sqlite3.exe "${dbPath}" "SELECT id, userId, title FROM resumes WHERE userId=(SELECT id FROM users WHERE email='${testEmail}')"`, { encoding: 'utf8' }).trim();
  console.log('Before delete, resume:', out);

  // 5. DELETE account 用错密码 → 403
  const badRes = await fetch(base + '/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ password: 'wrong-password', confirm: 'DELETE' }),
  });
  console.log('DELETE with wrong password:', badRes.status);

  // 6. DELETE account 用错 confirm → 400
  const badConfirmRes = await fetch(base + '/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ password: testPassword, confirm: 'yes' }),
  });
  console.log('DELETE with wrong confirm:', badConfirmRes.status);

  // 7. DELETE account 用正确密码 + confirm → 200
  const delRes = await fetch(base + '/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ password: testPassword, confirm: 'DELETE' }),
  });
  console.log('DELETE correct:', delRes.status, await delRes.text());
  const setCookie = delRes.headers.get('set-cookie') || '';
  console.log('Session cookie cleared:', setCookie.includes('dl_session=;') || setCookie.includes('Max-Age=0') || setCookie.includes('Expires=Thu, 01 Jan 1970'));

  // 8. 数据库验证 — user/resume/encryptedDek 都不存在
  out = execSync(`sqlite3.exe "${dbPath}" "SELECT COUNT(*) FROM users WHERE email='${testEmail}'"`, { encoding: 'utf8' }).trim();
  console.log('Users with email (expect 0):', out);
  out = execSync(`sqlite3.exe "${dbPath}" "SELECT COUNT(*) FROM resumes WHERE userId='${created.id.replace(/[^a-z0-9]/gi, '')}'"`, { encoding: 'utf8' }).trim();
  console.log('Resumes count for that userId (expect 0):', out);
  out = execSync(`sqlite3.exe "${dbPath}" "SELECT COUNT(*) FROM resumes WHERE title='victim resume'"`, { encoding: 'utf8' }).trim();
  console.log('Resumes with title "victim resume" (expect 0):', out);

  // 9. 用注销账户的 cookie 访问 /resumes → 401 (cookie 已清)
  const afterRes = await fetch(base + '/api/resumes', { headers: { cookie } });
  console.log('GET /api/resumes with deleted-user cookie:', afterRes.status);
})();