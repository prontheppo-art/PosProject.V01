// ป้องกันการซูมหน้าจอด้วยนิ้วและ Gesture ต่างๆ
document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gestureend', function (e) { e.preventDefault(); }, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

document.addEventListener('touchstart', function (event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentOrder = null;
let orderItems = [];

window.onload = function() {
    loadLatestOrder();
};

async function loadLatestOrder() {
    try {
        const { data, error } = await db
            .from('orders')
            .select('*')
            .eq('status', 'pending')
            .order('id', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            document.getElementById('cartTableBody').innerHTML = `<tr><td colspan="3" class="text-center p-4 text-slate-400">ยังไม่มีรายการออร์เดอร์ที่รอตรวจสอบ</td></tr>`;
            return;
        }

        currentOrder = data[0];
        
        if (typeof currentOrder.items === 'string') {
            orderItems = JSON.parse(currentOrder.items);
        } else {
            orderItems = currentOrder.items || [];
        }

        document.getElementById('lblGroup').textContent = currentOrder.customer_group || 'ทั่วไป';
        document.getElementById('lblDate').textContent = currentOrder.order_date || '-';

        if (currentOrder.customer_group && currentOrder.customer_group.includes('นักท่องเที่ยว')) {
            document.getElementById('deliveryInfoBox').classList.remove('hidden');
            document.getElementById('lblPhone').textContent = currentOrder.phone || '-';
            document.getElementById('lblLocation').textContent = currentOrder.location_name || '-';
            document.getElementById('lblZone').textContent = currentOrder.zone_name || '-';
        }

        renderTable();

    } catch (err) {
        console.error('Error loading order:', err);
        document.getElementById('cartTableBody').innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('cartTableBody');
    tbody.innerHTML = '';

    if (orderItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-slate-400">ไม่มีรายการอาหาร</td></tr>`;
        document.getElementById('summaryCountText').textContent = '0 รายการ | 0 ชิ้น';
        document.getElementById('summaryTotalPrice').textContent = '0';
        return;
    }

    let foodItemCount = 0;
    let totalQty = 0;
    let totalPrice = 0;

    orderItems.forEach((item) => {
        const itemName = item.name || '';
        const itemQty = Number(item.qty || 1);
        const itemPrice = Number(item.price || 0);
        
        totalPrice += itemPrice * itemQty;

        const isDeliveryFee = itemName.includes('ค่าบริการจัดส่ง') || itemName.includes('ค่าจัดส่ง');
        if (!isDeliveryFee) {
            foodItemCount += 1;
            totalQty += itemQty;
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-slate-50';
        tr.innerHTML = `
            <td class="p-2.5 font-medium text-slate-800">
                ${itemName}
                ${item.note ? `<div class="text-[10px] text-rose-500 font-semibold">หมายเหตุ: ${item.note}</div>` : ''}
            </td>
            <td class="p-2.5 text-center font-bold text-slate-700">${itemQty}</td>
            <td class="p-2.5 text-right font-bold text-blue-600">${(itemPrice * itemQty).toLocaleString()}.-</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('summaryCountText').textContent = `${foodItemCount} รายการ | ${totalQty} ชิ้น`;
    document.getElementById('summaryTotalPrice').textContent = totalPrice.toLocaleString();
}

async function confirmFinalOrder() {
    if (!currentOrder || orderItems.length === 0) {
        return;
    }

    try {
        for (let item of orderItems) {
            const itemName = item.name || '';
            if (itemName.includes('ค่าบริการจัดส่ง') || itemName.includes('ค่าจัดส่ง')) {
                continue;
            }

            let { data: mappings, error: mapError } = await db
                .from('food_mappings')
                .select('*')
                .eq('food_id', item.id);

            if (mapError) throw new Error(mapError.message);

            if (mappings && mappings.length > 0) {
                for (let map of mappings) {
                    let stockName = map.stock_name || map.food_name;
                    let { data: stock, error: stockError } = await db
                        .from('food_stocks')
                        .select('*')
                        .eq('food_name', stockName)
                        .single();

                    if (stockError) continue;

                    if (stock && stock.quantity < item.qty) {
                        alert(`สินค้าในสต็อกไม่พอสำหรับเมนู: ${item.name}`);
                        return;
                    }
                }
            }
        }

        for (let item of orderItems) {
            const itemName = item.name || '';
            if (itemName.includes('ค่าบริการจัดส่ง') || itemName.includes('ค่าจัดส่ง')) {
                continue;
            }

            let { data: mappings } = await db
                .from('food_mappings')
                .select('*')
                .eq('food_id', item.id);

            if (mappings && mappings.length > 0) {
                for (let map of mappings) {
                    let stockName = map.stock_name || map.food_name;
                    let { data: stock } = await db
                        .from('food_stocks')
                        .select('id, quantity')
                        .eq('food_name', stockName)
                        .single();

                    if (stock) {
                        let newQuantity = Number(stock.quantity) - Number(item.qty);
                        await db
                            .from('food_stocks')
                            .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
                            .eq('id', stock.id);
                    }
                }
            }
        }

        let { error: updateError } = await db
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', currentOrder.id);

        if (updateError) throw updateError;

        localStorage.setItem('lastCompletedOrder', JSON.stringify(orderItems));
        localStorage.setItem('orderRecordDate', currentOrder.order_date || new Date().toLocaleDateString('th-TH'));

        window.location.href = 'Print.html';

    } catch (err) {
        console.error('Confirmation Error:', err);
        alert('เกิดข้อผิดพลาดในการยืนยันออร์เดอร์: ' + err.message);
    }
}
