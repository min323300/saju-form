// 1) 아래 URL을 본인 Apps Script "웹 앱 배포 URL"로 바꾸세요.
const APPS_SCRIPT_WEBAPP_URL = "PASTE_YOUR_WEBAPP_URL_HERE";

const form = document.getElementById("sajuForm");
const statusEl = document.getElementById("status");
const iframe = document.getElementById("hidden_iframe");

// 폼 action을 런타임에 주입 (URL을 HTML에 직접 박지 않으려는 용도)
form.action = APPS_SCRIPT_WEBAPP_URL;

function normalizePhone(p) {
  return (p || "").replace(/[^\d]/g, "");
}

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.dataset.type = type;
}

form.addEventListener("submit", () => {
  setStatus("저장 중입니다...", "info");

  // 제출 직전 전화번호 정리
  const phoneInput = form.querySelector('input[name="phone"]');
  phoneInput.value = normalizePhone(phoneInput.value);

  // iframe이 로드되면 완료 처리(서버 응답 읽기 없이도 UX 제공)
  const doneHandler = () => {
    setStatus("저장 완료! 곧 상담 결과로 안내해드릴게요.", "ok");
    form.reset();
    iframe.removeEventListener("load", doneHandler);
  };
  iframe.addEventListener("load", doneHandler);

  // 안전장치: 8초 후에도 load가 없으면 안내
  setTimeout(() => {
    if (statusEl.textContent === "저장 중입니다...") {
      setStatus("저장은 진행 중일 수 있어요. 시트에서 저장 여부를 확인해 주세요.", "warn");
    }
  }, 8000);
});
