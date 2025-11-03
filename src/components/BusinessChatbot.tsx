import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, X, Bot, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

interface BusinessChatbotProps {
  companyData?: any;
}

const BusinessChatbot: React.FC<BusinessChatbotProps> = ({ companyData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hi! I'm your business advisor. I can help you navigate the platform, understand tender opportunities, and provide business advice. What would you like to know?",
      isBot: true,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateChatbotResponse = async (userMessage: string) => {
    try {
      const contextPrompt = `You are a business advisor chatbot for a tender matching platform. 
      
      Company Context: ${companyData ? `
      Company: ${companyData.company_name}
      Industry: ${companyData.description}
      Capabilities: ${companyData.key_capabilities}
      Certifications: ${companyData.certifications}
      Equipment: ${companyData.equipment}
      ` : 'No company data available'}
      
      Platform Features:
      - Profile Management: Companies can update their profiles, add capabilities, certifications
      - Tender Matching: AI-powered matching with government and private tenders
      - Consulting Team Builder: Partner with other companies for larger opportunities
      - Partner Recommendations: Find complementary businesses to work with
      
      Your role:
      - Guide users through platform features
      - Provide business advice for winning tenders
      - Suggest profile improvements
      - Recommend partnership strategies
      - Help with tender application strategies
      
      Keep responses helpful, concise, and actionable. Focus on practical business advice.
      
      User question: ${userMessage}`;

      const { data, error } = await supabase.functions.invoke('chat-advisor', {
        body: { prompt: contextPrompt }
      });

      if (error) throw error;
      return data.response;
    } catch (error) {
      console.error('Chatbot error:', error);
      return "I apologize, but I'm having trouble connecting right now. Here are some quick tips: 1) Keep your profile updated with latest capabilities, 2) Check tender matches regularly, 3) Consider partnerships for larger opportunities. Please try again in a moment.";
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const botResponse = await generateChatbotResponse(inputValue);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: botResponse,
        isBot: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get response from advisor",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="mb-2 bg-background border border-border rounded-lg shadow-lg p-3 max-w-48 animate-pulse">
          <p className="text-xs text-muted-foreground">💡 Need help? Ask me about platform features or business advice!</p>
        </div>
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-14 h-14 shadow-lg bg-primary hover:bg-primary/90"
          size="sm"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[32rem] shadow-xl border-2 z-50 flex flex-col bg-background">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Business Advisor</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 p-4 max-h-[20rem]">
          <div className="space-y-3 pr-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.isBot
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {message.isBot ? (
                      <Bot className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    ) : (
                      <User className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed break-words overflow-wrap-anywhere">{message.content}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary text-secondary-foreground rounded-lg p-3 max-w-[85%]">
                  <div className="flex items-center space-x-2">
                    <Bot className="w-4 h-4 flex-shrink-0" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t bg-background">
          <div className="flex space-x-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything..."
              className="flex-1 text-sm"
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              size="sm"
              className="px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BusinessChatbot;