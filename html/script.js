/* ================================================================
   NEXUS MARKET — script.js  v3.0
   FiveM NUI — ESX · ox_lib · ox_target
   ================================================================

   FLUJO COMPLETO:
   1. Jugador abre la tablet (item o NPC)
   2. Lua envia 'open' con balance, inventario, listings, favourites, orders
   3. Jugador crea listing → estado PENDING → queda en su lista "My Listings"
   4. Jugador lleva el item/vehículo al NPC del hangar → NPC lo acepta
   5. Lua activa el listing (status: 'active') y notifica a todos
   6. Otros jugadores pueden comprar desde la tablet → se descontа saldo
   7. Comprador va al hangar a retirar → NPC lo entrega
   8. Vehículos spawneados freezeados en el lote de exposición
================================================================ */

// ─────────────────────────────────────────────────────────────
// 1. SEED LISTINGS — Siempre visibles, precio/qty constante
// ─────────────────────────────────────────────────────────────
const SEED_LISTINGS = [
    { id:'seed_1',  item:'weapon_assaultrifle', label:'Assault Rifle MK2',  price:43500,  qty:1,  seller:'ArmsDealer_LS',   category:'weapons',     condition:'Factory New', status:'active', isVehicle:false, isSeed:true },
    { id:'seed_2',  item:'weapon_pistol',       label:'Combat Pistol',      price:4200,   qty:3,  seller:'Ammunation_NPC',  category:'weapons',     condition:'Slight Wear', status:'active', isVehicle:false, isSeed:true },
    { id:'seed_3',  item:'weapon_smg',          label:'Micro SMG',          price:7800,   qty:2,  seller:'Vendor_9',        category:'weapons',     condition:'Used',        status:'active', isVehicle:false, isSeed:true },
    { id:'seed_4',  item:'turbo',               label:'Turbocharger Kit',   price:11500,  qty:2,  seller:'LSCustoms_NPC',   category:'tools',       condition:'New',         status:'active', isVehicle:false, isSeed:true },
    { id:'seed_5',  item:'repairkit',           label:'Vehicle Repair Kit', price:750,    qty:8,  seller:'Benny_Mechanic',  category:'tools',       condition:'New',         status:'active', isVehicle:false, isSeed:true },
    { id:'seed_6',  item:'medikit',             label:'First Aid Kit',      price:480,    qty:5,  seller:'Pharmacy_NPC',    category:'consumables', condition:'New',         status:'active', isVehicle:false, isSeed:true },
    { id:'seed_7',  item:'bandage',             label:'Bandage Roll x5',    price:95,     qty:12, seller:'Pharmacy_NPC',    category:'consumables', condition:'New',         status:'active', isVehicle:false, isSeed:true },
    { id:'seed_8',  item:'armor',               label:'Heavy Body Armor',   price:2200,   qty:1,  seller:'Vendor_17',       category:'weapons',     condition:'Damaged',     status:'active', isVehicle:false, isSeed:true },
    { id:'seed_9',  item:'lockpick',            label:'Advanced Lockpick',  price:1900,   qty:4,  seller:'Vendor_5',        category:'tools',       condition:'Slight Wear', status:'active', isVehicle:false, isSeed:true },
    { id:'seed_10', item:'water',               label:'Water Bottle',       price:75,     qty:20, seller:'Convenience_NPC', category:'consumables', condition:'New',         status:'active', isVehicle:false, isSeed:true },
    { id:'seed_11', item:'sandwich',            label:'Deli Sandwich',      price:110,    qty:10, seller:'Convenience_NPC', category:'consumables', condition:'New',         status:'active', isVehicle:false, isSeed:true },
    // Vehículos de exposición (freezeados en el lote del hangar)
    { id:'seed_12', item:'adder',    label:'Truffade Adder',   price:118000, qty:1, seller:'PDM_Sales',  category:'vehicles', condition:'Pristine',    status:'active', isVehicle:true, vehicleModel:'adder',    isSeed:true },
    { id:'seed_13', item:'zentorno', label:'Pegassi Zentorno', price:82000,  qty:1, seller:'PDM_Sales',  category:'vehicles', condition:'Factory New', status:'active', isVehicle:true, vehicleModel:'zentorno', isSeed:true },
    { id:'seed_14', item:'elegy2',   label:'Annis Elegy RH8',  price:33500,  qty:1, seller:'Simeon_NPC', category:'vehicles', condition:'Slight Wear', status:'active', isVehicle:true, vehicleModel:'elegy2',   isSeed:true },
];

