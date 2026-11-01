/**
 * ジュニアバドミントン練習管理アプリ - フロントエンドJavaScript
 * (GASバックエンド連携対応)
 */

// 全局状態管理
let allMenus = [];           // 全練習メニューリスト
let weeklyRoutineData = {};  // 週間ルーティン設定データ
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let selectedDateStr = new Date().toISOString().split('T')[0];

const daysOfWeek = ["月", "火", "水", "木", "金", "土", "日"];

// ==========================================
// 1. Core / GAS API 連携
// ==========================================

/**
 * GASのバックエンド関数を実行する標準レスポンスラッパー
 * @param {string} funcName GAS側の関数名
 * @param  {...any} args 引数
 * @returns {Promise<any>}
 */
async function callGasApi(funcName, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(res => resolve(res))
        .withFailureHandler(err => reject(err))
        [funcName](...args);
    } else {
      // ローカル開発用モック(必要に応じて)
      console.warn(`[Local Standard Mock] ${funcName} called with:`, args);
      reject(new Error("google.script.run が利用できません"));
    }
  });
}

/**
 * ローディング表示のON/OFF切り替え
 */
function showLoading(isLoading) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = isLoading ? 'flex' : 'none';
  }
}

// ==========================================
// 2. Navigation / 画面切り替え
// ==========================================

/**
 * ページ（タブ）切り替え制御
 * @param {string} page - 'view' | 'sched' | 'manage' | 'routine'
 */
