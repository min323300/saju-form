/**
 * 사주 자동분석 플랫폼 - Apps Script 전체 코드
 * 수정 v5: parseAiSections_ 강화 + Logger 디버그 추가
 */

const SHEET_NAME = "responses";

const EXTRA_HEADERS = [
  "AI처리상태", "AI처리시간", "사주요약", "건강주의",
  "추천음식", "피해야할음식", "상품추천키워드", "홍보문구"
];

const OPENAI_MODEL = "gpt-4o-mini";

// =============================================
// 시트 연결
// =============================================
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "등록일","유입경로","이름","전화번호","생년월일",
      "출생시간","음양력","성별","메모","접속정보",
      ...EXTRA_HEADERS
    ]);
  } else {
    ensureExtraHeaders_(sheet);
  }
  return sheet;
}

function ensureExtraHeaders_(sheet) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = EXTRA_HEADERS.filter(h => !headerRow.includes(h));
  if (missing.length > 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  }
}

// =============================================
// doPost: 저장 + AI 분석
// =============================================
function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const createdAt = new Date();

    const name      = (params.name       || "").trim();
    const phone     = (params.phone      || "").trim();
    const birthdate = (params.birthdate  || "").trim();
    const birthtime = (params.birthtime  || "").trim();
    const memo      = (params.memo       || "").trim();
    const ua        = (params.user_agent || "").substring(0, 200);

    let calendarType = (params.calendar_type || "").trim();
    let gender       = (params.gender        || "").trim();
    let source       = (params.source        || "").trim();

    if (calendarType === "solar") calendarType = "양력";
    if (calendarType === "lunar") calendarType = "음력";
    if (gender === "male")        gender = "남성";
    if (gender === "female")      gender = "여성";
    if (source === "github_pages") source = "홈페이지";
    if (!source) source = "기타";

    if (!name || !phone || !birthdate || !calendarType || !gender) {
      return json_({ ok: false, error: "missing_required_fields" });
    }

    const sheet = getSheet_();
    sheet.appendRow([
      createdAt, source, name, phone, "'" + birthdate,
      birthtime, calendarType, gender, memo, ua,
      "PENDING", "", "", "", "", "", "", ""
    ]);

    const rowIndex = sheet.getLastRow();

    try {
      runAiForRow_(sheet, rowIndex);
    } catch (aiErr) {
      writeAiError_(sheet, rowIndex, String(aiErr));
    }

    return json_({ ok: true, row: rowIndex });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// =============================================
// doGet: 결과 조회 + 헬스체크
// =============================================
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "";

  if (action === "getResult") {
    const phone     = (params.phone     || "").trim();
    const birthdate = (params.birthdate || "").trim();

    if (!phone || !birthdate) {
      return json_({ ok: false, error: "phone/birthdate 필요" });
    }

    try {
      const sheet   = getSheet_();
      const header  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col     = (name) => header.indexOf(name) + 1;
      const lastRow = sheet.getLastRow();

      for (let r = lastRow; r >= 2; r--) {
        const rowPhone = String(sheet.getRange(r, col("전화번호")).getValue()).trim();
        const rawBd    = sheet.getRange(r, col("생년월일")).getValue();

        let rowBd = "";
        if (rawBd instanceof Date) {
          rowBd = Utilities.formatDate(rawBd, "Asia/Seoul", "yyyy-MM-dd");
        } else {
          rowBd = String(rawBd).trim().replace(/^'/, "");
          if (rowBd.includes("T")) rowBd = rowBd.substring(0, 10);
        }

        if (rowPhone === phone && rowBd === birthdate) {
          const status = sheet.getRange(r, col("AI처리상태")).getValue();

          if (status === "DONE") {
            return json_({
              ok: true, status: "DONE",
              result: {
                summary:         sheet.getRange(r, col("사주요약")).getValue(),
                health:          sheet.getRange(r, col("건강주의")).getValue(),
                foods:           sheet.getRange(r, col("추천음식")).getValue(),
                avoid:           sheet.getRange(r, col("피해야할음식")).getValue(),
                productKeywords: sheet.getRange(r, col("상품추천키워드")).getValue(),
                promo:           sheet.getRange(r, col("홍보문구")).getValue()
              }
            });
          }
          if (status === "ERROR") return json_({ ok: true, status: "ERROR" });
          return json_({ ok: true, status: "PENDING" });
        }
      }

      return json_({ ok: true, status: "PENDING" });

    } catch (err) {
      return json_({ ok: false, error: String(err) });
    }
  }

  return json_({ ok: true, service: "saju-intake", time: new Date().toISOString() });
}

