// =============================================
// 설정: Apps Script 배포 URL을 여기에 입력하세요
// =============================================
const APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwDiF7BF7IXFF1rs8woq8k9CezFhKZSJ38-NnCfwA82TVzroKY5FftD4JF1ZpEXGzK8/exec";

// =============================================
// 폼 제출 핸들러
// =============================================
document.getElementById("saju-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const form = e.target;

  // 필수값 체크
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const birthdate = form.birthdate.value.trim();
  const calendarType = form.querySelector('input[name="calendar_type"]:checked')?.value;
  const gender = form.querySelector('input[name="gender"]:checked')?.value;
  const birthtime = form.birthtime.value.trim();
  const memo = form.memo.value.trim();

  if (!name || !phone || !birthdate || !calendarType || !gender) {
    alert("필수 항목을 모두 입력해 주세요.");
    return;
  }

  // UA 정보 수집
  const ua = navigator.userAgent.substring(0, 200);

  // 화면 전환: 폼 숨기기 → 로딩 표시
  showSection("loading");

  try {
    // FormData 구성
    const params = new URLSearchParams({
      name,
      phone,
      birthdate,
      birthtime,
      calendar_type: calendarType,
      gender,
      memo,
      source: "github_pages",
      user_agent: ua
    });

    const response = await fetch(APPS_SCRIPT_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "서버 오류");
    }

    if (data.result) {
      // 결과 데이터가 응답에 포함된 경우 바로 표시
      renderResult(name, data.result);
    } else if (data.row) {
      // 결과가 없으면 row 기반으로 폴링
      await pollResult(data.row, name);
    } else {
      throw new Error("응답 형식 오류");
    }

  } catch (err) {
    showError("처리 중 오류가 발생했습니다.<br>" + err.message);
  }
});

// =============================================
// 결과 폴링 (Apps Script가 결과를 즉시 반환하지 않을 때)
// =============================================
async function pollResult(rowIndex, name) {
  const maxTry = 20;
  const interval = 3000; // 3초마다

  for (let i = 0; i < maxTry; i++) {
    await sleep(interval);

    try {
      const res = await fetch(`${APPS_SCRIPT_WEBAPP_URL}?row=${rowIndex}`);
      const data = await res.json();

      if (data.ok && data.status === "DONE" && data.result) {
        renderResult(name, data.result);
        return;
      }

      if (data.status === "ERROR") {
        throw new Error("AI 분석 중 오류가 발생했습니다.");
      }

    } catch (err) {
      // 폴링 중 오류는 계속 시도
    }
  }

  showError("분석 시간이 초과되었습니다.<br>잠시 후 다시 시도해 주세요.");
}

// =============================================
// 결과 화면 렌더링
// =============================================
function renderResult(name, result) {
  // 이름 표시
  document.getElementById("result-name-label").textContent = `${name}님의 사주 분석 결과입니다`;

  // 사주요약
  setCardContent("res-summary", result.summary);

  // 건강주의
  setCardContent("res-health", result.health);

  // 추천음식
  setCardContent("res-foods", result.foods);

  // 피해야할음식
  setCardContent("res-avoid", result.avoid);

  // 상품추천키워드 → 뱃지 형태로 표시
  const keywords = result.productKeywords || "";
  const keywordEl = document.getElementById("res-keywords");
  keywordEl.innerHTML = keywords
    .split(/[,\n·\-]/)
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .map(k => `<span class="keyword-badge">${k}</span>`)
    .join(" ");

  // 홍보문구
  document.getElementById("res-promo").textContent = result.promo || "";

  showSection("result");
}

// =============================================
// 텍스트 → HTML 변환 (줄바꿈, 불릿 처리)
// =============================================
function setCardContent(id, text) {
  const el = document.getElementById(id);
  if (!text) {
    el.innerHTML = "<p>-</p>";
    return;
  }

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  el.innerHTML = lines
    .map(line => {
      // 불릿 기호 제거 후 <li> 처리
      if (/^[-•*]/.test(line)) {
        return `<li>${line.replace(/^[-•*]\s*/, "")}</li>`;
      }
      return `<p>${line}</p>`;
    })
    .join("")
    .replace(/(<li>.*<\/li>)+/gs, match => `<ul>${match}</ul>`);
}

// =============================================
// 화면 전환 유틸
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
