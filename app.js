// ── STATE ──────────────────────────────────────────────────────
const S = {
  layout: 'coffee',
  bg: '#F5EFE6',
  font: "'Playfair Display',serif",
  items: [
    { id: 1, name: 'Oat Cold Brew',  desc: '콜드 브루의 풍미와 달콤한 오트 음료가 어우러진 냉음 커피. 식물성 대체음료를 사용한 콜드 브루 음료.', price: '7,000', img: null },
    { id: 2, name: 'Shakerato',      desc: '얼음과 함께 쉐이킹하여 저지방의 진한 에스프레소와 어우러진 달콤한 음료.', price: '8,000', img: null },
    { id: 3, name: 'Nitro',          desc: '나이트로 커피 질감의 캐러멜이냐 부드러운 콜드 크림과 부드러운 묵직함이 어우러진 음료.', price: '8,500', img: null },
  ]
};

let editItemId = null;
let pendingImg  = null;

// ── BG PALETTES ─────────────────────────────────────────────────
const PALETTES = {
  coffee:  ['#F5EFE6','#EDE0D4','#D4C5B0','#C4A882','#8B7355','#3D2B1F'],
  modern:  ['#0a0a0a','#111827','#1e293b','#0f172a','#27272a','#18181b'],
  elegant: ['#FDFAF5','#F5EEE6','#EDE0D4','#FFF8F0','#FFFFF0','#FAF5EB'],
  chalk:   ['#2C4A3E','#1B3A2F','#354F52','#2F3E46','#354733','#1D3557'],
};
const DEFAULT_BG = { coffee:'#F5EFE6', modern:'#0a0a0a', elegant:'#FDFAF5', chalk:'#2C4A3E' };

function initSwatches() {
  const c = document.getElementById('bgSwatches');
  c.innerHTML = '';
  (PALETTES[S.layout] || PALETTES.coffee).forEach(col => {
    const el = document.createElement('div');
    el.className = 'bg-swatch' + (col === S.bg ? ' active' : '');
    el.style.background = col;
    el.title = col;
    el.onclick = () => { S.bg = col; initSwatches(); renderPreview(); };
    c.appendChild(el);
  });
  document.getElementById('bgCustom').value = S.bg;
}

function setCustomBg(v) { S.bg = v; document.querySelectorAll('.bg-swatch').forEach(s=>s.classList.remove('active')); renderPreview(); }

// ── LAYOUT ──────────────────────────────────────────────────────
function setLayout(l, btn) {
  S.layout = l;
  document.querySelectorAll('.layout-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  S.bg = DEFAULT_BG[l];
  initSwatches();
  renderPreview();
}

// ── ITEMS LIST ──────────────────────────────────────────────────
function renderItems() {
  const el = document.getElementById('itemsList');
  el.innerHTML = '';
  S.items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `
      <div class="item-header" onclick="toggleBody(${item.id})">
        <div class="item-num-badge">${i+1}</div>
        <div class="item-name-label" id="lbl-${item.id}">${item.name||'(이름없음)'}</div>
        <button class="item-del" onclick="delItem(${item.id},event)" title="삭제">✕</button>
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
      </div>`;
    el.appendChild(div);
  });
}

function toggleBody(id) {
  document.getElementById('body-'+id).classList.toggle('open');
}

function setField(id, key, val) {
  const item = S.items.find(i=>i.id===id);
  if (!item) return;
  item[key] = val;
  if (key==='name') document.getElementById('lbl-'+id).textContent = val||'(이름없음)';
  renderPreview();
}

function addItem() {
  const id = Date.now();
  S.items.push({id, name:'새 메뉴', desc:'설명을 입력하세요.', price:'0', img:null});
  renderItems();
  renderPreview();
  setTimeout(()=>{ const b=document.getElementById('body-'+id); if(b) b.classList.add('open'); },50);
}

