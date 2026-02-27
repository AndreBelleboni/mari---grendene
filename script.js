import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];
let meuGrafico = null; 

/* --- CONTROLE DE ACESSO --- */
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

/* --- FUNÇÕES DE INTERFACE (MOSTRAR/ESCONDER) --- */
window.toggleGrafico = () => {
    const check = document.getElementById('exibirGrafico').checked;
    const container = document.getElementById('containerDoGrafico');
    container.style.display = check ? 'block' : 'none';
    if (check) filtrar(); 
};

window.togglePerformance = () => {
    const check = document.getElementById('exibirTabela').checked;
    const container = document.getElementById('containerPerformance');
    container.style.display = check ? 'block' : 'none';
};

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

    const nC = prompt(`Novo Chat para ${item.nome}:`, item.chat);
    const nI = prompt(`Novo Inbox para ${item.nome}:`, item.inbox);
    const nS = prompt(`Novo CSAT % para ${item.nome}:`, item.csat);

    if (nC !== null && nI !== null && nS !== null) {
        const vC = parseInt(nC) || 0;
        const vI = parseInt(nI) || 0;
        const vS = parseFloat(nS) || 0;
        try {
            await updateDoc(doc(db, "producao", id), {
                chat: vC, inbox: vI, csat: vS, volume: vC + vI
            });
        } catch (e) { alert("Erro ao atualizar."); }
    }
};

/* --- ESCUTAR DADOS DO FIREBASE --- */
function escutarDados() {
    onSnapshot(collection(db, "producao"), (snapshot) => {
        registrosLocais = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListasDeNomes(); 
        atualizarSugestoesAutocomplete(); 
        filtrar();
    });
}

/* --- AUTOCOMPLETE E FILTROS --- */
function atualizarSugestoesAutocomplete() {
    const datalist = document.getElementById('listaNomes');
    if (!datalist) return;
    const nomesUnicos = [...new Set(registrosLocais.map(item => item.nome))].filter(n => n).sort();
    datalist.innerHTML = ''; 
    nomesUnicos.forEach(nome => {
        const opcao = document.createElement('option');
        opcao.value = nome;
        datalist.appendChild(opcao);
    });
}

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

/* --- FILTRAR E RENDERIZAR --- */
window.filtrar = () => {
    const selecionados = Array.from(document.querySelectorAll('#containerCheckboxes input:checked')).map(cb => cb.value);
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipoOrdem = document.getElementById('ordenacao').value;
    const tipoMetrica = document.getElementById('tipoGrafico').value;
    const graficoAtivo = document.getElementById('exibirGrafico').checked;
    
    let filtrados = registrosLocais.filter(item => {
        const bateNome = selecionados.length === 0 || selecionados.includes(item.nome);
        const noPeriodo = (!dataIni || item.data >= dataIni) && (!dataFim || item.data <= dataFim);
        return bateNome && noPeriodo;
    });

    // Ordenação da Tabela
    filtrados.sort((a, b) => {
        if (tipoOrdem === "data_asc") return a.data.localeCompare(b.data);
        if (tipoOrdem === "data_desc") return b.data.localeCompare(a.data);
        if (tipoOrdem === "maior") return (b.volume || 0) - (a.volume || 0);
        if (tipoOrdem === "menor") return (a.volume || 0) - (b.volume || 0);
        if (tipoOrdem === "alfabetica") return a.nome.localeCompare(b.nome);
        return 0;
    });

    const temFiltro = selecionados.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = temFiltro ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    
    if (filtrados.length > 0) {
        processarMetricas(filtrados);
        if (graficoAtivo) {
            // Para o gráfico, sempre ordenamos por data crescente
            const paraGrafico = [...filtrados].sort((a, b) => a.data.localeCompare(b.data));
            gerarGrafico(paraGrafico, tipoMetrica);
        }
    }
};

/* --- GERAR GRÁFICO --- */
function gerarGrafico(dados, metrica) {
    const canvas = document.getElementById('graficoEvolucao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuGrafico) meuGrafico.destroy();

    const dadosAgrupados = dados.reduce((acc, item) => {
        const dataFormatada = item.data.split('-').reverse().slice(0, 2).join('/');
        if (!acc[dataFormatada]) acc[dataFormatada] = { soma: 0, qtd: 0 };
        acc[dataFormatada].soma += (item[metrica] || 0);
        acc[dataFormatada].qtd++;
        return acc;
    }, {});

    const labels = Object.keys(dadosAgrupados);
    const valores = Object.values(dadosAgrupados).map(d => 
        metrica === 'csat' ? (d.soma / d.qtd).toFixed(1) : d.soma
    );

    const coresPontos = valores.map(v => {
        if (metrica === 'csat') return v >= 80 ? '#28a745' : '#d9534f'; 
        if (metrica === 'volume') return v >= 120 ? '#28a745' : '#d9534f';
        return '#007bff';
    });

    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: metrica.toUpperCase(),
                data: valores,
                borderColor: (metrica === 'csat' || metrica === 'volume') ? '#666' : '#007bff',
                pointBackgroundColor: coresPontos,
                pointRadius: 6,
                borderWidth: 2,
                tension: 0.3,
                fill: (metrica !== 'csat' && metrica !== 'volume')
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: metrica === 'csat' ? 100 : undefined } }
        }
    });
}

