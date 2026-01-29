/* 학교 급식 조회 (NEIS Open API) */

const API_KEY = "8061bdfb66084052ad9e53cb0ea149c2";
const API_BASE = "https://open.neis.go.kr/hub";

const STORAGE_KEY = "schoolAlarm:selectedSchool:v1";

/** @typedef {{ atptCode: string, schulCode: string, name: string, region: string, kind?: string, addr?: string }} SelectedSchool */

const $ = (sel) => document.querySelector(sel);

const els = {
  schoolQuery: $("#schoolQuery"),
  btnSearch: $("#btnSearch"),
  schoolResults: $("#schoolResults"),
  selectedSchoolValue: $("#selectedSchoolValue"),
  btnReset: $("#btnReset"),
  dateInput: $("#dateInput"),
  rangeSelect: $("#rangeSelect"),
  btnFetchMeals: $("#btnFetchMeals"),
  btnToday: $("#btnToday"),
  status: $("#status"),
  meals: $("#meals"),
};

function ymdFromDate(date) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isoDateFromYmd(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function formatKoreanDate(ymd) {
  const iso = isoDateFromYmd(ymd);
  const dt = new Date(`${iso}T00:00:00`);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return {
    label: `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`,
    weekday: weekdays[dt.getDay()] || "",
  };
}

function setStatus(message, variant = "info") {
  els.status.textContent = message;
  els.status.classList.remove("status--error", "status--ok");
  if (variant === "error") els.status.classList.add("status--error");
  if (variant === "ok") els.status.classList.add("status--ok");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadSelectedSchool() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.atptCode || !obj?.schulCode || !obj?.name) return null;
    return /** @type {SelectedSchool} */ (obj);
  } catch {
    return null;
  }
}

function saveSelectedSchool(school) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(school));
}

function clearSelectedSchool() {
  localStorage.removeItem(STORAGE_KEY);
}

function renderSelectedSchool(school) {
  if (!school) {
    els.selectedSchoolValue.textContent = "-";
    return;
  }
  els.selectedSchoolValue.textContent = `${school.name} · ${school.region} (교육청:${school.atptCode}, 학교:${school.schulCode})`;
}

function buildUrl(endpoint, params) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("KEY", API_KEY);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", "100");
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fetchJson(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function extractNeisRows(json, rootKey) {
  // NEIS JSON: { schoolInfo: [ {head...}, {row:[...]} ] } 형태
  const root = json?.[rootKey];
  const row = Array.isArray(root) ? root.find((x) => x?.row)?.row : null;
  if (Array.isArray(row)) return row;

  // 결과 없음일 때: head 안에 RESULT/CODE만 있을 수 있음
  const head = Array.isArray(root) ? root.find((x) => x?.head)?.head : null;
  const result = Array.isArray(head) ? head.find((x) => x?.RESULT)?.RESULT : null;
  if (result?.CODE && result?.CODE !== "INFO-000") {
    return [];
  }
  return [];
}

async function searchSchools(query) {
  const url = buildUrl("schoolInfo", {
    SCHUL_NM: query,
  });
  const json = await fetchJson(url);
  const rows = extractNeisRows(json, "schoolInfo");
  return rows.map((r) => ({
    name: r.SCHUL_NM,
    region: r.ATPT_OFCDC_SC_NM,
    atptCode: r.ATPT_OFCDC_SC_CODE,
    schulCode: r.SD_SCHUL_CODE,
    kind: r.SCHUL_KND_SC_NM,
    addr: r.ORG_RDNMA,
  }));
}

function renderSchoolResults(items) {
  if (!items.length) {
    els.schoolResults.innerHTML =
      `<div class="pill">검색 결과가 없어요. (학교명을 더 길게 입력해 보세요)</div>`;
    return;
  }

  const listHtml = items
    .slice(0, 50)
    .map((s, idx) => {
      const sub = [s.kind, s.region, s.addr].filter(Boolean).join(" · ");
      return `
        <div class="resultItem">
          <div class="resultMeta">
            <div class="resultName">${escapeHtml(s.name)}</div>
            <div class="resultSub">${escapeHtml(sub)}</div>
            <div class="resultCodes">교육청: ${escapeHtml(s.atptCode)} · 학교: ${escapeHtml(s.schulCode)}</div>
          </div>
          <button class="btn btn--primary" type="button" data-pick="${idx}">선택</button>
        </div>
      `;
    })
    .join("");

  els.schoolResults.innerHTML = `<div class="resultList">${listHtml}</div>`;

  // 버튼 이벤트 위임
  els.schoolResults.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-pick"));
      const s = items[idx];
      if (!s) return;
      const selected = /** @type {SelectedSchool} */ ({
        atptCode: s.atptCode,
        schulCode: s.schulCode,
        name: s.name,
        region: s.region,
        kind: s.kind,
        addr: s.addr,
      });
      saveSelectedSchool(selected);
      renderSelectedSchool(selected);
      setStatus("학교를 저장했어요. 이제 급식을 조회해 보세요.", "ok");
      // 결과 영역 접기 느낌
      els.schoolResults.innerHTML = `<div class="pill">선택 완료: ${escapeHtml(selected.name)}</div>`;
    });
  });
}

