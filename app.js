// GitHub Actions 배포 시 Secrets의 키로 자동 치환됨
const BUILTIN_KEY       = 'PIXABAY_KEY_PLACEHOLDER';
const SUPABASE_URL      = 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_PLACEHOLDER';
const STORAGE_KEY       = 'menuEditor_v1';
const SHARED_ROW_ID     = 'shared';

// ── Supabase 클라이언트 ──────────────────────────────────────────
// 자동 동기화 제거 — 저장/불러오기 버튼으로만 서버와 교신
let db = null;

function setSyncStatus(text, state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = text;
  el.className   = 'sync-status' + (state ? ' ' + state : '');
}

function initSupabase() {
  if (!SUPABASE_URL      || SUPABASE_URL.includes('PLACEHOLDER') ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('PLACEHOLDER')) {
    setSyncStatus('⚪ 로컬 모드', 'local');
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setSyncStatus('☁️ 서버 연결됨', 'connected');
}

// ── 서버에 저장 (수동) ───────────────────────────────────────────
async function saveToCloud() {
  if (!db) { showToast('⚪ 로컬 모드 — 서버 없음', 2000); return; }
  const btn = document.getElementById('cloudSaveBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    // 데이터 크기 사전 체크 (Supabase 권장 1MB 이하)
    const payload = JSON.stringify(S);
    const sizeKB  = Math.round(payload.length / 1024);
    if (sizeKB > 900) {
      const go = confirm(
        `데이터 크기가 ${sizeKB}KB로 큽니다 (이미지 포함).\n` +
        `서버 저장 시 타임아웃이 발생할 수 있습니다.\n\n` +
        `이미지를 URL 방식으로 교체하면 크기를 줄일 수 있습니다.\n\n` +
        `그래도 저장하시겠습니까?`
      );
      if (!go) { if (btn) { btn.textContent = '☁️ 서버 저장'; btn.disabled = false; } return; }
    }
    const now = new Date().toISOString();
    const { error } = await db.from('menu_state')
      .upsert({ id: SHARED_ROW_ID, data: S, updated_at: now });
    if (error) throw error;
    showToast(`☁️ 서버에 저장됨 (${sizeKB}KB)`, 2000);
  } catch (e) {
    showToast('❌ 서버 저장 실패: ' + (e?.message || e), 3000);
    setSyncStatus('🔴 서버 오류', 'error');
  } finally {
    if (btn) { btn.textContent = '☁️ 서버 저장'; btn.disabled = false; }
  }
}

// ── 서버에서 불러오기 (수동) ─────────────────────────────────────
async function loadFromCloud() {
  if (!db) { showToast('⚪ 로컬 모드 — 서버 없음', 2000); return; }
  const btn = document.getElementById('cloudLoadBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const { data, error } = await db
      .from('menu_state').select('data,updated_at').eq('id', SHARED_ROW_ID).single();
    if (error) throw error;
    if (!data?.data || Object.keys(data.data).length === 0) {
      showToast('서버에 저장된 데이터가 없습니다', 2500); return;
    }
    const savedAt = new Date(data.updated_at).toLocaleString('ko-KR');
    const ok = confirm(`서버 데이터를 불러오면 현재 작업이 덮어씌워집니다.\n\n마지막 저장: ${savedAt}\n\n계속하시겠습니까?`);
    if (!ok) return;
    applyState(data.data);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch {}
    syncUIFromState();
    showToast('📥 서버 데이터 불러옴', 2500);
  } catch (e) {
    showToast('❌ 불러오기 실패: ' + (e?.message || e), 3000);
    setSyncStatus('🔴 서버 오류', 'error');
  } finally {
    if (btn) { btn.textContent = '📥 불러오기'; btn.disabled = false; }
  }
}

// ── 상태 적용 (마이그레이션 포함) ───────────────────────────────
function applyState(data) {
  if (!data || typeof data !== 'object') return;
  if (data.pages) {
    data.pages.forEach((p, i) => {
      if (!p.type)               p.type      = (i === 0) ? 'cover' : 'menu';
      if (!p.category)           p.category  = '';
      if (!p.title)              p.title     = '';
      if (!p.subtitle)           p.subtitle  = '';
      if (!p.tagline)            p.tagline   = '';
      if (!p.items)              p.items     = [];
      if (!('headerImg'     in p)) p.headerImg     = null;
      if (!('headerImgSize' in p)) p.headerImgSize = 100;
      // 아이템 필드 마이그레이션
      p.items.forEach(item => {
        // imgPos(구) → imgX/imgY(신) 변환
        if (!('imgX' in item)) {
          const posMap = {
            'top left':[0,0],'top center':[50,0],'top right':[100,0],
            'center left':[0,50],'center':[50,50],'center right':[100,50],
            'bottom left':[0,100],'bottom center':[50,100],'bottom right':[100,100],
          };
          const [x, y] = posMap[item.imgPos || 'center'] || [50, 50];
          item.imgX = x; item.imgY = y;
        }
        if (!('imgY'     in item)) item.imgY    = 50;
        if (!('imgScale' in item)) item.imgScale = 100;
        if (!('imgSize'  in item)) item.imgSize  = 100;
        if (!('imgShape' in item)) item.imgShape = 'default';
      });
    });
  }
  if (data.cur !== undefined && data.pages && data.cur >= data.pages.length) {
    data.cur = data.pages.length - 1;
  }
  Object.assign(S, data);
}

// ── 저장 (디바운스) ──────────────────────────────────────────────
// 키 입력 등 연속 이벤트: scheduleSave() → 800ms 후 saveState()
// 버튼 클릭 등 단발 이벤트: saveState() 직접 호출
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 800);
}

function saveState() {
  clearTimeout(_saveTimer);
  // localStorage에만 자동 저장 — 서버 저장은 '☁️ 서버 저장' 버튼으로만
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    showToast('✓ 저장됨', 2000);
  } catch (e) {
    // 용량 초과(이미지 포함 시 발생 가능) — 사용자에게 명시적으로 알림
    showToast('⚠️ 로컬 저장 실패 (용량 초과). 서버 저장을 이용하세요.', 4000);
  }
}

function loadState() {
  // 시작 시 localStorage만 복원 — 서버 불러오기는 '📥 불러오기' 버튼으로만
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) applyState(JSON.parse(cached));
  } catch {}
}

