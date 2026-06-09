# 메뉴판 웹 에디터 — 기술 인수인계 & 회고 문서

**작성일**: 2026-06-04  
**담당자**: 허재우 (Jaewoo Heo)  
**저장소**: `github.com/jaewoo-heo/menu-editor`  
**배포 URL**: GitHub Pages (GitHub Actions 자동 배포)

---

## 1. 프로젝트 배경 및 목적

### 업무 배경

매장 메뉴판을 디자인 툴(Figma, Photoshop 등) 없이 **비개발자도 직접 편집·인쇄**할 수 있는 자체 웹 에디터가 필요했음.  
기존에는 디자인 작업을 외주 또는 담당자에게 매번 요청해야 했고, 메뉴 변경 시 즉각 반영이 어려웠음.

### 핵심 해결 목표

| 문제 | 해결 방향 |
|---|---|
| 디자인 툴 없이 메뉴판 제작 불가 | 브라우저 기반 WYSIWYG 에디터 구축 |
| 팀원 간 메뉴 데이터 공유 불가 | Supabase를 통한 클라우드 동기화 |
| 인쇄용 PDF 직접 생성 불가 | html2canvas + jsPDF 기반 A4 PDF 출력 |
| 이미지 업로드 시 성능 저하 | Canvas API 기반 자동 압축 (600px / JPEG 75%) |

---

## 2. 시스템 구조 및 동작 로직

### 기술 스택

```
Frontend        Vanilla JS (ES6+), HTML5, CSS3
                — 프레임워크 없음, 빌드 도구 없음
                — GitHub Pages에서 정적 파일로 직접 서빙

외부 라이브러리  @supabase/supabase-js v2  (클라우드 DB)
                html2canvas 1.4.1          (DOM → Canvas 캡처)
                jsPDF 2.5.1                (Canvas → PDF 변환)

폰트            Google Fonts 12종
                (Playfair Display, Noto Serif KR, Noto Sans KR,
                 나눔명조, 블랙한산스, 도현, 주아, 고운돋움, 싱글데이 등)

이미지 검색      Pixabay API (유료 키 입력 시) / loremflickr (무료 폴백)

CI/CD           GitHub Actions → GitHub Pages 자동 배포
                (Secrets 주입: SUPABASE_URL, SUPABASE_ANON_KEY, PIXABAY_API_KEY)
```

### 파일 구조

```
menu/
├── index.html               # UI 뼈대 (툴바, 에디터 패널, 프리뷰 패널, 이미지 모달)
├── style.css                # 전체 스타일 (레이아웃 6종, 에디터 UI, 이미지 컨트롤)
├── app.js                   # 전체 애플리케이션 로직 (~1,300줄)
└── .github/
    └── workflows/
        └── deploy.yml       # Secrets 치환 → GitHub Pages 배포 파이프라인
```

### 전체 데이터 흐름

```
사용자 조작
    │
    ▼
상태 객체 S (단일 진실 원천)
    │  ┌──────────────────────────────────┐
    │  │ S = {                            │
    │  │   layout, bg, font, fs,          │
    │  │   cur,  ← 현재 페이지 인덱스     │
    │  │   pages: [{                      │
    │  │     type, title, subtitle,       │
    │  │     headerImg, headerImgSize,    │
    │  │     items: [{                    │
    │  │       name, desc, price,         │
    │  │       img (base64 압축),         │
    │  │       imgX, imgY,  ← 위치 0-100%│
    │  │       imgScale,    ← 줌 20-200% │
    │  │       imgSize,     ← 프레임 크기│
    │  │       imgShape,    ← 프레임 모양│
    │  │       showName, showDesc, showPrice
    │  │     }]                           │
    │  │   }]                             │
    │  │ }                                │
    │  └──────────────────────────────────┘
    │
    ├─→ renderPreview()    → #menuPreview innerHTML 갱신 (실시간)
    ├─→ renderItems()      → 에디터 아이템 카드 갱신
    ├─→ saveState()        → localStorage 자동 저장 (디바운스 800ms)
    └─→ saveToCloud()      → Supabase upsert (수동 버튼만)
```

