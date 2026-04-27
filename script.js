import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let registrosLocais = [];
let meuGrafico = null; 

// Registrar o plugin para mostrar números (Datalabels)
Chart.register(ChartDataLabels);

/* --- CONTROLE DE ACESSO --- */
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else escutarDados();
});

/* --- FUNÇÕES DE INTERFACE --- */
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
    
    const csatOpInput = document.getElementById('csatOperacional').value;
    const csatOp = parseFloat(csatOpInput.toString().replace(',', '.')) || 0;
    
    const csatAtInput = document.getElementById('csat').value;
    const csatAt = parseFloat(csatAtInput.toString().replace(',', '.')) || 0;
    
    const volumeTotal = chat + inbox;

    if (nome && data) {
        try {
            await addDoc(collection(db, "producao"), { 
                nome, data, chat, inbox, volume: volumeTotal, 
                csat: csatAt, 
                csatOp: csatOp 
            });
            alert("Dados salvos com sucesso!");
            ['nome', 'chat', 'inbox', 'csat', 'csatOperacional', 'data'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.value = '';
            });
        } catch (e) { alert("Erro ao salvar no banco de dados."); }
    } else {
        alert("Por favor, preencha Nome e Data.");
    }
};

/* --- EDITAR REGISTRO --- */
window.editarRegistro = async (id) => {
    const item = registrosLocais.find(r => r.id === id);
    if (!item) return;
    const nC = prompt(`Novo Chat para ${item.nome}:`, item.chat);
    const nI = prompt(`Novo Inbox para ${item.nome}:`, item.inbox);
    const nSOp = prompt(`Novo CSAT Operacional %:`, item.csatOp || 0);
    const nSAt = prompt(`Novo CSAT Atendimento %:`, item.csat);

    if (nC !== null && nI !== null && nSOp !== null && nSAt !== null) {
        const vC = parseInt(nC) || 0;
        const vI = parseInt(nI) || 0;
        const vSOp = parseFloat(nSOp.toString().replace(',', '.')) || 0;
        const vSAt = parseFloat(nSAt.toString().replace(',', '.')) || 0;
        try {
            await updateDoc(doc(db, "producao", id), {
                chat: vC, inbox: vI, csatOp: vSOp, csat: vSAt, volume: vC + vI
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
    const marcados = Array.from(document.querySelectorAll('#containerCheckboxes input:checked')).map(cb => cb.value);
    
    containerCheck.innerHTML = ''; 
    nomesUnicos.forEach(nome => {
        const label = document.createElement('label');
        label.className = 'item-checkbox';
        const isChecked = marcados.includes(nome) ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${nome}" onchange="filtrar()" ${isChecked}> <span>${nome}</span>`;
        containerCheck.appendChild(label);
    });
}

/* --- FILTRAR E RENDERIZAR --- */
window.filtrar = () => {
    const selecionados = Array.from(document.querySelectorAll('#containerCheckboxes input:checked')).map(cb => cb.value);
    const dataIni = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const graficoAtivo = document.getElementById('exibirGrafico').checked;
    
    let filtrados = registrosLocais.filter(item => {
        const bateNome = selecionados.length === 0 || selecionados.includes(item.nome);
        const noPeriodo = (!dataIni || item.data >= dataIni) && (!dataFim || item.data <= dataFim);
        return bateNome && noPeriodo;
    });

    filtrados.sort((a, b) => {
        if (a.data !== b.data) return a.data.localeCompare(b.data); 
        return a.nome.localeCompare(b.nome);
    });

    const temFiltro = selecionados.length > 0 || dataIni || dataFim;
    document.getElementById('secaoResultados').style.display = temFiltro ? 'block' : 'none';
    
    renderizarTabela(filtrados);
    
    if (filtrados.length > 0) {
        processarMetricas(filtrados);
        if (graficoAtivo) gerarGrafico(filtrados);
    }
};

/* --- GERAR GRÁFICO --- */
function gerarGrafico(dados) {
    const canvas = document.getElementById('graficoEvolucao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuGrafico) meuGrafico.destroy();

    const labelsEixoX = dados.map(d => {
        const dataPt = d.data.split('-').reverse().slice(0, 2).join('/');
        const primeiroNome = d.nome.split(' ')[0];
        return [dataPt, primeiroNome]; 
    });

    const coresDisponiveis = [
        '#004a99', '#e6194b', '#3cb44b', '#f58231', '#911eb4', 
        '#06cefb', '#f032e6', '#f6f606', '#469990', '#ad5e04',
        '#800000', '#05f84e', '#808000', '#ffd8b1', '#000075',
        '#a9a9a9', '#fabebe', '#9c05f9', '#59584a', '#000000'
    ];
    
    const nomesUnicos = [...new Set(registrosLocais.map(r => r.nome))].sort();
    const mapaCores = {};
    nomesUnicos.forEach((nome, i) => { mapaCores[nome] = coresDisponiveis[i % coresDisponiveis.length]; });
    const coresDasBarras = dados.map(d => mapaCores[d.nome]);

    meuGrafico = new Chart(ctx, {
        data: {
            labels: labelsEixoX,
            datasets: [
                {
                    label: 'Volume Total',
                    type: 'bar',
                    data: dados.map(d => d.volume),
                    backgroundColor: coresDasBarras,
                    borderColor: coresDasBarras,
                    borderWidth: 1,
                    yAxisID: 'y',
                    datalabels: {
                        anchor: 'end', align: 'top', color: '#444', font: { weight: 'bold' }
                    }
                },
                {
                    label: 'CSAT - Atendimento %',
                    type: 'line',
                    data: dados.map(d => d.csat),
                    borderColor: '#444', 
                    pointBackgroundColor: coresDasBarras, 
                    pointBorderColor: '#fff',
                    pointRadius: 6,
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    datalabels: {
                        anchor: 'center', align: 'right', offset: 10, color: '#333',
                        formatter: (v) => v + '%', font: { weight: 'bold' }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true, position: 'top',
                    labels: {
                        generateLabels: (chart) => [
                            { text: 'Volume (Barras)', fillStyle: '#004a99', strokeStyle: '#004a99' },
                            { text: 'CSAT - Atendimento % (Linha)', fillStyle: '#444', strokeStyle: '#444' }
                        ]
                    }
                }
            },
            scales: {
                x: { ticks: { font: { size: 10, weight: 'bold' }, autoSkip: false } },
                y: { beginAtZero: true },
                y1: { beginAtZero: true, min: 0, max: 120, position: 'right', grid: { drawOnChartArea: false } }
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
        const vSOp = parseFloat(item.csatOp) || 0;
        const vSAt = parseFloat(item.csat) || 0;
        corpo.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.data.split('-').reverse().join('/')}</td>
                <td>${item.chat || 0}</td>
                <td>${item.inbox || 0}</td>
                <td>${item.volume || 0}</td>
                <td><span class="${vSOp >= 80 ? 'meta-ok' : 'meta-ruim'}">${vSOp}%</span></td>
                <td><span class="${vSAt >= 80 ? 'csat-bom' : 'csat-ruim'}">${vSAt}%</span></td>
                <td>
                    <button class="btn-editar" onclick="editarRegistro('${item.id}')">✏️</button>
                    <button class="btn-excluir" onclick="apagarRegistro('${item.id}')">🗑️</button>
                </td>
            </tr>`;
    });
};

/* --- PROCESSAR MÉTRICAS (RESUMO INDIVIDUAL + MÉDIA CSAT ÚLTIMO DIA) --- */
function processarMetricas(lista) {
    let tChat = 0, tInbox = 0, tGeral = 0;
    const operadores = {};

    // 1. Acumular valores totais e identificar a última data geral
    lista.forEach(item => {
        tChat += (item.chat || 0);
        tInbox += (item.inbox || 0);
        tGeral += (item.volume || 0);

        if (!operadores[item.nome]) {
            operadores[item.nome] = { 
                chat: 0, inbox: 0, volume: 0, 
                ultimaData: item.data, csatOp: 0, csatAt: 0 
            };
        }

        // Soma total do período selecionado
        operadores[item.nome].chat += (item.chat || 0);
        operadores[item.nome].inbox += (item.inbox || 0);
        operadores[item.nome].volume += (item.volume || 0);

        // Captura o CSAT da última data de cada operador
        if (item.data >= operadores[item.nome].ultimaData) {
            operadores[item.nome].ultimaData = item.data;
            operadores[item.nome].csatOp = item.csatOp || 0;
            operadores[item.nome].csatAt = item.csat || 0;
        }
    });

    // 2. Cálculo das Médias de CSAT (Apenas para os registros da última data absoluta da lista)
    const datas = lista.map(item => item.data);
    const dataMaisRecenteGlobal = datas.reduce((a, b) => a > b ? a : b);
    const registrosUltimaData = lista.filter(item => item.data === dataMaisRecenteGlobal);
    
    let somaOpGeral = 0, somaAtGeral = 0;
    registrosUltimaData.forEach(item => {
        somaOpGeral += parseFloat(item.csatOp) || 0;
        somaAtGeral += parseFloat(item.csat) || 0;
    });

    const mOpFinal = (somaOpGeral / registrosUltimaData.length).toFixed(1);
    const mAtFinal = (somaAtGeral / registrosUltimaData.length).toFixed(1);

    // 3. Atualizar Cards de Totais Gerais (Interface Superior)
    document.getElementById('totalChatPeriodo').innerText = tChat;
    document.getElementById('totalInboxPeriodo').innerText = tInbox;
    document.getElementById('totalGeralPeriodo').innerText = tGeral;
    
    const numDias = [...new Set(lista.map(i => i.data))].length;
    document.getElementById('valorMedia').innerText = (tGeral / numDias).toFixed(2);

    // 4. Atualizar os Cards de CSAT (Interface Final/Rodapé)
    const elOp = document.getElementById('mediaCsatOpRecente');
    const elAt = document.getElementById('mediaCsatAtRecente');

    elOp.innerText = mOpFinal + "%";
    elOp.className = `destaque-media ${mOpFinal >= 80 ? 'meta-ok' : 'meta-ruim'}`;
    elAt.innerText = mAtFinal + "%";
    elAt.className = `destaque-media ${mAtFinal >= 80 ? 'csat-bom' : 'csat-ruim'}`;

    // 5. Gerar o HTML do Resumo Individual por Operador
    let html = `<h4>Resumo por Operador:</h4><ul style='list-style:none; padding:0;'>`;
    
    Object.keys(operadores).sort().forEach(nome => {
        const op = operadores[nome];
        const corAt = op.csatAt >= 80 ? "#28a745" : "#d9534f";
        const corOp = op.csatOp >= 80 ? "#28a745" : "#d9534f";

        html += `
            <li class="resumo-item" style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                <b>${nome}</b>: 
                <br>
                <small><b>Total Att: ${op.volume}</b> | Chat: ${op.chat} | Inbox: ${op.inbox}</small>
                <br>
                <small><b>CSAT:</b>
                    Operação: <b><span style="color:${corOp}">${op.csatOp}%</span></b> | 
                    Atendimento: <b><span style="color:${corAt}">${op.csatAt}%</span></b>
                </small>
            </li>`;
    });
    
    document.getElementById('resumoIndividual').innerHTML = html + "</ul>";
}

/* --- UTILITÁRIOS --- */
window.apagarRegistro = async (id) => { 
    if (confirm("Deseja realmente excluir este registro?")) await deleteDoc(doc(db, "producao", id)); 
};

window.excluirAtendenteCompleto = async () => {
    const nome = prompt("Digite o nome EXATO do atendente:");
    if (nome && confirm(`Apagar TUDO de ${nome}?`)) {
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