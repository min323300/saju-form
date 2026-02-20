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

  showSection("loading");

  const params = new URLSearchParams({
    name, phone, birthdate, birthtime,
    calendar_type: calendarType,
    gender, memo,
    source: "github_pages",
    user_agent: ua
  });

  try {
    // =============================================
    // CORS 우회: no-cors 모드로 POST
    // (Apps Script에 데이터는 전달되지만 응답은 못 읽음)
    // =============================================
    await fetch(APPS_SCRIPT_WEBAPP_URL, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString()
    });

    // POST 후 Apps Script가 처리할 시간을 잠시 대기 후 GET 폴링 시작
    await sleep(5000);
    await pollResult(name, phone, birthdate);

  } catch (err) {
    showError("처리 중 오류가 발생했습니다.<br>" + err.message);
  }
});

// =============================================
// GET 폴링: Apps Script doGet에 phone+birthdate로 결과 조회
// (GET은 CORS 허용됨)
// =============================================
async function pollResult(name, phone, birthdate) {
  const maxTry  = 20;
  const interval = 4000;

  for (let i = 0; i < maxTry; i++) {

    try {
      const url = `${APPS_SCRIPT_WEBAPP_URL}?action=getResult&phone=${encodeURIComponent(phone)}&birthdate=${encodeURIComponent(birthdate)}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.ok && data.status === "DONE" && data.result) {
        renderResult(name, data.result);
        return;
      }

      if (data.status === "ERROR") {
        showError("AI 분석 중 오류가 발생했습니다.<br>잠시 후 다시 시도해 주세요.");
        return;
      }

    } catch (_) {
      // 폴링 중 오류는 계속 재시도
    }

    await sleep(interval);
  }

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
