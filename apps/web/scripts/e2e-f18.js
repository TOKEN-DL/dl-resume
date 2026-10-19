// F18 E2E: 加密 + 数据库 dump
const base = 'http://localhost:3000';
const { execSync } = require('child_process');

(async () => {
  const loginRes = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'changeme-on-first-login' }),
  });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  console.log('Login:', loginRes.status);

  const createRes = await fetch(base + '/api/resumes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'F18-enc-test', template: 'modern' }),
  });
  const created = (await createRes.json()).resume;
  console.log('Created:', created.id, 'dataLen:', created.data.length);

  const patchBody = JSON.stringify({
    data: JSON.stringify({
      basics: { name: 'zhang-miji', email: 'a@b.com' },
      summary: '<p>top secret work content</p>',
    }),
  });
  const patchRes = await fetch(base + '/api/resumes/' + created.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: patchBody,
  });
  const patched = (await patchRes.json()).resume;
  console.log('PATCH status:', patchRes.status, 'dataLen:', patched.data.length);
  console.log('API response contains plaintext:', patched.data.includes('top secret work content'));

  const listRes = await fetch(base + '/api/resumes', { headers: { cookie } });
  const list = (await listRes.json()).resumes;
  const found = list.find(r => r.id === created.id);
  console.log('GET contains plaintext:', found.data.includes('top secret work content'));

  const dbPath = 'D:\\code\\coding\\dl-resume\\apps\\web\\prisma\\dev.db';
  try {
    const out = execSync(`sqlite3.exe "${dbPath}" "SELECT data FROM resumes WHERE id='${created.id}'"`, { encoding: 'utf8' });
    console.log('\n=== DB data column ===');
    console.log(out.trim());
    console.log('DB has plaintext secret:', out.includes('top secret'));
    console.log('DB starts with v1.enc.:', /^v1\.enc:/.test(out));
  } catch (e) {
    console.log('sqlite3 failed:', e.message.slice(0, 200));
  }

  const delRes = await fetch(base + '/api/resumes/' + created.id, { method: 'DELETE', headers: { cookie } });
  console.log('Delete status:', delRes.status);
})();