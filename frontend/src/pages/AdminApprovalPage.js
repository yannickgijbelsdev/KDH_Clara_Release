import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Link,
  BookOpen,
  Eye,
  ChevronRight,
  User,
  Folder,
  Globe,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

const approvalStatusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', label: 'Pending Review' },
  approved: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10', label: 'Rejected' },
};

const AdminApprovalPage = () => {
  const { canApproveContent } = useAuth();
  const navigate = useNavigate();
  const [allContent, setAllContent] = useState([]);
  const [filteredContent, setFilteredContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null);

  useEffect(() => {
    if (!canApproveContent) {
      navigate('/');
      return;
    }
    fetchContent();
  }, [canApproveContent, navigate]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      // Fetch all content with status "ready" for approval
      const response = await axios.get(`${API}/content`);
      // Filter to show content that is "ready" or has approval status
      const readyContent = response.data.filter(
        item => item.status === 'ready' || item.approval_status
      );
      setAllContent(readyContent);
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering
  useEffect(() => {
    let result = allContent;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.title?.toLowerCase().includes(query) ||
        item.created_by_name?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        result = result.filter(item => !item.approval_status || item.approval_status === 'pending');
      } else {
        result = result.filter(item => item.approval_status === statusFilter);
      }
    }

    // Sort: pending first, then by updated_at
    result.sort((a, b) => {
      const aIsPending = !a.approval_status || a.approval_status === 'pending';
      const bIsPending = !b.approval_status || b.approval_status === 'pending';
      if (aIsPending && !bIsPending) return -1;
      if (!aIsPending && bIsPending) return 1;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    setFilteredContent(result);
  }, [allContent, searchQuery, statusFilter]);

  const openApprovalDialog = (item, action) => {
    setSelectedItem(item);
    setApprovalAction(action);
    setApprovalNotes('');
    setApprovalDialogOpen(true);
  };

  const handleApproval = async () => {
    if (!selectedItem || !approvalAction) return;

    setSubmitting(true);
    try {
      await axios.put(`${API}/content/${selectedItem.id}/approval`, {
        approval_status: approvalAction,
        approval_notes: approvalNotes || null,
      });

      toast.success(
        approvalAction === 'approved'
          ? 'Content approved for publishing!'
          : 'Content rejected'
      );

      // Update local state
      setAllContent(prev =>
        prev.map(item =>
          item.id === selectedItem.id
            ? { ...item, approval_status: approvalAction, approval_notes: approvalNotes }
            : item
        )
      );

      setApprovalDialogOpen(false);
    } catch (error) {
      toast.error('Failed to update approval status');
    } finally {
      setSubmitting(false);
    }
  };

  const getApprovalStatus = (item) => {
    if (!item.approval_status || item.approval_status === 'pending') {
      return approvalStatusConfig.pending;
    }
    return approvalStatusConfig[item.approval_status] || approvalStatusConfig.pending;
  };

  const pendingCount = allContent.filter(
    item => !item.approval_status || item.approval_status === 'pending'
  ).length;

  if (!canApprove) {
    return null;
  }

  return (
    <div data-testid="admin-approval-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2">
            Content Approval
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
            {pendingCount > 0 ? (
              <span className="text-yellow-400">
                {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending your approval
              </span>
            ) : (
              'Review and approve content before WordPress publishing'
            )}
          </p>
        </div>
        <Button
          onClick={fetchContent}
          variant="outline"
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or author..."
            className="pl-10 bg-[#18181b] border-zinc-800 text-white placeholder:text-zinc-500"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="bg-[#18181b] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-2"
            >
              {statusFilter === 'all' ? 'All Status' :
               statusFilter === 'pending' ? 'Pending' :
               statusFilter === 'approved' ? 'Approved' : 'Rejected'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#18181b] border-zinc-800">
            <DropdownMenuItem
              onClick={() => setStatusFilter('all')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('pending')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <Clock className="w-4 h-4 mr-2 text-yellow-500" />
              Pending
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('approved')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              Approved
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('rejected')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              <XCircle className="w-4 h-4 mr-2 text-red-500" />
              Rejected
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-800 rounded w-1/3 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {allContent.length === 0 ? 'No content ready for review' : 'No matching content'}
          </h3>
          <p className="text-zinc-400">
            {allContent.length === 0
              ? 'Content set to "Ready" status will appear here for approval'
              : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContent.map((item) => {
            const TypeIcon = typeIcons[item.type] || FileText;
            const statusConfig = getApprovalStatus(item);
            const StatusIcon = statusConfig.icon;
            const isPending = !item.approval_status || item.approval_status === 'pending';

            return (
              <div
                key={item.id}
                className={`bg-[#18181b] border rounded-xl p-4 sm:p-5 transition-all ${
                  isPending
                    ? 'border-yellow-500/50 hover:border-yellow-500'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Featured Image or Type Icon */}
                    {item.featured_image || item.external_featured_image ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                        <img
                          src={
                            item.external_featured_image ||
                            `${API}/uploads/featured_images/${item.featured_image?.file_storage_key}`
                          }
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="p-3 bg-zinc-800 rounded-lg">
                        <TypeIcon className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold truncate">{item.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      {item.excerpt && (
                        <p className="text-zinc-400 text-sm line-clamp-1 mb-2">
                          {item.excerpt}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        {item.category && (
                          <span className="flex items-center gap-1 text-orange-400">
                            <Folder className="w-3 h-3" />
                            {item.category.name}
                          </span>
                        )}
                        
                        {item.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.created_by_name}
                          </span>
                        )}

                        {item.source && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Globe className="w-3 h-3" />
                            {item.source}
                          </span>
                        )}

                        <span>
                          Updated {format(parseISO(item.updated_at), 'MMM d, yyyy HH:mm')}
                        </span>

                        {item.approved_by_name && (
                          <span className="flex items-center gap-1">
                            <StatusIcon className={`w-3 h-3 ${statusConfig.color}`} />
                            by {item.approved_by_name}
                          </span>
                        )}
                      </div>

                      {item.approval_notes && (
                        <p className="text-xs text-zinc-400 mt-2 italic bg-zinc-800/50 rounded px-2 py-1">
                          Note: {item.approval_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/content/${item.id}`)}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>

                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => openApprovalDialog(item, 'approved')}
                          className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApprovalDialog(item, 'rejected')}
                          className="bg-transparent border-red-500/50 text-red-400 hover:bg-red-500/10 gap-1"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </Button>
                      </>
                    )}

                    {item.approval_status === 'approved' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openApprovalDialog(item, 'pending')}
                        className="bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                      >
                        Revoke
                      </Button>
                    )}

                    {item.approval_status === 'rejected' && (
                      <Button
                        size="sm"
                        onClick={() => openApprovalDialog(item, 'approved')}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {approvalAction === 'approved' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Approve Content
                </>
              )}
              {approvalAction === 'rejected' && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  Reject Content
                </>
              )}
              {approvalAction === 'pending' && (
                <>
                  <Clock className="w-5 h-5 text-yellow-500" />
                  Revoke Approval
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selectedItem?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {approvalAction === 'approved' && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400">
                  This content will be approved for WordPress publishing. Editors will be able to publish it.
                </p>
              </div>
            )}

            {approvalAction === 'rejected' && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">
                  This content will be rejected. The editor will see your notes and can make corrections.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">
                {approvalAction === 'rejected' ? 'Reason for rejection (recommended)' : 'Notes (optional)'}
              </label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={
                  approvalAction === 'rejected'
                    ? 'Please explain what needs to be fixed...'
                    : 'Add any notes...'
                }
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setApprovalDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApproval}
                disabled={submitting}
                className={`flex-1 ${
                  approvalAction === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : approvalAction === 'rejected'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-yellow-600 hover:bg-yellow-700'
                } text-white`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : approvalAction === 'approved' ? (
                  'Approve'
                ) : approvalAction === 'rejected' ? (
                  'Reject'
                ) : (
                  'Revoke Approval'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApprovalPage;
