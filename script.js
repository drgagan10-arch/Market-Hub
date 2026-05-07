import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, setDoc, getDoc, query, where, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
    apiKey: "AIzaSyB6rFy7GfJR0CwSn-ipam2aph5aKivDiPA",
    authDomain: "bccc-cb695.firebaseapp.com",
    projectId: "bccc-cb695",
    storageBucket: "bccc-cb695.firebasestorage.app",
    messagingSenderId: "854951213415",
    appId: "1:854951213415:web:c0020c5bae3b29d6cf97c2",
    measurementId: "G-2134ZW6DLB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ---------- CART (localStorage) ----------
let cart = [];
function loadCart() {
    const saved = localStorage.getItem('marketHubCart');
    cart = saved ? JSON.parse(saved) : [];
    updateCartBadge();
}
function saveCart() {
    localStorage.setItem('marketHubCart', JSON.stringify(cart));
    updateCartBadge();
}
function updateCartBadge() {
    const total = cart.reduce((s, i) => s + (i.quantity || 1), 0);
    document.querySelectorAll('#cartNavCount').forEach(el => el.innerText = total);
}
function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    if (existing) existing.quantity++;
    else cart.push({ ...product, quantity: 1 });
    saveCart();
    alert(`${product.name} added to cart!`);
}

// ---------- PRODUCTS (multiple images, search, sorting) ----------
let allProducts = [];
let currentFilteredProducts = [];

async function fetchProducts() {
    try {
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
        const qSnap = await getDocs(q);
        allProducts = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("Products loaded:", allProducts.length);
        currentFilteredProducts = [...allProducts];   // show all initially
        renderProductGrid();
        
        if (window.location.pathname.includes('admin.html') && sessionStorage.getItem('isAdmin') === 'true') {
            renderAdminTable();
            loadPendingOrdersAdmin();
        }
        if (window.location.pathname.includes('product.html')) {
            loadProductDetail();
        }
    } catch (error) {
        console.error("Error fetching products:", error);
        const container = document.getElementById('productsContainer');
        if (container) container.innerHTML = '<div>⚠️ Failed to load products. Check Firestore rules.</div>';
    }
}

function performSearch(term) {
    term = (term || "").toLowerCase().trim();
    if (!term) {
        currentFilteredProducts = [...allProducts];
    } else {
        currentFilteredProducts = allProducts.filter(p => 
            p.name.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term)) ||
            p.price.toString().includes(term)
        );
        // keep newest first
        currentFilteredProducts.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate?.() : null;
            const dateB = b.createdAt ? b.createdAt.toDate?.() : null;
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });
    }
    renderProductGrid();
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => performSearch(e.target.value));
    performSearch(''); // initial empty search
}

function getFirstImage(product) {
    if (!product.imageData) return 'https://via.placeholder.com/270';
    if (Array.isArray(product.imageData) && product.imageData.length) return product.imageData[0];
    if (typeof product.imageData === 'string') return product.imageData;
    return 'https://via.placeholder.com/270';
}

function renderProductGrid() {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    if (!currentFilteredProducts || currentFilteredProducts.length === 0) {
        if (allProducts.length === 0) container.innerHTML = '<div>✨ No products yet. Admin can add some.</div>';
        else container.innerHTML = '<div>🔍 No products match your search.</div>';
        return;
    }
    container.innerHTML = currentFilteredProducts.map(p => {
        const imgUrl = getFirstImage(p);
        return `
        <div class="product-card" data-id="${p.id}">
            <img class="product-img" src="${imgUrl}" alt="${escapeHtml(p.name)}">
            <div class="product-info">
                <div class="product-title">${escapeHtml(p.name)}</div>
                <div class="product-price">₹${p.price?.toFixed(2)}</div>
                <div class="product-desc">${escapeHtml(p.description?.substring(0,80) || '')}</div>
                <button class="add-cart-btn" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-price="${p.price}" data-img="${imgUrl}"><i class="fas fa-cart-plus"></i> Add to Cart</button>
            </div>
        </div>`;
    }).join('');
    
    // Attach click events (product detail and add to cart)
    document.querySelectorAll('.product-card').forEach(card => {
        const productId = card.dataset.id;
        const btn = card.querySelector('.add-cart-btn');
        card.addEventListener('click', (e) => {
            if (btn && (e.target === btn || btn.contains(e.target))) return;
            window.location.href = `product.html?id=${productId}`;
        });
        card.style.cursor = 'pointer';
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToCart({
                    id: btn.dataset.id,
                    name: btn.dataset.name,
                    price: parseFloat(btn.dataset.price),
                    imageUrl: btn.dataset.img
                });
            });
        }
    });
}