### 저장 / 동기화 전략 (핵심 설계 결정)

```
자동: localStorage  ←── 모든 변경 즉시 (800ms 디바운스)
수동: Supabase      ←── '☁️ 서버 저장' 버튼 클릭 시만
수동: Supabase      ──→ '📥 불러오기' 버튼 클릭 시만 (confirm 다이얼로그 필수)
```

> **⚠️ 중요 설계 의도**: 자동 클라우드 동기화를 **의도적으로 제거**했음.  
> 초기 구현에서 앱 접속 시 자동으로 서버 데이터를 불러왔더니,  
> 새 사용자가 앱을 열 때마다 이미 작성한 로컬 작업이 서버 데이터로 덮어씌워지는 **데이터 손실**이 발생했기 때문.

### 레이아웃 종류 (6종)

| ID | 이름 | 분위기 | CSS 클래스 |
|---|---|---|---|
| `coffee` | 카페 | 따뜻한 브라운, 원형 이미지 | `.lc` |
| `modern` | 모던 | 다크 배경, 2열 그리드 | `.lm` |
| `elegant` | 엘레강스 | 크림 + 골드 테두리 | `.le` |
| `chalk` | 칠판 | 다크 그린, 흰색 손글씨 | `.lk` |
| `bistro` | 비스트로 | 다크 브라운, 이탤릭 | `.lb` |
| `minimal` | 미니멀 | 화이트, 얇은 선 | `.lmin` |

---

## 3. 주요 트러블슈팅

### 🔴 T1. PDF 출력 시 텍스트 겹침 / 잘림

**증상**: PDF 출력 버튼 클릭 시 폰트가 작게 겹치거나 레이아웃이 찌그러짐.

**원인 분석**  
`scalePreview()` 함수가 `requestAnimationFrame`으로 프리뷰를 `scale(x)` 변환하고 있었음.  
`exportPDF()`에서 리셋 시도(`scale(1)`) 후 150ms 대기했지만,  
rAF 콜백이 대기 도중 실행되어 다시 `scale(x)`로 덮어쓰는 **타이밍 레이스 조건** 발생.

**해결**  
화면 밖 오프스크린 DOM에 별도 `<div>` 생성(`left: -1600px`) →  
scaler 변환과 완전히 분리된 독립 공간에서 794px 실제 크기로 렌더링 후 캡처.

```javascript
// 핵심: scaler의 transform 간섭을 완전 차단
const offscreen = document.createElement('div');
offscreen.style.cssText = 'position:fixed;left:-1600px;top:0;z-index:-9999;pointer-events:none;';
const tempEl = document.createElement('div');
offscreen.appendChild(tempEl);
document.body.appendChild(offscreen);
// → tempEl에 794px 너비로 렌더링, html2canvas 캡처
// → 화면의 scalePreview() rAF와 완전히 무관
```

---

### 🔴 T2. Supabase WebSocket 연결 끊김 무한 루프

**증상**: "연결 끊김" 토스트가 계속 반복 표시, 콘솔에 WebSocket 에러 무한 출력.

**원인 분석**  
Realtime WebSocket이 회사 네트워크 방화벽에서 차단됨.  
재연결 로직이 5초마다 무한 반복하도록 구현되어 있었음.

**해결**  
단계별로 Realtime → 폴링 → 수동 전용으로 점진적 후퇴.  
최종 결론: Realtime 완전 제거, REST API(upsert/select) 기반 **수동 저장/불러오기**만 유지.  
→ WebSocket 관련 에러 및 UX 불편 근본 해결.

---

### 🔴 T3. Supabase URL 오타로 ERR_NAME_NOT_RESOLVED

**증상**: 배포 후 모든 Supabase 요청에서 `ERR_NAME_NOT_RESOLVED`.

**원인 분석**  
GitHub Secret에 설정된 URL이 `vwnkwfplq**ii**j...` (i 2개)였으나  
실제 Supabase URL은 `vwnkwfplq**ij**j...` (i 하나, j 하나)였음. 한 글자 오타.

