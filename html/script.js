// --- STATE MANAGEMENT ---
const State = {
    // Implicitly injected exact user details
    user: { name: 'Fruti Dev', dni: '46958193' }, 
    inventory: [
        { name: 'weapon_pistol', label: 'Combat Pistol', count: 2 },
        { name: 'bread', label: 'Fresh Bread', count: 15 },
        { name: 'repairkit', label: 'Repair Kit', count: 4 }
    ],
    marketData: [],
    cart: [],
    favourites: new Set(),
    orders: [
        { id: '#ORD-9921', item: 'Garrett Turbocharger', date: 'Just now', amount: 12000, status: 'completed' },
        { id: '#ORD-9922', item: 'Combat Pistol', date: 'Yesterday', amount: 4500, status: 'pending' }
    ],
    filter: 'all',
    search: '',
    sort: 'recent',
    priceMin: '',
    priceMax: '',
    theme: 'light'
};

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    generateMockData(); 
    setupEvents();
    renderOrders();
    renderMessages();
    renderSkeletons('home-grid', 4);
    setTimeout(renderHome, 800);
});

// NUI Listener
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.action === "open") {
        document.getElementById('app').style.display = 'flex';
        switchTab('home');
        fetchData();
    } else if (data.action === "close") {
        closeUI();
    } else if (data.action === "update") {
        State.marketData = data.ads;
        if(data.inventory) State.inventory = data.inventory;
        renderAllGrids();
    }
});

function closeUI() {
    // 1. Enviamos el evento 'close' a Lua (asegúrate que en client.lua sea RegisterNUICallback('close', ...))
    fetch(`https://${GetParentResourceName()}/close`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({}) 
    }).catch(() => {});

    // 2. Ocultamos el div principal
    document.getElementById('app').style.display = 'none';
    
    // 3. Limpiamos cualquier modal abierto
    closeAllModals();
}

// --- THEME TOGGLE ---
function toggleTheme() {
    State.theme = State.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', State.theme);
    const icon = document.getElementById('theme-icon');
    icon.setAttribute('data-lucide', State.theme === 'light' ? 'moon' : 'sun');
    lucide.createIcons();
}

// --- DATA LOGIC ---
function generateMockData() {
    const templates = [
        { name: 'weapon_assaultrifle', label: 'Assault Rifle MK2', price: 45000, cat: 'weapons', cond: 'Factory New' },
        { name: 'turbo', label: 'Turbocharger', price: 12000, cat: 'tools', cond: 'Used' },
        { name: 'medikit', label: 'First Aid Kit', price: 500, cat: 'consumables', cond: 'New' },
        { name: 'adder', label: 'Truffade Adder Keys', price: 120000, cat: 'vehicles', cond: 'Pristine' },
        { name: 'armor', label: 'Heavy Armor', price: 2500, cat: 'weapons', cond: 'Damaged' }
    ];
    
    for(let i=1; i<=20; i++) {
        let t = templates[Math.floor(Math.random() * templates.length)];
        State.marketData.push({
            id: i, item: t.name, label: t.label, price: Math.floor(t.price * (0.8 + Math.random()*0.4)), 
            qty: Math.floor(Math.random() * 5) + 1, seller: Math.random() > 0.8 ? State.user.name : 'Vendor_' + i, 
            category: t.cat, condition: t.cond
        });
    }
    populateSelect();
}

// --- ROUTING / VIEW SWITCHING ---
const ViewTitles = {
    home: 'Home', explore: 'Explore Market', favourites: 'Your Favourites', orders: 'Order History', messages: 'Messages', settings: 'Account Settings'
};

function switchTab(tabId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav li').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`view-${tabId}`).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    document.getElementById('page-title').innerText = ViewTitles[tabId];
    const filters = document.getElementById('explore-filters');
    
    if(tabId === 'explore') {
        filters.classList.remove('hidden');
        renderSkeletons('explore-grid', 8);
        setTimeout(renderExplore, 500);
    } else {
        filters.classList.add('hidden');
    }

    if(tabId === 'favourites') renderFavourites();
    if(tabId === 'home') renderHome();
}

