"use client"

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthzErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AuthzErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class AuthzErrorBoundary extends React.Component<
  AuthzErrorBoundaryProps,
  AuthzErrorBoundaryState
> {
  constructor(props: AuthzErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AuthzErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AuthzErrorBoundary caught an error:", error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="container mx-auto p-4">
          <Alert variant="destructive">
            <ShieldX className="h-4 w-4" />
            <AlertTitle>Authorization Error</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                An error occurred while checking permissions. This might be a hydration issue.
              </p>
              {this.state.error && (
                <details className="text-xs">
                  <summary className="cursor-pointer">Error details</summary>
                  <pre className="mt-2 overflow-auto bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack && (
                      <div className="mt-2">
                        Component stack:
                        {this.state.errorInfo.componentStack}
                      </div>
                    )}
                  </pre>
                </details>
              )}
              <Button
                onClick={this.handleRetry}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
