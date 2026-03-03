// admin.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, updateDoc, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        document.getElementById("adminEmail").innerText = `แอดมิน: ${user.email}`;
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

const optionsContainer = document.getElementById("optionsContainer");
const addOptionBtn = document.getElementById("addOptionBtn");

addOptionBtn.addEventListener("click", () => {
    const div = document.createElement("div");
    div.className = "option-group bg-white p-3 rounded-lg border border-purple-200 shadow-sm relative mt-3";
    div.innerHTML = `
        <button type="button" class="absolute top-2 right-2 text-red-400 hover:text-red-600 remove-btn bg-red-50 p-1 rounded-full" title="ลบตัวเลือก">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <input type="text" class="opt-name w-full border-b border-gray-200 pb-2 mb-2 pr-8 focus:outline-none focus:border-purple-500 text-sm font-medium" placeholder="ชื่อตัวเลือกเพิ่มเติม (บังคับ)" required>
        <input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none" placeholder="ลิงก์รูปภาพ (ไม่บังคับ)">
    `;
    optionsContainer.appendChild(div);
});

optionsContainer.addEventListener("click", (e) => {
    if (e.target.closest('.remove-btn')) {
        e.target.closest('.option-group').remove();
    }
});

// admin.js (เอาโค้ดนี้ไปทับส่วน form.addEventListener ของเดิม)
const form = document.getElementById("createCampaignForm");
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("title").value;
    const desc = document.getElementById("desc").value;
    const endTime = document.getElementById("endTime").value; // รับค่าเวลาปิดโหวต
    const optionGroups = document.querySelectorAll(".option-group");
    let optionsData = [];
    let initialVotes = {};

    optionGroups.forEach(group => {
        const name = group.querySelector(".opt-name").value.trim();
        const img = group.querySelector(".opt-img").value.trim();
        if (name !== "") {
            optionsData.push({ name: name, image: img });
            initialVotes[name] = 0;
        }
    });

    if (optionsData.length < 2) {
        Swal.fire({ icon: 'error', title: 'เดี๋ยวก่อน!', text: 'ต้องมีอย่างน้อย 2 ตัวเลือกครับ', confirmButtonColor: '#9333ea' });
        return;
    }

    // แจ้งเตือนกำลังโหลด
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

    try {
        await addDoc(collection(db, "campaigns"), {
            title: title,
            description: desc,
            endTime: endTime || null, // เก็บเวลาลงฐานข้อมูล (ถ้ามี)
            options: optionsData,
            votes_count: initialVotes,
            status: "open",
            createdAt: serverTimestamp()
        });

        Swal.fire({ icon: 'success', title: 'สำเร็จ!', text: 'สร้างรายการโหวตเรียบร้อยแล้ว', confirmButtonColor: '#9333ea' });
        form.reset();
        
        // รีเซ็ตฟอร์มกลับมาเป็น 2 ช่อง (ตัดโค้ดส่วน optionsContainer.innerHTML ของเดิมมาใส่ตรงนี้เหมือนเดิมครับ)
        
        loadCampaigns();
    } catch (error) {
        console.error("Error adding document: ", error);
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้', confirmButtonColor: '#9333ea' });
    }
});

// อัปเดตฟังก์ชันลบรายการ ให้ใช้ SweetAlert2
window.deleteCampaign = async function(campaignId) {
    Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "ข้อมูลคะแนนโหวตทั้งหมดจะหายไปและกู้คืนไม่ได้!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#d1d5db',
        confirmButtonText: 'ใช่, ลบทิ้งเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "campaigns", campaignId));
                Swal.fire('ลบแล้ว!', 'รายการนี้ถูกลบเรียบร้อย', 'success');
                loadCampaigns(); 
            } catch (error) {
                Swal.fire('ผิดพลาด', 'ไม่สามารถลบรายการได้', 'error');
            }
        }
    });
}

