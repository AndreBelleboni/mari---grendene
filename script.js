import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];

/* --- CONTROLE DE ACESSO --- */
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

/* --- SALVAR DADOS --- */
window.salvarDados = async () => {
    const nome = document.getElementById('nome').value.trim();
    const data = document.getElementById('data').value;
    const chat = parseInt(document.getElementById('chat').value) || 0;
    const inbox = parseInt(document.getElementById('inbox').value) || 0;
    const csat = parseFloat(document.getElementById('csat').value) || 0;
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal, csat: csat 
            });
            alert("Dados salvos com sucesso!");
            ['nome', 'chat', 'inbox', 'csat'].forEach(id => document.getElementById(id).value = '');
        } catch (e) { alert("Erro ao salvar."); }
    } else {
        alert("Preencha Nome e Data.");
    }
};

/* --- EDITAR REGISTRO --- */
window.editarRegistro = async (id) => {
    const item = registrosLocais.find(r => r.id === id);
    if (!item) return;

    const novoChat = prompt(`Novo volume Chat para ${item.nome}:`, item.chat);
    const novoInbox = prompt(`Novo volume Inbox para ${item.nome}:`, item.inbox);
    const novoCsat = prompt(`Novo CSAT % para ${item.nome}:`, item.csat);

    if (novoChat !== null && novoInbox !== null && novoCsat !== null) {
        const vChat = parseInt(novoChat) || 0;
        const vInbox = parseInt(novoInbox) || 0;
        const vCsat = parseFloat(novoCsat) || 0;
        const volumeTotal = vChat + vInbox;

        try {
            await updateDoc(doc(db, "producao", id), {
                chat: vChat,
                inbox: vInbox,
                csat: vCsat,
                volume: volumeTotal
            });
            alert("Registro atualizado!");
        } catch (e) { alert("Erro ao atualizar."); }
    }
};

/* --- ESCUTAR DADOS DO FIREBASE --- */
function escutarDados() {
    onSnapshot(collection(db, "producao"), (snapshot) => {
        registrosLocais = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListasDeNomes(); 
        filtrar();
    });
}

/* --- ATUALIZAR LISTA DE SELEÇÃO (CHECKBOXES) --- */
function atualizarListasDeNomes() {
    const containerCheck = document.getElementById('containerCheckboxes');
    if (!containerCheck) return;

    const nomesUnicos = [...new Set(registrosLocais.map(item => item.nome))].sort();
    containerCheck.innerHTML = ''; 

    nomesUnicos.forEach(nome => {
        const label = document.createElement('label');
        label.className = 'item-checkbox';
        label.innerHTML = `<input type="checkbox" value="${nome}" onchange="filtrar()"> <span>${nome}</span>`;
        containerCheck.appendChild(label);
    });
}

/* --- FILTRAR E ORDENAR (DATA PRIMEIRO, NOME COMO DESEMPATE) --- */
window.filtrar = () => {
    const selecionados = Array.from(document.querySelectorAll('#containerCheckboxes input:checked')).map(cb => cb.value);
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipoOrdem = document.getElementById('ordenacao').value;
    
    let filtrados = registrosLocais.filter(item => {
        const bateNome = selecionados.length === 0 || selecionados.includes(item.nome);
        const noPeriodo = (!dataIni || item.data >= dataIni) && (!dataFim || item.data <= dataFim);
        return bateNome && noPeriodo;
    });

    // Lógica de Ordenação: Data é a prioridade, Nome desempata o dia
    filtrados.sort((a, b) => {
        let compPrincipal = 0;

        if (tipoOrdem === "data_asc") {
            compPrincipal = new Date(a.data) - new Date(b.data);
        } else if (tipoOrdem === "data_desc") {
            compPrincipal = new Date(b.data) - new Date(a.data);
        } else if (tipoOrdem === "maior") {
            compPrincipal = (b.volume || 0) - (a.volume || 0);
        } else if (tipoOrdem === "menor") {
            compPrincipal = (a.volume || 0) - (b.volume || 0);
        } else if (tipoOrdem === "alfabetica") {
            // Se o filtro for puramente alfabético, comparamos os nomes primeiro
            return a.nome.localeCompare(b.nome) || new Date(a.data) - new Date(b.data);
        }

        // Se o critério principal (Data ou Volume) der empate (0), ordena por Nome
        if (compPrincipal === 0) {
            return a.nome.localeCompare(b.nome);
        }
        
        return compPrincipal;
    });

    const temFiltro = selecionados.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = temFiltro ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    if (filtrados.length > 0) processarMetricas(filtrados);
};

