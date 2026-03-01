import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  isToday,
  parseISO,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Globe,
  FileText,
  List,
  CheckCircle,
  Timer,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  published: 'bg-green-500',
  scheduled: 'bg-orange-500',
  draft: 'bg-zinc-500',
};

const statusLabels = {
  published: 'Published',
  scheduled: 'Scheduled',
  draft: 'Draft',
};

const getFeaturedImageUrl = (featuredImage) => {
  if (!featuredImage) return null;
  if (featuredImage.s3_url) return featuredImage.s3_url;
  return `${API}/uploads/featured_images/${featuredImage.file_storage_key}`;
};

const getBestFeaturedImage = (item) => {
  if (item.featured_image) return getFeaturedImageUrl(item.featured_image);
  if (item.publish_statuses?.length > 0) {
    for (const ps of item.publish_statuses) {
      if (ps.featured_image) return getFeaturedImageUrl(ps.featured_image);
    }
  }
  if (item.external_featured_image) return item.external_featured_image;
  return null;
};

const ContentCalendarPage = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [contentItems, setContentItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();
  const { mainSiteSlug } = useParams();

  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  useEffect(() => {
    fetchContent();
    const handleFocus = () => fetchContent();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content`);
      setContentItems(response.data);
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  // Build calendar entries from content items
  const calendarEntries = useMemo(() => {
    const entries = [];

    contentItems.forEach(item => {
      if (item.publish_statuses?.length > 0) {
        item.publish_statuses.forEach(ps => {
          if (ps.status === 'published' || ps.status === 'scheduled') {
            const date = ps.published_at || ps.scheduled_at;
            if (date) {
              entries.push({
                id: `${item.id}-${ps.site_id}`,
                contentId: item.id,
                title: item.title,
                date: format(parseISO(date), 'yyyy-MM-dd'),
                time: format(parseISO(date), 'HH:mm'),
                status: ps.status,
                siteName: ps.site_name || ps.wp_site_name || 'WordPress',
                siteId: ps.site_id,
                imageUrl: getBestFeaturedImage(item),
                excerpt: item.excerpt || '',
                category: item.category_name || '',
                item,
              });
            }
          }
        });
      }
      // Also show items with a scheduled_publish_date but no publish_statuses yet
      if (item.scheduled_publish_date && (!item.publish_statuses || item.publish_statuses.length === 0)) {
        entries.push({
          id: `${item.id}-scheduled`,
          contentId: item.id,
          title: item.title,
          date: format(parseISO(item.scheduled_publish_date), 'yyyy-MM-dd'),
          time: format(parseISO(item.scheduled_publish_date), 'HH:mm'),
          status: 'scheduled',
          siteName: 'Pending',
          siteId: null,
          imageUrl: getBestFeaturedImage(item),
          excerpt: item.excerpt || '',
          category: item.category_name || '',
          item,
        });
      }
    });

    return entries;
  }, [contentItems]);

  // Calendar days grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Group entries by date
  const entriesByDate = useMemo(() => {
    const grouped = {};
    calendarEntries.forEach(entry => {
      if (!grouped[entry.date]) grouped[entry.date] = [];
      grouped[entry.date].push(entry);
    });
    // Sort by time within each day
    Object.values(grouped).forEach(dayEntries => {
      dayEntries.sort((a, b) => a.time.localeCompare(b.time));
    });
    return grouped;
  }, [calendarEntries]);

  const getEntriesForDate = (date) => {
    return entriesByDate[format(date, 'yyyy-MM-dd')] || [];
  };

  const selectedDateEntries = selectedDate ? getEntriesForDate(selectedDate) : [];
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div data-testid="content-calendar-page" className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Calendar Grid */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">Content Calendar</h1>
            <p className="text-sm sm:text-base text-zinc-400">Published and scheduled articles overview</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(navTo('/content'))}
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <List className="w-4 h-4 mr-2" />
            Back to list
          </Button>
        </div>

        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 sm:p-6">
          {/* Calendar Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
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
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                data-testid="next-month-btn"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Week Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-zinc-500 uppercase tracking-wider py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square bg-zinc-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dayEntries = getEntriesForDate(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const dayIsToday = isToday(day);
                const publishedCount = dayEntries.filter(e => e.status === 'published').length;
                const scheduledCount = dayEntries.filter(e => e.status === 'scheduled').length;

                return (
                  <button
                    key={index}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      aspect-square p-1 rounded-lg transition-all duration-200 relative
                      ${isCurrentMonth ? 'bg-[#27272a]' : 'bg-[#1a1a1c]'}
                      ${isSelected ? 'ring-2 ring-orange-500 bg-orange-500/10' : ''}
                      ${dayIsToday && !isSelected ? 'ring-2 ring-violet-500' : ''}
                      hover:bg-zinc-700
                    `}
                  >
                    <span className={`
                      text-sm font-mono block mb-1
                      ${isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}
                      ${dayIsToday ? 'text-violet-400 font-bold' : ''}
                      ${isSelected ? 'text-rose-400' : ''}
                    `}>
                      {format(day, 'd')}
                    </span>

                    {dayEntries.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {dayEntries.slice(0, 4).map((entry) => (
                          <div
                            key={entry.id}
                            className={`w-1.5 h-1.5 rounded-full ${statusColors[entry.status]}`}
                            title={`${entry.title} (${entry.status})`}
                          />
                        ))}
                        {dayEntries.length > 4 && (
                          <span className="text-[10px] text-zinc-500">+{dayEntries.length - 4}</span>
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
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-zinc-400">Published</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-xs text-zinc-400">Scheduled</span>
            </div>
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
                {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Click on a day to see articles'}
              </p>
            </div>
          </div>

          {selectedDate && (
            <div className="border-t border-zinc-800 pt-4">
              {selectedDateEntries.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500">No articles on this day</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                    {selectedDateEntries.length} article{selectedDateEntries.length !== 1 ? 's' : ''}
                  </p>
                  {selectedDateEntries.map((entry) => (
                    <button
                      key={entry.id}
                      data-testid={`sidebar-content-${entry.id}`}
                      onClick={() => navigate(navTo(`/content/${entry.contentId}`))}
                      className="w-full text-left p-3 bg-[#27272a] rounded-lg hover:bg-zinc-700 transition-colors group"
                    >
                      <div className="flex gap-3">
                        {/* Featured Image */}
                        {entry.imageUrl && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                            <img
                              src={entry.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-1">
                            <h4 className="text-white font-medium group-hover:text-rose-400 transition-colors line-clamp-1 text-sm">
                              {entry.title}
                            </h4>
                            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColors[entry.status]}`} />
                          </div>
                          <div className="flex items-center gap-1 text-zinc-500 text-xs">
                            {entry.status === 'published' ? (
                              <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : (
                              <Timer className="w-3 h-3 text-orange-400" />
                            )}
                            <span>{entry.time}</span>
                            <span className="mx-1 text-zinc-700">|</span>
                            <Globe className="w-3 h-3" />
                            <span className="truncate">{entry.siteName}</span>
                          </div>
                          {entry.category && (
                            <span className="inline-block text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded mt-1">
                              {entry.category}
                            </span>
                          )}
                          {entry.excerpt && (
                            <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{entry.excerpt}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentCalendarPage;
