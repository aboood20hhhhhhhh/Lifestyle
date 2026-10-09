'use strict';

/* ============================================================
   LifeOS — كل شيء في ملف واحد
   ============================================================ */

// ===== 1) أدوات منع undefined/NaN =====
const toNum = (v, fb = null) => {
  if (v === null || v === undefined || v === '') return fb;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};
const safeDiv = (a, b) => {
  const x = toNum(a), y = toNum(b);
  if (x === null || y === null || y === 0) return null;
  return x / y;
};
const safeSum = (arr, key) => (arr || []).reduce((s, it) => s + (toNum(key ? it?.[key] : it, 0) || 0), 0);
const safeAvg = (arr, key) => {
  const nums = (arr || []).map(it => toNum(key ? it?.[key] : it, null)).filter(n => n !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};
const disp = (v, unit = '', dec = null) => {
  const n = toNum(v, null);
  if (n === null) return '—';
  const s = dec !== null ? n.toFixed(dec) : String(n);
  return unit ? `${s} ${unit}` : s;
};
const pct = (p, t) => {
  const r = safeDiv(p, t);
  return r === null ? '—' : (Math.max(0, Math.min(100, r * 100))).toFixed(0) + '%';
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Intl.DateTimeFormat('ar-EG', { weekday:'long', year:'numeric', month:'long', day:'numeric' }).format(d); } catch { return '—'; } };
const fmtTime = (d) => { try { return new Intl.DateTimeFormat('ar-EG', { hour:'2-digit', minute:'2-digit' }).format(d); } catch { return '—'; } };

// ===== 2) قاعدة البيانات =====
const DB_NAME = 'lifeos_db', DB_VER = 1;
const STORES = ['tasks','meals','water','sleep','gym','habits','expenses','measurements','events','settings'];
let db = null;

function openDB() {
  return new Promise((res, rej) => {
    if (db) return res(db);
    if (!('indexedDB' in window)) return rej(new Error('IndexedDB غير مدعوم'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) {
          const store = d.createObjectStore(s, { keyPath: 'id' });
          if (s !== 'settings') store.createIndex('by_date', 'date', { unique: false });
        }
      }
    };
    req.onsuccess = () => { db = req.result; res(db); };
    req.onerror = () => rej(req.error || new Error('فشل فتح قاعدة البيانات'));
  });
}

const txStore = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const dbPut = (name, rec) => wrap(txStore(name, 'readwrite').put(rec));
const dbGet = (name, key) => wrap(txStore(name).get(key));
const dbAll = (name) => wrap(txStore(name).getAll());
const dbDel = (name, key) => wrap(txStore(name, 'readwrite').delete(key));
const dbClear = (name) => wrap(txStore(name, 'readwrite').clear());

// ===== 3) الإعدادات =====
const LS_KEY = 'lifeos_settings';
const DEF_SETTINGS = {
  theme: 'dark', calorieGoal: 2100, proteinGoal: 140,
  carbGoal: 220, fatGoal: 70, waterGoalMl: 3000,
  sleepGoalHours: 7.5, currency: 'EGP', weeklyBudget: 0,
};
let settings = { ...DEF_SETTINGS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) settings = { ...DEF_SETTINGS, ...JSON.parse(raw) };
  } catch { settings = { ...DEF_SETTINGS }; }
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch {}
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
  const b = document.getElementById('theme-btn');
  if (b) b.textContent = settings.theme === 'dark' ? '☀️' : '🌙';
}

// ===== 4) تنبيهات =====
function toast(msg, type = 'success') {
  const c = document.getElementById('toasts'); if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = String(msg);
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 3000);
}

// ===== 5) الصفحات =====
const pages = {};

