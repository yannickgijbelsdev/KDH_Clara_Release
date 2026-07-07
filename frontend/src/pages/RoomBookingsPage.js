/**
 * Room Bookings page.
 *
 * Two tabs:
 *   • Bookings — anyone in the tenant can create; only creator/admin edits+deletes.
 *   • Rooms    — admin-only CRUD; rooms are stored in the existing `studios`
 *                collection so radio-show scheduling and bookings share the
 *                same physical spaces.
 *
 * Extended booking fields (contact + attendees + recurrence) match the
 * "meeting room" flow the team asked for; the backend expands recurring
 * bookings into sibling documents linked by ``parent_booking_id``.
 *
 * The backend enforces room-conflict detection across both bookings AND
 * shows; the frontend surfaces the 409 payload as a friendly toast.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  CalendarClock, DoorOpen, Plus, Trash2, Pencil, X, Users, Mail, User,
  Repeat, Info,
} from 'lucide-react';
import { useMainSite } from '../context/MainSiteContext';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const emptyBooking = {
  room_id: '', title: '', description: '',
  start_at: '', end_at: '', blocks_room: true,
  contact_person: '', contact_email: '', attendees: 0,
  recurrence_type: 'none', recurrence_end_date: '',
};
const emptyRoom = { name: '', description: '', capacity: 0, color: '#71717a' };

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const isoToLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (val) => (val ? new Date(val).toISOString() : '');

export default function RoomBookingsPage() {
  const { mainSite } = useMainSite();
  const mainSiteId = mainSite?.id || '';
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookingDraft, setBookingDraft] = useState(null); // null = closed
  const [roomDraft, setRoomDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null);

  const headers = useMemo(
    () => (mainSiteId ? { 'X-Main-Site-ID': mainSiteId } : {}),
    [mainSiteId],
  );
  const isAdmin = me?.role === 'admin' || me?.role === 'system_admin';

  useEffect(() => {
    axios.get(`${API}/auth/me`).then((r) => setMe(r.data)).catch(() => {});
  }, []);

  const loadRooms = async () => {
    try {
      const r = await axios.get(`${API}/bookings/rooms`, { headers });
      setRooms(Array.isArray(r.data) ? r.data : []);
    } catch { setRooms([]); }
  };
  const loadBookings = async () => {
    try {
      const r = await axios.get(`${API}/bookings`, { headers });
      setBookings(Array.isArray(r.data) ? r.data : []);
    } catch { setBookings([]); }
  };
  useEffect(() => {
    if (mainSiteId) { loadRooms(); loadBookings(); }
  }, [mainSiteId]);

  const openNewBooking = () => setBookingDraft({ ...emptyBooking, room_id: rooms[0]?.id || '' });
  const openEditBooking = (b) => setBookingDraft({ ...b });
  const openNewRoom = () => setRoomDraft({ ...emptyRoom });
  const openEditRoom = (r) => setRoomDraft({ ...r });

  const isSeries = (b) => b?.recurrence_type && b.recurrence_type !== 'none';

  const saveBooking = async () => {
    if (!bookingDraft.room_id || !bookingDraft.title || !bookingDraft.start_at || !bookingDraft.end_at) {
      toast.error('Pick a room, title and time first');
      return;
    }
    if (bookingDraft.recurrence_type !== 'none' && !bookingDraft.recurrence_end_date) {
      toast.error('Pick an end date for the recurrence');
      return;
    }
    setSaving(true);
    try {
      const isNew = !bookingDraft.id;
      const payload = {
        room_id: bookingDraft.room_id,
        title: bookingDraft.title.trim(),
        description: bookingDraft.description || '',
        start_at: bookingDraft.start_at,
        end_at: bookingDraft.end_at,
        blocks_room: !!bookingDraft.blocks_room,
        contact_person: bookingDraft.contact_person || '',
        contact_email: bookingDraft.contact_email || '',
        attendees: parseInt(bookingDraft.attendees, 10) || 0,
      };
      if (isNew) {
        payload.recurrence_type = bookingDraft.recurrence_type || 'none';
        payload.recurrence_end_date = payload.recurrence_type === 'none'
          ? null : (bookingDraft.recurrence_end_date || null);
        await axios.post(`${API}/bookings`, payload, { headers });
      } else {
        // Preserve series propagation when editing a recurring booking
        if (isSeries(bookingDraft) || bookingDraft.parent_booking_id) {
          payload.update_series = window.confirm(
            'This booking is part of a series. Apply the changes to the entire series? '
            + 'Choose "Cancel" to only update this occurrence.',
          );
        }
        await axios.put(`${API}/bookings/${bookingDraft.id}`, payload, { headers });
      }
      toast.success(isNew ? 'Booking created' : 'Booking updated');
      setBookingDraft(null);
      loadBookings();
    } catch (e) {
      const d = e.response?.data?.detail;
      if (typeof d === 'object' && d?.message) toast.error(d.message);
      else toast.error(typeof d === 'string' ? d : 'Could not save booking');
    } finally { setSaving(false); }
  };

  const removeBooking = async (b) => {
    const partOfSeries = isSeries(b) || b.parent_booking_id;
    let deleteSeries = false;
    if (partOfSeries) {
      deleteSeries = window.confirm(
        `"${b.title}" is part of a series. OK = delete the whole series, Cancel = delete only this occurrence.`,
      );
    } else if (!window.confirm(`Delete booking "${b.title}"?`)) {
      return;
    }
    try {
      const url = `${API}/bookings/${b.id}${deleteSeries ? '?delete_series=true' : ''}`;
      await axios.delete(url, { headers });
      toast.success('Booking deleted');
      loadBookings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not delete');
    }
  };

  const saveRoom = async () => {
    if (!roomDraft.name?.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const isNew = !roomDraft.id;
      const payload = {
        name: roomDraft.name.trim(),
        description: roomDraft.description || '',
        capacity: parseInt(roomDraft.capacity || 0, 10) || 0,
        color: roomDraft.color || '#71717a',
      };
      if (isNew) await axios.post(`${API}/bookings/rooms`, payload, { headers });
      else await axios.put(`${API}/bookings/rooms/${roomDraft.id}`, payload, { headers });
      toast.success(isNew ? 'Room created' : 'Room updated');
      setRoomDraft(null);
      loadRooms();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save room');
    } finally { setSaving(false); }
  };

  const removeRoom = async (r) => {
    if (!window.confirm(`Delete room "${r.name}"?`)) return;
    try {
      await axios.delete(`${API}/bookings/rooms/${r.id}`, { headers });
      toast.success('Room deleted');
      loadRooms();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not delete');
    }
  };

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="room-bookings-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Room bookings</h1>
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
          <button
            onClick={() => setTab('bookings')}
            className={`px-4 py-1.5 text-sm rounded-md ${tab === 'bookings' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-600'}`}
            data-testid="tab-bookings"
          >
            <CalendarClock className="w-3.5 h-3.5 mr-1.5 inline" /> Bookings
          </button>
          <button
            onClick={() => setTab('rooms')}
            className={`px-4 py-1.5 text-sm rounded-md ${tab === 'rooms' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-600'}`}
            data-testid="tab-rooms"
          >
            <DoorOpen className="w-3.5 h-3.5 mr-1.5 inline" /> Rooms
          </button>
        </div>
      </div>

      {tab === 'bookings' && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-zinc-500">Book a room. Radio shows using the same room and time block the booking automatically.</p>
            <Button onClick={openNewBooking} className="bg-rose-500 text-white hover:bg-rose-600" data-testid="new-booking-btn">
              <Plus className="w-4 h-4 mr-1" /> New booking
            </Button>
          </div>
          {bookings.length === 0 ? (
            <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-zinc-400" data-testid="bookings-empty">
              No bookings yet — click &ldquo;New booking&rdquo; to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => {
                const canEdit = isAdmin || b.created_by === me?.id;
                const seriesBadge = isSeries(b) || b.parent_booking_id;
                return (
                  <div key={b.id} className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center gap-4" data-testid={`booking-row-${b.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-zinc-900">{b.title}</span>
                        <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{b.room_name || 'Unknown room'}</span>
                        {!b.blocks_room && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">non-blocking</span>}
                        {seriesBadge && (
                          <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Repeat className="w-3 h-3" />
                            {RECURRENCE_OPTIONS.find(o => o.value === b.recurrence_type)?.label || 'Series'}
                          </span>
                        )}
                        {b.attendees > 0 && (
                          <span className="text-xs bg-zinc-50 text-zinc-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Users className="w-3 h-3" /> {b.attendees}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{fmt(b.start_at)} — {fmt(b.end_at)} · {b.created_by_name}</div>
                      {b.contact_person && (
                        <div className="text-xs text-zinc-500 mt-1 inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {b.contact_person}
                          {b.contact_email ? <> · <Mail className="w-3 h-3" /> {b.contact_email}</> : null}
                        </div>
                      )}
                      {b.description && <div className="text-xs text-zinc-400 mt-1">{b.description}</div>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditBooking(b)} data-testid={`edit-booking-${b.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeBooking(b)} data-testid={`delete-booking-${b.id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'rooms' && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-zinc-500">
              Rooms are shared with the radio schedule (Studios). {isAdmin ? '' : 'Only admins can create or edit rooms.'}
            </p>
            {isAdmin && (
              <Button onClick={openNewRoom} className="bg-zinc-900 text-white hover:bg-zinc-800" data-testid="new-room-btn">
                <Plus className="w-4 h-4 mr-1" /> New room
              </Button>
            )}
          </div>
          {rooms.length === 0 ? (
            <div className="border border-dashed border-zinc-200 rounded-xl p-12 text-center text-zinc-400">No rooms yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {rooms.map((r) => (
                <div key={r.id} className="bg-white border border-zinc-200 rounded-lg p-4" data-testid={`room-card-${r.id}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color || '#71717a' }} />
                    <span className="font-semibold text-zinc-900">{r.name}</span>
                  </div>
                  {r.description && <p className="text-xs text-zinc-500 mb-1">{r.description}</p>}
                  {r.capacity ? <p className="text-xs text-zinc-400">Capacity: {r.capacity}</p> : null}
                  {isAdmin && (
                    <div className="flex gap-1 mt-3">
                      <Button size="sm" variant="outline" onClick={() => openEditRoom(r)} data-testid={`edit-room-${r.id}`}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => removeRoom(r)} data-testid={`delete-room-${r.id}`}>
                        <Trash2 className="w-3 h-3 mr-1 text-red-500" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking dialog */}
      <Dialog open={!!bookingDraft} onOpenChange={(o) => !o && setBookingDraft(null)}>
        <DialogContent className="bg-white max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bookingDraft?.id ? 'Edit booking' : 'New booking'}</DialogTitle>
          </DialogHeader>
          {bookingDraft && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-500">Room *</Label>
                <select
                  value={bookingDraft.room_id}
                  onChange={(e) => setBookingDraft({ ...bookingDraft, room_id: e.target.value })}
                  className="mt-1 w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                  data-testid="booking-room-select"
                >
                  <option value="">— Pick a room —</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Title *</Label>
                <Input value={bookingDraft.title} onChange={(e) => setBookingDraft({ ...bookingDraft, title: e.target.value })} data-testid="booking-title-input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Start *</Label>
                  <Input
                    type="datetime-local"
                    value={isoToLocalInput(bookingDraft.start_at)}
                    onChange={(e) => setBookingDraft({ ...bookingDraft, start_at: localInputToIso(e.target.value) })}
                    data-testid="booking-start-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">End *</Label>
                  <Input
                    type="datetime-local"
                    value={isoToLocalInput(bookingDraft.end_at)}
                    onChange={(e) => setBookingDraft({ ...bookingDraft, end_at: localInputToIso(e.target.value) })}
                    data-testid="booking-end-input"
                  />
                </div>
              </div>

              {/* Contact + attendees */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Contact person</Label>
                  <Input
                    value={bookingDraft.contact_person || ''}
                    onChange={(e) => setBookingDraft({ ...bookingDraft, contact_person: e.target.value })}
                    placeholder="Name"
                    data-testid="booking-contact-person-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Contact e-mail</Label>
                  <Input
                    type="email"
                    value={bookingDraft.contact_email || ''}
                    onChange={(e) => setBookingDraft({ ...bookingDraft, contact_email: e.target.value })}
                    placeholder="name@company.com"
                    data-testid="booking-contact-email-input"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Attendees</Label>
                <Input
                  type="number"
                  min="0"
                  value={bookingDraft.attendees || 0}
                  onChange={(e) => setBookingDraft({ ...bookingDraft, attendees: e.target.value })}
                  data-testid="booking-attendees-input"
                />
              </div>

              {/* Recurrence — series shape is locked after creation */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Recurrence</Label>
                  <select
                    value={bookingDraft.recurrence_type || 'none'}
                    onChange={(e) => setBookingDraft({ ...bookingDraft, recurrence_type: e.target.value })}
                    disabled={!!bookingDraft.id}
                    className="mt-1 w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white disabled:bg-zinc-50 disabled:text-zinc-400"
                    data-testid="booking-recurrence-select"
                  >
                    {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {(bookingDraft.recurrence_type && bookingDraft.recurrence_type !== 'none') && (
                  <div>
                    <Label className="text-xs text-zinc-500">Repeat until</Label>
                    <Input
                      type="date"
                      value={bookingDraft.recurrence_end_date || ''}
                      onChange={(e) => setBookingDraft({ ...bookingDraft, recurrence_end_date: e.target.value })}
                      disabled={!!bookingDraft.id}
                      data-testid="booking-recurrence-end-input"
                    />
                  </div>
                )}
              </div>
              {bookingDraft.id && (bookingDraft.recurrence_type !== 'none' || bookingDraft.parent_booking_id) && (
                <p className="text-xs text-zinc-400 inline-flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5" />
                  Series settings can&apos;t be changed after creation. Delete the series and create a new one to change the schedule.
                </p>
              )}

              <div>
                <Label className="text-xs text-zinc-500">Description</Label>
                <Textarea rows={2} value={bookingDraft.description} onChange={(e) => setBookingDraft({ ...bookingDraft, description: e.target.value })} data-testid="booking-desc-input" />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!bookingDraft.blocks_room}
                  onChange={(e) => setBookingDraft({ ...bookingDraft, blocks_room: e.target.checked })}
                  className="mt-0.5 accent-rose-500"
                  data-testid="booking-blocks-checkbox"
                />
                <div className="text-xs">
                  <div className="font-medium text-zinc-700">Block the room</div>
                  <div className="text-zinc-500">Off = the room can be shared with other non-blocking items.</div>
                </div>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBookingDraft(null)}><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <Button onClick={saveBooking} disabled={saving} className="bg-rose-500 text-white hover:bg-rose-600" data-testid="booking-save-btn">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room dialog */}
      <Dialog open={!!roomDraft} onOpenChange={(o) => !o && setRoomDraft(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>{roomDraft?.id ? 'Edit room' : 'New room'}</DialogTitle>
          </DialogHeader>
          {roomDraft && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-500">Name *</Label>
                <Input value={roomDraft.name} onChange={(e) => setRoomDraft({ ...roomDraft, name: e.target.value })} data-testid="room-name-input" />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Description</Label>
                <Textarea rows={2} value={roomDraft.description || ''} onChange={(e) => setRoomDraft({ ...roomDraft, description: e.target.value })} data-testid="room-desc-input" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Capacity</Label>
                  <Input type="number" min="0" value={roomDraft.capacity || 0} onChange={(e) => setRoomDraft({ ...roomDraft, capacity: e.target.value })} data-testid="room-capacity-input" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Color</Label>
                  <Input type="color" value={roomDraft.color || '#71717a'} onChange={(e) => setRoomDraft({ ...roomDraft, color: e.target.value })} data-testid="room-color-input" className="h-9" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoomDraft(null)}><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <Button onClick={saveRoom} disabled={saving} className="bg-zinc-900 text-white hover:bg-zinc-800" data-testid="room-save-btn">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
