'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLayerGroup,
  faRocket,
  faSearch,
  faWandMagicSparkles,
  faChartLine,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

const steps = [
  { id: 1, title: 'Welcome', description: 'Get started with Schema Intelligence' },
  { id: 2, title: 'Connect', description: 'Connect your database' },
  { id: 3, title: 'Scan', description: 'Run your first scan' },
  { id: 4, title: 'Explore', description: 'Explore your schema' },
  { id: 5, title: 'AI', description: 'Try AI Assistant' },
  { id: 6, title: 'Complete', description: "You're all set!" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [useDemoData, setUseDemoData] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push('/dashboard');
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-lg bg-background">
      <div className="w-full max-w-4xl bg-surface rounded-xl border border-border overflow-hidden">
        {/* Header with Progress */}
        <div className="p-lg border-b border-border">
          <div className="flex items-center justify-between mb-lg">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="text-primary text-2xl" />
              <h1 className="font-bold text-xl text-text-primary">Schema Intel</h1>
            </div>
            <button
              onClick={handleSkip}
              className="text-text-muted hover:text-text-primary text-body"
            >
              Skip Setup
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-4">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step.id <= currentStep
                        ? 'bg-primary text-white'
                        : 'bg-border text-text-muted'
                    }`}
                  >
                    {step.id}
                  </div>
                  <span
                    className={`text-body ${
                      step.id <= currentStep ? 'text-primary font-medium' : 'text-text-muted'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 ${step.id < currentStep ? 'bg-primary' : 'bg-border'}`}></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-2xl">
          {currentStep === 1 && (
            <div className="text-center max-w-2xl mx-auto">
              <div className="mb-xl">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-lg">
                  <FontAwesomeIcon icon={faRocket} className="text-primary text-3xl" />
                </div>
                <h2 className="text-h1 text-text-primary mb-md">Welcome to Schema Intelligence</h2>
                <p className="text-body-lg text-text-secondary">
                  Transform your database performance with AI-powered schema analysis, automated optimization
                  recommendations, and intelligent issue detection.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
                <div className="text-center">
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mx-auto mb-md">
                    <FontAwesomeIcon icon={faSearch} className="text-success text-xl" />
                  </div>
                  <h3 className="text-h4 text-text-primary mb-2">Smart Detection</h3>
                  <p className="text-body text-text-secondary">
                    Automatically identify performance bottlenecks and schema issues
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center mx-auto mb-md">
                    <FontAwesomeIcon icon={faWandMagicSparkles} className="text-info text-xl" />
                  </div>
                  <h3 className="text-h4 text-text-primary mb-2">AI Optimization</h3>
                  <p className="text-body text-text-secondary">
                    Generate optimized SQL and schema improvements instantly
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mx-auto mb-md">
                    <FontAwesomeIcon icon={faChartLine} className="text-warning text-xl" />
                  </div>
                  <h3 className="text-h4 text-text-primary mb-2">Real-time Monitoring</h3>
                  <p className="text-body text-text-secondary">
                    Continuous health monitoring with actionable insights
                  </p>
                </div>
              </div>

              <Card className="mb-xl">
                <CardContent>
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      id="demo-checkbox"
                      checked={useDemoData}
                      onChange={(e) => setUseDemoData(e.target.checked)}
                      className="mt-1 w-5 h-5 text-primary bg-surface border-border rounded focus:ring-primary"
                    />
                    <div className="text-left">
                      <label htmlFor="demo-checkbox" className="text-body font-medium text-text-primary cursor-pointer">
                        Start with sample data
                      </label>
                      <p className="text-body-sm text-text-secondary mt-1">
                        Explore features with pre-loaded sample database schemas and issues
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep > 1 && (
            <div className="text-center">
              <h2 className="text-h1 text-text-primary mb-md">{steps[currentStep - 1].title}</h2>
              <p className="text-body-lg text-text-secondary">{steps[currentStep - 1].description}</p>
              <p className="text-body text-text-muted mt-4">
                Step {currentStep} of {steps.length}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-lg border-t border-border flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="text-text-muted hover:text-text-primary text-body disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="mr-2" />
            Back
          </button>
          <div className="flex gap-md">
            <button
              onClick={handleSkip}
              className="text-text-muted hover:text-text-primary text-body"
            >
              Skip this step
            </button>
            <Button variant="primary" onClick={handleNext} icon={faChevronRight} iconPosition="right">
              {currentStep === steps.length ? 'Get Started' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