// ─────────────────────────────────────────────────────────────
// 2. ITEM IMAGE MAP
// ─────────────────────────────────────────────────────────────
const ITEM_IMAGES = {
    weapon_pistol:       'https://cfx-nui-ox_inventory/web/images/weapon_pistol.png',
    weapon_combatpistol: 'https://cfx-nui-ox_inventory/web/images/weapon_combatpistol.png',
    weapon_assaultrifle: 'https://cfx-nui-ox_inventory/web/images/weapon_assaultrifle.png',
    weapon_smg:          'https://cfx-nui-ox_inventory/web/images/weapon_smg.png',
    weapon_shotgun:      'https://cfx-nui-ox_inventory/web/images/weapon_pumpshotgun.png',
    weapon_sniperrifle:  'https://cfx-nui-ox_inventory/web/images/weapon_sniperrifle.png',
    weapon_bat:          'https://cfx-nui-ox_inventory/web/images/weapon_bat.png',
    weapon_knife:        'https://cfx-nui-ox_inventory/web/images/weapon_knife.png',
    armor:               'https://cfx-nui-ox_inventory/web/images/armor.png',
    medikit:             'https://cfx-nui-ox_inventory/web/images/medikit.png',
    bandage:             'https://cfx-nui-ox_inventory/web/images/bandage.png',
    water:               'https://cfx-nui-ox_inventory/web/images/water.png',
    sandwich:            'https://cfx-nui-ox_inventory/web/images/sandwich.png',
    bread:               'https://cfx-nui-ox_inventory/web/images/bread.png',
    repairkit:           'https://cfx-nui-ox_inventory/web/images/repairkit.png',
    lockpick:            'https://cfx-nui-ox_inventory/web/images/lockpick.png',
    advancedlockpick:    'https://cfx-nui-ox_inventory/web/images/advancedlockpick.png',
    turbo:               'https://cfx-nui-ox_inventory/web/images/turbo.png',
    screwdriver:         'https://cfx-nui-ox_inventory/web/images/screwdriver.png',
    // Vehículos — imagen del modelo GTA
    adder:    'https://static.wikia.nocookie.net/gtawiki/images/thumb/6/67/Adder-GTAV-front.png/400px-Adder-GTAV-front.png',
    zentorno: 'https://static.wikia.nocookie.net/gtawiki/images/thumb/6/6c/Zentorno-GTAV-front.png/400px-Zentorno-GTAV-front.png',
    elegy2:   'https://static.wikia.nocookie.net/gtawiki/images/thumb/0/0f/ElegySportsClassic-GTAO-front.png/400px-ElegySportsClassic-GTAO-front.png',
    comet2:   'https://static.wikia.nocookie.net/gtawiki/images/thumb/3/35/Comet2-GTAV-front.png/400px-Comet2-GTAV-front.png',
    sultan:   'https://static.wikia.nocookie.net/gtawiki/images/thumb/2/2c/SultanRS-GTAO-front.png/400px-SultanRS-GTAO-front.png',
};

const CATEGORY_ICONS = {
    weapons:     'shield',
    vehicles:    'car',
    consumables: 'heart-pulse',
    tools:       'wrench',
    default:     'package'
};

const COND_COLORS = {
    'Factory New': '#22c55e',
    'Pristine':    '#22c55e',
    'New':         '#22c55e',
    'Slight Wear': '#3b82f6',
    'Used':        '#f59e0b',
    'Damaged':     '#ef4444'
};

// ─────────────────────────────────────────────────────────────
// 3. ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────
const State = {
    user:        { name: 'Unknown', citizenid: '', job: '' },
    balance:     0,
    inventory:   [],
    // marketData = seed listings + DB listings activos
    marketData:  [],
    // myListings = listings pendientes + activos del propio jugador
    myListings:  [],
    cart:        [],
    favourites:  new Set(),
    orders:      [],
    filter:      'all',
    search:      '',
    sort:        'recent',
    priceMin:    '',
    priceMax:    '',
    theme:       'dark',
    initialized: false,
};

// ─────────────────────────────────────────────────────────────
// 4. HELPERS DE IMAGEN
// ─────────────────────────────────────────────────────────────
function getItemImgHTML(item) {
    const icon     = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.default;
    const fallback = `this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex'`;
    const nuiSrc   = `nui://${_resourceName()}/html/img/${item.item}.png`;
    const src      = item.image || ITEM_IMAGES[item.item] || nuiSrc;
    return `<img src="${src}" onerror="${fallback}" alt="${item.label}">
            <span class="cat-icon" style="display:none"><i data-lucide="${icon}"></i></span>`;
}

function _resourceName() {
    try { return GetParentResourceName(); } catch(_) { return 'nexus_market'; }
}