// ── 토스트 알림 (통합) ───────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 2000) {
  const t = document.getElementById('saveToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

function toggleSection(bodyId, header) {
  const body  = document.getElementById(bodyId);
  const arrow = header.querySelector('.section-arrow');
  const open  = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  arrow.classList.toggle('open', open);
}

// ── 한글 → 영어 번역 사전 ───────────────────────────────────────
const KO_EN = {
  '커피':'coffee','라떼':'latte coffee','카페라떼':'cafe latte','아메리카노':'americano coffee',
  '에스프레소':'espresso coffee','카푸치노':'cappuccino','마키아토':'macchiato coffee',
  '콜드브루':'cold brew coffee','콜드 브루':'cold brew coffee',
  '니트로':'nitro coffee','드립커피':'drip coffee','핸드드립':'pour over coffee',
  '더치커피':'dutch coffee','플랫화이트':'flat white coffee','룽고':'lungo coffee',
  '오트라떼':'oat latte','오트콜드브루':'oat cold brew',
  '녹차':'green tea','말차':'matcha','홍차':'black tea','허브티':'herbal tea',
  '카모마일':'chamomile tea','얼그레이':'earl grey tea','페퍼민트':'peppermint tea',
  '레모네이드':'lemonade','에이드':'ade drink','주스':'fruit juice',
  '스무디':'smoothie','밀크쉐이크':'milkshake','버블티':'bubble tea',
  '밀크티':'milk tea','아이스티':'iced tea','요거트':'yogurt drink',
  '음료':'beverage','탄산':'sparkling water',
  '케이크':'cake','쿠키':'cookie','마카롱':'macaron','크루아상':'croissant',
  '베이글':'bagel','머핀':'muffin','스콘':'scone','도넛':'donut',
  '빵':'bread','바게트':'baguette','와플':'waffle','팬케이크':'pancake',
  '타르트':'tart','파이':'pie','브라우니':'brownie','티라미수':'tiramisu',
  '치즈케이크':'cheesecake','마들렌':'madeleine','휘낭시에':'financier',
  '아이스크림':'ice cream','빙수':'shaved ice bingsu','젤라토':'gelato',
  '푸딩':'pudding','초콜릿':'chocolate','초코':'chocolate dessert',
  '샌드위치':'sandwich','토스트':'toast','샐러드':'salad','수프':'soup',
  '파스타':'pasta','피자':'pizza','버거':'burger','스테이크':'steak',
  '그래놀라':'granola bowl','오트밀':'oatmeal','아보카도':'avocado toast','브런치':'brunch',
  '잡채':'japchae glass noodles','잡채덮밥':'japchae rice bowl korean food',
  '덮밥':'korean rice bowl','비빔밥':'bibimbap korean rice bowl',
  '불고기':'bulgogi korean beef','삼겹살':'samgyeopsal pork belly grilled',
  '돼지갈비':'korean pork ribs','소갈비':'korean beef ribs','갈비':'korean ribs barbecue',
  '갈비탕':'korean galbi soup','설렁탕':'korean beef bone soup',
  '순두부찌개':'sundubu jjigae soft tofu soup','부대찌개':'budae jjigae army stew',
  '김치찌개':'kimchi jjigae stew','된장찌개':'doenjang jjigae soybean paste stew',
  '국밥':'korean rice soup','해장국':'korean hangover soup',
  '삼계탕':'samgyetang ginseng chicken soup',
  '떡볶이':'tteokbokki spicy rice cake','김밥':'kimbap korean rice roll',
  '순대':'sundae korean sausage','만두':'mandu dumpling korean',
  '전':'jeon korean pancake','파전':'pajeon green onion pancake',
  '해물파전':'seafood pancake korean','튀김':'korean fried food',
  '냉면':'naengmyeon cold noodles korean','라면':'ramen noodles',
  '우동':'udon noodles','짜장면':'jajangmyeon black bean noodles',
  '짬뽕':'jjamppong spicy seafood noodles','칼국수':'kalguksu knife cut noodles',
  '생선구이':'grilled fish korean','고등어구이':'grilled mackerel',
  '전복':'abalone','게장':'marinated crab korean','회':'sashimi korean',
  '연어':'salmon dish','참치':'tuna dish','새우':'shrimp prawn',
  '오징어':'squid calamari','낙지':'octopus korean','조개':'clam shellfish',
  '김치':'kimchi','보쌈':'bossam pork wrap korean','족발':'jokbal braised pork feet',
  '곱창':'gopchang grilled intestine','육회':'yukhoe korean beef tartare',
  '도시락':'bento lunch box','한정식':'korean set meal',
  '바닐라':'vanilla','딸기':'strawberry','카라멜':'caramel',
  '헤이즐넛':'hazelnut','민트':'mint','블루베리':'blueberry',
  '망고':'mango','복숭아':'peach','자몽':'grapefruit',
  '레몬':'lemon','오렌지':'orange','치즈':'cheese',
};
// 매 검색마다 정렬하지 않도록 모듈 로드 시 1회만 계산
const KO_EN_KEYS = Object.keys(KO_EN).sort((a, b) => b.length - a.length);

function translateQuery(q) {
  if (!/[가-힣]/.test(q)) return { text: q, translated: false };
  if (KO_EN[q]) return { text: KO_EN[q], translated: true, original: q };
  let result = q;
  let found  = false;
  for (const k of KO_EN_KEYS) {
    if (result.includes(k)) { result = result.replace(k, KO_EN[k]); found = true; }
  }
  if (found) return { text: result, translated: true, original: q };
  return { text: q, translated: false };
}

// ── 기본 상태 ────────────────────────────────────────────────────
const DEFAULT_STATE = {
  layout: 'coffee',
  bg: '#F5EFE6',
  font: "'Playfair Display',serif",
  fs: { title: 76, cat: 30, sub: 14, name: 26, desc: 13, price: 13 },
  cur: 0,
  pages: [
    {
      id: 1, type: 'cover', headerImg: null, headerImgSize: 100,
      category: 'special', title: 'COFFEE',
      subtitle: 'Our signature drinks', tagline: 'Est. 2024', items: []
    },
    {
      id: 2, type: 'menu', headerImg: null, headerImgSize: 100,
      category: 'MENU', title: 'COFFEE',
      subtitle: 'Our signature drinks', tagline: '', items: [
        { id: 10, name: 'Oat Cold Brew',  desc: '콜드 브루의 풍미와 달콤한 오트 음료가 어우러진 냉음 커피.', price: '7,000', img: null, imgX: 50, imgY: 50, imgScale: 100, imgSize: 100, imgShape: 'default', showName: true, showDesc: true, showPrice: true },
        { id: 11, name: 'Shakerato',      desc: '얼음과 함께 쉐이킹하여 진한 에스프레소와 어우러진 달콤한 음료.', price: '8,000', img: null, imgX: 50, imgY: 50, imgScale: 100, imgSize: 100, imgShape: 'default', showName: true, showDesc: true, showPrice: true },
        { id: 12, name: 'Nitro',          desc: '부드러운 콜드 크림과 묵직한 질감이 어우러진 음료.', price: '8,500', img: null, imgX: 50, imgY: 50, imgScale: 100, imgSize: 100, imgShape: 'default', showName: true, showDesc: true, showPrice: true },
      ]
    }
  ]
};

let S = JSON.parse(JSON.stringify(DEFAULT_STATE));
const MAX_ITEMS = 6;
let editItemId = null;
let pendingImg  = null;

// ── 배경 팔레트 ──────────────────────────────────────────────────
const PALETTES = {
  coffee:  ['#F5EFE6','#EDE0D4','#D4C5B0','#C4A882','#8B7355','#3D2B1F'],
  modern:  ['#0a0a0a','#111827','#1e293b','#0f172a','#27272a','#18181b'],
  elegant: ['#FDFAF5','#F5EEE6','#EDE0D4','#FFF8F0','#FFFFF0','#FAF5EB'],
  chalk:   ['#2C4A3E','#1B3A2F','#354F52','#2F3E46','#354733','#1D3557'],
  bistro:  ['#1C1208','#2A1C0E','#3D2B14','#4A3520','#5C3D1E','#7A4F2A'],
  minimal: ['#FFFFFF','#F8F8F8','#F0F0F0','#E8E8E8','#F5F5F0','#EBEBEB'],
};
const DEFAULT_BG = {
  coffee:'#F5EFE6', modern:'#0a0a0a', elegant:'#FDFAF5',
  chalk:'#2C4A3E',  bistro:'#1C1208', minimal:'#FFFFFF'
};
// 커버 CSS 클래스 매핑 — tplCover 호출 시마다 객체 재생성 방지
const COVER_CSS = {
  coffee:'cover-coffee', modern:'cover-modern', elegant:'cover-elegant',
  chalk:'cover-chalk',   bistro:'cover-bistro', minimal:'cover-minimal'
};
// 레이아웃 CSS 클래스 매핑
const LAYOUT_CLS = { coffee:'lc', modern:'lm', elegant:'le', chalk:'lk', bistro:'lb', minimal:'lmin' };
// 레이아웃별 .m-img 기본 픽셀 크기 — imgSize 스케일링에 사용
// CSS zoom 대신 명시적 width/height 로 제어해야 html2canvas 가 정확히 캡처함
const BASE_IMG_DIMS = {
  lc:   { w: 130, h: 130 },
  lm:   { w: null, h: 150 }, // width 는 100% (카드 전체 폭)
  le:   { w: 86,  h: 86  },
  lk:   { w: 90,  h: 90  },
  lb:   { w: 100, h: 100 },
  lmin: { w: 80,  h: 80  },
};

function initSwatches() {
  const c = document.getElementById('bgSwatches');
  c.innerHTML = '';
  (PALETTES[S.layout] || PALETTES.coffee).forEach(col => {
    const el = document.createElement('div');
    el.className = 'bg-swatch' + (col === S.bg ? ' active' : '');
    el.style.background = col;
    el.title = col;
    el.onclick = () => { S.bg = col; initSwatches(); renderPreview(); saveState(); };
    c.appendChild(el);
  });
  document.getElementById('bgCustom').value = S.bg;
}

function setCustomBg(v) {
  S.bg = v;
  document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
  renderPreview();
  saveState();
}

// ── 레이아웃 ─────────────────────────────────────────────────────
function setLayout(l, btn) {
  S.layout = l;
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.bg = DEFAULT_BG[l];
  initSwatches();
  renderPreview();
  saveState();
}

// ── 폰트 ─────────────────────────────────────────────────────────
function onFontChange(val) {
  S.font = val;
  renderPreview();
  saveState();
}

// ── 글씨 크기 ────────────────────────────────────────────────────
function onSize(key, input) {
  S.fs[key] = Number(input.value);
  const labelMap = { title:'vTitle', cat:'vCat', sub:'vSub', name:'vName', desc:'vDesc', price:'vPrice' };
  document.getElementById(labelMap[key]).textContent = input.value;
  renderPreview();
  scheduleSave(); // 슬라이더 연속 입력 → 디바운스로 저장 횟수 절감
}

// ── 페이지 관리 ──────────────────────────────────────────────────
function curPage() { return S.pages[S.cur]; }

function addPage() {
  const id = Date.now();
  S.pages.push({ id, type: 'menu', headerImg: null, headerImgSize: 100, category: 'MENU', title: '', subtitle: '', tagline: '', items: [] });
  S.cur = S.pages.length - 1;
  renderAll();
  saveState();
}

function deletePage(idx, e) {
  e.stopPropagation();
  if (S.pages.length === 1) { alert('마지막 페이지는 삭제할 수 없습니다.'); return; }
  S.pages.splice(idx, 1);
  if (S.cur >= S.pages.length) S.cur = S.pages.length - 1;
  renderAll();
  saveState();
}

function setPage(idx) {
  S.cur = idx;
  renderAll();
}

function renderAll() {
  renderPageTabs();
  renderEditorHeader();
  renderItems();
  renderPreview();
  renderPageNav();
}

// ── 다른 사용자 변경 수신 시 UI 동기화 ──────────────────────────
function syncUIFromState() {
  const fontEl = document.getElementById('eFont');
  if (fontEl) fontEl.value = S.font;

  const fsMap = { title:'fsTitle', cat:'fsCat', sub:'fsSub', name:'fsName', desc:'fsDesc', price:'fsPrice' };
  const vsMap = { title:'vTitle',  cat:'vCat',  sub:'vSub',  name:'vName',  desc:'vDesc',  price:'vPrice'  };
  for (const [key, elId] of Object.entries(fsMap)) {
    const el  = document.getElementById(elId);  if (el)  el.value       = S.fs[key];
    const vEl = document.getElementById(vsMap[key]); if (vEl) vEl.textContent = S.fs[key];
  }
  document.querySelectorAll('.layout-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === S.layout);
  });
  initSwatches();

  // 사용자가 입력 중이면 에디터 패널은 건드리지 않고 프리뷰만 갱신
  const focused = document.activeElement;
  const userTyping = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT');
  if (userTyping) {
    renderPreview();
    renderPageTabs();
    renderPageNav();
  } else {
    renderAll();
  }
}

