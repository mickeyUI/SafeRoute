import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bus,
  Car,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Footprints,
  HeartHandshake,
  Lock,
  Mail,
  MapPin,
  Moon,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import {
  clearToken,
  getCachedUser,
  getMe,
  getPreferences,
  getToken,
  login,
  loginWithGoogle,
  register,
  savePreferences,
  saveToken,
  saveUser,
  type UserPreferences,
  type UserRead,
} from './auth';
import { checkBackendHealth, createBackendContact } from './services';

// ─── Google Brand Icon ────────────────────────────────────────────────────────

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="ob-google-icon" viewBox="0 0 24 24" width={size} height={size}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'welcome' | 'signup' | 'safety-profile' | 'emergency-contact' | 'signin' | 'success';

interface OnboardingProps {
  onComplete: (user: UserRead, token: string, preferences?: UserPreferences) => void;
  onSkip: () => void;
}

// ─── Form validation helpers ──────────────────────────────────────────────────

function validateEmail(value: string): string {
  if (!value.trim()) return 'Email address is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email address';
  return '';
}

function validatePassword(value: string): string {
  if (!value) return 'Password is required';
  if (value.length < 6) return 'Password must be at least 6 characters';
  return '';
}

function validateConfirm(password: string, confirm: string): string {
  if (!confirm) return 'Please confirm your password';
  if (password !== confirm) return 'Passwords do not match';
  return '';
}

