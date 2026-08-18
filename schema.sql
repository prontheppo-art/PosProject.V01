<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ตรวจสอบสต็อกสินค้า - Supabase</title>
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Supabase Client CDN -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body class="bg-light">

    <div class="container my-5" style="max-width: 800px;">
        <div class="card shadow-sm p-4 bg-white rounded-4">
            <h3 class="mb-4 text-center">📦 สต็อกสินค้าคงเหลือ (จากฐานข้อมูล)</h3>
            
            <div class="table-responsive">
                <table class="table table-bordered align-middle">
                    <thead class="table-dark text-center">
                        <tr>
                            <th>รหัส</th>
                            <th>ชื่อวัตถุดิบ / สินค้า</th>
                            <th style="width: 120px;">คงเหลือ</th>
                            <th style="width: 150px;">เพิ่มจำนวน</th>
                            <th style="width: 100px;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody id="stockTableBody">
                        <tr>
                            <td colspan="5" class="text-center text-muted">กำลังโหลดข้อมูลจากฐานข้อมูล...</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="d-flex justify-content-between mt-4">
                <a href="index.html" class="btn btn-secondary">🏠 หน้าหลัก</a>
                <button class="btn btn-warning text-dark fw-bold" onclick="fetchStockData()">🔄 รีเฟรชข้อมูล</button>
            </div>
        </div>
    </div>

    <script>
        // --- 1. ตั้งค่าการเชื่อมต่อ Supabase ของคุณ ---
        const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // ใส่ URL ของคุณ
        const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // ใส่ Anon Key ของคุณ
        
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // --- 2. ฟังก์ชันดึงข้อมูลจากตาราง food_stocks ---
        async function fetchStockData() {
            const tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">กำลังโหลด...</td></tr>`;

            // ดึงข้อมูลจากตาราง food_stocks เรียงตาม id หรือ food_name
            const { data, error } = await supabaseClient
                .from('food_stocks')
                .select('*')
                .order('id', { ascending: true });

            if (error) {
                console.error('Error fetching stock:', error);
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
                return;
            }

            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">ไม่พบรายการวัตถุดิบในสต็อก</td></tr>`;
                return;
            }

            tbody.innerHTML = '';

            // วนลูปแสดงข้อมูลทุกตัว (ต่อให้ quantity เป็น 0 ก็จะแสดงขึ้นมาให้เห็น)
            data.forEach((item, index) => {
                let qtyBadge = item.quantity <= 0 
                    ? `<span class="badge bg-danger">หมด (0)</span>` 
                    : `<span class="badge bg-success">${item.quantity}</span>`;

                tbody.innerHTML += `
                    <tr>
                        <td class="text-center">${item.id}</td>
                        <td class="fw-semibold">${item.food_name}</td>
                        <td class="text-center">${qtyBadge}</td>
                        <td class="text-center">
                            <input type="number" id="add_qty_${item.id}" class="form-control form-control-sm text-center" value="1" min="1">
                        </td>
                        <td class="text-center">
                            <button class="btn btn-primary btn-sm" onclick="updateStock(${item.id}, ${item.quantity})">เติม</button>
                        </td>
                    </tr>
                `;
            });
        }

        // --- 3. ฟังก์ชันอัปเดต/เพิ่มจำนวนสต็อกลงตาราง food_stocks ---
        async function updateStock(id, currentQuantity) {
            const inputVal = document.getElementById(`add_qty_${id}`).value;
            const addAmount = parseInt(inputVal);

            if (isNaN(addAmount) || addAmount <= 0) {
                alert('กรุณากรอกจำนวนที่ต้องการเพิ่มให้ถูกต้อง');
                return;
            }

            const newQuantity = (Number(currentQuantity) || 0) + addAmount;

            // อัปเดตข้อมูลเข้าไปที่ตาราง food_stocks ใน Supabase
            const { error } = await supabaseClient
                .from('food_stocks')
                .update({ 
                    quantity: newQuantity, 
                    updated_at: new Date() 
                })
                .eq('id', id);

            if (error) {
                console.error('Error updating stock:', error);
                alert('ไม่สามารถอัปเดตสต็อกได้: ' + error.message);
                return;
            }

            alert(`เพิ่มสต็อกสำเร็จ (+${addAmount})`);
            fetchStockData(); // โหลดข้อมูลตารางใหม่ทันทีเพื่อให้ตัวเลขเป็นปัจจุบัน
        }

        // โหลดข้อมูลเมื่อเปิดหน้าเว็บ
        window.onload = fetchStockData;
    </script>

</body>
</html>
