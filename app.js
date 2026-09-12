const STORAGE_KEY = "urinationTracker.data.v1";

const VOLUME_OPTIONS = ["ごく少量", "少量", "中等量", "多量"];
const AFTER_OPTIONS = ["スッキリ", "少し尿意あり", "尿意あり", "変わらない"];
const URGE_LABELS = ["なし", "少し気になる", "気になる", "かなり気になる", "強い", "漏れそう"];
const PAIN_LABELS = ["なし", "1", "2", "3", "4", "強い"];
const OUTCOME_OPTIONS = ["忘れた", "弱くなった", "変わらない", "強くなった", "トイレに行った"];
const DRINK_OPTIONS = ["水", "お茶", "コーヒー", "その他"];
const QUICK_ML = [100, 200, 300, 500];
const VOLUME_SIZE = { "ごく少量": 5, "少量": 7, "中等量": 9, "多量": 12 };

const titles = {
  today: "今日",
  history: "履歴",
  graphs: "グラフ",
  report: "診察",
  settings: "設定"
};

const app = {
  tab: "today",
  graphDate: todayKey(),
  reportMode: "today",
  reportStart: todayKey(),
  reportEnd: todayKey(),
  data: loadData()
};

const view = document.getElementById("view");
const screenTitle = document.getElementById("screenTitle");
const toast = document.getElementById("toast");
const sheet = document.getElementById("sheet");
const sheetContent = document.getElementById("sheetContent");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const printButton = document.getElementById("printButton");

document.addEventListener("DOMContentLoaded", () => {
  bindGlobalEvents();
  render();
  registerServiceWorker();
});

function bindGlobalEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      app.tab = tab.dataset.tab;
      render();
      view.focus({ preventScroll: true });
    });
  });

  sheetBackdrop.addEventListener("click", closeSheet);
  printButton.addEventListener("click", () => window.print());
  sheetContent.addEventListener("click", (event) => {
    const target = event.target.closest("[data-delete]");
    if (target) deleteRecord(target.dataset.delete);
  });

  view.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], [data-edit], [data-delete]");
    if (!target) return;

    if (target.dataset.action) handleAction(target.dataset.action, target);
    if (target.dataset.edit) openEditor(target.dataset.edit);
    if (target.dataset.delete) deleteRecord(target.dataset.delete);
  });

  view.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "graphDate") {
      app.graphDate = target.value || todayKey();
      renderGraphs();
    }
    if (target.id === "reportStart") {
      app.reportStart = target.value || todayKey();
      app.reportMode = "custom";
      render();
    }
    if (target.id === "reportEnd") {
      app.reportEnd = target.value || todayKey();
      app.reportMode = "custom";
      render();
    }
    if (target.id === "importFile") {
      importJson(target.files && target.files[0]);
      target.value = "";
    }
  });
}

function handleAction(action, target) {
  if (action === "new-void") {
    openVoidSheet(null, true);
  }
  if (action === "new-urge") {
    openUrgeSheet(null, true);
  }
  if (action === "new-fluid") openFluidSheet(null, true);
  if (action === "sleep-start") openSleepSheet(null, "sleep_start");
  if (action === "sleep-end") openSleepSheet(null, "sleep_end");
  if (action === "report-mode") {
    app.reportMode = target.dataset.mode;
    syncReportRange();
    render();
  }
  if (action === "export") exportJson();
  if (action === "import") document.getElementById("importFile").click();
  if (action === "clear") clearAllData();
  if (action === "print") window.print();
  if (action === "open-wide-graphs") openWideGraphs();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, records: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return { version: 1, records: [] };
    return { version: 1, records: parsed.records };
  } catch {
    return { version: 1, records: [] };
  }
}

function saveData() {
  app.data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
}

function addRecord(type, data = {}, date = new Date()) {
  const record = {
    id: makeId(),
    type,
    timestamp: date.toISOString(),
    data: { ...data },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  app.data.records.push(record);
  sortRecords();
  saveData();
  return record;
}

function updateRecord(id, updates) {
  const record = getRecord(id);
  if (!record) return null;
  Object.assign(record, updates, { updatedAt: new Date().toISOString() });
  sortRecords();
  saveData();
  return record;
}

function getRecord(id) {
  return app.data.records.find((record) => record.id === id);
}

function deleteRecord(id) {
  const record = getRecord(id);
  if (!record) return;
  if (!confirm("この記録を削除しますか？")) return;
  app.data.records = app.data.records.filter((item) => item.id !== id);
  saveData();
  closeSheet();
  showToast("削除しました");
  render();
}

function sortRecords() {
  app.data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function render() {
  screenTitle.textContent = titles[app.tab];
  printButton.style.display = app.tab === "report" ? "block" : "none";
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === app.tab);
  });

  if (app.tab === "today") renderToday();
  if (app.tab === "history") renderHistory();
  if (app.tab === "graphs") renderGraphsView();
  if (app.tab === "report") renderReport();
  if (app.tab === "settings") renderSettings();
}

