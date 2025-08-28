// src/components/ChatComponent.tsx

import React, { useState, useRef, useEffect } from 'react';

// Tipos para as mensagens e ações
interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'assistant';
  data?: any;
}

interface AssistantAction {
  action: string;
  parameters: any;
}

interface ChatComponentProps {
  onActionExecute: (action: AssistantAction) => void;
  onClose: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ChatComponent: React.FC<ChatComponentProps> = ({ onActionExecute, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Efeito para rolar para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mensagem inicial do assistente
  useEffect(() => {
    setMessages([
      {
        id: Date.now(),
        text: 'Olá! Sou seu assistente agronômico. Como posso ajudar hoje? Você pode pedir, por exemplo: "procure imagens de julho com poucas nuvens".',
        sender: 'assistant'
      }
    ]);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userPrompt = userInput.trim();
    if (!userPrompt) return;

    // Pega o histórico atual ANTES de adicionar a nova mensagem
    const currentHistory = messages;
    
    setMessages(prev => [...prev, { id: Date.now(), text: userPrompt, sender: 'user' }]);
    setUserInput('');
    setIsLoading(true);

    // Formata o histórico para a API
    const apiHistory = currentHistory.map(msg => ({
        role: msg.sender,
        content: msg.text
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prompt: userPrompt,
            history: apiHistory // Envia o histórico (Módulo 2)
        })
      });

      if (!response.ok) throw new Error('Falha na comunicação com o assistente.');
      
      const assistantData = await response.json();

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: assistantData.response_text,
        sender: 'assistant',
        data: assistantData.response_data
      }]);

      if (assistantData.action_taken) {
        onActionExecute({
          action: assistantData.action_taken,
          parameters: assistantData.response_data
        });
      }

    } catch (error) {
      console.error("Erro ao comunicar com o assistente:", error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: 'Ocorreu um erro de comunicação. Por favor, tente novamente.',
        sender: 'assistant'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <span>Assistente Agronômico</span>
        <button onClick={onClose} className="chat-close-btn">&times;</button>
      </div>
      <div className="chat-messages-area">
        {messages.map(msg => (
          <div key={msg.id} className={`message-bubble ${msg.sender}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        {isLoading && (
          <div className="message-bubble assistant">
            <div className="loading-dots"><span></span><span></span><span></span></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="chat-form">
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Digite seu pedido..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Enviar</button>
      </form>
    </div>
  );
};

export default ChatComponent;