// --- DROPDOWNS ---
function toggleDropdown(id) {
    const menu = document.querySelector(`.dropdown[data-dropdown="${id}"] .dropdown-menu`);
    document.querySelectorAll('.dropdown-menu').forEach(m => { if(m !== menu) m.classList.remove('show') });
    menu.classList.toggle('show');
}

function selectDropdown(id, text) {
    document.getElementById('loc-text').innerText = text;
    toggleDropdown(id);
}

function selectSort(sortType, text) {
    State.sort = sortType;
    document.getElementById('sort-text').innerText = text;
    toggleDropdown('sort');
    renderAllGrids();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    }
});


// --- RENDERING ---
function renderAllGrids() {
    if(document.getElementById('view-home').classList.contains('active')) renderHome();
    if(document.getElementById('view-explore').classList.contains('active')) renderExplore();
    if(document.getElementById('view-favourites').classList.contains('active')) renderFavourites();
}

function getSortedFilteredData() {
    let filtered = State.marketData.filter(item => {
        const matchCat = State.filter === 'all' || item.category === State.filter;
        const matchSearch = item.label.toLowerCase().includes(State.search.toLowerCase());
        const matchMin = State.priceMin === '' || item.price >= parseInt(State.priceMin);
        const matchMax = State.priceMax === '' || item.price <= parseInt(State.priceMax);
        return matchCat && matchSearch && matchMin && matchMax;
    });

    filtered.sort((a, b) => {
        if(State.sort === 'price_asc') return a.price - b.price;
        if(State.sort === 'price_desc') return b.price - a.price;
        return b.id - a.id; 
    });
    return filtered;
}

function renderSkeletons(containerId, count) {
    const container = document.getElementById(containerId);
    let html = '';
    for(let i=0; i<count; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton-img"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function createCardHTML(item) {
    const isMine = item.seller === State.user.name;
    const isFav = State.favourites.has(item.id);
    const condClass = item.condition === 'Damaged' ? 'damaged' : '';
    const imgUrl = `https://via.placeholder.com/200/f1f5f9/0f172a?text=${item.label.split(' ')[0]}`;

    return `
        <div class="product-card" onclick="openProductModal(${item.id})">
            <button class="btn-fav ${isFav ? 'active' : ''}" onclick="toggleFavourite(event, ${item.id})">
                <i data-lucide="heart"></i>
            </button>
            <div class="card-img">
                <div class="card-qty">x${item.qty}</div>
                <div class="cond-badge ${condClass}">${item.condition || 'New'}</div>
                <img src="${imgUrl}" alt="${item.label}">
            </div>
            <div class="card-info">
                <h3>${item.label}</h3>
                <p><i data-lucide="shield-check" style="width:14px; color:var(--success)"></i> ${isMine ? 'You' : item.seller}</p>
            </div>
            <div class="card-footer">
                <div class="price">$${item.price.toLocaleString()}</div>
                ${!isMine ? `<button class="btn-cart-sm" onclick="addToCart(event, ${item.id})"><i data-lucide="shopping-bag"></i></button>` : ''}
            </div>
        </div>
    `;
}

function renderHome() {
    const grid = document.getElementById('home-grid');
    grid.innerHTML = State.marketData.slice(0, 4).map(createCardHTML).join('');
    lucide.createIcons();
}

function renderExplore() {
    const grid = document.getElementById('explore-grid');
    const data = getSortedFilteredData();
    if(data.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-muted);">No items match your filters.</div>`;
    } else {
        grid.innerHTML = data.map(createCardHTML).join('');
    }
    lucide.createIcons();
}

function renderFavourites() {
    const grid = document.getElementById('fav-grid');
    const empty = document.getElementById('fav-empty');
    const favItems = State.marketData.filter(i => State.favourites.has(i.id));
    
    if(favItems.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
    } else {
        grid.style.display = 'grid';
        empty.style.display = 'none';
        grid.innerHTML = favItems.map(createCardHTML).join('');
    }
    lucide.createIcons();
}

function toggleFavourite(e, id) {
    e.stopPropagation();
    if(State.favourites.has(id)) {
        State.favourites.delete(id);
        showToast("Removed from favourites");
    } else {
        State.favourites.add(id);
        showToast("Added to favourites");
    }
    document.getElementById('fav-count').innerText = State.favourites.size;
    renderAllGrids();
}

