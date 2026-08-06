import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/ai-chat/chat-panel";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Sparkles}
        title="Chat"
        description="Ask about ShopLaLa or this portal"
      />
      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}
