import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Alternar entre abas de Login e Registro
window.alternarTab = (tipo) => {
    const isLogin = tipo === 'login';
    document.getElementById('formLogin').style.display = isLogin ? 'block' : 'none';
    document.getElementById('formRegistro').style.display = isLogin ? 'none' : 'block';
    document.getElementById('btnTabLogin').classList.toggle('active', isLogin);
    document.getElementById('btnTabRegistro').classList.toggle('active', !isLogin);
};

// Registrar nova conta (Chefe ou Esposa)
window.registrarUsuario = async () => {
    const email = document.getElementById('newUser').value;
    const pass = document.getElementById('newPass').value;
    if (!email.includes('@')) return alert("Use um e-mail válido!");

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        alert("Conta criada com sucesso!");
        window.location.href = "index.html";
    } catch (error) {
        alert("Erro ao criar conta: " + error.message);
    }
};

// Fazer Login
window.fazerLogin = async () => {
    const email = document.getElementById('userLogin').value;
    const pass = document.getElementById('passLogin').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = "index.html";
    } catch (error) {
        alert("Acesso negado. Verifique suas credenciais.");
    }
};