// ---------- لوحة التحكم ----------
pages.dashboard = async () => {
  const [meals, water, sleep, tasks, expenses, gym] = await Promise.all([
    dbAll('meals'), dbAll('water'), dbAll('sleep'), dbAll('tasks'), dbAll('expenses'), dbAll('gym'),
  ]);
  const t = today();
  const todayMeals = meals.filter(m => m.date === t);
  const todayWater = water.filter(w => w.date === t);
  const todaySleep = sleep.filter(s => (s.date || '') === t);
  const todayExp   = expenses.filter(e => e.date === t);

  const cal = safeSum(todayMeals, 'calories');
  const prot = safeSum(todayMeals, 'protein');
  const waterMl = safeSum(todayWater, 'amountMl');
  const sleepH = safeSum(todaySleep, 'hours');
  const exp = safeSum(todayExp.filter(e => e.type === 'expense'), 'amount');
  const doneTasks = tasks.filter(x => x.status === 'done').length;

  return `
    <div class="card">
      <div class="card-title">📅 ${esc(fmtDate(new Date()))}</div>
      <div class="muted">${esc(fmtTime(new Date()))}</div>
    </div>
    <div class="grid">
      ${card('✅ المهام', `${doneTasks} / ${tasks.length}`, pct(doneTasks, tasks.length))}
      ${card('🍽️ السعرات', disp(cal, 'سعرة'), `متبقي: ${disp(Math.max(0, (settings.calorieGoal||0) - cal), 'سعرة')}`)}
      ${card('🥩 البروتين', disp(prot, 'جم'), `الهدف: ${disp(settings.proteinGoal, 'جم')}`)}
      ${card('💧 المياه', disp(waterMl, 'مل'), pct(waterMl, settings.waterGoalMl))}
      ${card('😴 النوم', disp(sleepH, 'ساعة', 1), `الهدف: ${disp(settings.sleepGoalHours, 'ساعة')}`)}
      ${card('🏋️ الجيم', gym.filter(g => g.date === t).length ? 'تم' : 'لم يُسجَّل', '')}
      ${card('💰 مصروف اليوم', disp(exp, settings.currency), '')}
    </div>
  `;
};
const card = (title, val, sub) => `
  <div class="card">
    <div class="card-title">${esc(title)}</div>
    <div class="big">${esc(val)}</div>
    ${sub ? `<div class="muted">${esc(sub)}</div>` : ''}
  </div>`;

