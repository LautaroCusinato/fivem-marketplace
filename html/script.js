// ============================================
// MARKETPLACE - FiveM NUI Script
// ============================================

// Items data - Will be populated from server via NUI message
let marketplaceItems = [
    { id: 1, name: "Bread", price: 50, stock: 150, image: "img/items/bread.png" },
    { id: 2, name: "Water Bottle", price: 30, stock: 200, image: "img/items/water.png" },
    { id: 3, name: "Medkit", price: 500, stock: 25, image: "img/items/medkit.png" },
    { id: 4, name: "Repair Kit", price: 800, stock: 10, image: "img/items/repairkit.png" },
    { id: 5, name: "Phone", price: 2500, stock: 50, image: "img/items/phone.png" },
    { id: 6, name: "Lockpick", price: 150, stock: 5, image: "img/items/lockpick.png" },
    { id: 7, name: "Radio", price: 350, stock: 30, image: "img/items/radio.png" },
    { id: 8, name: "Flashlight", price: 200, stock: 45, image: "img/items/flashlight.png" },
    { id: 9, name: "Bandage", price: 100, stock: 100, image: "img/items/bandage.png" },
    { id: 10, name: "Armor Vest", price: 5000, stock: 8, image: "img/items/armor.png" }
];

// Cart state
let cart = [];
let playerBalance = 50000;

// DOM Elements
const container = document.getElementById('marketplace-container');
const itemsListEl = document.getElementById('items-list');
const cartItemsEl = document.getElementById('cart-items');
const cartEmptyEl = document.getElementById('cart-empty');
const cartCountEl = document.getElementById('cart-count');
const totalAmountEl = document.getElementById('total-amount');
const playerBalanceEl = document.getElementById('player-balance');
const confirmBtn = document.getElementById('confirm-btn');

// ============================================
// FIVEM NUI MESSAGE HANDLER
// ============================================
window.addEventListener('message', function(event) {
    const data = event.data;
    
    switch(data.action) {
        case 'open':
            openMarketplace(data);
            break;
        case 'close':
            closeMarketplace();
            break;
        case 'updateItems':
            if (data.items) {
                marketplaceItems = data.items;
                renderItems();
            }
            break;
        case 'updateBalance':
            if (data.balance !== undefined) {
                playerBalance = data.balance;
                playerBalanceEl.textContent = formatPrice(playerBalance);
                updateConfirmButton();
            }
            break;
        case 'purchaseResult':
            handlePurchaseResult(data);
            break;
    }
});

// ============================================
// MARKETPLACE FUNCTIONS
// ============================================

function openMarketplace(data) {
    if (data.items) {
        marketplaceItems = data.items;
    }
    if (data.balance !== undefined) {
        playerBalance = data.balance;
        playerBalanceEl.textContent = formatPrice(playerBalance);
    }
    
    container.classList.add('active');
    renderItems();
    renderCart();
}

function closeMarketplace() {
    container.classList.remove('active');
}

