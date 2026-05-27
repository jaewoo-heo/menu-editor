// GitHub Actions 배포 시 Secrets의 키로 자동 치환됨
const BUILTIN_KEY       = 'PIXABAY_KEY_PLACEHOLDER';
const SUPABASE_URL      = 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_PLACEHOLDER';
const STORAGE_KEY       = 'menuEditor_v1';
const SHARED_ROW_ID     = 'shared';

// ── Supabase 클라이언트 ──────────────────────────────────────────
let db = null;
let realtimeChannel = null;
let _lastSaveTime   = 0;   // 내 저장 타임스탬프 (realtime echo 무시용)

function setSyncStatus(text, state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = text;
  el.className   = 'sync-status' + (state ? ' ' + state : '');
}

function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL === 'SUPABASE_URL_PLACEHOLDER' ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'SUPABASE_ANON_KEY_PLACEHOLDER') {
    setSyncStatus('⚪ 로컬 모드', 'local');
    return;
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  realtimeChannel = db.channel('menu_realtime')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'menu_state', filter: `id=eq.${SHARED_ROW_ID}` },
      (payload) => {
        // 내가 저장한 이벤트는 무시 (1초 이내 에코)
        const eventTime = new Date(payload.new?.updated_at).getTime();
        if (Date.now() - _lastSaveTime < 1000 && Math.abs(eventTime - _lastSaveTime) < 1500) return;

        const incoming = payload.new?.data;
        if (incoming && Object.keys(incoming).length > 0) {
          applyState(incoming);
          syncUIFromState();
          showToast('🔄 다른 사용자가 수정했습니다', 3000);
        }
      })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('🟢 실시간 연결됨', 'connected');
      } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setSyncStatus('🔴 연결 끊김', 'error');
      }
    });

  // 탭 닫힐 때 채널 정리
  window.addEventListener('beforeunload', () => realtimeChannel?.unsubscribe());
}