function renderPageTabs() {
  const el = document.getElementById('pageTabs');
  el.innerHTML = '';
  let menuSeq = 0;
  S.pages.forEach((p, i) => {
    const tab = document.createElement('div');
    tab.className = 'page-tab' + (i === S.cur ? ' active' : '');
    tab.onclick = () => setPage(i);
    tab.innerHTML = p.type === 'cover' ? '📖 표지' : `메뉴 ${++menuSeq}`;

    // 복사 버튼
    const dup = document.createElement('span');
    dup.className   = 'page-tab-dup';
    dup.textContent = ' ⧉';
    dup.title       = '페이지 복사';
    dup.onclick = (e) => duplicatePage(i, e);
    tab.appendChild(dup);

    // 삭제 버튼
    if (S.pages.length > 1) {
      const del = document.createElement('span');
      del.className   = 'page-tab-del';
      del.textContent = ' ✕';
      del.onclick = (e) => deletePage(i, e);
      tab.appendChild(del);
    }
    el.appendChild(tab);
  });
}

function duplicatePage(idx, e) {
  e.stopPropagation();
  const src  = S.pages[idx];
  // 깊은 복사 후 id만 새로 부여
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = Date.now();
  copy.items = copy.items.map((it, i) => ({ ...it, id: Date.now() + i + 1 }));
  S.pages.splice(idx + 1, 0, copy);
  S.cur = idx + 1;
  renderAll();
  saveState();
}

function renderPageNav() {
  const nav = document.getElementById('pageNav');
  if (S.pages.length <= 1) { nav.innerHTML = ''; return; }
  nav.innerHTML = `
    <button class="page-nav-btn" onclick="setPage(S.cur-1)" ${S.cur===0?'disabled':''}>‹</button>
    <div class="page-nav-dots">
      ${S.pages.map((_,i) => `<div class="page-dot${i===S.cur?' active':''}" onclick="setPage(${i})"></div>`).join('')}
    </div>
    <button class="page-nav-btn" onclick="setPage(S.cur+1)" ${S.cur===S.pages.length-1?'disabled':''}>›</button>
    <span class="page-nav-label">${S.cur+1} / ${S.pages.length}</span>
  `;
}

