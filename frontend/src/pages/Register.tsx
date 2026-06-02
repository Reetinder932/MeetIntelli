import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Headset, Mail, Lock, User, ArrowRight, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP State
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpVerifyMessage, setOtpVerifyMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setOtpVerifyMessage('Please enter the 6-digit OTP code.');
      return;
    }
    setVerifyingOtp(true);
    setOtpVerifyMessage('');
    setError('');

    try {
      await authApi.verifyOtp(email.trim(), otp.trim());
      setOtpVerified(true);
      setOtpVerifyMessage('OTP verified successfully! ✅');
    } catch (err: any) {
      setOtpVerified(false);
      setOtpVerifyMessage(err.response?.data?.message || err.response?.data || 'Failed to verify OTP code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown(otpCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCooldown]);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      setError('Please input your email address first!');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address format!');
      return;
    }

    setError('');
    setSendingOtp(true);
    setOtpMessage('');

    try {
      await authApi.sendOtp(email.trim());
      setOtpSent(true);
      setOtpCooldown(60);
      setOtpMessage('Verification OTP sent successfully! (Check your mail)');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.response?.data;
      setError(typeof errorMsg === 'string' ? errorMsg : 'Failed to send OTP. Is n8n active?');
    } finally {
      setSendingOtp(false);
    }
  };

  const isPasswordStrict = (pwd: string) => {
    if (pwd.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasDigit = /[0-9]/.test(pwd);
    const hasSpecial = /[~!@#$%^&*()-_=+[\]\\|;:'",<.>/?]/.test(pwd);
    return hasUpper && hasLower && hasDigit && hasSpecial;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validations
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Invalid email address format.');
      return;
    }

    if (!isPasswordStrict(password)) {
      setError('Password must be at least 8 characters and contain uppercase, lowercase, digits, and special characters.');
      return;
    }

    if (!otpSent) {
      setError('Please request and enter the verification OTP sent to your email first.');
      return;
    }

    if (!otpVerified) {
      setError('Please verify the OTP code first.');
      return;
    }

    if (!otp || otp.length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, otp: otp.trim() });
      navigate('/');
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.response?.data;
      setError(typeof errorMsg === 'string' ? errorMsg : 'Failed to create user. Verify OTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#07070a] px-4 select-none">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-[#0d0d12]/80 backdrop-blur-xl border border-border p-8 rounded-3xl shadow-2xl relative z-10"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary flex items-center justify-center rounded-2xl shadow-[0_0_20px_rgba(139,92,246,0.4)] mb-4">
            <Headset className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">Create Account</h2>
          <p className="text-sm text-muted-foreground mt-1">Get started with our collaboration platform</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full bg-[#08080c] border border-border rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full bg-[#08080c] border border-border rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || otpCooldown > 0}
                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-4 py-3 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer disabled:opacity-50"
              >
                {sendingOtp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : otpCooldown > 0 ? (
                  `Resend in ${otpCooldown}s`
                ) : (
                  'Send OTP'
                )}
              </button>
            </div>
            {otpMessage && (
              <p className="text-[11px] text-emerald-400 mt-1 font-semibold">{otpMessage}</p>
            )}
          </div>

          {otpSent && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Verification Code (OTP)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    disabled={otpVerified}
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, ''));
                      setOtpVerified(false);
                      setOtpVerifyMessage('');
                    }}
                    placeholder="Enter 6-digit code"
                    className="w-full bg-[#08080c] border border-border rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50 tracking-widest font-bold text-center disabled:opacity-75"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpVerified || verifyingOtp || otp.length !== 6}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-4 py-3 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {verifyingOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : otpVerified ? (
                    'Verified ✓'
                  ) : (
                    'Verify OTP'
                  )}
                </button>
              </div>
              {otpVerifyMessage && (
                <p className={`text-[11px] mt-1 font-semibold ${otpVerified ? 'text-emerald-400' : 'text-destructive'}`}>
                  {otpVerifyMessage}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#08080c] border border-border rounded-xl pl-12 pr-12 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3 text-muted-foreground hover:text-white transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-medium leading-normal">
              Must be at least 8 characters with an uppercase, lowercase, digit, and special character.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/95 text-white py-3.5 px-4 rounded-xl font-semibold shadow-lg hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-8 text-sm"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Register & Sign In
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <span className="text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-semibold ml-1">
              Sign In
            </Link>
          </span>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