/* --- RENDERIZAR TABELA --- */
window.renderizarTabela = (lista) => {
    const corpo = document.getElementById('corpoTabela');
    if (!corpo) return;
    corpo.innerHTML = '';
    lista.forEach(item => {
        const vS = parseFloat(item.csat) || 0;
        corpo.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.data.split('-').reverse().join('/')}</td>
                <td>${item.chat || 0}</td>
                <td>${item.inbox || 0}</td>
                <td>${item.volume || 0}</td>
                <td><span class="${item.volume >= 120 ? 'meta-ok' : 'meta-ruim'}">${item.volume >= 120 ? 'Acima' : 'Abaixo'}</span></td>
                <td><span class="${vS >= 80 ? 'csat-bom' : 'csat-ruim'}">${vS}%</span></td>
                <td>
                    <button class="btn-editar" onclick="editarRegistro('${item.id}')">✏️</button>
                    <button class="btn-excluir" onclick="apagarRegistro('${item.id}')">🗑️</button>
                </td>
            </tr>`;
    });
};

/* --- PROCESSAR MÉTRICAS --- */
function processarMetricas(lista) {
    let tC = 0, tI = 0, tV = 0, sS = 0;
    const resumo = {};

    lista.forEach(item => {
        const csat = parseFloat(item.csat) || 0;
        tC += (item.chat || 0); tI += (item.inbox || 0); tV += (item.volume || 0); sS += csat;

        if (!resumo[item.nome]) {
            resumo[item.nome] = { chat: 0, inbox: 0, total: 0, qtd: 0, ultimoCsat: csat, ultimaData: item.data };
        } else if (item.data >= resumo[item.nome].ultimaData) {
            resumo[item.nome].ultimoCsat = csat;
            resumo[item.nome].ultimaData = item.data;
        }
        resumo[item.nome].chat += (item.chat || 0);
        resumo[item.nome].inbox += (item.inbox || 0);
        resumo[item.nome].total += (item.volume || 0);
        resumo[item.nome].qtd++;
    });

    const mGeralS = (sS / lista.length).toFixed(1);
    document.getElementById('totalChatPeriodo').innerText = tC;
    document.getElementById('totalInboxPeriodo').innerText = tI;
    document.getElementById('totalGeralPeriodo').innerText = tV;
    document.getElementById('valorMedia').innerText = (tV / lista.length).toFixed(2);
    
    const elS = document.getElementById('totalCsatGeral');
    elS.innerText = mGeralS + "%";
    elS.className = `destaque-media ${mGeralS >= 80 ? 'csat-bom' : 'csat-ruim'}`;

    let html = "<h4>Resumo Individual no Período:</h4><ul style='list-style:none; padding:0;'>";
    Object.keys(resumo).sort().forEach(nome => {
        const r = resumo[nome];
        const mI = (r.total / r.qtd).toFixed(2);
        const cor = r.ultimoCsat >= 80 ? "#28a745" : "#d9534f";
        html += `<li class="resumo-item"><b>${nome}</b>: Total: ${r.total} | Média: ${mI} | Último CSAT: <b style="color:${cor}">${r.ultimoCsat}%</b></li>`;
    });
    document.getElementById('resumoIndividual').innerHTML = html;
}

/* --- EXCLUSÃO E UTILITÁRIOS --- */
window.apagarRegistro = async (id) => { 
    if (confirm("Excluir este registro?")) await deleteDoc(doc(db, "producao", id)); 
};

window.excluirAtendenteCompleto = async () => {
    const nome = prompt("Digite o nome EXATO do atendente para excluir TUDO:");
    if (nome && confirm(`Apagar todo o histórico de ${nome}?`)) {
        const q = query(collection(db, "producao"), where("nome", "==", nome));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
};

window.limparFiltros = () => {
    document.querySelectorAll('#containerCheckboxes input').forEach(cb => cb.checked = false);
    ['dataInicio', 'dataFim'].forEach(id => document.getElementById(id).value = '');
    filtrar();
};

window.logout = () => signOut(auth);
window.gerarRelatorio = () => window.print();