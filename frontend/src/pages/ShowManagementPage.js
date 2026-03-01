import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ImageResizeDialog from '../components/ImageResizeDialog';
import { isImageFile, isOversized } from '../utils/imageResize';
import {
  Radio,
  Building2,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Loader2,
  Settings,
  Image,
  Camera,
  X,
  User,
  Users,
  Check,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ShowManagementPage = () => {
  const { isAdmin } = useAuth();
  const { mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('titles');
  const [loading, setLoading] = useState(true);
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;
  
  // Team users for presenter selection
  const [teamUsers, setTeamUsers] = useState([]);
  
  // Show Titles state
  const [showTitles, setShowTitles] = useState([]);
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [deleteTitleDialogOpen, setDeleteTitleDialogOpen] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [titleFormData, setTitleFormData] = useState({
    name: '',
    description: '',
    default_start_time: '09:00',
    default_end_time: '10:00',
    rds_station: 'none',
    default_presenter_ids: [],
  });
  const [savingTitle, setSavingTitle] = useState(false);
  const [presenterPopoverOpen, setPresenterPopoverOpen] = useState(false);
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageTargetTitleId, setImageTargetTitleId] = useState(null);
  const imageInputRef = useRef(null);
  const [resizeFile, setResizeFile] = useState(null);
  
  // Studios state
  const [studios, setStudios] = useState([]);
  const [studioDialogOpen, setStudioDialogOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState(null);
  const [deleteStudioDialogOpen, setDeleteStudioDialogOpen] = useState(false);
  const [selectedStudio, setSelectedStudio] = useState(null);
  const [studioFormData, setStudioFormData] = useState({
    name: '',
    description: '',
  });
  const [savingStudio, setSavingStudio] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate(navTo('/shows'));
      return;
    }
    fetchData();
  }, [isAdmin, mainSiteSlug]);

  const fetchData = async () => {
    try {
      const [titlesRes, studiosRes, usersRes] = await Promise.all([
        axios.get(`${API}/shows/titles`),
        axios.get(`${API}/shows/studios`),
        axios.get(`${API}/users`),
      ]);
      setShowTitles(titlesRes.data);
      setStudios(studiosRes.data);
      setTeamUsers(usersRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ========== SHOW TITLES HANDLERS ==========
  const openCreateTitleDialog = () => {
    setEditingTitle(null);
    setTitleFormData({
      name: '',
      description: '',
      default_start_time: '09:00',
      default_end_time: '10:00',
      rds_station: 'none',
      default_presenter_ids: [],
    });
    setTitleDialogOpen(true);
  };

  const openEditTitleDialog = (title) => {
    setEditingTitle(title);
    setTitleFormData({
      name: title.name,
      description: title.description || '',
      default_start_time: title.default_start_time || '09:00',
      default_end_time: title.default_end_time || '10:00',
      rds_station: title.rds_station || 'none',
      default_presenter_ids: title.default_presenter_ids || [],
    });
    setTitleDialogOpen(true);
  };

  const togglePresenter = (userId) => {
    setTitleFormData(prev => {
      const current = prev.default_presenter_ids || [];
      if (current.includes(userId)) {
        return { ...prev, default_presenter_ids: current.filter(id => id !== userId) };
      } else {
        return { ...prev, default_presenter_ids: [...current, userId] };
      }
    });
  };

  const getImageUrl = (image) => {
    if (!image) return null;
    if (image.s3_url) return image.s3_url;
    const key = image.file_storage_key || image.file_key;
    if (key) return `${API}/uploads/show_title_images/${key}`;
    return null;
  };

  const handleSaveTitle = async (e) => {
    e.preventDefault();
    setSavingTitle(true);
    
    try {
      if (editingTitle) {
        const response = await axios.put(`${API}/shows/titles/${editingTitle.id}`, titleFormData);
        setShowTitles(showTitles.map(t => t.id === editingTitle.id ? response.data : t));
        
        // Check if presenters were updated
        const oldPresenterIds = editingTitle.default_presenter_ids || [];
        const newPresenterIds = titleFormData.default_presenter_ids || [];
        const presentersChanged = JSON.stringify(oldPresenterIds.sort()) !== JSON.stringify(newPresenterIds.sort());
        
        if (presentersChanged) {
          toast.success('Show title and all shows updated with new presenters');
        } else {
          toast.success('Show title updated');
        }
      } else {
        const response = await axios.post(`${API}/shows/titles`, titleFormData);
        setShowTitles([...showTitles, response.data]);
        toast.success('Show title created');
      }
      setTitleDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save show title');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDeleteTitle = async () => {
    if (!selectedTitle) return;
    
    try {
      await axios.delete(`${API}/shows/titles/${selectedTitle.id}`);
      setShowTitles(showTitles.filter(t => t.id !== selectedTitle.id));
      setDeleteTitleDialogOpen(false);
      setSelectedTitle(null);
      toast.success('Show title deleted');
    } catch (error) {
      toast.error('Failed to delete show title');
    }
  };

  const handleImageUpload = async (file, titleId) => {
    if (!file) return;
    
    // Check if image needs resizing
    if (isImageFile(file) && isOversized(file)) {
      setImageTargetTitleId(titleId);
      setResizeFile(file);
      return;
    }
    
    await doImageUpload(file, titleId);
  };

  const doImageUpload = async (file, titleId) => {
    setUploadingImage(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/shows/titles/${titleId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setShowTitles(showTitles.map(t => t.id === titleId ? { ...t, image: response.data.image } : t));
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      setImageTargetTitleId(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleResized = (resizedFile) => {
    const titleId = imageTargetTitleId;
    setResizeFile(null);
    doImageUpload(resizedFile, titleId);
  };

  const handleRemoveImage = async (titleId) => {
    try {
      await axios.delete(`${API}/shows/titles/${titleId}/image`);
      setShowTitles(showTitles.map(t => t.id === titleId ? { ...t, image: null } : t));
      toast.success('Image removed');
    } catch (error) {
      toast.error('Failed to remove image');
    }
  };

  // ========== STUDIOS HANDLERS ==========
  const openCreateStudioDialog = () => {
    setEditingStudio(null);
    setStudioFormData({
      name: '',
      description: '',
    });
    setStudioDialogOpen(true);
  };

  const openEditStudioDialog = (studio) => {
    setEditingStudio(studio);
    setStudioFormData({
      name: studio.name,
      description: studio.description || '',
    });
    setStudioDialogOpen(true);
  };

  const handleSaveStudio = async (e) => {
    e.preventDefault();
    setSavingStudio(true);
    
    try {
      if (editingStudio) {
        const response = await axios.put(`${API}/shows/studios/${editingStudio.id}`, studioFormData);
        setStudios(studios.map(s => s.id === editingStudio.id ? response.data : s));
        toast.success('Studio updated');
      } else {
        const response = await axios.post(`${API}/shows/studios`, studioFormData);
        setStudios([...studios, response.data]);
        toast.success('Studio created');
      }
      setStudioDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save studio');
    } finally {
      setSavingStudio(false);
    }
  };

  const handleDeleteStudio = async () => {
    if (!selectedStudio) return;
    
    try {
      await axios.delete(`${API}/shows/studios/${selectedStudio.id}`);
      setStudios(studios.filter(s => s.id !== selectedStudio.id));
      setDeleteStudioDialogOpen(false);
      setSelectedStudio(null);
      toast.success('Studio deleted');
    } catch (error) {
      toast.error('Failed to delete studio');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div data-testid="show-management-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2">
            Show Management
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">Manage show titles and studios for your team</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-[#18181b] border border-zinc-800 p-1">
          <TabsTrigger 
            value="titles" 
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
          >
            <Radio className="w-4 h-4 mr-2" />
            Show Titles ({showTitles.length})
          </TabsTrigger>
          <TabsTrigger 
            value="studios"
            className="data-[state=active]:bg-violet-500 data-[state=active]:text-white"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Studios ({studios.length})
          </TabsTrigger>
        </TabsList>

        {/* Show Titles Tab */}
        <TabsContent value="titles">
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Show Titles</h2>
                <p className="text-sm text-zinc-500">DJs can only select from these titles when creating shows</p>
              </div>
              <Button
                data-testid="add-title-btn"
                onClick={openCreateTitleDialog}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-4 h-4" />
                Add Title
              </Button>
            </div>

            {showTitles.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Radio className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No show titles yet</p>
                <p className="text-sm mb-4">Add titles that DJs can select when creating shows</p>
                <Button onClick={openCreateTitleDialog} className="bg-orange-500 hover:bg-orange-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Title
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {showTitles.map((title) => (
                  <div
                    key={title.id}
                    className="flex items-center justify-between p-4 bg-[#27272a] rounded-lg hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Show Image or Icon */}
                      <div className="w-16 h-16 rounded-lg bg-orange-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {title.image ? (
                          <img
                            src={getImageUrl(title.image)}
                            alt={title.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Radio className="w-8 h-8 text-orange-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-white font-medium text-lg">{title.name}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                          {title.description && (
                            <span className="truncate max-w-[300px]">{title.description}</span>
                          )}
                          {title.default_start_time && title.default_end_time && (
                            <span className="flex items-center gap-1 text-orange-400">
                              <Clock className="w-3.5 h-3.5" />
                              {title.default_start_time} - {title.default_end_time}
                            </span>
                          )}
                          {/* Default Presenters */}
                          {title.default_presenters && title.default_presenters.length > 0 && (
                            <span className="flex items-center gap-1 text-violet-400">
                              <Users className="w-3.5 h-3.5" />
                              {title.default_presenters.map(p => p.name).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Image Upload Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10"
                          >
                            <Image className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[#18181b] border-zinc-800">
                          <DropdownMenuItem
                            onClick={() => {
                              setImageTargetTitleId(title.id);
                              setTimeout(() => imageInputRef.current?.click(), 100);
                            }}
                            className="text-zinc-300"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {title.image ? 'Change Image' : 'Upload Image'}
                          </DropdownMenuItem>
                          {title.image && (
                            <DropdownMenuItem
                              onClick={() => handleRemoveImage(title.id)}
                              className="text-orange-500"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Remove Image
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditTitleDialog(title)}
                        className="text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedTitle(title);
                          setDeleteTitleDialogOpen(true);
                        }}
                        className="text-zinc-400 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Studios Tab */}
        <TabsContent value="studios">
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Studios / Rooms</h2>
                <p className="text-sm text-zinc-500">Manage broadcast locations for your shows</p>
              </div>
              <Button
                data-testid="add-studio-btn"
                onClick={openCreateStudioDialog}
                className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
              >
                <Plus className="w-4 h-4" />
                Add Studio
              </Button>
            </div>

            {studios.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Building2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No studios yet</p>
                <p className="text-sm mb-4">Add studios/rooms where shows are broadcast from</p>
                <Button onClick={openCreateStudioDialog} className="bg-violet-500 hover:bg-violet-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Studio
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {studios.map((studio) => (
                  <div
                    key={studio.id}
                    className="flex items-center justify-between p-4 bg-[#27272a] rounded-lg hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-lg">{studio.name}</p>
                        {studio.description && (
                          <p className="text-sm text-zinc-500">{studio.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditStudioDialog(studio)}
                        className="text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedStudio(studio);
                          setDeleteStudioDialogOpen(true);
                        }}
                        className="text-zinc-400 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Show Title Dialog */}
      <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingTitle ? 'Edit Show Title' : 'Add Show Title'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editingTitle 
                ? 'Update the show title details.' 
                : 'Create a new show title that DJs can select when scheduling shows.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTitle} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title Name</Label>
              <Input
                data-testid="title-name-input"
                value={titleFormData.name}
                onChange={(e) => setTitleFormData({ ...titleFormData, name: e.target.value })}
                placeholder="Morning Drive Show"
                required
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Description (optional)</Label>
              <Input
                value={titleFormData.description}
                onChange={(e) => setTitleFormData({ ...titleFormData, description: e.target.value })}
                placeholder="Brief description..."
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Default Start Time</Label>
                <Input
                  type="time"
                  value={titleFormData.default_start_time}
                  onChange={(e) => setTitleFormData({ ...titleFormData, default_start_time: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Default End Time</Label>
                <Input
                  type="time"
                  value={titleFormData.default_end_time}
                  onChange={(e) => setTitleFormData({ ...titleFormData, default_end_time: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white font-mono"
                />
              </div>
            </div>

            {/* RDS Station Selection */}
            <div className="space-y-2">
              <Label className="text-zinc-300">RDS Station</Label>
              <p className="text-xs text-zinc-500 mb-2">Choose on which radio station(s) this show should be displayed in RDS</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'none', label: 'None', color: 'zinc' },
                  { value: 'mfy', label: 'MFY', color: 'orange' },
                  { value: 'grk', label: 'GRK', color: 'violet' },
                  { value: 'both', label: 'Both', color: 'green' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTitleFormData({ ...titleFormData, rds_station: option.value })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      titleFormData.rds_station === option.value
                        ? option.color === 'orange'
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                          : option.color === 'violet'
                          ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                          : option.color === 'green'
                          ? 'bg-green-500/20 border-green-500 text-green-400'
                          : 'bg-zinc-700 border-zinc-600 text-zinc-300'
                        : 'bg-[#27272a] border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Presenters Selection */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Default Presenters</Label>
              <p className="text-xs text-zinc-500 mb-2">Select the default presenters for this show</p>
              <Popover open={presenterPopoverOpen} onOpenChange={setPresenterPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left bg-[#27272a] border-zinc-700 text-white hover:bg-zinc-700"
                  >
                    <Users className="w-4 h-4 mr-2 text-violet-400" />
                    {titleFormData.default_presenter_ids?.length > 0 ? (
                      <span className="truncate">
                        {titleFormData.default_presenter_ids.map(id => 
                          teamUsers.find(u => u.id === id)?.name || 'Unknown'
                        ).join(', ')}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Select presenters...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0 bg-[#18181b] border-zinc-800" align="start">
                  <div className="p-2 border-b border-zinc-800">
                    <p className="text-sm text-zinc-400 font-medium">Team Members</p>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {teamUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => togglePresenter(user.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                          titleFormData.default_presenter_ids?.includes(user.id)
                            ? 'bg-violet-500/20 text-violet-400'
                            : 'hover:bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden">
                          {user.avatar?.s3_url ? (
                            <img src={user.avatar.s3_url} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-zinc-500">{user.role}</p>
                        </div>
                        {titleFormData.default_presenter_ids?.includes(user.id) && (
                          <Check className="w-4 h-4 text-violet-400" />
                        )}
                      </button>
                    ))}
                    {teamUsers.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-4">No team members found</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTitleDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingTitle}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {savingTitle ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  editingTitle ? 'Update Title' : 'Add Title'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Studio Dialog */}
      <Dialog open={studioDialogOpen} onOpenChange={setStudioDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingStudio ? 'Edit Studio' : 'Add Studio'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editingStudio 
                ? 'Update the studio details.' 
                : 'Add a new studio or room where shows are broadcast from.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveStudio} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Studio Name</Label>
              <Input
                data-testid="studio-name-input"
                value={studioFormData.name}
                onChange={(e) => setStudioFormData({ ...studioFormData, name: e.target.value })}
                placeholder="Studio A"
                required
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Description (optional)</Label>
              <Input
                value={studioFormData.description}
                onChange={(e) => setStudioFormData({ ...studioFormData, description: e.target.value })}
                placeholder="Main broadcast studio..."
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStudioDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingStudio}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
              >
                {savingStudio ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  editingStudio ? 'Update Studio' : 'Add Studio'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Title Confirmation */}
      <AlertDialog open={deleteTitleDialogOpen} onOpenChange={setDeleteTitleDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Show Title</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{selectedTitle?.name}"? 
              This won't affect existing shows, but DJs won't be able to select this title for new shows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTitle}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Studio Confirmation */}
      <AlertDialog open={deleteStudioDialogOpen} onOpenChange={setDeleteStudioDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Studio</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{selectedStudio?.name}"? 
              This won't affect existing shows assigned to this studio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudio}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden Image File Input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && imageTargetTitleId) {
            handleImageUpload(e.target.files[0], imageTargetTitleId);
          }
        }}
      />

      {/* Image Resize Dialog */}
      <ImageResizeDialog
        file={resizeFile}
        open={!!resizeFile}
        onClose={() => setResizeFile(null)}
        onResized={handleResized}
      />
    </div>
  );
};

export default ShowManagementPage;
