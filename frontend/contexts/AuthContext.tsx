'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = () => {
      const storedUser = authApi.getCurrentUser();
      const storedToken = authApi.getToken();
      if (storedUser && storedToken) {
        setUser(storedUser);
        setToken(storedToken);
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setUser(result.user);
    setToken(result.token);
  };

  const register = async (email: string, name: string, password: string, role?: string) => {
    await authApi.register(email, name, password, role);
    // Auto-login after successful registration so the user lands on dashboard directly
    const result = await authApi.login(email, password);
    setUser(result.user);
    setToken(result.token);
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

