// ตรวจสอบความปลอดภัยเรื่อง Key ว่าโหลดมาครบถ้วนหรือไม่
if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
    console.error("Critical Error: ไม่พบไฟล์ key.js หรือตัวแปรเชื่อมต่อ Supabase กรุณาตรวจสอบการเรียกไฟล์");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = {
    menus: [],
    groups: [],
    categories: [],
    selectedCategory: 'all', 
    activeFoodId: null
};

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initAppData();
    } catch (err) {
        console.error("Initialization error:", err);
        showAlert('เกิดข้อผิดพลาดในการโหลดระบบ', err.message || 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
    }
    
    window.addEventListener('click', (e) => {
        const btn = document.getElementById('categorySelectBtn');
        const popup = document.getElementById('categoryDropdownPopup');
        if (btn && popup && !btn.contains(e.target) && !popup.contains(e.target)) {
            popup.classList.add('hidden');
        }
    });
});

async function initAppData() {
    await fetchCustomerGroups();
    await fetchCategories();
    await fetchMenus();
}

async function fetchCustomerGroups() {
    const { data, error } = await supabaseClient.from('customer_groups').select('*').order('id', { ascending: true });
    if (error) throw error;
    if (data) {
        state.groups = data;
        renderPriceInputs();
    }
}

async function fetchCategories() {
    const { data, error } = await supabaseClient.from('food_groups').select('id, name').order('name', { ascending: true });
    if (error) throw error;
    if (data) {
        state.categories = data;
        renderDropdownMenu();
        renderModalCategoryList();
    }
}

async function fetchMenus() {
    const { data, error } = await supabaseClient.from('foods').select('id, name, category_id').order('name', { ascending: true });
    if (error) throw error;
    if (data) {
        state.menus = data;
        renderMenuList();
    }
}

function renderPriceInputs() {
    const container = document.getElementById('priceInputsContainer');
    if (!container) return;
    container.innerHTML = state.groups.map(g => {
        const cleanName = g.name.replace(/ชาวบ้าน\s*\/\s*/g, '').replace(/สมาชิก\s*VIP\s*\/\s*/g, '').trim();
        return `
            <div class="bg-gray-50 p-1.5 rounded-xl border border-gray-200 flex flex-col items-center">
                <span class="text-[10px] font-bold text-gray-600 truncate mb-1 w-full text-center">${cleanName}</span>
                <input type="number" data-group-id="${g.id}" placeholder="ราคา" min="0" step="any"
                       class="app-price-input w-full border border-gray-300 rounded-lg px-1 py-1 text-center text-xs outline-none bg-white">
            </div>
        `;
    }).join('');
}

function renderDropdownMenu() {
    const popup = document.getElementById('categoryDropdownPopup');
    if (!popup) return;
    let html = `
        <div onclick="selectCategory('all', '-- แสดงทั้งหมด --')" class="px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition hover:bg-gray-100 flex items-center justify-between whitespace-nowrap gap-4 ${state.selectedCategory === 'all' ? 'bg-red-50 text-red-600 font-bold' : 'text-gray-700'}">
            <span class="truncate">-- แสดงทั้งหมด --</span>
            ${state.selectedCategory === 'all' ? '<span class="shrink-0 ml-2">✓</span>' : ''}
        </div>
    `;

    state.categories.forEach(cat => {
        const isSelected = String(state.selectedCategory) === String(cat.id);
        html += `
            <div onclick="selectCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')" class="px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition hover:bg-gray-100 flex items-center justify-between whitespace-nowrap gap-4 ${isSelected ? 'bg-red-50 text-red-600 font-bold' : 'text-gray-700'}">
                <span class="truncate">📁 ${cat.name}</span>
                ${isSelected ? '<span class="shrink-0 ml-2">✓</span>' : ''}
            </div>
        `;
    });
    popup.innerHTML = html;
}

function selectCategory(id, name) {
    state.selectedCategory = id;
    const catText = document.getElementById('selectedCategoryText');
    const popup = document.getElementById('categoryDropdownPopup');
    if (catText) catText.textContent = name;
    if (popup) popup.classList.add('hidden');
    renderDropdownMenu();
    renderMenuList();
}