**해결**: Secret 수정 후 빈 커밋으로 재배포 트리거.  
**재발 방지**: `initSupabase()`에서 URL에 `'PLACEHOLDER'` 포함 여부를 체크하여 로컬/서버 모드 명시적 분기.

```javascript
function initSupabase() {
  if (SUPABASE_URL.includes('PLACEHOLDER') || SUPABASE_ANON_KEY.includes('PLACEHOLDER')) {
    setSyncStatus('⚪ 로컬 모드', 'local');
    return;  // 로컬에서 실행 시 조용히 폴백
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setSyncStatus('☁️ 서버 연결됨', 'connected');
}
```

---

### 🔴 T4. 이미지 업로드 후 localStorage 용량 초과 / Supabase 타임아웃

**증상**: 이미지를 여러 장 추가하면 앱이 느려지고 저장 타임아웃 발생.

**원인 분석**  
스마트폰 촬영 원본 이미지(3~10MB)를 base64로 그대로 localStorage에 저장 → 5~10MB 한계 초과.  
Supabase 권장 row 크기 1MB도 초과.

**해결**  
업로드 시 Canvas API로 자동 리사이즈(최대 600px) + JPEG 압축(75%) → 평균 50~80KB로 축소.  
PNG는 투명도 보존을 위해 PNG 포맷 유지 (JPEG 변환 시 투명 영역이 검정으로 변환되는 문제 방지).

```javascript
function handleUpload(input) {
  const isPng = file.type === 'image/png';
  // ...
  if (!isPng) {
    ctx.fillStyle = '#ffffff';  // JPEG 변환 전 흰색 배경으로 투명 영역 처리
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  const compressed = isPng
    ? canvas.toDataURL('image/png')           // PNG: 투명도 보존 (무손실)
    : canvas.toDataURL('image/jpeg', 0.75);   // 기타: 75% 품질 JPEG
}
```

---

### 🔴 T5. 폰트 변경 시 일부 텍스트만 적용

**증상**: 폰트 드롭다운에서 '도현' 선택 시 카테고리, 설명 텍스트는 여전히 이전 폰트 표시.

**원인 분석**  
CSS 레이아웃 클래스(`.lc`, `.lm`, `.le` 등 6개)와 커버 클래스(`.cover-coffee` 등 6개),  
그리고 `.lc .m-cat`, `.lc .m-desc` 등 자식 규칙 **총 19개**에 `font-family`가 하드코딩되어 있었음.  
JavaScript에서 `#menuPreview`에 설정한 폰트보다 CSS 명시도(specificity)가 높아 무조건 덮어씌워짐.

**해결**: 19개 CSS 규칙에서 `font-family` 선언 전량 제거 → `#menuPreview`의 `font-family: S.font` 상속으로 통일.

---

### 🔴 T6. 아이템 5개 이상 시 PDF 좌우 공백

**증상**: 메뉴 아이템 4개까지는 A4에 꽉 찼는데, 5개 이상이면 양쪽에 흰 여백 발생.

**원인 분석**  
아이템이 많으면 렌더링된 높이가 A4(1123px)를 초과함.  
이때 `Math.min(너비비율, 높이비율)` 방식으로 PDF 배치하면 **높이 비율이 더 작아져**  
높이 기준으로 전체를 축소 → 너비가 줄어 좌우 여백 발생.

```
// 예: 5개 아이템, 렌더 높이 1300px
canvas: 1588 × 2600px
ratio = min(210/1588, 297/2600) = min(0.132, 0.114) = 0.114  ← 높이 기준
PDF 너비: 1588 × 0.114 = 181mm  (A4 210mm 대비 → 좌우 각 14.5mm 공백)
```

**해결**: 캡처 전 `scrollHeight` 측정 → 1123px 초과 시 CSS `zoom`으로 자동 축소 → 항상 너비 기준으로 A4 꽉 채움.

```javascript
const naturalH = tempEl.scrollHeight;
const fitZoom  = naturalH > 1123 ? 1123 / naturalH : 1;
if (fitZoom < 1) {
  tempEl.style.zoom = fitZoom.toFixed(5);  // 레이아웃 흐름에 반영됨
  await new Promise(r => setTimeout(r, 80));
}
const canvas = await html2canvas(tempEl, { scale: 2, ... });
// 항상 A4 너비를 꽉 채워 배치
const fillH = canvas.height * (pdfW / canvas.width);
pdf.addImage(imgData, 'JPEG', 0, fillY, pdfW, fillH);
```

