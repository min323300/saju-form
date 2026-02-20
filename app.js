const APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxH4yOePu4gZes7-Kdm7x3fWqd4X3G_OpmvmFRny0f3sKmNSQadV4TIOCEadTdJ5IMZ/exec";

var _timer = null;
var _startTime = 0;
var _stages = [
  { at: 0,  text: "입력 정보를 전송하고 있습니다..." },
  { at: 6,  text: "사주 오행을 분석하고 있습니다..." },
  { at: 18, text: "건강 및 음식 궁합을 계산 중입니다..." },
  { at: 35, text: "맞춤 추천 결과를 생성하고 있습니다..." },
  { at: 55, text: "마무리 정리 중입니다..." }
];

document.getElementById("saju-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  var form      = e.target;
  var name      = form.querySelector('[name="name"]').value.trim();
  var phone     = form.querySelector('[name="phone"]').value.trim();
  var birthdateRaw = form.querySelector('[name="birthdate"]').value.trim();
  var calType   = (form.querySelector('input[name="calendar_type"]:checked') || {}).value;
  var gender    = (form.querySelector('input[name="gender"]:checked') || {}).value;
  var birthtime = form.querySelector('[name="birthtime"]').value.trim();
  var memo      = form.querySelector('[name="memo"]').value.trim();

  if (!name || !phone || !birthdateRaw || !calType || !gender) {
    alert("필수 항목을 모두 입력해 주세요.");
    return;
  }

  // ★ 생년월일을 항상 yyyy-MM-dd 형식으로 정규화
  var birthdate = normalizeDateStr(birthdateRaw);

  // ★ 전화번호 정규화 (숫자만 추출 후 010-xxxx-xxxx 형식)
  var phoneNorm = normalizePhone(phone);

  var ua = navigator.userAgent.substring(0, 200);
  var params = new URLSearchParams({
    name: name, phone: phoneNorm, birthdate: birthdate, birthtime: birthtime,
    calendar_type: calType, gender: gender, memo: memo,
    source: "github_pages", user_agent: ua
  });

  showSection("loading");
  startTimer();

  try {
    await fetch(APPS_SCRIPT_WEBAPP_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    await sleep(5000);
    await pollResult(name, phoneNorm, birthdate);

  } catch (err) {
    stopTimer();
    showError("전송 오류가 발생했습니다.<br>" + err.message);
  }
});

// =============================================
// 날짜 정규화: 어떤 형식이든 yyyy-MM-dd로 변환
// =============================================
function normalizeDateStr(str) {
  if (!str) return "";
  // 이미 yyyy-MM-dd 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // yyyy/MM/dd → yyyy-MM-dd
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, "-");
  // 숫자만 있는 경우 yyyyMMdd → yyyy-MM-dd
  if (/^\d{8}$/.test(str)) return str.substring(0,4)+"-"+str.substring(4,6)+"-"+str.substring(6,8);
  return str;
}

// =============================================
// 전화번호 정규화
// =============================================
function normalizePhone(phone) {
  var digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 11) {
    return digits.substring(0,3) + "-" + digits.substring(3,7) + "-" + digits.substring(7,11);
  }
  return phone; // 변환 불가 시 원본 반환
}

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
// GET 폴링 - 2초 간격, 60회 = 최대 120초
// =============================================
async function pollResult(name, phone, birthdate) {
  var maxTry   = 60;
  var interval = 2000; // ★ 2초로 단축
  var failCount = 0;

  for (var i = 0; i < maxTry; i++) {
    try {
      var url = APPS_SCRIPT_WEBAPP_URL
              + "?action=getResult"
              + "&phone="     + encodeURIComponent(phone)
              + "&birthdate=" + encodeURIComponent(birthdate);

      var res  = await fetch(url);
      var data = await res.json();

      failCount = 0;

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
      if (failCount >= 5) {
        await sleep(5000);
        failCount = 0;
        continue;
      }
    }

    await sleep(interval);
  }

  stopTimer(false);
  showError("분석이 완료되었을 수 있습니다.<br>아래 버튼을 눌러 결과를 확인해 주세요.");
  showRetryPoll(name, phone, birthdate);
}

// =============================================
// 재조회 버튼
// =============================================
function showRetryPoll(name, phone, birthdate) {
  var errSection = document.getElementById("error-section");
  var existing   = document.getElementById("retry-poll-btn");
  if (existing) return;
  var btn = document.createElement("button");
  btn.id = "retry-poll-btn";
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
  var btn = document.getElementById("retry-poll-btn");
  if (btn) btn.remove();
  document.getElementById("saju-form").reset();
  showSection("form");
}

function sleep(ms) {
  return new Promise(function(resolve){ setTimeout(resolve, ms); });
}