function renderOrders() {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = State.orders.map(o => `
        <tr>
            <td style="font-weight:700;">${o.id}</td>
            <td style="font-weight:600;">${o.item}</td>
            <td style="color:var(--text-muted); font-weight:500;">${o.date}</td>
            <td style="font-weight:800; color:var(--success);">$${o.amount.toLocaleString()}</td>
            <td><span class="status-pill ${o.status}">${o.status.toUpperCase()}</span></td>
            <td><button class="btn-primary-sm" style="background:var(--bg-surface); color:var(--text-main); border:1px solid var(--border);">View</button></td>
        </tr>
    `).join('');
}

function renderMessages() {
    const list = document.getElementById('message-list');
    const contacts = ['Ammunation Clerk', 'Benny', 'PDM Sales', 'Simeon'];
    list.innerHTML = contacts.map((c, i) => `
        <div class="msg-contact ${i===0?'active':''}">
            <img src="https://ui-avatars.com/api/?name=${c.replace(' ','+')}&background=cbd5e1&color=0f172a" class="avatar-sm">
            <div class="contact-info">
                <h5>${c}</h5>
                <p>${i===0 ? 'Would you take $40,000 for it?' : 'Thanks for the purchase.'}</p>
            </div>
        </div>
    `).join('');
}


// --- EVENTS ---
function setupEvents() {
    document.getElementById('global-search').addEventListener('input', (e) => { 
        State.search = e.target.value; 
        if(document.getElementById('view-home').classList.contains('active')) switchTab('explore');
        renderExplore(); 
    });
    
    document.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelector('.pill.active').classList.remove('active');
            e.target.classList.add('active');
            State.filter = e.target.dataset.cat;
            renderExplore();
        });
    });

    document.getElementById('min-price').addEventListener('input', (e) => { State.priceMin = e.target.value; renderExplore(); });
    document.getElementById('max-price').addEventListener('input', (e) => { State.priceMax = e.target.value; renderExplore(); });

    const sellPriceInput = document.getElementById('sell-price');
    const sellQtyInput = document.getElementById('sell-qty');
    
    function updateFeeCalc() {
        const p = parseFloat(sellPriceInput.value) || 0;
        const q = parseInt(sellQtyInput.value) || 1;
        const total = p * q;
        const fee = total * 0.05;
        document.getElementById('calc-price').innerText = `$${total.toLocaleString()}`;
        document.getElementById('calc-fee').innerText = `-$${fee.toLocaleString()}`;
        document.getElementById('calc-earn').innerText = `$${(total - fee).toLocaleString()}`;
    }
    sellPriceInput.addEventListener('input', updateFeeCalc);
    sellQtyInput.addEventListener('input', updateFeeCalc);

    document.getElementById('sell-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const sel = document.getElementById('inventory-select');
        const data = {
            item: sel.value,
            label: sel.options[sel.selectedIndex].text.split(' (')[0],
            amount: parseInt(sellQtyInput.value),
            price: parseFloat(sellPriceInput.value)
        };
        fetch(`https://${GetParentResourceName()}/marketplace:postAd`, { method: 'POST', body: JSON.stringify(data) }).catch(()=>{});
        
        State.marketData.unshift({ id: Date.now(), item: data.item, label: data.label, price: data.price, qty: data.amount, seller: State.user.name, category: document.getElementById('sell-category').value, condition: document.getElementById('sell-condition').value });
        
        closeModal('sell-modal');
        showToast(`Listed ${data.amount}x ${data.label} successfully.`);
        renderAllGrids();
        switchTab('explore');
    });
}

