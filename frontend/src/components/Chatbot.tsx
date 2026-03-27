import React, { useState } from 'react';
import { MessageSquare, Send, Sparkles, X } from 'lucide-react';
import api from '../api/client';

export const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy Grok, tu experto en CamelFarm. ¿En qué puedo ayudarte hoy a optimizar tus perfiles?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Logic for Grok via backend /api/ai/chat
      const { data } = await api.post('/ai/chat', { prompt: input });
      setMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error conectando con mis neuronas de Grok. Inténtalo de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen ? (
        <button 
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-brand-gradient flex items-center justify-center shadow-xl shadow-brand-500/20 hover:scale-110 transition-transform group"
        >
          <MessageSquare className="h-6 w-6 text-white" />
          <div className="absolute -top-1 -right-1 h-5 w-5 bg-accent-purple rounded-full flex items-center justify-center border-2 border-dark-950">
            <Sparkles className="h-3 w-3 text-white fill-white" />
          </div>
        </button>
      ) : (
        <div className="w-80 h-[450px] bg-dark-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 bg-brand-gradient flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-white fill-white" />
              <span className="font-bold text-white uppercase tracking-tighter">Grok Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)}><X className="h-5 w-5 text-white/70" /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  m.role === 'user' ? 'bg-brand-500 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl animate-pulse text-white/30 italic text-xs">
                  Grok está pensando...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10 flex gap-2">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pregúntame algo..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500/50"
            />
            <button 
              onClick={handleSend}
              className="p-2 bg-brand-500 rounded-xl text-white hover:bg-brand-600 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
