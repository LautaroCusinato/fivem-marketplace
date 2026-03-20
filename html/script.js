/* ================================================================
   NEXUS MARKET — script.js  v7.0  CLEAN REWRITE
   FiveM NUI — ESX · ox_lib · ox_target

   FLUJO:
   1. Comprar → carrito → checkout → orden 'pending'
   2. Ir al hangar NPC → "Retirar mis compras" → ServerCallback
   3. Server hace GiveItem (ox_inventory o ESX) o INSERT garage
================================================================ */

// ─────────────────────────────────────────────────────────────
// CATEGORÍA
// ─────────────────────────────────────────────────────────────
function inferCategory(name) {
    if (!name) return 'consumables';
    const n = name.toLowerCase();
    if (n.startsWith('weapon_') || n === 'armor' || n === 'armure') return 'weapons';
    const knownVeh = ['adder','zentorno','elegy2','elegy','comet2','comet','sultan','kuruma',
        't20','banshee','infernus','cheetah','vacca','entity','nero','tempesta','osiris','krieger'];
    if (knownVeh.includes(n)) return 'vehicles';
    if (n.startsWith('vehicle_') || n.endsWith('_key') || n.endsWith('keys')) return 'vehicles';
    const tools = ['repairkit','lockpick','screwdriver','drill','thermite','turbo',
        'advancedrepairkit','advancedlockpick','toolkit'];
    if (tools.some(t => n.includes(t))) return 'tools';
    return 'consumables';
}
const CAT_LABELS = { weapons:'Arma', vehicles:'Vehículo', consumables:'Consumible', tools:'Herramienta' };
const CAT_COLORS = { weapons:'#ef4444', vehicles:'#3b82f6', consumables:'#22c55e', tools:'#f59e0b' };

// ─────────────────────────────────────────────────────────────
// IMÁGENES
// ─────────────────────────────────────────────────────────────
function getImgSrc(name) {
    if (typeof GetParentResourceName !== 'undefined')
        return `nui://ox_inventory/web/images/${name}.png`;
    return `https://ui-avatars.com/api/?name=${(name||'?').slice(0,2).toUpperCase()}&size=128&background=1e3a5f&color=60a5fa&bold=true`;
}
function getItemImgHTML(item) {
    const cat  = item.category || inferCategory(item.item || '');
    const icon = { weapons:'shield', vehicles:'car', consumables:'heart-pulse', tools:'wrench' }[cat] || 'package';
    const src  = item.image || getImgSrc(item.item || '');
    const err  = `this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex'`;
    return `<img src="${src}" onerror="${err}" alt="${item.label||''}" loading="lazy">
            <span class="cat-icon" style="display:none"><i data-lucide="${icon}"></i></span>`;
}

// ─────────────────────────────────────────────────────────────
// SEEDS
// ─────────────────────────────────────────────────────────────
const SEED_LISTINGS = [
    { id:'seed_1',  item:'weapon_assaultrifle', label:'Assault Rifle',    price:43500,  qty:10, min_qty:1, seller:'ArmsDealer_LS',   isSeed:true, isVehicle:false },
    { id:'seed_2',  item:'weapon_pistol',       label:'Pistol',           price:4200,   qty:10, min_qty:1, seller:'Ammunation_NPC',  isSeed:true, isVehicle:false },
    { id:'seed_3',  item:'weapon_smg',          label:'SMG',              price:7800,   qty:10, min_qty:1, seller:'Vendor_9',        isSeed:true, isVehicle:false },
    { id:'seed_4',  item:'turbo',               label:'Turbo Kit',        price:11500,  qty:5,  min_qty:1, seller:'LSCustoms_NPC',   isSeed:true, isVehicle:false },
    { id:'seed_5',  item:'repairkit',           label:'Repair Kit',       price:750,    qty:20, min_qty:1, seller:'Benny_Mechanic',  isSeed:true, isVehicle:false },
    { id:'seed_6',  item:'medikit',             label:'Medikit',          price:480,    qty:20, min_qty:1, seller:'Pharmacy_NPC',    isSeed:true, isVehicle:false },
    { id:'seed_7',  item:'bandage',             label:'Bandage',          price:95,     qty:50, min_qty:5, seller:'Pharmacy_NPC',    isSeed:true, isVehicle:false },
    { id:'seed_8',  item:'armor',               label:'Body Armor',       price:2200,   qty:5,  min_qty:1, seller:'Vendor_17',       isSeed:true, isVehicle:false },
    { id:'seed_9',  item:'lockpick',            label:'Lockpick',         price:1900,   qty:10, min_qty:1, seller:'Vendor_5',        isSeed:true, isVehicle:false },
    { id:'seed_10', item:'water',               label:'Water Bottle',     price:75,     qty:99, min_qty:1, seller:'Convenience_NPC', isSeed:true, isVehicle:false },
    { id:'seed_11', item:'sandwich',            label:'Sandwich',         price:110,    qty:50, min_qty:1, seller:'Convenience_NPC', isSeed:true, isVehicle:false },
    { id:'seed_12', item:'adder',    label:'Truffade Adder',   price:118000, qty:1, min_qty:1, seller:'PDM_Sales', isSeed:true, isVehicle:true, vehicleModel:'adder'    },
    { id:'seed_13', item:'zentorno', label:'Pegassi Zentorno', price:82000,  qty:1, min_qty:1, seller:'PDM_Sales', isSeed:true, isVehicle:true, vehicleModel:'zentorno' },
    { id:'seed_14', item:'elegy2',   label:'Annis Elegy RH8',  price:33500,  qty:1, min_qty:1, seller:'Simeon_NPC',isSeed:true, isVehicle:true, vehicleModel:'elegy2'   },
].map(s => ({ ...s, status:'active', category: s.isVehicle ? 'vehicles' : inferCategory(s.item) }));

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const S = {
    user:       { name:'Unknown', citizenid:'', job:'' },
    balance:    0,
    inventory:  [],
    market:     [],   // seeds + DB activos
    myListings: [],
    cart:       [],   // { ...listingData, qty }
    favourites: new Set(),
    orders:     [],
    profile:    { totalSpent:0, totalEarned:0, totalSales:0, totalPurchases:0 },
    filter:     'all',
    search:     '',
    sort:       'recent',
    priceMin:   '',
    priceMax:   '',
    theme:      'dark',
};

