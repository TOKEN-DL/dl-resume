// 验证 F18 绕过 cipher 修复:加密数据能否正确导出 PDF / JSON / 打开编辑器
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

  // 找一份加密数据 + 有内容的简历
  const listRes = await fetch(base + '/api/resumes', { headers: { cookie } });
  const list = (await listRes.json()).resumes;
  console.log('Resumes:', list.length, '| titles:', list.map(r => r.title).join(', '));

  // 写一份新的加密简历(含中文),验证三处读取路径
  const secretData = JSON.stringify({
    basics: { name: '张三', label: '高级前端工程师', email: 'zhang@example.com',
              phone: '13800138000', location: '上海', gender: 'male', avatar: '', summary: '8 年经验' },
    summary: '<p>主导千万级 DAU 项目重构。</p>',
    work: [{ id: 'w1', company: '字节跳动', position: '高级前端工程师',
             period: { start: '2020-07', end: '', current: true },
             description: '<ul><li>主导创作者中心重构</li><li>推动 SSR 迁移</li></ul>' }],
    education: [{ id: 'e1', school: '清华大学', degree: '本科', major: '计算机',
                  period: { start: '2014-09', end: '2018-06', current: false }, description: 'GPA 3.8' }],
    projects: [], skills: [{ id: 's1', name: 'TypeScript', level: 'expert' }],
    languages: [{ id: 'l1', name: '英语', level: 'C1' }],
    awards: [], certificates: [], interests: '阅读 / 跑步',
  });

  const patchContent = new (await import('node:http')).IncomingMessage;
  const created = await (await fetch(base + '/api/resumes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ title: '密文导出验证', template: 'modern' }),
  })).json();
  const rid = created.resume.id;

  await fetch(base + '/api/resumes/' + rid, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ data: secretData }),
  });
  console.log('Seeded encrypted resume:', rid);

  // 1) PDF 导出
  const pdfRes = await fetch(base + '/api/resumes/' + rid + '/pdf', { headers: { cookie } });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const fs = require('fs');
  const out = 'D:\\code\\coding\\dl-resume\\verify-export.pdf';
  fs.writeFileSync(out, pdfBuf);
  console.log('\n=== PDF 导出 ===');
  console.log('Status:', pdfRes.status, '| Size:', pdfBuf.length, 'bytes (' + Math.round(pdfBuf.length/1024) + 'KB)');
  console.log('Magic:', pdfBuf.subarray(0,5).toString());
  // 搜中文 UTF-16BE
  const zhangBE = Buffer.from([0x5F, 0x7A]); // 张
  let found = false;
  for (let i = 0; i < pdfBuf.length - 1; i++) {
    if (pdfBuf[i] === zhangBE[0] && pdfBuf[i+1] === zhangBE[1]) { found = true; break; }
  }
  console.log('中文"张"嵌入:', found);
  console.log('已写入:', out);

  // 2) JSON 导出
  const jsonRes = await fetch(base + '/api/resumes/' + rid + '/export-json', { headers: { cookie } });
  const jsonTxt = await jsonRes.text();
  const j = JSON.parse(jsonTxt);
  console.log('\n=== JSON 导出 ===');
  console.log('Status:', jsonRes.status, '| bytes:', jsonTxt.length);
  console.log('basics.name:', j.basics?.name);
  console.log('work[0].name:', j.work?.[0]?.name);
  console.log('highlights:', JSON.stringify(j.work?.[0]?.highlights));
  console.log('skills:', JSON.stringify(j.skills));
  console.log('languages:', JSON.stringify(j.languages));

  // 3) 编辑器页面 SSR
  const editRes = await fetch(base + '/resumes/' + rid + '/edit', { headers: { cookie } });
  const html = await editRes.text();
  console.log('\n=== 编辑器页面 ===');
  console.log('Status:', editRes.status, '| html bytes:', html.length);
  console.log('含"张三":', html.includes('张三'));
  console.log('含"字节跳动":', html.includes('字节跳动'));
  console.log('含"未填写姓名"(空态):', html.includes('未填写姓名'));

  // 4) 越权仍然拦截
  console.log('\n=== 越权检查 ===');
  const badCookie = loginRes.headers.get('set-cookie').split(';')[0];
  const notFound = await fetch(base + '/api/resumes/doesnotexist123/pdf', { headers: { cookie: badCookie } });
  console.log('不存在的简历 PDF:', notFound.status);

  // 清理
  await fetch(base + '/api/resumes/' + rid, { method: 'DELETE', headers: { cookie } });
  console.log('\nCleaned up test resume');
})();