// AI Assistant (FAQ-based chatbot)
document.addEventListener('DOMContentLoaded', () => {
    initAIChat();
});

function initAIChat() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');
    const chatMessages = document.getElementById('chatMessages');
    const quickQuestions = document.querySelectorAll('.quick-question');
    
    if (!chatMessages) return;
    
    // Add initial greeting
    addMessage('¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte?', 'bot');
    
    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', () => {
            sendMessage();
        });
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // Quick questions
    quickQuestions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const question = e.target.textContent;
            if (chatInput) {
                chatInput.value = question;
                sendMessage();
            }
        });
    });
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    input.value = '';
    
    // Get bot response
    setTimeout(() => {
        const response = getBotResponse(message);
        addMessage(response, 'bot');
    }, 500);
}

function addMessage(text, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    
    messageDiv.innerHTML = `
        <div class="max-w-[80%] ${sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'} rounded-lg p-3 text-sm">
            ${text}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getBotResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // FAQ responses
    const responses = {
        'agregar inquilino': 'Para agregar un inquilino, ve a la sección "Inquilinos" y haz clic en el botón "Nuevo Inquilino". Completa el formulario con los datos requeridos y guarda.',
        'nuevo inquilino': 'Para agregar un inquilino, ve a la sección "Inquilinos" y haz clic en el botón "Nuevo Inquilino". Completa el formulario con los datos requeridos y guarda.',
        'calcular aumento': 'Para calcular un aumento, ve a la sección "Contratos", busca el contrato deseado y haz clic en el icono de calculadora. El sistema calculará automáticamente el nuevo monto según el tipo de incremento configurado.',
        'aumento': 'Los aumentos se calculan automáticamente según el tipo de índice configurado (IPC, IPS o fijo). Puedes ver los próximos aumentos en el dashboard o calcular uno específico desde la sección de contratos.',
        'enviar email': 'Para enviar un recordatorio por email, ve a la sección "Contratos", busca el contrato y haz clic en el icono de sobre. El sistema preparará un email con los datos calculados del próximo pago.',
        'email': 'Los emails se envían desde la sección de contratos. Primero calcula el aumento y luego usa el botón de email para enviar el recordatorio al inquilino.',
        'comisión': 'La comisión del agente se configura en cada contrato. Por defecto es 5%, pero puedes modificarlo al crear o editar un contrato.',
        'ayuda': 'Puedes preguntarme sobre: cómo agregar inquilinos, calcular aumentos, enviar emails, comisiones, o cualquier duda del sistema.'
    };
    
    // Find matching response
    for (const [key, response] of Object.entries(responses)) {
        if (lowerMessage.includes(key)) {
            return response;
        }
    }
    
    // Default response
    return 'No entendí tu pregunta. Puedes preguntarme sobre cómo agregar inquilinos, calcular aumentos, enviar emails, o configurar comisiones.';
}