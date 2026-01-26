import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCUpda11Qzg85P6vqfJayDXaQrmdTHtAjE",
    authDomain: "grendene-gestao.firebaseapp.com",
    projectId: "grendene-gestao",
    storageBucket: "grendene-gestao.firebasestorage.app",
    messagingSenderId: "1068239078408",
    appId: "1:1068239078408:web:b4a8ff224a779caeaf3dbd",
    measurementId: "G-YQVGS0WVKF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);