---

### 🟡 T7. renderItems() 재호출 시 열린 카드가 닫히는 UX 버그

**증상**: 이미지 위치·모양 버튼 클릭 후 active 상태가 갱신되지 않거나, 갱신 시 카드가 닫힘.

**원인 분석**  
`setField()` 호출 후 `renderItems()`를 호출하지 않아 버튼 active 상태 미갱신.  
`renderItems()` 호출 시 `container.innerHTML = ''`로 전체 재빌드 → `.open` 클래스 소멸.

**해결**
1. 재빌드 전 열린 카드 ID 저장 → 재빌드 후 복원
2. imgShape 변경 시에만 `renderItems()` 호출, imgX/imgY 슬라이더는 DOM 직접 조작

```javascript
// renderItems() 진입 시 열린 상태 스냅샷
const openIds = new Set(
  [...container.querySelectorAll('.item-body.open')].map(el => el.id.replace('body-',''))
);
// ... innerHTML 재빌드 ...
// 복원
openIds.forEach(id => document.getElementById('body-' + id)?.classList.add('open'));
```

---

## 4. 핵심 구동 코드

### 4-1. 단일 상태 객체 S — 전체 앱의 진실 원천

```javascript
// 모든 렌더·저장·동기화는 이 객체를 단일 원천으로 사용
const DEFAULT_STATE = {
  layout: 'coffee',                       // 레이아웃 테마 ID
  bg: '#F5EFE6',                          // 배경색
  font: "'Playfair Display',serif",       // 선택된 폰트
  fs: { title:76, cat:30, sub:14, name:26, desc:13, price:13 }, // 글씨 크기
  cur: 0,                                 // 현재 표시 페이지 인덱스
  pages: [{
    id, type,                             // 'cover' | 'menu'
    title, subtitle, tagline, category,
    headerImg, headerImgSize,             // 페이지 로고 이미지
    items: [{
      id, name, desc, price,
      img,                                // base64 (압축 완료)
      imgX, imgY,                         // object-position (0~100%)
      imgScale, imgSize,                  // 내부 줌(20~200%), 프레임 크기(40~160%)
      imgShape,                           // 'default'|'circle'|'rounded'|'square'
      showName, showDesc, showPrice
    }]
  }]
};
let S = JSON.parse(JSON.stringify(DEFAULT_STATE)); // 딥카피로 초기화
```

---

### 4-2. 렌더 파이프라인 — 상태 → UI

```javascript
// 모든 변경의 최종 단계. 상태(S)를 읽어 #menuPreview를 완전히 재렌더
function renderPreview() {
  const p  = curPage();
  const el = document.getElementById('menuPreview');
  el.style.background = S.bg;
  el.style.fontFamily = S.font; // ← CSS 클래스에 font-family 없음, 여기서만 제어

  if (p.type === 'cover') {
    el.className = 'cover-page';
    el.innerHTML = tplCover(p);
  } else {
    const cls = { coffee:'lc', modern:'lm', elegant:'le',
                  chalk:'lk', bistro:'lb', minimal:'lmin' }[S.layout];
    el.className = cls;
    el.innerHTML = { coffee:tplCoffee, modern:tplModern, /* ... */ }[S.layout](p);
  }
  scalePreview(); // requestAnimationFrame으로 패널에 맞게 scale() 적용
}

// 이미지 렌더 헬퍼 — wrapper div로 overflow:hidden 클립 보장
function imgTag(item, imgCls, phCls, phIcon = '☕') {
  if (!item.img) return `<div class="${phCls}">${phIcon}</div>`;
  const scale = item.imgScale !== 100 ? item.imgScale / 100 : 1;
  const size  = item.imgSize  !== 100 ? item.imgSize  / 100 : 1;
  const pos   = `${item.imgX ?? 50}% ${item.imgY ?? 50}%`;
  const t     = scale !== 1 ? `transform:scale(${scale});transform-origin:${pos};` : '';
  const shape = item.imgShape !== 'default' ? item.imgShape : null;
  const shapeStyle = shape
    ? `border-radius:${{ circle:'50%', rounded:'16px', square:'0' }[shape]};` : '';
  const sizeStyle = size !== 1 ? `zoom:${size};` : '';

  return `<div class="${imgCls}" style="overflow:hidden;${shapeStyle}${sizeStyle}">
    <img src="${item.img}" alt=""
         style="width:100%;height:100%;object-fit:cover;object-position:${pos};display:block;${t}">
  </div>`;
}
```

