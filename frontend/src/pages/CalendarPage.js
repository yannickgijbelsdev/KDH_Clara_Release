import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
  isToday,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Calendar as CalendarIcon,
  Repeat,
  Users,
  User,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import CreateShowDialog from '../components/CreateShowDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  draft: 'bg-zinc-500',
  scheduled: 'bg-violet-500',
  completed: 'bg-green-500',
};

const statusLabels = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

const CalendarPage = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch shows on mount and when window regains focus
  useEffect(() => {
    fetchShows();
    
    // Refetch when window regains focus (user returns to page)
    const handleFocus = () => {
      fetchShows();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchShows = async () => {
    try {
      const response = await axios.get(`${API}/shows`);
      setShows(response.data);
    } catch (error) {
      toast.error('Failed to load shows');
    } finally {
      setLoading(false);
    }
  };

  // Get all days for the calendar grid (including days from prev/next months)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Group shows by date
  const showsByDate = useMemo(() => {
    const grouped = {};
    shows.forEach((show) => {
      const dateKey = show.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(show);
    });
    // Sort shows within each day by start time
    Object.keys(grouped).forEach((date) => {
      grouped[date].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
    return grouped;
  }, [shows]);

  const getShowsForDate = (date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return showsByDate[dateKey] || [];
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
  };

  const handleShowCreated = (newShow) => {
    // Refresh all shows to include any recurring occurrences
    fetchShows();
    setIsCreateOpen(false);
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const selectedDateShows = selectedDate ? getShowsForDate(selectedDate) : [];

  return (
    <div data-testid="calendar-page" className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Calendar Grid */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">Schedule</h1>
            <p className="text-sm sm:text-base text-zinc-400">Plan your radio shows calendar</p>
          </div>
          <Button
            data-testid="create-show-calendar-btn"
            onClick={() => setIsCreateOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2 h-10 sm:h-11 px-4 sm:px-5 btn-primary w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            New Show
          </Button>
        </div>

        {/* Calendar Header */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToday}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Today
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                data-testid="prev-month-btn"
                onClick={handlePrevMonth}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                data-testid="next-month-btn"
                onClick={handleNextMonth}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Week Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-zinc-500 uppercase tracking-wider py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-zinc-800/50 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dayShows = getShowsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const dayIsToday = isToday(day);

                return (
                  <button
                    key={index}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                    onClick={() => handleDateClick(day)}
                    className={`
                      aspect-square p-1 rounded-lg transition-all duration-200 relative
                      ${isCurrentMonth ? 'bg-[#27272a]' : 'bg-[#1a1a1c]'}
                      ${isSelected ? 'ring-2 ring-orange-500 bg-orange-500/10' : ''}
                      ${dayIsToday && !isSelected ? 'ring-2 ring-violet-500' : ''}
                      hover:bg-zinc-700
                    `}
                  >
                    <span
                      className={`
                        text-sm font-mono block mb-1
                        ${isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}
                        ${dayIsToday ? 'text-violet-400 font-bold' : ''}
                        ${isSelected ? 'text-rose-400' : ''}
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                    
                    {/* Show indicators */}
                    {dayShows.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {dayShows.slice(0, 3).map((show, i) => (
                          <div
                            key={show.id}
                            className={`w-1.5 h-1.5 rounded-full ${statusColors[show.status]}`}
                            title={show.title}
                          />
                        ))}
                        {dayShows.length > 3 && (
                          <span className="text-[10px] text-zinc-500">
                            +{dayShows.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-4 sm:mt-6 pt-4 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">Status:</span>
            {Object.entries(statusColors).map(([status, color]) => (
              <div key={status} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-xs text-zinc-400 capitalize">{statusLabels[status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar - Selected Date Details */}
      <div className="w-full lg:w-80 lg:shrink-0">
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 sm:p-6 lg:sticky lg:top-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <CalendarIcon className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {selectedDate ? format(selectedDate, 'EEEE') : 'Select a date'}
              </h3>
              <p className="text-sm text-zinc-500">
                {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Click on a day to see shows'}
              </p>
            </div>
          </div>

          {selectedDate && (
            <>
              <div className="border-t border-zinc-800 pt-4">
                {selectedDateShows.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-zinc-500 mb-4">No shows scheduled</p>
                    <Button
                      size="sm"
                      onClick={() => setIsCreateOpen(true)}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Show
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                      {selectedDateShows.length} show{selectedDateShows.length !== 1 ? 's' : ''}
                    </p>
                    {selectedDateShows.map((show) => (
                      <button
                        key={show.id}
                        data-testid={`sidebar-show-${show.id}`}
                        onClick={() => navigate(`/shows/${show.id}`)}
                        className="w-full text-left p-3 bg-[#27272a] rounded-lg hover:bg-zinc-700 transition-colors group"
                      >
                        <div className="flex gap-3">
                          {/* Show Image */}
                          {show.image && (
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                              <img
                                src={show.image.s3_url || `${API}/uploads/show_title_images/${show.image.file_key}`}
                                alt={show.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <h4 className="text-white font-medium group-hover:text-rose-400 transition-colors line-clamp-1">
                                  {show.title}
                                </h4>
                                {show.is_recurring && (
                                  <Repeat className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" title="Recurring show" />
                                )}
                              </div>
                              <span
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColors[show.status]}`}
                              />
                            </div>
                            <div className="flex items-center gap-1 text-zinc-500 text-sm">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="font-mono">
                                {show.start_time} - {show.end_time}
                              </span>
                            </div>
                            {/* Presenters */}
                            {show.presenters && show.presenters.length > 0 && (
                              <div className="flex items-center gap-1 text-violet-400 text-xs mt-1">
                                <Users className="w-3 h-3" />
                                <span className="truncate">
                                  {show.presenters.map(p => p.name).join(', ')}
                                </span>
                              </div>
                            )}
                            {show.description && (
                              <p className="text-zinc-500 text-xs mt-2 line-clamp-2">
                                {show.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateShowDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onShowCreated={handleShowCreated}
        defaultDate={selectedDate}
      />
    </div>
  );
};

export default CalendarPage;
