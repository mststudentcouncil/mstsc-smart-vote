import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, increment, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUser = null;
let allCampaigns = []; // เก็บข้อมูลแคมเปญทั้งหมดไว้ทำระบบค้นหา
let countdownIntervals = []; // เก็บตัวนับเวลาเพื่อเคลียร์ทิ้งตอนรีโหลด

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; } 
    else {
        currentUser = user;
        document.getElementById("userEmail").innerText = user.email;
        fetchCampaigns();
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// ดึงข้อมูลครั้งเดียว แล้วส่งให้ฟังก์ชัน render วาดหน้าจอ
async function fetchCampaigns() {
    const campaignList = document.getElementById("campaignList");
    try {
        const q = query(collection(db, "campaigns"), where("status", "==", "open"));
        const querySnapshot = await getDocs(q);
        
        allCampaigns = [];
        querySnapshot.forEach((doc) => {
            allCampaigns.push({ id: doc.id, ...doc.data() });
        });
        renderCampaigns(allCampaigns);
    } catch (error) {
        campaignList.innerHTML = '<p class="text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    }
}

// ฟังก์ชันวาดหน้าจอการ์ดโหวต
async function renderCampaigns(campaignsToRender) {
    const campaignList = document.getElementById("campaignList");
    campaignList.innerHTML = ""; 
    
    // เคลียร์เวลานับถอยหลังเก่าทิ้ง
    countdownIntervals.forEach(clearInterval);
    countdownIntervals = [];

    if (campaignsToRender.length === 0) {
        campaignList.innerHTML = `<div class="bg-white p-8 rounded-2xl shadow-sm border border-purple-100 text-center text-gray-400">ไม่พบกิจกรรมที่เปิดให้โหวตครับ</div>`;
        return;
    }

    for (const data of campaignsToRender) {
        const campaignId = data.id;
        const voterRef = doc(db, "campaigns", campaignId, "voters", currentUser.uid);
        const voterSnap = await getDoc(voterRef);
        const hasVoted = voterSnap.exists();

        // ตรวจสอบเวลาหมดอายุ
        let timeBadge = '';
        if (data.endTime) {
            timeBadge = `<div class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 mb-3 border border-red-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                ปิดโหวตใน: <span id="timer-${campaignId}">คำนวณเวลา...</span>
            </div>`;
            startCountdown(campaignId, data.endTime); // เริ่มนับเวลา
        }

        // student.js (แก้ไขในฟังก์ชัน renderCampaigns)
        let optionsHtml = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">`;
        data.options.forEach((opt) => {
            // แก้ไขบรรทัด imgTag ด้านล่างนี้
            const imgTag = opt.image ? `<img src="${opt.image}" onclick="viewImage(event, '${opt.image}')" class="w-full h-28 object-cover rounded-lg mb-2 border border-gray-100 hover:opacity-80 transition-opacity relative z-10 cursor-zoom-in" title="คลิกเพื่อดูรูปใหญ่" onerror="this.style.display='none'">` : '';
            
            optionsHtml += `
                <label class="cursor-pointer relative block ${hasVoted ? 'opacity-50 pointer-events-none' : ''}">
                    <input type="radio" name="vote_${campaignId}" value="${opt.name}" class="peer sr-only" ${hasVoted ? 'disabled' : ''}>
                    <div class="card-content h-full bg-white p-3 rounded-xl border-2 border-gray-100 shadow-sm transition-all duration-200 flex flex-col items-center justify-center relative overflow-hidden text-center hover:border-purple-300">
                        <div class="check-icon hidden absolute top-2 right-2 bg-purple-600 text-white rounded-full p-0.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
                        ${imgTag}
                        <span class="text-sm font-bold text-gray-800">${opt.name}</span>
                    </div>
                </label>
            `;
        });
        optionsHtml += `</div>`;

        const buttonHtml = hasVoted 
            ? `<button disabled class="w-full mt-5 bg-gray-200 text-gray-500 font-bold py-3 px-4 rounded-xl cursor-not-allowed flex justify-center items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>คุณได้ใช้สิทธิ์โหวตไปแล้ว</button>`
            : `<button onclick="submitVote('${campaignId}')" class="w-full mt-5 bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-black py-3 px-4 rounded-xl shadow-md transform hover:-translate-y-0.5 transition-all text-lg flex justify-center items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"></path></svg>ยืนยันสิทธิ์โหวต</button>`;

        const card = document.createElement("div");
        card.className = "bg-white p-5 sm:p-6 rounded-2xl shadow-md border border-purple-50 relative overflow-hidden campaign-item";
        card.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-yellow-400"></div>
            <h3 class="text-xl font-black text-purple-900 mb-1 mt-1">${data.title}</h3>
            <p class="text-gray-500 mb-3 text-sm">${data.description || ''}</p>
            ${timeBadge}
            ${optionsHtml}
            ${buttonHtml}
        `;
        campaignList.appendChild(card);
    }
}

// ฟังก์ชันนับเวลาถอยหลังแบบ Real-time
function startCountdown(campaignId, endTimeStr) {
    const end = new Date(endTimeStr).getTime();
    
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const distance = end - now;
        
        const timerElement = document.getElementById(`timer-${campaignId}`);
        if (!timerElement) return;

        if (distance < 0) {
            clearInterval(interval);
            timerElement.innerHTML = "หมดเวลาโหวตแล้ว!";
            timerElement.parentElement.classList.replace('bg-red-50', 'bg-gray-100');
            timerElement.parentElement.classList.replace('text-red-600', 'text-gray-500');
            // รีโหลดข้อมูลใหม่เพื่อปิดโหวต
            fetchCampaigns();
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        let timeText = "";
        if(days > 0) timeText += `${days} วัน `;
        timeText += `${hours} ชม. ${minutes} นาที ${seconds} วินาที`;
        
        timerElement.innerHTML = timeText;
    }, 1000);
    countdownIntervals.push(interval);
}

// ระบบค้นหาแบบ Real-time
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    const filtered = allCampaigns.filter(camp => camp.title.toLowerCase().includes(keyword) || (camp.description && camp.description.toLowerCase().includes(keyword)));
    renderCampaigns(filtered);
});

window.submitVote = async function(campaignId) {
    const selectedOption = document.querySelector(`input[name="vote_${campaignId}"]:checked`);
    
    if (!selectedOption) {
        Swal.fire({ icon: 'warning', title: 'เดี๋ยวก่อน!', text: 'กรุณาจิ้มเลือกตัวเลือกที่ต้องการก่อนครับ', confirmButtonColor: '#9333ea' });
        return;
    }

    const voteValue = selectedOption.value;

    Swal.fire({
        title: 'ยืนยันการโหวต?',
        text: `คุณต้องการลงคะแนนให้ "${voteValue}" ใช่หรือไม่? (โหวตแล้วแก้ไม่ได้นะ!)`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#eab308',
        cancelButtonColor: '#d1d5db',
        confirmButtonText: 'ใช่, ยืนยันเลย!',
        cancelButtonText: 'ขอกลับไปคิดดูก่อน'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังบันทึกคะแนน...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            
            try {
                const campaignRef = doc(db, "campaigns", campaignId);
                const voterRef = doc(db, "campaigns", campaignId, "voters", currentUser.uid);

                const voterSnap = await getDoc(voterRef);
                if (voterSnap.exists()) {
                    Swal.fire('เสียใจด้วย!', 'คุณได้ใช้สิทธิ์โหวตรายการนี้ไปแล้วครับ', 'error');
                    return;
                }

                await setDoc(voterRef, { votedAt: serverTimestamp() });
                await updateDoc(campaignRef, { [`votes_count.${voteValue}`]: increment(1) });

                Swal.fire({ icon: 'success', title: 'โหวตสำเร็จ!', text: 'ขอบคุณที่ร่วมใช้สิทธิ์ครับ 🎉', confirmButtonColor: '#9333ea' });
                fetchCampaigns(); 
            } catch (error) {
                Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการส่งผลโหวต ลองใหม่อีกครั้งนะ', 'error');
            }
        }
    });
}

// student.js (เอาไปต่อท้ายไฟล์สุดเลยครับ)

window.viewImage = function(e, imageUrl) {
    e.preventDefault(); // ป้องกันไม่ให้การคลิกรูปไปทำให้ Radio Button ทำงาน
    e.stopPropagation(); // ป้องกันไม่ให้ Event ทะลุไปหา Label

    Swal.fire({
        imageUrl: imageUrl,
        imageAlt: 'รูปภาพตัวเลือก',
        showCloseButton: true,
        showConfirmButton: false,
        width: 'auto',
        padding: '1rem',
        background: 'transparent',
        backdrop: `rgba(0,0,0,0.8)`,
        customClass: {
            image: 'max-h-[80vh] object-contain rounded-xl shadow-2xl bg-white p-2',
            closeButton: 'text-white bg-purple-600 hover:bg-purple-700 rounded-full w-8 h-8 flex items-center justify-center m-2 shadow-lg outline-none'
        }
    });
}