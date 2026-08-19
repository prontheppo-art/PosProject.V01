document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
document.addEventListener('gestureend', function (e) { e.preventDefault(); });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allGroups = [];
let allFoodItems = [];
let foodGroups = [];
let priceMap = {};
let allLocations = [];
let allZones = [];
let currentGroup = "";
let currentCategoryModalId = null;
let currentCategoryModalName = "";
let selectedLocationId = "";
let selectedZoneName = "";
let cart = [];
let selectedFood = null;
let activePendingOrderId = null;
let deliveryFeeManuallyRemoved = false;
let editingCartIndex = null; // ตัวแปรเก็บสถานะว่ากำลังแก้ไขรายการที่เท่าไหร่ในตะกร้า

let modifierPrices = { friedEgg: 10, omelet: 10 };
let currentFriedEggCount = 0;
let currentOmeletCount = 0;

function cleanGroupName(name) {
    if (!name) return '';
    return name.replace(/ชาวบ้าน\s*\/\s*/g, '').replace(/สมาชิก\s*VIP\s*\/\s*/g, '').trim();
}

function showCustomAlert(title, message) {
    document.getElementById('customAlertTitle').textContent = title;
    document.getElementById('customAlertMessage').textContent = message;
    document.getElementById('customAlertModal').classList.add('active');
}

