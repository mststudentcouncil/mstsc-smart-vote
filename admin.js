import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, updateDoc, doc, getDoc, deleteDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

window.liveResultListeners = {};
window.globalStudents = []; 

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; } 
    else { document.getElementById("adminEmail").innerText = `${user.email}`; checkStudentCount(); }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

document.getElementById("voterTargetType").addEventListener("change", (e) => {
    document.getElementById("customLevelContainer").classList.add("hidden");
    document.getElementById("customRoomContainer").classList.add("hidden");
    if(e.target.value === "custom_level") document.getElementById("customLevelContainer").classList.remove("hidden");
    if(e.target.value === "custom_room") document.getElementById("customRoomContainer").classList.remove("hidden");
});

const optionsContainer = document.getElementById("optionsContainer");
const addOptionBtn = document.getElementById("addOptionBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const formTitle = document.getElementById("formTitle");
const submitCampaignBtn = document.getElementById("submitCampaignBtn");

addOptionBtn.addEventListener("click", () => {
    const div = document.createElement("div");
    div.className = "option-group bg-white p-3 rounded-lg border border-gray-200 shadow-sm relative mt-3";
    div.innerHTML = `
        <button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-btn bg-red-50 p-1 rounded-md" title="ลบตัวเลือก"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
        <input type="text" class="opt-name w-full border-b border-gray-200 pb-1 mb-2 pr-8 focus:outline-none focus:border-purple-600 text-sm font-medium" placeholder="รายชื่อหรือตัวเลือกเพิ่มเติม (บังคับ)" required>
        <input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none" placeholder="ลิงก์รูปภาพ (ไม่บังคับ)">
    `;
    optionsContainer.appendChild(div);
});

optionsContainer.addEventListener("click", (e) => {
    if (e.target.closest('.remove-btn')) { e.target.closest('.option-group').remove(); }
});

function formatImageUrl(url) {
    if (!url) return "";
    const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
    if (gdMatch) {
        return `https://drive.google.com/uc?export=view&id=${gdMatch[1]}`;
    }
    return url;
}

// ----------------- ก๊อปปี้ไปทับฟังก์ชันการกดบันทึกฟอร์มเดิม -----------------
const form = document.getElementById("createCampaignForm");
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editingId = document.getElementById("editingId").value;
    const title = document.getElementById("title").value;
    const desc = document.getElementById("desc").value;
    const endTime = document.getElementById("endTime").value;
    
    // จัดการข้อมูลกลุ่มเป้าหมาย
    const targetType = document.getElementById("voterTargetType").value;
    let targetValues = [];
    if (targetType === "custom_level") {
        targetValues = Array.from(document.querySelectorAll("input[name='targetLevel']:checked")).map(cb => cb.value);
        if(targetValues.length === 0) { Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับชั้นอย่างน้อย 1 ระดับ', 'warning'); return; }
    } else if (targetType === "custom_room") {
        const rawRooms = document.getElementById("customRoomInput").value;
        targetValues = rawRooms.split(",").map(r => r.trim()).filter(r => r !== "");
        if(targetValues.length === 0) { Swal.fire('แจ้งเตือน', 'กรุณาระบุห้องเรียนอย่างน้อย 1 ห้อง (เช่น ม.1/1)', 'warning'); return; }
    }

    const optionGroups = document.querySelectorAll(".option-group");
    let optionsData = [];
    let initialVotes = {};

    optionGroups.forEach(group => {
        const name = group.querySelector(".opt-name").value.trim();
        let img = group.querySelector(".opt-img").value.trim();
        img = formatImageUrl(img);
        if (name !== "") {
            optionsData.push({ name: name, image: img });
            initialVotes[name] = 0;
        }
    });

    if (optionsData.length < 2) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ต้องมีอย่างน้อย 2 ตัวเลือก', confirmButtonColor: '#6b21a8' }); return;
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

    // สร้างข้อมูลพื้นฐาน (ไม่ใส่ status เพื่อป้องกันบั๊ก undefined ใน Firebase)
    const payload = {
        title: title, 
        description: desc, 
        endTime: endTime || null, 
        options: optionsData, 
        allowed_voters: { type: targetType, values: targetValues }
    };

    try {
        if (editingId) {
            // กรณี "แก้ไข" รายการเดิม
            const campRef = doc(db, "campaigns", editingId);
            const docSnap = await getDoc(campRef);
            let oldVotes = docSnap.data().votes_count || {};
            
            // ดึงคะแนนเดิมมาใส่ เพื่อไม่ให้คะแนนหายตอนกดแก้ไขชื่อหรือรูปภาพ
            optionsData.forEach(opt => { 
                if (oldVotes[opt.name] !== undefined) initialVotes[opt.name] = oldVotes[opt.name]; 
            });
            payload.votes_count = initialVotes;
            
            await updateDoc(campRef, payload);
            Swal.fire('สำเร็จ', 'แก้ไขรายการเรียบร้อยแล้ว', 'success');
            
        } else {
            // กรณี "สร้าง" รายการใหม่
            payload.votes_count = initialVotes;
            payload.status = "open"; // กำหนดสถานะให้ตอนสร้างใหม่เท่านั้น
            payload.createdAt = serverTimestamp();
            
            await addDoc(collection(db, "campaigns"), payload);
            Swal.fire('สำเร็จ', 'สร้างรายการลงคะแนนเรียบร้อยแล้ว', 'success');
        }
        
        resetForm(); 
        loadCampaigns();
    } catch (error) { 
        console.error("Save Error: ", error);
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง', confirmButtonColor: '#6b21a8' }); 
    }
});
// ----------------- สิ้นสุดการก๊อปปี้ -----------------

