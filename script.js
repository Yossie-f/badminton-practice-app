// GASとの通信を行う共通関数
async function callGasApi(funcName, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(res => resolve(res))
      .withFailureHandler(err => reject(err))
      [funcName](...args);
  });
}

let allMenus = [];

window.onload = async function() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('schedDateInput');
  if (dateInput) dateInput.value = today;

  try {
    allMenus = await callGasApi("getMenuList");
    if (typeof renderSchedMenuList === 'function') renderSchedMenuList(allMenus);
    if (typeof renderCalendar === 'function') renderCalendar();
  } catch (e) {}
};

// ページ切り替え関数
function switchPage(page) {
  document.getElementById('navView')?.classList.toggle('active', page === 'view');
  document.getElementById('navSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('navManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('navRoutine')?.classList.toggle('active', page === 'routine');

  document.getElementById('pageView')?.classList.toggle('active', page === 'view');
  document.getElementById('pageSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('pageManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('pageRoutine')?.classList.toggle('active', page === 'routine');

  if (page === 'view') {
    if (typeof renderCalendar === 'function') renderCalendar();
  } else if (page === 'sched') {
    if (typeof loadScheduleForDate === 'function') loadScheduleForDate();
  } else if (page === 'manage') {
    if (typeof loadManageMenuList === 'function') loadManageMenuList();
  } else if (page === 'routine') {
    loadWeeklyRoutine();
  }
}

// 既存の基本関数（必要に応じて上書き・結合してください）
function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (container && !container.innerHTML) {
    container.innerHTML = '<p style="color:#64748b; font-size:0.9rem;">カレンダー表示エリア（既存の描画ロジックがここに紐づきます）</p>';
  }
}

function loadScheduleForDate() {}
function loadManageMenuList() {
  const container = document.getElementById('manageMenuContainer');
  if (container && allMenus.length > 0) {
    let html = '<ul style="padding-left: 20px;">';
    allMenus.forEach(m => {
      html += `<li><strong>${m.name}</strong> (${m.id} / ${m.category})</li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
  }
}
function renderSchedMenuList(menus) {}

// --- 週間ルーティン管理機能 ---
let weeklyRoutineData = {};

async function loadWeeklyRoutine() {
  const container = document.getElementById('routineContentContainer');
  const tabContainer = document.getElementById('routineTabContainer');
  if (!tabContainer || !container) return;

  tabContainer.innerHTML = '';
  container.innerHTML = '<div class="loading">ルーティン情報を読み込み中...</div>';

  try {
    if (!allMenus || allMenus.length === 0) {
      allMenus = await callGasApi("getMenuList");
    }
    weeklyRoutineData = await callGasApi("getWeeklyRoutine");
    renderRoutineEditor();
  } catch (e) {
    container.innerHTML = '<div class="error">読み込みに失敗しました</div>';
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

  // 対象月曜日の初期値セット（今日の直近の月曜日）
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
    if (res.status === "success") {
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
    if (res.status === "success") {
      alert(`スケジュールの一括生成が完了しました！（新規追加件数: ${res.count}件）`);
    } else {
      alert("エラー: " + res.message);
    }
  } catch (e) {
    alert("一括生成中に通信エラーが発生しました。");
  }
}