// ─── Step Progress Header ─────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  totalSteps,
  stepLabel,
  onBack,
}: {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="ob-step-header">
      <button type="button" className="ob-back-btn" onClick={onBack} aria-label="Go back">
        <ArrowLeft size={18} />
      </button>
      <div className="ob-step-meta">
        <span className="ob-step-counter">Step {currentStep} of {totalSteps}</span>
        <span className="ob-step-title">{stepLabel}</span>
      </div>
      <div className="ob-step-dots" aria-label={`Step ${currentStep} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <span
            key={i}
            className={`ob-step-dot${i + 1 === currentStep ? ' active' : i + 1 < currentStep ? ' completed' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Password Input with visibility toggle ────────────────────────────────────

function PasswordInputField({
  id,
  value,
  onChange,
  placeholder,
  error,
  label,
  autoComplete = 'current-password',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  label: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="ob-field">
      <label htmlFor={id} className="ob-label">{label}</label>
      <div className={`ob-input-wrap${error ? ' ob-input-error' : ''}`}>
        <Lock size={15} className="ob-input-icon" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
        />
        <button
          type="button"
          className="ob-eye-btn"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="ob-field-error">{error}</p>}
    </div>
  );
}

// ─── Google Account Picker Dialog ─────────────────────────────────────────────

interface GoogleAccountPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAccount: (email: string, fullName: string, avatarUrl?: string) => Promise<void>;
  loading: boolean;
}

function GoogleAccountPickerModal({
  isOpen,
  onClose,
  onSelectAccount,
  loading,
}: GoogleAccountPickerProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleCustomSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customEmail.trim() || !validateEmail(customEmail)) {
      setError('Please enter a valid Google email address');
      return;
    }
    setError('');
    await onSelectAccount(
      customEmail.trim(),
      customName.trim() || customEmail.split('@')[0],
      'https://lh3.googleusercontent.com/a/default-user',
    );
  }

  return (
    <div className="ob-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="ob-google-modal" role="dialog" aria-labelledby="google-modal-title">
        <div className="ob-google-modal-top">
          <GoogleIcon size={26} />
          <h3 id="google-modal-title">Sign in with Google</h3>
          <p>Choose an account to continue to <strong>SafeRoute</strong></p>
          <button type="button" className="ob-modal-close" onClick={onClose} aria-label="Close dialog" disabled={loading}>
            <X size={16} />
          </button>
        </div>

        {!customMode ? (
          <div className="ob-google-accounts-list">
            <button
              type="button"
              className="ob-google-account-item"
              disabled={loading}
              onClick={() => void onSelectAccount(
                'saferoute.explorer@gmail.com',
                'SafeRoute Explorer',
                'https://lh3.googleusercontent.com/a/default-user',
              )}
            >
              <div className="ob-google-avatar" style={{ background: '#4285F4' }}>S</div>
              <div className="ob-google-account-info">
                <strong>SafeRoute Explorer</strong>
                <span>saferoute.explorer@gmail.com</span>
              </div>
            </button>

            <button
              type="button"
              className="ob-google-account-item"
              disabled={loading}
              onClick={() => void onSelectAccount(
                'addis.safety@gmail.com',
                'Addis Safety Fellow',
                'https://lh3.googleusercontent.com/a/default-user',
              )}
            >
              <div className="ob-google-avatar" style={{ background: '#34A853' }}>A</div>
              <div className="ob-google-account-info">
                <strong>Addis Safety Fellow</strong>
                <span>addis.safety@gmail.com</span>
              </div>
            </button>

            <button
              type="button"
              className="ob-google-use-another"
              onClick={() => setCustomMode(true)}
              disabled={loading}
            >
              <User size={16} />
              <span>Use another Google account</span>
            </button>
          </div>
        ) : (
          <form className="ob-google-custom-form" onSubmit={handleCustomSubmit}>
            <div className="ob-field">
              <label htmlFor="custom-g-name" className="ob-label">Google Account Name</label>
              <div className="ob-input-wrap">
                <User size={15} className="ob-input-icon" />
                <input
                  id="custom-g-name"
                  type="text"
                  placeholder="e.g. Maya Lin"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>
            </div>

            <div className="ob-field">
              <label htmlFor="custom-g-email" className="ob-label">Google Email</label>
              <div className="ob-input-wrap">
                <Mail size={15} className="ob-input-icon" />
                <input
                  id="custom-g-email"
                  type="email"
                  placeholder="name@gmail.com"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="ob-field-error">{error}</p>}

            <div className="ob-google-form-actions">
              <button
                type="button"
                className="ob-secondary-btn"
                onClick={() => setCustomMode(false)}
                disabled={loading}
              >
                Back
              </button>
              <button type="submit" className="ob-primary-btn" disabled={loading}>
                {loading ? 'Connecting…' : 'Continue with Google'}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="ob-google-loading-bar">
            <span className="ob-spinner" />
            <span>Authenticating with Google…</span>
          </div>
        )}

        <div className="ob-google-disclaimer">
          To continue, Google will share your name, email address, language preference, and profile picture with SafeRoute.
        </div>
      </div>
    </div>
  );
}

// ─── Screen 1: Welcome Screen ─────────────────────────────────────────────────