// --- MODALS ---
function openProductModal(id) {
    const item = State.marketData.find(i => i.id === id);
    if(!item) return;

    const modal = document.getElementById('product-modal');
    const content = document.getElementById('modal-content');
    const isMine = item.seller === State.user.name;

    content.innerHTML = `
        <div class="modal-left">
            <img class="main-preview" src="https://via.placeholder.com/400/f1f5f9/0f172a?text=${item.label.split(' ')[0]}" alt="Item">
        </div>
        <div class="modal-right">
            <h2 style="font-size:2.2rem; font-weight:800; margin-bottom:16px;">${item.label}</h2>
            
            <div style="display:flex; align-items:center; gap:16px; margin-bottom: 24px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface);">
                <img src="https://ui-avatars.com/api/?name=${item.seller.replace(' ','+')}&background=0f172a&color=fff" class="avatar-sm">
                <div>
                    <div style="font-weight:700; font-size: 1.05rem;">${isMine ? 'You' : item.seller}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Verified Merchant</div>
                </div>
            </div>

            <table class="spec-table">
                <tr><td>Category</td><td style="text-transform:capitalize;">${item.category}</td></tr>
                <tr><td>Condition</td><td><span class="cond-badge" style="position:static;">${item.condition || 'Standard'}</span></td></tr>
                <tr><td>Stock Available</td><td>${item.qty} Units</td></tr>
                <tr><td>Delivery Options</td><td>Pick up / Drone Delivery</td></tr>
            </table>

            <div class="modal-action-row">
                <div class="modal-price">$${item.price.toLocaleString()}</div>
                ${!isMine ? `<button class="btn-primary" onclick="addToCart(event, ${item.id}); closeModal('product-modal');">Add to Cart</button>` : `<button class="btn-primary" disabled style="background:var(--bg-surface); border:1px solid var(--border); color:var(--text-muted); box-shadow:none;">Your Listing</button>`}
            </div>
        </div>
    `;
    modal.classList.add('open');
}

function openModal(id) { 
    if(id === 'sell-modal') populateSelect(); 
    document.getElementById(id).classList.add('open'); 
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); document.getElementById('cart-panel').classList.remove('open'); }

// --- CART ---
function toggleCart() { document.getElementById('cart-panel').classList.toggle('open'); }

function addToCart(e, id) {
    if(e) e.stopPropagation();
    const item = State.marketData.find(i => i.id === id);
    if (!item || State.cart.find(i => i.id === id)) return;

    State.cart.push(item);
    updateCart();
    showToast(`${item.label} added to cart`);
}

function updateCart() {
    const container = document.getElementById('cart-items');
    document.getElementById('cart-badge').innerText = State.cart.length;
    
    let subtotal = 0;
    container.innerHTML = State.cart.map((item, index) => {
        subtotal += item.price;
        return `
            <div class="cart-item">
                <div class="cart-info">
                    <h4>${item.label}</h4>
                    <p>$${item.price.toLocaleString()}</p>
                </div>
                <button class="remove-btn" onclick="State.cart.splice(${index}, 1); updateCart();"><i data-lucide="trash-2"></i></button>
            </div>
        `;
    }).join('');
    
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    document.getElementById('cart-subtotal').innerText = `$${subtotal.toLocaleString()}`;
    document.getElementById('cart-tax').innerText = `$${tax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('cart-total').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    lucide.createIcons();
}

function checkout() {
    if(State.cart.length === 0) return;
    State.cart.forEach(item => { fetch(`https://${GetParentResourceName()}/marketplace:buyAd`, { method: 'POST', body: JSON.stringify(item.id) }).catch(()=>{}); });
    
    State.cart.forEach(item => {
        State.orders.unshift({ id: '#ORD-'+Math.floor(Math.random()*9000+1000), item: item.label, date: 'Just now', amount: item.price, status: 'completed' });
    });
    renderOrders();
    
    State.cart = [];
    updateCart();
    toggleCart();
    showToast(`Payment successful. Order confirmed.`);
}

// --- UTILS ---
function populateSelect() {
    document.getElementById('inventory-select').innerHTML = State.inventory.map(i => `<option value="${i.name}">${i.label} (${i.count})</option>`).join('');
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="check-circle" style="color:var(--success)"></i> ${msg}`;
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// Función para enviar datos a Lua
function fetchData(name, data) {
    return fetch(`https://${GetParentResourceName()}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(data || {})
    })
    .then(response => {
        // Verificamos si la respuesta tiene contenido antes de intentar leer el JSON
        if (response.ok && response.status !== 204) {
            return response.json();
        }
        return {};
    })
    .catch(err => console.error("Error en Fetch:", err));
}

// Ejemplo de cómo deberías llamar al cierre en tu JS
function closeMenu() {
    // Esto enviará el mensaje al callback "close" que definimos en Lua
    fetchData('close', {}); 
    // Aquí ocultas tu div principal (ejemplo: #tablet-container)
    document.getElementById('tablet-container').style.display = 'none';
}

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeUI();
    }
});