// ─────────────────────────────────────────────────────────────
// NUI BRIDGE
// ─────────────────────────────────────────────────────────────
function nuiFetch(ep, data = {}) {
    if (typeof GetParentResourceName === 'undefined')
        return Promise.resolve({ success:true, id:Date.now() });
    return fetch(`https://${GetParentResourceName()}/${ep}`, {
        method:'POST', headers:{'Content-Type':'application/json; charset=UTF-8'},
        body: JSON.stringify(data)
    }).then(r => r.ok ? r.json() : { success:false })
      .catch(e => { console.error('[Nexus]', ep, e); return { success:false, reason:e.message }; });
}

// ─────────────────────────────────────────────────────────────
// BALANCE
// ─────────────────────────────────────────────────────────────
function setBalance(v) {
    S.balance = Number(v) || 0;
    const el = document.getElementById('wallet-balance');
    if (el) el.innerText = `$${S.balance.toLocaleString()}`;
}
function deductBalance(v) { setBalance(S.balance - v); }

// ─────────────────────────────────────────────────────────────
// FAVOURITES
// ─────────────────────────────────────────────────────────────
function loadFavourites(serverFavs) {
    S.favourites = serverFavs?.length ? new Set(serverFavs.map(String)) : new Set();
    try { if (!serverFavs?.length) S.favourites = new Set(JSON.parse(localStorage.getItem(`nx_fav_${S.user.citizenid}`) || '[]').map(String)); } catch(_){}
    const el = document.getElementById('fav-count');
    if (el) el.innerText = S.favourites.size;
}
function saveFavourites() {
    nuiFetch('marketplace:saveFavourites', { citizenid:S.user.citizenid, favourites:[...S.favourites] });
    try { localStorage.setItem(`nx_fav_${S.user.citizenid}`, JSON.stringify([...S.favourites])); } catch(_){}
}
function toggleFavourite(e, id) {
    e.stopPropagation();
    const sid = String(id);
    S.favourites.has(sid) ? S.favourites.delete(sid) : S.favourites.add(sid);
    const el = document.getElementById('fav-count');
    if (el) el.innerText = S.favourites.size;
    saveFavourites(); renderAllGrids();
    showToast(S.favourites.has(sid) ? 'Agregado a favoritos ♥' : 'Quitado de favoritos', S.favourites.has(sid) ? 'success' : 'info');
}

// ─────────────────────────────────────────────────────────────
// MERGE LISTINGS
// ─────────────────────────────────────────────────────────────
function mergeListings(dbListings) {
    const map = new Map();
    SEED_LISTINGS.forEach(s => map.set(String(s.id), s));
    (dbListings || []).forEach(l => {
        if (l.status === 'active' && !l.isSeed) {
            l.category = l.isVehicle ? 'vehicles' : inferCategory(l.item);
            l.min_qty  = l.min_qty || 1;
            map.set(String(l.id), l);
        }
    });
    S.market = [...map.values()];
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(S.theme); lucide.createIcons(); setupEvents(); updateScale();
    if (typeof GetParentResourceName === 'undefined') _devMode();
});

function _devMode() {
    mergeListings([]);
    S.user = { name:'Fruti Dev', citizenid:'QBZ-99321', job:'unemployed' };
    S.inventory = [
        { name:'weapon_pistol', label:'Pistol',     count:2,  isVehicle:false },
        { name:'repairkit',     label:'Repair Kit', count:10, isVehicle:false },
        { name:'bandage',       label:'Bandage',    count:20, isVehicle:false },
    ];
    S.orders = [
        { id:'#ORD-9921', orderId:9921, item:'Turbo Kit', date:'Hace 2 días', amount:11500, status:'pending',   isVehicle:false },
        { id:'#ORD-9922', orderId:9922, item:'Adder',     date:'Hoy',         amount:118000,status:'pending',   isVehicle:true  },
    ];
    S.myListings = [
        { id:'my_1', dbId:1, item:'repairkit', label:'Repair Kit', price:750, qty:10, min_qty:2, category:'tools',       status:'pending', date:'Hace 5 min' },
        { id:'my_2', dbId:2, item:'bandage',   label:'Bandage',    price:95,  qty:20, min_qty:5, category:'consumables', status:'active',  date:'Ayer' },
    ];
    setBalance(48750); loadFavourites([]);
    populateSelect(); renderOrders(); renderMessages(); renderMyListings();
    updateUsernameDisplay(); renderProfile();
    document.getElementById('app').style.display = 'flex';
    updateScale(); switchTab('home');
}

// ─────────────────────────────────────────────────────────────
// NUI MESSAGES
// ─────────────────────────────────────────────────────────────
window.addEventListener('message', ev => {
    const d = ev.data;
    switch(d.action) {
        case 'open':             _openUI(d);                              break;
        case 'close':            closeUI();                               break;
        case 'updateListings':   mergeListings(d.listings); renderAllGrids(); break;
        case 'updateBalance':    setBalance(d.balance);                   break;
        case 'updateInventory':  S.inventory = d.inventory||[]; populateSelect(); break;
        case 'listingActivated': _onListingActivated(d);                  break;
        case 'listingPurchased': _onListingPurchased(d);                  break;
    }
});

function _openUI(d) {
    if (d.playerData) S.user = { name:d.playerData.name||'Unknown', citizenid:d.playerData.citizenid||'', job:d.playerData.job||'' };
    if (d.profile)    S.profile = d.profile;
    setBalance(d.balance || 0);
    if (d.inventory)  { S.inventory = d.inventory; populateSelect(); }
    if (d.orders)     S.orders = d.orders;
    if (d.myListings) S.myListings = d.myListings.map(l => ({ ...l, category: l.isVehicle ? 'vehicles' : inferCategory(l.item) }));
    loadFavourites(d.favourites || []);
    mergeListings(d.listings || []);
    updateUsernameDisplay(); renderProfile(); renderOrders(); renderMyListings(); renderMessages();
    document.getElementById('app').style.display = 'flex';
    updateScale(); switchTab('home');
}

function updateUsernameDisplay() {
    ['sidebar-username','profile-name'].forEach(id => { const el=document.getElementById(id); if(el) el.innerText=S.user.name; });
    const cid=document.getElementById('settings-citizenid'); if(cid) cid.value=S.user.citizenid;
    const ni=document.getElementById('settings-display-name'); if(ni) ni.value=S.user.name;
}