window.onload = async function() {
    try {
        await loadModifierPricesFromDB();
        await loadInitialData();
        await loadPendingOrderToCart();
        loadSavedDeliveryInfo();
        updateCartPricesForCurrentGroup();
        updateCartDisplay();
    } catch (err) {
        console.error("Initialization error:", err);
        showCustomAlert('เกิดข้อผิดพลาดในการโหลดระบบ', err.message || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
    }
};

async function loadModifierPricesFromDB() {
    try {
        const { data, error } = await db.from('modifiers').select('*');
        if (error) throw error;
        if (data) {
            data.forEach(m => {
                if (m.name && m.name.includes('ไข่ดาว')) modifierPrices.friedEgg = Number(m.price);
                if (m.name && m.name.includes('ไข่เจียว')) modifierPrices.omelet = Number(m.price);
            });
            
            const friedEggLabel = document.getElementById('friedEggLabel');
            const omeletLabel = document.getElementById('omeletLabel');
            if (friedEggLabel) friedEggLabel.textContent = `ไข่ดาว (+${modifierPrices.friedEgg}฿/ฟอง)`;
            if (omeletLabel) omeletLabel.textContent = `ไข่เจียว (+${modifierPrices.omelet}฿/ฟอง)`;
        }
    } catch (err) {
        console.error("Error loading modifier prices:", err);
    }
}

async function loadInitialData() {
    try {
        const { data: groups, error: groupErr } = await db.from('customer_groups').select('*').order('id');
        if (groupErr) throw groupErr;
        if (groups) {
            allGroups = groups;
            const savedGroupFromIndex = localStorage.getItem('selectedCustomerGroup');
            if (savedGroupFromIndex) {
                currentGroup = savedGroupFromIndex;
            } else if (groups.length > 0) {
                currentGroup = cleanGroupName(groups[0].name);
            }
            const groupTextEl = document.getElementById('selectedGroupText');
            if (groupTextEl) groupTextEl.textContent = currentGroup || '-- เลือกกลุ่มลูกค้า --';
            checkTouristDeliveryVisibility();
        }

        const { data: fgData, error: fgErr } = await db.from('food_groups').select('*');
        if (fgErr) throw fgErr;
        if (fgData) {
            const customOrder = [
                "ลาบ / ก้อย / ซอยจุ๊", 
                "ส้มตำ",                 
                "ต้ม / แกง",             
                "ทอด / ยำ",              
                "ข้าวกล่อง",             
                "ข้าว / ข้าวต้ม",        
                "เมนูพิเศษ",             
                "ลูกค้าฝากซื้อ"          
            ];

            fgData.sort((a, b) => {
                let indexA = customOrder.indexOf(a.name.trim());
                let indexB = customOrder.indexOf(b.name.trim());
                if (indexA === -1) indexA = 99;
                if (indexB === -1) indexB = 99;
                return indexA - indexB;
            });
            foodGroups = fgData;
        }

        const { data: foods, error: foodErr } = await db.from('foods').select('*').order('name');
        if (foodErr) throw foodErr;

        const { data: prices, error: priceErr } = await db.from('food_prices').select('*');
        if (priceErr) throw priceErr;
        
        priceMap = {};
        if (prices) {
            prices.forEach(p => {
                if (!priceMap[p.food_id]) priceMap[p.food_id] = {};
                const groupObj = allGroups.find(g => String(g.id) === String(p.customer_group_id));
                const gName = groupObj ? cleanGroupName(groupObj.name) : p.customer_group_id;
                priceMap[p.food_id][gName] = p.price;
            });
        }

        if (foods) {
            allFoodItems = foods;
            renderCategoryGrid();
        }

        const { data: locData, error: locErr } = await db.from('locations').select('*').order('id');
        if (locErr) throw locErr;
        if (locData) allLocations = locData;

        const { data: zoneData, error: zoneErr } = await db.from('zones').select('*').order('id');
        if (zoneErr) throw zoneErr;
        if (zoneData) allZones = zoneData;

        checkAndAutoSelectDefaults();
    } catch (err) {
        console.error("Error loading initial data:", err);
        showCustomAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล', err.message || 'ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้');
    }
}

function checkAndAutoSelectDefaults() {
    if (!selectedLocationId && allLocations.length > 0) {
        if (allLocations.length === 1) {
            selectedLocationId = String(allLocations[0].id);
            document.getElementById('selectedLocationText').textContent = allLocations[0].name;
        } else {
            const savedLocId = localStorage.getItem('customerLocationId');
            if (savedLocId && allLocations.some(l => String(l.id) === String(savedLocId))) {
                selectedLocationId = savedLocId;
                const loc = allLocations.find(l => String(l.id) === String(savedLocId));
                document.getElementById('selectedLocationText').textContent = loc ? loc.name : '-- เลือกสถานที่ --';
            } else {
                document.getElementById('selectedLocationText').textContent = '-- เลือก --';
            }
        }
    }

    if (selectedLocationId) {
        const filteredZones = allZones.filter(z => String(z.location_id) === String(selectedLocationId));
        if (!selectedZoneName && filteredZones.length > 0) {
            if (filteredZones.length === 1) {
                selectedZoneName = filteredZones[0].name;
                document.getElementById('selectedZoneText').textContent = filteredZones[0].name;
            } else {
                const savedZone = localStorage.getItem('customerZone');
                if (savedZone && filteredZones.some(z => z.name === savedZone)) {
                    selectedZoneName = savedZone;
                    document.getElementById('selectedZoneText').textContent = savedZone;
                } else {
                    document.getElementById('selectedZoneText').textContent = '-- เลือก --';
                }
            }
        }
    } else {
        if (!selectedZoneName) {
            document.getElementById('selectedZoneText').textContent = '-- เลือก --';
        }
    }
    saveDeliveryInfo();
}

async function loadPendingOrderToCart() {
    try {
        const { data, error } = await db
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .order('id', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const pendingOrder = data[0];
            activePendingOrderId = pendingOrder.id;
            
            if (pendingOrder.customer_group) {
                currentGroup = pendingOrder.customer_group;
                document.getElementById('selectedGroupText').textContent = currentGroup;
                localStorage.setItem('selectedCustomerGroup', currentGroup);
                checkTouristDeliveryVisibility();
            }

            if (pendingOrder.items) {
                if (typeof pendingOrder.items === 'string') {
                    cart = JSON.parse(pendingOrder.items);
                } else {
                    cart = pendingOrder.items;
                }
            }
        } else {
            cart = JSON.parse(localStorage.getItem('restaurantCart') || "[]");
            activePendingOrderId = null;
        }
    } catch (err) {
        console.error("Error loading pending order:", err);
        cart = JSON.parse(localStorage.getItem('restaurantCart') || "[]");
    }
}

function renderCategoryGrid() {
    const container = document.getElementById('categoryGridContainer');
    if (!container) return;
    container.innerHTML = '';
    
    if (foodGroups.length === 0) {
        container.innerHTML = `<div class="text-center col-span-2 text-gray-500 py-4 text-xs">ไม่พบหมวดหมู่สินค้า</div>`;
        return;
    }

    foodGroups.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.textContent = `📁 ${cat.name}`;
        card.onclick = () => openCategoryModal(cat.id, cat.name);
        container.appendChild(card);
    });
}

