import { useState, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';

const PRIORITY_DOT = {
  low: 'bg-zinc-400',
  medium: 'bg-blue-400',
  high: 'bg-orange-400',
  urgent: 'bg-red-400',
};

const PRIORITY_BG = {
  low: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300',
  medium: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
  high: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
  urgent: 'bg-red-500/15 border-red-500/30 text-red-300',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Monday = 0
  let startDay = (first.getDay() + 6) % 7;
  const days = [];
  // Pad start
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, outside: true });
  }
  // Month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), outside: false });
  }
  // Pad end to fill last row
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startDay + 1);
    days.push({ date: d, outside: true });
  }
  return days;
}

function getWeekDays(baseDate) {
  const d = new Date(baseDate);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDeadline(deadline) {
  if (!deadline) return null;
  // Handle both ISO and dd-mm-yyyy formats
  const parts = deadline.split('-');
  if (parts[0].length === 4) return new Date(deadline + 'T00:00:00');
  if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
  return new Date(deadline);
}

function TaskPill({ task, onClick }) {
  const pr = task.priority || 'medium';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(task); }}
      className={`w-full text-left px-1.5 py-0.5 rounded border text-[11px] font-medium truncate transition-colors hover:brightness-125 ${PRIORITY_BG[pr] || PRIORITY_BG.medium}`}
      title={task.title}
      data-testid={`cal-task-${task.id}`}
    >
      {task.title}
    </button>
  );
}

// ─── Month View ───
function MonthView({ year, month, tasksByDate, onTaskClick }) {
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const today = dateKey(new Date());

  return (
    <div className="grid grid-cols-7 border-t border-l border-zinc-800" data-testid="month-view">
      {DAY_LABELS.map(d => (
        <div key={d} className="px-2 py-1.5 text-[11px] font-semibold text-zinc-500 uppercase border-b border-r border-zinc-800 bg-zinc-900/50">
          {d}
        </div>
      ))}
      {grid.map(({ date, outside }, i) => {
        const key = dateKey(date);
        const isToday = key === today;
        const dayTasks = tasksByDate[key] || [];
        return (
          <div
            key={i}
            className={`min-h-[100px] border-b border-r border-zinc-800 p-1.5 ${outside ? 'bg-zinc-900/30' : 'bg-zinc-900/70'}`}
          >
            <div className={`text-xs font-medium mb-1 ${isToday ? 'text-orange-400' : outside ? 'text-zinc-600' : 'text-zinc-400'}`}>
              {isToday ? (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-[11px] font-bold">{date.getDate()}</span>
              ) : date.getDate()}
            </div>
            <div className="space-y-0.5">
              {dayTasks.slice(0, 3).map(t => (
                <TaskPill key={t.id} task={t} onClick={onTaskClick} />
              ))}
              {dayTasks.length > 3 && (
                <div className="text-[10px] text-zinc-500 pl-1">+{dayTasks.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Week View ───
function WeekView({ baseDate, tasksByDate, onTaskClick }) {
  const days = useMemo(() => getWeekDays(baseDate), [baseDate]);
  const today = dateKey(new Date());

  return (
    <div className="grid grid-cols-7 gap-3" data-testid="week-view">
      {days.map((date, i) => {
        const key = dateKey(date);
        const isToday = key === today;
        const dayTasks = tasksByDate[key] || [];
        return (
          <div key={i} className={`rounded-xl border p-3 min-h-[200px] ${isToday ? 'border-orange-500/40 bg-orange-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
            <div className="text-center mb-3">
              <div className={`text-[10px] font-semibold uppercase ${isToday ? 'text-orange-400' : 'text-zinc-500'}`}>
                {DAY_LABELS[i]}
              </div>
              <div className={`text-lg font-bold ${isToday ? 'text-orange-400' : 'text-zinc-300'}`}>
                {date.getDate()}
              </div>
              <div className="text-[10px] text-zinc-600">
                {date.toLocaleDateString('en', { month: 'short' })}
              </div>
            </div>
            <div className="space-y-1">
              {dayTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => onTaskClick(t)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs transition-colors hover:brightness-125 ${PRIORITY_BG[t.priority || 'medium']}`}
                  data-testid={`week-task-${t.id}`}
                >
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority || 'medium']}`} />
                    <span className="text-[10px] opacity-70 capitalize">{t.priority || 'medium'}</span>
                  </div>
                </button>
              ))}
              {dayTasks.length === 0 && (
                <div className="text-[10px] text-zinc-600 text-center py-4">No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Calendar View ───
export default function TaskCalendarView({ tasks, columns, onTaskClick }) {
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const doneColumnIds = useMemo(() => {
    return columns.filter(c => c.name?.toLowerCase() === 'done').map(c => c.id);
  }, [columns]);

  const tasksByDate = useMemo(() => {
    const map = {};
    for (const task of tasks) {
      if (doneColumnIds.includes(task.column_id)) continue; // Skip done tasks
      const d = parseDeadline(task.deadline);
      if (!d || isNaN(d.getTime())) continue;
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [tasks, doneColumnIds]);

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const headerLabel = viewMode === 'month'
    ? currentDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : (() => {
        const days = getWeekDays(currentDate);
        const s = days[0];
        const e = days[6];
        return `${s.getDate()} ${s.toLocaleDateString('en', { month: 'short' })} - ${e.getDate()} ${e.toLocaleDateString('en', { month: 'short', year: 'numeric' })}`;
      })();

  // Legend
  const tasksWithDeadline = tasks.filter(t => t.deadline && !doneColumnIds.includes(t.column_id));
  const overdue = tasksWithDeadline.filter(t => {
    const d = parseDeadline(t.deadline);
    return d && d < new Date();
  });

  return (
    <div className="flex flex-col h-full" data-testid="calendar-view">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-8 h-8" data-testid="cal-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-sm font-semibold text-white min-w-[200px] text-center">{headerLabel}</h3>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)} className="w-8 h-8" data-testid="cal-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="border-zinc-700 text-zinc-300 text-xs h-7 ml-2" data-testid="cal-today">
            Today
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-400" /> Low</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> High</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Urgent</span>
            {overdue.length > 0 && (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <Flag className="w-3 h-3" /> {overdue.length} overdue
              </span>
            )}
          </div>

          {/* View toggle */}
          <div className="flex bg-zinc-800 rounded-lg p-0.5" data-testid="cal-view-toggle">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${viewMode === 'month' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
              data-testid="cal-month-btn"
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${viewMode === 'week' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
              data-testid="cal-week-btn"
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'month' ? (
          <MonthView year={year} month={month} tasksByDate={tasksByDate} onTaskClick={onTaskClick} />
        ) : (
          <WeekView baseDate={currentDate} tasksByDate={tasksByDate} onTaskClick={onTaskClick} />
        )}
      </div>
    </div>
  );
}
