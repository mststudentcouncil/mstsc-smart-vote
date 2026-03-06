import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUser = null;
let studentData = null; 
let allCampaigns = []; 
let countdownIntervals = []; 

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; } 
    
    const email = user.email; 
    document.getElementById("userEmail").innerText = "กำลังตรวจสอบสิทธิ์...";

    const emailMatch = email.match(/(\d{5})@mst\.ac\.th$/);
    if (emailMatch) {
        const studentId = emailMatch[1]; 
        try {
            const studentDoc = await getDoc(doc(db, "students", studentId));
            if (studentDoc.exists()) {
                currentUser = user;
                studentData = studentDoc.data();
                studentData.id = studentId; 
                document.getElementById("userEmail").innerHTML = `${studentData.name} <br><span class="text-[10px] text-purple-200">ห้อง ${studentData.room} | รหัส: ${studentId}</span>`;
                
                // แก้ไข: เรียกชื่อฟังก์ชันให้ถูกต้อง
                fetchCampaigns(); 
                
            } else {
                Swal.fire({ icon: 'error', title: 'ไม่อนุญาตให้เข้าใช้งาน', text: `ไม่พบรหัสนักเรียน ${studentId} ในระบบ`, confirmButtonColor: '#d33' }).then(() => signOut(auth).then(() => window.location.href = "index.html"));
            }
        } catch (error) { 
            console.error("Auth Error:", error);
            Swal.fire('ข้อผิดพลาด', 'ระบบขัดข้อง ไม่สามารถตรวจสอบรายชื่อได้', 'error'); 
        }
    } else {
        Swal.fire({ icon: 'error', title: 'อีเมลไม่ถูกต้อง', text: 'ระบบรองรับเฉพาะอีเมลนักเรียน @mst.ac.th เท่านั้น', confirmButtonColor: '#d33' }).then(() => signOut(auth).then(() => window.location.href = "index.html"));
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    Swal.fire({ title: 'ออกจากระบบ', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#6b7280', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' }).then((result) => { if (result.isConfirmed) signOut(auth).then(() => window.location.href = "index.html"); });
});

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

async function fetchCampaigns() { 
    const campaignList = document.getElementById("campaignList");
    const q = query(collection(db, "campaigns"), where("status", "==", "open"));

    try {
        const querySnapshot = await getDocs(q); 
        let tempCampaigns = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (isStudentEligible(data.allowed_voters, studentData)) {
                tempCampaigns.push({ id: doc.id, ...data });
            }
        });

        allCampaigns = tempCampaigns;
        const keyword = document.getElementById('searchInput').value.toLowerCase();
        if (keyword) {
            renderCampaigns(allCampaigns.filter(camp => camp.title.toLowerCase().includes(keyword) || (camp.description && camp.description.toLowerCase().includes(keyword))));
        } else {
            renderCampaigns(allCampaigns);
        }
    } catch (error) { 
        console.error("Fetch Campaigns Error:", error);
        campaignList.innerHTML = '<div class="bg-red-50 text-red-500 p-6 rounded-lg text-center border border-red-200">เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูลรายการโหวต</div>'; 
    }
}

