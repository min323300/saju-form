// =============================================
// 설정: Apps Script 배포 URL
// =============================================
const APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwDiF7BF7IXFF1rs8woq8k9CezFhKZSJ38-NnCfwA82TVzroKY5FftD4JF1ZpEXGzK8/exec";

// =============================================
// 폼 제출 핸들러
// =============================================
document.getElementById("saju-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const form = e.target;
  const name         = form.name.value.trim();
  const phone        = form.phone.value.trim();
  const birthdate    = form.birthdate.value.trim();
  const calendarType = form.querySelector('input[name="calendar_type"]:checked')?.value;
  const gender       = form.querySelector('input[name="gender"]:checked')?.value;
  const birthtime    = form.birthtime.value.trim();
  const memo         = form.memo.value.trim();

  if (!name || !phone || !birthdate || !calendarType || !gender) {
    alert("필수 항목을 모두 입력해 주세요.");
    return;
  }

  const ua = navigator.userAgent.substring(0, 200);
  const params = new URLSearchParams({
    name, phone, birthdate, birthtime,
    calendar_type: calendarType,
    gender, memo,
    source: "github_pages",
    user_agent: ua
  });

  showSection("loading");
  startLoadingUI(); // 진행바 + 타이머 시작

  try {
    await fetch(APPS_SCRIPT_WEBAPP_URL, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString()
    });

    await sleep(5000);
    await pollResult(name, phone, birthdate);

  } catch (err) {
    stopLoadingUI();
    showError("처리 중 오류가 발생했습니다.<br>" + err.message);
  }
});

// =============================================
// 로딩 UI: 진행바 + 경과시간
// =============================================
let loadingTimer = null;
let loadingStartTime = null;

function startLoadingUI() {
  loadingStartTime = Date.now();
  const bar      = document.getElementById("progress-bar");
  const timeEl   = document.getElementById("elapsed-time");
  const stageEl  = document.getElementById("loading-stage");

  const stages = [
    { at: 0,  text: "입력 정보를 전송하고 있습니다..." },
    { at: 5,  text: "사주 오행을 분석하고 있습니다..." },
    { at: 15, text: "건강 및 음식 궁합을 계산 중입니다..." },
    { at: 30, text: "맞춤 추천 결과를 생성하고 있습니다..." },
    { at: 50, text: "마무리 정리 중입니다..." }
  ];

  // 진행바는 60초 기준으로 부드럽게 증가 (최대 95%까지)
  loadingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
    const pct     = Math.min(95, Math.round((elapsed / 60) * 100));

    bar.style.width = pct + "%";
    timeEl.textContent = elapsed + "초 경과";

    // 단계 메시지 업데이트
    let currentStage = stages[0].text;
    for (const s of stages) {
      if (elapsed >= s.at) currentStage = s.text;
    }
    stageEl.textContent = currentStage;
  }, 500);
}

function stopLoadingUI() {
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
  // 완료 시 100%
  const bar = document.getElementById("progress-bar");
  if (bar) bar.style.width = "100%";
}

// =============================================
// GET 폴링: 결과 조회
// =============================================
async function pollResult(name, phone, birthdate) {
  const maxTry  = 25;
  const interval = 4000;

  for (let i = 0; i < maxTry; i++) {
    try {
      const url  = `${APPS_SCRIPT_WEBAPP_URL}?action=getResult&phone=${encodeURIComponent(phone)}&birthdate=${encodeURIComponent(birthdate)}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.ok && data.status === "DONE" && data.result) {
        stopLoadingUI();
        renderResult(name, data.result);
        return;
      }

      if (data.status === "ERROR") {
        stopLoadingUI();
        showError("AI 분석 중 오류가 발생했습니다.<br>잠시 후 다시 시도해 주세요.");
        return;
      }

    } catch (_) {}

    await sleep(interval);
  }

  stopLoadingUI();
  showError("분석 시간이 초과되었습니다.<br>잠시 후 다시 시도해 주세요.");
}

// =============================================
// 결과 렌더링
// =============================================
function renderResult(name, result) {
  document.getElementById("result-name-label").textContent = `${name}님의 사주 분석 결과입니다`;

  setCardContent("res-summary", result.summary);
  setCardContent("res-health",  result.health);
  setCardContent("res-foods",   result.foods);
  setCardContent("res-avoid",   result.avoid);

  const keywords  = result.productKeywords || "";
  const keywordEl = document.getElementById("res-keywords");
  keywordEl.innerHTML = keywords
    .split(/[,\n·\-]/)
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .map(k => `<span class="keyword-badge">${k}</span>`)
    .join(" ");

  document.getElementById("res-promo").textContent = result.promo || "";

  showSection("result");
}

function setCardContent(id, text) {
  const el = document.getElementById(id);
  if (!text) { el.innerHTML = "<p>-</p>"; return; }

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  el.innerHTML = lines
    .map(line => /^[-•*]/.test(line)
      ? `<li>${line.replace(/^[-•*]\s*/, "")}</li>`
      : `<p>${line}</p>`)
    .join("")
    .replace(/(<li>.*?<\/li>)+/gs, match => `<ul>${match}</ul>`);
}

// =============================================
// 유틸
// =============================================
function showSection(section) {
  ["form", "loading", "result", "error"].forEach(id => {
    const el = document.getElementById(`${id}-section`);
    if (el) el.classList.toggle("hidden", id !== section);
  });
}

function showError(msg) {
  document.getElementById("error-msg").innerHTML = msg;
  showSection("error");
}

function resetForm() {
  document.getElementById("saju-form").reset();
  showSection("form");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
