// =============================================
// 설정: Apps Script 배포 URL
// =============================================
const APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxH4yOePu4gZes7-Kdm7x3fWqd4X3G_OpmvmFRny0f3sKmNSQadV4TIOCEadTdJ5IMZ/exec";

// =============================================
// 전역 타이머 변수
// =============================================
var _timer = null;
var _startTime = 0;

var _stages = [
  { at: 0,  text: "입력 정보를 전송하고 있습니다..." },
  { at: 6,  text: "사주 오행을 분석하고 있습니다..." },
  { at: 18, text: "건강 및 음식 궁합을 계산 중입니다..." },
  { at: 35, text: "맞춤 추천 결과를 생성하고 있습니다..." },
  { at: 55, text: "마무리 정리 중입니다..." }
];

// =============================================
// 폼 제출 핸들러
// =============================================
document.getElementById("saju-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  var form        = e.target;
  var name        = form.name.value.trim();
  var phone       = form.phone.value.trim();
  var birthdate   = form.birthdate.value.trim();
  var calType     = (form.querySelector('input[name="calendar_type"]:checked') || {}).value;
  var gender      = (form.querySelector('input[name="gender"]:checked') || {}).value;
  var birthtime   = form.birthtime.value.trim();
  var memo        = form.memo.value.trim();

  if (!name || !phone || !birthdate || !calType || !gender) {
    alert("필수 항목을 모두 입력해 주세요.");
    return;
  }

  var ua = navigator.userAgent.substring(0, 200);
  var params = new URLSearchParams({
    name: name, phone: phone, birthdate: birthdate, birthtime: birthtime,
    calendar_type: calType, gender: gender, memo: memo,
    source: "github_pages", user_agent: ua
  });

  showSection("loading");
  startTimer();

  try {
    // no-cors POST
    await fetch(APPS_SCRIPT_WEBAPP_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    // POST 후 초기 대기 (모바일 고려해 3초로 단축)
    await sleep(3000);
    await pollResult(name, phone, birthdate);

  } catch (err) {
    stopTimer();
    showError("전송 오류가 발생했습니다.<br>" + err.message);
  }
});

// =============================================
// 타이머
// =============================================
function startTimer() {
  _startTime = Date.now();
  if (_timer) clearInterval(_timer);
  updateTimerUI();
  _timer = setInterval(updateTimerUI, 1000);
}

function updateTimerUI() {
  var elapsed = Math.floor((Date.now() - _startTime) / 1000);
  var pct     = Math.min(92, Math.round((elapsed / 90) * 100));

  var barEl   = document.getElementById("progress-bar");
  var timeEl  = document.getElementById("elapsed-time");
  var stageEl = document.getElementById("loading-stage");

  if (barEl)   barEl.style.width = pct + "%";
  if (timeEl)  timeEl.textContent = elapsed + "초 경과";

  if (stageEl) {
    var msg = _stages[0].text;
    for (var i = 0; i < _stages.length; i++) {
      if (elapsed >= _stages[i].at) msg = _stages[i].text;
    }
    stageEl.textContent = msg;
  }
}

function stopTimer(done) {
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (done) {
    var barEl = document.getElementById("progress-bar");
    if (barEl) barEl.style.width = "100%";
  }
}

// =============================================
// GET 폴링 - 모바일 최적화
// 최대 35회 × 3초 간격 = 최대 105초 대기
// =============================================
async function pollResult(name, phone, birthdate) {
  var maxTry   = 35;   // 횟수 늘림 (기존 25)
  var interval = 3000; // 간격 줄임 (기존 4000)
  var failCount = 0;   // 네트워크 실패 카운트
  var maxFail   = 5;   // 연속 실패 5회까지 허용

  for (var i = 0; i < maxTry; i++) {
    try {
      var url = APPS_SCRIPT_WEBAPP_URL
              + "?action=getResult"
              + "&phone="     + encodeURIComponent(phone)
              + "&birthdate=" + encodeURIComponent(birthdate);

      var res  = await fetch(url);
      var data = await res.json();

      failCount = 0; // 성공하면 실패 카운트 초기화

      if (data.ok && data.status === "DONE" && data.result) {
        stopTimer(true);
        renderResult(name, data.result);
        return;
      }
      if (data.status === "ERROR") {
        stopTimer(false);
        showError("AI 분석 중 오류가 발생했습니다.<br>다시 시도해 주세요.");
        return;
      }

    } catch (_) {
      failCount++;
      // 연속 실패가 많으면 간격을 늘려서 재시도
      if (failCount >= maxFail) {
        await sleep(5000);
        failCount = 0;
        continue;
      }
    }

    await sleep(interval);
  }

  stopTimer(false);
  showError("분석이 완료되었을 수 있습니다.<br>아래 버튼을 눌러 결과를 다시 확인해 주세요.");
  // 타임아웃 시 재조회 버튼 표시
  showRetryPoll(name, phone, birthdate);
}

// =============================================
// 타임아웃 후 재조회 버튼
// =============================================
function showRetryPoll(name, phone, birthdate) {
  var errSection = document.getElementById("error-section");
  var existing   = document.getElementById("retry-poll-btn");
  if (existing) return;

  var btn = document.createElement("button");
  btn.id        = "retry-poll-btn";
  btn.className = "btn-retry";
  btn.textContent = "결과 다시 확인하기";
  btn.style.marginTop = "10px";
  btn.onclick = async function() {
    showSection("loading");
    startTimer();
    await pollResult(name, phone, birthdate);
  };

  if (errSection) errSection.appendChild(btn);
}

// =============================================
// 결과 렌더링
// =============================================
function renderResult(name, result) {
  document.getElementById("result-name-label").textContent = name + "님의 사주 분석 결과입니다";

  setCardContent("res-summary", result.summary);
  setCardContent("res-health",  result.health);
  setCardContent("res-foods",   result.foods);
  setCardContent("res-avoid",   result.avoid);

  var keywords  = result.productKeywords || "";
  var keywordEl = document.getElementById("res-keywords");
  keywordEl.innerHTML = keywords
    .split(/[,\n·\-]/)
    .map(function(k){ return k.trim(); })
    .filter(function(k){ return k.length > 0; })
    .map(function(k){ return '<span class="keyword-badge">' + k + '</span>'; })
    .join(" ");

  document.getElementById("res-promo").textContent = result.promo || "";
  showSection("result");
}

function setCardContent(id, text) {
  var el = document.getElementById(id);
  if (!text) { el.innerHTML = "<p>-</p>"; return; }
  var lines = text.split("\n").map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
  el.innerHTML = lines.map(function(line) {
    return /^[-•*]/.test(line)
      ? "<li>" + line.replace(/^[-•*]\s*/, "") + "</li>"
      : "<p>" + line + "</p>";
  }).join("").replace(/(<li>[\s\S]*?<\/li>)+/g, function(m){ return "<ul>" + m + "</ul>"; });
}

// =============================================
// 유틸
// =============================================
function showSection(section) {
  ["form","loading","result","error"].forEach(function(id) {
    var el = document.getElementById(id + "-section");
    if (el) el.classList.toggle("hidden", id !== section);
  });
}

function showError(msg) {
  document.getElementById("error-msg").innerHTML = msg;
  showSection("error");
}

function resetForm() {
  stopTimer(false);
  // retry-poll-btn 있으면 제거
  var btn = document.getElementById("retry-poll-btn");
  if (btn) btn.remove();
  document.getElementById("saju-form").reset();
  showSection("form");
}

function sleep(ms) {
  return new Promise(function(resolve){ setTimeout(resolve, ms); });
}
