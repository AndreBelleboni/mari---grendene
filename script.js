import { db, auth } from './firebase-config.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

// SALVAR DADOS
window.salvarDados = async () => {
    const nome = document.getElementById('nome').value;
    const data = document.getElementById('data').value;
    const chat = parseInt(document.getElementById('chat').value) || 0;
    const inbox = parseInt(document.getElementById('inbox').value) || 0;
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal 
            });
            alert("Dados salvos!");
            document.getElementById('nome').value = '';
            document.getElementById('chat').value = '';
            document.getElementById('inbox').value = '';
        } catch (e) { alert("Erro ao salvar."); }
    }
};

// ATUALIZAR LISTAS (Autocomplete e Select Multi)
function atualizarListasDeNomes() {
    const datalist = document.getElementById('listaNomes');
    const selectMulti = document.getElementById('buscaNomeMulti');
    
    if (!datalist || !selectMulti) return;

    const nomesUnicos = [...new Set(registrosLocais.map(item => item.nome))].sort();
    
    datalist.innerHTML = '';
    selectMulti.innerHTML = ''; 

    nomesUnicos.forEach(nome => {
        datalist.innerHTML += `<option value="${nome}">`;
        selectMulti.innerHTML += `<option value="${nome}">${nome}</option>`;
    });
}

// ESCUTAR BANCO DE DADOS
function escutarDados() {
    onSnapshot(collection(db, "producao"), (snapshot) => {
        registrosLocais = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListasDeNomes(); 
        filtrar(); // Renderiza a tabela inicial
    });
}

// FILTRAR (Lógica para múltiplos nomes e datas)
window.filtrar = () => {
    const selectMulti = document.getElementById('buscaNomeMulti');
    const opcoesSelecionadas = Array.from(selectMulti.selectedOptions).map(opt => opt.value);
    
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    
    const filtrados = registrosLocais.filter(item => {
        // Se nada selecionado, mostra todos. Se selecionado, verifica se o nome está na lista.
        const bateNome = opcoesSelecionadas.length === 0 || opcoesSelecionadas.includes(item.nome);
        
        let noPeriodo = true;
        if (dataIni) noPeriodo = noPeriodo && (item.data >= dataIni);
        if (dataFim) noPeriodo = noPeriodo && (item.data <= dataFim);
        
        return bateNome && noPeriodo;
    });

    const filtroAtivo = opcoesSelecionadas.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = filtroAtivo ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    if (filtrados.length > 0) calcularMedia(filtrados);
};

// RENDERIZAR TABELA (Suporte a dados antigos)
window.renderizarTabela = (lista) => {
    const corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';

    lista.sort((a, b) => new Date(a.data) - new Date(b.data));

    lista.forEach(item => {
        // Suporte para dados que não tinham chat/inbox separados
        const vChat = item.chat !== undefined ? item.chat : "---";
        const vInbox = item.inbox !== undefined ? item.inbox : "---";
        const vTotal = item.volume || 0;

        const status = vTotal >= 120 ? "meta-ok" : "meta-ruim";
        
        corpo.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.data.split('-').reverse().join('/')}</td>
                <td>${vChat}</td>
                <td>${vInbox}</td>
                <td>${vTotal}</td>
                <td><span class="${status}">${vTotal >= 120 ? 'Meta OK' : 'Abaixo'}</span></td>
                <td><button class="btn-excluir" onclick="apagarRegistro('${item.id}')">🗑️</button></td>
            </tr>`;
    });
};

function calcularMedia(lista) {
    const soma = lista.reduce((t, i) => t + (i.volume || 0), 0);
    const media = (soma / lista.length).toFixed(2);
    document.getElementById('valorMedia').innerText = media;
}

window.gerarRelatorio = () => window.print();

window.apagarRegistro = async (id) => { 
    if (confirm("Deseja realmente excluir este registro?")) {
        await deleteDoc(doc(db, "producao", id)); 
    }
};

window.logout = () => signOut(auth);

window.limparFiltros = () => {
    document.getElementById('buscaNomeMulti').selectedIndex = -1; // Desmarca todos no select multiple
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    filtrar();
};