function toggleDropdown() {
    const popup = document.getElementById('categoryDropdownPopup');
    if (popup) popup.classList.toggle('hidden');
}

function renderMenuList() {
    const container = document.getElementById('menuListContainer');
    if (!container) return;
    let filtered = state.menus;

    if (state.selectedCategory !== 'all') {
        filtered = state.menus.filter(m => String(m.category_id) === String(state.selectedCategory));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center text-gray-400 text-xs py-4">ยังไม่มีรายการเมนูในกลุ่มนี้</div>`;
        return;
    }

    container.innerHTML = filtered.map(m => `
        <div class="flex items-center bg-white border border-gray-200 hover:bg-red-50/30 p-2 rounded-xl transition shadow-2xs h-fit gap-2">
            <button onclick="handleDeleteMenu('${m.id}', '${m.name.replace(/'/g, "\\'")}')" class="w-5 h-5 bg-red-100 hover:bg-red-200 text-red-500 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" title="ลบเมนู">✕</button>
            <span onclick="openEditMenuModal('${m.id}', '${m.name.replace(/'/g, "\\'")}', '${m.category_id}')" class="text-[11px] font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 transition flex-1" title="คลิกเพื่อแก้ไข">${m.name}</span>
        </div>
    `).join('');
}

function openCategoryManagerModal() {
    resetCategoryForm();
    renderModalCategoryList();
    openModal('editCategoryModal');
}

function renderModalCategoryList() {
    const container = document.getElementById('modalCategoryListContainer');
    if (!container) return;
    if (state.categories.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 text-xs py-4">ยังไม่มีกลุ่มรายการ</div>`;
        return;
    }

    container.innerHTML = state.categories.map(cat => `
        <div class="flex items-center justify-between bg-white border border-gray-200 p-2.5 rounded-xl shadow-2xs hover:border-indigo-300 transition">
            <span class="text-xs font-medium text-gray-700 truncate flex-1">📁 ${cat.name}</span>
            <div class="flex items-center gap-1.5 shrink-0 ml-2">
                <button onclick="prepareEditCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')" class="bg-amber-50 hover:bg-amber-100 text-amber-600 px-2.5 py-1 rounded-lg text-[10px] font-bold transition">แก้ไข</button>
                <button onclick="handleDeleteCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')" class="bg-red-50 hover:bg-red-100 text-red-500 px-2 py-1 rounded-lg text-[10px] font-bold transition">ลบ</button>
            </div>
        </div>
    `).join('');
}

function prepareEditCategory(id, name) {
    document.getElementById('editingCategoryId').value = id;
    document.getElementById('editCategoryInput').value = name;
    document.getElementById('catFormLabel').textContent = '✏️ แก้ไขชื่อกลุ่มรายการ';
    document.getElementById('saveCatBtnText').textContent = 'บันทึก';
    document.getElementById('cancelEditCatBtn').classList.remove('hidden');
    document.getElementById('editCategoryInput').focus();
}

function resetCategoryForm() {
    document.getElementById('editingCategoryId').value = '';
    document.getElementById('editCategoryInput').value = '';
    document.getElementById('catFormLabel').textContent = '➕ เพิ่มกลุ่มรายการใหม่';
    document.getElementById('saveCatBtnText').textContent = 'เพิ่ม';
    document.getElementById('cancelEditCatBtn').classList.add('hidden');
}

async function handleSaveCategoryAction() {
    const editingId = document.getElementById('editingCategoryId').value;
    const inputName = document.getElementById('editCategoryInput').value.trim();

    if (!inputName) {
        showAlert('แจ้งเตือน', 'กรุณากรอกชื่อกลุ่มรายการ');
        return;
    }

    try {
        if (!editingId) {
            const { data, error } = await supabaseClient.from('food_groups').insert([{ name: inputName }]).select();
            if (error) throw error;
            resetCategoryForm();
            await fetchCategories();
            if (data && data.length > 0) {
                selectCategory(data[0].id, data[0].name);
            }
        } else {
            const { error } = await supabaseClient.from('food_groups').update({ name: inputName }).eq('id', editingId);
            if (error) throw error;
            
            if (String(state.selectedCategory) === String(editingId)) {
                document.getElementById('selectedCategoryText').textContent = inputName;
            }

            resetCategoryForm();
            await fetchCategories();
        }
    } catch (err) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถบันทึกกลุ่มได้: ' + err.message);
    }
}