function renderToday() {
  const range = dayRange(todayKey());
  const stats = buildStats(range.start, range.end);
  view.innerHTML = `
    <section>
      <p class="today-date">${escapeHtml(formatLongDate(new Date()))}</p>
      <button type="button" class="primary-action" data-action="new-void">🚽 トイレ</button>
      <div class="button-grid">
        <button type="button" class="soft-button" data-action="new-urge">尿意を感じた</button>
        <button type="button" class="soft-button" data-action="new-fluid">🥤 水分</button>
        <button type="button" class="soft-button" data-action="sleep-start">🌙 就寝</button>
        <button type="button" class="soft-button" data-action="sleep-end">☀️ 起床</button>
      </div>
    </section>

    <section class="card">
      <h2>今日</h2>
      <div class="summary-grid">
        ${statHtml("排尿", `${stats.voidCount}回`)}
        ${statHtml("平均間隔", stats.avgInterval)}
        ${statHtml("最短", stats.minInterval)}
        ${statHtml("最長", stats.maxInterval)}
        ${statHtml("水分", `${stats.fluidMl.toLocaleString("ja-JP")}mL`)}
        ${statHtml("夜間排尿", `${stats.nightVoidCount}回`)}
      </div>
    </section>

    <section class="subtle-card">
      <p class="muted small">記録は端末内だけに保存されます。間隔の評価や通知は行いません。</p>
    </section>
  `;
}

