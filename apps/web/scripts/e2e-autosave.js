// 验证自动保存链路:POST 别名(sendBeacon 用)能真正落库
const base = 'http://localhost:3000';

(async () => {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'changeme-on-first-login' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  console.log('Login:', login.status);

  const created = await (await fetch(base + '/api/resumes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'autosave-verify', template: 'classic' }),
  })).json();
  const rid = created.resume.id;
  console.log('Created:', rid);

  // 用 POST(等价 sendBeacon 的方法)保存
  const data = JSON.stringify({
    basics: { name: '自动保存验证', email: 'auto@test.com', phone: '13900000000',
              location: '杭州', label: '后端工程师', gender: 'male', avatar: '', summary: '链路测试' },
    summary: '<p>这条数据通过 POST 别名写入</p>',
    work: [{ id: 'w1', company: '保存测试公司', position: '工程师',
             period: { start: '2023-01', end: '', current: true },
             description: '<ul><li>验证自动保存链路</li></ul>' }],
    education: [], projects: [], skills: [{ id: 's1', name: 'Node.js', level: 'advanced' }],
    languages: [], awards: [], certificates: [], interests: '测试',
  });

  const postRes = await fetch(base + '/api/resumes/' + rid, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: 'autosave-verify-updated', data }),
  });
  console.log('\nPOST alias status:', postRes.status, '(405 = bug 未修复)');
  const saved = (await postRes.json()).resume;
  console.log('Title:', saved.title);
  console.log('data length:', saved.data.length);

  // 用 PATCH 更新模板(模拟编辑模板)
  const patchRes = await fetch(base + '/api/resumes/' + rid, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ template: 'modern' }),
  });
  const patched = (await patchRes.json()).resume;
  console.log('\nPATCH template status:', patchRes.status, '->', patched.template);

  // 重新进入编辑器,验证数据持久化(模拟用户"返回再进入")
  const edit = await fetch(base + '/resumes/' + rid + '/edit', { headers: { cookie } });
  const html = await edit.text();
  console.log('\n=== 重新进入编辑器 ===');
  console.log('Status:', edit.status, '| bytes:', html.length);
  console.log('含"自动保存验证":', html.includes('自动保存验证'));
  console.log('含"保存测试公司":', html.includes('保存测试公司'));
  console.log('含"后端工程师":', html.includes('后端工程师'));
  console.log('含"未填写姓名"(空态 bug):', html.includes('未填写姓名'));

  // PDF 导出确认内容
  const pdf = await fetch(base + '/api/resumes/' + rid + '/pdf', { headers: { cookie } });
  const buf = Buffer.from(await pdf.arrayBuffer());
  require('fs').writeFileSync('D:\\code\\coding\\dl-resume\\verify-autosave.pdf', buf);
  console.log('\nPDF:', pdf.status, Math.round(buf.length/1024) + 'KB');

  await fetch(base + '/api/resumes/' + rid, { method: 'DELETE', headers: { cookie } });
  console.log('\nCleaned up');
})();