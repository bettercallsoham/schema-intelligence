'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSliders,
  faUser,
  faDatabase,
  faBell,
  faShield,
  faSave,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const { databases } = useApp();
  const [activeTab, setActiveTab] = useState<'profile' | 'database' | 'notifications' | 'security'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: faUser },
    { id: 'database', label: 'Database', icon: faDatabase },
    { id: 'notifications', label: 'Notifications', icon: faBell },
    { id: 'security', label: 'Security', icon: faShield },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Settings' }]}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-xl">
          <section>
            <div className="flex items-center gap-3 mb-md">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FontAwesomeIcon icon={faSliders} className="text-primary text-2xl" />
              </div>
              <div>
                <h1 className="text-h1 text-text-primary">Settings</h1>
                <p className="text-body-lg text-text-secondary mt-1">
                  Manage your account settings and preferences
                </p>
              </div>
            </div>
          </section>

          {saveSuccess && (
            <div className="flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/30 rounded-lg text-success text-body-sm font-medium">
              ✓ Changes saved successfully.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-xl">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <Card>
                <CardContent className="p-0">
                  <nav className="space-y-1 p-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                          activeTab === tab.id
                            ? 'bg-primary/10 text-primary border-l-2 border-primary'
                            : 'text-text-secondary hover:bg-surface-light'
                        }`}
                      >
                        <FontAwesomeIcon icon={tab.icon} className="w-5" />
                        <span className="text-body font-medium">{tab.label}</span>
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              {activeTab === 'profile' && (
                <Card>
                  <CardContent>
                    <h2 className="text-h2 text-text-primary mb-6">Profile Settings</h2>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-body-sm font-medium text-text-primary mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          defaultValue={user?.name || ''}
                          className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter your full name"
                        />
                      </div>
                      <div>
                        <label className="block text-body-sm font-medium text-text-primary mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          defaultValue={user?.email || ''}
                          disabled
                          className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-muted cursor-not-allowed"
                        />
                        <p className="text-body-sm text-text-muted mt-1">Email cannot be changed</p>
                      </div>
                      <div>
                        <label className="block text-body-sm font-medium text-text-primary mb-2">
                          Role
                        </label>
                        <input
                          type="text"
                          value={user?.role || 'VIEWER'}
                          disabled
                          className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-muted cursor-not-allowed"
                        />
                      </div>
                      <Button variant="primary" onClick={handleSave} isLoading={isSaving} icon={faSave}>
                        Save Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'database' && (
                <Card>
                  <CardContent>
                    <h2 className="text-h2 text-text-primary mb-6">Database Settings</h2>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-h3 text-text-primary mb-4">Connected Databases</h3>
                        {databases.length > 0 ? (
                          <div className="space-y-2">
                            {databases.map((db) => (
                              <div
                                key={db.id}
                                className="p-4 bg-surface-light rounded-md flex items-center justify-between"
                              >
                                <div>
                                  <p className="text-body font-medium text-text-primary">{db.name}</p>
                                  <p className="text-body-sm text-text-muted">{db.type}</p>
                                </div>
                                <span
                                  className={`text-caption px-2 py-1 rounded-md ${
                                    db.connectionStatus === 'connected'
                                      ? 'bg-success/20 text-success'
                                      : 'bg-error/20 text-error'
                                  }`}
                                >
                                  {db.connectionStatus}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-body text-text-secondary">
                            No databases connected. Go to the Databases page to add one.
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'notifications' && (
                <Card>
                  <CardContent>
                    <h2 className="text-h2 text-text-primary mb-6">Notification Preferences</h2>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 bg-surface-light rounded-md cursor-pointer">
                        <div>
                          <p className="text-body font-medium text-text-primary">Email Notifications</p>
                          <p className="text-body-sm text-text-muted">Receive email alerts for critical issues</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 text-primary" />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-surface-light rounded-md cursor-pointer">
                        <div>
                          <p className="text-body font-medium text-text-primary">Issue Alerts</p>
                          <p className="text-body-sm text-text-muted">Get notified when new issues are detected</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 text-primary" />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-surface-light rounded-md cursor-pointer">
                        <div>
                          <p className="text-body font-medium text-text-primary">Weekly Reports</p>
                          <p className="text-body-sm text-text-muted">Receive weekly schema health summaries</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5 text-primary" />
                      </label>
                      <Button variant="primary" onClick={handleSave} isLoading={isSaving} icon={faSave}>
                        Save Preferences
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeTab === 'security' && (
                <Card>
                  <CardContent>
                    <h2 className="text-h2 text-text-primary mb-6">Security Settings</h2>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-h3 text-text-primary mb-4">Change Password</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-body-sm font-medium text-text-primary mb-2">
                              Current Password
                            </label>
                            <input
                              type="password"
                              className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-body-sm font-medium text-text-primary mb-2">
                              New Password
                            </label>
                            <input
                              type="password"
                              className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-body-sm font-medium text-text-primary mb-2">
                              Confirm New Password
                            </label>
                            <input
                              type="password"
                              className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <Button variant="primary" onClick={handleSave} isLoading={isSaving} icon={faSave}>
                            Update Password
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