function _onListingActivated(d) {
    const idx = S.myListings.findIndex(l => String(l.id)===String(d.listingId) || String(l.dbId)===String(d.listingId));
    if (idx !== -1) { S.myListings[idx].status='active'; renderMyListings(); }
    if (d.listing && !S.market.find(m => String(m.id)===String(d.listingId))) {
        d.listing.category = d.listing.isVehicle ? 'vehicles' : inferCategory(d.listing.item);
        S.market.push(d.listing);
    }
    renderAllGrids();
    showToast(`"${d.listing?.label}" activo en el mercado`, 'success');
}

function _onListingPurchased(d) {
    S.market     = S.market.filter(m => String(m.id) !== String(d.listingId));
    S.myListings = S.myListings.filter(l => String(l.id) !== String(d.listingId));
    S.cart       = S.cart.filter(c => String(c.id) !== String(d.listingId));
    updateCartUI(); renderAllGrids(); renderMyListings();
    if (d.price > 0) showToast(`"${d.label}" vendido! +$${Number(d.price).toLocaleString()}`, 'success');
}

// ─────────────────────────────────────────────────────────────
// CLOSE
// ─────────────────────────────────────────────────────────────
function closeUI() {
    nuiFetch('close');
    document.getElementById('app').style.display = 'none';
    closeAllModals(); S.cart = []; updateCartBadge();
}
window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.modal-overlay.open')) { closeAllModals(); return; }
    if (document.getElementById('cart-panel').classList.contains('open')) { toggleCart(); return; }
    closeUI();
});

// ─────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────
function applyTheme(t) {
    S.theme = t; document.documentElement.setAttribute('data-theme', t);
    const ic = document.getElementById('theme-icon');
    if (ic) { ic.setAttribute('data-lucide', t==='dark'?'sun':'moon'); lucide.createIcons(); }
    try { localStorage.setItem('nexus_theme', t); } catch(_){}
}
function toggleTheme() { applyTheme(S.theme==='dark'?'light':'dark'); }

// ─────────────────────────────────────────────────────────────
// ROUTING
// ─────────────────────────────────────────────────────────────
const VIEW_TITLES = { home:'Home', explore:'Explorar Mercado', favourites:'Tus Favoritos',
    orders:'Mis Órdenes', mylistings:'Mis Publicaciones', messages:'Mensajes', settings:'Mi Cuenta' };

function switchTab(tabId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav li').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabId}`)?.classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById('page-title').innerText = VIEW_TITLES[tabId] || tabId;
    const filt = document.getElementById('explore-filters');
    if (tabId==='explore'){filt.classList.remove('hidden');renderSkeletons('explore-grid',8);setTimeout(renderExplore,250);}
    else{filt.classList.add('hidden');}
    if (tabId==='home'){renderSkeletons('home-grid',4);setTimeout(renderHome,250);}
    if (tabId==='favourites') renderFavourites();
    if (tabId==='orders')     renderOrders();
    if (tabId==='mylistings') renderMyListings();
    if (tabId==='settings')   renderProfile();
}

// ─────────────────────────────────────────────────────────────
// DROPDOWNS
// ─────────────────────────────────────────────────────────────
function toggleDropdown(id) {
    const m = document.querySelector(`.dropdown[data-dropdown="${id}"] .dropdown-menu`);
    document.querySelectorAll('.dropdown-menu').forEach(x => { if(x!==m) x.classList.remove('show'); });
    m?.classList.toggle('show');
}
function selectDropdown(id,text){document.getElementById('loc-text').innerText=text;toggleDropdown(id);renderExplore();}
function selectSort(t,text){S.sort=t;document.getElementById('sort-text').innerText=text;toggleDropdown('sort');renderAllGrids();}
document.addEventListener('click',e=>{if(!e.target.closest('.dropdown'))document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('show'));});