// ─────────────────────────────────────────────────────────────
// 5. NUI BRIDGE
// ─────────────────────────────────────────────────────────────
function nuiFetch(endpoint, payload = {}) {
    if (typeof GetParentResourceName === 'undefined') {
        return Promise.resolve({ success: true, id: Date.now() });
    }
    return fetch(`https://${GetParentResourceName()}/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body:    JSON.stringify(payload)
    })
    .then(r => (r.ok && r.status !== 204) ? r.json() : {})
    .catch(err => { console.error(`[Nexus] "${endpoint}":`, err); return {}; });
}

// ─────────────────────────────────────────────────────────────
// 6. BALANCE
// ─────────────────────────────────────────────────────────────
function setBalance(amount) {
    State.balance = Number(amount) || 0;
    const el = document.getElementById('wallet-balance');
    if (el) el.innerText = `$${State.balance.toLocaleString()}`;
}
function deductBalance(amount) { setBalance(State.balance - amount); }

// ─────────────────────────────────────────────────────────────
// 7. FAVOURITES (persistentes via Lua/DB + localStorage backup)
// ─────────────────────────────────────────────────────────────
function saveFavourites() {
    nuiFetch('marketplace:saveFavourites', {
        citizenid:  State.user.citizenid,
        favourites: [...State.favourites]
    });
    try {
        localStorage.setItem(`nexus_favs_${State.user.citizenid}`,
            JSON.stringify([...State.favourites]));
    } catch(_) {}
}

function loadFavourites(serverFavs) {
    State.favourites = new Set(serverFavs || []);
    // Fallback: localStorage si el server no mandó nada
    if (State.favourites.size === 0 && State.user.citizenid) {
        try {
            const local = JSON.parse(
                localStorage.getItem(`nexus_favs_${State.user.citizenid}`) || '[]'
            );
            State.favourites = new Set(local.map(x => String(x)));
        } catch(_) {}
    }
    updateFavCount();
}

function updateFavCount() {
    const el = document.getElementById('fav-count');
    if (el) el.innerText = State.favourites.size;
}

// ─────────────────────────────────────────────────────────────
// 8. MERGE LISTINGS (seed + DB, sin duplicados)
// ─────────────────────────────────────────────────────────────
function mergeListings(dbListings) {
    const all = [...SEED_LISTINGS];
    (dbListings || []).forEach(l => {
        // Sólo agregamos si no es seed y está activo
        if (!l.isSeed && l.status === 'active') {
            all.push(l);
        }
    });
    State.marketData = all;
}

// ─────────────────────────────────────────────────────────────
// 9. INIT — DOMContentLoaded
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(State.theme);
    lucide.createIcons();
    setupEvents();
    updateScale();

    // Modo dev (abrir directamente en navegador)
    if (typeof GetParentResourceName === 'undefined') {
        _devMode();
    }
});

function _devMode() {
    mergeListings([]);
    State.user = { name: 'Fruti Dev', citizenid: 'QBZ-99321', job: 'unemployed' };
    State.inventory = [
        { name: 'weapon_pistol',  label: 'Combat Pistol',   count: 2 },
        { name: 'repairkit',      label: 'Repair Kit',      count: 4 },
        { name: 'bandage',        label: 'Bandage Roll',    count: 20 },
        { name: 'lockpick',       label: 'Lockpick',        count: 3 },
        { name: 'armor',          label: 'Heavy Armor',     count: 1 },
    ];
    State.orders = [
        { id: '#ORD-9921', item: 'Turbocharger Kit', date: '2 days ago', amount: 11500, status: 'completed' },
        { id: '#ORD-9922', item: 'Combat Pistol',    date: 'Yesterday',  amount: 4200,  status: 'pending'   },
    ];
    State.myListings = [
        { id: 'my_1', item: 'repairkit', label: 'Repair Kit x2', price: 1200, qty: 2, category: 'tools', condition: 'New', status: 'pending',  date: '5 min ago' },
        { id: 'my_2', item: 'bandage',   label: 'Bandage x5',    price: 400,  qty: 5, category: 'consumables', condition: 'New', status: 'active', date: '1 day ago' },
    ];
    setBalance(48750);
    loadFavourites(['seed_1', 'seed_4']);
    populateSelect();
    renderOrders();
    renderMessages();
    renderMyListings();
    updateUsernameDisplay();
    document.getElementById('app').style.display = 'flex';
    updateScale();
    switchTab('home');
}

// ─────────────────────────────────────────────────────────────
// 10. NUI MESSAGE LISTENER
// ─────────────────────────────────────────────────────────────
window.addEventListener('message', event => {
    const data = event.data;
    switch (data.action) {
        case 'open':            _openUI(data);                   break;
        case 'close':           closeUI();                       break;
        case 'updateListings':  mergeListings(data.listings); renderAllGrids(); break;
        case 'updateBalance':   setBalance(data.balance);        break;
        case 'updateInventory': State.inventory = data.inventory || []; populateSelect(); break;
        case 'listingActivated': _onListingActivated(data);      break;
        case 'listingPurchased': _onListingPurchased(data);      break;
        case 'purchaseResult':  _onPurchaseResult(data);         break;
    }
});

function _openUI(data) {
    if (data.playerData) {
        State.user = {
            name:      data.playerData.name      || 'Unknown',
            citizenid: data.playerData.citizenid || '',
            job:       data.playerData.job        || ''
        };
        updateUsernameDisplay();
    }
    setBalance(data.balance || 0);
    if (data.inventory)  { State.inventory = data.inventory; populateSelect(); }
    if (data.orders)     { State.orders = data.orders; renderOrders(); }
    if (data.myListings) { State.myListings = data.myListings; renderMyListings(); }
    loadFavourites(data.favourites || []);
    mergeListings(data.listings || []);

    document.getElementById('app').style.display = 'flex';
    updateScale();
    switchTab('home');
    renderMessages();
    State.initialized = true;
}

function updateUsernameDisplay() {
    ['sidebar-username','profile-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = State.user.name;
    });
    const cid = document.getElementById('settings-citizenid');
    if (cid) cid.value = State.user.citizenid;
    const nameInput = document.getElementById('settings-display-name');
    if (nameInput) nameInput.value = State.user.name;
}

// Cuando Lua activa un listing pendiente (el jugador entregó el item al hangar)
function _onListingActivated(data) {
    const idx = State.myListings.findIndex(l => String(l.id) === String(data.listingId));
    if (idx !== -1) {
        State.myListings[idx].status = 'active';
        renderMyListings();
    }
    // Agregar al mercado si no está ya
    if (!State.marketData.find(m => String(m.id) === String(data.listingId))) {
        State.marketData.push(data.listing);
    }
    renderAllGrids();
    showToast(`Tu listing "${data.listing.label}" está activo en el mercado`, 'success');
}

// Cuando alguien compra un item que vendías vos
function _onListingPurchased(data) {
    State.marketData = State.marketData.filter(m => String(m.id) !== String(data.listingId));
    State.myListings = State.myListings.filter(l => String(l.id) !== String(data.listingId));
    renderAllGrids();
    renderMyListings();
    showToast(`Tu item "${data.label}" fue vendido por $${data.price.toLocaleString()}!`, 'success');
}

function _onPurchaseResult(data) {
    if (data.success) {
        showToast(data.message || 'Compra exitosa!', 'success');
        if (data.balance !== undefined) setBalance(data.balance);
        if (data.listings) { mergeListings(data.listings); renderAllGrids(); }
    } else {
        showToast(data.reason || 'Error en la compra', 'error');
    }
}

// ─────────────────────────────────────────────────────────────
// 11. CLOSE UI
// ─────────────────────────────────────────────────────────────
function closeUI() {
    nuiFetch('close');
    document.getElementById('app').style.display = 'none';
    closeAllModals();
    State.cart = [];
    updateCartBadge();
}

window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modalOpen = document.querySelector('.modal-overlay.open');
    const cartOpen  = document.getElementById('cart-panel').classList.contains('open');
    if (modalOpen) { closeAllModals(); return; }
    if (cartOpen)  { toggleCart();     return; }
    closeUI();
});

// ─────────────────────────────────────────────────────────────
// 12. THEME
// ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
    State.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) { icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon'); lucide.createIcons(); }
    try { localStorage.setItem('nexus_theme', theme); } catch(_) {}
}
function toggleTheme() {
    applyTheme(State.theme === 'dark' ? 'light' : 'dark');
}

// ─────────────────────────────────────────────────────────────
// 13. ROUTING
// ─────────────────────────────────────────────────────────────
const ViewTitles = {
    home:       'Home',
    explore:    'Explore Market',
    favourites: 'Your Favourites',
    orders:     'Order History',
    mylistings: 'My Listings',
    messages:   'Messages',
    settings:   'Account Settings'
};

function switchTab(tabId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav li').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById('page-title').innerText = ViewTitles[tabId] || tabId;

    const filters = document.getElementById('explore-filters');
    if (tabId === 'explore') {
        filters.classList.remove('hidden');
        renderSkeletons('explore-grid', 8);
        setTimeout(renderExplore, 350);
    } else {
        filters.classList.add('hidden');
    }
    if (tabId === 'home')       { renderSkeletons('home-grid', 4); setTimeout(renderHome, 350); }
    if (tabId === 'favourites') renderFavourites();
    if (tabId === 'orders')     renderOrders();
    if (tabId === 'mylistings') renderMyListings();
}

// ─────────────────────────────────────────────────────────────
// 14. DROPDOWNS
// ─────────────────────────────────────────────────────────────
function toggleDropdown(id) {
    const menu = document.querySelector(`.dropdown[data-dropdown="${id}"] .dropdown-menu`);
    document.querySelectorAll('.dropdown-menu').forEach(m => { if (m !== menu) m.classList.remove('show'); });
    menu?.classList.toggle('show');
}
function selectDropdown(id, text) {
    document.getElementById('loc-text').innerText = text;
    toggleDropdown(id);
    renderExplore();
}
function selectSort(sortType, text) {
    State.sort = sortType;
    document.getElementById('sort-text').innerText = text;
    toggleDropdown('sort');
    renderAllGrids();
}
document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown'))
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
});

// ─────────────────────────────────────────────────────────────
// 15. DATA HELPERS
// ─────────────────────────────────────────────────────────────
function getSortedFilteredData() {
    // Sólo listings 'active' (no pending) y no los propios del jugador en la vista general
    let data = State.marketData.filter(item => {
        if (item.status !== 'active') return false;
        const matchCat    = State.filter === 'all' || item.category === State.filter;
        const matchSearch = item.label.toLowerCase().includes(State.search.toLowerCase());
        const matchMin    = State.priceMin === '' || item.price >= parseInt(State.priceMin);
        const matchMax    = State.priceMax === '' || item.price <= parseInt(State.priceMax);
        return matchCat && matchSearch && matchMin && matchMax;
    });
    data.sort((a, b) => {
        if (State.sort === 'price_asc')  return a.price - b.price;
        if (State.sort === 'price_desc') return b.price - a.price;
        return String(b.id).localeCompare(String(a.id));
    });
    return data;
}

// ─────────────────────────────────────────────────────────────
// 16. RENDER HELPERS
// ─────────────────────────────────────────────────────────────
function renderAllGrids() {
    if (document.getElementById('view-home').classList.contains('active'))       renderHome();
    if (document.getElementById('view-explore').classList.contains('active'))    renderExplore();
    if (document.getElementById('view-favourites').classList.contains('active')) renderFavourites();
}

function renderSkeletons(containerId, count) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = Array(count).fill(`
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>`).join('');
}

function emptyStateHTML(icon, title, msg, btnLabel, btnAction) {
    return `<div class="empty-state">
        <i data-lucide="${icon}"></i>
        <h3>${title}</h3>
        <p>${msg}</p>
        ${btnLabel ? `<button class="btn-primary mt-3" onclick="${btnAction}">${btnLabel}</button>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// 17. CARD HTML
// ─────────────────────────────────────────────────────────────
function createCardHTML(item) {
    const isMine    = item.seller === State.user.name;
    const isFav     = State.favourites.has(String(item.id));
    const inCart    = !!State.cart.find(c => c.id === item.id);
    const condColor = COND_COLORS[item.condition] || 'var(--text-faint)';
    const isVehicle = item.isVehicle || item.category === 'vehicles';

    return `
    <div class="product-card ${isVehicle ? 'vehicle-card' : ''}" onclick="openProductModal('${item.id}')">
        <button class="btn-fav ${isFav ? 'active' : ''}"
                onclick="toggleFavourite(event,'${item.id}')"
                title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
            <i data-lucide="heart"></i>
        </button>
        ${isVehicle ? `<span class="vehicle-tag"><i data-lucide="car" style="width:11px"></i> Vehículo</span>` : ''}
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
            <span class="cond-tag" style="color:${condColor}">
                <span class="cond-dot" style="background:${condColor}"></span>
                ${item.condition || 'Standard'}
            </span>
        </div>
        <div class="card-footer">
            <div class="price">$${item.price.toLocaleString()}</div>
            ${isMine
                ? `<button class="btn-cart-sm btn-danger-sm" onclick="removeMyListing(event,'${item.id}')" title="Eliminar publicación">
                       <i data-lucide="trash-2"></i>
                   </button>`
                : `<button class="btn-cart-sm ${inCart ? 'in-cart' : ''}"
                           onclick="addToCart(event,'${item.id}')"
                           title="${inCart ? 'En el carrito' : 'Agregar al carrito'}">
                       <i data-lucide="${inCart ? 'check' : 'shopping-bag'}"></i>
                   </button>`
            }
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// 18. RENDER PAGES
// ─────────────────────────────────────────────────────────────
function renderHome() {
    const grid = document.getElementById('home-grid');
    if (!grid) return;
    const items = State.marketData.filter(i => i.status === 'active').slice(0, 4);
    grid.innerHTML = items.length ? items.map(createCardHTML).join('') :
        emptyStateHTML('package', 'Sin publicaciones', 'Sé el primero en publicar algo.');
    lucide.createIcons();
}

function renderExplore() {
    const grid = document.getElementById('explore-grid');
    if (!grid) return;
    const data = getSortedFilteredData();
    grid.innerHTML = data.length
        ? data.map(createCardHTML).join('')
        : `<div style="grid-column:1/-1">${emptyStateHTML('search-x','Sin resultados','Probá ajustar los filtros.')}</div>`;
    lucide.createIcons();
}

function renderFavourites() {
    const grid  = document.getElementById('fav-grid');
    const empty = document.getElementById('fav-empty');
    if (!grid) return;
    const favItems = State.marketData.filter(i =>
        State.favourites.has(String(i.id)) && i.status === 'active'
    );
    if (favItems.length === 0) {
        grid.style.display = 'none';
        if (empty) empty.style.display = 'flex';
    } else {
        grid.style.display = 'grid';
        if (empty) empty.style.display = 'none';
        grid.innerHTML = favItems.map(createCardHTML).join('');
        lucide.createIcons();
    }
}

function renderOrders() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    if (!State.orders.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Sin órdenes aún.</td></tr>`;
        return;
    }
    tbody.innerHTML = State.orders.map(o => `
        <tr>
            <td class="order-id">${o.id}</td>
            <td style="font-weight:600">${o.item}</td>
            <td style="color:var(--text-muted)">${o.date}</td>
            <td style="font-weight:800;color:var(--success)">$${o.amount.toLocaleString()}</td>
            <td><span class="status-pill ${o.status}">${o.status === 'completed' ? 'COMPLETADO' : 'PENDIENTE'}</span></td>
            <td>
                ${o.status === 'pending'
                    ? `<button class="btn-primary-sm outline" onclick="goPickup('${o.id}')">
                           <i data-lucide="warehouse"></i> Retirar
                       </button>`
                    : `<span style="color:var(--text-faint);font-size:0.82rem">Entregado</span>`
                }
            </td>
        </tr>`).join('');
    lucide.createIcons();
}

// My Listings — estado pending / active de las propias publicaciones
function renderMyListings() {
    const container = document.getElementById('my-listings-container');
    if (!container) return;

    if (!State.myListings.length) {
        container.innerHTML = emptyStateHTML(
            'tag', 'Sin publicaciones',
            'Creá una publicación desde tu inventario. Tendrás que entregar el item en el hangar para que sea visible.',
            'Crear publicación', "openModal('sell-modal')"
        );
        lucide.createIcons();
        return;
    }

    container.innerHTML = State.myListings.map(l => {
        const isPending = l.status === 'pending';
        const condColor = COND_COLORS[l.condition] || 'var(--text-faint)';
        return `
        <div class="my-listing-card ${isPending ? 'pending' : 'active-listing'}">
            <div class="my-listing-img">
                ${getItemImgHTML({ item: l.item, category: l.category, label: l.label })}
            </div>
            <div class="my-listing-info">
                <h4>${l.label}</h4>
                <span class="cond-tag" style="color:${condColor}">
                    <span class="cond-dot" style="background:${condColor}"></span>${l.condition}
                </span>
                <p class="listing-date">${l.date || ''}</p>
            </div>
            <div class="my-listing-meta">
                <div class="price">$${l.price.toLocaleString()}</div>
                <span class="listing-status-badge ${isPending ? 'pending' : 'active'}">
                    <i data-lucide="${isPending ? 'clock' : 'check-circle'}" style="width:11px"></i>
                    ${isPending ? 'Pendiente — Llevá el item al hangar' : 'Activo en el mercado'}
                </span>
            </div>
            <div class="my-listing-actions">
                ${isPending
                    ? `<button class="btn-primary-sm" onclick="openHangarGuide()">
                           <i data-lucide="map-pin"></i> Ver ubicación hangar
                       </button>`
                    : ''
                }
                <button class="btn-danger-sm-full" onclick="cancelMyListing(event,'${l.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function renderMessages() {
    const list = document.getElementById('message-list');
    if (!list) return;
    const contacts = [
        { name: 'Ammunation Clerk', last: '¿El Rifle MK2 sigue disponible?', unread: true  },
        { name: 'Benny',            last: 'Gracias por la compra 🙏',         unread: true  },
        { name: 'PDM Sales',        last: 'Nuevo stock llegó.',               unread: false },
        { name: 'Simeon',           last: 'Tengo un comprador para vos.',     unread: false },
    ];
    list.innerHTML = contacts.map((c, i) => `
        <div class="msg-contact ${i === 0 ? 'active' : ''}" onclick="selectContact(this)">
            <div class="msg-avatar-wrap">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=1e3a5f&color=60a5fa&bold=true"
                     class="avatar-sm">
                ${c.unread ? '<span class="unread-dot"></span>' : ''}
            </div>
            <div class="contact-info"><h5>${c.name}</h5><p>${c.last}</p></div>
        </div>`).join('');
}

function selectContact(el) {
    document.querySelectorAll('.msg-contact').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
}

// ─────────────────────────────────────────────────────────────
// 19. FAVOURITES TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleFavourite(e, id) {
    e.stopPropagation();
    const sid = String(id);
    if (State.favourites.has(sid)) {
        State.favourites.delete(sid);
        showToast('Quitado de favoritos', 'info');
    } else {
        State.favourites.add(sid);
        showToast('Agregado a favoritos ♥', 'success');
    }
    updateFavCount();
    saveFavourites();
    renderAllGrids();
}

// ─────────────────────────────────────────────────────────────
// 20. PRODUCT MODAL
// ─────────────────────────────────────────────────────────────
function openProductModal(id) {
    const item = State.marketData.find(i => String(i.id) === String(id));
    if (!item) return;

    const isMine    = item.seller === State.user.name;
    const isFav     = State.favourites.has(String(item.id));
    const inCart    = !!State.cart.find(c => c.id === item.id);
    const canAfford = State.balance >= item.price;
    const condColor = COND_COLORS[item.condition] || 'var(--text-faint)';
    const isVehicle = item.isVehicle || item.category === 'vehicles';

    document.getElementById('modal-content').innerHTML = `
    <div class="modal-left">
        <div class="modal-img-wrap">
            ${getItemImgHTML(item)}
        </div>
        <div class="modal-img-meta">
            <span class="cond-tag lg" style="color:${condColor}">
                <span class="cond-dot" style="background:${condColor}"></span>
                ${item.condition}
            </span>
            <span class="stock-tag">×${item.qty} en stock</span>
        </div>
        ${isVehicle ? `
        <div class="hangar-notice">
            <i data-lucide="warehouse"></i>
            <span>Este vehículo está expuesto físicamente en el hangar. Al comprarlo podés retirarlo allí.</span>
        </div>` : ''}
    </div>
    <div class="modal-right">
        <div class="modal-right-inner">
            <div class="modal-title-row">
                <h2 class="modal-item-title">${item.label}</h2>
                <button class="btn-fav modal-fav ${isFav ? 'active' : ''}"
                        onclick="toggleFavourite(event,'${item.id}')">
                    <i data-lucide="heart"></i>
                </button>
            </div>
            <div class="seller-row">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(item.seller)}&background=1e3a5f&color=60a5fa&bold=true"
                     class="avatar-sm">
                <div>
                    <div class="seller-name">${isMine ? 'Vos (Tu publicación)' : item.seller}</div>
                    <div class="seller-badge"><i data-lucide="badge-check" style="width:12px"></i> Vendedor Verificado</div>
                </div>
            </div>
            <table class="spec-table">
                <tr><td>Categoría</td>  <td style="text-transform:capitalize">${item.category}</td></tr>
                <tr><td>Condición</td>  <td style="color:${condColor};font-weight:700">${item.condition}</td></tr>
                <tr><td>Stock</td>      <td>${item.qty} unidad${item.qty !== 1 ? 'es' : ''}</td></tr>
                <tr><td>Entrega</td>    <td>${isVehicle ? 'Retiro en hangar' : 'Retiro en hangar / Transfer directo'}</td></tr>
                <tr><td>Vendido por</td><td>${isMine ? '<em>Vos</em>' : item.seller}</td></tr>
            </table>
            <div class="modal-action-row">
                <div>
                    <div class="modal-price">$${item.price.toLocaleString()}</div>
                    <div class="balance-hint ${!canAfford && !isMine ? 'insufficient' : ''}">
                        Tu saldo: <strong>$${State.balance.toLocaleString()}</strong>
                        ${!canAfford && !isMine ? ' · <span style="color:var(--danger)">Saldo insuficiente</span>' : ''}
                    </div>
                </div>
                ${isMine
                    ? `<button class="btn-danger" onclick="removeMyListing(event,'${item.id}');closeModal('product-modal')">
                           <i data-lucide="trash-2"></i> Eliminar publicación
                       </button>`
                    : inCart
                        ? `<button class="btn-primary" onclick="closeModal('product-modal');toggleCart()">
                               <i data-lucide="shopping-bag"></i> Ver carrito
                           </button>`
                        : `<button class="btn-primary" ${!canAfford ? 'disabled title="Saldo insuficiente"' : ''}
                                   onclick="addToCart(event,'${item.id}');closeModal('product-modal')">
                               <i data-lucide="shopping-bag"></i> Agregar al carrito
                           </button>`
                }
            </div>
            ${isVehicle && !isMine ? `
            <div class="pickup-notice">
                <i data-lucide="info"></i>
                Al comprar este vehículo, quedará a tu nombre. Deberás retirarlo físicamente en el hangar.
            </div>` : ''}
        </div>
    </div>`;

    document.getElementById('product-modal').classList.add('open');
    lucide.createIcons();
}

// ─────────────────────────────────────────────────────────────
// 21. CART & CHECKOUT
// ─────────────────────────────────────────────────────────────
function toggleCart() {
    document.getElementById('cart-panel').classList.toggle('open');
}

function addToCart(e, id) {
    if (e) e.stopPropagation();
    const item = State.marketData.find(i => String(i.id) === String(id));
    if (!item) return;
    if (State.cart.find(c => c.id === item.id)) {
        showToast(`${item.label} ya está en el carrito`, 'info'); return;
    }
    if (State.balance < item.price) {
        showToast(`Saldo insuficiente para ${item.label}`, 'error'); return;
    }
    State.cart.push(item);
    updateCart();
    renderAllGrids();
    showToast(`${item.label} agregado al carrito`, 'success');
}

function removeFromCart(index) {
    State.cart.splice(index, 1);
    updateCart();
    renderAllGrids();
}

function updateCart() {
    const container = document.getElementById('cart-items');
    updateCartBadge();
    let subtotal = 0;

    if (!State.cart.length) {
        container.innerHTML = `<div class="cart-empty"><i data-lucide="shopping-bag"></i><p>Tu carrito está vacío</p></div>`;
    } else {
        container.innerHTML = State.cart.map((item, i) => {
            subtotal += item.price;
            return `
            <div class="cart-item">
                <div class="cart-img-mini">${getItemImgHTML(item)}</div>
                <div class="cart-info">
                    <h4>${item.label}</h4>
                    <p>$${item.price.toLocaleString()}</p>
                    ${item.isVehicle ? `<span class="vehicle-mini-tag">Retiro en hangar</span>` : ''}
                </div>
                <button class="remove-btn" onclick="removeFromCart(${i})"><i data-lucide="x"></i></button>
            </div>`;
        }).join('');
    }

    const tax   = subtotal * 0.08;
    const total = subtotal + tax;
    const canAffordAll = State.balance >= total;

    document.getElementById('cart-subtotal').innerText = `$${subtotal.toLocaleString()}`;
    document.getElementById('cart-tax').innerText      = `$${tax.toFixed(2)}`;
    document.getElementById('cart-total').innerText    = `$${total.toFixed(2)}`;

    const btn  = document.getElementById('checkout-btn');
    const warn = document.getElementById('cart-balance-warn');
    if (btn)  btn.disabled = !State.cart.length || !canAffordAll;
    if (warn) warn.style.display = (!canAffordAll && State.cart.length) ? 'flex' : 'none';

    lucide.createIcons();
}

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (badge) badge.innerText = State.cart.length;
}

async function checkout() {
    if (!State.cart.length) return;
    const total = State.cart.reduce((s, i) => s + i.price, 0) * 1.08;
    if (State.balance < total) { showToast('Saldo bancario insuficiente', 'error'); return; }

    const btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-circle" class="spin"></i> Procesando...`; lucide.createIcons(); }

    const snapshot = [...State.cart];
    const results  = await Promise.all(
        snapshot.map(item => nuiFetch('marketplace:buyItem', {
            listingId: item.id,
            item:      item.item,
            label:     item.label,
            price:     item.price,
            seller:    item.seller,
            qty:       1,
            isVehicle: item.isVehicle || false,
            isSeed:    item.isSeed    || false,
        }))
    );

    let ok = 0, paid = 0;
    results.forEach((res, i) => {
        const item = snapshot[i];
        if (res && res.success === false) {
            showToast(`Error: ${item.label} — ${res.reason || 'Server error'}`, 'error'); return;
        }
        State.orders.unshift({
            id:     '#ORD-' + Math.floor(Math.random()*9000+1000),
            item:   item.label,
            date:   'Ahora',
            amount: item.price,
            status: item.isVehicle ? 'pending' : 'pending' // siempre pending: debe retirar en hangar
        });
        // Eliminar del mercado (si no es seed no vuelve a aparecer)
        if (!item.isSeed) {
            State.marketData = State.marketData.filter(m => m.id !== item.id);
        }
        paid += item.price;
        ok++;
    });

    if (ok > 0) {
        deductBalance(paid);
        State.cart = [];
        updateCart();
        renderAllGrids();
        renderOrders();
        toggleCart();
        showToast(`${ok} ítem${ok>1?'s':''} comprado${ok>1?'s':''}! Retirá en el hangar.`, 'success');
    } else {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="credit-card"></i> Pagar`; lucide.createIcons(); }
    }
}

// ─────────────────────────────────────────────────────────────
// 22. SELL / LISTING CREATION (estado PENDING)
// ─────────────────────────────────────────────────────────────
function populateSelect() {
    const sel = document.getElementById('inventory-select');
    if (!sel) return;
    if (!State.inventory?.length) {
        sel.innerHTML = `<option value="" disabled selected>Sin items en tu inventario</option>`;
        return;
    }
    sel.innerHTML = State.inventory.map(i =>
        `<option value="${i.name}" data-label="${i.label}" data-count="${i.count}" data-isvehicle="${i.isVehicle||false}">
            ${i.label} (×${i.count})
        </option>`
    ).join('');

    // Actualizar hint de tipo
    sel.addEventListener('change', updateSellTypeHint);
    updateSellTypeHint();
}

function updateSellTypeHint() {
    const sel = document.getElementById('inventory-select');
    const hint = document.getElementById('sell-type-hint');
    if (!sel || !hint) return;
    const opt = sel.options[sel.selectedIndex];
    const isVeh = opt?.dataset.isvehicle === 'true';
    hint.innerHTML = isVeh
        ? `<i data-lucide="car" style="width:13px"></i> Vehículo — El auto será spawneado en el lote de exposición del hangar.`
        : `<i data-lucide="warehouse" style="width:13px"></i> Item — Deberás llevarlo al NPC del hangar para activar la publicación.`;
    hint.className = `sell-type-hint ${isVeh ? 'vehicle' : 'item'}`;
    lucide.createIcons();
}

async function submitListing(data) {
    const res = await nuiFetch('marketplace:postAd', data);
    if (res && res.success === false) {
        showToast(`Error al publicar: ${res.reason || 'Desconocido'}`, 'error');
        return false;
    }

    const newListing = {
        id:        res?.id    || `local_${Date.now()}`,
        item:      data.item,
        label:     data.label,
        price:     data.price,
        qty:       data.amount,
        seller:    State.user.name,
        category:  data.category,
        condition: data.condition,
        status:    'pending',   // ← empieza como pendiente
        isVehicle: data.isVehicle || false,
        image:     null,
        date:      'Ahora'
    };

    // Agregar a mis listings (pendiente)
    State.myListings.unshift(newListing);
    renderMyListings();

    // NO agregar a marketData todavía — aparecerá cuando sea activado desde el hangar
    // Quitar del inventario local
    const invItem = State.inventory.find(i => i.name === data.item);
    if (invItem) {
        invItem.count -= data.amount;
        if (invItem.count <= 0) State.inventory = State.inventory.filter(i => i.name !== data.item);
    }
    populateSelect();
    return true;
}

async function removeMyListing(e, id) {
    if (e) e.stopPropagation();
    const item = State.myListings.find(i => String(i.id) === String(id))
              || State.marketData.find(i => String(i.id) === String(id));
    if (!item) return;

    const res = await nuiFetch('marketplace:removeAd', { listingId: id });
    if (res && res.success === false) { showToast('No se pudo eliminar la publicación', 'error'); return; }

    State.myListings  = State.myListings.filter(i => String(i.id) !== String(id));
    State.marketData  = State.marketData.filter(i => String(i.id) !== String(id));
    renderMyListings();
    renderAllGrids();
    showToast(`Publicación "${item.label}" eliminada`, 'info');
}

async function cancelMyListing(e, id) {
    return removeMyListing(e, id);
}

// Botón "Ver ubicación hangar" en listings pendientes
function openHangarGuide() {
    closeAllModals();
    showToast('Waypoint marcado en el mapa — Dirigite al hangar', 'info');
    nuiFetch('marketplace:setHangarWaypoint');
}

// Botón de retiro en órdenes
function goPickup(orderId) {
    showToast('Waypoint marcado — Dirigite al hangar a retirar tu compra', 'info');
    nuiFetch('marketplace:setHangarWaypoint');
}

// ─────────────────────────────────────────────────────────────
// 23. MODALS
// ─────────────────────────────────────────────────────────────
function openModal(id) {
    if (id === 'sell-modal') { populateSelect(); updateSellTypeHint(); }
    document.getElementById(id).classList.add('open');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    document.getElementById('cart-panel').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────
// 24. EVENTS SETUP
// ─────────────────────────────────────────────────────────────
function setupEvents() {
    // Search
    document.getElementById('global-search').addEventListener('input', e => {
        State.search = e.target.value;
        if (document.getElementById('view-home').classList.contains('active') && e.target.value.length > 0)
            switchTab('explore');
        else renderExplore();
    });

    // Pills
    document.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', e => {
            document.querySelector('.pill.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            State.filter = e.currentTarget.dataset.cat;
            renderExplore();
        });
    });

    // Price range
    document.getElementById('min-price').addEventListener('input', e => { State.priceMin = e.target.value; renderExplore(); });
    document.getElementById('max-price').addEventListener('input', e => { State.priceMax = e.target.value; renderExplore(); });

    // Sell form fee calculator
    const sellPrice = document.getElementById('sell-price');
    const sellQty   = document.getElementById('sell-qty');
    function updateFeeCalc() {
        const p = parseFloat(sellPrice.value) || 0;
        const q = parseInt(sellQty.value)     || 1;
        const total = p * q, fee = total * 0.05;
        document.getElementById('calc-price').innerText = `$${total.toLocaleString()}`;
        document.getElementById('calc-fee').innerText   = `-$${fee.toLocaleString(undefined,{minimumFractionDigits:2})}`;
        document.getElementById('calc-earn').innerText  = `$${(total-fee).toLocaleString(undefined,{minimumFractionDigits:2})}`;
    }
    sellPrice.addEventListener('input', updateFeeCalc);
    sellQty.addEventListener('input',   updateFeeCalc);

    // Sell form submit
    document.getElementById('sell-form').addEventListener('submit', async e => {
        e.preventDefault();
        const sel    = document.getElementById('inventory-select');
        if (!sel.value) { showToast('Seleccioná un item de tu inventario', 'error'); return; }
        const qty    = parseInt(sellQty.value) || 1;
        const price  = parseFloat(sellPrice.value);
        if (!price || price <= 0) { showToast('Ingresá un precio válido', 'error'); return; }
        const invItem = State.inventory.find(i => i.name === sel.value);
        if (invItem && qty > invItem.count) {
            showToast(`Solo tenés ×${invItem.count} de ese item`, 'error'); return;
        }

        const btn = e.target.querySelector('[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-circle" class="spin"></i> Publicando...`;
        lucide.createIcons();

        const selOpt    = sel.options[sel.selectedIndex];
        const isVehicle = selOpt.dataset.isvehicle === 'true';

        const ok = await submitListing({
            item:      sel.value,
            label:     selOpt.dataset.label || selOpt.text.split(' (')[0],
            amount:    qty,
            price,
            category:  document.getElementById('sell-category').value,
            condition: document.getElementById('sell-condition').value,
            desc:      document.getElementById('sell-desc')?.value || '',
            isVehicle,
        });

        btn.disabled = false;
        btn.innerHTML = 'Publicar';

        if (ok) {
            closeModal('sell-modal');
            e.target.reset();
            updateFeeCalc();
            switchTab('mylistings');
            showToast(
                isVehicle
                    ? 'Publicación creada! Llevá el vehículo al hangar para exponerlo.'
                    : 'Publicación creada! Llevá el item al hangar para activarla.',
                'success'
            );
        }
    });

    // Overlay click-outside
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
    });
}