// ── 에디터 헤더 (페이지별) ───────────────────────────────────────
function renderEditorHeader() {
  const el = document.getElementById('editorHeader');
  const p  = curPage();
  const isCover = p.type === 'cover';
  el.innerHTML = `
    <div class="page-type-row">
      <span class="section-title" style="margin-bottom:0">페이지 설정</span>
      <label class="type-toggle-label">
        <input type="checkbox" ${isCover?'checked':''} onchange="togglePageType(this.checked)">
        <span class="type-toggle-chip">${isCover?'📖 표지':'📋 메뉴'}</span>
      </label>
    </div>
    <div class="form-group" style="margin-top:10px">
      <label>${isCover ? '태그라인 (최상단 작은 글씨)' : '카테고리'}</label>
      <input value="${esc(isCover ? p.tagline : p.category)}"
             oninput="setPageField('${isCover ? 'tagline' : 'category'}', this.value)"
             placeholder="${isCover ? 'Est. 2024' : ''}">
    </div>
    ${isCover ? `
    <div class="form-group">
      <label>스크립트 텍스트 <span style="font-size:10px;color:#aaa">(special 자리)</span></label>
      <input value="${esc(p.category)}" oninput="setPageField('category', this.value)" placeholder="special">
    </div>` : ''}
    <div class="form-group">
      <label>메인 제목</label>
      <input value="${esc(p.title)}" oninput="setPageField('title', this.value)">
    </div>
    <div class="form-group">
      <label>부제목</label>
      <input value="${esc(p.subtitle)}" oninput="setPageField('subtitle', this.value)">
    </div>
    <div class="form-group">
      <label>헤더 이미지 <span style="font-size:10px;color:#aaa">(로고·배너 등)</span></label>
      <div class="img-row">
        ${p.headerImg
          ? `<img class="img-thumb" src="${p.headerImg}" style="object-fit:contain;background:repeating-conic-gradient(#ddd 0% 25%,#f8f8f8 0% 50%) 0 0/12px 12px">`
          : `<div class="img-placeholder">🖼</div>`}
        <div style="display:flex;flex-direction:column;gap:5px;flex:1">
          <button class="find-img-btn" onclick="openHeaderImgModal()">🔍 이미지 선택</button>
          ${p.headerImg ? `<button class="find-img-btn" style="background:#ef4444" onclick="removeHeaderImg()">✕ 이미지 제거</button>` : ''}
        </div>
      </div>
      ${p.headerImg ? `
      <div style="margin-top:8px">
        <label style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:3px">
          이미지 크기 <span id="hImgSizeLbl" class="size-val">${p.headerImgSize||100}px</span>
        </label>
        <input type="range" min="30" max="200" value="${p.headerImgSize||100}" style="width:100%;accent-color:#e2a96f;cursor:pointer"
               oninput="setPageField('headerImgSize',+this.value);document.getElementById('hImgSizeLbl').textContent=this.value+'px'">
      </div>` : ''}
    </div>
  `;
}

function togglePageType(isCover) {
  curPage().type = isCover ? 'cover' : 'menu';
  renderAll();
  saveState();
}

function setPageField(key, val) {
  curPage()[key] = val;
  renderPreview();
  scheduleSave();   // 키 입력 → 디바운스
}

// ── 아이템 목록 ──────────────────────────────────────────────────
function renderItems() {
  const container = document.getElementById('itemsList');
  const addBtn    = document.querySelector('.add-btn');
  const p = curPage();

  if (p.type === 'cover') {
    container.innerHTML = '<div class="cover-notice">표지 페이지에는 메뉴 아이템이 없습니다.</div>';
    if (addBtn) addBtn.style.display = 'none';
    return;
  }
  if (addBtn) addBtn.style.display = '';

  // 현재 열린 아이템 body id 저장 → 재렌더 후 복원
  const openIds = new Set(
    [...container.querySelectorAll('.item-body.open')].map(el => el.id.replace('body-', ''))
  );
  container.innerHTML = '';

  p.items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `
      <div class="item-header" onclick="toggleBody(${item.id})">
        <div class="item-num-badge">${i+1}</div>
        <div class="item-name-label" id="lbl-${item.id}">${item.name || '(이름없음)'}</div>
        <button class="item-del" onclick="delItem(${item.id},event)">✕</button>
        <div class="item-toggle">▾</div>
      </div>
      <div class="item-body" id="body-${item.id}">
        <div class="form-group"><label>메뉴명</label>
          <input value="${esc(item.name)}" oninput="setField(${item.id},'name',this.value)"></div>
        <div class="form-group"><label>설명</label>
          <textarea oninput="setField(${item.id},'desc',this.value)">${esc(item.desc)}</textarea></div>
        <div class="form-group"><label>가격</label>
          <input value="${esc(item.price)}" oninput="setField(${item.id},'price',this.value)"></div>
        <div class="img-row">
          ${item.img
            ? `<img class="img-thumb" src="${item.img}" id="thumb-${item.id}"
                    style="object-fit:cover;object-position:${item.imgX??50}% ${item.imgY??50}%">`
            : `<div class="img-placeholder" id="thumb-${item.id}">☕</div>`}
          <button class="find-img-btn" onclick="openModal(${item.id})">🔍 이미지 찾기</button>
        </div>
        ${item.img ? `
        <div class="img-pos-section">

          <div class="img-ctrl-group">
            <div class="img-pos-label" style="margin-bottom:4px">빠른 위치</div>
            <div class="img-pos-grid">
              ${[[0,0,'↖'],[50,0,'↑'],[100,0,'↗'],
                 [0,50,'←'],[50,50,'●'],[100,50,'→'],
                 [0,100,'↙'],[50,100,'↓'],[100,100,'↘']]
                .map(([px,py,icon]) => {
                  const active = (item.imgX??50)===px && (item.imgY??50)===py;
                  return `<button class="img-pos-btn${active?' active':''}"
                                   onclick="setPosPreset(${item.id},${px},${py})"
                                   title="${px}% / ${py}%">${icon}</button>`;
                }).join('')}
            </div>
          </div>

          <div class="img-ctrl-group">
            <div class="img-pos-label" style="margin-bottom:2px">정밀 위치 조정</div>
            <div class="img-zoom-row">
              <span class="img-axis-label">← X →</span>
              <input type="range" min="0" max="100" value="${item.imgX??50}" id="pos-x-${item.id}"
                     style="flex:1;accent-color:#e2a96f;cursor:pointer"
                     oninput="setField(${item.id},'imgX',+this.value);
                              document.getElementById('pos-x-lbl-${item.id}').textContent=this.value+'%';
                              updateThumb(${item.id})">
              <span id="pos-x-lbl-${item.id}" class="size-val" style="min-width:34px;text-align:right">${item.imgX??50}%</span>
            </div>
            <div class="img-zoom-row">
              <span class="img-axis-label">↑ Y ↓</span>
              <input type="range" min="0" max="100" value="${item.imgY??50}" id="pos-y-${item.id}"
                     style="flex:1;accent-color:#e2a96f;cursor:pointer"
                     oninput="setField(${item.id},'imgY',+this.value);
                              document.getElementById('pos-y-lbl-${item.id}').textContent=this.value+'%';
                              updateThumb(${item.id})">
              <span id="pos-y-lbl-${item.id}" class="size-val" style="min-width:34px;text-align:right">${item.imgY??50}%</span>
            </div>
          </div>

          <div class="img-ctrl-group">
            <div class="img-zoom-row">
              <span class="img-pos-label" style="white-space:nowrap">사진 크기 <span id="zoom-lbl-${item.id}" class="size-val">${item.imgScale||100}%</span></span>
              <input type="range" min="20" max="200" value="${item.imgScale||100}" style="flex:1;accent-color:#e2a96f;cursor:pointer"
                     oninput="setField(${item.id},'imgScale',+this.value);document.getElementById('zoom-lbl-${item.id}').textContent=this.value+'%'">
            </div>
            <div class="img-zoom-row">
              <span class="img-pos-label" style="white-space:nowrap">프레임 크기 <span id="size-lbl-${item.id}" class="size-val">${item.imgSize||100}%</span></span>
              <input type="range" min="40" max="160" value="${item.imgSize||100}" style="flex:1;accent-color:#6366f1;cursor:pointer"
                     oninput="setField(${item.id},'imgSize',+this.value);document.getElementById('size-lbl-${item.id}').textContent=this.value+'%'">
            </div>
          </div>

          <div class="img-ctrl-group">
            <div class="img-pos-label" style="margin-bottom:4px">프레임 모양</div>
            <div class="img-shape-row">
              ${[['default','기본','기본'],['circle','⬤','원형'],['rounded','▢','둥근'],['square','■','직각']]
                .map(([s,icon,label]) =>
                  `<button class="img-shape-btn${s==='circle'?' is-circle':s==='rounded'?' is-rounded':s==='square'?' is-square':''} ${(item.imgShape||'default')===s?'active':''}"
                           onclick="setField(${item.id},'imgShape','${s}')" title="${label}">${icon}<span class="shape-lbl">${label}</span></button>`
                ).join('')}
            </div>
          </div>
        </div>` : ''}
        <div class="vis-toggles">
          <label class="vis-toggle">
            <span class="label">제목</span>
            <input type="checkbox" ${item.showName!==false?'checked':''} onchange="setField(${item.id},'showName',this.checked)">
            <div class="tgl-track"></div>
          </label>
          <label class="vis-toggle">
            <span class="label">설명</span>
            <input type="checkbox" ${item.showDesc!==false?'checked':''} onchange="setField(${item.id},'showDesc',this.checked)">
            <div class="tgl-track"></div>
          </label>
          <label class="vis-toggle">
            <span class="label">가격</span>
            <input type="checkbox" ${item.showPrice!==false?'checked':''} onchange="setField(${item.id},'showPrice',this.checked)">
            <div class="tgl-track"></div>
          </label>
        </div>
      </div>`;
    container.appendChild(div);
  });

  // 열린 상태 복원 (setField → renderItems 재호출 시 카드가 닫히지 않도록)
  openIds.forEach(id => {
    const body = document.getElementById('body-' + id);
    if (body) body.classList.add('open');
  });

  if (p.items.length >= MAX_ITEMS) {
    const notice = document.createElement('div');
    notice.className = 'page-limit-notice';
    notice.innerHTML = `이 페이지는 최대 ${MAX_ITEMS}개입니다.<br>새 페이지를 추가하려면 <strong>"+ 페이지"</strong>를 누르세요.`;
    container.appendChild(notice);
  }
}

