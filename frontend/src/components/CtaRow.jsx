import { Keyboard, Mic } from "lucide-react";

export default function CtaRow({ onTalk, onType, busy }) {
  return (
    <div className="cta-row enter enter-2">
      <button type="button" className="talk" onClick={onTalk} disabled={busy}>
        <Mic size={18} strokeWidth={1.5} />
        Talk to Bodh
      </button>
      <button type="button" className="ghost" onClick={onType} disabled={busy}>
        <Keyboard size={16} strokeWidth={1.5} />
        Type a question
      </button>
    </div>
  );
}
