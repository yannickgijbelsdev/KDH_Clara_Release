import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  List,
  CalendarDays,
  Globe,
  Clock,
  FileText,
  Image,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Helper to get featured image URL
const getFeaturedImageUrl = (featuredImage) => {
  if (!featuredImage) return null;
  if (featuredImage.s3_url) return featuredImage.s3_url;
  return `${API}/uploads/featured_images/${featuredImage.file_storage_key}`;
};

// Get the best available featured image for a content item
const getBestFeaturedImage = (item) => {
  if (item.featured_image) {
    return getFeaturedImageUrl(item.featured_image);
  }
  if (item.publish_statuses && item.publish_statuses.length > 0) {
    for (const ps of item.publish_statuses) {
      if (ps.featured_image) {
        return ps.featured_image.s3_url || `${API}/uploads/featured_images/${ps.featured_image.file_storage_key}`;
      }
    }
  }
  if (item.external_featured_image) {
    return item.external_featured_image;
  }
  return null;
};

// Custom Event Component with Featured Image
const EventComponent = ({ event }) => {
  const imageUrl = getBestFeaturedImage(event.resource);
  
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 overflow-hidden h-full">
      {imageUrl && (
        <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0 bg-zinc-700">
          <img 
            src={imageUrl} 
            alt="" 
            className="w-full h-full object-cover"
            onError={(e) => e.target.style.display = 'none'}
          />
        </div>
      )}
      <span className="truncate text-xs font-medium">{event.title}</span>
    </div>
  );
};

// Custom Toolbar
const CustomToolbar = ({ label, onNavigate, onView, view }) => {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onNavigate('PREV')}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onNavigate('NEXT')}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate('TODAY')}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 ml-2"
        >
          Today
        </Button>
      </div>
      
      <h2 className="text-xl font-semibold text-white">{label}</h2>
      
      <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1">
        <Button
          variant={view === 'month' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onView('month')}
          className={view === 'month' ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-white'}
        >
          <CalendarDays className="w-4 h-4 mr-2" />
          Month
        </Button>
        <Button
          variant={view === 'week' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onView('week')}
          className={view === 'week' ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-white'}
        >
          <List className="w-4 h-4 mr-2" />
          Week
        </Button>
      </div>
    </div>
  );
};

const ContentCalendarPage = () => {
  const navigate = useNavigate();
  const { mainSiteSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [contentItems, setContentItems] = useState([]);
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content`);
      // Filter only published and scheduled items
      const filtered = response.data.filter(item => {
        // Check if item has any WordPress publish status
        if (item.publish_statuses && item.publish_statuses.length > 0) {
          return item.publish_statuses.some(ps => 
            ps.status === 'published' || ps.status === 'scheduled'
          );
        }
        return false;
      });
      setContentItems(filtered);
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  // Transform content items to calendar events
  const events = useMemo(() => {
    const calendarEvents = [];
    
    contentItems.forEach(item => {
      if (item.publish_statuses) {
        item.publish_statuses.forEach(ps => {
          if (ps.status === 'published' || ps.status === 'scheduled') {
            const publishDate = ps.published_at 
              ? new Date(ps.published_at) 
              : ps.scheduled_at 
                ? new Date(ps.scheduled_at)
                : null;
            
            if (publishDate) {
              calendarEvents.push({
                id: `${item.id}-${ps.site_id}`,
                title: item.title,
                start: publishDate,
                end: publishDate,
                allDay: true,
                resource: {
                  ...item,
                  publishStatus: ps,
                },
                status: ps.status,
              });
            }
          }
        });
      }
    });
    
    return calendarEvents;
  }, [contentItems]);

  const handleSelectEvent = (event) => {
    navigate(navTo(`/content/${event.resource.id}`));
  };

  const handleNavigate = (newDate) => {
    setCurrentDate(newDate);
  };

  const eventStyleGetter = (event) => {
    const isPublished = event.status === 'published';
    return {
      style: {
        backgroundColor: isPublished ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.2)',
        borderColor: isPublished ? 'rgb(34, 197, 94)' : 'rgb(249, 115, 22)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '4px',
        color: isPublished ? 'rgb(134, 239, 172)' : 'rgb(253, 186, 116)',
      },
    };
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-zinc-800 rounded w-1/3"></div>
          <div className="h-[600px] bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="content-calendar-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">Content Calendar</h1>
          <p className="text-sm sm:text-base text-zinc-400">Overview of published and scheduled articles</p>
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

      {/* Calendar */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 sm:p-6 content-calendar">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          view={view}
          onView={setView}
          date={currentDate}
          onNavigate={handleNavigate}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          components={{
            toolbar: CustomToolbar,
            event: EventComponent,
          }}
          messages={{
            today: 'Today',
            previous: 'Previous',
            next: 'Next',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            agenda: 'Agenda',
            noEventsInRange: 'No articles in this period',
          }}
          culture="en-US"
        />

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
  );
};

export default ContentCalendarPage;