function switchPage(page) {
  // ナビゲーションボタンの active 切り替え
  document.getElementById('navView')?.classList.toggle('active', page === 'view');
  document.getElementById('navSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('navManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('navRoutine')?.classList.toggle('active', page === 'routine');

  // 画面セクションの active 切り替え
  document.getElementById('pageView')?.classList.toggle('active', page === 'view');
  document.getElementById('pageSched')?.classList.toggle('active', page === 'sched');
  document.getElementById('pageManage')?.classList.toggle('active', page === 'manage');
  document.getElementById('pageRoutine')?.classList.toggle('active', page === 'routine');

  // ページごとのデータ読み込み・描画実行
  if (page === 'view') {
    renderCalendar();
    loadDayDetail(selectedDateStr);
  } else if (page === 'sched') {
    loadScheduleForDate();
  } else if (page === 'manage') {
    loadManageMenuList();
  } else if (page === 'routine') {
    loadWeeklyRoutine();
  }
}

// ==========================================
// 3. Page 1: 今日の練習 (View / Calendar)
// ==========================================

/**
 * カレンダーの描画
 */
async function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <button type="button" class="tab-btn" onclick="changeMonth(-1)">◀ 前月</button>
      <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">${currentYear}年${currentMonth}月</h3>
      <button type="button" class="tab-btn" onclick="changeMonth(1)">翌月 ▶</button>
    </div>
    <div class="calendar-grid" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; text-align:center;">
  `;

  const headers = ["日", "月", "火", "水", "木", "金", "土"];
  headers.forEach(h => {
    html += `<div style="font-weight:bold; font-size:0.8rem; padding:4px 0; color:#64748b;">${h}</div>`;
  });

  const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();

  // 空白セル
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div style="min-height:36px; border:none;"></div>`;
  }

  // 日付セル
  const todayStr = new Date().toISOString().split('T')[0];
  for (let day = 1; day <= lastDay; day++) {
    const mm = String(currentMonth).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${currentYear}-${mm}-${dd}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDateStr;

    let style = "min-height:42px; padding:4px; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; background:#fff;";
    if (isSelected) style += " border-color:#2563eb; background:#eff6ff;";
    if (isToday) style += " font-weight:bold; color:#2563eb;";

    html += `
      <div style="${style}" onclick="selectDate('${dateStr}')">
        <div style="font-size:0.85rem;">${day}</div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * 月の変更
 */
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) {
    currentMonth = 1;
    currentYear++;
  } else if (currentMonth < 1) {
    currentMonth = 12;
    currentYear--;
  }
  renderCalendar();
}

/**
 * カレンダーでの日付選択処理
 */
function selectDate(dateStr) {
  selectedDateStr = dateStr;
  renderCalendar();
  loadDayDetail(dateStr);
}

/**
 * 選択日の練習詳細を表示
 */
async function loadDayDetail(dateStr) {
  const container = document.getElementById('dayDetailContainer');
  if (!container) return;

  container.innerHTML = `<div class="loading" style="text-align:center; padding:12px; color:#64748b;">${dateStr} のデータを取得中...</div>`;

  try {
    const data = await callGasApi("getScheduleForDate", dateStr);
    
    let html = `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h3 style="margin:0; font-size:1rem; color:#1e293b;">📌 ${dateStr} の練習</h3>
          <button type="button" class="btn-submit" style="width:auto; padding:4px 10px; font-size:0.8rem;" onclick="jumpToSched('${dateStr}')">✏️ 編集</button>
        </div>
        
        <div style="background:#fff; padding:8px; border-radius:6px; border:1px dashed #cbd5e1; margin-bottom:10px;">
          <span style="font-size:0.8rem; color:#64748b;">🎯 練習テーマ:</span>
          <div style="font-weight:bold; font-size:0.95rem; color:#0f172a;">${data && data.theme ? data.theme : '未設定'}</div>
        </div>

        <h4 style="font-size:0.85rem; margin:8px 0 4px 0; color:#475569;">メニュー一覧:</h4>
    `;

    if (data && data.items && data.items.length > 0) {
      html += `<ul style="margin:0; padding-left:18px; font-size:0.88rem; color:#334155;">`;
      data.items.forEach(item => {
        html += `<li style="margin-bottom:4px;"><strong>${item.name}</strong> (${item.duration || 0}分 / 強度:${item.intensity || '中'})</li>`;
      });
      html += `</ul>`;
    } else {
      html += `<p style="font-size:0.85rem; color:#94a3b8; margin:0;">予定されているメニューはありません。</p>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="color:#ef4444; font-size:0.85rem;">データの取得に失敗しました。</div>`;
  }
}

/**
 * 予定作成画面へジャンプ
 */
function jumpToSched(dateStr) {
  const dateInput = document.getElementById('schedDateInput');
  if (dateInput) dateInput.value = dateStr;
  switchPage('sched');
}

// ==========================================
// 4. Page 2: 予定作成 (Sched)
// ==========================================

/**
 * 予定作成画面のデータロード
 */
async function loadScheduleForDate() {
  const dateInput = document.getElementById('schedDateInput');
  const container = document.getElementById('schedMenuList');
  if (!container || !dateInput) return;

  const targetDate = dateInput.value || selectedDateStr;
  container.innerHTML = `<div class="loading" style="text-align:center; padding:12px; color:#64748b;">${targetDate} の編集用データ読込中...</div>`;

  try {
    if (!allMenus || allMenus.length === 0) {
      allMenus = await callGasApi("getMenuList");
    }
    const currentSched = await callGasApi("getScheduleForDate", targetDate);

    let themeVal = currentSched && currentSched.theme ? currentSched.theme : '';
    let assignedItems = currentSched && currentSched.items ? currentSched.items : [];
    let assignedIds = assignedItems.map(i => i.id);

    let html = `
      <div style="margin-bottom:12px;">
        <label style="font-size:0.85rem; font-weight:bold;">練習テーマ:</label>
        <input type="text" id="schedThemeInput" class="form-control" value="${themeVal}" placeholder="例: フットワークの強化">
      </div>
      <h4 style="font-size:0.9rem; margin-bottom:8px;">実施メニュー選択:</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
    `;

    allMenus.forEach(m => {
      const isChecked = assignedIds.includes(m.id) ? 'checked' : '';
      html += `
        <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.88rem;">
          <input type="checkbox" value="${m.id}" class="sched-menu-checkbox" ${isChecked} style="width:18px; height:18px;">
          <div>
            <strong>${m.name}</strong>
            <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">[${m.category}]</span>
          </div>
        </label>
      `;
    });

    html += `
      </div>
      <button type="button" class="btn-submit" style="margin-top:16px;" onclick="saveScheduleData()">💾 予定を保存</button>
    `;

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="color:#ef4444; font-size:0.85rem;">データの読み込みに失敗しました。</div>`;
  }
}