function delItem(id, e) {
  e.stopPropagation();
  S.items = S.items.filter(i=>i.id!==id);
  renderItems();
  renderPreview();
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// ── PREVIEW RENDER ───────────────────────────────────────────────
function renderPreview() {
  const cat  = document.getElementById('eCategory').value;
  const title= document.getElementById('eTitle').value;
  const sub  = document.getElementById('eSubtitle').value;
  S.font     = document.getElementById('eFont').value;

  const el = document.getElementById('menuPreview');
  el.style.background   = S.bg;
  el.style.fontFamily   = S.font;

  const cls = {coffee:'lc',modern:'lm',elegant:'le',chalk:'lk'}[S.layout]||'lc';
  el.className = cls;

  if (S.layout==='coffee')  el.innerHTML = tplCoffee(cat,title,sub);
  if (S.layout==='modern')  el.innerHTML = tplModern(cat,title,sub);
  if (S.layout==='elegant') el.innerHTML = tplElegant(cat,title,sub);
  if (S.layout==='chalk')   el.innerHTML = tplChalk(cat,title,sub);

  scalePreview();
}

function imgTag(item, imgCls, phCls, phIcon='☕') {
  return item.img
    ? `<img class="${imgCls}" src="${item.img}" alt="">`
    : `<div class="${phCls}">${phIcon}</div>`;
}

function num(i) { return String(i+1).padStart(2,'0'); }

function tplCoffee(cat,title,sub) {
  const items = S.items.map((it,i)=>`
    <div class="m-item ${i%2===0?'odd':'even'}">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-num">${num(i)}.</div>
        <div class="m-name">${it.name}</div>
        <div class="m-desc">${it.desc}</div>
        <span class="m-price">₩${it.price}</span>
      </div>
    </div>`).join('');
  return `<div class="m-cat">${cat}</div>
          <div class="m-title">${title}</div>
          ${sub?`<div class="m-sub">${sub}</div>`:''}
          <hr class="m-divider">${items}`;
}

function tplModern(cat,title,sub) {
  const items = S.items.map((it,i)=>`
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-num">${num(i)}</div>
        <div class="m-row"><div class="m-name">${it.name}</div><div class="m-price">₩${it.price}</div></div>
        <div class="m-desc">${it.desc}</div>
      </div>
    </div>`).join('');
  return `<div class="m-cat">${cat}</div>
          <div class="m-title">${title}</div>
          <div class="m-sub">${sub}</div>
          <hr class="m-divider">
          <div class="m-grid">${items}</div>`;
}

function tplElegant(cat,title,sub) {
  const items = S.items.map((it,i)=>`
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph','✦')}
      <div class="m-content">
        <div class="m-row">
          <div class="m-left"><span class="m-num">${num(i)}</span><span class="m-name">${it.name}</span></div>
          <span class="m-price">₩${it.price}</span>
        </div>
        <div class="m-desc">${it.desc}</div>
      </div>
    </div>`).join('');
  return `<div class="m-cat">${cat}</div>
          <div class="m-title">${title}</div>
          <div class="m-sub">${sub}</div>
          <div class="m-divider"><span class="m-div-orn">✦</span></div>
          ${items}`;
}

function tplChalk(cat,title,sub) {
  const items = S.items.map((it,i)=>`
    <div class="m-item">
      ${imgTag(it,'m-img','m-img-ph')}
      <div class="m-content">
        <div class="m-row">
          <div class="m-left"><span class="m-num">${num(i)}.</span><span class="m-name">${it.name}</span></div>
          <span class="m-price">₩${it.price}</span>
        </div>
        <div class="m-desc">${it.desc}</div>
      </div>
    </div>`).join('');
  return `<div class="m-cat">${cat}</div>
          <div class="m-title">${title}</div>
          <hr class="m-divider">${items}`;
}

// ── SCALE PREVIEW ────────────────────────────────────────────────
function scalePreview() {
  const panel = document.querySelector('.preview-panel');
  const scaler = document.querySelector('.preview-scaler');
  const preview = document.getElementById('menuPreview');
  const pw = panel.clientWidth  - 48;
  const ph = panel.clientHeight - 48;
  const mw = preview.offsetWidth  || 794;
  const mh = preview.offsetHeight || 1123;
  const scale = Math.min(pw/mw, ph/mh, 1);
  scaler.style.transform = `scale(${scale})`;
  scaler.style.width  = mw + 'px';
  scaler.style.height = mh + 'px';
  panel.querySelector('.preview-panel') && (panel.style.minHeight = (mh*scale+48)+'px');
}

window.addEventListener('resize', scalePreview);

// ── IMAGE MODAL ──────────────────────────────────────────────────
function openModal(id) {
  editItemId  = id;
  pendingImg  = null;
  const item  = S.items.find(i=>i.id===id);
  document.getElementById('searchQ').value = item?.name || '';
  document.getElementById('imgGrid').innerHTML = '';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlPreviewImg').style.display = 'none';
  document.querySelector('.upload-area').innerHTML = `<div style="font-size:36px;margin-bottom:8px">📁</div><div>클릭하거나 파일을 드래그하여 업로드</div><div style="font-size:11px;color:#aaa;margin-top:4px">JPG, PNG, WEBP 지원</div>`;
  switchTab('search', document.querySelector('.mtab'));
  document.getElementById('imgModal').style.display = 'flex';
  if (item?.name) doSearch();
}

function closeModal() { document.getElementById('imgModal').style.display = 'none'; }

function overlayClose(e) { if(e.target.id==='imgModal') closeModal(); }

function switchTab(name, btn) {
  document.querySelectorAll('.mtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

async function doSearch() {
  const q = document.getElementById('searchQ').value.trim();
  if (!q) return;
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = Array(9).fill('<div class="img-skeleton"></div>').join('');

  await new Promise(r=>setTimeout(r,300));

  const base = Math.floor(Math.random()*9000)+1000;
  const enc  = encodeURIComponent(q.replace(/\s+/g,','));
  grid.innerHTML = '';

  for (let i=0;i<9;i++) {
    const img = document.createElement('img');
    img.className = 'img-opt';
    img.loading   = 'lazy';
    img.crossOrigin = 'anonymous';
    img.src = `https://loremflickr.com/320/320/${enc}?lock=${base+i}`;
    img.alt = q;
    img.onerror = ()=>{
      img.src = `https://placehold.co/320x320/e5e7eb/9ca3af?text=${encodeURIComponent(q)}`;
    };
    img.onclick = ()=>{
      document.querySelectorAll('.img-opt').forEach(x=>x.classList.remove('selected'));
      img.classList.add('selected');
      pendingImg = {type:'url', url:img.src};
    };
    grid.appendChild(img);
  }
}

function previewUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const p = document.getElementById('urlPreviewImg');
  p.src = url; p.style.display='block';
  pendingImg = {type:'url', url};
}

function handleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    pendingImg = {type:'b64', url:e.target.result};
    document.querySelector('.upload-area').innerHTML =
      `<img src="${e.target.result}" style="max-height:150px;border-radius:8px;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

async function confirmImage() {
  if (!pendingImg) {
    const url = document.getElementById('urlInput').value.trim();
    if (url) pendingImg = {type:'url', url};
    else { alert('이미지를 선택해주세요.'); return; }
  }
  const item = S.items.find(i=>i.id===editItemId);
  if (!item) return;

  if (pendingImg.type==='url' && !pendingImg.url.startsWith('data:')) {
    try { item.img = await toBase64(pendingImg.url); }
    catch { item.img = pendingImg.url; }
  } else {
    item.img = pendingImg.url;
  }

  renderItems();
  renderPreview();
  closeModal();
}

async function toBase64(url) {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload  = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// ── PDF EXPORT ───────────────────────────────────────────────────
async function exportPDF() {
  const btn = document.querySelector('.pdf-btn');
  btn.textContent = '⏳ 생성 중...';
  btn.disabled = true;

  const preview = document.getElementById('menuPreview');
  const scaler  = document.querySelector('.preview-scaler');
  const prevTransform = scaler.style.transform;
  scaler.style.transform = 'scale(1)';

  try {
    const canvas = await html2canvas(preview, {
      scale: 2, useCORS: true, allowTaint: false,
      backgroundColor: S.bg, logging: false,
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const pw  = pdf.internal.pageSize.getWidth();
    const ph  = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pw/canvas.width, ph/canvas.height);
    const x = (pw - canvas.width*ratio)/2;
    const y = (ph - canvas.height*ratio)/2;
    pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',x,y,canvas.width*ratio,canvas.height*ratio);
    const name = document.getElementById('eTitle').value || 'menu';
    pdf.save(`${name}_menu.pdf`);
  } catch(e) {
    alert('PDF 생성 실패: ' + e.message);
  }

  scaler.style.transform = prevTransform;
  btn.textContent = 'PDF 출력';
  btn.disabled = false;
}

// ── INIT ─────────────────────────────────────────────────────────
initSwatches();
renderItems();
renderPreview();
