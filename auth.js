// auth.js
import { auth } from "./firebase-config.js";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: "mst.ac.th" }); // ล็อกให้ขึ้นแนะนำเฉพาะเมลโรงเรียน

const loginBtn = document.getElementById("loginBtn");

if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
        try {
            // ปิดการคลิกซ้ำขณะโหลด
            loginBtn.disabled = true;
            loginBtn.innerHTML = "กำลังเข้าสู่ระบบ...";

            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // ป้องกันคนเอาเมลอื่นมาล็อกอิน
            if (!user.email.endsWith("@mst.ac.th")) {
                alert("กรุณาใช้อีเมลของโรงเรียน (@mst.ac.th) เท่านั้นครับ");
                await auth.signOut();
                window.location.reload();
                return;
            }

            // แยกสิทธิ์การเข้าถึงหน้าเว็บ
            if (user.email === "studentcouncil@mst.ac.th") {
                window.location.href = "admin.html";
            } else {
                window.location.href = "student.html";
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("ยกเลิกการเข้าสู่ระบบ หรือเกิดข้อผิดพลาด");
            window.location.reload();
        }
    });
}

// เช็คว่าถ้าเคยล็อกอินค้างไว้ ให้เด้งข้ามหน้า Login ไปเลย
onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.endsWith("index.html") || user && window.location.pathname === "/") {
        if (user.email === "studentcouncil@mst.ac.th") {
            window.location.href = "admin.html";
        } else if (user.email.endsWith("@mst.ac.th")) {
            window.location.href = "student.html";
        }
    }
});