// ---------- PRODUCT DETAIL PAGE (multiple images, similar products) ----------
async function loadProductDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (!productId) {
        document.getElementById('productDetail').style.display = 'none';
        document.getElementById('productNotFound').style.display = 'block';
        return;
    }
    if (allProducts.length === 0) {
        setTimeout(() => loadProductDetail(), 300);
        return;
    }
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        document.getElementById('productDetail').style.display = 'none';
        document.getElementById('productNotFound').style.display = 'block';
        return;
    }
    let images = [];
    if (product.imageData) {
        if (Array.isArray(product.imageData)) images = product.imageData;
        else images = [product.imageData];
    }
    if (images.length === 0) images = ['https://via.placeholder.com/400'];
    
    document.getElementById('productName').innerText = product.name;
    document.getElementById('productPrice').innerHTML = `₹${product.price?.toFixed(2)}`;
    document.getElementById('productDescription').innerText = product.description || 'No description available.';
    document.getElementById('mainProductImage').src = images[0];
    
    const thumbContainer = document.getElementById('thumbnailList');
    thumbContainer.innerHTML = images.map((img, idx) => `<img src="${img}" data-index="${idx}" class="thumbnail">`).join('');
    document.querySelectorAll('.thumbnail').forEach(thumb => {
        thumb.addEventListener('click', () => {
            document.getElementById('mainProductImage').src = thumb.src;
        });
    });
    
    const addBtn = document.getElementById('detailAddToCartBtn');
    addBtn.replaceWith(addBtn.cloneNode(true));
    const newAddBtn = document.getElementById('detailAddToCartBtn');
    newAddBtn.addEventListener('click', () => {
        addToCart({
            id: product.id,
            name: product.name,
            price: product.price,
            imageUrl: images[0]
        });
    });
    
    renderSimilarProducts(product);
}