// ─────────────────────────────────────────────────────────────
// FILTER / SORT
// ─────────────────────────────────────────────────────────────
function getFilteredData() {
    let data = S.market.filter(i => {
        if (i.status !== 'active') return false;
        const cat = i.category || inferCategory(i.item);
        return (S.filter==='all' || cat===S.filter)
            && (i.label||'').toLowerCase().includes(S.search.toLowerCase())
            && (S.priceMin==='' || i.price >= parseInt(S.priceMin))
            && (S.priceMax==='' || i.price <= parseInt(S.priceMax));
    });
    return data.sort((a,b) => {
        if (S.sort==='price_asc')  return a.price-b.price;
        if (S.sort==='price_desc') return b.price-a.price;
        return String(b.id).localeCompare(String(a.id));
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────
function renderAllGrids() {
    if (document.getElementById('view-home').classList.contains('active'))       renderHome();
    if (document.getElementById('view-explore').classList.contains('active'))    renderExplore();
    if (document.getElementById('view-favourites').classList.contains('active')) renderFavourites();
}
function renderSkeletons(id,n) {
    const c=document.getElementById(id);if(!c)return;
    c.innerHTML=Array(n).fill(`<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`).join('');
}
function emptyStateHTML(icon,title,msg,btnLabel,btnFn) {
    return `<div class="empty-state"><i data-lucide="${icon}"></i><h3>${title}</h3><p>${msg}</p>
        ${btnLabel?`<button class="btn-primary mt-3" onclick="${btnFn}">${btnLabel}</button>`:''}</div>`;
}

// ─────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────
function createCardHTML(item) {
    const cat    = item.category || inferCategory(item.item);
    const color  = CAT_COLORS[cat] || '#8b5cf6';
    const label  = CAT_LABELS[cat] || cat;
    const isMine = item.seller === S.user.name;
    const isFav  = S.favourites.has(String(item.id));
    const inCart = !!S.cart.find(c => String(c.id)===String(item.id));
    const isVeh  = item.isVehicle || cat==='vehicles';

    return `
    <div class="product-card ${isVeh?'vehicle-card':''}" onclick="openItemModal('${item.id}')">
        <button class="btn-fav ${isFav?'active':''}" onclick="toggleFavourite(event,'${item.id}')">
            <i data-lucide="heart"></i>
        </button>
        <div class="card-img">
            <span class="card-qty">×${item.qty}</span>
            ${getItemImgHTML(item)}
        </div>
        <div class="card-info">
            <h3 title="${item.label}">${item.label}</h3>
            <p class="card-seller">
                <i data-lucide="shield-check" style="width:12px;color:var(--success)"></i>
                ${isMine ? '<em style="color:var(--accent)">Tu publicación</em>' : item.seller}
            </p>
            <span class="cat-badge" style="background:${color}18;color:${color};border-color:${color}30">
                ${label}${isVeh?' 🚗':''}
            </span>
            ${item.min_qty > 1 ? `<span class="min-qty-badge">Mín ×${item.min_qty}</span>` : ''}
        </div>
        <div class="card-footer">
            <div>
                <div class="price">$${item.price.toLocaleString()}</div>
                <div class="price-unit">por unidad</div>
            </div>
            ${isMine
                ? `<button class="btn-cart-sm btn-danger-sm" onclick="removeMyListingClick(event,'${item.id}')"><i data-lucide="trash-2"></i></button>`
                : `<button class="btn-cart-sm ${inCart?'in-cart':''}" onclick="${isVeh?`openItemModal('${item.id}')`:`addToCart(event,'${item.id}')`}">
                       <i data-lucide="${inCart?'check':isVeh?'car':'shopping-bag'}"></i>
                   </button>`
            }
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// RENDER PAGES
// ─────────────────────────────────────────────────────────────
function renderHome() {
    const g=document.getElementById('home-grid');if(!g)return;
    const items=S.market.filter(i=>i.status==='active').slice(0,4);
    g.innerHTML=items.length?items.map(createCardHTML).join(''):emptyStateHTML('package','Sin publicaciones','Sé el primero.');
    lucide.createIcons();
}
function renderExplore() {
    const g=document.getElementById('explore-grid');if(!g)return;
    const data=getFilteredData();
    g.innerHTML=data.length?data.map(createCardHTML).join(''):`<div style="grid-column:1/-1">${emptyStateHTML('search-x','Sin resultados','Probá otros filtros.')}</div>`;
    lucide.createIcons();
}
function renderFavourites() {
    const g=document.getElementById('fav-grid'),e=document.getElementById('fav-empty');if(!g)return;
    const favs=S.market.filter(i=>S.favourites.has(String(i.id))&&i.status==='active');
    if(!favs.length){g.style.display='none';if(e)e.style.display='flex';}
    else{g.style.display='grid';if(e)e.style.display='none';g.innerHTML=favs.map(createCardHTML).join('');lucide.createIcons();}
}
function renderOrders() {
    const tb=document.getElementById('orders-tbody');if(!tb)return;
    if(!S.orders.length){tb.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">Sin órdenes aún.</td></tr>`;return;}
    tb.innerHTML=S.orders.map(o=>`
        <tr>
            <td class="order-id">${o.id}</td>
            <td style="font-weight:600">${o.item}</td>
            <td style="color:var(--text-muted)">${o.date}</td>
            <td style="font-weight:800;color:var(--success)">$${Number(o.amount).toLocaleString()}</td>
            <td>
                ${o.status==='pending'
                    ?`<button class="btn-primary-sm outline" onclick="nuiFetch('marketplace:setHangarWaypoint');showToast('Dirigite al hangar a retirar','info')">
                          <i data-lucide="warehouse"></i> ${o.isVehicle?'Retirar vehículo':'Retirar items'}
                      </button>`
                    :`<span class="status-pill completed">✓ Listo</span>`
                }
            </td>
        </tr>`).join('');
    lucide.createIcons();
}
function renderMyListings() {
    const c=document.getElementById('my-listings-container');if(!c)return;
    if(!S.myListings.length){c.innerHTML=emptyStateHTML('tag','Sin publicaciones','Publicá un item.','Crear publicación',"openModal('sell-modal')");lucide.createIcons();return;}
    c.innerHTML=S.myListings.map(l=>{
        const cat=l.category||(l.isVehicle?'vehicles':inferCategory(l.item));
        const color=CAT_COLORS[cat]||'#8b5cf6';
        const pend=l.status==='pending';
        const isVeh=l.isVehicle||cat==='vehicles';
        return `
        <div class="my-listing-card ${pend?'pending':'active-listing'}">
            <div class="my-listing-img">${getItemImgHTML({item:l.item,category:cat,label:l.label})}</div>
            <div class="my-listing-info">
                <h4>${l.label}</h4>
                <span class="cat-badge" style="background:${color}18;color:${color};border-color:${color}30">${CAT_LABELS[cat]||cat}</span>
                <p style="font-size:.76rem;color:var(--text-faint);margin-top:4px">
                    ×${l.qty} en venta · Mín ×${l.min_qty||1} · ${l.date||'Reciente'}
                </p>
            </div>
            <div class="my-listing-meta">
                <div class="price">$${Number(l.price).toLocaleString()}</div>
                <span class="listing-status-badge ${pend?'pending':'active'}">
                    <i data-lucide="${pend?'clock':'check-circle'}" style="width:11px"></i>
                    ${pend?(isVeh?'Llevá el vehículo al hangar':'Llevá el item al hangar'):'Activo en el mercado'}
                </span>
            </div>
            <div class="my-listing-actions">
                ${pend?`<button class="btn-primary-sm" onclick="nuiFetch('marketplace:setHangarWaypoint');showToast('Waypoint marcado','info')"><i data-lucide="map-pin"></i> Hangar</button>`:''}
                <button class="btn-danger-sm-full" onclick="removeMyListingClick(event,'${l.id}')"><i data-lucide="trash-2"></i></button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}
function renderProfile() {
    const p=S.profile;
    [['profile-spent',`$${Number(p.totalSpent||0).toLocaleString()}`],
     ['profile-earned',`$${Number(p.totalEarned||0).toLocaleString()}`],
     ['profile-sales',p.totalSales||0],['profile-purchases',p.totalPurchases||0]]
    .forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.innerText=v;});
}
function renderMessages() {
    const list=document.getElementById('message-list');if(!list)return;
    const c=[{name:'Ammunation Clerk',last:'¿El Rifle sigue disponible?',unread:true},
             {name:'Benny Mechanic',  last:'Gracias por la compra 🙏',  unread:true},
             {name:'PDM Sales',       last:'Nuevo stock llegó.',         unread:false}];
    list.innerHTML=c.map((x,i)=>`
        <div class="msg-contact ${i===0?'active':''}" onclick="selectContact(this)">
            <div class="msg-avatar-wrap">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(x.name)}&background=1e3a5f&color=60a5fa&bold=true" class="avatar-sm">
                ${x.unread?'<span class="unread-dot"></span>':''}
            </div>
            <div class="contact-info"><h5>${x.name}</h5><p>${x.last}</p></div>
        </div>`).join('');
}
function selectContact(el){document.querySelectorAll('.msg-contact').forEach(c=>c.classList.remove('active'));el.classList.add('active');}

// ─────────────────────────────────────────────────────────────
// ITEM MODAL
// ─────────────────────────────────────────────────────────────
function openItemModal(id) {
    const item = S.market.find(i => String(i.id)===String(id));
    if (!item) return;
    const cat    = item.category || inferCategory(item.item);
    const color  = CAT_COLORS[cat] || '#8b5cf6';
    const catLbl = CAT_LABELS[cat] || cat;
    const isVeh  = item.isVehicle || cat==='vehicles';
    const isMine = item.seller === S.user.name;
    const isFav  = S.favourites.has(String(item.id));
    const inCart = S.cart.find(c => String(c.id)===String(item.id));
    const minQty = item.min_qty || 1;
    const maxQty = item.qty;
    const canAff = S.balance >= item.price * minQty;

    document.getElementById('modal-content').innerHTML = `
    <div class="modal-left">
        <div class="modal-img-wrap">${getItemImgHTML(item)}</div>
        <div class="modal-img-meta">
            <span class="cat-badge" style="background:${color}18;color:${color};border-color:${color}30">${catLbl}${isVeh?' 🚗':''}</span>
            <span class="stock-tag">×${maxQty} en stock</span>
        </div>
        <div class="${isVeh?'hangar-notice':'pickup-notice'}">
            <i data-lucide="${isVeh?'car':'warehouse'}"></i>
            <span>${isVeh?'Comprado → va a tu garage. Retiralo desde cualquier garage.':'Comprado → retirás en el hangar con el NPC.'}</span>
        </div>
    </div>
    <div class="modal-right">
        <div class="modal-right-inner">
            <div class="modal-title-row">
                <h2 class="modal-item-title">${item.label}</h2>
                <button class="btn-fav modal-fav ${isFav?'active':''}" onclick="toggleFavourite(event,'${item.id}')">
                    <i data-lucide="heart"></i>
                </button>
            </div>
            <div class="seller-row">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(item.seller)}&background=1e3a5f&color=60a5fa&bold=true" class="avatar-sm">
                <div>
                    <div class="seller-name">${isMine?'Vos (Tu publicación)':item.seller}</div>
                    <div class="seller-badge"><i data-lucide="badge-check" style="width:12px"></i> Verificado</div>
                </div>
            </div>
            <table class="spec-table">
                <tr><td>Categoría</td><td>${catLbl}</td></tr>
                <tr><td>Stock</td>    <td>×${maxQty}</td></tr>
                ${!isVeh?`<tr><td>Mínimo</td><td>×${minQty}</td></tr>`:''}
                <tr><td>Entrega</td>  <td>${isVeh?'🚗 Tu garage':'📦 Hangar'}</td></tr>
            </table>
            ${!isMine && !isVeh ? `
            <div class="qty-selector-wrap">
                <label>Cantidad <span style="color:var(--text-faint);font-size:.78rem">(mín ×${minQty})</span></label>
                <div class="qty-selector">
                    <button class="qty-btn" onclick="changeModalQty(-1,'${item.id}')">−</button>
                    <input type="number" id="modal-qty" value="${inCart?inCart.qty:minQty}" min="${minQty}" max="${maxQty}" oninput="updateModalTotal('${item.id}')">
                    <button class="qty-btn" onclick="changeModalQty(1,'${item.id}')">+</button>
                </div>
                <div class="buy-total-row">
                    <span>Total: <strong id="modal-total">$${(item.price*(inCart?inCart.qty:minQty)).toLocaleString()}</strong></span>
                    <span style="font-size:.8rem;color:var(--text-muted)">Saldo: $${S.balance.toLocaleString()}</span>
                </div>
            </div>` : ''}
            <div class="modal-action-row">
                <div>
                    <div class="modal-price">$${item.price.toLocaleString()} <span style="font-size:.82rem;font-weight:500;color:var(--text-muted)">/u</span></div>
                    ${!canAff&&!isMine?`<div style="color:var(--danger);font-size:.79rem;margin-top:3px">⚠ Saldo insuficiente</div>`:''}
                </div>
                ${isMine
                    ? `<button class="btn-danger" onclick="removeMyListingClick(event,'${item.id}');closeModal('product-modal')"><i data-lucide="trash-2"></i> Eliminar</button>`
                    : inCart
                        ? `<button class="btn-primary" onclick="closeModal('product-modal');toggleCart()"><i data-lucide="shopping-bag"></i> Ver carrito</button>`
                        : isVeh
                            ? `<button class="btn-primary" ${!canAff?'disabled':''} onclick="addVehicleToCart('${item.id}');closeModal('product-modal')"><i data-lucide="car"></i> Agregar al carrito</button>`
                            : `<button class="btn-primary" id="modal-add-btn" ${!canAff?'disabled':''} onclick="addToCartFromModal('${item.id}')"><i data-lucide="shopping-bag"></i> Agregar al carrito</button>`
                }
            </div>
        </div>
    </div>`;
    document.getElementById('product-modal').classList.add('open');
    lucide.createIcons();
}
function openProductModal(id) { openItemModal(id); }

function changeModalQty(delta, id) {
    const item = S.market.find(i=>String(i.id)===String(id)); if(!item)return;
    const inp = document.getElementById('modal-qty'); if(!inp)return;
    let v = parseInt(inp.value)+delta;
    v = Math.max(item.min_qty||1, Math.min(item.qty, v));
    inp.value = v; updateModalTotal(id);
}
function updateModalTotal(id) {
    const item = S.market.find(i=>String(i.id)===String(id)); if(!item)return;
    const inp = document.getElementById('modal-qty');
    const minQ = item.min_qty||1;
    let v = parseInt(inp?.value)||minQ;
    v = Math.max(minQ, Math.min(item.qty, v));
    if(inp) inp.value=v;
    const tot = item.price*v;
    const el = document.getElementById('modal-total'); if(el) el.innerText=`$${tot.toLocaleString()}`;
    const btn = document.getElementById('modal-add-btn'); if(btn) btn.disabled=S.balance<tot;
}

// ─────────────────────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────────────────────
function toggleCart() { document.getElementById('cart-panel').classList.toggle('open'); }

function addToCart(e, id) {
    if(e) e.stopPropagation();
    const item = S.market.find(i=>String(i.id)===String(id)); if(!item)return;
    if(item.isVehicle||(item.category||inferCategory(item.item))==='vehicles'){openItemModal(id);return;}
    if(S.cart.find(c=>String(c.id)===String(id))){showToast(`${item.label} ya está en el carrito`,'info');return;}
    const qty=item.min_qty||1;
    if(S.balance<item.price*qty){showToast('Saldo insuficiente','error');return;}
    S.cart.push({...item,qty}); updateCartUI(); renderAllGrids();
    showToast(`${item.label} ×${qty} agregado`,'success');
}

function addToCartFromModal(id) {
    const item = S.market.find(i=>String(i.id)===String(id)); if(!item)return;
    const inp = document.getElementById('modal-qty');
    const qty = inp ? parseInt(inp.value) : (item.min_qty||1);
    if(qty<(item.min_qty||1)){showToast(`Mínimo ×${item.min_qty||1}`,'error');return;}
    if(qty>item.qty){showToast(`Solo hay ×${item.qty}`,'error');return;}
    if(S.balance<item.price*qty){showToast('Saldo insuficiente','error');return;}
    const ex = S.cart.find(c=>String(c.id)===String(id));
    if(ex){ex.qty=qty;showToast(`Cantidad actualizada ×${qty}`,'info');}
    else{S.cart.push({...item,qty});showToast(`${item.label} ×${qty} agregado`,'success');}
    closeModal('product-modal'); updateCartUI(); renderAllGrids();
}

function addVehicleToCart(id) {
    const item = S.market.find(i=>String(i.id)===String(id)); if(!item)return;
    if(S.cart.find(c=>String(c.id)===String(id))){showToast('Ya está en el carrito','info');return;}
    if(S.balance<item.price){showToast('Saldo insuficiente','error');return;}
    S.cart.push({...item,qty:1}); updateCartUI(); renderAllGrids();
    showToast(`${item.label} 🚗 agregado`,'success');
}

function removeFromCart(idx) { S.cart.splice(idx,1); updateCartUI(); renderAllGrids(); }

function updateCartUI() {
    updateCartBadge();
    const con = document.getElementById('cart-items'); if(!con)return;
    let sub = 0;
    if(!S.cart.length) {
        con.innerHTML=`<div class="cart-empty"><i data-lucide="shopping-bag"></i><p>Tu carrito está vacío</p></div>`;
    } else {
        con.innerHTML=S.cart.map((item,i)=>{
            const lt=item.price*item.qty; sub+=lt;
            const isVeh=item.isVehicle||item.category==='vehicles';
            return `
            <div class="cart-item">
                <div class="cart-img-mini">${getItemImgHTML(item)}</div>
                <div class="cart-info">
                    <h4>${item.label}${item.qty>1?` <span style="color:var(--text-muted)">×${item.qty}</span>`:''}</h4>
                    <p>$${lt.toLocaleString()}</p>
                    <span class="vehicle-mini-tag">${isVeh?'🚗 → Garage':'📦 → Hangar'}</span>
                </div>
                <button class="remove-btn" onclick="removeFromCart(${i})"><i data-lucide="x"></i></button>
            </div>`;
        }).join('');
    }
    const canAff = S.balance >= sub;
    document.getElementById('cart-subtotal').innerText=`$${sub.toLocaleString()}`;
    document.getElementById('cart-tax').innerText='$0.00';
    document.getElementById('cart-total').innerText=`$${sub.toLocaleString()}`;
    const btn=document.getElementById('checkout-btn');
    const warn=document.getElementById('cart-balance-warn');
    if(btn) btn.disabled=!S.cart.length||!canAff;
    if(warn) warn.style.display=(!canAff&&S.cart.length)?'flex':'none';
    lucide.createIcons();
}
function updateCartBadge() {
    const b=document.getElementById('cart-badge'); if(b) b.innerText=S.cart.length;
}

// ─────────────────────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────────────────────
async function checkout() {
    if(!S.cart.length) return;
    const sub=S.cart.reduce((s,i)=>s+i.price*i.qty,0);
    if(S.balance<sub){showToast('Saldo insuficiente','error');return;}
    const btn=document.getElementById('checkout-btn');
    if(btn){btn.disabled=true;btn.innerHTML=`<i data-lucide="loader-circle" class="spin"></i> Procesando...`;lucide.createIcons();}
    const snap=[...S.cart]; let ok=0, paid=0;
    for(const item of snap) {
        const res=await nuiFetch('marketplace:buyItem',{
            listingId:item.id, item:item.item, label:item.label,
            price:item.price, qty:item.qty, totalPrice:item.price*item.qty,
            seller:item.seller, isVehicle:item.isVehicle||item.category==='vehicles',
            isSeed:item.isSeed||false, category:item.category,
        });
        if(!res||res.success===false){showToast(`Error: ${item.label} — ${res?.reason||'Sin respuesta'}`,'error');continue;}
        const isVeh=item.isVehicle||item.category==='vehicles';
        S.orders.unshift({
            id: res.orderId?`#ORD-${res.orderId}`:`#ORD-${Math.floor(Math.random()*9000+1000)}`,
            orderId:res.orderId, item:item.qty>1?`${item.label} ×${item.qty}`:item.label,
            date:'Ahora', amount:item.price*item.qty, status:'pending', isVehicle:isVeh,
        });
        if(!item.isSeed) {
            const rem=item.qty-item.qty;
            if(rem<=0) S.market=S.market.filter(m=>String(m.id)!==String(item.id));
            else {const m=S.market.find(m=>String(m.id)===String(item.id));if(m)m.qty=rem;}
        }
        paid+=item.price*item.qty; ok++;
    }
    if(ok>0) {
        deductBalance(paid);
        S.profile.totalSpent=(S.profile.totalSpent||0)+paid;
        S.profile.totalPurchases=(S.profile.totalPurchases||0)+ok;
        S.cart=[]; updateCartUI(); renderAllGrids(); renderOrders(); renderProfile(); toggleCart();
        const hasVeh=snap.slice(0,ok).some(i=>i.isVehicle||i.category==='vehicles');
        const hasItm=snap.slice(0,ok).some(i=>!i.isVehicle&&i.category!=='vehicles');
        let msg=`${ok} compra${ok>1?'s':''} OK!`;
        if(hasVeh) msg+=' 🚗 Retirá el/los vehículo(s) en el hangar.';
        if(hasItm) msg+=' 📦 Retirá items en el hangar.';
        showToast(msg,'success');
    }
    if(btn){btn.disabled=S.cart.length===0;btn.innerHTML=`<i data-lucide="credit-card"></i> Pagar`;lucide.createIcons();}
}