---

### 4-3. PDF 출력 — 오프스크린 렌더링 + A4 자동 맞춤

```javascript
async function exportPDF() {
  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
  const pdfH = pdf.internal.pageSize.getHeight();  // 297mm

  // ① 오프스크린 컨테이너 — scalePreview()의 rAF와 완전 격리
  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'position:fixed;left:-1600px;top:0;z-index:-9999;';
  const tempEl = document.createElement('div');
  offscreen.appendChild(tempEl);
  document.body.appendChild(offscreen);

  try {
    for (let i = 0; i < S.pages.length; i++) {
      // ② 실제 A4 너비(794px)로 렌더링
      tempEl.style.width      = '794px';
      tempEl.style.fontFamily = S.font;
      tempEl.style.background = S.bg;
      tempEl.innerHTML        = /* 해당 페이지 템플릿 */;

      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 200));

      // ③ 내용이 A4 높이 초과 시 CSS zoom으로 자동 축소 → 좌우 공백 방지
      const naturalH = tempEl.scrollHeight;
      const fitZoom  = naturalH > 1123 ? 1123 / naturalH : 1;
      if (fitZoom < 1) {
        tempEl.style.zoom = fitZoom.toFixed(5);
        await new Promise(r => setTimeout(r, 80));
      }

      // ④ Canvas 캡처
      const canvas = await html2canvas(tempEl, {
        scale: 2, useCORS: true, backgroundColor: S.bg, windowWidth: 794
      });
      if (fitZoom < 1) tempEl.style.zoom = '';

      // ⑤ A4 너비 꽉 채워 PDF 배치
      if (i > 0) pdf.addPage();
      const fillH = canvas.height * (pdfW / canvas.width);
      const fillY = fillH < pdfH ? (pdfH - fillH) / 2 : 0;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, fillY, pdfW, fillH);
    }
    pdf.save(`${S.pages.find(p => p.title)?.title || 'menu'}_menu.pdf`);
  } finally {
    document.body.removeChild(offscreen);
    S.cur = savedPage;
    renderPreview();
  }
}
```

---

### 4-4. Supabase 수동 동기화 패턴

```javascript
// 저장: 크기 경고 포함
async function saveToCloud() {
  const payload = JSON.stringify(S);
  const sizeKB  = Math.round(payload.length / 1024);
  if (sizeKB > 900) {
    if (!confirm(`데이터 크기 ${sizeKB}KB — 서버 저장 시 타임아웃 가능. 계속?`)) return;
  }
  await db.from('menu_state').upsert({
    id: 'shared',
    data: S,
    updated_at: new Date().toISOString()
  });
}

// 불러오기: 덮어쓰기 confirm 필수
async function loadFromCloud() {
  const { data } = await db
    .from('menu_state').select('data,updated_at').eq('id', 'shared').single();
  const savedAt = new Date(data.updated_at).toLocaleString('ko-KR');
  if (!confirm(`서버 데이터를 불러오면 현재 작업이 덮어씌워집니다.\n마지막 저장: ${savedAt}\n계속?`)) return;
  applyState(data.data);
  syncUIFromState();
}
```

---

### 4-5. 이미지 압축 (업로드 시 자동 실행)