function toggleBody(id) {
  document.getElementById('body-' + id)?.classList.toggle('open');
}

// 위치 프리셋 버튼 클릭 → imgX/imgY 동시 설정 + 슬라이더/버튼 UI 갱신
function setPosPreset(id, x, y) {
  for (const p of S.pages) {
    const item = p.items.find(i => i.id === id);
    if (!item) continue;
    item.imgX = x; item.imgY = y;
    renderPreview();
    renderItems();   // 버튼 active 상태 + 슬라이더 값 갱신
    scheduleSave();
    return;
  }
}

// 슬라이더 변경 시 에디터 썸네일만 빠르게 갱신 (renderItems 비용 없이)
function updateThumb(id) {
  for (const p of S.pages) {
    const item = p.items.find(i => i.id === id);
    if (!item) continue;
    const thumb = document.getElementById('thumb-' + id);
    if (thumb && thumb.tagName === 'IMG') {
      thumb.style.objectPosition = `${item.imgX ?? 50}% ${item.imgY ?? 50}%`;
    }
    break;
  }
}

function setField(id, key, val) {
  for (const p of S.pages) {
    const item = p.items.find(i => i.id === id);
    if (item) {
      item[key] = val;
      if (key === 'name') {
        const lbl = document.getElementById('lbl-' + id);
        if (lbl) lbl.textContent = val || '(이름없음)';
      }
      renderPreview();
      // 모양 버튼 active 상태 갱신을 위해 재렌더 (open 상태 보존됨)
      // imgX/imgY는 setPosPreset 또는 슬라이더가 직접 UI 제어하므로 제외
      if (key === 'imgShape') renderItems();
      scheduleSave();
      return;
    }
  }
}

function addItem() {
  const p = curPage();
  if (p.type === 'cover') return;
  if (p.items.length >= MAX_ITEMS) {
    const go = confirm(`이 페이지는 최대 ${MAX_ITEMS}개입니다.\n새 페이지를 만들고 거기에 추가할까요?`);
    if (go) { addPage(); }
    return;
  }
  const id = Date.now();
  p.items.push({ id, name: '새 메뉴', desc: '설명을 입력하세요.', price: '0', img: null, imgX: 50, imgY: 50, imgScale: 100, imgSize: 100, imgShape: 'default', showName: true, showDesc: true, showPrice: true });
  renderItems();
  renderPreview();
  saveState();
  setTimeout(() => { document.getElementById('body-' + id)?.classList.add('open'); }, 50);
}