// ─────────────────────────────────────────────────────────────
// SELL
// ─────────────────────────────────────────────────────────────
function populateSelect() {
    const sel=document.getElementById('inventory-select'); if(!sel)return;
    if(!S.inventory?.length){sel.innerHTML=`<option value="" disabled selected>Sin items</option>`;return;}
    sel.innerHTML=`<option value="" disabled selected>Seleccioná un item...</option>`+
        S.inventory.map(i=>{
            const cat=i.isVehicle?'vehicles':inferCategory(i.name);
            const isVeh=i.isVehicle||cat==='vehicles';
            return `<option value="${i.name}" data-label="${i.label||i.name}" data-count="${i.count}" data-isvehicle="${isVeh}" data-category="${cat}">
                ${i.label||i.name} (×${i.count})${isVeh?' 🚗':''}
            </option>`;
        }).join('');
    sel.onchange=updateSellHint; updateSellHint();
}

function updateSellHint() {
    const sel=document.getElementById('inventory-select');
    const hint=document.getElementById('sell-type-hint');
    const catEl=document.getElementById('sell-category-display');
    if(!sel||!sel.value)return;
    const opt=sel.options[sel.selectedIndex];
    const isVeh=opt.dataset.isvehicle==='true';
    const cat=opt.dataset.category||'consumables';
    if(hint){
        hint.innerHTML=isVeh
            ?`<i data-lucide="car" style="width:13px"></i> Vehículo — Se expondrá en el lote del hangar.`
            :`<i data-lucide="warehouse" style="width:13px"></i> Item — Llevalo al hangar para activar.`;
        hint.className=`sell-type-hint ${isVeh?'vehicle':'item'}`;
    }
    if(catEl) catEl.innerText=CAT_LABELS[cat]||cat;
    const maxQ=document.getElementById('sell-qty');
    const minQ=document.getElementById('sell-min-qty');
    if(maxQ) maxQ.max=opt.dataset.count||99;
    if(minQ) minQ.max=opt.dataset.count||99;
    lucide.createIcons();
}

