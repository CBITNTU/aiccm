"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, CheckCircle } from "lucide-react";

interface OpenAIKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySet: () => void;
}

export function OpenAIKeyDialog({
  isOpen,
  onClose,
  onKeySet,
}: OpenAIKeyDialogProps) {
  const handleContinue = () => {
    onKeySet();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            AI Features Ready
          </DialogTitle>
          <DialogDescription>
            AI-powered company analysis is now available using our platform
            integration.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            AI analysis features are powered by our secure platform integration.
            No additional setup required - you can start using AI features right
            away!
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button onClick={handleContinue}>Continue with AI Features</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
