import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];
let meuGrafico = null; 

// Registrar o plugin para mostrar números nos pontos do gráfico (Datalabels)
Chart.register(ChartDataLabels);

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

/* --- SALVAR DADOS (SUPORTE A VÍRGULA NO CSAT) --- */
window.salvarDados = async () => {
    const nome = document.getElementById('nome').value.trim();
    const data = document.getElementById('data').value;
    const chat = parseInt(document.getElementById('chat').value) || 0;
    const inbox = parseInt(document.getElementById('inbox').value) || 0;
    
    // Converte vírgula em ponto antes de salvar no Firebase
    const csatInput = document.getElementById('csat').value;
    const csat = parseFloat(csatInput.toString().replace(',', '.')) || 0;
    
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal, csat: csat 
            });
            alert("Dados salvos com sucesso!");
            ['nome', 'chat', 'inbox', 'csat', 'data'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.value = '';
            });
        } catch (e) { alert("Erro ao salvar no banco de dados."); }
    } else {
        alert("Por favor, preencha Nome e Data.");
    }
};

/* --- EDITAR REGISTRO (SUPORTE A VÍRGULA NO PROMPT) --- */
window.editarRegistro = async (id) => {
    const item = registrosLocais.find(r => r.id === id);
    if (!item) return;

    const nC = prompt(`Novo Chat para ${item.nome}:`, item.chat);
    const nI = prompt(`Novo Inbox para ${item.nome}:`, item.inbox);
    const nS = prompt(`Novo CSAT % para ${item.nome}:`, item.csat);

    if (nC !== null && nI !== null && nS !== null) {
        const vC = parseInt(nC) || 0;
        const vI = parseInt(nI) || 0;
        const vS = parseFloat(nS.toString().replace(',', '.')) || 0;
        try {
            await updateDoc(doc(db, "producao", id), {
                chat: vC, inbox: vI, csat: vS, volume: vC + vI
            });
        } catch (e) { alert("Erro ao atualizar o registro."); }
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

/* --- AUTOCOMPLETE E CHECKBOXES --- */
function atualizarSugestoesAutocomplete() {
    const datalist = document.getElementById('listaNomes');
    if (!datalist) return;
    const nomesUnicos = [...new Set(registrosLocais.map(item => item.nome))].filter(n => n).sort();
    datalist.innerHTML = ''; 
    nomesUnicos.forEach(nome => {
        const o = document.createElement('option'); o.value = nome; datalist.appendChild(o);
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

/* --- FILTRAR E RENDERIZAR (COM ORDENAÇÃO DUPLA) --- */
window.filtrar = () => {
    const selecionados = Array.from(document.querySelectorAll('#containerCheckboxes input:checked')).map(cb => cb.value);
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipoMetrica = document.getElementById('tipoGrafico').value;
    const graficoAtivo = document.getElementById('exibirGrafico').checked;
    
    let filtrados = registrosLocais.filter(item => {
        const bateNome = selecionados.length === 0 || selecionados.includes(item.nome);
        const noPeriodo = (!dataIni || item.data >= dataIni) && (!dataFim || item.data <= dataFim);
        return bateNome && noPeriodo;
    });

    // ORDENAÇÃO: 1º Data (Antigo p/ Novo) e 2º Nome (Alfabética)
    filtrados.sort((a, b) => {
        if (a.data !== b.data) {
            return a.data.localeCompare(b.data); 
        }
        return a.nome.localeCompare(b.nome);
    });

    const temFiltro = selecionados.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = temFiltro ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    
    if (filtrados.length > 0) {
        processarMetricas(filtrados);
        if (graficoAtivo) {
            // O gráfico usa os dados já ordenados por data
            gerarGrafico(filtrados, tipoMetrica, selecionados);
        }
    }
};

/* --- GERAR GRÁFICO (MULTI-LINHAS E VALORES FIXOS) --- */
function gerarGrafico(dados, metrica, selecionados) {
    const canvas = document.getElementById('graficoEvolucao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuGrafico) meuGrafico.destroy();

    const datasUnicas = [...new Set(dados.map(d => d.data))].sort();
    const labelsFormatadas = datasUnicas.map(d => d.split('-').reverse().slice(0, 2).join('/'));

    // Garante que a legenda e as linhas sigam ordem alfabética
    const nomesNoGrafico = (selecionados.length > 0 ? selecionados : [...new Set(dados.map(d => d.nome))]).sort();
    const cores = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6610f2', '#fd7e14', '#20c997', '#e83e8c'];

    const datasets = nomesNoGrafico.map((nome, index) => {
        const corBase = cores[index % cores.length];
        const valoresData = datasUnicas.map(data => {
            const registro = dados.find(d => d.data === data && d.nome === nome);
            if (!registro) return null;
            return metrica === 'csat' ? registro.csat : (registro[metrica] || 0);
        });

        return {
            label: nome,
            data: valoresData,
            borderColor: corBase,
            backgroundColor: corBase,
            pointRadius: 6,
            borderWidth: 3,
            tension: 0.2,
            spanGaps: true, // Conecta os pontos se houver buracos na data
            datalabels: {
                display: true,
                align: 'top',
                anchor: 'end',
                offset: 2,
                formatter: (val) => val !== null ? (metrica === 'csat' ? val + '%' : val) : '',
                font: { weight: 'bold', size: 10 }
            }
        };
    });

    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels: labelsFormatadas, datasets: datasets },
        options: {
            responsive: true,
            layout: { padding: { top: 35, right: 10 } },
            plugins: {
                legend: { display: true, position: 'top' },
                datalabels: { color: '#444' }
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    max: metrica === 'csat' ? 115 : undefined // Margem extra para os labels
                } 
            }
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

/* --- PROCESSAR MÉTRICAS (RESUMO INDIVIDUAL COM CHAT/INBOX) --- */
function processarMetricas(lista) {
    let tC = 0, tI = 0, tV = 0, sS = 0;
    const resumo = {};

    lista.forEach(item => {
        const csat = parseFloat(item.csat) || 0;
        const vChat = (item.chat || 0);
        const vInbox = (item.inbox || 0);
        const vTotal = (item.volume || 0);

        tC += vChat; tI += vInbox; tV += vTotal; sS += csat;

        if (!resumo[item.nome]) {
            resumo[item.nome] = { chat: 0, inbox: 0, total: 0, qtd: 0, ultimoCsat: csat, ultimaData: item.data };
        } else if (item.data >= resumo[item.nome].ultimaData) {
            resumo[item.nome].ultimoCsat = csat;
            resumo[item.nome].ultimaData = item.data;
        }
        resumo[item.nome].chat += vChat;
        resumo[item.nome].inbox += vInbox;
        resumo[item.nome].total += vTotal;
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
    // Exibição do resumo em ordem alfabética
    Object.keys(resumo).sort().forEach(nome => {
        const r = resumo[nome];
        const mI = (r.total / r.qtd).toFixed(2);
        const cor = r.ultimoCsat >= 80 ? "#28a745" : "#d9534f";
        
        html += `<li class="resumo-item" style="margin-bottom: 8px;">
            <b>${nome}</b>: Chat: ${r.chat} | Inbox: ${r.inbox} | Total: ${r.total} | 
            Média: ${mI} | Último CSAT: <b style="color:${cor}">${r.ultimoCsat}%</b>
        </li>`;
    });
    html += "</ul>";
    document.getElementById('resumoIndividual').innerHTML = html;
}

/* --- EXCLUSÃO E UTILITÁRIOS --- */
window.apagarRegistro = async (id) => { 
    if (confirm("Deseja realmente excluir este registro?")) await deleteDoc(doc(db, "producao", id)); 
};

window.excluirAtendenteCompleto = async () => {
    const nome = prompt("Digite o nome EXATO do atendente para excluir TODO o histórico:");
    if (nome && confirm(`Apagar TUDO relacionado a ${nome}?`)) {
        const q = query(collection(db, "producao"), where("nome", "==", nome));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
};

window.limparFiltros = () => {
    document.querySelectorAll('#containerCheckboxes input').forEach(cb => cb.checked = false);
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    filtrar();
};

window.logout = () => signOut(auth);
window.gerarRelatorio = () => window.print();