window.loadCampaigns = async function() {
    const campaignList = document.getElementById("campaignList");
    campaignList.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>';

    try {
        const q = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        campaignList.innerHTML = "";

        if (querySnapshot.empty) {
            campaignList.innerHTML = '<div class="bg-white p-10 rounded-2xl shadow-sm text-center text-gray-400 border border-dashed border-gray-300">ยังไม่มีรายการโหวต กดสร้างทางซ้ายมือได้เลยครับ</div>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            // ใช้ SVG แทนอิโมจิสำหรับสถานะเปิด/ปิด
            const statusBadge = data.status === "open" 
                ? `<span class="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"></circle></svg> เปิดโหวต
                   </span>`
                : `<span class="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"></circle></svg> ปิดโหวตแล้ว
                   </span>`;

            const toggleBtnText = data.status === "open" ? "ปิดโหวตชั่วคราว" : "เปิดโหวตอีกครั้ง";
            const toggleBtnClass = data.status === "open" ? "bg-red-50 hover:bg-red-100 text-red-600" : "bg-green-50 hover:bg-green-100 text-green-600";

            let optionsHtml = '<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">';
            data.options.forEach(opt => { 
                const imgTag = opt.image ? `<img src="${opt.image}" class="w-full h-24 object-cover rounded-md mb-2 border border-gray-100" onerror="this.style.display='none'">` : '';
                optionsHtml += `
                    <div class="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center flex flex-col justify-center items-center">
                        ${imgTag}
                        <span class="text-sm font-semibold text-gray-800">${opt.name}</span>
                    </div>
                `; 
            });
            optionsHtml += '</div>';

            campaignList.innerHTML += `
                <div class="bg-white p-6 rounded-2xl shadow-lg border border-purple-50 hover:shadow-xl transition-shadow relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-yellow-400"></div>
                    
                    <div class="flex justify-between items-start mb-2 mt-2">
                        <h3 class="font-black text-xl text-purple-900">${data.title}</h3>
                        ${statusBadge}
                    </div>
                    <p class="text-gray-500 text-sm mb-4">${data.description || 'ไม่มีคำอธิบาย'}</p>
                    
                    ${optionsHtml}

                    <div id="results_${id}" class="hidden bg-purple-50 p-5 rounded-xl mt-6 border border-purple-100"></div>

                    <div class="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-100">
                        <button onclick="viewResults('${id}')" class="flex items-center gap-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            ดูผลคะแนน
                        </button>
                        <button onclick="toggleStatus('${id}', '${data.status}')" class="text-sm ${toggleBtnClass} px-4 py-2 rounded-lg font-bold transition-colors border">
                            ${toggleBtnText}
                        </button>
                        <button onclick="deleteCampaign('${id}')" class="flex items-center gap-1 text-sm bg-white border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg font-bold transition-colors ml-auto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            ลบรายการ
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error getting documents: ", error);
        campaignList.innerHTML = '<p class="text-red-500 text-center py-4">ดึงข้อมูลล้มเหลว ลองรีเฟรชหน้าเว็บใหม่</p>';
    }
}

window.toggleStatus = async function(campaignId, currentStatus) {
    const newStatus = currentStatus === "open" ? "closed" : "open";
    try {
        await updateDoc(doc(db, "campaigns", campaignId), { status: newStatus });
        loadCampaigns();
    } catch (error) {
        console.error("Error updating status:", error);
    }
}

window.deleteCampaign = async function(campaignId) {
    if (confirm("แจ้งเตือน: คุณต้องการลบรายการโหวตนี้จริงๆ ใช่ไหม?\n(ข้อมูลคะแนนโหวตทั้งหมดจะหายไปและกู้คืนไม่ได้)")) {
        try {
            await deleteDoc(doc(db, "campaigns", campaignId));
            loadCampaigns(); 
        } catch (error) {
            console.error("Error deleting document:", error);
            alert("เกิดข้อผิดพลาดในการลบรายการ");
        }
    }
}

window.viewResults = async function(campaignId) {
    const resultDiv = document.getElementById(`results_${campaignId}`);
    if (!resultDiv.classList.contains('hidden')) {
        resultDiv.classList.add('hidden');
        return;
    }
    try {
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        if (docSnap.exists()) {
            const votes = docSnap.data().votes_count;
            
            // SVG Trophy สำหรับหัวข้อผลคะแนน
            let resultHtml = `
                <div class="flex items-center gap-2 mb-4 border-b border-purple-200 pb-2">
                    <svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                    <h4 class="font-bold text-purple-900">สรุปผลคะแนนล่าสุด</h4>
                </div>
                <ul class="space-y-4">
            `;
            
            let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            const sortedVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);

            sortedVotes.forEach(([option, count], index) => {
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                const barColor = index === 0 && count > 0 ? "bg-yellow-400" : "bg-purple-500"; 
                
                resultHtml += `
                    <li>
                        <div class="flex justify-between text-sm mb-1">
                            <span class="font-bold text-gray-700">${option}</span>
                            <span class="font-black text-purple-700">${count} โหวต <span class="text-gray-400 font-normal">(${percent}%)</span></span>
                        </div>
                        <div class="w-full bg-purple-200/50 rounded-full h-3">
                            <div class="${barColor} h-3 rounded-full transition-all duration-1000" style="width: ${percent}%"></div>
                        </div>
                    </li>
                `;
            });
            resultHtml += `</ul><p class="text-sm text-purple-600 mt-5 text-right font-medium">ผู้ใช้สิทธิ์ทั้งหมด: <span class="font-black text-lg">${totalVotes}</span> คน</p>`;
            resultDiv.innerHTML = resultHtml;
            resultDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error getting results:", error);
    }
}

loadCampaigns();