import { db, auth } from './firebase-config.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

window.salvarDados = async () => {
    const nome = document.getElementById('nome').value.trim();
    const data = document.getElementById('data').value;
    const chat = parseInt(document.getElementById('chat').value) || 0;
    const inbox = parseInt(document.getElementById('inbox').value) || 0;
    const csat = document.getElementById('csat').value || "---";
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal, csat: csat 
            });
            alert("Dados salvos com sucesso!");
            document.getElementById('nome').value = '';
            document.getElementById('chat').value = '';
            document.getElementById('inbox').value = '';
            document.getElementById('csat').value = '';
        } catch (e) { alert("Erro ao salvar."); }
    } else {
        alert("Preencha Nome e Data.");
    }
};

function atualizarListasDeNomes() {
    const datalist = document.getElementById('listaNomes');
    const containerCheck = document.getElementById('containerCheckboxes');
    if (!datalist || !containerCheck) return;

    const nomesUnicos = [...new Set(registrosLocais.map(item => item.nome))].sort();
    
    datalist.innerHTML = '';
    containerCheck.innerHTML = ''; 

    nomesUnicos.forEach(nome => {
        datalist.innerHTML += `<option value="${nome}">`;
        
        const label = document.createElement('label');
        label.className = 'item-checkbox';
        label.innerHTML = `<input type="checkbox" value="${nome}" onchange="filtrar()"> <span>${nome}</span>`;
        containerCheck.appendChild(label);
    });
}

function escutarDados() {
    onSnapshot(collection(db, "producao"), (snapshot) => {
        registrosLocais = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListasDeNomes(); 
        filtrar();
    });
}

window.filtrar = () => {
    const checkboxes = document.querySelectorAll('#containerCheckboxes input[type="checkbox"]:checked');
    const opcoesSelecionadas = Array.from(checkboxes).map(cb => cb.value);
    
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipoOrdem = document.getElementById('ordenacao').value;
    
    let filtrados = registrosLocais.filter(item => {
        const bateNome = opcoesSelecionadas.length === 0 || opcoesSelecionadas.includes(item.nome);
        let noPeriodo = true;
        if (dataIni) noPeriodo = noPeriodo && (item.data >= dataIni);
        if (dataFim) noPeriodo = noPeriodo && (item.data <= dataFim);
        return bateNome && noPeriodo;
    });

    if (tipoOrdem === "alfabetica") {
        filtrados.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (tipoOrdem === "data_asc") {
        filtrados.sort((a, b) => new Date(a.data) - new Date(b.data));
    } else if (tipoOrdem === "data_desc") {
        filtrados.sort((a, b) => new Date(b.data) - new Date(a.data));
    } else if (tipoOrdem === "menor") {
        filtrados.sort((a, b) => (a.volume || 0) - (b.volume || 0));
    } else if (tipoOrdem === "maior") {
        filtrados.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }

    const filtroAtivo = opcoesSelecionadas.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = filtroAtivo ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    if (filtrados.length > 0) processarMetricas(filtrados);
};

window.renderizarTabela = (lista) => {
    const corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';
    lista.forEach(item => {
        const vChat = item.chat !== undefined ? item.chat : 0;
        const vInbox = item.inbox !== undefined ? item.inbox : 0;
        const vTotal = item.volume || (vChat + vInbox);
        const vCsat = item.csat !== undefined ? item.csat : "---";
        const status = vTotal >= 120 ? "meta-ok" : "meta-ruim";
        
        corpo.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.data.split('-').reverse().join('/')}</td>
                <td>${vChat}</td>
                <td>${vInbox}</td>
                <td>${vTotal}</td>
                <td><span class="${status}">${vTotal >= 120 ? 'Acima' : 'Abaixo'}</span></td>
                <td>${vCsat}%</td>
                <td><button class="btn-excluir" onclick="apagarRegistro('${item.id}')">🗑️</button></td>
            </tr>`;
    });
};

function processarMetricas(lista) {
    const totais = lista.reduce((acc, curr) => {
        acc.chat += (curr.chat || 0);
        acc.inbox += (curr.inbox || 0);
        acc.volume += (curr.volume || 0);
        return acc;
    }, { chat: 0, inbox: 0, volume: 0 });

    const mediaGeral = (totais.volume / lista.length).toFixed(2);
    document.getElementById('totalChatPeriodo').innerText = totais.chat;
    document.getElementById('totalInboxPeriodo').innerText = totais.inbox;
    document.getElementById('totalGeralPeriodo').innerText = totais.volume;
    document.getElementById('valorMedia').innerText = mediaGeral;

    const resumo = {};
    lista.forEach(item => {
        if (!resumo[item.nome]) resumo[item.nome] = { chat: 0, inbox: 0, total: 0, qtd: 0 };
        resumo[item.nome].chat += (item.chat || 0);
        resumo[item.nome].inbox += (item.inbox || 0);
        resumo[item.nome].total += (item.volume || 0);
        resumo[item.nome].qtd++;
    });

    const nomesOrdenados = Object.keys(resumo).sort();
    let html = "<h4>Resumo Individual no Período:</h4><ul style='list-style:none; padding:0;'>";
    nomesOrdenados.forEach(atendente => {
        const r = resumo[atendente];
        const mInd = (r.total / r.qtd).toFixed(2);
        html += `<li style='margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;'>
                    <b>${atendente}</b>: Chat: ${r.chat} | Inbox: ${r.inbox} | Total: ${r.total} | <b>Média: ${mInd}</b>
                 </li>`;
    });
    html += "</ul>";
    document.getElementById('resumoIndividual').innerHTML = html;
}

window.excluirAtendenteCompleto = async () => {
    const nome = prompt("Digite o nome EXATO do atendente para excluir TUDO dele:");
    if (!nome) return;
    if (confirm(`Deseja apagar registros de ${nome}?`)) {
        const q = query(collection(db, "producao"), where("nome", "==", nome));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        alert("Excluído!");
    }
};

window.apagarRegistro = async (id) => { 
    if (confirm("Excluir este registro?")) await deleteDoc(doc(db, "producao", id)); 
};

window.limparFiltros = () => {
    const checkboxes = document.querySelectorAll('#containerCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    document.getElementById('ordenacao').value = 'data_asc';
    filtrar();
};

window.gerarRelatorio = () => window.print();
window.logout = () => signOut(auth);