async function renderCampaigns(campaignsToRender) {
    const campaignList = document.getElementById("campaignList");
    campaignList.innerHTML = ""; 
    countdownIntervals.forEach(clearInterval);
    countdownIntervals = [];

    if (campaignsToRender.length === 0) {
        campaignList.innerHTML = `<div class="bg-white p-10 rounded-xl shadow-sm border border-gray-200 text-center text-gray-500 flex flex-col items-center gap-3"><svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>ขณะนี้ไม่มีรายการที่เปิดให้ท่านลงคะแนน</div>`;
        return;
    }

    for (const data of campaignsToRender) {
        const campaignId = data.id;
        
        const voterSnap = await getDoc(doc(db, "campaigns", campaignId, "voters", studentData.id));
        
        const now = new Date().getTime();
        const isExpired = data.endTime && now >= new Date(data.endTime).getTime();
        const hasVoted = voterSnap.exists();
        const isDisabled = hasVoted || isExpired; 

        let timeBadge = '';
        if (data.endTime) {
            if (isExpired) {
                timeBadge = `<div class="bg-gray-100 text-gray-500 px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-2 mb-4 border border-gray-300 shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>หมดเวลาลงคะแนนแล้ว</div>`;
            } else {
                timeBadge = `<div class="bg-red-50 text-red-700 px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-2 mb-4 border border-red-200 shadow-sm"><svg class="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ปิดรับลงคะแนนใน: <span id="timer-${campaignId}">กำลังคำนวณ...</span></div>`;
                startCountdown(campaignId, data.endTime); 
            }
        }

        let optionsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">`;
        data.options.forEach((opt, index) => {
            const placeholder = "https://placehold.co/400x400/f3f4f6/a8a29e?text=No+Image";
            const imgTag = opt.image ? `<img src="${opt.image}" onclick="viewImage(event, '${opt.image}', '${opt.name}')" class="w-32 h-32 sm:w-36 sm:h-36 object-cover rounded-xl mb-3 border-2 border-gray-100 shadow-sm hover:opacity-80 transition-opacity cursor-zoom-in relative z-10" onerror="this.onerror=null;this.src='${placeholder}';">` : '';
            
            optionsHtml += `
                <label class="cursor-pointer relative block ${isDisabled ? 'opacity-60 pointer-events-none' : ''}">
                    <input type="radio" name="vote_${campaignId}" value="${opt.name}" class="peer sr-only" ${isDisabled ? 'disabled' : ''}>
                    <div class="card-content h-full bg-white p-5 rounded-xl border border-gray-200 shadow-sm transition-all duration-200 flex flex-col items-center justify-start relative overflow-hidden text-center hover:shadow-md hover:border-purple-300">
                        <div class="candidate-num absolute top-0 left-0 bg-gray-200 text-gray-700 font-bold px-4 py-1 rounded-br-lg text-sm transition-colors">หมายเลข ${index + 1}</div>
                        <div class="check-icon hidden absolute top-3 right-3 bg-purple-600 text-white rounded-full p-1 shadow-md"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
                        <div class="mt-6"></div>${imgTag}<span class="text-base font-bold text-gray-800">${opt.name}</span>
                    </div>
                </label>
            `;
        });
        optionsHtml += `</div>`;

        let buttonHtml = '';
        if (hasVoted) buttonHtml = `<div class="mt-6 bg-gray-100 border border-gray-200 text-gray-600 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ท่านได้ใช้สิทธิ์ลงคะแนนเรียบร้อยแล้ว</div>`;
        else if (isExpired) buttonHtml = `<div class="mt-6 bg-red-50 border border-red-200 text-red-600 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>หมดเวลาการลงคะแนน</div>`;
        else buttonHtml = `<button onclick="submitVote('${campaignId}')" class="w-full sm:w-auto mx-auto mt-6 bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all text-base flex justify-center items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"></path></svg>ยืนยันสิทธิ์ลงคะแนน</button>`;

        const card = document.createElement("div");
        card.className = "bg-white p-6 md:p-8 rounded-2xl shadow-md border border-gray-100 relative";
        card.innerHTML = `
            <div class="absolute top-0 left-0 w-1.5 h-full ${isExpired ? 'bg-gray-400' : 'bg-purple-700'} rounded-l-2xl"></div>
            <div class="pl-3">
                <h3 class="text-xl md:text-2xl font-bold ${isExpired ? 'text-gray-500' : 'text-gray-900'} mb-2">${data.title}</h3>
                <p class="text-gray-500 mb-5 text-sm md:text-base">${data.description || 'กรุณาเลือกผู้สมัครที่ท่านต้องการเพียง 1 หมายเลข'}</p>
                ${timeBadge}${optionsHtml}<div class="text-center">${buttonHtml}</div>
            </div>
        `;
        campaignList.appendChild(card);
    }
}

