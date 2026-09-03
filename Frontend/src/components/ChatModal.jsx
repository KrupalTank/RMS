// src/components/ChatModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { X, Send, Shield, RefreshCw, Clock } from 'lucide-react';

const ChatModal = ({ isOpen, onClose, conversation, socket }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isOpen || !conversation?.id) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/chat/messages/${conversation.id}`);
        if (res.data.success) {
          setMessages(res.data.messages || []);
        }
      } catch (err) {
        console.error('Fetch chat messages error:', err);
      } finally {
        setLoading(false);
        setTimeout(scrollToBottom, 50);
      }
    };

    fetchMessages();

    if (socket) {
      socket.emit('join_room', `conversation_${conversation.id}`);

      const handleIncomingMessage = (newMsg) => {
        if (newMsg.conversation_id === conversation.id) {
          setMessages((prev) => [...prev, newMsg]);
          setTimeout(scrollToBottom, 50);
        }
      };

      socket.on('NEW_MESSAGE', handleIncomingMessage);

      return () => {
        socket.off('NEW_MESSAGE', handleIncomingMessage);
      };
    }
  }, [isOpen, conversation, socket]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      const res = await api.post('/chat/sendMessage', {
        conversation_id: conversation.id,
        message_text: input.trim(),
      });

      if (res.data.success) {
        setInput('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSending(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  if (!isOpen || !conversation) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[520px]">
      {/* Header */}
      <div className="p-3.5 bg-blue-600 text-white flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <h3 className="text-xs font-black truncate">
            {conversation.vendor_name || 'Equipment Vendor'}
          </h3>
          <p className="text-[10px] text-blue-100 truncate">
            {conversation.product_title || 'Rental Inquiry'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-blue-700 rounded-lg text-blue-100 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Safety Notice */}
      <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-100 flex items-center gap-1.5 text-[10px] text-blue-800">
        <Shield className="w-3.5 h-3.5 flex-shrink-0 text-blue-600" />
        <span className="truncate">Inquiry chats expire after 3 days of inactivity.</span>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50/50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 space-y-1">
            <Clock className="w-6 h-6 mx-auto text-gray-300" />
            <p className="text-xs font-semibold">Start your equipment inquiry</p>
            <p className="text-[10px]">Ask the vendor about accessories or pickup timing.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.message_text}</p>
                </div>
                <span className="text-[9px] text-gray-400 px-1 mt-0.5">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="p-2.5 border-t border-gray-200 bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask vendor a question..."
          className="flex-1 text-xs p-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

export default ChatModal;