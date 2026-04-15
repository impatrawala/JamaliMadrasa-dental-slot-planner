(function () {
  const STORAGE_KEY = "dental-slot-planner:v2";
  const LEGACY_RECORD_KEYS = ["dental-checkup-tracker:v1"];
  const SHARED_SCHEDULE_URL = "schedule.json";
  const BASE_GLOBAL = {
    checkupDate: new Date().toISOString().slice(0, 10),
    startTime: "09:00",
    slotMinutes: 5,
    capacity: 1,
    breakMinutes: 5,
  };

  const defaultSchedule = {
    global: clone(BASE_GLOBAL),
    classes: [
      makeClass("JKG - Atfaal", 0),
      makeClass("SKG - Ibtidiyyah - A", 0),
      makeClass("SKG - Ibtidiyyah - B", 0),
    ],
  };

  const state = clone(defaultSchedule);
  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    purgeLegacyStudentRecords();
    await loadState();
    reflowClassStarts();
    renderAll();
  }

  function cacheElements() {
    [
      "addClassForm",
      "checkupDate",
      "classConfigBody",
      "copyBtn",
      "exportPlannerBtn",
      "globalBreak",
      "globalCapacity",
      "globalScheduleForm",
      "globalSlot",
      "globalStart",
      "importInput",
      "metrics",
      "newClassCount",
      "newClassName",
      "plannerImportInput",
      "reflowBtn",
      "resetBtn",
      "timelineBlocks",
      "toast",
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    });

    elements.addClassForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addClass(elements.newClassName.value, elements.newClassCount.value);
    });

    elements.importInput.addEventListener("change", importScheduleFile);
    elements.exportPlannerBtn.addEventListener("click", exportPlannerFile);
    elements.plannerImportInput.addEventListener("change", importPlannerFile);

    elements.globalScheduleForm.addEventListener("change", () => {
      const previousGlobal = { ...state.global };
      saveGlobalFromUi();
      applyGlobalDefaults(previousGlobal);
      reflowClassStarts();
      persist();
      renderAll();
    });

    elements.classConfigBody.addEventListener("change", (event) => {
      const target = event.target;
      const id = target.dataset.id;
      const field = target.dataset.field;
      if (!id || !field) return;

      const classItem = getClass(id);
      if (!classItem) return;

      if (field === "enabled") {
        classItem.enabled = target.checked;
      } else if (field === "name") {
        classItem.name = normalizeSpace(target.value) || "Untitled class";
      } else if (field === "startTime") {
        classItem.startTime = target.value || state.global.startTime;
        reflowAfter(classItem.id);
      } else {
        if (field === "studentCount" || field === "breakMinutes") {
          classItem[field] = wholeNumber(target.value, state.global[field] || 0);
        } else {
          classItem[field] = positiveNumber(target.value, state.global[field] || 1);
        }
        reflowAfter(classItem.id);
      }

      if (field === "enabled") reflowClassStarts();
      renderAll();
      persist();
    });

    elements.classConfigBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      if (button.dataset.action === "move") {
        moveClass(button.dataset.id, button.dataset.direction);
      }

      if (button.dataset.action === "remove") {
        removeClass(button.dataset.id);
      }
    });

    elements.reflowBtn.addEventListener("click", () => {
      saveGlobalFromUi();
      reflowClassStarts();
      persist();
      renderAll();
      showToast("Class start times updated.");
    });

    elements.copyBtn.addEventListener("click", copySchedule);

    elements.resetBtn.addEventListener("click", () => {
      if (!window.confirm("Reset all class counts and timing settings?")) return;
      Object.assign(state, clone(defaultSchedule));
      reflowClassStarts();
      persist();
      renderAll();
      showToast("Planner reset.");
    });
  }

  function showTab(tabName) {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabName);
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tabName);
    });
  }

  async function loadState() {
    if (await loadSharedSchedule()) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      applyScheduleData(parsed);
    } catch (error) {
      console.warn("Saved planner data could not be read.", error);
    }
  }

  async function loadSharedSchedule() {
    try {
      const response = await fetch(`${SHARED_SCHEDULE_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return false;
      const parsed = await response.json();
      applyScheduleData(parsed);
      return true;
    } catch (error) {
      console.warn("Shared schedule could not be loaded.", error);
      return false;
    }
  }

  function applyScheduleData(data) {
    state.global = { ...state.global, ...(data.global || {}) };
    state.classes = Array.isArray(data.classes) && data.classes.length
      ? data.classes.map(normalizeClass)
      : state.classes;
  }

  function purgeLegacyStudentRecords() {
    LEGACY_RECORD_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        global: state.global,
        classes: state.classes,
      })
    );
  }

  function renderAll() {
    renderGlobalSchedule();
    renderMetrics();
    renderClassConfig();
    renderTimeline();
  }

  function renderGlobalSchedule() {
    elements.checkupDate.value = state.global.checkupDate;
    elements.globalStart.value = state.global.startTime;
    elements.globalSlot.value = state.global.slotMinutes;
    elements.globalCapacity.value = state.global.capacity;
    elements.globalBreak.value = state.global.breakMinutes;
  }

  function renderMetrics() {
    const enabledClasses = state.classes.filter((classItem) => classItem.enabled);
    const students = enabledClasses.reduce((total, classItem) => total + wholeNumber(classItem.studentCount, 0), 0);
    const slots = enabledClasses.reduce((total, classItem) => total + slotCount(classItem), 0);
    const endTime = enabledClasses.length ? scheduleEndTime() : state.global.startTime;

    const metrics = [
      ["Classes", enabledClasses.length],
      ["Students", students],
      ["Slots", slots],
      ["Start", state.global.startTime],
      ["Finish", endTime],
    ];

    elements.metrics.innerHTML = metrics
      .map(([label, value]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
      .join("");
  }

  function renderClassConfig() {
    const rows = state.classes
      .map((classItem, index) => `
        <tr>
          <td data-label="Order">
            <div class="order-tools">
              <button type="button" class="tiny secondary" data-action="move" data-direction="up" data-id="${escapeAttr(classItem.id)}" ${index === 0 ? "disabled" : ""}>Up</button>
              <button type="button" class="tiny secondary" data-action="move" data-direction="down" data-id="${escapeAttr(classItem.id)}" ${index === state.classes.length - 1 ? "disabled" : ""}>Down</button>
            </div>
          </td>
          <td data-label="Class" class="class-name-cell">
            <input value="${escapeAttr(classItem.name)}" data-id="${escapeAttr(classItem.id)}" data-field="name" aria-label="Class name">
          </td>
          <td data-label="Students" class="class-inputs compact-field">
            <input type="number" min="0" max="300" value="${classItem.studentCount}" data-id="${escapeAttr(classItem.id)}" data-field="studentCount" aria-label="Student count">
          </td>
          <td data-label="Start" class="class-inputs compact-field">
            <input type="time" value="${escapeAttr(classItem.startTime)}" data-id="${escapeAttr(classItem.id)}" data-field="startTime" aria-label="Start time">
          </td>
          <td data-label="Slot min" class="class-inputs compact-field">
            <input type="number" min="1" max="60" value="${classItem.slotMinutes}" data-id="${escapeAttr(classItem.id)}" data-field="slotMinutes" aria-label="Slot minutes">
          </td>
          <td data-label="Per slot" class="class-inputs compact-field">
            <input type="number" min="1" max="50" value="${classItem.capacity}" data-id="${escapeAttr(classItem.id)}" data-field="capacity" aria-label="Students per slot">
          </td>
          <td data-label="Break" class="class-inputs compact-field">
            <input type="number" min="0" max="120" value="${classItem.breakMinutes}" data-id="${escapeAttr(classItem.id)}" data-field="breakMinutes" aria-label="Break after class">
          </td>
          <td data-label="Use">
            <input type="checkbox" ${classItem.enabled ? "checked" : ""} data-id="${escapeAttr(classItem.id)}" data-field="enabled" aria-label="Use ${escapeAttr(classItem.name)} in schedule">
          </td>
          <td data-label="Remove">
            <button type="button" class="tiny danger" data-action="remove" data-id="${escapeAttr(classItem.id)}">Delete</button>
          </td>
        </tr>
      `)
      .join("");

    elements.classConfigBody.innerHTML = rows || `<tr><td colspan="9" class="empty-state">Add a class to start planning.</td></tr>`;
  }

  function renderTimeline() {
    const blocks = state.classes
      .filter((classItem) => classItem.enabled)
      .map((classItem) => {
        const slots = slotCount(classItem);
        const start = toMinutes(classItem.startTime || state.global.startTime);
        const duration = slots * positiveNumber(classItem.slotMinutes, state.global.slotMinutes);
        const end = fromMinutes(start + duration);
        return `
          <div class="timeline-block">
            <b>${escapeHtml(classItem.name)}</b>
            <span>${escapeHtml(classItem.startTime)}-${escapeHtml(end)} - ${classItem.studentCount} students - ${slots} slot${slots === 1 ? "" : "s"} - ${classItem.breakMinutes} min break</span>
          </div>
        `;
      })
      .join("");

    elements.timelineBlocks.innerHTML = blocks || `<p class="small-text">No classes are enabled yet.</p>`;
  }

  function addClass(name, count) {
    const className = normalizeSpace(name);
    if (!className) return;

    state.classes.push(makeClass(className, wholeNumber(count, 0)));
    elements.addClassForm.reset();
    elements.newClassCount.value = 0;
    reflowClassStarts();
    persist();
    renderAll();
    showToast(`${className} added.`);
  }

  async function importScheduleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await readRowsFromFile(file);
      const importedClasses = rowsToClasses(rows);
      if (!importedClasses.length) {
        showToast("No class column was found in that file.");
        return;
      }

      if (!window.confirm(`Replace current classes with ${importedClasses.length} imported classes?`)) {
        return;
      }

      state.classes = importedClasses;
      reflowClassStarts();
      persist();
      renderAll();
      showTab("preview");
      showToast("Schedule created from upload.");
    } catch (error) {
      console.error(error);
      showToast("Upload failed. Try exporting the sheet as CSV.");
    } finally {
      event.target.value = "";
    }
  }

  async function readRowsFromFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();

    if (extension === "xlsx" || extension === "xls") {
      if (!window.XLSX) {
        throw new Error("Excel parser is not loaded.");
      }

      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }

    const text = await file.text();
    return parseDelimitedRows(text);
  }

  function parseDelimitedRows(text) {
    const normalizedText = text.replace(/\r/g, "").trim();
    if (!normalizedText) return [];

    const delimiter = normalizedText.includes("\t") ? "\t" : ",";
    const lines = normalizedText.split("\n").filter(Boolean);
    const headers = splitDelimitedLine(lines.shift(), delimiter);

    return lines.map((line) => {
      const values = splitDelimitedLine(line, delimiter);
      return headers.reduce((row, header, index) => {
        row[header] = values[index] || "";
        return row;
      }, {});
    });
  }

  function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const next = line[index + 1];

      if (character === '"' && next === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = !inQuotes;
      } else if (character === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  function rowsToClasses(rows) {
    if (!rows.length) return [];

    const headers = Object.keys(rows[0]);
    const classKey = findColumn(headers, ["class/level", "class level", "class", "level", "grade"]);
    const countKey = findColumn(headers, ["students", "student count", "count", "total", "number of students"]);
    if (!classKey) return [];

    const classCounts = new Map();

    rows.forEach((row) => {
      const className = normalizeSpace(row[classKey]);
      if (!className) return;

      const explicitCount = countKey ? Number(row[countKey]) : NaN;
      const current = classCounts.get(className) || 0;
      classCounts.set(className, current + (Number.isFinite(explicitCount) && explicitCount > 0 ? Math.floor(explicitCount) : 1));
    });

    return [...classCounts.entries()]
      .sort(([a], [b]) => compareClassNames(a, b))
      .map(([name, count]) => makeClass(name, count));
  }

  function findColumn(headers, candidates) {
    return headers.find((header) => {
      const cleaned = cleanColumnName(header);
      return candidates.some((candidate) => cleaned === cleanColumnName(candidate) || cleaned.includes(cleanColumnName(candidate)));
    });
  }

  function removeClass(id) {
    const classItem = getClass(id);
    if (!classItem) return;
    if (!window.confirm(`Delete ${classItem.name} from the planner?`)) return;

    state.classes = state.classes.filter((item) => item.id !== id);
    reflowClassStarts();
    persist();
    renderAll();
    showToast(`${classItem.name} removed.`);
  }

  function moveClass(id, direction) {
    const index = state.classes.findIndex((classItem) => classItem.id === id);
    if (index < 0) return;

    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= state.classes.length) return;

    [state.classes[index], state.classes[nextIndex]] = [state.classes[nextIndex], state.classes[index]];
    reflowClassStarts();
    persist();
    renderAll();
  }

  function saveGlobalFromUi() {
    state.global = {
      checkupDate: elements.checkupDate.value || defaultSchedule.global.checkupDate,
      startTime: elements.globalStart.value || defaultSchedule.global.startTime,
      slotMinutes: positiveNumber(elements.globalSlot.value, defaultSchedule.global.slotMinutes),
      capacity: positiveNumber(elements.globalCapacity.value, defaultSchedule.global.capacity),
      breakMinutes: wholeNumber(elements.globalBreak.value, defaultSchedule.global.breakMinutes),
    };
  }

  function applyGlobalDefaults(previousGlobal) {
    state.classes.forEach((classItem) => {
      if (Number(classItem.slotMinutes) === Number(previousGlobal.slotMinutes)) {
        classItem.slotMinutes = state.global.slotMinutes;
      }

      if (Number(classItem.capacity) === Number(previousGlobal.capacity)) {
        classItem.capacity = state.global.capacity;
      }

      if (Number(classItem.breakMinutes) === Number(previousGlobal.breakMinutes)) {
        classItem.breakMinutes = state.global.breakMinutes;
      }
    });
  }

  function reflowClassStarts() {
    let cursor = toMinutes(state.global.startTime);

    state.classes.forEach((classItem) => {
      if (!classItem.enabled) return;
      classItem.startTime = fromMinutes(cursor);
      cursor += slotCount(classItem) * positiveNumber(classItem.slotMinutes, state.global.slotMinutes);
      cursor += wholeNumber(classItem.breakMinutes, state.global.breakMinutes);
    });
  }

  function reflowAfter(id) {
    const startIndex = state.classes.findIndex((classItem) => classItem.id === id);
    if (startIndex < 0) return;

    let cursor = toMinutes(state.classes[startIndex].startTime || state.global.startTime);
    state.classes.slice(startIndex).forEach((classItem) => {
      if (!classItem.enabled) return;
      classItem.startTime = fromMinutes(cursor);
      cursor += slotCount(classItem) * positiveNumber(classItem.slotMinutes, state.global.slotMinutes);
      cursor += wholeNumber(classItem.breakMinutes, state.global.breakMinutes);
    });
  }

  function scheduleEndTime() {
    const enabledClasses = state.classes.filter((classItem) => classItem.enabled);
    if (!enabledClasses.length) return state.global.startTime;

    const lastClass = enabledClasses[enabledClasses.length - 1];
    const start = toMinutes(lastClass.startTime || state.global.startTime);
    const duration = slotCount(lastClass) * positiveNumber(lastClass.slotMinutes, state.global.slotMinutes);
    return fromMinutes(start + duration);
  }

  async function copySchedule() {
    const lines = [
      `Dental checkup schedule for ${state.global.checkupDate}`,
      "",
      ...state.classes
        .filter((classItem) => classItem.enabled)
        .map((classItem) => {
          const start = toMinutes(classItem.startTime || state.global.startTime);
          const end = fromMinutes(start + slotCount(classItem) * positiveNumber(classItem.slotMinutes, state.global.slotMinutes));
          return `${classItem.startTime}-${end}: ${classItem.name} (${classItem.studentCount} students, ${slotCount(classItem)} slots)`;
        }),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Schedule copied.");
    } catch (error) {
      console.warn("Clipboard copy failed.", error);
      showToast("Copy failed. Select the schedule preview manually.");
    }
  }

  function exportPlannerFile() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      global: state.global,
      classes: state.classes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jamali-dental-planner-${state.global.checkupDate || new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importPlannerFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const importedClasses = Array.isArray(parsed.classes) ? parsed.classes.map(normalizeClass) : [];
      if (!importedClasses.length) {
        showToast("That planner file has no classes.");
        return;
      }

      if (!window.confirm(`Load ${importedClasses.length} classes from this planner file?`)) {
        return;
      }

      state.global = { ...state.global, ...(parsed.global || {}) };
      state.classes = importedClasses;
      reflowClassStarts();
      persist();
      renderAll();
      showTab("preview");
      showToast("Planner imported.");
    } catch (error) {
      console.error(error);
      showToast("Planner import failed. Use a planner JSON export.");
    } finally {
      event.target.value = "";
    }
  }

  function getClass(id) {
    return state.classes.find((classItem) => classItem.id === id);
  }

  function compareClassNames(a, b) {
    const rankA = classRank(a);
    const rankB = classRank(b);
    return rankA - rankB || a.localeCompare(b);
  }

  function classRank(className) {
    const lower = className.toLowerCase();
    if (lower.startsWith("jkg")) return 0;
    if (lower.startsWith("skg")) return 1;
    const grade = Number((className.match(/^\d+/) || [99])[0]);
    return Number.isFinite(grade) ? grade + 1 : 99;
  }

  function makeClass(name, studentCount) {
    return normalizeClass({
      id: `class-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      studentCount,
      enabled: true,
      startTime: BASE_GLOBAL.startTime,
      slotMinutes: BASE_GLOBAL.slotMinutes,
      capacity: BASE_GLOBAL.capacity,
      breakMinutes: BASE_GLOBAL.breakMinutes,
    });
  }

  function normalizeClass(classItem) {
    return {
      id: classItem.id || `class-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: normalizeSpace(classItem.name) || "Untitled class",
      studentCount: wholeNumber(classItem.studentCount, 0),
      enabled: classItem.enabled !== false,
      startTime: normalizeSpace(classItem.startTime) || "09:00",
      slotMinutes: positiveNumber(classItem.slotMinutes, 5),
      capacity: positiveNumber(classItem.capacity, 1),
      breakMinutes: wholeNumber(classItem.breakMinutes, 5),
    };
  }

  function slotCount(classItem) {
    const count = wholeNumber(classItem.studentCount, 0);
    if (count === 0) return 0;
    return Math.ceil(count / positiveNumber(classItem.capacity, state.global.capacity));
  }

  function toMinutes(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return wholeNumber(hours, 0) * 60 + wholeNumber(minutes, 0);
  }

  function fromMinutes(minutes) {
    const day = 24 * 60;
    const wrapped = ((minutes % day) + day) % day;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  function wholeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanColumnName(value) {
    return normalizeSpace(value).toLowerCase().replace(/[:#]/g, "");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }
})();