function delItem(id, e) {
  e.stopPropagation();
  for (const p of S.pages) {
    const idx = p.items.findIndex(i => i.id === id);
    if (idx !== -1) { p.items.splice(idx, 1); break; }
  }
  renderItems();
  renderPreview();
  saveState();
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// ── 프리뷰 렌더 ──────────────────────────────────────────────────
// S.font는 onFontChange()에서만 변경 — 렌더 함수는 상태를 읽기만 함
function renderPreview() {
  const p  = curPage();
  const el = document.getElementById('menuPreview');
  el.style.background = S.bg;
  el.style.fontFamily = S.font;

  if (p.type === 'cover') {
    // 커버는 레이아웃 클래스의 padding을 받지 않도록 별도 클래스 사용
    el.className = 'cover-page';
    el.innerHTML = tplCover(p);
  } else {
    const cls = LAYOUT_CLS[S.layout] || 'lc';
    el.className = cls;
    if (S.layout === 'coffee')  el.innerHTML = tplCoffee(p);
    if (S.layout === 'modern')  el.innerHTML = tplModern(p);
    if (S.layout === 'elegant') el.innerHTML = tplElegant(p);
    if (S.layout === 'chalk')   el.innerHTML = tplChalk(p);
    if (S.layout === 'bistro')  el.innerHTML = tplBistro(p);
    if (S.layout === 'minimal') el.innerHTML = tplMinimal(p);
  }
  scalePreview();
}

// imgTag: CSS 클래스를 wrapper div에 적용 → overflow:hidden 으로 확대 시 클립
// transform:scale 을 img 에 적용 → object-fit:cover + object-position 과 결합
const IMG_SHAPE_RADIUS = { circle: '50%', rounded: '16px', square: '0', wide: '8px' };

function imgTag(item, imgCls, phCls, phIcon = '☕') {
  if (!item.img) return `<div class="${phCls}">${phIcon}</div>`;
  const scale = item.imgScale && item.imgScale !== 100 ? item.imgScale / 100 : 1;
  const size  = item.imgSize  && item.imgSize  !== 100 ? item.imgSize  / 100 : 1;
  const x     = item.imgX ?? 50;
  const y     = item.imgY ?? 50;
  const pos   = `${x}% ${y}%`;
  // 내부 줌: img에 transform scale (overflow:hidden으로 클립)
  const t = scale !== 1 ? `transform:scale(${scale});transform-origin:${pos};` : '';
  // 프레임 모양
  const shape      = item.imgShape && item.imgShape !== 'default' ? item.imgShape : null;
  const shapeStyle = shape ? `border-radius:${IMG_SHAPE_RADIUS[shape] || '0'};` : '';
  // 프레임 크기: CSS zoom 대신 명시적 width/height 로 제어
  // → html2canvas 는 zoom 을 자식 요소에서 정확히 처리하지 못하므로 px 값으로 직접 지정
  let sizeStyle = '';
  if (size !== 1) {
    const base = BASE_IMG_DIMS[LAYOUT_CLS[S.layout] || 'lc'];
    sizeStyle = base.w
      ? `width:${Math.round(base.w * size)}px;height:${Math.round(base.h * size)}px;`
      : `height:${Math.round(base.h * size)}px;`; // lm: 너비는 100% 유지
  }

  return `<div class="${imgCls}" style="overflow:hidden;${shapeStyle}${sizeStyle}">` +
    `<img src="${item.img}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${pos};display:block;${t}">` +
    `</div>`;
}
function num(i) { return String(i+1).padStart(2,'0'); }

// ── 커버 템플릿 ───────────────────────────────────────────────────
function tplCover(p) {
  const cls = COVER_CSS[S.layout] || 'cover-coffee';
  return `
    <div class="cover-wrap ${cls}">
      <div class="cover-inner">
        ${p.headerImg ? `<img class="cover-logo" src="${p.headerImg}" alt="" style="max-height:${p.headerImgSize||100}px;max-width:${(p.headerImgSize||100)*2.5}px">` : ''}
        ${p.tagline  ? `<div class="cover-tag">${esc(p.tagline)}</div>`  : ''}
        <div class="cover-cat"   style="font-size:${S.fs.cat}px">${esc(p.category||'')}</div>
        <div class="cover-title" style="font-size:${S.fs.title}px">${esc(p.title||'')}</div>
        <div class="cover-divider"><span class="cover-orn">─✦─</span></div>
        <div class="cover-sub"   style="font-size:${S.fs.sub}px">${esc(p.subtitle||'')}</div>
      </div>
    </div>`;
}

// ── 메뉴 아이템 행 공통 렌더 ─────────────────────────────────────
function renderItemRow(it) {
  return `
    ${it.showName  !== false ? `<div class="m-name"  style="font-size:${S.fs.name}px">${esc(it.name)}</div>`  : ''}
    ${it.showDesc  !== false ? `<div class="m-desc"  style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>`  : ''}
    ${it.showPrice !== false ? `<span class="m-price" style="font-size:${S.fs.price}px">₩${esc(it.price)}</span>` : ''}`;
}

// ── 메뉴 템플릿들 ────────────────────────────────────────────────
function tplCoffee(p) {
  const { category: cat, title, subtitle: sub, items } = p;
  const rows = items.map((it, i) => `
    <div class="m-item ${i%2===0?'odd':'even'}">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-num" style="font-size:${S.fs.name*0.58}px">${num(i)}.</div>
        ${renderItemRow(it)}
      </div>
    </div>`).join('');
  return `${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
          <div class="m-cat"   style="font-size:${S.fs.cat}px">${esc(cat)}</div>
          <div class="m-title" style="font-size:${S.fs.title}px">${esc(title)}</div>
          ${sub ? `<div class="m-sub" style="font-size:${S.fs.sub}px">${esc(sub)}</div>` : ''}
          <hr class="m-divider">${rows}`;
}

function tplModern(p) {
  const { category: cat, title, subtitle: sub, items } = p;
  const rows = items.map((it, i) => `
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-num" style="font-size:${Math.max(9,S.fs.desc-2)}px">${num(i)}</div>
        <div class="m-row">
          ${it.showName  !== false ? `<div class="m-name"  style="font-size:${S.fs.name}px">${esc(it.name)}</div>` : '<div></div>'}
          ${it.showPrice !== false ? `<div class="m-price" style="font-size:${S.fs.price}px">₩${esc(it.price)}</div>` : ''}
        </div>
        ${it.showDesc !== false ? `<div class="m-desc" style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  return `${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
          <div class="m-cat"   style="font-size:${S.fs.cat*0.4}px">${esc(cat)}</div>
          <div class="m-title" style="font-size:${S.fs.title}px">${esc(title)}</div>
          <div class="m-sub"   style="font-size:${S.fs.sub}px">${esc(sub)}</div>
          <hr class="m-divider">
          <div class="m-grid">${rows}</div>`;
}

function tplElegant(p) {
  const { category: cat, title, subtitle: sub, items } = p;
  const rows = items.map((it, i) => `
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph','✦')}
      <div class="m-content">
        <div class="m-row">
          <div class="m-left">
            <span class="m-num"  style="font-size:${Math.max(9,S.fs.desc-2)}px">${num(i)}</span>
            ${it.showName !== false ? `<span class="m-name" style="font-size:${S.fs.name}px">${esc(it.name)}</span>` : ''}
          </div>
          ${it.showPrice !== false ? `<span class="m-price" style="font-size:${S.fs.price}px">₩${esc(it.price)}</span>` : ''}
        </div>
        ${it.showDesc !== false ? `<div class="m-desc" style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  return `${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
          <div class="m-cat"   style="font-size:${S.fs.cat*0.38}px">${esc(cat)}</div>
          <div class="m-title" style="font-size:${S.fs.title}px">${esc(title)}</div>
          <div class="m-sub"   style="font-size:${S.fs.sub}px">${esc(sub)}</div>
          <div class="m-divider"><span class="m-div-orn">✦</span></div>
          ${rows}`;
}

function tplChalk(p) {
  const { category: cat, title, items } = p;
  const rows = items.map((it, i) => `
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-row">
          <div class="m-left">
            <span class="m-num"  style="font-size:${Math.max(9,S.fs.desc-1)}px">${num(i)}.</span>
            ${it.showName !== false ? `<span class="m-name" style="font-size:${S.fs.name}px">${esc(it.name)}</span>` : ''}
          </div>
          ${it.showPrice !== false ? `<span class="m-price" style="font-size:${S.fs.price}px">₩${esc(it.price)}</span>` : ''}
        </div>
        ${it.showDesc !== false ? `<div class="m-desc" style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  return `${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
          <div class="m-cat"   style="font-size:${S.fs.cat}px">${esc(cat)}</div>
          <div class="m-title" style="font-size:${S.fs.title}px">${esc(title)}</div>
          <hr class="m-divider">${rows}`;
}

function tplBistro(p) {
  const { category: cat, title, subtitle: sub, items } = p;
  const rows = items.map((it, i) => `
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph','🍽')}
      <div class="m-content">
        <div class="m-row">
          <div class="m-left">
            <span class="m-num"  style="font-size:${Math.max(9,S.fs.desc)}px">${num(i)}</span>
            ${it.showName !== false ? `<span class="m-name" style="font-size:${S.fs.name}px">${esc(it.name)}</span>` : ''}
          </div>
          ${it.showPrice !== false ? `<span class="m-price" style="font-size:${S.fs.price}px">₩${esc(it.price)}</span>` : ''}
        </div>
        ${it.showDesc !== false ? `<div class="m-desc" style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  return `
    ${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
    <div class="lb-header">
      <div class="lb-badge">${esc(cat)}</div>
      <div class="m-title" style="font-size:${S.fs.title}px">${esc(title)}</div>
      <div class="lb-rule"><span>${esc(sub)}</span></div>
    </div>
    <div class="lb-body">${rows}</div>`;
}

function tplMinimal(p) {
  const { category: cat, title, subtitle: sub, items } = p;
  const rows = items.map((it) => `
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph','·')}
      <div class="m-content">
        <div class="m-top-row">
          ${it.showName  !== false ? `<div class="m-name"  style="font-size:${S.fs.name}px">${esc(it.name)}</div>`  : ''}
          ${it.showPrice !== false ? `<div class="m-price" style="font-size:${S.fs.price}px">${esc(it.price)}</div>` : ''}
        </div>
        ${it.showDesc !== false ? `<div class="m-desc" style="font-size:${S.fs.desc}px">${esc(it.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  return `
    ${p.headerImg ? `<img class="page-logo" src="${p.headerImg}" alt="" style="max-height:${Math.min(p.headerImgSize||100,80)}px;max-width:${Math.min((p.headerImgSize||100)*2,160)}px">` : ''}
    <div class="lmin-header">
      <div class="lmin-cat"  style="font-size:${S.fs.cat*0.5}px">${esc(cat)}</div>
      <div class="m-title"   style="font-size:${S.fs.title}px">${esc(title)}</div>
      ${sub ? `<div class="lmin-sub" style="font-size:${S.fs.sub}px">${esc(sub)}</div>` : ''}
      <div class="lmin-line"></div>
    </div>
    <div class="lmin-body">${rows}</div>`;
}

// ── 스케일 (requestAnimationFrame으로 강제 리플로우 방지) ────────
function scalePreview() {
  requestAnimationFrame(() => {
    const panel   = document.querySelector('.preview-panel');
    const scaler  = document.querySelector('.preview-scaler');
    const preview = document.getElementById('menuPreview');
    // A4 비율 고정값 사용 — offsetWidth/Height 강제 리플로우 제거
    const mw = 794, mh = 1123;
    const pw = panel.clientWidth  - 48;
    const ph = panel.clientHeight - 120;
    const scale = Math.min(pw / mw, ph / mh, 1);
    scaler.style.transform = `scale(${scale})`;
    scaler.style.width  = mw + 'px';
    scaler.style.height = mh + 'px';
    preview.style.width = mw + 'px';
  });
}
window.addEventListener('resize', scalePreview);

// ── 이미지 모달 ──────────────────────────────────────────────────
function openModal(id) {
  editItemId = id;
  pendingImg = null;
  let itemName = '';
  for (const p of S.pages) {
    const it = p.items.find(i => i.id === id);
    if (it) { itemName = it.name; break; }
  }
  document.getElementById('searchQ').value = itemName;
  document.getElementById('imgGrid').innerHTML = '';
  document.getElementById('translateNotice').style.display = 'none';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlPreviewImg').style.display = 'none';
  document.querySelector('.upload-area').innerHTML =
    `<div style="font-size:36px;margin-bottom:8px">📁</div>
     <div>클릭하거나 파일을 드래그하여 업로드</div>
     <div style="font-size:11px;color:#aaa;margin-top:4px">JPG, PNG, WEBP 지원</div>`;
  switchTab('search', document.querySelector('.mtab'));
  document.getElementById('imgModal').style.display = 'flex';
  if (itemName) doSearch();
}

function openHeaderImgModal() {
  editItemId = '__header__';
  pendingImg  = null;
  document.getElementById('searchQ').value = '';
  document.getElementById('imgGrid').innerHTML = '';
  document.getElementById('translateNotice').style.display = 'none';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlPreviewImg').style.display = 'none';
  document.querySelector('.upload-area').innerHTML =
    `<div style="font-size:36px;margin-bottom:8px">📁</div>
     <div>클릭하거나 파일을 드래그하여 업로드</div>
     <div style="font-size:11px;color:#aaa;margin-top:4px">JPG, PNG, WEBP 지원</div>`;
  // 업로드 탭으로 기본 열기 (로고는 보통 파일 업로드)
  const tabs = document.querySelectorAll('.mtab');
  switchTab('upload', tabs[2]);
  document.getElementById('imgModal').style.display = 'flex';
}

function removeHeaderImg() {
  curPage().headerImg = null;
  renderEditorHeader();
  renderPreview();
  saveState();
}

function closeModal() { document.getElementById('imgModal').style.display = 'none'; }
function overlayClose(e) { if (e.target.id === 'imgModal') closeModal(); }

function switchTab(name, btn) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Pixabay API 키 관리 ──────────────────────────────────────────
function toggleApiKeyBox() {
  const body  = document.getElementById('apiKeyBody');
  const arrow = document.getElementById('apiKeyArrow');
  const open  = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  arrow.textContent  = open ? '▴' : '▾';
  if (open) {
    const saved = localStorage.getItem('pixabay_key') || '';
    document.getElementById('pixabayKey').value = saved ? '●'.repeat(20) : '';
    const status = document.getElementById('apiKeyStatus');
    status.textContent = saved ? '✓ API 키 저장됨' : '키 없음 — 기본 이미지 검색 사용 중';
    status.style.color = saved ? '#16a34a' : '#888';
  }
}

function savePixabayKey() {
  const raw = document.getElementById('pixabayKey').value.trim();
  const key = raw.startsWith('●') ? localStorage.getItem('pixabay_key') : raw;
  const status = document.getElementById('apiKeyStatus');
  if (!key) {
    localStorage.removeItem('pixabay_key');
    status.textContent = 'API 키가 삭제되었습니다.'; status.style.color = '#888'; return;
  }
  localStorage.setItem('pixabay_key', key);
  status.textContent = '✓ 저장 완료!'; status.style.color = '#16a34a';
}

// ── 이미지 검색 ──────────────────────────────────────────────────
function selectImg(img) {
  document.querySelectorAll('.img-opt').forEach(x => x.classList.remove('selected'));
  img.classList.add('selected');
  pendingImg = { type: 'url', url: img.src };
}

function makeImgEl(src, alt) {
  const img = document.createElement('img');
  img.className   = 'img-opt';
  img.loading     = 'lazy';
  img.crossOrigin = 'anonymous';
  img.src = src; img.alt = alt;
  img.onerror = () => { img.src = `https://placehold.co/320x320/e5e7eb/9ca3af?text=${encodeURIComponent(alt)}`; };
  img.onclick = () => selectImg(img);
  return img;
}

async function doSearch() {
  const raw = document.getElementById('searchQ').value.trim();
  if (!raw) return;
  const { text: q, translated, original } = translateQuery(raw);
  const notice = document.getElementById('translateNotice');
  if (translated) {
    notice.style.display = 'block';
    notice.textContent = `"${original}" → 영어로 변환하여 검색: "${q}"`;
  } else {
    notice.style.display = 'none';
  }
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = Array(9).fill('<div class="img-skeleton"></div>').join('');
  await new Promise(r => setTimeout(r, 250));
  const pixabayKey = (BUILTIN_KEY && !BUILTIN_KEY.includes('PLACEHOLDER'))
    ? BUILTIN_KEY : (localStorage.getItem('pixabay_key') || '');
  if (pixabayKey) {
    await searchPixabay(q, grid, pixabayKey, translated);
  } else {
    searchLoremflickr(q, grid);
  }
}

function searchLoremflickr(q, grid) {
  const base = Math.floor(Math.random() * 9000) + 1000;
  const enc  = encodeURIComponent(q.replace(/\s+/g, ','));
  grid.innerHTML = '';
  for (let i = 0; i < 9; i++) grid.appendChild(makeImgEl(`https://loremflickr.com/320/320/${enc}?lock=${base + i}`, q));
}

async function searchPixabay(q, grid, key, isTranslated = false) {
  try {
    const res  = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=9&image_type=photo&safesearch=true&lang=${isTranslated?'en':'ko'}`);
    if (!res.ok) throw new Error('API 오류');
    const data = await res.json();
    grid.innerHTML = '';
    if (!data.hits?.length) {
      grid.innerHTML = `<div style="grid-column:span 3;text-align:center;padding:24px;color:#888;font-size:13px">검색 결과 없음.</div>`;
      return;
    }
    data.hits.forEach(hit => grid.appendChild(makeImgEl(hit.webformatURL, q)));
  } catch { searchLoremflickr(q, grid); }
}

function previewUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const p = document.getElementById('urlPreviewImg');
  p.src = url; p.style.display = 'block';
  pendingImg = { type: 'url', url };
}

function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const MAX_DIM = 600;   // 최대 600px (가로/세로)
  const QUALITY = 0.75;  // JPEG 75% 품질
  // PNG는 투명도(알파채널) 보존 — JPEG 변환 시 검정 배경 생기는 문제 방지
  const isPng = file.type === 'image/png';

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);

    // 비율 유지하며 리사이즈
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!isPng) {
      // JPEG: 투명 영역을 흰색으로 채워 검정 배경 방지
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    // PNG: 투명도 유지 / 기타: JPEG 압축
    const compressed = isPng
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', QUALITY);

    const origKB = Math.round(file.size / 1024);
    const compKB = Math.round(compressed.length * 0.75 / 1024);
    console.log(`이미지 압축: ${origKB}KB → ${compKB}KB (${w}×${h}, ${isPng?'PNG':'JPEG'})`);

    // PNG 300KB 초과 시 경고 — 여러 장 사용 시 로컬 저장 용량(보통 5MB) 초과 위험
    if (isPng && compKB > 300) {
      document.querySelector('.upload-area').insertAdjacentHTML('beforeend',
        `<div style="margin-top:8px;font-size:11px;color:#b45309;background:#fef3c7;border-radius:6px;padding:6px 10px">
           ⚠️ PNG 용량이 ${compKB}KB입니다. 이미지가 많으면 저장 실패할 수 있습니다.<br>불투명 이미지라면 JPG로 변환 후 업로드를 권장합니다.
         </div>`
      );
    }

    pendingImg = { type: 'b64', url: compressed };
    // PNG 미리보기: 투명 체크무늬 배경으로 투명도 시각화
    const previewBg = isPng
      ? 'background:repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/14px 14px'
      : '';
    document.querySelector('.upload-area').innerHTML =
      `<img src="${compressed}" style="max-height:150px;border-radius:8px;object-fit:contain;${previewBg}">
       <div style="font-size:11px;color:#aaa;margin-top:6px">${w}×${h}px · 약 ${compKB}KB${isPng ? ' · PNG (투명도 유지)' : ''}</div>`;
  };
  img.src = objectUrl;
}

async function confirmImage() {
  if (!pendingImg) {
    const url = document.getElementById('urlInput').value.trim();
    if (url) pendingImg = { type: 'url', url };
    else { alert('이미지를 선택해주세요.'); return; }
  }

  // ── 헤더 이미지 처리 ───────────────────────────────────────────
  if (editItemId === '__header__') {
    const p = curPage();
    if (pendingImg.type === 'url' && !pendingImg.url.startsWith('data:')) {
      try { p.headerImg = await toBase64(pendingImg.url); }
      catch { p.headerImg = pendingImg.url; }
    } else {
      p.headerImg = pendingImg.url;
    }
    renderEditorHeader();
    renderPreview();
    saveState();
    closeModal();
    return;
  }

  // ── 메뉴 아이템 이미지 처리 (기존) ────────────────────────────
  let item = null;
  for (const p of S.pages) {
    item = p.items.find(i => i.id === editItemId);
    if (item) break;
  }
  if (!item) return;
  if (pendingImg.type === 'url' && !pendingImg.url.startsWith('data:')) {
    try { item.img = await toBase64(pendingImg.url); }
    catch { item.img = pendingImg.url; }
  } else {
    item.img = pendingImg.url;
  }
  renderItems(); renderPreview(); saveState(); closeModal();
}

async function toBase64(url) {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// ── PDF 내보내기 ─────────────────────────────────────────────────
// 핵심 수정: scalePreview()의 requestAnimationFrame이 scale(1) 리셋을 덮어쓰는 버그 방지
// → 화면 밖 별도 컨테이너에서 794px 실제 크기로 렌더링 후 캡처 (scaler 완전 분리)
async function exportPDF() {
  const btn = document.querySelector('.pdf-btn');
  btn.textContent = '⏳ 생성 중...'; btn.disabled = true;

  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const savedPage = S.cur;

  // 화면 밖 임시 컨테이너 — scaler transform 간섭 없이 794px 실제 크기로 렌더링
  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'position:fixed;left:-1600px;top:0;z-index:-9999;pointer-events:none;';
  const tempEl = document.createElement('div');
  offscreen.appendChild(tempEl);
  document.body.appendChild(offscreen);

  const clsMap = LAYOUT_CLS;
  const tplMap = { coffee:tplCoffee, modern:tplModern, elegant:tplElegant, chalk:tplChalk, bistro:tplBistro, minimal:tplMinimal };

  try {
    for (let i = 0; i < S.pages.length; i++) {
      S.cur = i;
      const p = curPage();

      // 인라인 스타일 초기화 후 재설정
      tempEl.removeAttribute('style');
      tempEl.style.width      = '794px';
      tempEl.style.fontFamily = S.font;
      tempEl.style.background = S.bg;

      if (p.type === 'cover') {
        tempEl.className = 'cover-page';
        tempEl.innerHTML = tplCover(p);
      } else {
        tempEl.className = clsMap[S.layout] || 'lc';
        tempEl.innerHTML = (tplMap[S.layout] || tplCoffee)(p);
      }

      // 폰트·이미지 로딩 대기
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 200));

      // ── A4 자동 맞춤 ──────────────────────────────────────────────
      // 콘텐츠가 A4 높이(1123px) 초과 시 세로 방향만 압축(scaleY).
      // ※ CSS zoom 은 html2canvas 가 지원하지 않아 잘림·어긋남 발생.
      //   CSS transform 은 html2canvas 가 정상 처리하므로 scaleY 방식 사용.
      // 래퍼 div(794×압축높이)로 감싸 html2canvas 캡처 루트를 명확히 지정.
      const naturalH = tempEl.scrollHeight;
      const fitZoom  = naturalH > 1123 ? 1123 / naturalH : 1;

      let captureEl = tempEl;
      let wrapper   = null;

      if (fitZoom < 1) {
        const scaledH = Math.ceil(naturalH * fitZoom);
        wrapper = document.createElement('div');
        wrapper.style.cssText =
          `width:794px;height:${scaledH}px;overflow:hidden;position:relative;background:${S.bg};`;
        offscreen.appendChild(wrapper);
        wrapper.appendChild(tempEl);

        // scaleY: 너비는 유지(좌우 공백 없음), 높이만 압축
        tempEl.style.transformOrigin = '0 0';
        tempEl.style.transform = `scaleY(${fitZoom.toFixed(5)})`;
        await new Promise(r => setTimeout(r, 150)); // 트랜스폼 안정화 대기
        captureEl = wrapper;
      }

      const canvas = await html2canvas(captureEl, {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: S.bg, logging: false,
        windowWidth: 794
      });

      // 래퍼 정리: tempEl 을 offscreen 으로 복귀, wrapper 제거
      if (wrapper) {
        tempEl.style.transform = '';
        tempEl.style.transformOrigin = '';
        offscreen.appendChild(tempEl);
        offscreen.removeChild(wrapper);
      }

      if (i > 0) pdf.addPage();
      // 항상 A4 너비를 꽉 채워 배치 (좌우 공백 없음)
      const fillW = pdfW;
      const fillH = canvas.height * (pdfW / canvas.width);
      const fillY = fillH < pdfH ? (pdfH - fillH) / 2 : 0; // 짧으면 세로 가운데
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, fillY, fillW, fillH);
    }

    const titlePage = S.pages.find(p => p.title) || S.pages[0];
    pdf.save(`${titlePage.title || 'menu'}_menu.pdf`);
  } catch (e) {
    alert('PDF 생성 실패: ' + e.message);
  } finally {
    document.body.removeChild(offscreen);
    S.cur = savedPage;
    renderPreview();
    btn.textContent = 'PDF 출력'; btn.disabled = false;
  }
}

// ── 초기화 ───────────────────────────────────────────────────────
function init() {
  initSupabase();    // 서버 연결 확인만 (자동 불러오기 없음)
  loadState();       // localStorage 복원
  syncUIFromState(); // 상태 → UI 반영
}

init();