/* --- RENDERIZAR TABELA --- */
window.renderizarTabela = (lista) => {
    const corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';
    lista.forEach(item => {
        const vCsat = parseFloat(item.csat) || 0;
        const statusMeta = item.volume >= 120 ? "meta-ok" : "meta-ruim";
        const statusCsat = vCsat >= 80 ? "csat-bom" : "csat-ruim";
        
        corpo.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.data.split('-').reverse().join('/')}</td>
                <td>${item.chat || 0}</td>
                <td>${item.inbox || 0}</td>
                <td>${item.volume || 0}</td>
                <td><span class="${statusMeta}">${item.volume >= 120 ? 'Acima' : 'Abaixo'}</span></td>
                <td><span class="${statusCsat}">${vCsat}%</span></td>
                <td>
                    <button class="btn-editar" onclick="editarRegistro('${item.id}')">✏️</button>
                    <button class="btn-excluir" onclick="apagarRegistro('${item.id}')">🗑️</button>
                </td>
            </tr>`;
    });
};

/* --- PROCESSAR MÉTRICAS GERAIS E INDIVIDUAIS --- */
function processarMetricas(lista) {
    let tChat = 0, tInbox = 0, tVol = 0, somaCsatGeral = 0;
    const resumo = {};

    lista.forEach(item => {
        const csatVal = parseFloat(item.csat) || 0;
        tChat += (item.chat || 0);
        tInbox += (item.inbox || 0);
        tVol += (item.volume || 0);
        somaCsatGeral += csatVal;

        if (!resumo[item.nome]) {
            resumo[item.nome] = { chat: 0, inbox: 0, total: 0, qtd: 0, somaCsat: 0 };
        }
        resumo[item.nome].chat += (item.chat || 0);
        resumo[item.nome].inbox += (item.inbox || 0);
        resumo[item.nome].total += (item.volume || 0);
        resumo[item.nome].somaCsat += csatVal;
        resumo[item.nome].qtd++;
    });

    const mediaGeralCsat = (somaCsatGeral / lista.length).toFixed(1);

    document.getElementById('totalChatPeriodo').innerText = tChat;
    document.getElementById('totalInboxPeriodo').innerText = tInbox;
    document.getElementById('totalGeralPeriodo').innerText = tVol;
    document.getElementById('valorMedia').innerText = (tVol / lista.length).toFixed(2);
    
    const elCsatGeral = document.getElementById('totalCsatGeral');
    if (elCsatGeral) {
        elCsatGeral.innerText = mediaGeralCsat + "%";
        elCsatGeral.className = `destaque-media ${mediaGeralCsat >= 80 ? 'csat-bom' : 'csat-ruim'}`;
    }

    let html = "<h4>Resumo Individual no Período:</h4><ul style='list-style:none; padding:0;'>";
    Object.keys(resumo).sort().forEach(nome => {
        const r = resumo[nome];
        const mInd = (r.total / r.qtd).toFixed(2);
        const mCsat = (r.somaCsat / r.qtd).toFixed(1);
        const corCsat = mCsat >= 80 ? "#28a745" : "#d9534f";

        html += `<li class="resumo-item">
                    <b>${nome}</b>: Chat: ${r.chat} | Inbox: ${r.inbox} | Total: ${r.total} | 
                    Média: <b>${mInd}</b> | CSAT Médio: <b style="color:${corCsat}">${mCsat}%</b>
                 </li>`;
    });
    html += "</ul>";
    document.getElementById('resumoIndividual').innerHTML = html;
}

/* --- FUNÇÕES DE EXCLUSÃO --- */
window.apagarRegistro = async (id) => { 
    if (confirm("Excluir este registro?")) await deleteDoc(doc(db, "producao", id)); 
};

window.excluirAtendenteCompleto = async () => {
    const nome = prompt("Digite o nome EXATO do atendente para excluir TODO o histórico:");
    if (!nome) return;
    if (confirm(`ALERTA: Isso apagará permanentemente todos os registros de ${nome}. Confirma?`)) {
        try {
            const q = query(collection(db, "producao"), where("nome", "==", nome));
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            alert(`Histórico de ${nome} removido.`);
        } catch (e) { alert("Erro ao excluir atendente."); }
    }
};

/* --- UTILITÁRIOS --- */
window.limparFiltros = () => {
    document.querySelectorAll('#containerCheckboxes input').forEach(cb => cb.checked = false);
    ['dataInicio', 'dataFim'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('ordenacao').value = 'data_desc';
    filtrar();
};

window.gerarRelatorio = () => window.print();
window.logout = () => signOut(auth);