// ★ ご自身のGASの「ウェブアプリのURL」に書き換えてください
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/【ここにGASのウェブアプリURLを貼り付け】/exec";

// GASとの通信を行う共通関数（fetch方式）
async function callGasApi(funcName, ...args) {
  try {
    // データの取得（GET）系
    if (["getMenuList", "getWeeklyRoutine", "getMonthSchedules", "getScheduleForDate"].includes(funcName)) {
      let url = `${GAS_WEB_APP_URL}?action=${funcName}`;
      if (funcName === "getMonthSchedules") {
        url += `&year=${args[0].year}&month=${args[0].month}`;
      } else if (funcName === "getScheduleForDate") {
        url += `&date=${args[0].date}`;
      }
      const res = await fetch(url);
      return await res.json();
    } 
    // データの保存・更新（POST）系
    else {
      let payload = { action: funcName };
      if (funcName === "saveWeeklyRoutine") payload.routine = args[0];
      if (funcName === "generateScheduleFromRoutine") payload.startDate = args[0].startDate;
      if (funcName === "saveSchedule") {
        payload.date = args[0].date;
        payload.theme = args[0].theme;
        payload.menuIds = args[0].menuIds;
      }

      const res = await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return await res.json();
    }
  } catch (err) {
    console.log("通信エラー:", err);
    throw err;
  }
}

let allMenus = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

window.onload = async function() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('schedDateInput');
  if (dateInput) dateInput.value = today;

  await refreshAllMenus();
  renderCalendar();
  loadScheduleForDate();
  loadManageMenuList();
};

async function refreshAllMenus() {
  try {
    const res = await callGasApi("getMenuList");
    if (Array.isArray(res)) {
      allMenus = res;
    }
  } catch (e) {
    console.log("メニュー取得エラー:", e);
  }
}