// =============================================
// AI 분석 실행
// =============================================
function runAiForRow_(sheet, rowIndex) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col    = (name) => header.indexOf(name) + 1;

  const name         = sheet.getRange(rowIndex, col("이름")).getValue();
  const birthdate    = sheet.getRange(rowIndex, col("생년월일")).getValue();
  const birthtime    = sheet.getRange(rowIndex, col("출생시간")).getValue();
  const calendarType = sheet.getRange(rowIndex, col("음양력")).getValue();
  const gender       = sheet.getRange(rowIndex, col("성별")).getValue();
  const memo         = sheet.getRange(rowIndex, col("메모")).getValue();

  sheet.getRange(rowIndex, col("AI처리상태")).setValue("PENDING");

  const prompt = buildSajuPrompt_({ name, birthdate, birthtime, calendarType, gender, memo });
  const aiText = callOpenAI_(prompt);
  const parsed = parseAiSections_(aiText);

  sheet.getRange(rowIndex, col("사주요약")).setValue(parsed.summary         || "");
  sheet.getRange(rowIndex, col("건강주의")).setValue(parsed.health          || "");
  sheet.getRange(rowIndex, col("추천음식")).setValue(parsed.foods           || "");
  sheet.getRange(rowIndex, col("피해야할음식")).setValue(parsed.avoid        || "");
  sheet.getRange(rowIndex, col("상품추천키워드")).setValue(parsed.productKeywords || "");
  sheet.getRange(rowIndex, col("홍보문구")).setValue(parsed.promo           || "");

  sheet.getRange(rowIndex, col("AI처리상태")).setValue("DONE");
  sheet.getRange(rowIndex, col("AI처리시간")).setValue(new Date());

  return parsed;
}

// =============================================
// 프롬프트 생성
// =============================================
function buildSajuPrompt_(d) {
  const bd = d.birthdate instanceof Date
    ? Utilities.formatDate(d.birthdate, "Asia/Seoul", "yyyy-MM-dd")
    : String(d.birthdate || "").trim().replace(/^'/, "");
  const bt = String(d.birthtime || "").trim();

  return `당신은 한국어로 답하는 '사주 기반 라이프스타일 안내' 작성자입니다.
아래 고객 입력을 바탕으로, 사주/오행을 "재미+참고용"으로만 해석해 주세요.
의학적 진단/치료 표현은 금지하고, 생활 습관/식습관 조언 수준으로만 작성하세요.

[고객 입력]
- 이름: ${d.name}
- 생년월일: ${bd}
- 출생시간: ${bt ? bt : "(미입력)"}
- 음양력: ${d.calendarType}
- 성별: ${d.gender}
- 메모: ${d.memo ? d.memo : "(없음)"}

아래 섹션 제목을 정확히 사용하여 출력하세요. 섹션 제목은 반드시 대괄호로 감싸주세요:

[사주요약]
5~7줄, 성향/강점/주의점 중심으로 작성

[건강주의]
4~6줄, 생활습관 조언 중심(의학적 표현 금지)

[추천음식]
- 추천음식1: 이유
- 추천음식2: 이유
- 추천음식3: 이유
- 추천음식4: 이유
- 추천음식5: 이유

[피해야할음식]
- 음식1: 이유
- 음식2: 이유
- 음식3: 이유

[상품추천키워드]
키워드1, 키워드2, 키워드3

[홍보문구]
2~3문장으로 추천 음식/상품을 자연스럽게 안내(이모지/특수문자/해시태그 없이)`;
}

// =============================================
// OpenAI Chat Completions 호출
// =============================================
function callOpenAI_(userPrompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY가 스크립트 속성에 없습니다.");

  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 1500
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error("OpenAI API 오류(" + code + "): " + body);
  }

  return JSON.parse(body).choices[0].message.content;
}

// =============================================
// ★ 강화된 파싱 함수 (v5)
// =============================================
function parseAiSections_(text) {
  Logger.log("=== AI 원본 응답 ===\n" + text);

  const get = (label) => {
    // 패턴1: [섹션명] ... 다음 [섹션명] 전까지
    const re1 = new RegExp("\\[" + label + "\\]\\s*([\\s\\S]*?)(?=\\s*\\[[^\\]]+\\]|$)", "i");
    const m1 = text.match(re1);
    if (m1 && m1[1].trim()) {
      Logger.log(label + " → (패턴1) " + m1[1].trim().substring(0, 50));
      return m1[1].trim();
    }
    Logger.log(label + " → 파싱 실패");
    return "";
  };

  return {
    summary:         get("사주요약"),
    health:          get("건강주의"),
    foods:           get("추천음식"),
    avoid:           get("피해야할음식"),
    productKeywords: get("상품추천키워드"),
    promo:           get("홍보문구")
  };
}

// =============================================
// 오류 기록
// =============================================
function writeAiError_(sheet, rowIndex, message) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col    = (name) => header.indexOf(name) + 1;
  sheet.getRange(rowIndex, col("AI처리상태")).setValue("ERROR");
  sheet.getRange(rowIndex, col("AI처리시간")).setValue(new Date());
  sheet.getRange(rowIndex, col("사주요약")).setValue("AI 처리 중 오류: " + message);
}

// =============================================
// JSON 응답 유틸
// =============================================
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================
// 테스트 함수들 (디버그용)
// =============================================
function testFetchPermission() {
  UrlFetchApp.fetch("https://api.openai.com/v1/models", {
    method: "get",
    headers: { Authorization: "Bearer test" },
    muteHttpExceptions: true
  });
}

function testOpenAI() {
  const prompt = buildSajuPrompt_({
    name: "테스트",
    birthdate: "1969-10-20",
    birthtime: "16:10",
    calendarType: "양력",
    gender: "남성",
    memo: ""
  });
  const result = callOpenAI_(prompt);
  Logger.log("=== 전체 응답 ===\n" + result);
  const parsed = parseAiSections_(result);
  Logger.log("=== 파싱 결과 ===");
  Logger.log("사주요약: " + parsed.summary.substring(0, 50));
  Logger.log("건강주의: " + parsed.health.substring(0, 50));
  Logger.log("추천음식: " + parsed.foods.substring(0, 50));
}