```javascript
function handleUpload(input) {
  const file  = input.files[0];
  const isPng = file.type === 'image/png'; // PNG: 투명도 보존 필요
  const img   = new Image();

  img.onload = () => {
    const MAX_DIM = 600;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const r = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (!isPng) {
      ctx.fillStyle = '#ffffff'; // JPEG 투명 영역 → 흰색 (검정 배경 방지)
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    // PNG: 무손실 / JPEG: 75% 품질 압축 (3MB → ~60KB)
    pendingImg = {
      url: isPng
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.75)
    };
  };
  img.src = URL.createObjectURL(file);
}
```

---

### 4-6. 상태 마이그레이션 — 하위 호환 보장

```javascript
// 구버전 저장 데이터를 새 필드 구조로 자동 업그레이드
function applyState(data) {
  if (data.pages) {
    data.pages.forEach((p, i) => {
      // 페이지 필드 기본값 보장
      if (!('headerImg'     in p)) p.headerImg     = null;
      if (!('headerImgSize' in p)) p.headerImgSize = 100;

      p.items.forEach(item => {
        // imgPos(구) → imgX/imgY(신) 변환
        if (!('imgX' in item)) {
          const posMap = {
            'top left':[0,0],    'top center':[50,0],    'top right':[100,0],
            'center left':[0,50],'center':[50,50],        'center right':[100,50],
            'bottom left':[0,100],'bottom center':[50,100],'bottom right':[100,100],
          };
          const [x, y] = posMap[item.imgPos || 'center'] || [50, 50];
          item.imgX = x; item.imgY = y;
        }
        if (!('imgScale' in item)) item.imgScale = 100;
        if (!('imgSize'  in item)) item.imgSize  = 100;
        if (!('imgShape' in item)) item.imgShape = 'default';
      });
    });
  }
  Object.assign(S, data);
}
```

---

## 5. 운영 유의사항

| 항목 | 내용 |
|---|---|
| **Supabase 테이블** | `menu_state` (id TEXT PK, data JSONB, updated_at TIMESTAMPTZ) |
| **저장 Row** | `id = 'shared'` 고정 — 팀 전체가 단일 Row 공유 |
| **Supabase 크기 권장** | 1MB 이하 — 이미지 많을 시 900KB 초과 경고 자동 표시 |
| **GitHub Secrets 3개** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PIXABAY_API_KEY` |
| **배포 트리거** | `master` 브랜치 push → Actions 자동 실행 |
| **로컬 모드** | Secrets 없이 실행 시 localStorage만 사용 (서버 미연결) |
| **최대 아이템 수** | 페이지당 6개 (하드코딩, `const MAX_ITEMS = 6`) |
| **이미지 주의사항** | 외부 URL 이미지는 CORS 미지원 시 PDF 캡처 불가 — 파일 업로드 권장 |

---

## 6. 커밋 히스토리 요약

| 커밋 | 내용 |
|---|---|
| `5d1ae06` | Supabase 실시간 동기화 연동 (최초) |
| `093662b` | PDF export 렌더링 버그 및 텍스트 오버플로우 수정 |
| `da9e2ce` | 자동 동기화 제거 → 수동 저장/불러오기 버튼으로 교체 |
| `5391fa3` | 업로드 이미지 자동 압축 + 서버 저장 크기 경고 |
| `423f958` | 폰트 다양화(12종), 헤더 이미지 삽입, 이미지 위치 선택기 추가 |
| `06c8951` | PNG 투명 배경 수정, 이미지 줌, 헤더 크기 조절, 페이지 복사 |
| `1b7f343` | 아이템별 이미지 프레임 모양 선택 추가 |
| `ff2b61b` | 프레임 크기 조절 + 버튼 active 상태 버그 수정 |
| `b89cc38` | 폰트 선택 전체 미적용 버그 수정 (CSS font-family 19개 제거) |
| `a621b16` | PDF 아이템 5개 이상 시 좌우 공백 발생 문제 수정 |
| `fd5cfb3` | 이미지 축소 + X/Y 슬라이더 정밀 위치 조정 |

---

> 이 문서는 프로젝트 전체 커밋 이력 및 개발 세션 대화 내역을 기반으로 재구성된 기술 회고입니다.  
> 이후 기능 추가·수정 시 **3. 트러블슈팅** 섹션에 항목을 추가하는 방식으로 관리 권장.