// ─────────────────────────────────────────────────────────────
// 25. TOAST
// ─────────────────────────────────────────────────────────────
const TOAST_CFG = {
    success: { icon: 'check-circle',  color: 'var(--success)' },
    error:   { icon: 'x-circle',      color: 'var(--danger)'  },
    info:    { icon: 'info',           color: 'var(--accent)'  },
    warning: { icon: 'alert-triangle', color: 'var(--warning)' }
};
function showToast(msg, type = 'success') {
    const cfg = TOAST_CFG[type] || TOAST_CFG.success;
    const el  = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i data-lucide="${cfg.icon}" style="color:${cfg.color};width:16px;flex-shrink:0"></i><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    lucide.createIcons();
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 350); }, 3500);
}

// ─────────────────────────────────────────────────────────────
// 26. SCALE + CHAT + SETTINGS
// ─────────────────────────────────────────────────────────────
function updateScale() {
    const c = document.querySelector('.app-container');
    if (!c) return;
    const scale = Math.min((window.innerWidth * 0.96) / 1280, (window.innerHeight * 0.96) / 720);
    c.style.transform = `scale(${Math.min(scale, 1)})`;
}
window.addEventListener('resize', updateScale);

function sendMessage(e) {
    if (e.key !== 'Enter') return;
    const input = document.getElementById('chat-input');
    const text  = input?.value.trim();
    if (!text) return;
    const history = document.getElementById('chat-history');
    const bubble  = document.createElement('div');
    bubble.className    = 'chat-bubble sent';
    bubble.textContent  = text;
    history.appendChild(bubble);
    history.scrollTop   = history.scrollHeight;
    input.value         = '';
}

function saveSettings() {
    const displayName = document.getElementById('settings-display-name')?.value || State.user.name;
    const bio         = document.getElementById('settings-bio')?.value || '';
    nuiFetch('marketplace:updateProfile', { displayName, bio });
    State.user.name = displayName;
    updateUsernameDisplay();
    showToast('Configuración guardada!', 'success');
}