/**
 * 編集したスケジュールデータの保存
 */
async function saveScheduleData() {
  const dateInput = document.getElementById('schedDateInput');
  const themeInput = document.getElementById('schedThemeInput');
  if (!dateInput || !themeInput) return;

  const targetDate = dateInput.value;
  const theme = themeInput.value;

  const checkboxes = document.querySelectorAll('.sched-menu-checkbox:checked');
  const menuIds = Array.from(checkboxes).map(cb => cb.value);

  showLoading(true);
  try {
    const res = await callGasApi("saveSchedule", { date: targetDate, theme: theme, menuIds: menuIds });
    showLoading(false);
    if (res && res.status === "success") {
      alert("予定を保存しました！");
    } else {
      alert("保存に失敗しました。");
    }
  } catch (e) {
    showLoading(false);
    alert("通信エラーが発生しました。");
  }
}

// ==========================================
// 5. Page 3: メニュー管理 (Manage)
// ==========================================

/**
 * メニュー管理一覧の描画
 */
async function loadManageMenuList() {
  const container = document.getElementById('manageMenuContainer');
  if (!container) return;

  container.innerHTML = `<div class="loading" style="text-align:center; padding:12px; color:#64748b;">メニュー情報を取得中...</div>`;

  try {
    allMenus = await callGasApi("getMenuList");

    if (!allMenus || allMenus.length === 0) {
      container.innerHTML = `<p style="font-size:0.85rem; color:#94a3b8;">登録されているメニューはありません。</p>`;
      return;
    }

    // カテゴリごとにグループ化
    const categories = {};
    allMenus.forEach(m => {
      const cat = m.category || "その他";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(m);
    });

    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;

    for (const [catName, items] of Object.entries(categories)) {
      html += `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
          <h4 style="margin:0 0 8px 0; font-size:0.9rem; color:#1e293b; border-bottom:2px solid #cbd5e1; padding-bottom:4px;">📂 ${catName}</h4>
          <div style="display:flex; flex-direction:column; gap:6px;">
      `;

      items.forEach(m => {
        html += `
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-size:0.85rem;">
            <div style="font-weight:bold; color:#0f172a;">${m.name} <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(ID: ${m.id})</span></div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">強度: ${m.intensity || '中'} | 目安時間: ${m.duration || 15}分</div>
          </div>
        `;
      });

      html += `</div></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="color:#ef4444; font-size:0.85rem;">メニュー情報の読み込みに失敗しました。</div>`;
  }
}

// ==========================================
// 6. Page 4: 週間ルーティン設定 (Routine)
// ==========================================

/**
 * 週間ルーティン設定画面の初期化・データ読込
 */
async function loadWeeklyRoutine() {
  const container = document.getElementById('routineContentContainer');
  const tabContainer = document.getElementById('routineTabContainer');
  if (!tabContainer || !container) return;

  tabContainer.innerHTML = '';
  container.innerHTML = '<div class="loading" style="text-align:center; padding:12px; color:#64748b;">ルーティン情報を読み込み中...</div>';

  try {
    if (!allMenus || allMenus.length === 0) {
      allMenus = await callGasApi("getMenuList");
    }
    weeklyRoutineData = await callGasApi("getWeeklyRoutine");
    renderRoutineEditor();
  } catch (e) {
    container.innerHTML = '<div style="color:#ef4444; font-size:0.85rem;">ルーティン情報の読み込みに失敗しました。</div>';
  }
}

/**
 * ルーティン編集UI（タブ＋各曜日のメニューチェックボックス）のレンダリング
 */
function renderRoutineEditor() {
  const tabContainer = document.getElementById('routineTabContainer');
  const container = document.getElementById('routineContentContainer');
  if (!tabContainer || !container) return;

  tabContainer.innerHTML = '';
  container.innerHTML = '';

  daysOfWeek.forEach((day, index) => {
    // 1. タブボタン作成
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
    tabBtn.innerText = `${day}曜日`;
    tabBtn.onclick = () => switchRoutineTab(day);
    tabBtn.id = `routine-tab-${day}`;
    tabContainer.appendChild(tabBtn);

    // 2. 曜日ごとのコンテンツパネル作成
    const dayBox = document.createElement('div');
    dayBox.className = `menu-group ${index === 0 ? 'active' : ''}`;
    dayBox.id = `routine-group-${day}`;

    let assignedIds = weeklyRoutineData[day] || [];

    let html = `<h3 style="font-size:0.95rem; margin-bottom:10px; color:#1e293b;">${day}曜日のデフォルト練習メニュー</h3>`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;

    allMenus.forEach(m => {
      const isChecked = assignedIds.includes(m.id) ? 'checked' : '';
      html += `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.88rem; background:#fff; padding:8px; border:1px solid #e2e8f0; border-radius:6px;">
          <input type="checkbox" value="${m.id}" data-day="${day}" class="routine-checkbox-${day}" ${isChecked} style="width:18px; height:18px;">
          <span><strong>${m.name}</strong> <span style="color:#94a3b8; font-size:0.78rem;">(${m.id} / ${m.category})</span></span>
        </label>
      `;
    });
    html += `</div>`;
    dayBox.innerHTML = html;
    container.appendChild(dayBox);
  });

  // 対象週の月曜日のデフォルト設定（直近の月曜日）
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

/**
 * 曜日タブ切り替え
 */
function switchRoutineTab(day) {
  daysOfWeek.forEach(d => {
    document.getElementById(`routine-tab-${d}`)?.classList.toggle('active', d === day);
    document.getElementById(`routine-group-${d}`)?.classList.toggle('active', d === day);
  });
}

/**
 * 週間ルーティン設定の保存処理
 */
async function saveWeeklyRoutineData() {
  let newRoutine = {};
  daysOfWeek.forEach(day => {
    const checkboxes = document.querySelectorAll(`.routine-checkbox-${day}:checked`);
    let ids = Array.from(checkboxes).map(cb => cb.value);
    newRoutine[day] = ids;
  });

  showLoading(true);
  try {
    const res = await callGasApi("saveWeeklyRoutine", newRoutine);
    showLoading(false);
    if (res && res.status === "success") {
      alert("週間ルーティン設定を保存しました！");
    } else {
      alert("保存に失敗しました。");
    }
  } catch (e) {
    showLoading(false);
    alert("通信エラーが発生しました。");
  }
}

/**
 * 対象週のルーティン一括生成ハンドラ
 */
async function handleGenerateRoutine() {
  const targetDateInput = document.getElementById('routineTargetDate');
  if (!targetDateInput || !targetDateInput.value) {
    alert("対象の月曜日を選択してください。");
    return;
  }

  const targetDate = targetDateInput.value;

  if (!confirm(`${targetDate} の週（月〜日）のスケジュールをルーティンから一括生成しますか？\n(すでに存在する日のスケジュールは上書き・重複されません)`)) {
    return;
  }

  showLoading(true);
  try {
    const res = await callGasApi("generateScheduleFromRoutine", { startDate: targetDate });
    showLoading(false);
    if (res && res.status === "success") {
      alert(`スケジュールの一括生成が完了しました！（新規追加件数: ${res.count || 0}件）`);
      // 今日の練習画面・カレンダーの再更新
      renderCalendar();
    } else {
      alert("エラー: " + (res.message || "処理に失敗しました"));
    }
  } catch (e) {
    showLoading(false);
    alert("一括生成中に通信エラーが発生しました。");
  }
}

// ==========================================
// 7. アプリ初期化
// ==========================================
window.onload = async function() {
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('schedDateInput');
  if (dateInput) dateInput.value = todayStr;

  try {
    allMenus = await callGasApi("getMenuList");
  } catch (e) {
    console.warn("初期メニュー読み込み待機");
  }

  // 初期表示ページの設定
  switchPage('view');
};