function renderSimilarProducts(currentProduct) {
    const container = document.getElementById('similarProductsContainer');
    if (!container) return;
    let similar = allProducts.filter(p => p.id !== currentProduct.id);
    similar = similar.slice(0, 4);
    if (similar.length === 0) {
        container.innerHTML = '<div>No similar products found.</div>';
        return;
    }
    container.innerHTML = similar.map(p => {
        const imgUrl = getFirstImage(p);
        return `
            <div class="similar-product-card" data-id="${p.id}">
                <img src="${imgUrl}" alt="${escapeHtml(p.name)}">
                <div class="similar-product-info">
                    <div class="similar-product-title">${escapeHtml(p.name)}</div>
                    <div class="similar-product-price">₹${p.price?.toFixed(2)}</div>
                    <button class="similar-add-cart-btn" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-price="${p.price}" data-img="${imgUrl}">Add to Cart</button>
                </div>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.similar-product-card').forEach(card => {
        const prodId = card.dataset.id;
        const btn = card.querySelector('.similar-add-cart-btn');
        card.addEventListener('click', (e) => {
            if (btn && (e.target === btn || btn.contains(e.target))) return;
            window.location.href = `product.html?id=${prodId}`;
        });
        card.style.cursor = 'pointer';
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const prod = allProducts.find(p => p.id === prodId);
                if (prod) {
                    addToCart({
                        id: prod.id,
                        name: prod.name,
                        price: prod.price,
                        imageUrl: getFirstImage(prod)
                    });
                }
            });
        }
    });
}

// ---------- ADMIN PRODUCT MANAGEMENT ----------
async function addProduct(name, price, description, imageDataArray) {
    if (sessionStorage.getItem('isAdmin') !== 'true') return alert("Admin only");
    await addDoc(collection(db, "products"), { 
        name, 
        price: parseFloat(price), 
        description, 
        imageData: imageDataArray.slice(0,5),
        createdAt: new Date()
    });
    fetchProducts();
}
async function deleteProduct(id) {
    if (confirm("Delete product permanently?")) {
        await deleteDoc(doc(db, "products", id));
        fetchProducts();
    }
}
async function renderAdminTable() {
    const tbody = document.getElementById('adminProductsList');
    if (!tbody) return;
    if (allProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No products. Add some.</td></table>';
        return;
    }
    tbody.innerHTML = allProducts.map(p => {
        const firstImg = getFirstImage(p);
        return `
        <tr>
            <td><img src="${firstImg}" width="40" style="border-radius:8px;"></td>
            <td>${escapeHtml(p.name)}</td>
            <td>₹${p.price?.toFixed(2)}</td>
            <td><button class="delete-product" data-id="${p.id}"><i class="fas fa-trash-alt"></i> Delete</button></td>
        </tr>`;
    }).join('');
    document.querySelectorAll('.delete-product').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
}

// ---------- USER PROFILE ----------
let currentUser = null;
let userProfile = { name: '', mobile: '', address: '' };
async function fetchUserProfile(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) userProfile = docSnap.data();
    else userProfile = { name: '', mobile: '', address: '' };
    return userProfile;
}
async function saveUserProfile(uid, name, mobile, address) {
    await setDoc(doc(db, "users", uid), { name, mobile, address }, { merge: true });
    userProfile = { name, mobile, address };
}
function showProfileModalIfMissing() {
    if (currentUser && (!userProfile.name || !userProfile.mobile || !userProfile.address)) {
        document.getElementById('profileName').value = userProfile.name || '';
        document.getElementById('profileMobile').value = userProfile.mobile || '';
        document.getElementById('profileAddress').value = userProfile.address || '';
        showModal('profileModal');
    }
}

// ---------- ORDERS ----------
async function createOrder(orderData) {
    await addDoc(collection(db, "orders"), { ...orderData, createdAt: new Date(), userId: currentUser.uid });
}
async function getMyOrders() {
    const q = query(collection(db, "orders"), where("userId", "==", currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getPendingOrders() {
    const q = query(collection(db, "orders"), where("status", "==", "Pending Payment"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function confirmPayment(orderId) {
    await updateDoc(doc(db, "orders", orderId), { status: "Confirmed" });
    if (window.location.pathname.includes('admin.html')) loadPendingOrdersAdmin();
}

// ---------- CART PAGE RENDERING ----------
function renderCartPage() {
    const container = document.getElementById('cartContainer');
    if (!container) return;
    if (cart.length === 0) {
        container.innerHTML = '<div style="background:white; padding:2rem; text-align:center;">Cart is empty.</div>';
        return;
    }
    let total = 0;
    let html = `<table class="cart-table"><thead><tr><th>Item</th><th>Name</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody>`;
    cart.forEach((item, idx) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        html += `<tr>
            <td><img class="cart-item-img" src="${item.imageUrl}" alt="${item.name}"></td>
            <td>${escapeHtml(item.name)}</td>
            <td>₹${item.price.toFixed(2)}</td>
            <td><input type="number" class="qty-input" data-idx="${idx}" value="${item.quantity}" min="1"></td>
            <td>₹${itemTotal.toFixed(2)}</td>
            <td><i class="fas fa-trash-alt remove-item" data-idx="${idx}"></i></td>
        </tr>`;
    });
    html += `</tbody><table><div class="cart-total">Grand Total: ₹${total.toFixed(2)}</div>`;
    container.innerHTML = html;
    document.querySelectorAll('.qty-input').forEach(inp => inp.addEventListener('change', (e) => {
        const idx = parseInt(inp.dataset.idx);
        let newQty = parseInt(inp.value);
        if (isNaN(newQty) || newQty < 1) newQty = 1;
        cart[idx].quantity = newQty;
        saveCart();
        renderCartPage();
    }));
    document.querySelectorAll('.remove-item').forEach(btn => btn.addEventListener('click', (e) => {
        cart.splice(parseInt(btn.dataset.idx), 1);
        saveCart();
        renderCartPage();
    }));
    document.getElementById('checkoutRedirectBtn')?.addEventListener('click', () => {
        if (currentUser) window.location.href = 'checkout.html';
        else alert('Please login first');
    });
}

async function renderMyOrders() {
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    const orders = await getMyOrders();
    const container = document.getElementById('ordersList');
    if (orders.length === 0) container.innerHTML = '<div>No orders yet.</div>';
    else {
        container.innerHTML = orders.map(o => `
            <div class="order-card">
                <div><strong>Order ID:</strong> ${o.id.slice(0, 8)}</div>
                <div><strong>Total:</strong> ₹${o.total}</div>
                <div><strong>Payment:</strong> ${o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'UPI (Online)'}</div>
                <div><strong>Status:</strong> <span class="order-status status-${o.status === 'Placed' ? 'placed' : o.status === 'Pending Payment' ? 'pending' : 'confirmed'}">${o.status}</span></div>
                <div><strong>Address:</strong> ${escapeHtml(o.address)}</div>
            </div>
        `).join('');
    }
}

async function loadPendingOrdersAdmin() {
    const container = document.getElementById('pendingOrdersList');
    if (!container) return;
    const orders = await getPendingOrders();
    if (orders.length === 0) container.innerHTML = '<div>No pending payments.</div>';
    else {
        container.innerHTML = orders.map(o => `
            <div class="order-card">
                <p><strong>Order ID:</strong> ${o.id.slice(0, 8)}</p>
                <p><strong>User:</strong> ${escapeHtml(o.userEmail)}</p>
                <p><strong>Total:</strong> ₹${o.total}</p>
                <p><strong>Items:</strong> ${o.items.map(i => escapeHtml(i.name)).join(', ')}</p>
                <button class="btn-primary confirm-payment" data-id="${o.id}">✅ Mark as Payment Received</button>
            </div>
        `).join('');
    }
    document.querySelectorAll('.confirm-payment').forEach(btn => btn.addEventListener('click', async () => {
        await confirmPayment(btn.dataset.id);
        loadPendingOrdersAdmin();
        alert('Payment confirmed!');
    }));
}

// ---------- CHECKOUT ----------
async function initCheckout() {
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    const profile = await fetchUserProfile(currentUser.uid);
    document.getElementById('checkoutName').value = profile.name || '';
    document.getElementById('checkoutMobile').value = profile.mobile || '';
    document.getElementById('checkoutAddress').value = profile.address || '';
    const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    document.getElementById('checkoutCartSummary').innerHTML = `<p>Total items: ${cart.length}</p><p><strong>Total Amount: ₹${cartTotal.toFixed(2)}</strong></p>`;
    const paymentSelect = document.getElementById('paymentMethod');
    const qrDiv = document.getElementById('qrSection');
    paymentSelect.addEventListener('change', () => {
        qrDiv.style.display = paymentSelect.value === 'upi' ? 'block' : 'none';
    });
    let upiConfirmed = false;
    document.getElementById('confirmPaidBtn')?.addEventListener('click', () => {
        upiConfirmed = true;
        alert('Payment confirmation recorded. Now click Place Order.');
    });
    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('checkoutName').value;
        const mobile = document.getElementById('checkoutMobile').value;
        const address = document.getElementById('checkoutAddress').value;
        const method = paymentSelect.value;
        if (!method) return alert('Select payment method');
        if (method === 'upi' && !upiConfirmed) return alert('Please click "I have paid" after scanning QR');
        if (cart.length === 0) return alert('Your cart is empty!');
        await saveUserProfile(currentUser.uid, name, mobile, address);
        const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const order = {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
            total: total,
            address: address,
            mobile: mobile,
            paymentMethod: method,
            status: method === 'cod' ? 'Placed' : 'Pending Payment',
            createdAt: new Date()
        };
        try {
            await createOrder(order);
            cart = [];
            saveCart();
            alert('🎉 Order placed successfully!');
            window.location.href = 'myorders.html';
        } catch (err) {
            console.error(err);
            alert('Error placing order: ' + err.message);
        }
    });
}

// ---------- MODAL HELPERS ----------
function showModal(id) { document.getElementById(id).classList.add('active'); }
function hideModal(id) { document.getElementById(id).classList.remove('active'); }

// ---------- AUTH & EVENT LISTENERS ----------
function setupAuthAndFeatures() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authArea = document.getElementById('userAuthArea');
        const userArea = document.getElementById('userInfoArea');
        const greeting = document.getElementById('userGreeting');
        if (user) {
            if (authArea) authArea.style.display = 'none';
            if (userArea) userArea.style.display = 'flex';
            if (greeting) greeting.innerHTML = `<i class="fas fa-user-circle"></i> ${user.email.split('@')[0]}`;
            await fetchUserProfile(user.uid);
            showProfileModalIfMissing();
        } else {
            if (authArea) authArea.style.display = 'flex';
            if (userArea) userArea.style.display = 'none';
        }
        if (window.location.pathname.includes('checkout.html') && user) initCheckout();
        if (window.location.pathname.includes('myorders.html') && user) renderMyOrders();
        if (window.location.pathname.includes('admin.html') && sessionStorage.getItem('isAdmin') !== 'true') window.location.href = 'index.html';
        fetchProducts();
        setupSearch(); // call after fetchProducts (or inside, but safe to call again)
    });

    // Login / Signup events
    document.getElementById('doLoginBtn')?.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pwd = document.getElementById('loginPassword').value;
        try {
            await signInWithEmailAndPassword(auth, email, pwd);
            hideModal('authModal');
        } catch (e) { document.getElementById('authMessage').innerText = e.message; }
    });
    document.getElementById('doSignupBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const pwd = document.getElementById('signupPassword').value;
        const mobile = document.getElementById('signupMobile').value;
        const address = document.getElementById('signupAddress').value;
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pwd);
            await saveUserProfile(cred.user.uid, name, mobile, address);
            hideModal('authModal');
        } catch (e) { document.getElementById('authMessage').innerText = e.message; }
    });
    document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
        await signInWithPopup(auth, provider);
        hideModal('authModal');
    });
    document.getElementById('googleSignupBtn')?.addEventListener('click', async () => {
        await signInWithPopup(auth, provider);
        hideModal('authModal');
    });
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('profileName').value;
        const mobile = document.getElementById('profileMobile').value;
        const address = document.getElementById('profileAddress').value;
        await saveUserProfile(currentUser.uid, name, mobile, address);
        hideModal('profileModal');
        alert('Profile updated');
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));

    // Modal open/close
    document.getElementById('loginModalBtn')?.addEventListener('click', () => showModal('authModal'));
    document.getElementById('signupModalBtn')?.addEventListener('click', () => {
        showModal('authModal');
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
    });
    document.getElementById('switchToSignup')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
    });
    document.getElementById('switchToLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('signupForm').style.display = 'none';
    });
    document.querySelectorAll('.close-modal, .close-admin-modal, .close-profile-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) hideModal(modal.id);
        });
    });
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) hideModal(e.target.id);
    });

    // Admin hardcoded login
    document.getElementById('adminLoginBtn')?.addEventListener('click', () => showModal('adminAuthModal'));
    document.getElementById('doAdminLoginBtn')?.addEventListener('click', () => {
        const user = document.getElementById('adminUsername').value;
        const pwd = document.getElementById('adminPassword').value;
        if (user === 'admin' && pwd === '123') {
            sessionStorage.setItem('isAdmin', 'true');
            window.location.href = 'admin.html';
        } else {
            document.getElementById('adminMessage').innerText = 'Invalid credentials';
        }
    });
    document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
        sessionStorage.removeItem('isAdmin');
        signOut(auth);
        window.location.href = 'index.html';
    });

    // Admin: add product with up to 5 images (Base64)
    const fileInput = document.getElementById('prodImageFiles');
    const previewContainer = document.getElementById('imagePreviews');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files).slice(0, 5);
            previewContainer.innerHTML = '';
            window.tempImagesBase64 = [];
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = function (ev) {
                    window.tempImagesBase64.push(ev.target.result);
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.style.width = '80px';
                    img.style.height = '80px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '8px';
                    previewContainer.appendChild(img);
                };
                reader.readAsDataURL(file);
            });
        });
    }
    document.getElementById('addProductBtn')?.addEventListener('click', async () => {
        const name = document.getElementById('prodName').value.trim();
        const price = document.getElementById('prodPrice').value;
        const desc = document.getElementById('prodDesc').value.trim();
        const images = window.tempImagesBase64 || [];
        if (!name || !price || images.length === 0) return alert('Please fill all fields and select at least one image');
        await addProduct(name, price, desc, images);
        document.getElementById('prodName').value = '';
        document.getElementById('prodPrice').value = '';
        document.getElementById('prodDesc').value = '';
        fileInput.value = '';
        previewContainer.innerHTML = '';
        window.tempImagesBase64 = null;
        alert('Product added!');
    });
}

// Helper
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ---------- INITIALIZE ----------
loadCart();
setupAuthAndFeatures();
if (window.location.pathname.includes('cart.html')) renderCartPage();
