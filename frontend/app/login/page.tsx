'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLayerGroup,
  faEye,
  faEyeSlash,
} from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg schema-animation flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-4 h-4 bg-primary/20 rounded-full animate-float"></div>
        <div className="absolute top-32 right-20 w-6 h-6 bg-primary-light/10 rounded-full animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-20 w-3 h-3 bg-info/15 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-40 right-40 w-5 h-5 bg-primary/10 rounded-full animate-pulse-slow" style={{ animationDelay: '3s' }}></div>
        <div className="absolute top-1/2 left-1/4 w-2 h-2 bg-primary-light/20 rounded-full animate-float" style={{ animationDelay: '4s' }}></div>
        <div className="absolute top-1/3 right-1/3 w-4 h-4 bg-info/10 rounded-full animate-pulse-slow" style={{ animationDelay: '5s' }}></div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-surface/80 backdrop-blur-sm rounded-xl border border-border/50 p-8 relative z-10">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faLayerGroup} className="text-primary text-2xl" />
            </div>
          </div>
          <h1 className="text-h1 text-text-primary mb-2">Schema Intel</h1>
          <p className="text-body text-text-secondary">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Input */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-body-sm font-medium text-text-primary">
              Email address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Enter your email"
            />
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-body-sm font-medium text-text-primary">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 pr-10 bg-surface-light border border-border rounded-md text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="remember"
                name="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-primary bg-surface-light border-border rounded focus:ring-primary focus:ring-2"
              />
              <span className="text-body-sm text-text-secondary">Remember me</span>
            </label>
            <a href="#" className="text-body-sm text-primary hover:text-primary-light transition-colors">
              Forgot password?
            </a>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-error/20 border border-error/50 text-error text-body-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Login Button */}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
          >
            Sign in
          </Button>
        </form>

        {/* Sign Up Link */}
        <div className="mt-6 text-center">
          <p className="text-body-sm text-text-secondary">
            Need an account?{' '}
            <Link href="/register" className="text-primary hover:text-primary-light font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
        <p className="text-body-sm text-text-muted">© 2026 Schema Intel. All rights reserved.</p>
      </div>
    </div>
  );
}