function normalizeDishText(ddishNm) {
  // DDISH_NM: "밥<br/>국<br/>..." 형태 + 알레르기 "1.5.6." 등이 붙을 수 있음
  const withNewlines = String(ddishNm || "").replaceAll("<br/>", "\n").replaceAll("<br />", "\n");
  const lines = withNewlines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/\s*\([^)]*\)\s*$/, "").trim()); // 끝 괄호(알레르기 표기 등) 제거 시도
  return lines;
}

async function fetchMeals({ school, fromYmd, toYmd }) {
  const url = buildUrl("mealServiceDietInfo", {
    ATPT_OFCDC_SC_CODE: school.atptCode,
    SD_SCHUL_CODE: school.schulCode,
    MLSV_FROM_YMD: fromYmd,
    MLSV_TO_YMD: toYmd,
  });
  const json = await fetchJson(url);
  const rows = extractNeisRows(json, "mealServiceDietInfo");
  return rows.map((r) => ({
    ymd: r.MLSV_YMD,
    mealName: r.MMEAL_SC_NM, // 조식/중식/석식
    dishLines: normalizeDishText(r.DDISH_NM),
    kcal: r.CAL_INFO,
    origin: r.ORPLC_INFO,
    nutri: r.NTR_INFO,
  }));
}

function groupMealsByDate(rows) {
  /** @type {Record<string, {조식?: any, 중식?: any, 석식?: any, items: any[]}>} */
  const map = {};
  for (const r of rows) {
    if (!map[r.ymd]) map[r.ymd] = { items: [] };
    map[r.ymd].items.push(r);
    if (r.mealName === "조식") map[r.ymd].조식 = r;
    if (r.mealName === "중식") map[r.ymd].중식 = r;
    if (r.mealName === "석식") map[r.ymd].석식 = r;
  }
  return map;
}

