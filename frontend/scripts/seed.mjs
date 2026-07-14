// 给 admin 账户造演示数据（任务/倒数日/计数器/笔记/专注），让截图界面不空。
// 幂等：先按标题查重，已存在则跳过。用法：ADMIN_USER=admin ADMIN_PASS=admin node scripts/seed.mjs
const BASE = process.env.BASE_URL || 'http://localhost:5000';
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASS || 'admin';

let token = '';
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

async function req(method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: H(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

// 生成相对今天的 ISO 时间
const day = (offset, h = 9, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const date = (offset) => day(offset, 0, 0).slice(0, 10);

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const j = await r.json();
  token = j.token;
  if (!token) throw new Error('登录失败：无 token');
}

async function seedTasks() {
  const { tasks } = await req('GET', '/tasks?limit=200');
  const have = new Set((tasks || []).map((t) => t.title));
  const items = [
    { title: '完成产品需求文档评审', priority: 3, due_date: day(0, 18), is_pinned: true },
    { title: '回复客户邮件并整理反馈', priority: 2, due_date: day(0, 14) },
    { title: '准备周会汇报材料', priority: 2, due_date: day(1, 10) },
    { title: '健身：跑步 5 公里', priority: 1, due_date: day(0, 20) },
    { title: '阅读《深入理解计算机系统》第 3 章', priority: 1, due_date: day(2, 21) },
    { title: '预订下周出差机票酒店', priority: 3, due_date: day(3, 12) },
    { title: '整理本月开支记账', priority: 1, due_date: day(1, 22) },
    { title: '给团队做一次技术分享', priority: 2, due_date: day(5, 15) },
  ];
  for (const it of items) {
    if (have.has(it.title)) continue;
    const t = await req('POST', '/tasks', it);
    console.log('task+', it.title);
    // 给第一个任务加两个子任务
    if (it.title.startsWith('完成产品需求')) {
      await req('POST', '/tasks', { title: '收集各方需求', priority: 1, parent_task_id: t.id });
      await req('POST', '/tasks', { title: '编写文档初稿', priority: 2, parent_task_id: t.id });
    }
  }
  // 标记两条已完成
  const { tasks: all } = await req('GET', '/tasks?limit=200');
  for (const t of all) {
    if (['回复客户邮件并整理反馈', '整理本月开支记账'].includes(t.title) && t.status !== 'completed') {
      await req('PUT', `/tasks/${t.id}`, { status: 'completed' });
      console.log('task done', t.title);
    }
  }
}

async function seedCountdowns() {
  const { countdowns } = await req('GET', '/countdowns?limit=200');
  const have = new Set((countdowns || []).map((c) => c.title));
  const items = [
    { title: '春节', target_date: date(120), category: '节日', is_pinned: true, repeat_annually: true, color: '#f5222d' },
    { title: '项目上线', target_date: date(30), category: '工作', color: '#1890ff', note: 'v2.0 正式发布' },
    { title: '年度旅行', target_date: date(75), category: '生活', color: '#52c41a' },
    { title: '结婚纪念日', target_date: date(200), category: '纪念日', repeat_annually: true, color: '#eb2f96' },
  ];
  for (const it of items) {
    if (have.has(it.title)) continue;
    await req('POST', '/countdowns', it);
    console.log('countdown+', it.title);
  }
}

async function seedCounters() {
  const { counters } = await req('GET', '/counters?limit=200');
  const have = new Set((counters || []).map((c) => c.title));
  const items = [
    { title: '每日喝水', initial_value: 0, step: 1, target_value: 8, is_pinned: true, color: '#1890ff', note: '目标一天 8 杯', inc: 5 },
    { title: '读书打卡', initial_value: 0, step: 1, target_value: 30, color: '#722ed1', note: '每天读书天数', inc: 12 },
    { title: '俯卧撑', initial_value: 0, step: 10, target_value: null, color: '#fa8c16', inc: 4 },
  ];
  for (const it of items) {
    if (have.has(it.title)) continue;
    const { inc, ...body } = it;
    const c = await req('POST', '/counters', body);
    for (let i = 0; i < inc; i++) await req('POST', `/counters/${c.id}/increment`);
    console.log('counter+', it.title, 'x', inc);
  }
}

async function seedNotes() {
  const { notes } = await req('GET', '/notes?limit=200');
  const byTitle = new Map((notes || []).map((n) => [n.title, n]));
  // 笔记编辑器为 Markdown（Tiptap 类 Typora），content 用 Markdown 而非 HTML。
  const items = [
    {
      title: '产品设计要点',
      is_pinned: true,
      content: [
        '## 产品设计要点',
        '',
        '记录本次迭代的核心设计原则：',
        '',
        '- 信息层级清晰，减少认知负担',
        '- 操作路径不超过三步',
        '- 亮色 / 暗色主题一致性',
        '',
        '> 少即是多。',
        '',
        '| 模块 | 状态 |',
        '| --- | --- |',
        '| 任务 | 已完成 |',
        '| AI 助手 | 进行中 |',
      ].join('\n'),
    },
    {
      title: '会议纪要 - 周例会',
      content: [
        '## 周例会纪要',
        '',
        '**时间：** 本周一 10:00',
        '',
        '1. 上线时间确定为月底',
        '2. AI 助手新增多轮消歧义',
        '3. 下周开始移动端灰度',
      ].join('\n'),
    },
    {
      title: '读书笔记',
      content: [
        '## 《深入理解计算机系统》',
        '',
        '第 3 章：程序的机器级表示。',
        '',
        '关键概念：寄存器、寻址模式、条件码、栈帧。',
      ].join('\n'),
    },
  ];
  for (const it of items) {
    const exist = byTitle.get(it.title);
    if (exist) {
      await req('PUT', `/notes/${exist.id}`, { content: it.content, is_pinned: it.is_pinned });
      console.log('note~', it.title);
    } else {
      await req('POST', '/notes', it);
      console.log('note+', it.title);
    }
  }
}

async function main() {
  await login();
  await seedTasks();
  await seedCountdowns();
  await seedCounters();
  await seedNotes();
  console.log('done seeding');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