function renderHistory() {
  const records = [...app.data.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (!records.length) {
    view.innerHTML = `<section class="card empty">まだ記録がありません。</section>`;
    return;
  }

  const groups = groupBy(records, (record) => dateKey(record.timestamp));
  view.innerHTML = Object.entries(groups)
    .map(([key, items]) => `
      <section class="history-group">
        <h2 class="history-date">${escapeHtml(formatDateKey(key))}</h2>
        ${items.map((record) => recordItemHtml(record)).join("")}
      </section>
    `)
    .join("");
}

function renderGraphsView() {
  view.innerHTML = `
    <section class="card">
      <label class="field-title" for="graphDate">表示する日</label>
      <input id="graphDate" class="input" type="date" value="${escapeAttr(app.graphDate)}">
      <button type="button" class="soft-button full-button graph-wide-button" data-action="open-wide-graphs">横長で見る</button>
    </section>
    ${chartCard("timeline", "排尿タイムライン")}
    ${chartCard("intervals", "排尿間隔グラフ")}
    ${chartCard("urgency", "尿意グラフ")}
    ${chartCard("fluidvoid", "水分摂取と排尿")}
  `;
  requestAnimationFrame(renderGraphs);
}

function renderReport() {
  syncReportRange();
  const start = startOfDay(app.reportStart);
  const end = endOfDay(app.reportEnd);
  const stats = buildStats(start, end);
  const daily = dailyStats(start, end);

  view.innerHTML = `
    <section class="card no-print">
      <div class="segmented">
        <button type="button" data-action="report-mode" data-mode="today" class="${app.reportMode === "today" ? "active" : ""}">今日</button>
        <button type="button" data-action="report-mode" data-mode="3days" class="${app.reportMode === "3days" ? "active" : ""}">3日間</button>
        <button type="button" data-action="report-mode" data-mode="7days" class="${app.reportMode === "7days" ? "active" : ""}">7日間</button>
        <button type="button" data-action="report-mode" data-mode="custom" class="${app.reportMode === "custom" ? "active" : ""}">期間指定</button>
      </div>
      <div class="date-range" style="margin-top: 12px;">
        <label class="field-title">開始<input id="reportStart" class="input" type="date" value="${escapeAttr(app.reportStart)}"></label>
        <label class="field-title">終了<input id="reportEnd" class="input" type="date" value="${escapeAttr(app.reportEnd)}"></label>
      </div>
      <button type="button" class="soft-button full-button" style="margin-top: 12px;" data-action="print">PDF保存・印刷</button>
    </section>

    <section class="card">
      <h2>診察用レポート</h2>
      <p class="muted">${escapeHtml(formatDateKey(app.reportStart))} 〜 ${escapeHtml(formatDateKey(app.reportEnd))}</p>
      <div class="report-grid">
        ${statHtml("排尿回数", `${stats.voidCount}回`)}
        ${statHtml("平均間隔", stats.avgInterval)}
        ${statHtml("最短間隔", stats.minInterval)}
        ${statHtml("最長間隔", stats.maxInterval)}
        ${statHtml("夜間排尿", `${stats.nightVoidCount}回`)}
        ${statHtml("尿意平均", stats.avgUrge)}
        ${statHtml("水分摂取量", `${stats.fluidMl.toLocaleString("ja-JP")}mL`)}
      </div>
    </section>

    <section class="card">
      <h2>日別</h2>
      ${daily.length ? daily.map((day) => `
        <div class="record-item">
          <div class="record-time">${escapeHtml(day.key.slice(5).replace("-", "/"))}</div>
          <div class="record-main">
            <p class="record-title">排尿 ${day.stats.voidCount}回 / 水分 ${day.stats.fluidMl.toLocaleString("ja-JP")}mL</p>
            <p class="record-meta">平均 ${escapeHtml(day.stats.avgInterval)}・夜間 ${day.stats.nightVoidCount}回・尿意平均 ${escapeHtml(day.stats.avgUrge)}</p>
          </div>
          <div></div>
        </div>
      `).join("") : `<p class="empty">この期間の記録はありません。</p>`}
    </section>

    ${chartCard("reportTimeline", "排尿タイムライン", "tall")}
    ${chartCard("reportIntervals", "排尿間隔グラフ")}
    ${chartCard("reportUrgency", "尿意グラフ")}
  `;
  requestAnimationFrame(renderReportCharts);
}

function renderSettings() {
  view.innerHTML = `
    <section class="card">
      <h2>データ管理</h2>
      <div class="settings-list">
        <button type="button" class="soft-button full-button" data-action="export">JSONをエクスポート</button>
        <button type="button" class="soft-button full-button" data-action="import">JSONを追加インポート</button>
        <input id="importFile" class="hidden" type="file" accept="application/json,.json">
        <button type="button" class="danger-button full-button" data-action="clear">全データ削除</button>
      </div>
    </section>
    <section class="card">
      <h2>保存形式</h2>
      <p class="muted small">記録はこのiPhoneのブラウザ内LocalStorageに保存されます。JSONインポートは既存データに追加し、同じ記録はスキップします。</p>
    </section>
  `;
}

function statHtml(label, value) {
  return `
    <div class="stat">
      <p class="label">${escapeHtml(label)}</p>
      <p class="value">${escapeHtml(value)}</p>
    </div>
  `;
}

function chartCard(id, title, extraClass = "") {
  return `
    <section class="card chart-card ${extraClass}">
      <h2>${escapeHtml(title)}</h2>
      <canvas id="${escapeAttr(id)}" aria-label="${escapeAttr(title)}"></canvas>
    </section>
  `;
}

function recordItemHtml(record) {
  const meta = recordMeta(record);
  return `
    <button type="button" class="record-item" data-edit="${escapeAttr(record.id)}">
      <div class="record-time">${escapeHtml(formatTime(record.timestamp))}</div>
      <div class="record-main">
        <p class="record-title">${escapeHtml(recordTitle(record))}</p>
        <p class="record-meta">${escapeHtml(meta)}</p>
      </div>
      <div class="record-chevron" aria-hidden="true">›</div>
    </button>
  `;
}

function recordTitle(record) {
  const data = record.data || {};
  if (record.type === "void") return `🚽 ${data.volumeLabel || "排尿"}`;
  if (record.type === "urge") return `尿意 ${numberOrDash(data.urgeLevel)}`;
  if (record.type === "fluid") return `🥤 ${data.amountMl || 0}mL ${data.drinkType || "水"}`;
  if (record.type === "sleep_start") return "🌙 就寝";
  if (record.type === "sleep_end") return "☀️ 起床";
  return "記録";
}

function recordMeta(record) {
  const data = record.data || {};
  if (record.type === "void") {
    const parts = [];
    const interval = previousVoidInterval(record);
    if (interval != null) parts.push(`前回から ${formatDuration(interval)}`);
    if (data.urgeBefore !== "" && data.urgeBefore != null) parts.push(`排尿前の尿意 ${data.urgeBefore}`);
    if (data.afterFeeling) parts.push(data.afterFeeling);
    if (data.measuredMl) parts.push(`実測 ${data.measuredMl}mL`);
    if (data.note) parts.push(data.note);
    return parts.join("・") || "時刻のみ";
  }
  if (record.type === "urge") {
    const parts = [];
    if (data.urgeLevel !== "" && data.urgeLevel != null) parts.push(URGE_LABELS[Number(data.urgeLevel)] || "尿意");
    if (data.outcome) parts.push(`その後: ${data.outcome}`);
    if (data.linkedVoidId) parts.push("排尿記録と関連付け");
    if (data.note) parts.push(data.note);
    return parts.join("・") || "時刻のみ";
  }
  if (record.type === "fluid") return data.note || "水分摂取";
  if (record.type === "sleep_start" || record.type === "sleep_end") return "睡眠時間帯の集計に使います";
  return "";
}

function openEditor(id) {
  const record = getRecord(id);
  if (!record) return;
  if (record.type === "void") openVoidSheet(id, false);
  if (record.type === "urge") openUrgeSheet(id, false);
  if (record.type === "fluid") openFluidSheet(id, false);
  if (record.type === "sleep_start" || record.type === "sleep_end") openSleepSheet(id);
}

function openVoidSheet(id, isNew) {
  const record = id ? getRecord(id) : draftRecord("void");
  if (!record) return;
  const data = record.data || {};
  sheetContent.innerHTML = `
    <div class="sheet-title-row">
      <div>
        <h2 id="sheetTitle">排尿記録</h2>
        <p class="muted small">${isNew ? "必要な項目だけ選んで、保存で記録します。" : "記録を編集できます。"}</p>
      </div>
      <button type="button" class="plain-button" id="closeSheetButton">閉じる</button>
    </div>

    ${datetimeField(record)}
    ${choiceField("尿量", "volumeLabel", VOLUME_OPTIONS, data.volumeLabel)}
    <div class="field">
      <label for="measuredMl">実測した尿量（任意・mL）</label>
      <input id="measuredMl" class="input" type="number" inputmode="numeric" min="0" step="1" value="${escapeAttr(data.measuredMl || "")}" placeholder="例: 180">
    </div>
    ${scaleField("排尿前の尿意", "urgeBefore", URGE_LABELS, data.urgeBefore)}
    ${choiceField("排尿後の感覚", "afterFeeling", AFTER_OPTIONS, data.afterFeeling)}
    ${scaleField("痛み", "pain", PAIN_LABELS, data.pain)}
    <div class="field">
      <label for="note">メモ</label>
      <textarea id="note" class="textarea" placeholder="気になることがあれば">${escapeHtml(data.note || "")}</textarea>
    </div>
    <div class="form-actions">
      ${id ? `<button type="button" class="danger-button" data-delete="${escapeAttr(id)}">削除</button>` : `<button type="button" class="plain-button" id="cancelVoid">キャンセル</button>`}
      <button type="button" class="primary-save" id="saveVoid">保存</button>
    </div>
  `;
  openSheet();
  bindSelectableControls();
  document.getElementById("closeSheetButton").addEventListener("click", closeSheet);
  document.getElementById("cancelVoid")?.addEventListener("click", closeSheet);
  document.getElementById("saveVoid").addEventListener("click", () => {
    const timestamp = readDateTime(record.timestamp);
    const payload = {
      volumeLabel: selectedValue("volumeLabel"),
      measuredMl: readNumber("measuredMl"),
      urgeBefore: selectedValue("urgeBefore"),
      afterFeeling: selectedValue("afterFeeling"),
      pain: selectedValue("pain"),
      note: document.getElementById("note").value.trim()
    };
    if (id) updateRecord(id, { timestamp, data: payload });
    else addRecord("void", payload, new Date(timestamp));
    closeSheet();
    showToast("記録しました");
    render();
  });
}

function openUrgeSheet(id, isNew) {
  const record = id ? getRecord(id) : draftRecord("urge");
  if (!record) return;
  const data = record.data || {};
  const voidOptions = relatedVoidOptions(record);
  sheetContent.innerHTML = `
    <div class="sheet-title-row">
      <div>
        <h2 id="sheetTitle">尿意の記録</h2>
        <p class="muted small">${isNew ? "尿意だけでも、保存で記録できます。" : "その後の変化も追記できます。"}</p>
      </div>
      <button type="button" class="plain-button" id="closeSheetButton">閉じる</button>
    </div>

    ${datetimeField(record)}
    ${scaleField("尿意", "urgeLevel", URGE_LABELS, data.urgeLevel)}
    ${choiceField("その後どうなった？", "outcome", OUTCOME_OPTIONS, data.outcome)}
    <div class="field">
      <label for="linkedVoidId">関連する排尿記録（任意）</label>
      <select id="linkedVoidId" class="select">
        <option value="">選択しない</option>
        ${voidOptions.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === data.linkedVoidId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label for="note">メモ</label>
      <textarea id="note" class="textarea" placeholder="気になることがあれば">${escapeHtml(data.note || "")}</textarea>
    </div>
    <div class="form-actions">
      ${id ? `<button type="button" class="danger-button" data-delete="${escapeAttr(id)}">削除</button>` : `<button type="button" class="plain-button" id="cancelUrge">キャンセル</button>`}
      <button type="button" class="primary-save" id="saveUrge">保存</button>
    </div>
  `;
  openSheet();
  bindSelectableControls();
  document.getElementById("closeSheetButton").addEventListener("click", closeSheet);
  document.getElementById("cancelUrge")?.addEventListener("click", closeSheet);
  document.getElementById("saveUrge").addEventListener("click", () => {
    const timestamp = readDateTime(record.timestamp);
    const payload = {
      urgeLevel: selectedValue("urgeLevel"),
      outcome: selectedValue("outcome"),
      linkedVoidId: document.getElementById("linkedVoidId").value,
      note: document.getElementById("note").value.trim()
    };
    if (id) updateRecord(id, { timestamp, data: payload });
    else addRecord("urge", payload, new Date(timestamp));
    closeSheet();
    showToast("記録しました");
    render();
  });
}

function openFluidSheet(id, isNew) {
  const record = id ? getRecord(id) : null;
  const draft = record || draftRecord("fluid", { drinkType: "水" });
  const data = draft.data || {};
  sheetContent.innerHTML = `
    <div class="sheet-title-row">
      <div>
        <h2 id="sheetTitle">水分記録</h2>
        <p class="muted small">${isNew ? "量を選んで、保存で記録します。" : "記録を編集できます。"}</p>
      </div>
      <button type="button" class="plain-button" id="closeSheetButton">閉じる</button>
    </div>

    ${datetimeField(draft)}
    ${choiceField("飲み物の種類", "drinkType", DRINK_OPTIONS, data.drinkType || "水")}
    <div class="field">
      <div class="field-title">よく使う量</div>
      <div class="quick-row">
        ${QUICK_ML.map((ml) => `<button type="button" class="pill-button quick-ml" data-ml="${ml}">${ml}mL</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label for="amountMl">その他の量（mL）</label>
      <input id="amountMl" class="input" type="number" inputmode="numeric" min="0" step="1" value="${escapeAttr(data.amountMl || "")}" placeholder="例: 150">
    </div>
    <div class="field">
      <label for="note">メモ</label>
      <textarea id="note" class="textarea" placeholder="必要なら">${escapeHtml(data.note || "")}</textarea>
    </div>
    <div class="form-actions">
      ${record ? `<button type="button" class="danger-button" data-delete="${escapeAttr(record.id)}">削除</button>` : `<button type="button" class="plain-button" id="cancelFluid">キャンセル</button>`}
      <button type="button" class="primary-save" id="saveFluid">保存</button>
    </div>
  `;
  openSheet();
  bindSelectableControls();
  document.getElementById("closeSheetButton").addEventListener("click", closeSheet);
  document.getElementById("cancelFluid")?.addEventListener("click", closeSheet);
  document.querySelectorAll(".quick-ml").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("amountMl").value = button.dataset.ml;
      document.querySelectorAll(".quick-ml").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
  document.getElementById("saveFluid").addEventListener("click", () => {
    saveFluid(record, readNumber("amountMl"), readDateTime(draft.timestamp));
  });
}

function saveFluid(existingRecord, amountMl, timestamp) {
  if (!amountMl || amountMl < 0) {
    alert("水分量を入力してください。");
    return;
  }
  const payload = {
    amountMl,
    drinkType: selectedValue("drinkType") || "水",
    note: document.getElementById("note").value.trim()
  };
  if (existingRecord) {
    updateRecord(existingRecord.id, {
      timestamp,
      data: payload
    });
  } else {
    addRecord("fluid", payload, new Date(timestamp));
  }
  closeSheet();
  showToast("記録しました");
  render();
}

function openSleepSheet(id, type) {
  const record = id ? getRecord(id) : draftRecord(type);
  if (!record) return;
  const isNew = !id;
  sheetContent.innerHTML = `
    <div class="sheet-title-row">
      <div>
        <h2 id="sheetTitle">${record.type === "sleep_start" ? "就寝" : "起床"}の記録</h2>
        <p class="muted small">${isNew ? "保存で記録します。" : "時刻を編集できます。"}</p>
      </div>
      <button type="button" class="plain-button" id="closeSheetButton">閉じる</button>
    </div>
    ${datetimeField(record)}
    <div class="form-actions">
      ${id ? `<button type="button" class="danger-button" data-delete="${escapeAttr(id)}">削除</button>` : `<button type="button" class="plain-button" id="cancelSleep">キャンセル</button>`}
      <button type="button" class="primary-save" id="saveSleep">保存</button>
    </div>
  `;
  openSheet();
  document.getElementById("closeSheetButton").addEventListener("click", closeSheet);
  document.getElementById("cancelSleep")?.addEventListener("click", closeSheet);
  document.getElementById("saveSleep").addEventListener("click", () => {
    const timestamp = readDateTime(record.timestamp);
    if (id) updateRecord(id, { timestamp });
    else addRecord(record.type, {}, new Date(timestamp));
    closeSheet();
    showToast("記録しました");
    render();
  });
}

function draftRecord(type, data = {}) {
  return {
    id: "",
    type,
    timestamp: new Date().toISOString(),
    data: { ...data }
  };
}

function datetimeField(record) {
  return `
    <div class="field">
      <label for="recordTime">時刻</label>
      <input id="recordTime" class="input" type="datetime-local" value="${escapeAttr(toDateTimeInput(record.timestamp))}">
    </div>
  `;
}

function choiceField(label, name, options, value) {
  return `
    <div class="field">
      <div class="field-title">${escapeHtml(label)}</div>
      <div class="choice-grid" data-choice-group="${escapeAttr(name)}">
        ${options.map((option) => `
          <button type="button" class="choice-button ${option === value ? "selected" : ""}" data-choice="${escapeAttr(name)}" data-value="${escapeAttr(option)}">${escapeHtml(option)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function scaleField(label, name, labels, value) {
  return `
    <div class="field">
      <div class="field-title">${escapeHtml(label)}</div>
      <div class="scale-grid" data-choice-group="${escapeAttr(name)}">
        ${labels.map((text, index) => `
          <button type="button" class="scale-button ${Number(value) === index ? "selected" : ""}" data-choice="${escapeAttr(name)}" data-value="${index}">
            <strong>${index}</strong><span>${escapeHtml(text)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function bindSelectableControls() {
  sheetContent.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.choice;
      const wasSelected = button.classList.contains("selected");
      sheetContent.querySelectorAll(`[data-choice="${cssEscape(group)}"]`).forEach((item) => item.classList.remove("selected"));
      if (!wasSelected) button.classList.add("selected");
    });
  });
}

function selectedValue(name) {
  return sheetContent.querySelector(`[data-choice="${cssEscape(name)}"].selected`)?.dataset.value ?? "";
}

function readNumber(id) {
  const raw = document.getElementById(id)?.value;
  if (raw === "" || raw == null) return "";
  const number = Number(raw);
  return Number.isFinite(number) ? number : "";
}

function readDateTime(fallback) {
  const raw = document.getElementById("recordTime")?.value;
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function openSheet() {
  sheet.classList.remove("hidden");
  sheetBackdrop.classList.remove("hidden");
}

function closeSheet() {
  sheet.classList.add("hidden");
  sheet.classList.remove("wide-sheet");
  sheetBackdrop.classList.add("hidden");
  sheetContent.innerHTML = "";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function renderGraphs() {
  const range = dayRange(app.graphDate);
  const records = recordsBetween(range.start, range.end);
  drawTimeline("timeline", records, range.start, range.end, true);
  drawIntervals("intervals", records, range.start, range.end);
  drawUrgency("urgency", records, range.start, range.end);
  drawFluidVoid("fluidvoid", records, range.start, range.end);
}

function openWideGraphs() {
  sheet.classList.add("wide-sheet");
  sheetContent.innerHTML = `
    <div class="sheet-title-row">
      <div>
        <h2 id="sheetTitle">横長グラフ</h2>
        <p class="muted small">${escapeHtml(formatDateKey(app.graphDate))}</p>
      </div>
      <button type="button" class="plain-button" id="closeSheetButton">閉じる</button>
    </div>
    ${wideChart("wideTimeline", "排尿タイムライン")}
    ${wideChart("wideIntervals", "排尿間隔グラフ")}
    ${wideChart("wideUrgency", "尿意グラフ")}
    ${wideChart("wideFluidVoid", "水分摂取と排尿")}
  `;
  openSheet();
  document.getElementById("closeSheetButton").addEventListener("click", closeSheet);
  requestAnimationFrame(renderWideGraphs);
}

function wideChart(id, title) {
  return `
    <section class="wide-chart-block">
      <h3>${escapeHtml(title)}</h3>
      <div class="wide-chart-scroll">
        <div class="wide-chart-inner">
          <canvas id="${escapeAttr(id)}" aria-label="${escapeAttr(title)}"></canvas>
        </div>
      </div>
    </section>
  `;
}

function renderWideGraphs() {
  const range = dayRange(app.graphDate);
  const records = recordsBetween(range.start, range.end);
  drawTimeline("wideTimeline", records, range.start, range.end, true);
  drawIntervals("wideIntervals", records, range.start, range.end);
  drawUrgency("wideUrgency", records, range.start, range.end);
  drawFluidVoid("wideFluidVoid", records, range.start, range.end);
}

function renderReportCharts() {
  const start = startOfDay(app.reportStart);
  const end = endOfDay(app.reportEnd);
  const records = recordsBetween(start, end);
  drawTimeline("reportTimeline", records, start, end, false);
  drawIntervals("reportIntervals", records, start, end);
  drawUrgency("reportUrgency", records, start, end);
}

function drawTimeline(canvasId, records, start, end, singleDay) {
  const canvas = setupCanvas(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  chartFrame(ctx, width, height, start, end, "排尿", { singleDay });
  drawSleepBands(ctx, width, height, start, end);
  const voids = records.filter((record) => record.type === "void");
  if (!voids.length) return chartEmpty(ctx, width, height);
  voids.forEach((record) => {
    const x = timeX(record.timestamp, start, end, width);
    const y = height * 0.52;
    const size = VOLUME_SIZE[record.data?.volumeLabel] || 7;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = "#9f6f52";
    ctx.fill();
    ctx.strokeStyle = "#fffaf3";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawIntervals(canvasId, records, start, end) {
  const canvas = setupCanvas(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  chartFrame(ctx, width, height, start, end, "分");
  const voids = records.filter((record) => record.type === "void").sort(byTime);
  const points = [];
  voids.forEach((record, index) => {
    if (index === 0) return;
    const prev = voids[index - 1];
    points.push({
      x: timeX(record.timestamp, start, end, width),
      value: Math.round((new Date(record.timestamp) - new Date(prev.timestamp)) / 60000)
    });
  });
  if (!points.length) return chartEmpty(ctx, width, height);
  const max = Math.max(60, ...points.map((point) => point.value));
  drawLinePoints(ctx, points.map((point) => ({ x: point.x, y: valueY(point.value, 0, max, height), value: point.value })), "#8f9270");
}

function drawUrgency(canvasId, records, start, end) {
  const canvas = setupCanvas(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  chartFrame(ctx, width, height, start, end, "尿意 0-5", { yTicks: [0, 1, 2, 3, 4, 5] });
  const points = [];
  records.sort(byTime).forEach((record) => {
    if (record.type === "urge" && record.data?.urgeLevel !== "" && record.data?.urgeLevel != null) {
      points.push({ x: timeX(record.timestamp, start, end, width), y: valueY(Number(record.data.urgeLevel), 0, 5, height), color: "#bd8068" });
    }
    if (record.type === "void" && record.data?.urgeBefore !== "" && record.data?.urgeBefore != null) {
      points.push({ x: timeX(record.timestamp, start, end, width), y: valueY(Number(record.data.urgeBefore), 0, 5, height), color: "#9f6f52" });
    }
  });
  if (!points.length) return chartEmpty(ctx, width, height);
  drawLinePoints(ctx, points, "#bd8068", false);
}

function drawFluidVoid(canvasId, records, start, end) {
  const canvas = setupCanvas(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  chartFrame(ctx, width, height, start, end, "水分 / 排尿");
  const fluids = records.filter((record) => record.type === "fluid");
  const voids = records.filter((record) => record.type === "void");
  if (!fluids.length && !voids.length) return chartEmpty(ctx, width, height);
  fluids.forEach((record) => {
    const x = timeX(record.timestamp, start, end, width);
    ctx.fillStyle = "#8f9270";
    roundedRect(ctx, x - 5, height * 0.3 - 18, 10, 36, 5);
    ctx.fill();
  });
  voids.forEach((record) => {
    const x = timeX(record.timestamp, start, end, width);
    ctx.beginPath();
    ctx.arc(x, height * 0.68, VOLUME_SIZE[record.data?.volumeLabel] || 7, 0, Math.PI * 2);
    ctx.fillStyle = "#9f6f52";
    ctx.fill();
  });
}

function setupCanvas(id) {
  const element = document.getElementById(id);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(280, rect.width);
  const height = rect.height || 240;
  element.width = Math.floor(width * ratio);
  element.height = Math.floor(height * ratio);
  const ctx = element.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function chartFrame(ctx, width, height, start, end, yLabel, options = {}) {
  const pad = chartPad();
  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, width, height);
  drawTimeGrid(ctx, width, height, start, end, options);
  if (options.yTicks) drawYLabels(ctx, width, height, options.yTicks);
  ctx.strokeStyle = "#e3d4c2";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = "#7d6e62";
  ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(yLabel, pad.left + 2, pad.top - 10);
}

function drawTimeGrid(ctx, width, height, start, end, options = {}) {
  const pad = chartPad();
  const ticks = buildTimeTicks(start, end, width, options.singleDay);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ticks.forEach((tick) => {
    const x = timeX(tick.date, start, end, width);
    ctx.strokeStyle = tick.major ? "rgba(159, 111, 82, 0.24)" : "rgba(227, 212, 194, 0.62)";
    ctx.lineWidth = tick.major ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();

    ctx.fillStyle = tick.major ? "#5c4939" : "#7d6e62";
    ctx.font = tick.major ? "700 12px -apple-system, BlinkMacSystemFont, sans-serif" : "12px -apple-system, BlinkMacSystemFont, sans-serif";
    if (x <= pad.left + 4) ctx.textAlign = "left";
    else if (x >= width - pad.right - 4) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    ctx.fillText(tick.label, x, height - pad.bottom + 8);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawYLabels(ctx, width, height, ticks) {
  const pad = chartPad();
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ticks.forEach((tick) => {
    const y = valueY(tick, Math.min(...ticks), Math.max(...ticks), height);
    ctx.strokeStyle = "rgba(227, 212, 194, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "#7d6e62";
    ctx.fillText(String(tick), pad.left - 7, y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function buildTimeTicks(start, end, width, singleDay = false) {
  const durationHours = (end - start) / 3600000;
  const ticks = [];
  if (singleDay || durationHours <= 26) {
    const step = width < 390 ? 4 : 3;
    const base = new Date(start);
    base.setMinutes(0, 0, 0);
    for (let hour = 0; hour <= 24; hour += step) {
      const date = new Date(base);
      date.setHours(hour, 0, 0, 0);
      ticks.push({ date, label: `${hour}時`, major: hour % 6 === 0 });
    }
    return ticks;
  }

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    ticks.push({ date: new Date(cursor), label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, major: true });
    if (durationHours <= 72) {
      const noon = new Date(cursor);
      noon.setHours(12, 0, 0, 0);
      if (noon >= start && noon <= end) ticks.push({ date: noon, label: "12時", major: false });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return ticks;
}

function drawSleepBands(ctx, width, height, start, end) {
  const intervals = sleepIntervals().filter((span) => span.end >= start && span.start <= end);
  const pad = chartPad();
  intervals.forEach((span) => {
    const x1 = timeX(span.start, start, end, width);
    const x2 = timeX(span.end, start, end, width);
    ctx.fillStyle = "rgba(143, 146, 112, 0.14)";
    ctx.fillRect(Math.max(pad.left, x1), pad.top, Math.min(width - pad.right, x2) - Math.max(pad.left, x1), height - pad.top - pad.bottom);
  });
}

function drawLinePoints(ctx, points, color, connect = true) {
  if (connect && points.length > 1) {
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = point.color || color;
    ctx.fill();
    ctx.strokeStyle = "#fffaf3";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function chartEmpty(ctx, width, height) {
  ctx.fillStyle = "#7d6e62";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("この範囲の記録はありません", width / 2, height / 2);
  ctx.textAlign = "left";
}

function chartPad() {
  return { left: 38, right: 18, top: 34, bottom: 50 };
}

function timeX(time, start, end, width) {
  const pad = chartPad();
  const total = Math.max(1, end - start);
  const value = (new Date(time) - start) / total;
  return pad.left + clamp(value, 0, 1) * (width - pad.left - pad.right);
}

function valueY(value, min, max, height) {
  const pad = chartPad();
  const pct = (value - min) / Math.max(1, max - min);
  return height - pad.bottom - clamp(pct, 0, 1) * (height - pad.top - pad.bottom);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function buildStats(start, end) {
  const records = recordsBetween(start, end);
  const voids = records.filter((record) => record.type === "void").sort(byTime);
  const fluids = records.filter((record) => record.type === "fluid");
  const intervals = voids.slice(1).map((record, index) => new Date(record.timestamp) - new Date(voids[index].timestamp));
  const urgeValues = records.flatMap((record) => {
    if (record.type === "urge" && record.data?.urgeLevel !== "" && record.data?.urgeLevel != null) return [Number(record.data.urgeLevel)];
    if (record.type === "void" && record.data?.urgeBefore !== "" && record.data?.urgeBefore != null) return [Number(record.data.urgeBefore)];
    return [];
  }).filter(Number.isFinite);
  const fluidMl = fluids.reduce((sum, record) => sum + Number(record.data?.amountMl || 0), 0);
  return {
    voidCount: voids.length,
    avgInterval: intervals.length ? formatDuration(avg(intervals)) : "-",
    minInterval: intervals.length ? formatDuration(Math.min(...intervals)) : "-",
    maxInterval: intervals.length ? formatDuration(Math.max(...intervals)) : "-",
    nightVoidCount: countNightVoids(voids, start, end),
    avgUrge: urgeValues.length ? (avg(urgeValues)).toFixed(1) : "-",
    fluidMl
  };
}

function dailyStats(start, end) {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = dateKey(cursor);
    const range = dayRange(key);
    days.push({ key, stats: buildStats(range.start, range.end) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function countNightVoids(voids, start, end) {
  const spans = sleepIntervals().filter((span) => span.end >= start && span.start <= end);
  return voids.filter((record) => {
    const time = new Date(record.timestamp);
    return spans.some((span) => time >= span.start && time <= span.end);
  }).length;
}

function sleepIntervals() {
  const sleeps = app.data.records.filter((record) => record.type === "sleep_start" || record.type === "sleep_end").sort(byTime);
  const intervals = [];
  let currentStart = null;
  sleeps.forEach((record) => {
    if (record.type === "sleep_start") currentStart = new Date(record.timestamp);
    if (record.type === "sleep_end" && currentStart) {
      const end = new Date(record.timestamp);
      if (end > currentStart) intervals.push({ start: currentStart, end });
      currentStart = null;
    }
  });
  if (currentStart) intervals.push({ start: currentStart, end: new Date() });
  return intervals;
}

function previousVoidInterval(record) {
  const voids = app.data.records.filter((item) => item.type === "void").sort(byTime);
  const index = voids.findIndex((item) => item.id === record.id);
  if (index <= 0) return null;
  return new Date(record.timestamp) - new Date(voids[index - 1].timestamp);
}

function relatedVoidOptions(urgeRecord) {
  const start = new Date(urgeRecord.timestamp);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return app.data.records
    .filter((record) => record.type === "void" && new Date(record.timestamp) >= start && new Date(record.timestamp) <= end)
    .sort(byTime)
    .map((record) => ({ id: record.id, label: `${formatTime(record.timestamp)} ${record.data?.volumeLabel || "排尿"}` }));
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "urination-tracker-pwa",
    data: app.data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `urination-records-${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = parsed.data || parsed;
      if (!imported || !Array.isArray(imported.records)) throw new Error("records not found");
      if (!confirm("JSONの記録を現在のデータに追加します。同じ記録はスキップします。")) return;
      const existing = new Set(app.data.records.map(recordSignature));
      let added = 0;
      let skipped = 0;
      imported.records.forEach((record) => {
        const normalized = normalizeImportedRecord(record);
        if (!normalized) return;
        const signature = recordSignature(normalized);
        if (existing.has(signature)) {
          skipped += 1;
          return;
        }
        if (app.data.records.some((item) => item.id === normalized.id)) normalized.id = makeId();
        app.data.records.push(normalized);
        existing.add(signature);
        added += 1;
      });
      sortRecords();
      saveData();
      showToast(`${added}件追加、${skipped}件スキップ`);
      render();
    } catch {
      alert("JSONを読み込めませんでした。");
    }
  };
  reader.readAsText(file);
}

function normalizeImportedRecord(record) {
  if (!record || !record.type || !record.timestamp) return null;
  const date = new Date(record.timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date().toISOString();
  return {
    id: record.id || makeId(),
    type: record.type,
    timestamp: date.toISOString(),
    data: record.data && typeof record.data === "object" ? { ...record.data } : {},
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now
  };
}

function recordSignature(record) {
  return JSON.stringify({
    type: record.type,
    timestamp: new Date(record.timestamp).toISOString(),
    data: stableData(record.data || {})
  });
}

function stableData(value) {
  if (Array.isArray(value)) return value.map(stableData);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      const normalized = stableData(value[key]);
      if (normalized !== "") result[key] = normalized;
      return result;
    }, {});
  }
  return value == null ? "" : value;
}

function clearAllData() {
  if (!confirm("すべての記録を削除します。この操作は元に戻せません。")) return;
  app.data = { version: 1, records: [] };
  saveData();
  showToast("全データを削除しました");
  render();
}

function syncReportRange() {
  const today = new Date();
  if (app.reportMode === "custom") return;
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  if (app.reportMode === "3days") start.setDate(start.getDate() - 2);
  if (app.reportMode === "7days") start.setDate(start.getDate() - 6);
  app.reportStart = dateKey(start);
  app.reportEnd = dateKey(end);
}

function recordsBetween(start, end) {
  return app.data.records
    .filter((record) => {
      const time = new Date(record.timestamp);
      return time >= start && time <= end;
    })
    .sort(byTime);
}

function byTime(a, b) {
  return new Date(a.timestamp) - new Date(b.timestamp);
}

function groupBy(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function dayRange(key) {
  return { start: startOfDay(key), end: endOfDay(key) };
}

function startOfDay(key) {
  const date = new Date(`${key}T00:00:00`);
  return date;
}

function endOfDay(key) {
  const date = new Date(`${key}T23:59:59.999`);
  return date;
}

function dateKey(input) {
  const date = input instanceof Date ? input : new Date(input);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey() {
  return dateKey(new Date());
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "full" }).format(date);
}

function formatDateKey(key) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "full" }).format(new Date(`${key}T00:00:00`));
}

function formatDateShort(input) {
  const date = input instanceof Date ? input : new Date(input);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTime(input) {
  const date = new Date(input);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function toDateTimeInput(input) {
  const date = new Date(input);
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberOrDash(value) {
  return value === "" || value == null ? "-" : String(value);
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value == null ? "" : value);
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // The app still works without service worker, for example when opened as a local file.
  });
}