function closeUI() {
    closeMarketplace();
    
    // Send close event to FiveM client
    fetch(`https://${GetParentResourceName()}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }).catch(() => {});
}

function GetParentResourceName() {
    return window.GetParentResourceName ? window.GetParentResourceName() : 'marketplace';
}

function handlePurchaseResult(data) {
    if (data.success) {
        showToast('Purchase successful!');
        cart = [];
        renderCart();
        if (data.newBalance !== undefined) {
            playerBalance = data.newBalance;
            playerBalanceEl.textContent = formatPrice(playerBalance);
        }
        if (data.updatedItems) {
            marketplaceItems = data.updatedItems;
            renderItems();
        }
    } else {
        showToast(data.message || 'Purchase failed!');
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderItems(filter = '') {
    const searchValue = document.getElementById('search-input').value.toLowerCase();
    const filterText = filter || searchValue;
    
    const filteredItems = marketplaceItems.filter(item => 
        item.name.toLowerCase().includes(filterText)
    );
    
    itemsListEl.innerHTML = filteredItems.map((item, index) => `
        <div class="item-row" style="animation-delay: ${index * 0.05}s">
            <div class="item-icon">
                <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<svg class=\\'placeholder-icon\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1\\'><path d=\\'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\\'></path></svg>';">
            </div>
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-stock">
                    <span class="stock-indicator ${getStockClass(item.stock)}"></span>
                    <span class="stock-text ${getStockClass(item.stock)}">${getStockText(item.stock)}</span>
                </div>
            </div>
            <div class="item-price-section">
                <div class="item-price">${formatPrice(item.price)}</div>
                <button class="add-to-cart-btn" onclick="addToCart(${item.id})" ${item.stock === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add to Cart
                </button>
            </div>
        </div>
    `).join('');
}

function renderCart() {
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountEl.textContent = itemCount;
    
    if (cart.length === 0) {
        cartEmptyEl.style.display = 'flex';
        cartItemsEl.innerHTML = '';
        cartItemsEl.appendChild(cartEmptyEl);
    } else {
        cartEmptyEl.style.display = 'none';
        cartItemsEl.innerHTML = cart.map(cartItem => {
            const item = marketplaceItems.find(i => i.id === cartItem.id);
            if (!item) return '';
            
            return `
                <div class="cart-item">
                    <div class="cart-item-icon">
                        <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none';">
                    </div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">${formatPrice(item.price * cartItem.quantity)}</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                        <span class="qty-value">${cartItem.quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                        <button class="remove-btn" onclick="removeFromCart(${item.id})">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateTotal();
    updateConfirmButton();
}

function filterItems() {
    const searchValue = document.getElementById('search-input').value.toLowerCase();
    renderItems(searchValue);
}

// ============================================
// CART FUNCTIONS
// ============================================

function addToCart(itemId) {
    const item = marketplaceItems.find(i => i.id === itemId);
    if (!item || item.stock === 0) return;
    
    const existingItem = cart.find(c => c.id === itemId);
    
    if (existingItem) {
        if (existingItem.quantity < item.stock) {
            existingItem.quantity++;
        } else {
            showToast('Not enough stock!');
            return;
        }
    } else {
        cart.push({ id: itemId, quantity: 1 });
    }
    
    renderCart();
    showToast(`${item.name} added to cart`);
}

function updateQuantity(itemId, change) {
    const cartItem = cart.find(c => c.id === itemId);
    const item = marketplaceItems.find(i => i.id === itemId);
    
    if (!cartItem || !item) return;
    
    const newQuantity = cartItem.quantity + change;
    
    if (newQuantity <= 0) {
        removeFromCart(itemId);
    } else if (newQuantity <= item.stock) {
        cartItem.quantity = newQuantity;
        renderCart();
    } else {
        showToast('Not enough stock!');
    }
}

function removeFromCart(itemId) {
    cart = cart.filter(c => c.id !== itemId);
    renderCart();
}

function getCartTotal() {
    return cart.reduce((total, cartItem) => {
        const item = marketplaceItems.find(i => i.id === cartItem.id);
        return total + (item ? item.price * cartItem.quantity : 0);
    }, 0);
}

function updateTotal() {
    totalAmountEl.textContent = formatPrice(getCartTotal());
}

function updateConfirmButton() {
    const total = getCartTotal();
    const canAfford = total <= playerBalance && total > 0;
    confirmBtn.disabled = !canAfford;
}

function confirmPurchase() {
    const total = getCartTotal();
    
    if (cart.length === 0) {
        showToast('Your cart is empty!');
        return;
    }
    
    if (total > playerBalance) {
        showToast('Not enough money!');
        return;
    }
    
    // Send purchase to FiveM server
    fetch(`https://${GetParentResourceName()}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: cart.map(c => ({
                id: c.id,
                quantity: c.quantity
            })),
            total: total
        })
    }).then(response => response.json())
      .then(data => {
          if (data.success !== false) {
              // Update local state for demo
              playerBalance -= total;
              playerBalanceEl.textContent = formatPrice(playerBalance);
              
              // Update stock locally
              cart.forEach(cartItem => {
                  const item = marketplaceItems.find(i => i.id === cartItem.id);
                  if (item) item.stock -= cartItem.quantity;
              });
              
              cart = [];
              renderCart();
              renderItems();
              showToast('Purchase successful!');
          }
      })
      .catch(() => {
          // Demo mode without FiveM
          playerBalance -= total;
          playerBalanceEl.textContent = formatPrice(playerBalance);
          
          cart.forEach(cartItem => {
              const item = marketplaceItems.find(i => i.id === cartItem.id);
              if (item) item.stock -= cartItem.quantity;
          });
          
          cart = [];
          renderCart();
          renderItems();
          showToast('Purchase successful!');
      });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatPrice(amount) {
    return '$' + amount.toLocaleString();
}

function getStockClass(stock) {
    if (stock === 0) return 'out-of-stock';
    if (stock <= 10) return 'low-stock';
    return 'in-stock';
}

function getStockText(stock) {
    if (stock === 0) return 'Out of Stock';
    if (stock <= 10) return `Low Stock (${stock} left)`;
    return `In Stock (${stock})`;
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ============================================
// EVENT LISTENERS
// ============================================

// Close with ESC key
document.addEventListener('keyup', function(e) {
    if (e.key === 'Escape') {
        closeUI();
    }
});

// ============================================
// INITIALIZE - Comment this out for FiveM production
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Auto-open for browser testing (comment out for FiveM)
    container.classList.add('active');
    renderItems();
    renderCart();
});
