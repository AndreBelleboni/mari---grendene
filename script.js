import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];
let meuGrafico = null; 

// Registrar o plugin para mostrar números nos pontos do gráfico
Chart.register(ChartDataLabels);

/* --- CONTROLE DE ACESSO --- */
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

/* --- INTERFACE --- */
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

/* --- SALVAR E EDITAR (COM SUPORTE A VÍRGULA) --- */
window.salvarDados = async () => {
    const nome = document.getElementById('nome').value.trim();
    const data = document.getElementById('data').value;
    const chat = parseInt(document.getElementById('chat').value) || 0;
    const inbox = parseInt(document.getElementById('inbox').value) || 0;
    
    const csatInput = document.getElementById('csat').value;
    const csat = parseFloat(csatInput.toString().replace(',', '.')) || 0;
    
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal, csat: csat 
            });
            alert("Dados salvos!");
            ['nome', 'chat', 'inbox', 'csat', 'data'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.value = '';
            });
        } catch (e) { alert("Erro ao salvar."); }
    }
};

window.editarRegistro = async (id) => {
    const item = registrosLocais.find(r => r.id === id);
    if (!item) return;

    const nC = prompt(`Novo Chat:`, item.chat);
    const nI = prompt(`Novo Inbox:`, item.inbox);
    const nS = prompt(`Novo CSAT % (use vírgula se quiser):`, item.csat);

    if (nC !== null && nI !== null && nS !== null) {
        const vC = parseInt(nC) || 0;
        const vI = parseInt(nI) || 0;
        const vS = parseFloat(nS.toString().replace(',', '.')) || 0;
        try {
            await updateDoc(doc(db, "producao", id), {
                chat: vC, inbox: vI, csat: vS, volume: vC + vI
            });
        } catch (e) { alert("Erro ao atualizar."); }
    }
};

/* --- ESCUTAR E FILTRAR --- */
function escutarDados() {
    onSnapshot(collection(db, "producao"), (snapshot) => {
        registrosLocais = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListasDeNomes(); 
        atualizarSugestoesAutocomplete(); 
        filtrar();
    });
}

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

    filtrados.sort((a, b) => {
        if (tipoOrdem === "data_asc") return a.data.localeCompare(b.data);
        if (tipoOrdem === "data_desc") return b.data.localeCompare(a.data);
        if (tipoOrdem === "maior") return (b.volume || 0) - (a.volume || 0);
        if (tipoOrdem === "menor") return (a.volume || 0) - (b.volume || 0);
        return a.nome.localeCompare(b.nome);
    });

    document.getElementById('secaoResultados').style.display = (selecionados.length > 0 || dataIni) ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    if (filtrados.length > 0) {
        processarMetricas(filtrados);
        if (graficoAtivo) {
            const paraGrafico = [...filtrados].sort((a, b) => a.data.localeCompare(b.data));
            gerarGrafico(paraGrafico, tipoMetrica, selecionados);
        }
    }
};

/* --- NOVO GRÁFICO (MÚLTIPLAS LINHAS + NÚMEROS FIXOS) --- */
function gerarGrafico(dados, metrica, selecionados) {
    const canvas = document.getElementById('graficoEvolucao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuGrafico) meuGrafico.destroy();

    const datasUnicas = [...new Set(dados.map(d => d.data))].sort();
    const labelsFormatadas = datasUnicas.map(d => d.split('-').reverse().slice(0, 2).join('/'));

    const nomesNoGrafico = selecionados.length > 0 ? selecionados : [...new Set(dados.map(d => d.nome))];
    const cores = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6610f2', '#fd7e14', '#20c997'];

    const datasets = nomesNoGrafico.map((nome, index) => {
        const corBase = cores[index % cores.length];
        const valoresData = datasUnicas.map(data => {
            const reg = dados.find(d => d.data === data && d.nome === nome);
            if (!reg) return null;
            return metrica === 'csat' ? reg.csat : reg[metrica];
        });

        return {
            label: nome,
            data: valoresData,
            borderColor: corBase,
            backgroundColor: corBase,
            pointRadius: 6,
            tension: 0.2,
            spanGaps: true,
            datalabels: {
                align: 'top',
                anchor: 'end',
                formatter: (val) => val !== null ? (metrica === 'csat' ? val + '%' : val) : ''
            }
        };
    });

    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels: labelsFormatadas, datasets: datasets },
        options: {
            responsive: true,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: true, position: 'top' },
                datalabels: {
                    display: true,
                    color: '#444',
                    font: { weight: 'bold', size: 11 },
                    padding: 4
                }
            },
            scales: { y: { beginAtZero: true, max: metrica === 'csat' ? 110 : undefined } }
        }
    });
}

/* --- TABELA E MÉTRICAS --- */
window.renderizarTabela = (lista) => {
    const corpo = document.getElementById('corpoTabela');
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

    document.getElementById('totalChatPeriodo').innerText = tC;
    document.getElementById('totalInboxPeriodo').innerText = tI;
    document.getElementById('totalGeralPeriodo').innerText = tV;
    document.getElementById('valorMedia').innerText = (tV / lista.length).toFixed(2);
    document.getElementById('totalCsatGeral').innerText = (sS / lista.length).toFixed(1) + "%";

    let html = "<h4>Resumo Individual no Período:</h4><ul style='list-style:none; padding:0;'>";
    Object.keys(resumo).sort().forEach(nome => {
        const r = resumo[nome];
        const cor = r.ultimoCsat >= 80 ? "#28a745" : "#d9534f";
        html += `<li class="resumo-item" style="margin-bottom:8px;">
            <b>${nome}</b>: Chat: ${r.chat} | Inbox: ${r.inbox} | Total: ${r.total} |  CSAT: <b style="color:${cor}">${r.ultimoCsat}%</b>
        </li>`;
    });
    document.getElementById('resumoIndividual').innerHTML = html + "</ul>";
}

/* --- UTILITÁRIOS --- */
window.apagarRegistro = async (id) => { if (confirm("Excluir registro?")) await deleteDoc(doc(db, "producao", id)); };
window.excluirAtendenteCompleto = async () => {
    const n = prompt("Nome EXATO do atendente para excluir tudo:");
    if (n && confirm(`Apagar histórico de ${n}?`)) {
        const snap = await getDocs(query(collection(db, "producao"), where("nome", "==", n)));
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