function renderMeals(rows, fromYmd, toYmd) {
  els.meals.innerHTML = "";

  if (!rows.length) {
    els.meals.innerHTML =
      `<div class="pill">급식 정보가 없어요. (주말/방학/학교 일정일 수 있어요)</div>`;
    return;
  }

  const grouped = groupMealsByDate(rows);
  const dates = Object.keys(grouped).sort();

  const blocks = dates.map((ymd) => {
    const { label, weekday } = formatKoreanDate(ymd);
    const day = grouped[ymd] || {};

    const slots = [
      { key: "조식", title: "조식", icon: "🌅" },
      { key: "중식", title: "중식", icon: "🌞" },
      { key: "석식", title: "석식", icon: "🌙" },
    ].map((s) => {
      const item = day[s.key];
      if (!item) {
        return `
          <div class="mealSlot">
            <div class="mealSlot__title">${s.icon} ${s.title}</div>
            <div class="mealSlot__empty">정보 없음</div>
          </div>
        `;
      }
      const li = item.dishLines.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
      return `
        <div class="mealSlot">
          <div class="mealSlot__title">${s.icon} ${s.title}</div>
          <ul class="mealSlot__list">${li}</ul>
        </div>
      `;
    }).join("");

    return `
      <article class="mealDay">
        <div class="mealDay__head">
          <div>
            <div class="mealDay__date">${escapeHtml(label)}</div>
            <div class="mealDay__weekday">${escapeHtml(weekday)}요일</div>
          </div>
          <span class="pill">${escapeHtml(Object.values(day).filter((v) => v?.dishLines).length)}식 제공</span>
        </div>
        <div class="mealSlots">${slots}</div>
      </article>
    `;
  }).join("");

  els.meals.innerHTML = blocks;
  setStatus(
    `조회 완료: ${isoDateFromYmd(fromYmd)} ~ ${isoDateFromYmd(toYmd)} (총 ${rows.length}건)`,
    "ok",
  );
}

function getRangeFromSelection(baseIso, rangeMode) {
  const base = new Date(`${baseIso}T00:00:00`);
  const from = new Date(base);
  const to = new Date(base);
  if (rangeMode === "week") {
    to.setDate(to.getDate() + 6);
  }
  return { fromYmd: ymdFromDate(from), toYmd: ymdFromDate(to) };
}

async function onSearch() {
  const q = (els.schoolQuery.value || "").trim();
  els.schoolResults.innerHTML = "";
  if (q.length < 2) {
    setStatus("학교명은 2글자 이상 입력해 주세요.", "error");
    return;
  }

  setStatus("학교를 검색 중이에요…", "info");
  try {
    const items = await searchSchools(q);
    setStatus(`검색 결과: ${items.length}개`, items.length ? "ok" : "info");
    renderSchoolResults(items);
  } catch (e) {
    setStatus(`학교 검색 실패: ${e?.message || e}`, "error");
    els.schoolResults.innerHTML =
      `<div class="pill">검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.</div>`;
  }
}

async function onFetchMeals() {
  const school = loadSelectedSchool();
  if (!school) {
    setStatus("먼저 학교를 선택해 주세요.", "error");
    return;
  }

  const iso = els.dateInput.value;
  if (!iso) {
    setStatus("날짜를 선택해 주세요.", "error");
    return;
  }

  const range = els.rangeSelect.value;
  const { fromYmd, toYmd } = getRangeFromSelection(iso, range);

  setStatus("급식 정보를 불러오는 중이에요…", "info");
  els.meals.innerHTML = "";
  try {
    const rows = await fetchMeals({ school, fromYmd, toYmd });
    renderMeals(rows, fromYmd, toYmd);
  } catch (e) {
    setStatus(`급식 조회 실패: ${e?.message || e}`, "error");
    els.meals.innerHTML =
      `<div class="pill">급식 조회 중 오류가 발생했어요. (학교 코드/날짜를 확인해 주세요)</div>`;
  }
}

function setToday() {
  const today = new Date();
  els.dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function bindEvents() {
  els.btnSearch.addEventListener("click", onSearch);
  els.schoolQuery.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSearch();
  });

  els.btnFetchMeals.addEventListener("click", onFetchMeals);
  els.btnToday.addEventListener("click", () => {
    setToday();
    setStatus("날짜를 오늘로 설정했어요.", "ok");
  });

  els.btnReset.addEventListener("click", () => {
    clearSelectedSchool();
    renderSelectedSchool(null);
    els.schoolResults.innerHTML = "";
    els.meals.innerHTML = "";
    setStatus("저장된 학교를 초기화했어요.", "ok");
  });
}

function init() {
  setToday();
  bindEvents();

  const school = loadSelectedSchool();
  renderSelectedSchool(school);
  setStatus(school ? "저장된 학교가 있어요. 날짜를 선택하고 급식을 조회해 보세요." : "학교를 검색해서 선택해 주세요.", "info");
}

init();

