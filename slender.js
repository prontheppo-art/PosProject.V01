// slender.js - ไฟล์กลางสำหรับปฏิทิน (อัปเดตเพิ่มวงกลมสีแดงรอบวันปัจจุบัน)
const CalendarSystem = {
    modalHTML: `
        <div id="calendarModal" class="fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-sm w-full p-4 shadow-2xl flex flex-col space-y-4">
                <div class="flex justify-between items-center px-2">
                    <button type="button" onclick="CalendarSystem.changeMonth(-1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 font-bold flex items-center justify-center text-sm">❮</button>
                    <h2 id="calMonthYearTitle" class="font-bold text-sm text-slate-800">เดือน ปี</h2>
                    <button type="button" onclick="CalendarSystem.changeMonth(1)" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 font-bold flex items-center justify-center text-sm">❯</button>
                </div>
                <div class="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400">
                    <div>อา</div><div>จ</div><div>อ</div><div>พ</div><div>พฤ</div><div>ศ</div><div>ส</div>
                </div>
                <div id="calDaysGrid" class="grid grid-cols-7 gap-1 text-center text-xs"></div>
                <div class="flex gap-2 pt-2 border-t">
                    <button type="button" onclick="CalendarSystem.selectToday()" class="flex-1 bg-emerald-50 text-emerald-700 font-bold py-2 rounded-xl text-xs hover:bg-emerald-100 border border-emerald-200">📅 วันนี้</button>
                    <button type="button" onclick="CalendarSystem.close()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs hover:bg-slate-200">ยกเลิก</button>
                </div>
            </div>
        </div>`,
    
    activeYear: new Date().getFullYear(),
    activeMonth: new Date().getMonth(),
    onDateSelected: null,

    init(callback) {
        this.onDateSelected = callback;
        if (!document.getElementById('calendarModal')) {
            document.body.insertAdjacentHTML('beforeend', this.modalHTML);
        }
    },

    open(currentDate) {
        let date = currentDate ? new Date(currentDate) : new Date();
        this.activeYear = date.getFullYear();
        this.activeMonth = date.getMonth();
        this.render();
        document.getElementById('calendarModal').classList.remove('hidden');
    },

    close() { document.getElementById('calendarModal').classList.add('hidden'); },

    changeMonth(dir) {
        this.activeMonth += dir;
        if (this.activeMonth > 11) { this.activeMonth = 0; this.activeYear++; }
        else if (this.activeMonth < 0) { this.activeMonth = 11; this.activeYear--; }
        this.render();
    },

    selectToday() {
        let d = new Date();
        this.onDateSelected(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        this.close();
    },

    render() {
        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        document.getElementById('calMonthYearTitle').textContent = `${thaiMonths[this.activeMonth]} ${this.activeYear + 543}`;
        const grid = document.getElementById('calDaysGrid');
        grid.innerHTML = '';
        
        let firstDay = new Date(this.activeYear, this.activeMonth, 1).getDay();
        let totalDays = new Date(this.activeYear, this.activeMonth + 1, 0).getDate();

        // วันที่ปัจจุบันของระบบ (ใช้เทียบเพื่อทำวงกลมสีแดง)
        let now = new Date();
        let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

        for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));
        
        for(let d=1; d<=totalDays; d++) {
            let dStr = `${this.activeYear}-${String(this.activeMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'h-9 w-9 mx-auto rounded-full font-bold text-xs flex items-center justify-center transition ';
            btn.textContent = d;

            let isToday = (dStr === todayStr);

            // เช็คเงื่อนไขใส่กรอบ/วงกลมสีแดงให้วันปัจจุบัน
            if (isToday) {
                btn.className += ' border-2 border-rose-500 text-rose-600 bg-rose-50 ';
            } else {
                btn.className += ' text-slate-700 hover:bg-slate-100';
            }

            btn.onclick = () => { this.onDateSelected(dStr); this.close(); };
            grid.appendChild(btn);
        }
    }
};