// ---------- المهام ----------
pages.tasks = async () => {
  const items = await dbAll('tasks');
  return `
    <div class="card">
      <div class="card-title">✅ إضافة مهمة</div>
      <form id="f-task">
        <div class="form-group"><label>العنوان</label><input name="title" required /></div>
        <div class="form-group"><label>الأولوية</label>
          <select name="priority"><option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option></select>
        </div>
        <div class="form-group"><label>تاريخ الاستحقاق</label><input name="dueDate" type="date" /></div>
        <button class="btn btn-primary">إضافة</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">المهام (${items.length})</div>
      ${items.length ? `<ul class="list">${items.map(t => `
        <li>
          <div>
            <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} data-toggle="${esc(t.id)}" style="width:auto;" />
            <strong style="${t.status === 'done' ? 'text-decoration:line-through;opacity:.6;' : ''}">${esc(t.title)}</strong>
            <div class="muted">${esc(t.priority || '')} ${t.dueDate ? '· ' + esc(t.dueDate) : ''}</div>
          </div>
          <button class="btn btn-danger" data-del="tasks:${esc(t.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('📝', 'لا توجد مهام')}
    </div>`;
};

// ---------- التغذية ----------
pages.nutrition = async () => {
  const items = await dbAll('meals');
  return `
    <div class="card">
      <div class="card-title">🍽️ تسجيل وجبة</div>
      <form id="f-meal">
        <div class="form-group"><label>الاسم</label><input name="name" required /></div>
        <div class="form-group"><label>النوع</label>
          <select name="type"><option value="breakfast">فطار</option><option value="lunch">غداء</option><option value="dinner">عشاء</option><option value="snack">سناك</option></select>
        </div>
        <div class="form-group"><label>السعرات</label><input name="calories" type="number" min="0" /></div>
        <div class="form-group"><label>البروتين (جم)</label><input name="protein" type="number" min="0" /></div>
        <div class="form-group"><label>الكربوهيدرات (جم)</label><input name="carbs" type="number" min="0" /></div>
        <div class="form-group"><label>الدهون (جم)</label><input name="fat" type="number" min="0" /></div>
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">الوجبات (${items.length})</div>
      ${items.length ? `<ul class="list">${items.map(m => `
        <li>
          <div>
            <strong>${esc(m.name)}</strong>
            <div class="muted">${disp(m.calories, 'سعرة')} · ${disp(m.protein, 'جم')} بروتين · ${esc(m.date || '')}</div>
          </div>
          <button class="btn btn-danger" data-del="meals:${esc(m.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('🍽️', 'لا توجد وجبات')}
    </div>`;
};

// ---------- المياه ----------
pages.water = async () => {
  const items = await dbAll('water');
  const total = safeSum(items.filter(w => w.date === today()), 'amountMl');
  return `
    <div class="card">
      <div class="card-title">💧 تسجيل شرب ماء</div>
      <div class="big">${disp(total, 'مل')} / ${disp(settings.waterGoalMl, 'مل')}</div>
      <div class="muted">${pct(total, settings.waterGoalMl)} من الهدف اليوم</div>
      <form id="f-water" style="margin-top:12px;">
        <div class="form-group"><label>الكمية (مل)</label><input name="amountMl" type="number" min="0" required /></div>
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" /></div>
        <button class="btn btn-primary">تسجيل</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">السجل (${items.length})</div>
      ${items.length ? `<ul class="list">${items.slice().reverse().map(w => `
        <li>
          <div><strong>${disp(w.amountMl, 'مل')}</strong><div class="muted">${esc(w.date || '')}</div></div>
          <button class="btn btn-danger" data-del="water:${esc(w.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('💧', 'لا توجد سجلات')}
    </div>`;
};

// ---------- النوم ----------
pages.sleep = async () => {
  const items = await dbAll('sleep');
  const avg = safeAvg(items, 'hours');
  return `
    <div class="card">
      <div class="card-title">😴 تسجيل نوم</div>
      <div class="muted">متوسط النوم: <strong>${disp(avg, 'ساعة', 1)}</strong></div>
      <form id="f-sleep" style="margin-top:12px;">
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" required /></div>
        <div class="form-group"><label>عدد الساعات</label><input name="hours" type="number" step="0.1" min="0" required /></div>
        <div class="form-group"><label>ملاحظات</label><input name="note" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">السجل (${items.length})</div>
      ${items.length ? `<ul class="list">${items.slice().reverse().map(s => `
        <li>
          <div><strong>${disp(s.hours, 'ساعة', 1)}</strong><div class="muted">${esc(s.date || '')} ${s.note ? '· ' + esc(s.note) : ''}</div></div>
          <button class="btn btn-danger" data-del="sleep:${esc(s.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('😴', 'لا توجد سجلات')}
    </div>`;
};

// ---------- الجيم ----------
pages.gym = async () => {
  const items = await dbAll('gym');
  return `
    <div class="card">
      <div class="card-title">🏋️ تسجيل تمرين</div>
      <form id="f-gym">
        <div class="form-group"><label>التمرين</label><input name="exercise" required /></div>
        <div class="form-group"><label>المجموعات</label><input name="sets" type="number" min="0" /></div>
        <div class="form-group"><label>التكرارات</label><input name="reps" type="number" min="0" /></div>
        <div class="form-group"><label>الوزن (كجم)</label><input name="weight" type="number" step="0.5" min="0" /></div>
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">السجل (${items.length})</div>
      ${items.length ? `<ul class="list">${items.slice().reverse().map(g => `
        <li>
          <div><strong>${esc(g.exercise)}</strong>
          <div class="muted">${disp(g.sets)}×${disp(g.reps)} @ ${disp(g.weight, 'كجم')} · ${esc(g.date || '')}</div></div>
          <button class="btn btn-danger" data-del="gym:${esc(g.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('🏋️', 'لا توجد تمارين')}
    </div>`;
};

// ---------- العادات ----------
pages.habits = async () => {
  const items = await dbAll('habits');
  return `
    <div class="card">
      <div class="card-title">🔁 إضافة عادة</div>
      <form id="f-habit">
        <div class="form-group"><label>اسم العادة</label><input name="name" required /></div>
        <div class="form-group"><label>التكرار</label>
          <select name="frequency"><option value="daily">يومي</option><option value="weekly">أسبوعي</option></select>
        </div>
        <button class="btn btn-primary">إضافة</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">العادات (${items.length})</div>
      ${items.length ? `<ul class="list">${items.map(h => `
        <li>
          <div><strong>${esc(h.name)}</strong><div class="muted">${esc(h.frequency || '')}</div></div>
          <button class="btn btn-danger" data-del="habits:${esc(h.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('🔁', 'لا توجد عادات')}
    </div>`;
};

// ---------- المصروفات ----------
pages.expenses = async () => {
  const items = await dbAll('expenses');
  const exp = safeSum(items.filter(e => e.type === 'expense'), 'amount');
  const inc = safeSum(items.filter(e => e.type === 'income'), 'amount');
  return `
    <div class="card">
      <div class="card-title">💰 إضافة معاملة</div>
      <div class="grid" style="margin-bottom:12px;">
        ${card('الدخل', disp(inc, settings.currency), '')}
        ${card('المصروفات', disp(exp, settings.currency), '')}
        ${card('الصافي', disp(inc - exp, settings.currency), '')}
      </div>
      <form id="f-exp">
        <div class="form-group"><label>النوع</label>
          <select name="type"><option value="expense">مصروف</option><option value="income">دخل</option></select>
        </div>
        <div class="form-group"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0" required /></div>
        <div class="form-group"><label>التصنيف</label><input name="category" /></div>
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">السجل (${items.length})</div>
      ${items.length ? `<ul class="list">${items.slice().reverse().map(e => `
        <li>
          <div><strong>${disp(e.amount, settings.currency)}</strong>
          <div class="muted">${esc(e.type === 'income' ? 'دخل' : 'مصروف')} ${e.category ? '· ' + esc(e.category) : ''} · ${esc(e.date || '')}</div></div>
          <button class="btn btn-danger" data-del="expenses:${esc(e.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('💰', 'لا توجد معاملات')}
    </div>`;
};

// ---------- القياسات ----------
pages.measurements = async () => {
  const items = await dbAll('measurements');
  const avgW = safeAvg(items, 'weight');
  return `
    <div class="card">
      <div class="card-title">📏 إضافة قياس</div>
      <div class="muted">متوسط الوزن: <strong>${disp(avgW, 'كجم', 1)}</strong></div>
      <form id="f-meas" style="margin-top:12px;">
        <div class="form-group"><label>الوزن (كجم)</label><input name="weight" type="number" step="0.1" /></div>
        <div class="form-group"><label>محيط الخصر (سم)</label><input name="waist" type="number" step="0.1" /></div>
        <div class="form-group"><label>التاريخ</label><input name="date" type="date" value="${today()}" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">السجل (${items.length})</div>
      ${items.length ? `<ul class="list">${items.slice().reverse().map(m => `
        <li>
          <div><strong>${disp(m.weight, 'كجم', 1)}</strong>
          <div class="muted">${m.waist ? 'خصر: ' + disp(m.waist, 'سم', 1) + ' · ' : ''}${esc(m.date || '')}</div></div>
          <button class="btn btn-danger" data-del="measurements:${esc(m.id)}">حذف</button>
        </li>`).join('')}</ul>` : emptyBox('📏', 'لا توجد قياسات')}
    </div>`;
};

// ---------- التقارير ----------
pages.reports = async () => {
  const [meals, water, sleep, expenses, tasks, gym] = await Promise.all([
    dbAll('meals'), dbAll('water'), dbAll('sleep'), dbAll('expenses'), dbAll('tasks'), dbAll('gym'),
  ]);
  const exp = safeSum(expenses.filter(e => e.type === 'expense'), 'amount');
  return `
    <div class="card">
      <div class="card-title">📊 ملخص شامل</div>
      <ul class="list">
        <li><span>إجمالي السعرات</span><strong>${disp(safeSum(meals, 'calories'), 'سعرة')}</strong></li>
        <li><span>متوسط السعرات/وجبة</span><strong>${disp(safeAvg(meals, 'calories'), 'سعرة', 0)}</strong></li>
        <li><span>إجمالي المياه</span><strong>${disp(safeSum(water, 'amountMl'), 'مل')}</strong></li>
        <li><span>إجمالي ساعات النوم</span><strong>${disp(safeSum(sleep, 'hours'), 'ساعة', 1)}</strong></li>
        <li><span>إجمالي المصروفات</span><strong>${disp(exp, settings.currency)}</strong></li>
        <li><span>المهام المنجزة</span><strong>${tasks.filter(t => t.status === 'done').length} / ${tasks.length}</strong></li>
        <li><span>تمارين مسجلة</span><strong>${gym.length}</strong></li>
      </ul>
    </div>
    <div class="card">
      <button class="btn" id="export-json">💾 نسخة احتياطية JSON</button>
      <button class="btn" id="export-csv" style="margin-right:8px;">📄 تصدير CSV</button>
    </div>`;
};

// ---------- الإعدادات ----------
pages.settings = async () => {
  return `
    <div class="card">
      <div class="card-title">⚙️ الإعدادات</div>
      <form id="f-settings">
        <div class="form-group"><label>هدف السعرات</label><input name="calorieGoal" type="number" value="${esc(settings.calorieGoal)}" /></div>
        <div class="form-group"><label>هدف البروتين (جم)</label><input name="proteinGoal" type="number" value="${esc(settings.proteinGoal)}" /></div>
        <div class="form-group"><label>هدف المياه (مل)</label><input name="waterGoalMl" type="number" value="${esc(settings.waterGoalMl)}" /></div>
        <div class="form-group"><label>هدف النوم (ساعة)</label><input name="sleepGoalHours" type="number" step="0.5" value="${esc(settings.sleepGoalHours)}" /></div>
        <div class="form-group"><label>العملة</label><input name="currency" value="${esc(settings.currency)}" /></div>
        <button class="btn btn-primary">حفظ</button>
      </form>
    </div>
    <div class="card">
      <div class="card-title">💾 النسخ الاحتياطي</div>
      <button class="btn" id="backup-btn">تنزيل نسخة احتياطية</button>
      <label class="btn" style="margin-right:8px;cursor:pointer;">
        استعادة من ملف
        <input id="restore-input" type="file" accept=".json" style="display:none;" />
      </label>
      <button class="btn btn-danger" id="wipe-btn" style="margin-right:8px;">مسح كل البيانات</button>
    </div>`;
};

// ===== 6) مساعدات =====
const emptyBox = (icon, msg) => `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(msg)}</p></div>`;

// ===== 7) Router =====
async function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/')[0];
  const fn = pages[name] || pages.dashboard;

  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${name}`));
  document.getElementById('nav')?.classList.remove('open');

  const main = document.getElementById('main');
  main.innerHTML = '<div class="empty">جارٍ التحميل...</div>';
  try {
    main.innerHTML = await fn();
    bindForms();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon">⚠️</div><p>حدث خطأ</p><p class="missing">${esc(e.message || '')}</p></div></div>`;
  }
}

// ===== 8) ربط النماذج =====
function bindForms() {
  // مهام
  document.getElementById('f-task')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = String(fd.get('title') || '').trim();
    if (!title) return toast('العنوان مطلوب', 'error');
    await dbPut('tasks', { id: uid('tsk'), title, priority: fd.get('priority'), dueDate: fd.get('dueDate') || '', status: 'todo', createdAt: new Date().toISOString() });
    toast('تمت إضافة المهمة'); route();
  });
  // وجبة
  document.getElementById('f-meal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) return toast('الاسم مطلوب', 'error');
    await dbPut('meals', {
      id: uid('meal'), name, type: fd.get('type'),
      calories: toNum(fd.get('calories')), protein: toNum(fd.get('protein')),
      carbs: toNum(fd.get('carbs')), fat: toNum(fd.get('fat')),
      date: String(fd.get('date') || today()), createdAt: new Date().toISOString(),
    });
    toast('تمت إضافة الوجبة'); route();
  });
  // مياه
  document.getElementById('f-water')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amountMl = toNum(fd.get('amountMl'));
    if (amountMl === null) return toast('كمية غير صالحة', 'error');
    await dbPut('water', { id: uid('wtr'), amountMl, date: String(fd.get('date') || today()), createdAt: new Date().toISOString() });
    toast('تم التسجيل'); route();
  });
  // نوم
  document.getElementById('f-sleep')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const hours = toNum(fd.get('hours'));
    if (hours === null) return toast('عدد ساعات غير صالح', 'error');
    await dbPut('sleep', { id: uid('slp'), hours, date: String(fd.get('date') || today()), note: String(fd.get('note') || ''), createdAt: new Date().toISOString() });
    toast('تم التسجيل'); route();
  });
  // جيم
  document.getElementById('f-gym')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const exercise = String(fd.get('exercise') || '').trim();
    if (!exercise) return toast('التمرين مطلوب', 'error');
    await dbPut('gym', {
      id: uid('gym'), exercise,
      sets: toNum(fd.get('sets')), reps: toNum(fd.get('reps')), weight: toNum(fd.get('weight')),
      date: String(fd.get('date') || today()), createdAt: new Date().toISOString(),
    });
    toast('تم التسجيل'); route();
  });
  // عادة
  document.getElementById('f-habit')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) return toast('الاسم مطلوب', 'error');
    await dbPut('habits', { id: uid('hab'), name, frequency: fd.get('frequency'), createdAt: new Date().toISOString() });
    toast('تمت الإضافة'); route();
  });
  // مصروف
  document.getElementById('f-exp')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = toNum(fd.get('amount'));
    if (amount === null) return toast('مبلغ غير صالح', 'error');
    await dbPut('expenses', {
      id: uid('exp'), type: fd.get('type'), amount,
      category: String(fd.get('category') || ''), date: String(fd.get('date') || today()),
      createdAt: new Date().toISOString(),
    });
    toast('تم الحفظ'); route();
  });
  // قياس
  document.getElementById('f-meas')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const weight = toNum(fd.get('weight'));
    const waist = toNum(fd.get('waist'));
    if (weight === null && waist === null) return toast('أدخل قيمة واحدة على الأقل', 'error');
    await dbPut('measurements', { id: uid('msr'), weight, waist, date: String(fd.get('date') || today()), createdAt: new Date().toISOString() });
    toast('تم الحفظ'); route();
  });
  // إعدادات
  document.getElementById('f-settings')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    settings.calorieGoal = toNum(fd.get('calorieGoal'), DEF_SETTINGS.calorieGoal);
    settings.proteinGoal = toNum(fd.get('proteinGoal'), DEF_SETTINGS.proteinGoal);
    settings.waterGoalMl = toNum(fd.get('waterGoalMl'), DEF_SETTINGS.waterGoalMl);
    settings.sleepGoalHours = toNum(fd.get('sleepGoalHours'), DEF_SETTINGS.sleepGoalHours);
    settings.currency = String(fd.get('currency') || 'EGP');
    saveSettings();
    toast('تم الحفظ'); route();
  });

  // أزرار الحذف
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const [store, id] = btn.dataset.del.split(':');
      if (!confirm('تأكيد الحذف؟')) return;
      await dbDel(store, id);
      toast('تم الحذف'); route();
    });
  });
  // تبديل حالة المهمة
  document.querySelectorAll('[data-toggle]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const rec = await dbGet('tasks', cb.dataset.toggle);
      if (!rec) return;
      rec.status = rec.status === 'done' ? 'todo' : 'done';
      await dbPut('tasks', rec);
      route();
    });
  });
  // نسخ احتياطي
  document.getElementById('backup-btn')?.addEventListener('click', backupAll);
  document.getElementById('restore-input')?.addEventListener('change', restoreFromFile);
  document.getElementById('wipe-btn')?.addEventListener('click', async () => {
    if (!confirm('سيتم مسح كل البيانات نهائيًا. متابعة؟')) return;
    if (!confirm('متأكد؟ لا يمكن التراجع.')) return;
    for (const s of STORES) await dbClear(s).catch(() => {});
    toast('تم مسح البيانات'); route();
  });
  document.getElementById('export-json')?.addEventListener('click', backupAll);
  document.getElementById('export-csv')?.addEventListener('click', exportCSV);
}