async function submitListing(data) {
    const res=await nuiFetch('marketplace:postAd',data);
    if(!res||res.success===false){showToast(`Error: ${res?.reason||'Sin respuesta'}`,'error');return false;}
    const cat=data.isVehicle?'vehicles':inferCategory(data.item);
    S.myListings.unshift({
        id:res.id||`local_${Date.now()}`, dbId:res.id,
        item:data.item, label:data.label, price:data.price,
        qty:data.amount, min_qty:data.minQty, seller:S.user.name,
        category:cat, status:'pending', isVehicle:data.isVehicle||false, date:'Ahora'
    });
    renderMyListings();
    const inv=S.inventory.find(i=>i.name===data.item);
    if(inv){inv.count-=data.amount;if(inv.count<=0)S.inventory=S.inventory.filter(i=>i.name!==data.item);}
    populateSelect(); return true;
}

// ─────────────────────────────────────────────────────────────
// REMOVE LISTING con confirmación
// ─────────────────────────────────────────────────────────────
function removeMyListingClick(e, id) {
    if(e) e.stopPropagation();
    const item = S.myListings.find(i=>String(i.id)===String(id))
              || S.market.find(i=>String(i.id)===String(id));
    if(!item) return;
    const isVeh   = item.isVehicle || item.category==='vehicles';
    const isPend  = item.status==='pending';
    let msg = '';
    if(isPend && !isVeh)      msg=`¿Cancelar "${item.label}"?\nEl item te será devuelto al inventario.`;
    else if(isPend && isVeh)  msg=`¿Cancelar la publicación del vehículo "${item.label}"?`;
    else if(!isVeh)           msg=`¿Cancelar "${item.label}"?\nEl item quedará en el hangar para retirarlo (aparecerá en tus Órdenes).`;
    else                      msg=`¿Cancelar el vehículo "${item.label}"?\nSe quitará del lote de exposición.`;
    openConfirmModal(msg, () => _doRemoveListing(id, item, isPend, isVeh));
}

