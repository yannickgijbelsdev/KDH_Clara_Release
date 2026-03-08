import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { toast } from 'sonner';
import { Shield, ShieldCheck, ShieldOff, Copy, Check, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TwoFactorSetup = ({ user, onUpdate }) => {
  const [status, setStatus] = useState({ enabled: false, backup_codes_remaining: 0 });
  const [loading, setLoading] = useState(true);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);
  
  // Setup state
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [setupStep, setSetupStep] = useState(1); // 1: QR, 2: Verify, 3: Backup codes
  
  // Disable state
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  
  // Backup codes state
  const [backupCodes, setBackupCodes] = useState([]);
  const [regenerateCode, setRegenerateCode] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await axios.get(`${API}/auth/2fa/status`);
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startSetup = async () => {
    try {
      const response = await axios.post(`${API}/auth/2fa/setup`);
      setSetupData(response.data);
      setBackupCodes(response.data.backup_codes);
      setSetupStep(1);
      setSetupDialogOpen(true);
    } catch (error) {
      toast.error('Kon 2FA setup niet starten');
    }
  };

  const verifySetup = async () => {
    setVerifying(true);
    try {
      await axios.post(`${API}/auth/2fa/verify-setup`, { code: verifyCode });
      setSetupStep(3); // Show backup codes
      toast.success('2FA is nu actief!');
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid code');
    } finally {
      setVerifying(false);
    }
  };

  const disable2FA = async () => {
    setDisabling(true);
    try {
      await axios.post(`${API}/auth/2fa/disable`, { code: disableCode });
      toast.success('2FA has been disabled');
      setDisableDialogOpen(false);
      setDisableCode('');
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid code');
    } finally {
      setDisabling(false);
    }
  };

  const regenerateBackupCodes = async () => {
    setRegenerating(true);
    try {
      const response = await axios.post(`${API}/auth/2fa/regenerate-backup-codes`, { code: regenerateCode });
      setBackupCodes(response.data.backup_codes);
      setRegenerateCode('');
      toast.success('New backup codes generated');
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid code');
    } finally {
      setRegenerating(false);
    }
  };

  const copyCode = (code, index) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('All codes copied');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {status.enabled ? (
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
          ) : (
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Shield className="w-5 h-5 text-amber-500" />
            </div>
          )}
          <div>
            <h3 className="font-medium text-white">Two-factor authentication</h3>
            <p className="text-sm text-zinc-400">
              {status.enabled 
                ? `Active - ${status.backup_codes_remaining} backup codes remaining`
                : 'Niet actief - Stel in voor extra beveiliging'
              }
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {status.enabled ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setBackupCodesDialogOpen(true)}
                className="gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Backup codes
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setDisableDialogOpen(true)}
                className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <ShieldOff className="w-4 h-4" />
                Disable
              </Button>
            </>
          ) : (
            <Button onClick={startSetup} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Shield className="w-4 h-4" />
              Setup 2FA
            </Button>
          )}
        </div>
      </div>

      {!status.enabled && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 font-medium">Secure your account</p>
            <p className="text-amber-200/70 text-sm">
              Two-factor authentication adds an extra layer of security to your account. 
              We strongly recommend enabling it.
            </p>
          </div>
        </div>
      )}

      {/* Setup Dialog */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Setup 2FA
            </DialogTitle>
            <DialogDescription>
              {setupStep === 1 && 'Scan the QR code with your authenticator app'}
              {setupStep === 2 && 'Enter the code from your authenticator app'}
              {setupStep === 3 && 'Save these backup codes in a safe place'}
            </DialogDescription>
          </DialogHeader>

          {setupStep === 1 && setupData && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg mx-auto w-fit">
                <img 
                  src={`data:image/png;base64,${setupData.qr_code}`} 
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-zinc-400 text-center">
                Gebruik Google Authenticator, Authy, of een andere TOTP app
              </p>
              <div className="bg-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Or enter this code manually:</p>
                <code className="text-sm text-white font-mono break-all">{setupData.secret}</code>
              </div>
              <Button onClick={() => setSetupStep(2)} className="w-full">
                Volgende
              </Button>
            </div>
          )}

          {setupStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Verification code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSetupStep(1)} className="flex-1">
                  Terug
                </Button>
                <Button 
                  onClick={verifySetup} 
                  disabled={verifyCode.length !== 6 || verifying}
                  className="flex-1"
                >
                  {verifying ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-200 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Store these codes safely! You can use them if you lose access to your authenticator.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <button
                    key={i}
                    onClick={() => copyCode(code, i)}
                    className="bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-2 font-mono text-sm text-white flex items-center justify-between transition-colors"
                  >
                    {code}
                    {copiedIndex === i ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>
                ))}
              </div>
              <Button variant="outline" onClick={copyAllCodes} className="w-full gap-2">
                <Copy className="w-4 h-4" />
                Alle codes kopiëren
              </Button>
              <Button onClick={() => {
                setSetupDialogOpen(false);
                setSetupStep(1);
                setVerifyCode('');
                setSetupData(null);
              }} className="w-full">
                Klaar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <ShieldOff className="w-5 h-5" />
              2FA uitschakelen
            </DialogTitle>
            <DialogDescription>
              Enter your current authenticator code to disable 2FA.
              This makes your account less secure.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Authenticator code</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                setDisableDialogOpen(false);
                setDisableCode('');
              }} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={disable2FA}
                disabled={disableCode.length !== 6 || disabling}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {disabling ? 'Disabling...' : 'Disable'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={backupCodesDialogOpen} onOpenChange={setBackupCodesDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-orange-500" />
              Backup codes
            </DialogTitle>
            <DialogDescription>
              Je hebt nog {status.backup_codes_remaining} backup codes over.
              Genereer nieuwe codes als je ze bijna op hebt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {status.backup_codes_remaining <= 3 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-200 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Je hebt nog maar weinig backup codes over!
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Authenticator code om nieuwe codes te genereren</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={regenerateCode}
                onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>

            <Button 
              onClick={regenerateBackupCodes}
              disabled={regenerateCode.length !== 6 || regenerating}
              className="w-full"
            >
              {regenerating ? 'Genereren...' : 'Nieuwe codes genereren'}
            </Button>

            {backupCodes.length > 0 && (
              <>
                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-sm text-zinc-400 mb-2">Je nieuwe backup codes:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <button
                        key={i}
                        onClick={() => copyCode(code, i)}
                        className="bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-2 font-mono text-sm text-white flex items-center justify-between transition-colors"
                      >
                        {code}
                        {copiedIndex === i ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-zinc-500" />
                        )}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" onClick={copyAllCodes} className="w-full gap-2 mt-2">
                    <Copy className="w-4 h-4" />
                    Alle codes kopiëren
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TwoFactorSetup;