// ===== 9) النسخ الاحتياطي =====
async function backupAll() {
  const data = {};
  for (const s of STORES) { try { data[s] = await dbAll(s); } catch { data[s] = []; } }
  const payload = { app: 'LifeOS', version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `lifeos-backup-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('تم إنشاء النسخة الاحتياطية');
}

async function restoreFromFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || !payload.data) throw new Error('ملف غير صالح');
    if (!confirm('سيتم استبدال/دمج البيانات الحالية. متابعة؟')) return;
    for (const [store, records] of Object.entries(payload.data)) {
      if (!STORES.includes(store) || !Array.isArray(records)) continue;
      for (const rec of records) {
        if (rec && rec.id) await dbPut(store, rec).catch(() => {});
      }
    }
    toast('تمت الاستعادة بنجاح'); route();
  } catch (err) {
    toast('ملف تالف: ' + (err.message || ''), 'error');
  }
}

function exportCSV() {
  dbAll('meals').then(meals => {
    const rows = [['النوع','التاريخ','السعرات','البروتين']];
    meals.forEach(m => rows.push(['وجبة', m.date || '', m.calories ?? '', m.protein ?? '']));
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'lifeos-meals.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('تم التصدير');
  });
}

// ===== 10) الإقلاع =====
async function boot() {
  const bootEl = document.getElementById('boot');
  const msg = document.getElementById('boot-msg');
  const app = document.getElementById('app');

  try {
    msg.textContent = 'جارٍ تحميل الإعدادات...';
    loadSettings();
    applyTheme();

    msg.textContent = 'جارٍ فتح قاعدة البيانات...';
    await openDB();

    msg.textContent = 'جارٍ تحضير الواجهة...';
    bootEl.classList.add('hidden');
    app.classList.remove('hidden');

    // أحداث
    document.getElementById('menu-btn')?.addEventListener('click', () => document.getElementById('nav')?.classList.toggle('open'));
    document.getElementById('theme-btn')?.addEventListener('click', () => {
      settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
      saveSettings(); applyTheme();
    });

    const conn = document.getElementById('conn');
    const updateConn = () => { conn.classList.toggle('off', !navigator.onLine); conn.title = navigator.onLine ? 'متصل' : 'غير متصل'; };
    window.addEventListener('online', updateConn);
    window.addEventListener('offline', updateConn);
    updateConn();

    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#dashboard';
    await route();
  } catch (e) {
    console.error('فشل التهيئة:', e);
    bootEl.classList.add('hidden');
    document.body.innerHTML = `<div class="empty" style="padding:60px;text-align:center;">
      <div class="empty-icon">⚠️</div>
      <h2>تعذّر تشغيل التطبيق</h2>
      <p class="missing">${esc(e.message || 'خطأ غير معروف')}</p>
      <button class="btn btn-primary" onclick="location.reload()" style="margin-top:12px;">إعادة المحاولة</button>
    </div>`;
  }
}

// منع undefined/NaN في الواجهة كطبقة أخيرة
window.addEventListener('error', (e) => console.error('خطأ:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('رفض وعد:', e.reason));

boot();