async function _doRemoveListing(id, item, isPend, isVeh) {
    const serverId = item.dbId || item.id;
    const res = await nuiFetch('marketplace:removeAd',{listingId:serverId});
    if(res&&res.success===false){showToast('No se pudo eliminar: '+(res.reason||''),'error');return;}
    S.myListings=S.myListings.filter(i=>String(i.id)!==String(id));
    S.market    =S.market.filter(i=>String(i.id)!==String(id));
    S.cart      =S.cart.filter(c=>String(c.id)!==String(id));
    if(isPend&&!isVeh){
        const inv=S.inventory.find(i=>i.name===item.item);
        if(inv){inv.count+=item.qty||1;}
        else{S.inventory.push({name:item.item,label:item.label,count:item.qty||1});}
        populateSelect();
    }
    updateCartUI(); renderMyListings(); renderAllGrids();
    const msg=(!isPend&&!isVeh)
        ?`"${item.label}" cancelado. Retiralo en el hangar (ver Órdenes).`
        :`"${item.label}" eliminado.`;
    showToast(msg,'info');
}
async function removeMyListing(e,id){removeMyListingClick(e,id);}
async function cancelMyListing(e,id){removeMyListingClick(e,id);}

// ─────────────────────────────────────────────────────────────
// MODAL DE CONFIRMACIÓN
// ─────────────────────────────────────────────────────────────
function openConfirmModal(message, onConfirm) {
    document.getElementById('modal-content').innerHTML=`
    <div class="modal-left" style="justify-content:center;align-items:center;background:var(--bg-surface)">
        <i data-lucide="alert-triangle" style="width:64px;height:64px;color:var(--warning)"></i>
    </div>
    <div class="modal-right" style="background:var(--bg-white)">
        <div class="modal-right-inner" style="justify-content:center;gap:24px">
            <h2 style="font-size:1.1rem;font-weight:800;line-height:1.5">${message.replace(/\n/g,'<br>')}</h2>
            <div style="display:flex;gap:12px;margin-top:auto">
                <button class="btn-primary" style="flex:1" onclick="closeModal('product-modal')">
                    <i data-lucide="x"></i> Cancelar
                </button>
                <button class="btn-danger" style="flex:1" id="confirm-yes-btn">
                    <i data-lucide="check"></i> Confirmar
                </button>
            </div>
        </div>
    </div>`;
    document.getElementById('product-modal').classList.add('open');
    lucide.createIcons();
    document.getElementById('confirm-yes-btn').onclick=()=>{closeModal('product-modal');onConfirm();};
}