async function switchPage(page) {
  document.getElementById('navView')?.classList.toggle('active', page === 'view');
  document.getElementById('navSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('navManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('navRoutine')?.classList.toggle('active', page === 'routine');

  document.getElementById('pageView')?.classList.toggle('active', page === 'view');
  document.getElementById('pageSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('pageManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('pageRoutine')?.classList.toggle('active', page === 'routine');

  if (!allMenus || allMenus.length === 0) {
    await refreshAllMenus();
  }

  if (page === 'view') {
    renderCalendar();
  } else if (page === 'sched') {
    loadScheduleForDate();
  } else if (page === 'manage') {
    loadManageMenuList();
  } else if (page === 'routine') {
    loadWeeklyRoutine();
  }
}

// --- 1. カレンダー描画関数 ---
async function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
    <button onclick="changeMonth(-1)" class="tab-btn">◀ 前月</button>
    <h3 style="margin:0;">${currentYear}年${currentMonth}月</h3>
    <button onclick="changeMonth(1)" class="tab-btn">翌月 ▶</button>
  </div>`;

  html += `<div class="calendar-grid">`;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  days.forEach(d => { html += `<div class="calendar-header">${d}</div>`; });

  const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="calendar-cell" style="background:#fff; border:none; cursor:default;"></div>`;
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    html += `<div class="calendar-cell" onclick="jumpToSched('${dateStr}')">
      <div style="font-weight:bold; font-size:0.85rem;">${day}</div>
      <div id="cal-cell-${dateStr}" style="font-size:0.7rem; color:#2563eb; overflow:hidden; max-height:28px;"></div>
    </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;

  try {
    const monthSchedules = await callGasApi("getMonthSchedules", { year: currentYear, month: currentMonth });
    if (monthSchedules && typeof monthSchedules === 'object') {
      for (const [dateStr, data] of Object.entries(monthSchedules)) {
        const cellElem = document.getElementById(`cal-cell-${dateStr}`);
        if (cellElem && data) {
          cellElem.innerText = data.theme || data.summary || "予定あり";
        }
      }
    }
  } catch (e) {
    console.log("カレンダー詳細データの取得エラー:", e);
  }
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  else if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderCalendar();
}

function jumpToSched(dateStr) {
  const dateInput = document.getElementById('schedDateInput');
  if (dateInput) dateInput.value = dateStr;
  switchPage('sched');
  loadScheduleForDate();
}

// --- 2. 予定作成・スケジュール詳細画面 ---
async function loadScheduleForDate() {
  const dateInput = document.getElementById('schedDateInput');
  const container = document.getElementById('schedMenuList');
  if (!container || !dateInput) return;

  const targetDate = dateInput.value;
  if (!targetDate) return;

  container.innerHTML = `<div class="loading">${targetDate} の予定データを読み込み中...</div>`;

  try {
    if (!allMenus || allMenus.length === 0) await refreshAllMenus();
    
    const schedData = await callGasApi("getScheduleForDate", { date: targetDate }) || {};
    
    let html = `<div style="margin-top: 12px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">`;
    html += `<h3 style="margin-top:0; font-size:1rem; color:#1e293b;">📝 ${targetDate} のメニュー編集</h3>`;
    
    html += `<div style="margin-bottom:10px;">
      <label style="font-size:0.85rem; font-weight:bold;">練習テーマ:</label>
      <input type="text" id="schedThemeInput" class="form-control" value="${schedData.theme || ''}" placeholder="例: フットワーク強化">
    </div>`;

    html += `<label style="font-size:0.85rem; font-weight:bold; display:block; margin-bottom:6px;">実施メニュー選択:</label>`;
    html += `<div style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto; background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">`;
    
    const assignedIds = schedData.menuIds || [];
    allMenus.forEach(m => {
      const isChecked = assignedIds.includes(m.id) ? 'checked' : '';
      html += `
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
          <input type="checkbox" value="${m.id}" class="sched-menu-checkbox" ${isChecked} style="width: 16px; height: 16px;">
          <span><strong>${m.name}</strong> <span style="color: #64748b; font-size: 0.8rem;">(${m.category})</span></span>
        </label>
      `;
    });
    html += `</div>`;

    html += `<button type="button" class="btn-submit" style="margin-top: 14px; background-color: #2563eb;" onclick="saveScheduleForDate('${targetDate}')">💾 この日の予定を保存</button>`;
    html += `</div>`;

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="error" style="color:red;">予定データの読み込みに失敗しました</div>';
  }
}

async function saveScheduleForDate(dateStr) {
  const theme = document.getElementById('schedThemeInput')?.value || "";
  const checkboxes = document.querySelectorAll('.sched-menu-checkbox:checked');
  let menuIds = [];
  checkboxes.forEach(cb => menuIds.push(cb.value));

  try {
    const res = await callGasApi("saveSchedule", { date: dateStr, theme: theme, menuIds: menuIds });
    if (res && res.status === "success") {
      alert(`${dateStr} の予定を保存しました！`);
      renderCalendar();
    } else {
      alert("保存に失敗しました。");
    }
  } catch (e) {
    alert("通信エラーが発生しました。");
  }
}