window.viewImage = function(e, imageUrl, title) {
    e.preventDefault(); e.stopPropagation(); 
    Swal.fire({ title: title, imageUrl: imageUrl, imageAlt: title, showCloseButton: true, showConfirmButton: false, customClass: { image: 'rounded-xl object-contain max-h-[70vh]' } });
}

function startCountdown(campaignId, endTimeStr) {
    const end = new Date(endTimeStr).getTime();
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const distance = end - now;
        
        if (distance < 0) {
            clearInterval(interval);
            fetchCampaigns(); 
            return;
        }

        const timerElement = document.getElementById(`timer-${campaignId}`);
        if (!timerElement) return;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        let timeText = "";
        if(days > 0) timeText += `${days} วัน `;
        timeText += `${hours} ชม. ${minutes} นาที ${seconds} วิ.`;
        timerElement.innerHTML = timeText;
    }, 1000);
    countdownIntervals.push(interval);
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    renderCampaigns(allCampaigns.filter(camp => camp.title.toLowerCase().includes(keyword) || (camp.description && camp.description.toLowerCase().includes(keyword))));
});

window.submitVote = async function(campaignId) {
    const campaignData = allCampaigns.find(c => c.id === campaignId);
    if (campaignData && campaignData.endTime && new Date().getTime() >= new Date(campaignData.endTime).getTime()) {
        Swal.fire({ icon: 'error', title: 'หมดเวลา', text: 'รายการนี้ปิดรับลงคะแนนไปแล้วครับ', confirmButtonColor: '#6b21a8' });
        fetchCampaigns(); 
        return;
    }

    const selectedOption = document.querySelector(`input[name="vote_${campaignId}"]:checked`);
    if (!selectedOption) { Swal.fire({ icon: 'warning', title: 'กรุณาเลือกผู้สมัคร', text: 'ท่านต้องคลิกเลือกหมายเลขที่ต้องการก่อนกดยืนยันครับ', confirmButtonColor: '#6b21a8' }); return; }

    const voteValue = selectedOption.value;

    Swal.fire({
        title: 'ยืนยันการลงคะแนน', html: `ท่านกำลังลงคะแนนเสียงให้ <br><b class="text-xl text-purple-700">${voteValue}</b><br><br><span class="text-sm text-red-500">*หากยืนยันแล้วจะไม่สามารถแก้ไขได้</span>`, icon: 'info', showCancelButton: true, confirmButtonColor: '#6b21a8', cancelButtonColor: '#d1d5db', confirmButtonText: 'ยืนยันสิทธิ์', cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            try {
                const voterRef = doc(db, "campaigns", campaignId, "voters", studentData.id);
                if ((await getDoc(voterRef)).exists()) { Swal.fire('ข้อผิดพลาด', 'ท่านได้ใช้สิทธิ์ในรายการนี้ไปแล้วครับ', 'error'); return; }

                await setDoc(voterRef, { 
                    votedAt: serverTimestamp(),
                    studentId: studentData.id, 
                    name: studentData.name,
                    room: studentData.room,
                    level: studentData.level,
                    uidUsed: currentUser.uid 
                });
                
                await updateDoc(doc(db, "campaigns", campaignId), { [`votes_count.${voteValue}`]: increment(1) });

                Swal.fire({ icon: 'success', title: 'ลงคะแนนสำเร็จ', html: `<p class="text-gray-600 mb-2">ขอบคุณที่ร่วมใช้สิทธิ์ลงคะแนนเสียง</p>`, confirmButtonColor: '#6b21a8', confirmButtonText: 'ปิดหน้าต่าง' }).then(() => {
                    fetchCampaigns(); 
                });
            } catch (error) { 
                console.error("Submit Vote Error:", error);
                Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error'); 
            }
        }
    });
}