// ─────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────
function openModal(id) {
    if(id==='sell-modal'){
        populateSelect(); updateSellHint();
        nuiFetch('marketplace:getOwnedVehicles').then(res=>{
            if(res&&res.vehicles&&res.vehicles.length){
                res.vehicles.forEach(veh=>{
                    if(!S.inventory.find(i=>i.name===veh.name)) S.inventory.push(veh);
                });
                populateSelect(); updateSellHint();
            }
        });
    }
    document.getElementById(id).classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function closeAllModals(){
    document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open'));
    document.getElementById('cart-panel').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────
// EVENTS SETUP
// ─────────────────────────────────────────────────────────────
function setupEvents() {
    document.getElementById('global-search').addEventListener('input',e=>{
        S.search=e.target.value;
        if(document.getElementById('view-home').classList.contains('active')&&e.target.value.length>0)
            switchTab('explore');
        else renderExplore();
    });
    document.querySelectorAll('.pill').forEach(pill=>{
        pill.addEventListener('click',e=>{
            document.querySelector('.pill.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            S.filter=e.currentTarget.dataset.cat; renderExplore();
        });
    });
    document.getElementById('min-price').addEventListener('input',e=>{S.priceMin=e.target.value;renderExplore();});
    document.getElementById('max-price').addEventListener('input',e=>{S.priceMax=e.target.value;renderExplore();});

    const sellPrice=document.getElementById('sell-price');
    const sellQty=document.getElementById('sell-qty');
    const sellMinQty=document.getElementById('sell-min-qty');
    const calcFee=()=>{
        const p=parseFloat(sellPrice.value)||0,q=parseInt(sellQty.value)||1,fee=p*q*0.05;
        document.getElementById('calc-price').innerText=`$${(p*q).toLocaleString()}`;
        document.getElementById('calc-fee').innerText=`-$${fee.toFixed(2)}`;
        document.getElementById('calc-earn').innerText=`$${((p*q)-fee).toFixed(2)}`;
    };
    sellPrice.addEventListener('input',calcFee);
    sellQty.addEventListener('input',()=>{
        const q=parseInt(sellQty.value)||1;
        if(sellMinQty&&parseInt(sellMinQty.value)>q)sellMinQty.value=q;
        if(sellMinQty)sellMinQty.max=q;
        calcFee();
    });
    if(sellMinQty)sellMinQty.addEventListener('input',calcFee);

    document.getElementById('sell-form').addEventListener('submit',async e=>{
        e.preventDefault();
        const sel=document.getElementById('inventory-select');
        if(!sel.value){showToast('Seleccioná un item','error');return;}
        const qty=parseInt(sellQty.value)||1;
        const minQty=parseInt(sellMinQty?.value||1)||1;
        const price=parseFloat(sellPrice.value);
        if(!price||price<=0){showToast('Precio inválido','error');return;}
        if(minQty>qty){showToast('El mínimo no puede ser mayor que la cantidad','error');return;}
        const inv=S.inventory.find(i=>i.name===sel.value);
        if(inv&&qty>inv.count){showToast(`Solo tenés ×${inv.count}`,'error');return;}
        const btn=e.target.querySelector('[type="submit"]');
        btn.disabled=true;btn.innerHTML=`<i data-lucide="loader-circle" class="spin"></i> Publicando...`;lucide.createIcons();
        const selOpt=sel.options[sel.selectedIndex];
        const isVehicle=selOpt.dataset.isvehicle==='true';
        const ok=await submitListing({
            item:sel.value, label:selOpt.dataset.label||selOpt.text.trim().split(' (')[0],
            amount:qty, minQty, price, desc:document.getElementById('sell-desc')?.value||'', isVehicle,
        });
        btn.disabled=false; btn.innerHTML='Publicar';
        if(ok){closeModal('sell-modal');e.target.reset();calcFee();switchTab('mylistings');
            showToast(isVehicle?'Publicado! Llevá el vehículo al hangar.':'Publicado! Llevá el item al hangar.','success');}
    });

    document.querySelectorAll('.modal-overlay').forEach(ov=>{
        ov.addEventListener('click',e=>{if(e.target===ov)closeModal(ov.id);});
    });
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
const TOAST_CFG={
    success:{icon:'check-circle',color:'var(--success)'},
    error:{icon:'x-circle',color:'var(--danger)'},
    info:{icon:'info',color:'var(--accent)'},
    warning:{icon:'alert-triangle',color:'var(--warning)'}
};
function showToast(msg,type='success') {
    const cfg=TOAST_CFG[type]||TOAST_CFG.success;
    const el=document.createElement('div'); el.className=`toast toast-${type}`;
    el.innerHTML=`<i data-lucide="${cfg.icon}" style="color:${cfg.color};width:16px;flex-shrink:0"></i><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el); lucide.createIcons();
    setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),350);},3500);
}

// ─────────────────────────────────────────────────────────────
// MISC
// ─────────────────────────────────────────────────────────────
function updateScale(){
    const c=document.querySelector('.app-container');if(!c)return;
    const s=Math.min((window.innerWidth*.96)/1280,(window.innerHeight*.96)/720);
    c.style.transform=`scale(${Math.min(s,1)})`;
}
window.addEventListener('resize',updateScale);
function sendMessage(e){
    if(e.key!=='Enter')return;
    const inp=document.getElementById('chat-input'),text=inp?.value.trim();if(!text)return;
    const h=document.getElementById('chat-history'),b=document.createElement('div');
    b.className='chat-bubble sent';b.textContent=text;
    h.appendChild(b);h.scrollTop=h.scrollHeight;inp.value='';
}
function saveSettings(){
    nuiFetch('marketplace:updateProfile',{
        displayName:document.getElementById('settings-display-name')?.value,
        bio:document.getElementById('settings-bio')?.value
    });
    showToast('Guardado!','success');
}