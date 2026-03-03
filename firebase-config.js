// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// โค้ดตั้งค่าของคุณ
const firebaseConfig = {
  apiKey: "AIzaSyCyvm0w7EX_Ef1mXG5YoOWGzYv2edACMwQ",
  authDomain: "sc-smart-vote.firebaseapp.com",
  projectId: "sc-smart-vote",
  storageBucket: "sc-smart-vote.firebasestorage.app",
  messagingSenderId: "183239411002",
  appId: "1:183239411002:web:7d219c062605dec3bb3c03"
};

// เริ่มต้นใช้งาน Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ส่งออก auth และ db ไปให้ไฟล์อื่นใช้
export { auth, db };