// ── 상태 적용 (마이그레이션 포함) ───────────────────────────────
function applyState(data) {
  if (!data || typeof data !== 'object') return;
  if (data.pages) {
    data.pages.forEach((p, i) => {
      if (!p.type)     p.type     = (i === 0) ? 'cover' : 'menu';
      if (!p.category) p.category = '';
      if (!p.title)    p.title    = '';
      if (!p.subtitle) p.subtitle = '';
      if (!p.tagline)  p.tagline  = '';
      if (!p.items)    p.items    = [];
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

async function saveState() {
  clearTimeout(_saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch {}

  if (db) {
    const now = new Date().toISOString();
    _lastSaveTime = Date.now();
    try {
      await db.from('menu_state').upsert({ id: SHARED_ROW_ID, data: S, updated_at: now });
    } catch (e) {
      console.warn('Supabase 저장 실패:', e);
    }
  }
  showToast('✓ 저장됨', 2000);
}

async function loadState() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) applyState(JSON.parse(cached));
  } catch {}

  if (db) {
    try {
      const { data, error } = await db
        .from('menu_state').select('data').eq('id', SHARED_ROW_ID).single();
      if (!error && data?.data && Object.keys(data.data).length > 0) {
        applyState(data.data);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch {}
        return true;
      }
    } catch (e) {
      console.warn('Supabase 불러오기 실패 (로컬캐시 사용):', e);
    }
  }
  return false;
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
      id: 1, type: 'cover',
      category: 'special', title: 'COFFEE',
      subtitle: 'Our signature drinks', tagline: 'Est. 2024', items: []
    },
    {
      id: 2, type: 'menu',
      category: 'MENU', title: 'COFFEE',
      subtitle: 'Our signature drinks', tagline: '', items: [
        { id: 10, name: 'Oat Cold Brew',  desc: '콜드 브루의 풍미와 달콤한 오트 음료가 어우러진 냉음 커피.', price: '7,000', img: null, showName: true, showDesc: true, showPrice: true },
        { id: 11, name: 'Shakerato',      desc: '얼음과 함께 쉐이킹하여 진한 에스프레소와 어우러진 달콤한 음료.', price: '8,000', img: null, showName: true, showDesc: true, showPrice: true },
        { id: 12, name: 'Nitro',          desc: '부드러운 콜드 크림과 묵직한 질감이 어우러진 음료.', price: '8,500', img: null, showName: true, showDesc: true, showPrice: true },
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
  saveState();
}

// ── 페이지 관리 ──────────────────────────────────────────────────
function curPage() { return S.pages[S.cur]; }

function addPage() {
  const id = Date.now();
  S.pages.push({ id, type: 'menu', category: 'MENU', title: '', subtitle: '', tagline: '', items: [] });
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
  S.pages.forEach((p, i) => {
    const tab = document.createElement('div');
    tab.className = 'page-tab' + (i === S.cur ? ' active' : '');
    tab.onclick = () => setPage(i);
    tab.innerHTML = p.type === 'cover' ? '📖 표지' : `페이지 ${i}`;
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
            ? `<img class="img-thumb" src="${item.img}" id="thumb-${item.id}">`
            : `<div class="img-placeholder" id="thumb-${item.id}">☕</div>`}
          <button class="find-img-btn" onclick="openModal(${item.id})">🔍 이미지 찾기</button>
        </div>
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
      scheduleSave();   // 키 입력 → 디바운스
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
  p.items.push({ id, name: '새 메뉴', desc: '설명을 입력하세요.', price: '0', img: null, showName: true, showDesc: true, showPrice: true });
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
    const cls = { coffee:'lc', modern:'lm', elegant:'le', chalk:'lk', bistro:'lb', minimal:'lmin' }[S.layout] || 'lc';
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

function imgTag(item, imgCls, phCls, phIcon = '☕') {
  return item.img
    ? `<img class="${imgCls}" src="${item.img}" alt="">`
    : `<div class="${phCls}">${phIcon}</div>`;
}
function num(i) { return String(i+1).padStart(2,'0'); }

// ── 커버 템플릿 ───────────────────────────────────────────────────
function tplCover(p) {
  const cls = COVER_CSS[S.layout] || 'cover-coffee';
  return `
    <div class="cover-wrap ${cls}">
      <div class="cover-inner">
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
  return `<div class="m-cat"   style="font-size:${S.fs.cat}px">${esc(cat)}</div>
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
  return `<div class="m-cat"   style="font-size:${S.fs.cat*0.4}px">${esc(cat)}</div>
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
  return `<div class="m-cat"   style="font-size:${S.fs.cat*0.38}px">${esc(cat)}</div>
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
  return `<div class="m-cat"   style="font-size:${S.fs.cat}px">${esc(cat)}</div>
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
  const pixabayKey = (BUILTIN_KEY && BUILTIN_KEY !== 'PIXABAY_KEY_PLACEHOLDER')
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
  const reader = new FileReader();
  reader.onload = e => {
    pendingImg = { type: 'b64', url: e.target.result };
    document.querySelector('.upload-area').innerHTML =
      `<img src="${e.target.result}" style="max-height:150px;border-radius:8px;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

async function confirmImage() {
  if (!pendingImg) {
    const url = document.getElementById('urlInput').value.trim();
    if (url) pendingImg = { type: 'url', url };
    else { alert('이미지를 선택해주세요.'); return; }
  }
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
async function exportPDF() {
  const btn = document.querySelector('.pdf-btn');
  btn.textContent = '⏳ 생성 중...'; btn.disabled = true;
  const { jsPDF } = window.jspdf;
  const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const savedPage = S.cur;
  const scaler    = document.querySelector('.preview-scaler');
  const preview   = document.getElementById('menuPreview');
  try {
    for (let i = 0; i < S.pages.length; i++) {
      S.cur = i; renderPreview();
      scaler.style.transform = 'scale(1)';
      await new Promise(r => setTimeout(r, 150));
      const canvas = await html2canvas(preview, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: S.bg, logging: false });
      if (i > 0) pdf.addPage();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      const x = (pdfW - canvas.width * ratio) / 2;
      const y = (pdfH - canvas.height * ratio) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, canvas.width * ratio, canvas.height * ratio);
    }
    const titlePage = S.pages.find(p => p.title) || S.pages[0];
    pdf.save(`${titlePage.title || 'menu'}_menu.pdf`);
  } catch (e) { alert('PDF 생성 실패: ' + e.message); }
  S.cur = savedPage; renderPreview(); scalePreview();
  btn.textContent = 'PDF 출력'; btn.disabled = false;
}

// ── 초기화 ───────────────────────────────────────────────────────
async function init() {
  initSupabase();
  await loadState();
  syncUIFromState();  // 상태 → UI 반영 (중복 코드 제거)
}

init();