function openGroupModal() {
    const container = document.getElementById('groupOptionsContainer');
    container.innerHTML = '';
    allGroups.forEach(g => {
        const cleanName = cleanGroupName(g.name);
        const card = document.createElement('div');
        card.className = 'popup-menu-card';
        card.textContent = cleanName;
        card.onclick = () => selectCustomerGroup(cleanName);
        container.appendChild(card);
    });
    document.getElementById('groupModal').classList.add('active');
}

function selectCustomerGroup(groupName) {
    currentGroup = groupName;
    deliveryFeeManuallyRemoved = false;
    document.getElementById('selectedGroupText').textContent = groupName;
    localStorage.setItem('selectedCustomerGroup', groupName);
    checkTouristDeliveryVisibility();
    updateCartPricesForCurrentGroup();
    closeModal('groupModal');
}

function openCategoryModal(categoryId, categoryName) {
    currentCategoryModalId = categoryId;
    currentCategoryModalName = categoryName;
    document.getElementById('modalCategoryTitle').textContent = `หมวดหมู่: ${categoryName}`;
    const container = document.getElementById('modalMenuItemsContainer');
    container.innerHTML = '';
    
    const items = allFoodItems.filter(f => String(f.category_id) === String(categoryId));
    items.forEach(item => {
        const price = getFoodPrice(item.id);
        const card = document.createElement('div');
        card.className = 'popup-menu-card';
        card.textContent = item.name;
        card.onclick = () => {
            closeModal('menuListModal');
            openItemDetailModal(item, price, categoryName);
        };
        container.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'popup-menu-card popup-add-card';
    addCard.innerHTML = '<span>➕</span><span style="font-size:10px; margin-top:1px;">เพิ่มเมนู</span>';
    addCard.onclick = () => {
        openAddMenuModal();
    };
    container.appendChild(addCard);

    document.getElementById('menuListModal').classList.add('active');
}

function openAddMenuModal() {
    document.getElementById('newMenuNameInput').value = '';
    const container = document.getElementById('newMenuPricesContainer');
    container.innerHTML = '';

    allGroups.forEach(g => {
        const cleanName = cleanGroupName(g.name);
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-2 p-1 bg-white rounded-lg border border-slate-100 shadow-sm';
        div.innerHTML = `
            <span class="text-xs font-bold text-slate-700 pl-1">${cleanName}</span>
            <input type="number" placeholder="ระบุราคา" data-group-id="${g.id}" class="new-menu-price-input w-28 p-1.5 border rounded-lg text-center text-xs font-bold bg-slate-50 text-blue-600 outline-none">
        `;
        container.appendChild(div);
    });

    document.getElementById('addMenuModal').classList.add('active');
}

async function confirmSaveNewMenu() {
    const name = document.getElementById('newMenuNameInput').value.trim();
    if (!name) {
        showCustomAlert('แจ้งเตือน', 'กรุณากรอกชื่อเมนูอาหาร');
        return;
    }

    const priceInputs = document.querySelectorAll('.new-menu-price-input');
    const pricesPayload = [];
    priceInputs.forEach(input => {
        const customerGroupId = input.getAttribute('data-group-id');
        const priceVal = parseFloat(input.value) || 0;
        pricesPayload.push({
            customer_group_id: customerGroupId,
            price: priceVal
        });
    });

    try {
        const { data: foodData, error: foodError } = await db.from('foods').insert([{
            name: name,
            category_id: currentCategoryModalId
        }]).select();

        if (foodError) throw foodError;

        if (foodData && foodData.length > 0) {
            const newFoodId = foodData[0].id;

            const finalPricesToInsert = pricesPayload.map(p => ({
                food_id: newFoodId,
                customer_group_id: p.customer_group_id,
                price: p.price
            }));

            const { error: priceError } = await db.from('food_prices').insert(finalPricesToInsert);
            if (priceError) throw priceError;

            closeModal('addMenuModal');
            closeModal('menuListModal');

            await loadInitialData();
            openCategoryModal(currentCategoryModalId, currentCategoryModalName);
        }
    } catch (err) {
        console.error('Error adding new menu:', err);
        showCustomAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มเมนูได้: ' + err.message);
    }
}

function getFoodPrice(foodId) {
    let targetGroup = currentGroup;
    if (priceMap[foodId]) {
        if (priceMap[foodId][targetGroup] !== undefined) return Number(priceMap[foodId][targetGroup]);
        const firstPrice = Object.values(priceMap[foodId])[0];
        if (firstPrice !== undefined) return Number(firstPrice);
    }
    return 0;
}

function openItemDetailModal(item, defaultPrice, categoryName, cartIndex = null, existingCartItem = null) {
    editingCartIndex = cartIndex;
    selectedFood = { ...item, defaultPrice, categoryName };
    
    if (existingCartItem) {
        currentFriedEggCount = 0;
        currentOmeletCount = 0;
        
        if (existingCartItem.note) {
            if (existingCartItem.note.includes('ไข่ดาว')) currentFriedEggCount = 1;
            if (existingCartItem.note.includes('ไข่เจียว')) currentOmeletCount = 1;
        }

        document.getElementById('friedEggQty').value = currentFriedEggCount;
        document.getElementById('omeletQty').value = currentOmeletCount;
        document.getElementById('itemQtyInput').value = existingCartItem.qty || 1;
        
        let cleanNote = existingCartItem.note || '';
        cleanNote = cleanNote.replace(/ไข่ดาว/g, '').replace(/ไข่เจียว/g, '').replace(/^,\s*|,\s*$/g, '').trim();
        document.getElementById('itemNoteInput').value = cleanNote;
        
        document.getElementById('itemCustomPriceInput').value = existingCartItem.price !== defaultPrice ? existingCartItem.price : '';
    } else {
        currentFriedEggCount = 0;
        currentOmeletCount = 0;
        document.getElementById('friedEggQty').value = 0;
        document.getElementById('omeletQty').value = 0;
        document.getElementById('itemQtyInput').value = 1;
        document.getElementById('itemCustomPriceInput').value = '';
        document.getElementById('itemNoteInput').value = '';
    }

    const isRiceBox = categoryName && categoryName.includes('ข้าวกล่อง');
    document.getElementById('boxRiceBoxAddons').style.display = isRiceBox ? 'block' : 'none';

    document.getElementById('detailItemName').textContent = item.name;
    updateItemPriceDisplay();
    document.getElementById('itemDetailModal').classList.add('active');
}

function adjustAddonQty(type, change) {
    if (type === 'friedEgg') {
        currentFriedEggCount += change;
        if (currentFriedEggCount < 0) currentFriedEggCount = 0;
        document.getElementById('friedEggQty').value = currentFriedEggCount;
    } else if (type === 'omelet') {
        currentOmeletCount += change;
        if (currentOmeletCount < 0) currentOmeletCount = 0;
        document.getElementById('omeletQty').value = currentOmeletCount;
    }
    updateItemPriceDisplay();
}

function updateItemPriceDisplay() {
    const basePrice = selectedFood.defaultPrice;
    const addonTotalPrice = (currentFriedEggCount * modifierPrices.friedEgg) + (currentOmeletCount * modifierPrices.omelet);
    const finalUnitPrice = basePrice + addonTotalPrice;
    document.getElementById('itemPriceDisplay').value = finalUnitPrice + '.-';
}

function adjustQty(inputId, change) {
    const input = document.getElementById(inputId);
    let qty = parseInt(input.value) + change;
    if (qty < 1) qty = 1;
    input.value = qty;
}

function confirmAddToCart() {
    if (!selectedFood) return;
    const qty = parseInt(document.getElementById('itemQtyInput').value) || 1;
    const customPrice = parseFloat(document.getElementById('itemCustomPriceInput').value);
    
    const addonTotalPrice = (currentFriedEggCount * modifierPrices.friedEgg) + (currentOmeletCount * modifierPrices.omelet);
    const unitPrice = selectedFood.defaultPrice + addonTotalPrice;
    const finalPrice = !isNaN(customPrice) && customPrice >= 0 ? customPrice : unitPrice;

    let addonNotes = [];
    if (currentFriedEggCount > 0) addonNotes.push(`ไข่ดาว`);
    if (currentOmeletCount > 0) addonNotes.push(`ไข่เจียว`);
    
    let userNote = document.getElementById('itemNoteInput').value.trim();
    let addonString = addonNotes.join(', ');
    let fullNote = addonString ? `${addonString}${userNote ? ', ' + userNote : ''}` : userNote;

    const newItemData = {
        id: selectedFood.id,
        name: selectedFood.name,
        price: finalPrice,
        qty: qty,
        note: fullNote,
        group: currentGroup
    };

    if (editingCartIndex !== null && editingCartIndex >= 0) {
        cart[editingCartIndex] = newItemData;
        editingCartIndex = null;
    } else {
        cart.push(newItemData);
    }

    saveCart();
    updateCartDisplay();
    closeModal('itemDetailModal');
}

function checkTouristDeliveryVisibility() {
    const isTourist = currentGroup.includes('นักท่องเที่ยว');
    const deliveryBox = document.getElementById('deliveryBox');
    if (deliveryBox) deliveryBox.classList.toggle('hidden', !isTourist);
    updateCartDisplay();
}

function updateCartPricesForCurrentGroup() {
    if (cart.length === 0) return;
    cart.forEach(cartItem => {
        if (cartItem.isDeliveryFee) return;
        const foundItem = allFoodItems.find(m => String(m.id) === String(cartItem.id));
        if (foundItem) {
            cartItem.price = getFoodPrice(foundItem.id);
            cartItem.group = currentGroup;
        }
    });
    saveCart();
    updateCartDisplay();
}

function showAddInfoModal(title, onSave) {
    document.getElementById('addInfoTitle').textContent = title;
    document.getElementById('newInfoInput').value = '';
    const saveBtn = document.getElementById('saveNewInfoBtn');
    
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.onclick = () => {
        const val = document.getElementById('newInfoInput').value.trim();
        if (val) {
            onSave(val);
            closeModal('addInfoModal');
        } else {
            showCustomAlert('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ถูกต้อง');
        }
    };
    
    document.getElementById('addInfoModal').classList.add('active');
    setTimeout(() => {
        document.getElementById('newInfoInput').focus();
    }, 100);
}

function openLocationModal() {
    const container = document.getElementById('locationOptionsContainer');
    container.innerHTML = '';
    
    allLocations.forEach(l => {
        const card = document.createElement('div');
        card.className = 'popup-menu-card';
        card.textContent = l.name;
        card.onclick = () => {
            selectedLocationId = String(l.id);
            document.getElementById('selectedLocationText').textContent = l.name;
            
            selectedZoneName = "";
            const filteredZones = allZones.filter(z => String(z.location_id) === String(selectedLocationId));
            if (filteredZones.length === 1) {
                selectedZoneName = filteredZones[0].name;
                document.getElementById('selectedZoneText').textContent = filteredZones[0].name;
            } else {
                document.getElementById('selectedZoneText').textContent = '-- เลือก --';
            }
            saveDeliveryInfo();
            deliveryFeeManuallyRemoved = false;
            updateCartDisplay();
            closeModal('locationModal');
        };
        container.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'popup-menu-card popup-add-card';
    addCard.innerHTML = '<span>➕</span><span style="font-size:10px; margin-top:1px;">เพิ่มสถานที่</span>';
    addCard.onclick = () => {
        showAddInfoModal('เพิ่มสถานที่ส่งใหม่', async (newLocName) => {
            try {
                const { data, error } = await db.from('locations').insert([{ name: newLocName }]).select();
                if (error) throw error;
                if (data && data.length > 0) {
                    allLocations.push(data[0]);
                    openLocationModal();
                }
            } catch (err) {
                showCustomAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มสถานที่ได้: ' + err.message);
            }
        });
    };
    container.appendChild(addCard);

    document.getElementById('locationModal').classList.add('active');
}

function openZoneModal() {
    if (!selectedLocationId) { showCustomAlert('แจ้งเตือน', 'กรุณาเลือกสถานที่ส่งก่อน'); return; }
    const container = document.getElementById('zoneOptionsContainer');
    container.innerHTML = '';
    const filteredZones = allZones.filter(z => String(z.location_id) === String(selectedLocationId));
    
    filteredZones.forEach(z => {
        const card = document.createElement('div');
        card.className = 'popup-menu-card';
        card.textContent = z.name;
        card.onclick = () => {
            selectedZoneName = z.name;
            document.getElementById('selectedZoneText').textContent = selectedZoneName;
            saveDeliveryInfo();
            closeModal('zoneModal');
        };
        container.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'popup-menu-card popup-add-card';
    addCard.innerHTML = '<span>➕</span><span style="font-size:10px; margin-top:1px;">เพิ่มโซน</span>';
    addCard.onclick = () => {
        showAddInfoModal('เพิ่มโซนใหม่สำหรับสถานที่นี้', async (newZoneName) => {
            try {
                const { data, error } = await db.from('zones').insert([{ name: newZoneName, location_id: selectedLocationId }]).select();
                if (error) throw error;
                if (data && data.length > 0) {
                    allZones.push(data[0]);
                    openZoneModal();
                }
            } catch (err) {
                showCustomAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มโซนได้: ' + err.message);
            }
        });
    };
    container.appendChild(addCard);

    document.getElementById('zoneModal').classList.add('active');
}

function saveDeliveryInfo() {
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) localStorage.setItem('customerPhone', phoneInput.value);
    localStorage.setItem('customerLocationId', selectedLocationId);
    const loc = allLocations.find(l => String(l.id) === String(selectedLocationId));
    localStorage.setItem('customerLocation', loc ? loc.name : '');
    localStorage.setItem('customerZone', selectedZoneName);
}

function loadSavedDeliveryInfo() {
    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput) phoneInput.value = localStorage.getItem('customerPhone') || '';
    
    const savedLocId = localStorage.getItem('customerLocationId');
    const savedLocName = localStorage.getItem('customerLocation');
    if (savedLocId && savedLocName) {
        selectedLocationId = savedLocId;
        const locText = document.getElementById('selectedLocationText');
        if (locText) locText.textContent = savedLocName;
    }

    const savedZone = localStorage.getItem('customerZone');
    if (savedZone) {
        selectedZoneName = savedZone;
        const zoneText = document.getElementById('selectedZoneText');
        if (zoneText) zoneText.textContent = savedZone;
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function handleOutsideClick(event, modalId) {
    if (event.target === document.getElementById(modalId)) {
        closeModal(modalId);
    }
}

function saveCart() {
    localStorage.setItem('restaurantCart', JSON.stringify(cart));
}

function updateCartDisplay() {
    const previewList = document.getElementById('cartPreviewList');
    const totalPriceEl = document.getElementById('cartTotalPrice');
    if (!previewList || !totalPriceEl) return;
    
    cart = cart.filter(item => !item.isDeliveryFee);

    const rawFoodTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    const isTourist = currentGroup && currentGroup.includes('นักท่องเที่ยว');
    const locName = localStorage.getItem('customerLocation') || '';
    const isStoreFront = locName.includes('หน้าร้าน');

    if (isTourist && !isStoreFront && rawFoodTotal > 0 && rawFoodTotal < 300 && !deliveryFeeManuallyRemoved) {
        cart.push({
            id: 'delivery_fee',
            name: 'ค่าบริการจัดส่ง',
            price: 20,
            qty: 1,
            note: 'ยอดต่ำกว่า 300 บาท',
            group: currentGroup,
            isDeliveryFee: true
        });
    }

    const totalItems = cart.filter(i => !i.isDeliveryFee).length;
    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    const cartCountText = document.getElementById('cartCountText');
    if (cartCountText) cartCountText.textContent = `${totalItems} รายการ | ${totalQty} ชิ้น`;
    totalPriceEl.textContent = `รวม ${totalPrice}.-`;

    if (cart.length === 0) {
        previewList.innerHTML = `<span class="text-gray-400 text-xs">ยังไม่มีรายการในตะกร้า</span>`;
        return;
    }

    previewList.innerHTML = '';
    cart.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-preview-item flex justify-between items-center';
        
        const noteHtml = item.note ? `<span class="${item.isDeliveryFee ? 'text-amber-600' : 'text-red-600'} ml-1">(${item.note})</span>` : '';
        const unitPriceDisplay = `${item.price}.-`;
        const itemTotalPrice = item.price * item.qty;

        if (item.isDeliveryFee) {
            div.innerHTML = `
                <div class="flex-1">
                    <span class="font-bold text-amber-800">${item.name}</span> 
                    <span class="text-blue-600 font-bold">(${unitPriceDisplay})</span>
                    <span class="text-green-600 font-bold ml-1">x${item.qty}</span>
                    ${noteHtml}
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-700 font-bold">${itemTotalPrice}.-</span>
                    <button onclick="removeFromCart(${index})" class="text-red-500 font-bold px-2">✕</button>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div class="flex-1 cursor-pointer" onclick="editCartItem(${index})">
                    <span class="font-bold text-slate-800 hover:text-blue-600 underline decoration-dashed">${item.name}</span> 
                    <span class="text-blue-600 font-bold">(${unitPriceDisplay})</span>
                    <span class="text-green-600 font-bold ml-1">x${item.qty}</span>
                    ${noteHtml}
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-slate-700 font-bold">${itemTotalPrice}.-</span>
                    <button onclick="removeFromCart(${index})" class="text-red-500 font-bold px-2">✕</button>
                </div>
            `;
        }
        previewList.appendChild(div);
    });
}

function editCartItem(index) {
    const cartItem = cart[index];
    if (!cartItem || cartItem.isDeliveryFee) return;

    let foundFood = allFoodItems.find(f => String(f.id) === String(cartItem.id));
    if (!foundFood) {
        foundFood = { id: cartItem.id, name: cartItem.name };
    }

    const defaultPrice = getFoodPrice(cartItem.id);
    const categoryObj = foodGroups.find(g => g.id === foundFood.category_id);
    const categoryName = categoryObj ? categoryObj.name : '';

    openItemDetailModal(foundFood, defaultPrice, categoryName, index, cartItem);
}

function removeFromCart(index) {
    if (cart[index] && cart[index].isDeliveryFee) {
        deliveryFeeManuallyRemoved = true;
    }
    cart.splice(index, 1);
    saveCart();
    updateCartDisplay();
}

async function goToSummary() {
    const actualCartItems = cart.filter(i => !i.isDeliveryFee);
    if (actualCartItems.length === 0) {
        showCustomAlert('แจ้งเตือน', 'กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ');
        return;
    }
    if (currentGroup.includes('นักท่องเที่ยว')) {
        const phoneInput = document.getElementById('phoneInput');
        const phone = phoneInput ? phoneInput.value.trim() : '';
        if (phone !== '' && phone.length !== 10) { showCustomAlert('แจ้งเตือน', 'กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก'); return; }
        if (!selectedLocationId || !selectedZoneName) { showCustomAlert('แจ้งเตือน', 'กรุณาเลือกสถานที่ส่งและโซนให้ครบถ้วน'); return; }
    }
    saveDeliveryInfo();

    const total_price = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const total_qty = cart.reduce((sum, i) => sum + i.qty, 0);
    const phone = localStorage.getItem('customerPhone') || '';
    const location_name = localStorage.getItem('customerLocation') || '';
    const zone_name = localStorage.getItem('customerZone') || '';
    const order_date = new Date().toISOString().split('T')[0];

    try {
        if (activePendingOrderId) {
            const { error } = await db.from('orders').update({
                customer_group: currentGroup,
                total_price: total_price,
                total_qty: total_qty,
                items: JSON.stringify(cart),
                phone: phone,
                location_name: location_name,
                zone_name: zone_name
            }).eq('id', activePendingOrderId);

            if (error) throw error;
        } else {
            const { data, error } = await db.from('orders').insert([{
                customer_group: currentGroup,
                total_price: total_price,
                total_qty: total_qty,
                items: JSON.stringify(cart),
                phone: phone,
                location_name: location_name,
                zone_name: zone_name,
                order_date: order_date,
                status: 'pending'
            }]).select();

            if (error) throw error;
            if (data && data.length > 0) {
                activePendingOrderId = data[0].id;
            }
        }

        localStorage.removeItem('restaurantCart');
        window.location.href = 'CheckOrder.html';
    } catch (err) {
        console.error('Error saving order:', err);
        showCustomAlert('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออร์เดอร์ได้: ' + err.message);
    }
}