function WelcomeScreen({
  onGetStarted,
  onSignIn,
  onGoogleSignIn,
  onSkip,
  backendDown,
}: {
  onGetStarted: () => void;
  onSignIn: () => void;
  onGoogleSignIn: () => void;
  onSkip: () => void;
  backendDown: boolean;
}) {
  return (
    <div className="ob-screen ob-welcome">
      <div className="ob-welcome-badge">
        <span className="ob-pulse-dot" /> SafeRoute Addis Community
      </div>

      <div className="ob-welcome-art" aria-hidden>
        <div className="ob-shield-ring ob-ring-1" />
        <div className="ob-shield-ring ob-ring-2" />
        <div className="ob-shield-ring ob-ring-3" />
        <div className="ob-shield-icon-wrap">
          <ShieldCheck size={52} strokeWidth={1.8} />
        </div>
      </div>

      <div className="ob-welcome-copy">
        <h1 className="ob-welcome-title">
          Navigate safely.<br />
          <span>Every step of the way.</span>
        </h1>
        <p className="ob-welcome-desc">
          Real-time community safety alerts, AI-assessed risk avoidance, and instant emergency SOS tracking for when it matters most.
        </p>
      </div>

      <div className="ob-welcome-features">
        <div className="ob-feature-card">
          <div className="ob-feature-icon">
            <Footprints size={18} />
          </div>
          <div className="ob-feature-text">
            <strong>Safe Route Ranking</strong>
            <span>Picks paths avoiding reported hazards & dark alleys</span>
          </div>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon">
            <ShieldAlert size={18} />
          </div>
          <div className="ob-feature-text">
            <strong>Community Hazard Alerts</strong>
            <span>Crowdsourced safety reports with photo & audio notes</span>
          </div>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon">
            <HeartHandshake size={18} />
          </div>
          <div className="ob-feature-text">
            <strong>Emergency Tracking Link</strong>
            <span>One-tap live GPS journey sharing for trusted contacts</span>
          </div>
        </div>
      </div>

      <div className="ob-welcome-actions">
        {/* Google Sign-in Button */}
        <button type="button" className="ob-google-btn" onClick={onGoogleSignIn}>
          <GoogleIcon />
          <span>Continue with Google</span>
        </button>

        <div className="ob-divider">
          <span>or create with email</span>
        </div>

        <button type="button" className="ob-primary-btn" onClick={onGetStarted}>
          <span>Create Safety Account</span>
          <ArrowRight size={17} />
        </button>

        <button type="button" className="ob-secondary-btn" onClick={onSignIn}>
          I already have an account · Sign in
        </button>

        <button type="button" className="ob-ghost-btn" onClick={onSkip}>
          {backendDown ? 'Explore map in offline demo mode' : 'Continue as guest without account'}
        </button>
      </div>
    </div>
  );
}

// ─── Screen 2: Signup Screen ──────────────────────────────────────────────────