// --- 3. メニュー管理画面 ---
async function loadManageMenuList() {
  const container = document.getElementById('manageMenuContainer');
  if (!container) return;

  if (!allMenus || allMenus.length === 0) {
    await refreshAllMenus();
  }

  if (!allMenus || allMenus.length === 0) {
    container.innerHTML = '<p style="color:#64748b;">メニューが登録されていません。</p>';
    return;
  }

  let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
  allMenus.forEach(m => {
    html += `<div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0; border-radius:6px;">
      <strong>${m.name}</strong> <span style="color:#64748b; font-size:0.8rem;">(ID: ${m.id} / カテゴリ: ${m.category})</span>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

// --- 4. 週間ルーティン設定画面 ---
let weeklyRoutineData = {};

async function loadWeeklyRoutine() {
  const container = document.getElementById('routineContentContainer');
  const tabContainer = document.getElementById('routineTabContainer');
  if (!tabContainer || !container) return;

  tabContainer.innerHTML = '';
  container.innerHTML = '<div class="loading">ルーティン情報を読み込み中...</div>';

  try {
    if (!allMenus || allMenus.length === 0) {
      await refreshAllMenus();
    }
    weeklyRoutineData = await callGasApi("getWeeklyRoutine") || {};
    renderRoutineEditor();
  } catch (e) {
    container.innerHTML = '<div class="error">ルーティン情報の読み込みに失敗しました</div>';
  }
}

const daysOfWeek = ["月", "火", "水", "木", "金", "土", "日"];

function renderRoutineEditor() {
  const tabContainer = document.getElementById('routineTabContainer');
  const container = document.getElementById('routineContentContainer');
  if (!tabContainer || !container) return;

  tabContainer.innerHTML = '';
  container.innerHTML = '';

  daysOfWeek.forEach((day, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
    tabBtn.innerText = `${day}曜日`;
    tabBtn.onclick = () => switchRoutineTab(day);
    tabBtn.id = `routine-tab-${day}`;
    tabContainer.appendChild(tabBtn);

    const dayBox = document.createElement('div');
    dayBox.className = `menu-group ${index === 0 ? 'active' : ''}`;
    dayBox.id = `routine-group-${day}`;

    let assignedIds = weeklyRoutineData[day] || [];

    let html = `<h3 style="font-size: 1rem; margin-bottom: 10px; color: #1e293b;">${day}曜日の実行メニュー選択</h3>`;
    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;

    allMenus.forEach(m => {
      const isChecked = assignedIds.includes(m.id) ? 'checked' : '';
      html += `
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; background: #fff; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
          <input type="checkbox" value="${m.id}" data-day="${day}" class="routine-checkbox-${day}" ${isChecked} style="width: 18px; height: 18px;">
          <span><strong>${m.name}</strong> <span style="color: #94a3b8; font-size: 0.8rem;">(${m.id} / ${m.category})</span></span>
        </label>
      `;
    });
    html += `</div>`;
    dayBox.innerHTML = html;
    container.appendChild(dayBox);
  });

  const today = new Date();
  const dayNum = today.getDay();
  const diffToMonday = today.getDate() - dayNum + (dayNum === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diffToMonday));
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  const targetDateInput = document.getElementById('routineTargetDate');
  if (targetDateInput && !targetDateInput.value) {
    targetDateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

function switchRoutineTab(day) {
  daysOfWeek.forEach(d => {
    document.getElementById(`routine-tab-${d}`)?.classList.toggle('active', d === day);
    document.getElementById(`routine-group-${d}`)?.classList.toggle('active', d === day);
  });
}

async function saveWeeklyRoutineData() {
  let newRoutine = {};
  daysOfWeek.forEach(day => {
    const checkboxes = document.querySelectorAll(`.routine-checkbox-${day}:checked`);
    let ids = [];
    checkboxes.forEach(cb => ids.push(cb.value));
    newRoutine[day] = ids;
  });

  try {
    const res = await callGasApi("saveWeeklyRoutine", newRoutine);
    if (res && res.status === "success") {
      alert("週間ルーティン設定を保存しました！");
    } else {
      alert("保存に失敗しました。");
    }
  } catch (e) {
    alert("通信エラーが発生しました。");
  }
}

async function handleGenerateRoutine() {
  const targetDate = document.getElementById('routineTargetDate').value;
  if (!targetDate) {
    alert("対象の月曜日を選択してください。");
    return;
  }

  if (!confirm(`${targetDate} の週（月〜日）のスケジュールをルーティンから一括生成しますか？\n(すでに存在する日のスケジュールは重複して追加されません)`)) {
    return;
  }

  try {
    const res = await callGasApi("generateScheduleFromRoutine", { startDate: targetDate });
    if (res && res.status === "success") {
      alert(`スケジュールの一括生成が完了しました！（新規追加件数: ${res.count}件）`);
      renderCalendar();
    } else {
      alert("エラー: " + (res?.message || "不明なエラー"));
    }
  } catch (e) {
    alert("一括生成中に通信エラーが発生しました。");
  }
}