async function handleDeleteCategory(id, name) {
    if (!confirm(`ต้องการลบกลุ่ม "${name}" ใช่หรือไม่?\n(เมนูอาหารที่อยู่ในกลุ่มนี้อาจได้รับผลกระทบ)`)) return;

    try {
        const { error } = await supabaseClient.from('food_groups').delete().eq('id', id);
        if (error) throw error;

        if (String(state.selectedCategory) === String(id)) {
            selectCategory('all', '-- แสดงทั้งหมด --');
        }

        await fetchCategories();
        await fetchMenus();
    } catch (err) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถลบกลุ่มได้ (อาจมีเมนูอาหารอ้างอิงอยู่): ' + err.message);
    }
}

async function handleSaveMenu() {
    const categoryId = state.selectedCategory;
    const nameInput = document.getElementById('menuNameInput');
    const name = nameInput.value.trim();

    if (categoryId === 'all' || !categoryId) {
        showAlert('แจ้งเตือน', 'กรุณาเลือกหมวดหมู่ก่อนบันทึกรายการอาหาร');
        return;
    }
    if (!name) {
        showAlert('แจ้งเตือน', 'กรุณากรอกชื่อเมนูอาหาร');
        return;
    }

    try {
        const { data, error } = await supabaseClient.from('foods').insert([{ name, category_id: Number(categoryId) }]).select();
        if (error) throw error;

        if (data && data.length > 0) {
            const foodId = data[0].id;
            const priceInputs = document.querySelectorAll('.app-price-input');
            const priceList = [];

            priceInputs.forEach(input => {
                const groupId = input.getAttribute('data-group-id');
                const val = parseFloat(input.value);
                if (!isNaN(val) && val >= 0) {
                    priceList.push({ food_id: foodId, customer_group_id: Number(groupId), price: val });
                }
            });

            if (priceList.length > 0) {
                const { error: priceErr } = await supabaseClient.from('food_prices').insert(priceList);
                if (priceErr) throw priceErr;
            }

            nameInput.value = '';
            priceInputs.forEach(i => i.value = '');
            await fetchMenus();
        }
    } catch (err) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถบันทึกเมนูได้: ' + err.message);
    }
}

function openEditMenuModal(id, name, catId) {
    state.activeFoodId = id;
    document.getElementById('editMenuNameInput').value = name;
    
    const selectEl = document.getElementById('targetCategorySelect');
    selectEl.innerHTML = state.categories.map(cat => `
        <option value="${cat.id}" ${String(cat.id) === String(catId) ? 'selected' : ''}>📁 ${cat.name}</option>
    `).join('');

    openModal('moveCategoryModal');
}

async function handleUpdateMenu() {
    if (!state.activeFoodId) return;
    const name = document.getElementById('editMenuNameInput').value.trim();
    const categoryId = document.getElementById('targetCategorySelect').value;

    if (!name) {
        showAlert('แจ้งเตือน', 'กรุณากรอกชื่อเมนูอาหาร');
        return;
    }

    try {
        const { error } = await supabaseClient.from('foods')
            .update({ name, category_id: Number(categoryId) })
            .eq('id', state.activeFoodId);

        if (error) throw error;

        closeModal('moveCategoryModal');
        state.activeFoodId = null;
        await fetchMenus();
    } catch (err) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้: ' + err.message);
    }
}

async function handleDeleteMenu(id, name) {
    if (!confirm(`ต้องการลบเมนู "${name}" ใช่หรือไม่?`)) return;

    try {
        const { error: priceErr } = await supabaseClient.from('food_prices').delete().eq('food_id', id);
        if (priceErr) throw priceErr;

        const { error } = await supabaseClient.from('foods').delete().eq('id', id);
        if (error) throw error;

        await fetchMenus();
    } catch (err) {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถลบเมนูได้: ' + err.message);
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function showAlert(title, message, icon = "⚠️") {
    const titleEl = document.getElementById('alertTitle');
    const msgEl = document.getElementById('alertMessage');
    const iconEl = document.getElementById('alertIcon');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;
    openModal('alertModal');
}
