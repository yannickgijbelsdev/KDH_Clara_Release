import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { AlertTriangle, Database, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export default function MigrationTool() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [detectedInfo, setDetectedInfo] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [formData, setFormData] = useState({
    main_site_name: '',
    main_site_slug: 'radiogroep'
  });

  const fetchDetectedInfo = async () => {
    try {
      const response = await axios.get(`${API}/api/admin/migration/detect-site-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetectedInfo(response.data);
      // Pre-fill form with detected values if empty
      if (!formData.main_site_name || formData.main_site_name === '') {
        setFormData(prev => ({
          ...prev,
          main_site_name: response.data.suggested_name || 'Radiogroep',
          main_site_slug: 'radiogroep' // User requested fixed slug
        }));
      }
    } catch (error) {
      console.error('Failed to detect site info:', error);
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes] = await Promise.all([
        axios.get(`${API}/api/admin/migration/status`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetchDetectedInfo()
      ]);
      setStatus(statusRes.data);
    } catch (error) {
      toast.error('Failed to fetch migration status');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async (dryRun = true) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/api/admin/migration/run`, {
        main_site_name: formData.main_site_name,
        main_site_slug: formData.main_site_slug,
        dry_run: dryRun
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMigrationResult(response.data);
      
      if (response.data.success) {
        if (dryRun) {
          toast.success('Dry run completed - review the results');
        } else {
          toast.success('Migration completed successfully!');
        }
      } else {
        toast.error(response.data.message || 'Migration failed');
      }
    } catch (error) {
      toast.error('Migration failed: ' + (error.response?.data?.detail || error.message));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setMigrationResult(null);
    fetchStatus();
  };

  const needsMigration = status?.needs_migration > 0 || status?.main_sites?.length === 0;

  return (
    <>
      <Card className="bg-white border-zinc-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="w-5 h-5 text-orange-500" />
            Database Migration
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Migrate existing data to multisite architecture
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleOpen} variant="outline" className="w-full">
            Open Migration Tool
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-white border-zinc-200 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-500" />
              Multisite Migration Tool
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              This tool migrates your existing data to the multisite architecture.
            </DialogDescription>
          </DialogHeader>

          {loading && !status && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          )}

          {status && !migrationResult && (
            <div className="space-y-4">
              {/* Current Status */}
              <div className="bg-zinc-50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-3">Current Status</h3>
                
                <div className="grid grid-cols-3 gap-4 text-center mb-4">
                  <div className="bg-zinc-900 rounded p-3">
                    <div className="text-2xl font-bold text-white">{status.total_documents}</div>
                    <div className="text-xs text-zinc-400">Total Documents</div>
                  </div>
                  <div className="bg-zinc-900 rounded p-3">
                    <div className="text-2xl font-bold text-green-500">{status.already_migrated}</div>
                    <div className="text-xs text-zinc-400">Already Migrated</div>
                  </div>
                  <div className="bg-zinc-900 rounded p-3">
                    <div className="text-2xl font-bold text-orange-500">{status.needs_migration}</div>
                    <div className="text-xs text-zinc-400">Needs Migration</div>
                  </div>
                </div>

                {status.main_sites?.length > 0 ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>{status.main_sites.length} Main Site(s) exist</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-500 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>No Main Sites yet - migration required</span>
                  </div>
                )}
              </div>

              {/* Collections to migrate */}
              {Object.keys(status.collections || {}).length > 0 && (
                <div className="bg-zinc-50 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3">Collections</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(status.collections).map(([name, data]) => (
                      <div key={name} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600">{data.description}</span>
                        <span className={data.needs_migration > 0 ? 'text-orange-500' : 'text-green-500'}>
                          {data.needs_migration > 0 ? `${data.needs_migration} to migrate` : '✓ Done'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Migration Settings */}
              {needsMigration && (
                <div className="bg-zinc-50 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3">Migration Settings</h3>
                  
                  {/* Auto-detected info banner */}
                  {detectedInfo && detectedInfo.detected_from && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                      <p className="text-blue-400 text-sm">
                        <CheckCircle className="w-4 h-4 inline mr-2" />
                        Auto-gedetecteerd vanuit {detectedInfo.detected_from === 'team_name' ? 'team naam' : 'RDS instellingen'}: <strong>{detectedInfo.team_name || detectedInfo.suggested_name}</strong>
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div>
                      <Label className="text-zinc-600">Main Site Name</Label>
                      <Input
                        value={formData.main_site_name}
                        onChange={(e) => setFormData({ ...formData, main_site_name: e.target.value })}
                        className="bg-zinc-900 border-zinc-300"
                        placeholder="My Organization"
                      />
                      {detectedInfo?.suggested_name && formData.main_site_name !== detectedInfo.suggested_name && (
                        <button 
                          type="button"
                          className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                          onClick={() => setFormData(prev => ({ ...prev, main_site_name: detectedInfo.suggested_name }))}
                        >
                          Gebruik gedetecteerde naam: {detectedInfo.suggested_name}
                        </button>
                      )}
                    </div>
                    <div>
                      <Label className="text-zinc-600">URL Slug</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">/</span>
                        <Input
                          value={formData.main_site_slug}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            main_site_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') 
                          })}
                          className="bg-zinc-900 border-zinc-300"
                          placeholder="my-organization"
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        URL will be: clara.koodh.com/{formData.main_site_slug}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning */}
              {needsMigration && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-orange-500 font-medium">Before you migrate</p>
                      <ul className="text-sm text-zinc-400 mt-1 space-y-1">
                        <li>• First run a <strong>Dry Run</strong> to preview changes</li>
                        <li>• The migration adds main_site_id to existing documents</li>
                        <li>• This operation cannot be easily undone</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Migration Result */}
          {migrationResult && (
            <div className="space-y-4">
              <div className={`rounded-lg p-4 ${migrationResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {migrationResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className={`font-medium ${migrationResult.success ? 'text-green-500' : 'text-red-500'}`}>
                    {migrationResult.message}
                  </span>
                </div>
                
                {migrationResult.dry_run && (
                  <p className="text-sm text-zinc-400">
                    This was a dry run - no changes were made.
                  </p>
                )}
              </div>

              {migrationResult.success && (
                <div className="bg-zinc-50 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3">Results</h3>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Main Site</span>
                      <span className="text-white">{migrationResult.main_site_name} (/{migrationResult.main_site_slug})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Users Linked</span>
                      <span className="text-white">{migrationResult.stats?.users_linked || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Main Site Created</span>
                      <span className="text-white">{migrationResult.stats?.main_site_created ? 'Yes' : 'No (already existed)'}</span>
                    </div>
                  </div>

                  {Object.keys(migrationResult.stats?.collections_updated || {}).length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-zinc-600 text-sm font-medium mb-2">Collections Updated</h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {Object.entries(migrationResult.stats.collections_updated).map(([name, data]) => (
                          <div key={name} className="flex justify-between text-xs">
                            <span className="text-zinc-400">{data.description}</span>
                            <span className={data.updated > 0 ? 'text-orange-500' : 'text-green-500'}>
                              {data.updated > 0 ? `${data.updated} ${migrationResult.dry_run ? 'would update' : 'updated'}` : 'No changes'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {migrationResult.errors?.length > 0 && (
                <div className="bg-red-500/10 rounded-lg p-4">
                  <h3 className="text-red-500 font-medium mb-2">Errors</h3>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    {migrationResult.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {!migrationResult ? (
              <>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                {needsMigration && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => runMigration(true)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Dry Run (Preview)
                    </Button>
                    <Button 
                      onClick={() => runMigration(false)}
                      disabled={loading}
                      className="bg-orange-500 hover:bg-orange-600"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Run Migration
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => {
                  setMigrationResult(null);
                  fetchStatus();
                }}>
                  Back to Status
                </Button>
                {migrationResult.dry_run && migrationResult.success && (
                  <Button 
                    onClick={() => runMigration(false)}
                    disabled={loading}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                    Run Actual Migration
                  </Button>
                )}
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