function resetForm() {
    form.reset(); document.getElementById("editingId").value = "";
    document.getElementById("customLevelContainer").classList.add("hidden"); document.getElementById("customRoomContainer").classList.add("hidden");
    formTitle.innerText = "สร้างรายการลงคะแนน"; submitCampaignBtn.innerHTML = "บันทึกและเปิดระบบ"; cancelEditBtn.classList.add("hidden");
    optionsContainer.innerHTML = `<div class="option-group bg-white p-3 rounded-lg border border-gray-200 shadow-sm relative"><input type="text" class="opt-name w-full border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-purple-600 text-sm font-medium" placeholder="รายชื่อหรือตัวเลือกที่ 1 (บังคับ)" required><input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none" placeholder="ลิงก์รูปภาพ (ไม่บังคับ)"></div><div class="option-group bg-white p-3 rounded-lg border border-gray-200 shadow-sm relative"><input type="text" class="opt-name w-full border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-purple-600 text-sm font-medium" placeholder="รายชื่อหรือตัวเลือกที่ 2 (บังคับ)" required><input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none" placeholder="ลิงก์รูปภาพ (ไม่บังคับ)"></div>`;
}

cancelEditBtn.addEventListener("click", resetForm);

window.editCampaign = async function(campaignId) {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
    try {
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("editingId").value = campaignId;
            document.getElementById("title").value = data.title;
            document.getElementById("desc").value = data.description;
            document.getElementById("endTime").value = data.endTime || "";

            if(data.allowed_voters) {
                document.getElementById("voterTargetType").value = data.allowed_voters.type;
                document.getElementById("voterTargetType").dispatchEvent(new Event('change'));
                if(data.allowed_voters.type === 'custom_level') {
                    document.querySelectorAll("input[name='targetLevel']").forEach(cb => { cb.checked = data.allowed_voters.values.includes(cb.value); });
                } else if(data.allowed_voters.type === 'custom_room') {
                    document.getElementById("customRoomInput").value = data.allowed_voters.values.join(", ");
                }
            }

            optionsContainer.innerHTML = "";
            data.options.forEach((opt, index) => {
                const div = document.createElement("div"); div.className = "option-group bg-white p-3 rounded-lg border border-gray-200 shadow-sm relative mt-3";
                div.innerHTML = `${index > 1 ? `<button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-btn bg-red-50 p-1 rounded-md" title="ลบตัวเลือก"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}<input type="text" class="opt-name w-full border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-purple-600 text-sm font-medium" value="${opt.name}" required><input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none" value="${opt.image || ''}">`;
                optionsContainer.appendChild(div);
            });

            formTitle.innerText = "แก้ไขรายการลงคะแนน"; submitCampaignBtn.innerHTML = "บันทึกการแก้ไข"; cancelEditBtn.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: 'smooth' }); Swal.close();
        }
    } catch (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถดึงข้อมูลมาแก้ไขได้', 'error'); }
}

window.loadCampaigns = async function() {
    const campaignList = document.getElementById("campaignList");
    campaignList.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-800"></div></div>';
    try {
        const q = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        campaignList.innerHTML = "";

        if (querySnapshot.empty) {
            campaignList.innerHTML = '<div class="bg-white p-10 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500">ไม่มีรายการลงคะแนนในระบบ</div>'; return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data(); const id = docSnap.id;
            const groupSvg = `<svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;

            let targetBadge = `<span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded ml-2 border border-blue-200 flex items-center gap-1">${groupSvg} ทุกคน</span>`;
            if(data.allowed_voters) {
                const type = data.allowed_voters.type; const vals = data.allowed_voters.values;
                if(type === 'junior') targetBadge = `<span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded ml-2 border border-blue-200 flex items-center gap-1">${groupSvg} ม.ต้น</span>`;
                else if(type === 'senior') targetBadge = `<span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded ml-2 border border-blue-200 flex items-center gap-1">${groupSvg} ม.ปลาย</span>`;
                else if(type === 'custom_level') targetBadge = `<span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded ml-2 border border-blue-200 flex items-center gap-1">${groupSvg} ชั้น ${vals.join(', ')}</span>`;
                else if(type === 'custom_room') targetBadge = `<span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded ml-2 border border-blue-200 flex items-center gap-1" title="${vals.join(', ')}">${groupSvg} เฉพาะบางห้อง</span>`;
            }

            const statusBadge = data.status === "open" ? `<span class="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-md border border-green-200"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"></circle></svg> เปิดระบบ</span>` : `<span class="flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-md border border-gray-200"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"></circle></svg> ปิดระบบ</span>`;
            const toggleBtnText = data.status === "open" ? "ปิดระบบลงคะแนน" : "เปิดระบบอีกครั้ง";
            const toggleBtnClass = data.status === "open" ? "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300" : "bg-green-50 hover:bg-green-100 text-green-700 border-green-200";

            // แปลงรูปแบบเวลาให้สวยงาม
            let endTimeText = '';
            if (data.endTime) {
                const endDate = new Date(data.endTime);
                endTimeText = `<div class="text-xs font-semibold text-purple-700 bg-purple-50 inline-block px-2 py-1 rounded border border-purple-100 mb-4 flex items-center gap-1 w-fit"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> สิ้นสุด: ${endDate.toLocaleString('th-TH', {dateStyle: 'medium', timeStyle: 'short'})} น.</div>`;
            }

            let optionsHtml = '<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">';
            data.options.forEach(opt => { 
                const placeholder = "https://placehold.co/400x400/f3f4f6/a8a29e?text=No+Image";
                const imgTag = opt.image ? `<img src="${opt.image}" onclick="viewImage(event, '${opt.image}', '${opt.name}')" class="w-16 h-16 object-cover rounded-lg mb-2 border border-gray-200 cursor-zoom-in hover:opacity-80 transition-opacity" onerror="this.onerror=null;this.src='${placeholder}';">` : '';
                optionsHtml += `<div class="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center flex flex-col justify-center items-center">${imgTag}<span class="text-sm font-semibold text-gray-800">${opt.name}</span></div>`; 
            });
            optionsHtml += '</div>';

            const editIconSvg = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`;

            campaignList.innerHTML += `
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-2"><h3 class="font-bold text-lg text-purple-900 flex items-center flex-wrap">${data.title} ${targetBadge}</h3>${statusBadge}</div>
                    ${endTimeText}
                    <p class="text-gray-500 text-sm mb-4">${data.description || 'ไม่มีคำอธิบาย'}</p>
                    ${optionsHtml}
                    <div id="results_${id}" class="hidden bg-gray-50 p-5 rounded-lg mt-6 border border-gray-200 shadow-inner"></div>
                    <div class="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-100">
                        <button onclick="viewResults('${id}')" class="flex items-center gap-1 text-sm bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 rounded-lg font-medium transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> ผลคะแนนและสถิติ</button>
                        <button onclick="editCampaign('${id}')" class="flex items-center gap-1 text-sm bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 px-4 py-2 rounded-lg font-medium transition-colors">${editIconSvg} แก้ไข</button>
                        <button onclick="toggleStatus('${id}', '${data.status}')" class="text-sm ${toggleBtnClass} px-4 py-2 rounded-lg font-medium transition-colors border">${toggleBtnText}</button>
                        <button onclick="deleteCampaign('${id}')" class="flex items-center gap-1 text-sm bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-medium transition-colors ml-auto">ลบรายการ</button>
                    </div>
                </div>
            `;
        });
    } catch (error) { campaignList.innerHTML = '<p class="text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>'; }
}

window.toggleStatus = async function(campaignId, currentStatus) {
    const newStatus = currentStatus === "open" ? "closed" : "open";
    try { await updateDoc(doc(db, "campaigns", campaignId), { status: newStatus }); loadCampaigns(); } catch (error) {}
}

window.deleteCampaign = async function(campaignId) {
    Swal.fire({ title: 'ยืนยันการลบ', text: "หากลบแล้ว ข้อมูลคะแนนทั้งหมดจะไม่สามารถกู้คืนได้", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#6b7280', confirmButtonText: 'ยืนยันการลบ', cancelButtonText: 'ยกเลิก' })
    .then(async (result) => {
        if (result.isConfirmed) {
            try { await deleteDoc(doc(db, "campaigns", campaignId)); Swal.fire('สำเร็จ', 'ลบรายการเรียบร้อยแล้ว', 'success'); loadCampaigns(); } 
            catch (error) { Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบรายการ', 'error'); }
        }
    });
}

function isStudentEligible(campaignRules, studentInfo) {
    if (!campaignRules) return true; 
    const { type, values } = campaignRules;
    const stuLevel = (studentInfo.level || "").replace(/[mM]\./, 'ม.'); 
    const stuRoom = studentInfo.room || ""; 
    
    if (type === "all") return true;
    if (type === "junior") return ["ม.1", "ม.2", "ม.3"].includes(stuLevel);
    if (type === "senior") return ["ม.4", "ม.5", "ม.6"].includes(stuLevel);
    if (type === "custom_level") return values.includes(stuLevel);
    if (type === "custom_room") return values.some(val => val.replace(/\s/g, '') === stuRoom.replace(/\s/g, ''));
    return false;
}

window.viewResults = async function(campaignId) {
    const resultDiv = document.getElementById(`results_${campaignId}`);
    if (!resultDiv.classList.contains('hidden')) { 
        resultDiv.classList.add('hidden'); 
        return; 
    }
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<div class="text-center py-4 text-purple-700 font-medium animate-pulse">กำลังโหลดผลคะแนนและประมวลผลสถิติแยกชั้น...</div>';

    const loadData = async () => {
        try {
            const docSnap = await getDoc(doc(db, "campaigns", campaignId));
            if (!docSnap.exists()) {
                resultDiv.innerHTML = '<div class="text-center text-red-500">ไม่พบข้อมูล</div>';
                return;
            }

            const data = docSnap.data();
            const votes = data.votes_count;
            const title = data.title;
            
            const votersSnap = await getDocs(collection(db, "campaigns", campaignId, "voters"));
            let votedByRoom = {};
            votersSnap.forEach(v => {
                let r = v.data().room || "ไม่ระบุ";
                votedByRoom[r] = (votedByRoom[r] || 0) + 1;
            });

            let eligibleByRoom = {};
            if(window.globalStudents) {
                window.globalStudents.forEach(s => {
                    if(isStudentEligible(data.allowed_voters, s)) {
                        let r = s.room || "ไม่ระบุ";
                        eligibleByRoom[r] = (eligibleByRoom[r] || 0) + 1;
                    }
                });
            }

            let statsByLevel = {};
            let sortedRooms = Object.keys(eligibleByRoom).sort((a,b) => a.localeCompare(b, 'th', {numeric:true}));
            sortedRooms.forEach(r => {
                let levelMatch = r.match(/ม\.(\d)/);
                let level = levelMatch ? `ม.${levelMatch[1]}` : 'อื่นๆ';
                if(!statsByLevel[level]) statsByLevel[level] = [];
                statsByLevel[level].push(r);
            });

            let resultHtml = `
                <div class="flex items-center justify-between mb-4 border-b border-gray-200 pb-3">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-gray-800">สรุปผลคะแนน</h4>
                        <button onclick="document.getElementById('refreshBtn_${campaignId}').click()" class="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1" id="refreshBtn_${campaignId}">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> อัปเดต
                        </button>
                    </div>
                    <div class="flex gap-2 items-center">
                        <button onclick="exportExcel('${campaignId}')" class="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md shadow-sm hidden sm:block">Excel</button>
                        <button onclick="exportPDF('${campaignId}')" class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md shadow-sm hidden sm:block">PDF</button>
                        <button onclick="document.getElementById('results_${campaignId}').classList.add('hidden')" class="ml-2 bg-gray-200 hover:bg-gray-300 text-gray-600 p-1.5 rounded-md transition-colors" title="ปิดหน้าต่างสถิติ">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
                
                <div id="pdf-content-${campaignId}" class="bg-white p-2 pb-6">
                    <h2 class="text-center font-bold text-purple-900 mb-4 hidden print-title">${title}</h2>
                    <h4 class="font-bold text-gray-800 mb-3 border-b pb-2">คะแนนรวมทั้งหมด</h4>
                    <ul class="space-y-4 mb-6">
            `;
            
            let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            const sortedVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);

            sortedVotes.forEach(([option, count], index) => {
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                const barColor = index === 0 && count > 0 ? "bg-purple-600" : "bg-gray-400"; 
                resultHtml += `
                    <li>
                        <div class="flex justify-between text-sm mb-1"><span class="font-bold text-gray-700">${option}</span><span class="font-semibold text-gray-800">${count} คะแนน <span class="text-gray-500 font-normal">(${percent}%)</span></span></div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5"><div class="${barColor} h-2.5 rounded-full transition-all duration-700 ease-out" style="width: ${percent}%"></div></div>
                    </li>
                `;
            });
            resultHtml += `</ul><p class="text-sm text-gray-600 mt-2 text-right font-medium">จำนวนผู้ใช้สิทธิ์ทั้งหมด: <span class="font-bold text-purple-700">${totalVotes}</span> คน</p>`;

            let levels = Object.keys(statsByLevel).sort();
            if (levels.length === 0) {
                resultHtml += `<div class="mt-8 border-t border-gray-200 pt-4"><p class="text-center text-gray-500">กรุณากดตรวจสอบฐานข้อมูลด้านซ้ายมือก่อนดูสถิติรายห้อง</p></div>`;
            } else {
                levels.forEach((level) => {
                    resultHtml += `
                        <div class="html2pdf__page-break"></div> 
                        <div class="mt-8 pt-6 border-t border-gray-300 page-break-section">
                            <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2">สถิติการใช้สิทธิ์ ชั้น ${level}</h4>
                            <div class="rounded-lg border border-gray-200">
                                <table class="w-full text-xs text-left border-collapse">
                                    <thead class="bg-gray-100">
                                        <tr><th class="p-2 border-b">ห้องเรียน</th><th class="p-2 border-b text-center">มีสิทธิ์ (คน)</th><th class="p-2 border-b text-center">มาโหวต (คน)</th><th class="p-2 border-b text-center">คิดเป็น %</th></tr>
                                    </thead>
                                    <tbody>
                    `;
                    
                    statsByLevel[level].forEach(r => {
                        let eligible = eligibleByRoom[r];
                        let voted = votedByRoom[r] || 0;
                        let pct = eligible > 0 ? Math.round((voted/eligible)*100) : 0;
                        let pctColor = pct === 100 ? 'text-green-600' : (pct >= 50 ? 'text-blue-600' : 'text-red-500');
                        resultHtml += `<tr><td class="p-2 border-b font-medium">${r}</td><td class="p-2 border-b text-center">${eligible}</td><td class="p-2 border-b text-center font-bold text-gray-800">${voted}</td><td class="p-2 border-b text-center font-bold ${pctColor}">${pct}%</td></tr>`;
                    });

                    let totalLevelEligible = statsByLevel[level].reduce((sum, r) => sum + eligibleByRoom[r], 0);
                    let totalLevelVoted = statsByLevel[level].reduce((sum, r) => sum + (votedByRoom[r] || 0), 0);
                    let totalLevelPct = totalLevelEligible > 0 ? Math.round((totalLevelVoted/totalLevelEligible)*100) : 0;
                    resultHtml += `
                                    <tr class="bg-blue-50 font-bold">
                                        <td class="p-2 border-t text-blue-900">รวม ${level}</td>
                                        <td class="p-2 border-t text-center text-blue-900">${totalLevelEligible}</td>
                                        <td class="p-2 border-t text-center text-blue-900">${totalLevelVoted}</td>
                                        <td class="p-2 border-t text-center text-blue-700">${totalLevelPct}%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>`;
                });
            }

            resultHtml += `</div>
                <div class="mt-4 pt-4 border-t border-gray-200 text-center">
                    <button onclick="document.getElementById('results_${campaignId}').classList.add('hidden')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 mx-auto">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg> ย่อหน้าต่างสถิติ
                    </button>
                </div>
            `; 
            resultDiv.innerHTML = resultHtml;

            document.getElementById(`refreshBtn_${campaignId}`).addEventListener('click', () => {
                resultDiv.innerHTML = '<div class="text-center py-4 text-purple-700 font-medium animate-pulse">กำลังอัปเดตข้อมูล...</div>';
                loadData();
            });

        } catch (error) {
            console.error(error);
            resultDiv.innerHTML = '<div class="text-center py-4 text-red-500 font-medium">เกิดข้อผิดพลาดในการโหลดผลคะแนน</div>';
        }
    };

    loadData(); 
}

// ================= ระบบส่งออก EXCEL (แยกชีทตามระดับชั้น) =================
window.exportExcel = async function(campaignId) {
    try {
        Swal.fire({ title: 'กำลังสร้างไฟล์ Excel...', text: 'ระบบกำลังแยกข้อมูลรายชั้น...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            const votes = data.votes_count;
            const safeTitle = data.title.replace(/[/\\?%*:|"<>]/g, '-'); 
            
            const wb = XLSX.utils.book_new();

            // ชีท 1: สรุปผลโหวตรวม
            let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            let summaryData = [
                ["หัวข้อการลงคะแนน:", data.title], [""],
                ["--- สรุปคะแนนผู้สมัคร ---", "", ""],
                ["ตัวเลือก / ผู้สมัคร", "คะแนนโหวต (คน)", "คิดเป็นเปอร์เซ็นต์ (%)"]
            ];
            Object.entries(votes).sort((a, b) => b[1] - a[1]).forEach(([option, count]) => {
                const percent = totalVotes === 0 ? 0 : ((count / totalVotes) * 100).toFixed(2);
                summaryData.push([option, count, percent + "%"]);
            });
            summaryData.push(["", "", ""]); 
            summaryData.push(["รวมผู้ใช้สิทธิ์ทั้งหมด", totalVotes, "100%"]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "สรุปผลโหวต");

            // ดึงข้อมูลเตรียมแยกชั้น
            const votersSnap = await getDocs(collection(db, "campaigns", campaignId, "voters"));
            let votedByRoom = {};
            votersSnap.forEach(v => {
                let r = v.data().room || "ไม่ระบุ";
                votedByRoom[r] = (votedByRoom[r] || 0) + 1;
            });

            let eligibleByRoom = {};
            if(window.globalStudents) {
                window.globalStudents.forEach(s => {
                    if(isStudentEligible(data.allowed_voters, s)) {
                        let r = s.room || "ไม่ระบุ";
                        eligibleByRoom[r] = (eligibleByRoom[r] || 0) + 1;
                    }
                });
            }

            let statsByLevel = {};
            let sortedRooms = Object.keys(eligibleByRoom).sort((a,b) => a.localeCompare(b, 'th', {numeric:true}));
            sortedRooms.forEach(r => {
                let levelMatch = r.match(/ม\.(\d)/);
                let level = levelMatch ? `ม.${levelMatch[1]}` : 'อื่นๆ';
                if(!statsByLevel[level]) statsByLevel[level] = [];
                statsByLevel[level].push(r);
            });

            // สร้างชีทใหม่สำหรับแต่ละระดับชั้น
            let levels = Object.keys(statsByLevel).sort();
            levels.forEach(level => {
                let levelData = [
                    [`สถิติการใช้สิทธิ์ ชั้น ${level}`],
                    ["ห้องเรียน", "จำนวนผู้มีสิทธิ์ (คน)", "มาใช้สิทธิ์ (คน)", "คิดเป็นเปอร์เซ็นต์ (%)"]
                ];
                
                let totalLevelEligible = 0;
                let totalLevelVoted = 0;

                statsByLevel[level].forEach(r => {
                    let eligible = eligibleByRoom[r];
                    let voted = votedByRoom[r] || 0;
                    let pct = eligible > 0 ? ((voted/eligible)*100).toFixed(2) : 0;
                    
                    totalLevelEligible += eligible;
                    totalLevelVoted += voted;

                    levelData.push([r, eligible, voted, pct + "%"]);
                });
                
                let totalPct = totalLevelEligible > 0 ? ((totalLevelVoted/totalLevelEligible)*100).toFixed(2) : 0;
                levelData.push(["", "", "", ""]);
                levelData.push([`รวม ${level}`, totalLevelEligible, totalLevelVoted, totalPct + "%"]);

                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(levelData), `สถิติ_${level}`);
            });
            
            XLSX.writeFile(wb, `ผลโหวต_${safeTitle}.xlsx`);
            Swal.close();
        }
    } catch (error) { 
        console.error(error); Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel', 'error'); 
    }
}

// ================= ระบบส่งออก PDF (แก้ให้จัดหน้าสมบูรณ์) =================
window.exportPDF = async function(campaignId) {
    try {
        Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', text: 'กำลังจัดหน้ากระดาษแยกตามระดับชั้น', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        let title = "รายงานผลคะแนน";
        if (docSnap.exists()) { title = docSnap.data().title.replace(/[/\\?%*:|"<>]/g, '-'); }

        const element = document.getElementById(`pdf-content-${campaignId}`);
        element.querySelector('.print-title').classList.remove('hidden');
        
        const opt = { 
            margin: [10, 10, 10, 10], 
            filename: `ผลโหวต_${title}.pdf`, 
            image: { type: 'jpeg', quality: 0.98 }, 
            html2canvas: { scale: 2 }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] } // บังคับให้ระบบรู้จักคำสั่งแบ่งหน้า
        };
        
        html2pdf().set(opt).from(element).save().then(() => { 
            element.querySelector('.print-title').classList.add('hidden'); 
            Swal.close();
        }).catch(err => { console.error(err); Swal.fire('ผิดพลาด', 'บันทึก PDF ไม่สำเร็จ', 'error'); });
    } catch (error) { console.error(error); Swal.fire('ผิดพลาด', 'ระบบ PDF ขัดข้อง', 'error'); }
}

window.viewImage = function(e, imageUrl, title) {
    e.preventDefault(); e.stopPropagation();
    Swal.fire({ title: title, imageUrl: imageUrl, imageAlt: title, showCloseButton: true, showConfirmButton: false, customClass: { image: 'rounded-xl object-contain max-h-[70vh]' } });
}

async function checkStudentCount() {
    try { 
        const querySnapshot = await getDocs(collection(db, "students"));
        let count = querySnapshot.size;
        let lastUpdated = null;

        window.globalStudents = []; 
        
        querySnapshot.forEach(doc => {
            const data = doc.data();
            window.globalStudents.push({ id: doc.id, ...data });
            if (data.updated_at && (!lastUpdated || data.updated_at.toMillis() > lastUpdated.toMillis())) {
                lastUpdated = data.updated_at;
            }
        });

        let dateStr = "ยังไม่มีข้อมูล";
        if (lastUpdated) {
            const d = lastUpdated.toDate();
            dateStr = d.toLocaleString('th-TH');
        }

        document.getElementById("lastUpdatedText").innerHTML = `มีนักเรียนในระบบ: <span class="font-bold text-blue-700">${count}</span> คน<br><span class="text-[10px] text-gray-500">อัปเดตล่าสุด: ${dateStr}</span>`;
    } 
    catch (error) { document.getElementById("lastUpdatedText").innerText = "เกิดข้อผิดพลาดในการโหลดข้อมูล"; }
}

window.showStudentsInRoom = function(roomName) {
    if (!window.globalStudents) return;
    let studentsInRoom = window.globalStudents.filter(s => s.room === roomName).sort((a, b) => a.id.localeCompare(b.id));
    
    let listHtml = `<ul class="text-left text-sm space-y-2 mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">`;
    studentsInRoom.forEach(s => {
        listHtml += `<li class="border-b border-gray-200 pb-1 last:border-0"><span class="font-mono text-purple-700 font-bold mr-2">${s.id}</span> ${s.name}</li>`;
    });
    listHtml += `</ul>`;

    Swal.fire({
        title: `รายชื่อนักเรียนห้อง ${roomName}`,
        html: `<p class="text-sm text-gray-600">จำนวนทั้งหมด: ${studentsInRoom.length} คน</p>` + listHtml,
        showCancelButton: true, confirmButtonColor: '#6b21a8', cancelButtonColor: '#6b7280', confirmButtonText: 'ปิดหน้าต่าง', cancelButtonText: 'กลับไปหน้าสรุป'
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) { document.getElementById("viewDatabaseBtn").click(); }
    });
}

document.getElementById("viewDatabaseBtn").addEventListener("click", () => {
    if (!window.globalStudents || window.globalStudents.length === 0) {
        Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูลนักเรียนในระบบ กรุณานำเข้าข้อมูลก่อนครับ', 'info'); return;
    }

    let roomStats = {};
    window.globalStudents.forEach(s => {
        let r = s.room || "ไม่ระบุ";
        roomStats[r] = (roomStats[r] || 0) + 1;
    });

    let sortedRooms = Object.keys(roomStats).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

    let tableHtml = `<div class="max-h-64 overflow-y-auto mt-4 rounded-lg border border-gray-200"><table class="w-full text-sm text-left border-collapse"><thead class="bg-gray-100 sticky top-0 shadow-sm"><tr><th class="p-2 border-b">ห้องเรียน</th><th class="p-2 border-b text-center">จำนวน (คน)</th><th class="p-2 border-b text-center">รายชื่อ</th></tr></thead><tbody>`;
    sortedRooms.forEach(r => { 
        tableHtml += `<tr>
            <td class="p-2 border-b font-medium">${r}</td>
            <td class="p-2 border-b text-center text-blue-600 font-bold">${roomStats[r]}</td>
            <td class="p-2 border-b text-center"><button onclick="showStudentsInRoom('${r}')" class="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded transition-colors">ดูรายชื่อ</button></td>
        </tr>`; 
    });
    tableHtml += `</tbody></table></div>`;

    Swal.fire({
        title: 'สถิติฐานข้อมูลนักเรียน',
        html: `<p class="text-sm text-gray-600">นักเรียนทั้งหมดที่มีสิทธิ์ในระบบ: <b class="text-lg text-purple-700">${window.globalStudents.length}</b> คน</p>` + tableHtml,
        confirmButtonColor: '#6b21a8',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
});

document.getElementById("importStudentsBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("excelFileInput");
    const files = fileInput.files;

    if (files.length === 0) { Swal.fire('ข้อผิดพลาด', 'กรุณากดเลือกไฟล์ Excel หรือ CSV อย่างน้อย 1 ไฟล์ก่อนครับ', 'warning'); return; }

    Swal.fire({ title: 'กำลังประมวลผลไฟล์...', html: 'ระบบกำลังอ่านข้อมูลจากทุกแผ่นงาน (Sheet)<br>กรุณารอสักครู่ ห้ามปิดหน้าจอ', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

    let allStudents = [];
    const processFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                    workbook.SheetNames.forEach(sheetName => {
                        let currentLevel = "ไม่ระบุ";
                        let levelMatch = sheetName.match(/[mม]\.?\s*(\d)/i);
                        if (levelMatch) currentLevel = `ม.${levelMatch[1]}`;

                        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
                        let currentRoom = "ไม่ระบุ";

                        for (let row of rows) {
                            if (!row || row.length === 0) continue;

                            let roomCell = row.find(c => typeof c === 'string' && c.includes('ห้อง ม.'));
                            if (roomCell) {
                                currentRoom = roomCell.replace('ห้อง', '').trim();
                                let lvlMatch = currentRoom.match(/ม\.(\d)/);
                                if (lvlMatch) currentLevel = `ม.${lvlMatch[1]}`;
                            }

                            let idIndex = row.findIndex(c => (typeof c === 'string' || typeof c === 'number') && /^\d{5}$/.test(c.toString().trim()));
                            if (idIndex !== -1) {
                                let studentId = row[idIndex].toString().trim();
                                let title = row[idIndex + 1] ? row[idIndex + 1].toString().trim() : "";
                                let fname = row[idIndex + 2] ? row[idIndex + 2].toString().trim() : "";
                                let lname = row[idIndex + 3] ? row[idIndex + 3].toString().trim() : "";
                                
                                let fullName = (row.length > idIndex + 4 && row[idIndex + 4] && row[idIndex + 4].toString().includes(fname)) ? row[idIndex + 4].toString().trim() : `${title}${fname} ${lname}`.trim();
                                fullName = fullName.replace(/['"]/g, '');

                                let rowRoom = row.find(c => typeof c === 'string' && c.match(/^ม\.\d\/\d+/));
                                if (rowRoom) currentRoom = rowRoom.trim();

                                if (studentId && fullName.length > 5) { 
                                    allStudents.push({ id: studentId, name: fullName, room: currentRoom, level: currentLevel });
                                }
                            }
                        }
                    });
                    resolve();
                } catch (err) { resolve(); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    try {
        for (let file of files) await processFile(file);
        if (allStudents.length === 0) { Swal.fire('ข้อผิดพลาด', 'ไม่พบรายชื่อนักเรียนในรูปแบบที่ถูกต้อง', 'error'); return; }

        const uniqueStudentsMap = new Map();
        allStudents.forEach(item => uniqueStudentsMap.set(item.id, item));
        const uniqueStudents = Array.from(uniqueStudentsMap.values());

        Swal.fire({ title: 'กำลังอัปโหลดขึ้นเซิร์ฟเวอร์...', html: `พบรายชื่อนักเรียน ${uniqueStudents.length} คน<br>ระบบกำลังบันทึกข้อมูล`, allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

        let batch = writeBatch(db);
        let count = 0;
        for (let i = 0; i < uniqueStudents.length; i++) {
            batch.set(doc(db, "students", uniqueStudents[i].id), { name: uniqueStudents[i].name, room: uniqueStudents[i].room, level: uniqueStudents[i].level, updated_at: serverTimestamp() });
            count++;
            if (count === 490 || i === uniqueStudents.length - 1) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        
        Swal.fire('สำเร็จ!', `นำเข้าข้อมูลนักเรียนจำนวน ${uniqueStudents.length} คน เรียบร้อยแล้ว`, 'success');
        fileInput.value = ""; checkStudentCount();
    } catch (error) { console.error(error); Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error'); }
});

document.getElementById("deleteStudentsBtn").addEventListener("click", () => {
    Swal.fire({ title: 'ยืนยันการลบฐานข้อมูล?', text: "รายชื่อทั้งหมดจะถูกลบ", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#6b7280', confirmButtonText: 'ลบทิ้งทั้งหมด', cancelButtonText: 'ยกเลิก' })
    .then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังลบข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            try {
                const querySnapshot = await getDocs(collection(db, "students"));
                let batch = writeBatch(db);
                let count = 0;
                querySnapshot.forEach((document) => { 
                    batch.delete(doc(db, "students", document.id)); 
                    count++; 
                    if (count === 490) { batch.commit(); batch = writeBatch(db); count = 0; } 
                });
                await batch.commit();
                Swal.fire('ลบสำเร็จ', 'ข้อมูลนักเรียนทั้งหมดถูกล้างแล้ว', 'success'); checkStudentCount();
            } catch (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error'); }
        }
    });
});

loadCampaigns();