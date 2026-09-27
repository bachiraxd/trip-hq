import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, PenTool, Redo2, Trash2, Undo2, Wifi, WifiOff } from 'lucide-react';
import { supabase, getUserId, getUserColor } from '../lib/supabase';
import { CanvasStroke, PageId } from '../types';

interface CanvasProps {
  onNavigate?: (page: PageId) => void;
}

const userId = getUserId();
const userColor = getUserColor();
const COLORS = ['#ffffff', '#9E7FFF', '#38bdf8', '#f472b6', '#fb923c', '#4ade80', '#facc15'];

export const Canvas: React.FC<CanvasProps> = ({ onNavigate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const allStrokes = useRef<CanvasStroke[]>([]);
  const drawnStrokeIds = useRef<Set<string>>(new Set());
  const myUndoStack = useRef<CanvasStroke[]>([]);
  const myRedoStack = useRef<CanvasStroke[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeColor, setActiveColor] = useState(userColor);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: { points: { x: number; y: number }[]; color: string }) => {
    if (stroke.points.length < 2) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current.forEach((stroke) => drawStroke(ctx, stroke));
  }, [drawStroke]);

  const refreshUndoRedoState = useCallback(() => {
    setCanUndo(myUndoStack.current.length > 0);
    setCanRedo(myRedoStack.current.length > 0);
  }, []);

  // Load existing strokes
  useEffect(() => {
    async function fetchStrokes() {
      const { data } = await supabase.from('canvas_strokes').select('*').order('created_at');
      if (!data) return;
      allStrokes.current = data as CanvasStroke[];
      (data as CanvasStroke[]).forEach((stroke) => {
        drawnStrokeIds.current.add(stroke.id);
        if (stroke.user_id === userId) myUndoStack.current.push(stroke);
      });
      redrawAll();
      refreshUndoRedoState();
    }
    fetchStrokes();
  }, [redrawAll, refreshUndoRedoState]);

  // Realtime new strokes + deletes (covers both remote drawing and undo/redo/clear)
  useEffect(() => {
    const channel = supabase
      .channel('canvas-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'canvas_strokes' }, (payload) => {
        const stroke = payload.new as CanvasStroke;
        if (drawnStrokeIds.current.has(stroke.id)) return;
        drawnStrokeIds.current.add(stroke.id);
        allStrokes.current.push(stroke);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) drawStroke(ctx, stroke);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'canvas_strokes' }, (payload) => {
        const oldStroke = payload.old as CanvasStroke;
        allStrokes.current = allStrokes.current.filter((s) => s.id !== oldStroke.id);
        drawnStrokeIds.current.delete(oldStroke.id);
        redrawAll();
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [drawStroke, redrawAll]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    currentPoints.current = [getPos(e)];
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const pos = getPos(e);
    currentPoints.current.push(pos);

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && currentPoints.current.length >= 2) {
      const pts = currentPoints.current;
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const handleEnd = async () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints.current.length < 2) {
      currentPoints.current = [];
      return;
    }

    const { data } = await supabase
      .from('canvas_strokes')
      .insert({ user_id: userId, color: activeColor, points: currentPoints.current })
      .select()
      .single();

    if (data) {
      const stroke = data as CanvasStroke;
      drawnStrokeIds.current.add(stroke.id);
      allStrokes.current.push(stroke);
      myUndoStack.current.push(stroke);
      myRedoStack.current = [];
      refreshUndoRedoState();
    }
    currentPoints.current = [];
  };

  const undo = async () => {
    const stroke = myUndoStack.current.pop();
    if (!stroke) return;
    myRedoStack.current.push(stroke);
    refreshUndoRedoState();
    await supabase.from('canvas_strokes').delete().eq('id', stroke.id);
  };

  const redo = async () => {
    const stroke = myRedoStack.current.pop();
    if (!stroke) return;

    const { data } = await supabase
      .from('canvas_strokes')
      .insert({ user_id: stroke.user_id, color: stroke.color, points: stroke.points })
      .select()
      .single();

    if (data) {
      const newStroke = data as CanvasStroke;
      myUndoStack.current.push(newStroke);
    } else {
      myUndoStack.current.push(stroke);
    }
    refreshUndoRedoState();
  };

  const clearCanvas = async () => {
    if (!confirm('Clear the whole canvas for everyone?')) return;
    await supabase.from('canvas_strokes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    myUndoStack.current = [];
    myRedoStack.current = [];
    refreshUndoRedoState();
  };

  return (
    <div className="min-h-full overflow-x-hidden bg-[#061226] p-2 text-white sm:p-3 md:overflow-x-visible">
      <section className="rounded-2xl border border-[#1e3b65] bg-[#07172d]/90 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1b355a] px-3 py-2 sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#4b51ff] to-[#7144e9] shadow-lg shadow-[#4b51ff]/30">
            <PenTool size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">Canvas</h2>
            <p className="text-[11px] text-[#adc1df] sm:text-xs">Draw together, live.</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#11284b] px-2 py-1.5 text-xs text-[#cfe0fb]">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-[#7890b3]" />}
            <span>{connected ? 'Live' : 'Connecting'}</span>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  activeColor === c ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}

            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="ml-2 flex items-center gap-1.5 rounded-lg border border-[#31557f] bg-[#122b50] px-3 py-1.5 text-xs font-semibold text-[#d6e5fa] hover:bg-[#1b3b68] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 size={13} /> Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="flex items-center gap-1.5 rounded-lg border border-[#31557f] bg-[#122b50] px-3 py-1.5 text-xs font-semibold text-[#d6e5fa] hover:bg-[#1b3b68] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Redo2 size={13} /> Redo
            </button>

            <button
              type="button"
              onClick={clearCanvas}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 size={13} /> Clear Canvas
            </button>
          </div>

          <canvas
            ref={canvasRef}
            width={900}
            height={480}
            className="h-auto w-full aspect-[15/8] touch-none rounded-xl border border-[#1a3963] bg-[#0a1a31] sm:aspect-auto sm:h-[480px]"
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b355a] px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => onNavigate?.('polls')}
            className="flex items-center gap-1.5 rounded-lg border border-[#284a73] bg-[#0d2343] px-3 py-1.5 text-xs text-[#b8cce7] hover:bg-[#1c3a66]"
          >
            <ArrowLeft size={15} /> Previous
          </button>
          <span className="text-xs text-[#819abd]">Page 3 · Canvas</span>
          <button
            type="button"
            onClick={() => onNavigate?.('moments')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7654ff] to-[#5d45f1] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#614bf1]/20 hover:brightness-110"
          >
            Next (Snacks) <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
};