function SignupScreen({
  onBack,
  onDone,
  onGoToSignin,
  onGoogleSignIn,
}: {
  onBack: () => void;
  onDone: (user: UserRead, token: string) => void;
  onGoToSignin: () => void;
  onGoogleSignIn: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [nameErr, setNameErr] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const [globalErr, setGlobalErr] = useState('');
  const [busy, setBusy] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ne = name.trim() ? '' : 'Please enter your full name';
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    const ce = validateConfirm(password, confirm);

    setNameErr(ne); setEmailErr(ee); setPassErr(pe); setConfirmErr(ce);
    if (ne || ee || pe || ce) return;

    setBusy(true);
    setGlobalErr('');
    try {
      const auth = await register(email.trim(), password, name.trim());
      saveToken(auth.access_token);
      saveUser(auth.user);
      onDone(auth.user, auth.access_token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please check your network.';
      setGlobalErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-screen ob-form-screen">
      <StepIndicator
        currentStep={1}
        totalSteps={3}
        stepLabel="Account Creation"
        onBack={onBack}
      />

      <div className="ob-form-title-wrap">
        <h2 className="ob-form-title">Create your safety account</h2>
        <p className="ob-form-subtitle">
          Verified accounts protect the community and let you access real-time dispatch and trusted contact alerts.
        </p>
      </div>

      {/* Google Signup Button */}
      <button type="button" className="ob-google-btn" onClick={onGoogleSignIn}>
        <GoogleIcon />
        <span>Sign up with Google</span>
      </button>

      <div className="ob-divider">
        <span>or register with email</span>
      </div>

      <form className="ob-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Full Name */}
        <div className="ob-field">
          <label htmlFor="ob-name" className="ob-label">Full Name</label>
          <div className={`ob-input-wrap${nameErr ? ' ob-input-error' : ''}`}>
            <User size={15} className="ob-input-icon" />
            <input
              ref={nameRef}
              id="ob-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameErr) setNameErr(''); }}
              placeholder="e.g. Selam Haile"
            />
          </div>
          {nameErr && <p className="ob-field-error">{nameErr}</p>}
        </div>

        {/* Email Address */}
        <div className="ob-field">
          <label htmlFor="ob-email" className="ob-label">Email Address</label>
          <div className={`ob-input-wrap${emailErr ? ' ob-input-error' : ''}`}>
            <Mail size={15} className="ob-input-icon" />
            <input
              id="ob-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(''); }}
              placeholder="you@example.com"
            />
          </div>
          {emailErr && <p className="ob-field-error">{emailErr}</p>}
        </div>

        {/* Password */}
        <PasswordInputField
          id="ob-password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(v) => { setPassword(v); if (passErr) setPassErr(''); }}
          error={passErr}
          placeholder="At least 6 characters"
        />

        {/* Confirm Password */}
        <PasswordInputField
          id="ob-confirm"
          label="Confirm Password"
          autoComplete="new-password"
          value={confirm}
          onChange={(v) => { setConfirm(v); if (confirmErr) setConfirmErr(''); }}
          error={confirmErr}
          placeholder="Re-enter your password"
        />

        {globalErr && (
          <div className="ob-global-error" role="alert">
            <X size={15} />
            <span>{globalErr}</span>
          </div>
        )}

        <button type="submit" className="ob-primary-btn ob-submit-btn" disabled={busy}>
          {busy ? <span className="ob-spinner" /> : <ArrowRight size={17} />}
          <span>{busy ? 'Creating account…' : 'Continue to Safety Profile'}</span>
        </button>
      </form>

      <p className="ob-switch-hint">
        Already have an account?{' '}
        <button type="button" className="ob-link-btn" onClick={onGoToSignin}>
          Sign in instead
        </button>
      </p>
    </div>
  );
}

// ─── Screen 3: Safety & Travel Profile ────────────────────────────────────────

const COMMUTE_OPTIONS: Array<{
  id: UserPreferences['commuteMode'];
  label: string;
  desc: string;
  icon: typeof Footprints;
}> = [
  { id: 'walking', label: 'Pedestrian / Walking', desc: 'Frequent foot travel, prioritizes well-lit walkways', icon: Footprints },
  { id: 'transit', label: 'Public Transit / Bus', desc: 'Transfers at bus stops, prefers active transit hubs', icon: Bus },
  { id: 'night-shift', label: 'Night Commuter', desc: 'Active late nights, seeks verified 24/7 safe havens', icon: Moon },
  { id: 'driving', label: 'Driving / Rideshare', desc: 'Vehicular navigation avoiding high hazard spots', icon: Car },
];

const SAFETY_PRIORITIES: Array<{
  id: UserPreferences['safetyPriority'];
  label: string;
  desc: string;
}> = [
  { id: 'well-lit', label: 'Well-lit & Populated', desc: 'Strictly avoids isolated alleys and unlit corridors' },
  { id: 'safe-havens', label: 'Safe Haven Proximity', desc: 'Routes stay within 500m of open safe havens & police posts' },
  { id: 'shortest-safe', label: 'Balanced (Shortest & Safest)', desc: 'Fastest route that bypasses known high-risk hazards' },
];

function SafetyProfileScreen({
  initialArea,
  onBack,
  onNext,
  onSkip,
}: {
  initialArea?: string;
  onBack: () => void;
  onNext: (profile: Partial<UserPreferences>) => void;
  onSkip: () => void;
}) {
  const [city, setCity] = useState(initialArea || 'Addis Ababa');
  const [commuteMode, setCommuteMode] = useState<UserPreferences['commuteMode']>('walking');
  const [safetyPriority, setSafetyPriority] = useState<UserPreferences['safetyPriority']>('well-lit');

  function handleContinue() {
    onNext({
      city: city.trim(),
      commuteMode,
      safetyPriority,
    });
  }

  return (
    <div className="ob-screen ob-form-screen">
      <StepIndicator
        currentStep={2}
        totalSteps={3}
        stepLabel="Safety Preferences"
        onBack={onBack}
      />

      <div className="ob-form-title-wrap">
        <h2 className="ob-form-title">Personalize your safety</h2>
        <p className="ob-form-subtitle">
          SafeRoute optimizes navigation algorithms and alert sensitivity based on your travel habits.
        </p>
      </div>

      <div className="ob-form">
        {/* Primary Neighborhood / City */}
        <div className="ob-field">
          <label htmlFor="ob-city" className="ob-label">Primary City / Neighborhood</label>
          <div className="ob-input-wrap">
            <MapPin size={15} className="ob-input-icon" />
            <input
              id="ob-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Bole, Addis Ababa"
            />
          </div>
          <small className="ob-hint">Used to center your safety radar and alert feeds.</small>
        </div>

        {/* Primary Travel Mode */}
        <div className="ob-field">
          <label className="ob-label">Primary Way You Travel</label>
          <div className="ob-selection-grid">
            {COMMUTE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = commuteMode === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  className={`ob-option-card${isSelected ? ' selected' : ''}`}
                  onClick={() => setCommuteMode(opt.id)}
                >
                  <div className="ob-option-icon">
                    <Icon size={18} />
                  </div>
                  <div className="ob-option-copy">
                    <strong>{opt.label}</strong>
                    <span>{opt.desc}</span>
                  </div>
                  {isSelected && <span className="ob-check-mark"><Check size={14} /></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Safety Priority */}
        <div className="ob-field">
          <label className="ob-label">Route Assessment Priority</label>
          <div className="ob-priority-group">
            {SAFETY_PRIORITIES.map((pri) => {
              const isSelected = safetyPriority === pri.id;
              return (
                <label key={pri.id} className={`ob-priority-item${isSelected ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="safety-priority"
                    checked={isSelected}
                    onChange={() => setSafetyPriority(pri.id)}
                  />
                  <div className="ob-priority-copy">
                    <strong>{pri.label}</strong>
                    <span>{pri.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <button type="button" className="ob-primary-btn ob-submit-btn" onClick={handleContinue}>
          <ArrowRight size={17} />
          <span>Continue to Emergency Contact</span>
        </button>

        <button type="button" className="ob-ghost-btn ob-skip-step-btn" onClick={onSkip}>
          Skip preference customization
        </button>
      </div>
    </div>
  );
}

// ─── Screen 4: Emergency / Trusted Contact ────────────────────────────────────

function EmergencyContactScreen({
  onBack,
  onSave,
  onSkip,
}: {
  onBack: () => void;
  onSave: (contact: { emergencyContactName: string; emergencyContactPhone: string }) => void;
  onSkip: () => void;
}) {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (contactPhone && !/^[+0-9\s()-]{6,20}$/.test(contactPhone.trim())) {
      setPhoneErr('Please enter a valid phone number with optional country code');
      return;
    }

    onSave({
      emergencyContactName: contactName.trim(),
      emergencyContactPhone: contactPhone.trim(),
    });
  }

  return (
    <div className="ob-screen ob-form-screen">
      <StepIndicator
        currentStep={3}
        totalSteps={3}
        stepLabel="Emergency Contact"
        onBack={onBack}
      />

      <div className="ob-form-title-wrap">
        <h2 className="ob-form-title">Add your trusted contact</h2>
        <p className="ob-form-subtitle">
          If you ever trigger an SOS alert, SafeRoute generates a secure live-tracking link that you can share with this contact.
        </p>
      </div>

      <div className="ob-info-callout">
        <ShieldCheck size={20} className="ob-callout-icon" />
        <div>
          <strong>Privacy Guaranteed</strong>
          <p>Your contact’s information remains stored on your device and is only referenced when you dispatch an SOS.</p>
        </div>
      </div>

      <form className="ob-form" onSubmit={handleSubmit} noValidate>
        {/* Contact Name */}
        <div className="ob-field">
          <label htmlFor="ob-contact-name" className="ob-label">Contact’s Name (Optional)</label>
          <div className="ob-input-wrap">
            <User size={15} className="ob-input-icon" />
            <input
              id="ob-contact-name"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Mom, Abebe, Sister"
            />
          </div>
        </div>

        {/* Contact Phone */}
        <div className="ob-field">
          <label htmlFor="ob-contact-phone" className="ob-label">Contact’s Phone Number (Optional)</label>
          <div className={`ob-input-wrap${phoneErr ? ' ob-input-error' : ''}`}>
            <Phone size={15} className="ob-input-icon" />
            <input
              id="ob-contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => { setContactPhone(e.target.value); if (phoneErr) setPhoneErr(''); }}
              placeholder="+251 91 123 4567"
            />
          </div>
          {phoneErr && <p className="ob-field-error">{phoneErr}</p>}
        </div>

        <button type="submit" className="ob-primary-btn ob-submit-btn">
          <CheckCircle2 size={17} />
          <span>Save & Complete Setup</span>
        </button>

        <button type="button" className="ob-ghost-btn ob-skip-step-btn" onClick={onSkip}>
          I’ll add a contact later
        </button>
      </form>
    </div>
  );
}

// ─── Screen 5: Sign In Screen ─────────────────────────────────────────────────

function SigninScreen({
  onBack,
  onDone,
  onGoToSignup,
  onGoogleSignIn,
}: {
  onBack: () => void;
  onDone: (user: UserRead, token: string) => void;
  onGoToSignup: () => void;
  onGoogleSignIn: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [globalErr, setGlobalErr] = useState('');
  const [busy, setBusy] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  function fillDemoCredentials() {
    setEmail('demo@saferoute.app');
    setPassword('SafeRoute2026!');
    setEmailErr('');
    setPassErr('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    const pe = password ? '' : 'Please enter your password';
    setEmailErr(ee); setPassErr(pe);
    if (ee || pe) return;

    setBusy(true);
    setGlobalErr('');
    try {
      const auth = await login(email.trim(), password);
      saveToken(auth.access_token);
      saveUser(auth.user);
      onDone(auth.user, auth.access_token);
    } catch (err: unknown) {
      setGlobalErr(
        err instanceof Error
          ? err.message.toLowerCase().includes('401') || err.message.toLowerCase().includes('invalid')
            ? 'Incorrect email or password. Please try again.'
            : err.message
          : 'Sign in failed. Please check your connection.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-screen ob-form-screen">
      <div className="ob-step-header">
        <button type="button" className="ob-back-btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={18} />
        </button>
        <div className="ob-step-meta">
          <span className="ob-step-title">Account Access</span>
        </div>
      </div>

      <div className="ob-form-title-wrap">
        <h2 className="ob-form-title">Welcome back</h2>
        <p className="ob-form-subtitle">Sign in to your SafeRoute account to access saved routes and sync reports.</p>
      </div>

      {/* Google Signin Button */}
      <button type="button" className="ob-google-btn" onClick={onGoogleSignIn}>
        <GoogleIcon />
        <span>Sign in with Google</span>
      </button>

      <div className="ob-divider">
        <span>or sign in with email</span>
      </div>

      <form className="ob-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {/* Email */}
        <div className="ob-field">
          <label htmlFor="ob-signin-email" className="ob-label">Email Address</label>
          <div className={`ob-input-wrap${emailErr ? ' ob-input-error' : ''}`}>
            <Mail size={15} className="ob-input-icon" />
            <input
              ref={emailRef}
              id="ob-signin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(''); }}
              placeholder="you@example.com"
            />
          </div>
          {emailErr && <p className="ob-field-error">{emailErr}</p>}
        </div>

        {/* Password */}
        <PasswordInputField
          id="ob-signin-pass"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(v) => { setPassword(v); if (passErr) setPassErr(''); }}
          error={passErr}
          placeholder="Your password"
        />

        {/* Demo Credentials Pill */}
        <div className="ob-demo-box">
          <div className="ob-demo-box-copy">
            <strong>Testing credentials available:</strong>
            <span>demo@saferoute.app · SafeRoute2026!</span>
          </div>
          <button type="button" className="ob-demo-fill-btn" onClick={fillDemoCredentials}>
            Fill Demo
          </button>
        </div>

        {globalErr && (
          <div className="ob-global-error" role="alert">
            <X size={15} />
            <span>{globalErr}</span>
          </div>
        )}

        <button type="submit" className="ob-primary-btn ob-submit-btn" disabled={busy}>
          {busy ? <span className="ob-spinner" /> : <ArrowRight size={17} />}
          <span>{busy ? 'Authenticating…' : 'Sign in to SafeRoute'}</span>
        </button>
      </form>

      <p className="ob-switch-hint">
        Don’t have an account yet?{' '}
        <button type="button" className="ob-link-btn" onClick={onGoToSignup}>
          Create safety account
        </button>
      </p>
    </div>
  );
}

// ─── Screen 6: Success & Launch Screen ────────────────────────────────────────

function SuccessScreen({
  user,
  preferences,
  onLaunch,
}: {
  user: UserRead;
  preferences: UserPreferences | null;
  onLaunch: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onLaunch, 2600);
    return () => window.clearTimeout(timer);
  }, [onLaunch]);

  const displayName = user.full_name || user.email.split('@')[0];

  return (
    <div className="ob-screen ob-success-screen">
      <div className="ob-success-badge-wrap">
        <div className="ob-success-ring" />
        <div className="ob-success-icon">
          <CheckCircle2 size={54} strokeWidth={2} />
        </div>
      </div>

      <h2 className="ob-success-title">You’re protected!</h2>
      <p className="ob-success-desc">
        Welcome aboard, <strong>{displayName}</strong>.<br />
        Your SafeRoute profile is configured and ready.
      </p>

      <div className="ob-success-summary">
        <div className="ob-summary-chip">
          <MapPin size={13} />
          <span>Area: {preferences?.city || 'Addis Ababa'}</span>
        </div>
        <div className="ob-summary-chip">
          <Shield size={13} />
          <span>Mode: {preferences?.commuteMode || 'Walking'}</span>
        </div>
        {preferences?.emergencyContactName && (
          <div className="ob-summary-chip highlight">
            <HeartHandshake size={13} />
            <span>Contact: {preferences.emergencyContactName}</span>
          </div>
        )}
      </div>

      <div className="ob-launch-loader">
        <div className="ob-launch-bar" />
      </div>

      <button type="button" className="ob-primary-btn ob-launch-btn" onClick={onLaunch}>
        <span>Open SafeRoute Map Now</span>
        <ArrowRight size={17} />
      </button>
    </div>
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export default function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [currentUser, setCurrentUser] = useState<UserRead | null>(() => getCachedUser());
  const [authToken, setAuthToken] = useState<string>(() => getToken() || '');
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(() => getPreferences() || {});
  const [backendDown, setBackendDown] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Google sign in modal state
  const [googlePickerOpen, setGooglePickerOpen] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Check existing session on mount
  useEffect(() => {
    let active = true;
    async function checkSession() {
      const token = getToken();
      if (!token) {
        if (active) setCheckingSession(false);
        return;
      }

      try {
        const user = await getMe(token);
        if (active) {
          saveUser(user);
          setCurrentUser(user);
          setAuthToken(token);
          // Already signed in! Trigger completion immediately
          onComplete(user, token, getPreferences() || undefined);
        }
      } catch {
        if (active) {
          clearToken();
          setCheckingSession(false);
        }
      }
    }

    void checkSession();
    return () => { active = false; };
  }, [onComplete]);

  // Check backend availability
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const health = await checkBackendHealth();
        if (active) setBackendDown(!health.online);
      } catch {
        if (active) setBackendDown(true);
      }
    }, 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  function handleAccountCreated(user: UserRead, token: string) {
    setCurrentUser(user);
    setAuthToken(token);
    setScreen('safety-profile');
  }

  async function handleGoogleAccountSelect(email: string, fullName: string, avatarUrl?: string) {
    setGoogleLoading(true);
    try {
      const auth = await loginWithGoogle(email, fullName, avatarUrl);
      saveToken(auth.access_token);
      saveUser(auth.user);
      setCurrentUser(auth.user);
      setAuthToken(auth.access_token);
      setGooglePickerOpen(false);

      if (screen === 'signin') {
        setScreen('success');
      } else {
        // From welcome or signup, guide user to complete their safety preferences
        setScreen('safety-profile');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
      alert(msg);
    } finally {
      setGoogleLoading(false);
    }
  }

  function handlePreferencesSaved(prefs: Partial<UserPreferences>) {
    const merged: UserPreferences = { ...userPrefs, ...prefs };
    setUserPrefs(merged);
    savePreferences(merged);
    setScreen('emergency-contact');
  }

  async function handleEmergencyContactSaved(contact: { emergencyContactName: string; emergencyContactPhone: string }) {
    const merged: UserPreferences = { ...userPrefs, ...contact };
    setUserPrefs(merged);
    savePreferences(merged);

    // Send contact to backend database if provided
    if (contact.emergencyContactName && contact.emergencyContactPhone) {
      try {
        await createBackendContact({
          name: contact.emergencyContactName,
          phone: contact.emergencyContactPhone,
          relationship: 'Emergency Contact',
        });
      } catch (err) {
        console.warn('Failed to sync contact to backend API:', err);
      }
    }

    setScreen('success');
  }

  function handleSigninDone(user: UserRead, token: string) {
    setCurrentUser(user);
    setAuthToken(token);
    setScreen('success');
  }

  function handleFinish() {
    if (currentUser && authToken) {
      onComplete(currentUser, authToken, userPrefs);
    } else {
      onSkip();
    }
  }

  if (checkingSession) {
    return (
      <div className="ob-root ob-loading">
        <div className="ob-loading-box">
          <div className="ob-brand-icon">
            <ShieldCheck size={28} />
          </div>
          <div className="ob-spinner ob-spinner-lg" />
          <p>Verifying safety session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-root" data-screen={screen}>
      <div className="ob-backdrop" aria-hidden />

      <div className={`ob-card ob-card-${screen}`}>
        {screen === 'welcome' && (
          <WelcomeScreen
            onGetStarted={() => setScreen('signup')}
            onSignIn={() => setScreen('signin')}
            onGoogleSignIn={() => setGooglePickerOpen(true)}
            onSkip={onSkip}
            backendDown={backendDown}
          />
        )}

        {screen === 'signup' && (
          <SignupScreen
            onBack={() => setScreen('welcome')}
            onDone={handleAccountCreated}
            onGoToSignin={() => setScreen('signin')}
            onGoogleSignIn={() => setGooglePickerOpen(true)}
          />
        )}

        {screen === 'safety-profile' && (
          <SafetyProfileScreen
            initialArea={userPrefs.city}
            onBack={() => setScreen('signup')}
            onNext={handlePreferencesSaved}
            onSkip={() => setScreen('emergency-contact')}
          />
        )}

        {screen === 'emergency-contact' && (
          <EmergencyContactScreen
            onBack={() => setScreen('safety-profile')}
            onSave={handleEmergencyContactSaved}
            onSkip={() => setScreen('success')}
          />
        )}

        {screen === 'signin' && (
          <SigninScreen
            onBack={() => setScreen('welcome')}
            onDone={handleSigninDone}
            onGoToSignup={() => setScreen('signup')}
            onGoogleSignIn={() => setGooglePickerOpen(true)}
          />
        )}

        {screen === 'success' && currentUser && (
          <SuccessScreen
            user={currentUser}
            preferences={userPrefs}
            onLaunch={handleFinish}
          />
        )}
      </div>

      {screen !== 'welcome' && screen !== 'success' && (
        <button type="button" className="ob-skip-floating" onClick={onSkip}>
          Skip to map
        </button>
      )}

      {/* Google Sign-in Modal */}
      <GoogleAccountPickerModal
        isOpen={googlePickerOpen}
        onClose={() => setGooglePickerOpen(false)}
        onSelectAccount={handleGoogleAccountSelect}
        loading={googleLoading}
      />
    </div>
  );
}
