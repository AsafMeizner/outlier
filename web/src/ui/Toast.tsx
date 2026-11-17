// Short confirmations ("Saved") that drop in at the top of the screen and leave on their own.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import './toast.css';

type Tone = 'info' | 'good' | 'bad';
interface ToastItem { id: number; text: string; tone: Tone }
type Show = (text: string, tone?: Tone) => void;

const Ctx = createContext<Show | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const show = useCallback<Show>((text, tone = 'info') => {
    const id = next.current++;
    setItems(list => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems(list => list.filter(i => i.id !== id)), tone === 'bad' ? 5000 : 2600);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(i => (
          <div key={i.id} className={`toast toast--${i.tone}`}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Show {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside ToastProvider');
  return v;
}
